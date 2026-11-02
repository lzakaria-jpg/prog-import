// وكيل خادم لواجهة قيود اتش ار (Qoyod HR) — نفس نمط functions/api/qoyod-proxy/[[path]].js
// حرفياً (السبب نفسه: المتصفح لا يستطيع الاتصال مباشرة بواجهة قيود اتش ار من نطاق آخر بسبب CORS).
//
// المفتاح هو مفتاح **العميل** يدخله المستخدم داخل الأداة: يصل من المتصفح كترويسة API-KEY في كل
// طلب ويُمرَّر كما هو لقيود اتش ار دون أي تخزين أو تسجيل على هذا الوكيل.
//
// عنوان الواجهة: لا يُكتب ثابتاً هنا لأنه لم يُعتمد بعد — يُضبط بمتغير البيئة QOYOD_HR_API_BASE
// بإعدادات مشروع Cloudflare Pages (مثال: "https://<host>/api/v1" بدون "/" بالآخر). بدونه يرد
// الوكيل 503 برسالة واضحة بدل أن يوجّه لعنوان مُخمَّن.
//
// المسار: المتصفح يطلب "/api/qoyod-hr-proxy/<مسار قيود اتش ار>?<query>"، ونعيد توجيهه إلى
// "<QOYOD_HR_API_BASE>/<مسار قيود اتش ار>?<query>" بنفس Method/Body، ونُرجع نص الرد وحالة HTTP
// كما وردت حرفياً (بلا أي تعديل).

// [نفس إصلاح qoyod-proxy الأمني] لا Access-Control-Allow-Origin ثابت "*" — نردّ أصل الطلب فقط لو
// كان ضمن القائمة المسموحة، فلا يصير الوكيل relay مفتوحاً لمواقع خارجية.
const ALLOWED_ORIGINS = [
  "https://iqoyod.pages.dev",
  "https://test.iqoyod.pages.dev",
  "http://localhost:5173",
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type, API-KEY",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
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

async function handle(context) {
  const { request, params, env } = context;
  const CORS_HEADERS = corsHeaders(request);

  const base = String(env?.QOYOD_HR_API_BASE || "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(base)) {
    return new Response(
      JSON.stringify({ error: "عنوان واجهة قيود اتش ار غير مضبوط على الخادم (QOYOD_HR_API_BASE)." }),
      { status: 503, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const apiKey = request.headers.get("API-KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ترويسة API-KEY مفقودة — أدخل مفتاح قيود اتش ار الخاص بالعميل أولاً." }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // params.path يأتي من مسار الملف [[path]].js كمصفوفة أجزاء المسار بعد
  // /api/qoyod-hr-proxy/ — نطابق كلا الشكلين (نص أو مصفوفة).
  const segments = Array.isArray(params?.path) ? params.path : params?.path ? [params.path] : [];
  const incomingUrl = new URL(request.url);
  const targetUrl = `${base}/${segments.join("/")}${incomingUrl.search}`;

  const init = {
    method: request.method,
    headers: {
      "API-KEY": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    const bodyText = await request.text();
    if (bodyText) init.body = bodyText;
  }

  try {
    const upstream = await fetch(targetUrl, init);
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "تعذر الاتصال بواجهة قيود اتش ار: " + err.message }),
      { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
}

export const onRequestGet = handle;
export const onRequestPost = handle;
export const onRequestPut = handle;
export const onRequestPatch = handle;
export const onRequestDelete = handle;
