/*
 ============================================================================
  طبقة الشبكة (API CALLS) — أداة رفع المنتجات إلى قيود
  المصدر: qoyod_uploader.html الأصلي، بعد إصلاح المستخدم (404 كقائمة فارغة)
  ============================================================================
  الفرق الوحيد المتعمَّد عن الأصل: PROXY_BASE يشير لوكيلنا الخاص على هذا الموقع
  (functions/api/qoyod-proxy) بدل خادم Python المحلي (start_server.py) — بهذا
  تعمل الأداة مباشرة على iqoyod.pages.dev بلا أي تشغيل يدوي من المستخدم، بنفس
  آلية claude-proxy.js المستخدمة فعلاً بهذا المشروع لتفادي CORS. كل منطق
  api()/fetchAll() الحسابي والشرطي (بما فيه إصلاح 404) منقول حرفياً.
 ============================================================================
*/

export const PROXY_BASE = "/api/qoyod-proxy";

// [إضافة] حد Qoyod الرسمي للطلبات: 300 طلب لكل 60 ثانية لكل منشأة (موثَّق بتوثيق
// Qoyod الرسمي لـAPI rate limiting). نافذة انزلاقية مشتركة على مستوى الوحدة —
// كل نداء عبر api() (من أي أداة بالمشروع: رفع المنتجات، جلب/إرسال فواتير
// المبيعات...) يمر من هنا، فيُحمى تلقائيًا مهما كان مصدر النداء أو تزامنه
// (Promise.all لجلب منتجات+عملاء معًا مثلًا)، بلا حاجة لتنسيق يدوي بين
// المستدعين. لا يضيف أي تأخير إطلاقًا طالما الاستخدام دون الحد (الحالة
// المعتادة) — التأخير يحدث فقط لو اقتربنا فعليًا من 300 طلب خلال آخر 60 ثانية.
const RATE_LIMIT_MAX_CALLS = 300;
const RATE_LIMIT_WINDOW_MS = 60000;
const rateLimitCallTimestamps = [];

async function waitForRateLimitSlot() {
  for (;;) {
    const now = Date.now();
    while (rateLimitCallTimestamps.length && now - rateLimitCallTimestamps[0] >= RATE_LIMIT_WINDOW_MS) {
      rateLimitCallTimestamps.shift();
    }
    if (rateLimitCallTimestamps.length < RATE_LIMIT_MAX_CALLS) {
      rateLimitCallTimestamps.push(now);
      return;
    }
    const waitMs = RATE_LIMIT_WINDOW_MS - (now - rateLimitCallTimestamps[0]) + 5;
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

export async function api(method, path, body, apiKey) {
  await waitForRateLimitSlot();
  const opts = {
    method,
    headers: { "API-KEY": apiKey, "Content-Type": "application/json", Accept: "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(PROXY_BASE + path, opts);
  const text = await resp.text();
  if (!resp.ok) throw new Error(`API ${resp.status}: ${text.substring(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

// [إصلاح المستخدم] Qoyod API يُرجع 404 ("We found nothing") عند قائمة فارغة
// (منشأة بلا منتجات/فئات/وحدات مسبقاً) بدل [] — كانت تُرمى كخطأ فيوقف الرفع
// كاملاً بـFATAL قبل إنشاء أي شيء. الآن 404 يُعامَل كقائمة فارغة فتستمر الأداة
// (تُنشئ كل الفئات/الوحدات/المنتجات من الصفر بلا مشكلة)؛ أي خطأ آخر (401/500...)
// يُرمى كالمعتاد.
export async function fetchAll(path, apiKey) {
  let all = [];
  let page = 1;
  while (true) {
    let res;
    try {
      res = await api("GET", `${path}?page=${page}&per_page=100`, null, apiKey);
    } catch (e) {
      if (e.message && e.message.includes("404")) break;
      throw e;
    }
    const items = res[Object.keys(res)[0]] || [];
    if (!items.length) break;
    all.push(...items);
    if (items.length < 100) break;
    page++;
  }
  return all;
}
