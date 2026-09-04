// وكيل خادم لواجهة Qoyod العامة (https://api.qoyod.com/2.0/*) — نفس نمط
// functions/api/claude-proxy.js في هذا المشروع (سبب الحاجة: المتصفح لا يستطيع
// الاتصال مباشرة بـapi.qoyod.com عبر fetch من نطاق آخر بسبب CORS، تماماً كما
// واجهة Anthropic لا تُستدعى مباشرة من المتصفح).
//
// فرق جوهري عن claude-proxy.js: هناك المفتاح ثابت على الخادم (ANTHROPIC_API_KEY env
// var) لأنه مفتاحنا نحن. هنا "مفتاح Qoyod" هو مفتاح **العميل** نفسه الذي تُنشئ له
// الأداة الخامسة (رفع المنتجات) الفئات/الوحدات/المنتجات في منشأته — لا يوجد مفتاح
// ثابت نخزّنه على الخادم إطلاقاً. المفتاح يصل من المتصفح كترويسة API-KEY في كل طلب
// ويُمرَّر كما هو إلى Qoyod دون أي تخزين أو تسجيل على هذا الوكيل.
//
// المسار: المتصفح يطلب "/api/qoyod-proxy/<مسار Qoyod>?<query>" (مثال:
// "/api/qoyod-proxy/products?page=1&per_page=100")، ونعيد توجيهه إلى
// "https://api.qoyod.com/2.0/<مسار Qoyod>?<query>" بنفس Method/Headers/Body،
// ونُرجع نص الرد وحالة HTTP كما وردت من Qoyod حرفياً (بلا أي تعديل) — هذا مهم لأن
// طبقة الشبكة بالأداة (io/network.js) تعتمد على resp.ok/resp.status الحقيقيين
// القادمين من Qoyod لتقرر النجاح/الفشل والتعامل مع 404 كقائمة فارغة.

const QOYOD_BASE = "https://api.qoyod.com/2.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, API-KEY",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

async function handle(context) {
  const { request, params } = context;

  const apiKey = request.headers.get("API-KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ترويسة API-KEY مفقودة — أدخل مفتاح Qoyod الخاص بالعميل أولاً." }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // params.path يأتي من مسار الملف [[path]].js كمصفوفة أجزاء المسار بعد
  // /api/qoyod-proxy/ (مثال: "products" أو ["categories"]) — نطابق كلا الشكلين.
  const segments = Array.isArray(params?.path) ? params.path : params?.path ? [params.path] : [];
  const incomingUrl = new URL(request.url);
  const targetUrl = `${QOYOD_BASE}/${segments.join("/")}${incomingUrl.search}`;

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
      JSON.stringify({ error: "تعذر الاتصال بواجهة Qoyod: " + err.message }),
      { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
}

export const onRequestGet = handle;
export const onRequestPost = handle;
export const onRequestPut = handle;
export const onRequestPatch = handle;
export const onRequestDelete = handle;
