// وسيط آمن (proxy) لواجهة Anthropic API — بصيغة Cloudflare Pages Functions
// (ملف تحت functions/ يُخدَّم تلقائياً كمسار API؛ هذا الملف = /api/claude-proxy).
// نسخة مطابقة وظيفياً لـ netlify/functions/claude-proxy.js القديمة (لا تُلمَس -
// كانت مُصمَّمة لنشر Netlify، والنشر الفعلي الحالي للموقع هو Cloudflare Pages
// الذي لا يُشغّل دوال Netlify إطلاقاً)، فقط بصيغة توقيع طلبات Cloudflare
// المختلفة (onRequestPost/onRequestOptions بدل exports.handler، والبيئة تُقرأ
// من context.env لا من process.env).
//
// إعداد المفتاح على Cloudflare Pages: لوحة تحكم Cloudflare > Pages > المشروع
// (qoyodai) > Settings > Environment variables > أضف ANTHROPIC_API_KEY كسر
// (Secret) على بيئتي Production وPreview، ثم أعد النشر. المفتاح لا يظهر أبداً
// للمتصفح - يبقى فقط على الخادم هنا، تماماً كتصميم نسخة Netlify الأصلية.

// [إصلاح أمني 2026-09-07] كان Access-Control-Allow-Origin ثابتاً "*" — يسمح
// لأي متصفح بأي موقع يستخدم هذا الوكيل. نردّ أصل الطلب فقط لو كان ضمن القائمة
// المسموحة (نفس سلوك الأداة الفعلي، بلا أي تغيير على عملها). هذا لا يمنع
// استدعاء مباشر من سكربت/curl خارج المتصفح (CORS مفهوم يخص المتصفح فقط) —
// الحماية الكاملة من هذا تحتاج أيضاً Rate Limiting بلوحة Cloudflare + تحقق
// هوية حقيقي، غير مطبَّق هنا بعد.
const ALLOWED_ORIGINS = [
  "https://iqoyod.pages.dev",
  "https://test.iqoyod.pages.dev",
  "http://localhost:5173",
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
  const CORS_HEADERS = corsHeaders(context.request);
  const apiKey = context.env && context.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY غير مُعد على الخادم. أضفه من Settings > Environment variables في لوحة Cloudflare Pages." }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "طلب غير صالح" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "تعذر الوصول لخدمة الذكاء الاصطناعي: " + err.message }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}

// أي طريقة غير POST/OPTIONS
export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return onRequestOptions(context);
  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: { ...corsHeaders(context.request), "Content-Type": "application/json" },
  });
}
