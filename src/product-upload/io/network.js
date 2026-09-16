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
  // [إصلاح] 200 حرف كانت تقطع رسائل 422 المتعددة الحقول (كل حقل ناقص برسالته
  // الخاصة) في منتصف الجملة — حالة حقيقية وقعت فعليًا مع POST /products (راجع
  // تعليق رأس buildProductCreatePayload بـqoyodEntityCreate.js)، فأخفت حقولًا
  // ناقصة إضافية محتملة عن تقرير الفشل المعروض للمستخدم.
  if (!resp.ok) throw new Error(`API ${resp.status}: ${text.substring(0, 1000)}`);
  return text ? JSON.parse(text) : {};
}

// [إصلاح المستخدم] Qoyod API يُرجع 404 ("We found nothing") عند قائمة فارغة
// (منشأة بلا منتجات/فئات/وحدات مسبقاً) بدل [] — كانت تُرمى كخطأ فيوقف الرفع
// كاملاً بـFATAL قبل إنشاء أي شيء. الآن 404 يُعامَل كقائمة فارغة فتستمر الأداة
// (تُنشئ كل الفئات/الوحدات/المنتجات من الصفر بلا مشكلة)؛ أي خطأ آخر (401/500...)
// يُرمى كالمعتاد.
// [إضافة] حد أقصى دفاعي لعدد الصفحات — شجرة حسابات/منتجات حقيقية لعميل كبير قد
// تبلغ آلاف السطور فتحتاج عشرات الصفحات فعلاً (بطيء لكن طبيعي، معالَج بـonPage
// أدناه لإظهار تقدّم حي بدل شاشة تبدو معلّقة)؛ لكن لو استجابة API لأي سبب لم
// تتناقص أبداً (خطأ بجهة قيود، أو أي افتراض هنا غير صحيح مستقبلاً) فبلا هذا الحد
// تدخل الحلقة في تكرار لا نهائي حرفياً — نفس فئة الخطأ التي وقعت فعلاً سابقاً مع
// /projects (راجع التعليق أسفل). 500 صفحة × 100 = 50,000 سطر، أكبر من أي دليل
// حسابات/منتجات واقعي بمنشأة واحدة.
const MAX_FETCH_ALL_PAGES = 500;

export async function fetchAll(path, apiKey, { onPage } = {}) {
  let all = [];
  let page = 1;
  // [إضافة، تصحيح 2026-09-16 بعد اختبار حي ثانٍ] اكتُشِف ميدانيًا أن بعض موارد
  // Qoyod (مثل /categories) قد تُرجع بصفحتها الأولى عناصر أكثر من per_page
  // المطلوب فعليًا (101 عنصر رغم per_page=100 بمثال حي حقيقي) — فشرط "هذه آخر
  // صفحة" الأصلي (items.length < 100) لا ينطبق، فتستمر الحلقة لصفحة إضافية
  // تُرجع نفس المئة+ عنصر بالضبط (لا تقدّم فعلي، لكن البيانات مكتملة فعلًا منذ
  // الصفحة الأولى). التمييز الأول (رمي خطأ فورًا) عامل هذي الحالة الطبيعية كخطأ
  // بالغلط. الآن: صفحة تالية بلا أي معرّف (id) جديد تعني ببساطة "انتهت البيانات
  // فعليًا" — توقف طبيعي بالبيانات المجمَّعة حتى الآن (لا عناصر مكرّرة تُضاف
  // لها، فتبقى فريدة تلقائيًا)، لا خطأ يوقف الجلب بالكامل. حد الصفحات الدفاعي
  // (MAX_FETCH_ALL_PAGES) يبقى الحارس الوحيد لتكرار لا نهائي حقيقي (بيانات تنمو
  // بلا توقف أبدًا). لا يُطبَّق التمييز لو العناصر بلا حقل id أصلًا (نادر).
  const seenIds = new Set();
  let itemsHaveIds = true;
  while (true) {
    if (page > MAX_FETCH_ALL_PAGES) {
      throw new Error(`fetchAll(${path}): تجاوز الحد الأقصى لعدد الصفحات (${MAX_FETCH_ALL_PAGES}) — توقف الجلب لمنع تكرار لا نهائي.`);
    }
    let res;
    try {
      res = await api("GET", `${path}?page=${page}&per_page=100`, null, apiKey);
    } catch (e) {
      if (e.message && e.message.includes("404")) break;
      throw e;
    }
    // [إصلاح خطأ حقيقي] GET /projects تحديداً يرجع مصفوفة خام بلا مفتاح جذر
    // (مؤكَّد حرفياً من توثيق Qoyod الرسمي: "Response is a raw array (no root
    // key)") — بخلاف كل مورد آخر مستخدَم بالمشروع (مُغلَّف دومًا بمفتاح جذر:
    // products/customers/vendors/accounts...). الاستخراج القديم `res[Object.keys(res)[0]]`
    // كان يفترض دومًا رداً مُغلَّفاً، فمع مصفوفة خام Object.keys(res)[0] يُصبح
    // "0" (أول فهرس مصفوفة كسلسلة نصية) وres["0"] عنصرها الأول فقط (كائن مشروع
    // واحد لا مصفوفة) — items.length غير معرَّف فيُكسَر الحلقة فورًا بمصفوفة
    // فارغة، فتظل المشاريع فارغة دومًا بصمت مهما وُجد بمنشأة العميل فعلياً
    // (يشمل أداتي استيراد القيود وفواتير المبيعات، كلتاهما تجلبان /projects
    // عبر fetchAll نفسها). الآن مصفوفة خام تُستخدَم مباشرة كما هي.
    const items = Array.isArray(res) ? res : (res[Object.keys(res)[0]] || []);
    if (!items.length) break;

    if (page === 1) itemsHaveIds = items.every((it) => it && it.id !== undefined && it.id !== null);
    if (itemsHaveIds && page > 1 && !items.some((it) => !seenIds.has(it.id))) {
      break; // لا عنصر جديد بهذه الصفحة ⇒ البيانات اكتملت فعليًا (راجع التعليق أعلاه)، لا خطأ
    }
    if (itemsHaveIds) items.forEach((it) => seenIds.add(it.id));

    all.push(...items);
    if (onPage) onPage(all.length, page);
    if (items.length < 100) break;
    page++;
  }
  return all;
}
