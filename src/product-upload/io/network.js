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

// [إضافة — بلاغ حقيقي من المستخدم: "API 500: {status:500,error:Internal Server
// Error}" بكل الأدوات فجأة] خطأ 5xx يأتي من خوادم قيود نفسها (وكيلنا يمرّر
// حالة الرد ونصه حرفيًا — أخطاؤه هو 400/502 بصيغة مختلفة تمامًا)، وغالبًا ما
// يكون عارضًا. محاولة إضافية واحدة للقراءات فقط (GET، عملية آمنة التكرار)
// تكفي لتجاوز الانقطاع اللحظي بلا إخفاء انقطاع حقيقي طويل. لا تُعاد أبدًا
// طلبات POST/PUT/PATCH/DELETE: تكرارها قد يُنشئ حسابًا/منتجًا/قيدًا مرتين.
const GET_RETRY_ON_5XX = 1;
const GET_RETRY_DELAY_MS = 1200;

export async function api(method, path, body, apiKey) {
  const opts = {
    method,
    headers: { "API-KEY": apiKey, "Content-Type": "application/json", Accept: "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const retries = method === "GET" ? GET_RETRY_ON_5XX : 0;
  for (let attempt = 0; ; attempt++) {
    await waitForRateLimitSlot();
    const resp = await fetch(PROXY_BASE + path, opts);
    const text = await resp.text();
    if (resp.ok) return text ? JSON.parse(text) : {};
    if (resp.status >= 500 && attempt < retries) {
      await new Promise((r) => setTimeout(r, GET_RETRY_DELAY_MS));
      continue;
    }
    // [إصلاح] 200 حرف كانت تقطع رسائل 422 المتعددة الحقول (كل حقل ناقص برسالته
    // الخاصة) في منتصف الجملة — حالة حقيقية وقعت فعليًا مع POST /products (راجع
    // تعليق رأس buildProductCreatePayload بـqoyodEntityCreate.js)، فأخفت حقولًا
    // ناقصة إضافية محتملة عن تقرير الفشل المعروض للمستخدم.
    // [إضافة] الرسالة كانت "API 500: {...}" بلا أي ذكر للمسار، فحين تفشل إحدى
    // أربع عمليات جلب متوازية (Promise.all لـ/accounts و/taxes و
    // /product_unit_types و/categories عند إدخال مفتاح العميل) يستحيل معرفة
    // أيّها فشل فعلاً — ولا إبلاغ قيود بمسار محدد. المسار يُضاف بنهاية الرسالة
    // عمدًا لا ببدايتها: البادئة "API <رمز>:" يعتمد عليها منطق قائم
    // (isDuplicateApiError بـqoyodAccountPush.js، وفحص 404 أدناه) فتبقى كما هي.
    const hint = resp.status >= 500
      ? " — الخطأ من خوادم قيود نفسها لا من الأداة (جرّب مجددًا بعد قليل، أو تحقّق مع دعم قيود بهذا المسار تحديدًا)"
      : "";
    throw new Error(`API ${resp.status}: ${text.substring(0, 1000)} — ${method} ${path}${hint}`);
  }
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
      // [تشديد] كان الفحص `includes("404")` على نص الرسالة كاملاً — والرسالة
      // صارت تحمل المسار بنهايتها، فمسار مثل /products/404 (أو نص خطأ يذكر 404
      // عرضًا) كان سيُقرأ "قائمة فارغة" ويُنهي الجلب بصمت. الحالة تُقرأ الآن من
      // بادئة الرسالة وحدها، وهي الجزء الذي يكتبه api() بنفسه.
      if (/^API 404:/.test(e.message || "")) break;
      // [إضافة — بلاغ حقيقي من المستخدم] خطأ حي مؤكَّد مباشرة من خوادم قيود
      // (لا من هذه الأداة ولا من الوكيل — أُعيد إنتاجه بـfetch() خام من console
      // المتصفح): بعض منشآت العملاء (شجرة حسابات فيها أكثر من 100 حساب هنا
      // تحديدًا) ترجع 500 من قيود نفسها لأي طلب يتجاوز أول 100 عنصر — سواء
      // بصفحة تالية أو حجم صفحة أكبر أو الجلب الكامل بلا ترقيم، كلها فشلت
      // بنفس الخطأ. كان هذا يُسقط fetchAll بالكامل (فتتوقف كل الأداة) رغم
      // توفر 100 عنصر حقيقي فعلاً بالصفحة الأولى الناجحة. الآن: فشل بعد صفحة
      // أولى ناجحة (page > 1) يوقف الجلب بما تجمَّع فقط، لا يرمي خطأ — لكن
      // يُعلَّم المصفوفة الناتجة بخاصية غير قابلة للتعداد (Object.defineProperty،
      // enumerable:false — لا تظهر بـJSON.stringify ولا Object.keys ولا تُحسَب
      // ضمن .length، فلا تكسر أي مستهلك حالي يعامل الناتج كمصفوفة عادية) حتى
      // يعرف المستدعي (إن أراد) أن القائمة غير مكتملة وليست "كل شيء" بصمت.
      // فشل الصفحة الأولى نفسها يبقى يرمي كالمعتاد — مصفوفة فارغة هناك قد
      // تُفهَم خطأً "لا حسابات إطلاقًا"، وهذا أسوأ من رمي الخطأ بوضوح.
      if (page > 1) {
        Object.defineProperty(all, "qoyodFetchTruncatedError", { value: e.message, enumerable: false, configurable: true });
        break;
      }
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
