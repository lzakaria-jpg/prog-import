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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
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
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
