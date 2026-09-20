/**
 * api.js — جلب بيانات المنشأة من واجهة قيود البرمجية.
 * المصادقة بترويسة API-KEY. المفتاح يبقى في ذاكرة المتصفح ولا يُخزَّن.
 *
 * [إصلاح خطأ حقيقي شهده المستخدم] الاتصال المباشر بـhttps://api.qoyod.com من
 * المتصفح يفشل دائماً بحظر CORS ("Failed to fetch") — نفس المشكلة الموثَّقة
 * أصلاً بالتعليق القديم هنا، لكن الأداة كانت تترك المستخدم يواجهها بنفسه عبر
 * حقل "وسيط CORS" يدوي. بقية أدوات المشروع (رفع المنتجات/فواتير المبيعات)
 * تتفادى هذا تماماً عبر وكيل خادم موجود أصلاً بهذا المشروع
 * (functions/api/qoyod-proxy، بنفس مبدأ claude-proxy.js) — المتصفح يتصل بمسار
 * نسبي على نفس النطاق (لا CORS إطلاقاً بينهما)، والخادم هو من يتصل بـQoyod
 * فعلياً. DEFAULT_BASE هنا صار يشير لنفس الوكيل، فتعمل هذه الأداة بلا أي
 * إعداد إضافي بالضبط كبقية الأدوات — حقلا "عنوان الواجهة"/"وسيط CORS" باقيان
 * كخيارين متقدمين (props اختيارية) لأي استخدام مستقبلي مستقل عن هذا الموقع،
 * لكن غير ظاهرين بواجهة Step1Connect.jsx الافتراضية بعد الآن.
 */
import { pick, num, digitsOnly } from './text.js';
import { tplTax } from './matching.js';

export const DEFAULT_BASE = '/api/qoyod-proxy';

const url = (base, proxy, path) =>
  (proxy ? proxy.replace(/\/$/, '') + '/' : '') + base.replace(/\/$/, '') + path;

// [إصلاح خطأ حقيقي مبلَّغ ميدانياً 2026-09-14] بلاغ مستخدم: "الاداة لا تجلب
// البيانات نهائي"، زر "جلب بيانات المنشأة" يعلّق على "جاري الجلب…" للأبد رغم
// تأكيد وجود منتجات/موردين/مشتريات فعلياً بمنشأة العميل. السبب المؤكَّد من
// مواصفة Qoyod الرسمية (OpenAPI): عدة موارد هنا **لا تدعم الترقيم (pagination)
// إطلاقاً**، أو تتطلبه بشرط صريح لم يكن مُحقَّقاً:
//   - GET /vendors: بلا أي معامل page/per_page موثَّق إطلاقاً — يرجع كل
//     الموردين دفعة واحدة دومًا بصرف النظر عن قيمة page المرسلة.
//   - GET /accounts: "Pagination is optional (only applied when both page and
//     per_page are provided)" — إرسال page بمفرده (كما كان هنا) يُبطل الترقيم
//     كليًا فيرجع كل الحسابات دفعة واحدة أيضًا.
//   - GET /inventories، GET /product_unit_types، GET /taxes: بلا ترقيم إطلاقاً
//     ("No pagination" صراحة لـproduct_unit_types).
// بدون per_page، كان PER_PAGE أدناه غير مُرسَل، فأي مورد من هذه (وأغلب منشآت
// العملاء الحقيقية فيها أكثر من 15 مورّد/حساب) يُرجع نفس القائمة الكاملة كل
// مرة — فيظل شرط التوقف القديم (arr.length < 15) لا يتحقق أبدًا، وتُعاد نفس
// القائمة الكاملة (قد تكون آلاف السطور) 60 مرة متتالية بلا داعٍ — تعليق طويل
// يبدو للمستخدم "لا يجلب شيئًا نهائيًا". الإصلاح: إرسال per_page صريحًا دومًا
// (يُفعِّل ترقيم /accounts فعليًا)، + كشف إضافي (نفس أول عنصر بصفحتين متتاليتين
// = هذا المورد لا يُرقِّم حقًا) يوقف الحلقة فورًا بعد أول طلب لأي مورد من هذه،
// بدل الانتظار حتى نهاية الـ60 محاولة.
/** جلب مورد بكل صفحاته — ترقيم بالمؤشر (q[s]=id asc + q[id_gt]=<آخر id>)
 * [تغيير جوهري — بلاغ حقيقي + اختبار حي + مواصفة Qoyod OpenAPI v2] الترقيم
 * بـOFFSET (page&per_page) على موارد قيود (accounts/customers/vendors/products)
 * يطيح خطأ 500 من خوادم قيود على الترقيم العميق أو حتى على الصفحة الأولى لبعض
 * المنشآت. المواصفة الرسمية تؤكد أن كل هذه الموارد تدعم Ransack (q[]) وترتيب
 * q[s]. الترقيم بالمؤشر يتفادى OFFSET تمامًا (WHERE id > آخر id ORDER BY id)
 * فيتفادى الخطأ ويجلب كل السجلات بسرعة ونظام — نفس منطق fetchAllByCursor
 * بـproduct-upload/io/network.js حرفياً (منسوخ هنا للحفاظ على استقلالية هذه
 * الأداة عن طبقة شبكة الأدوات الأخرى ودعمها الوسيط proxy الاختياري). */
export async function getAll(resource, { base = DEFAULT_BASE, proxy = '', apiKey }) {
  const out = [];
  const seenIds = new Set();
  let lastId = 0;
  for (let iter = 0; iter < 5000; iter++) {
    const res = await fetch(url(base, proxy, `/${resource}?per_page=100&q[s]=id%20asc&q[id_gt]=${lastId}`), {
      headers: { 'API-KEY': apiKey, Accept: 'application/json' }
    });
    // 404 ("We found nothing") = قائمة فارغة (منشأة بلا هذا المورد) — توقف طبيعي.
    if (res.status === 404) break;
    if (!res.ok) {
      // خطأ 500 بعد جلب جزء = سجل معطوب بجهة قيود على "التالي" — نكتفي بما تجمَّع
      // (البيانات الكاملة عمليًا) بلا خطأ. فشل أول طلب (لا بيانات) يُرمى كالمعتاد.
      if (out.length > 0) break;
      throw new Error(`${resource}: ${res.status} ${res.statusText}`);
    }
    const j = await res.json();
    const arr = Array.isArray(j) ? j : j[resource] || Object.values(j).find(Array.isArray) || [];
    if (arr.length === 0) break;
    // فلترة السجلات الجديدة فقط (حماية من مورد يتجاهل q[id_gt] فيعيد نفس الدفعة)
    let added = 0;
    let maxId = lastId;
    for (const item of arr) {
      const id = item && item.id;
      if (id !== undefined && id !== null) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        if (Number(id) > maxId) maxId = Number(id);
      }
      out.push(item);
      added++;
    }
    if (added === 0) break; // لا جديد ⇒ اكتملت البيانات فعليًا
    if (maxId === lastId) break; // مورد بلا id قابل للترتيب (نادر) — دفعة واحدة تكفي
    lastId = maxId;
  }
  return out;
}

// [إضافة] إرسال POST — تُستخدَم فقط من billsPush.js لإنشاء فاتورة مشتريات
// حقيقية عبر POST /bills. نفس دالة url() أعلاه (تحترم الوسيط proxy الاختياري
// لهذه الأداة تحديداً بخلاف باقي أدوات المشروع)، فبنية استدعاء واحدة موحّدة
// للقراءة (getAll) والكتابة (postResource) معاً.
export async function postResource(resource, body, { base = DEFAULT_BASE, proxy = '', apiKey }) {
  const res = await fetch(url(base, proxy, `/${resource}`), {
    method: 'POST',
    headers: { 'API-KEY': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  if (!res.ok) {
    const msg = json && json.errors
      ? Object.entries(json.errors).map(([k, v]) => `${k}: ${(Array.isArray(v) ? v : [v]).join(', ')}`).join(' | ')
      : (typeof json === 'string' ? json : `${res.status} ${res.statusText}`);
    throw new Error(msg || `${res.status} ${res.statusText}`);
  }
  return json;
}

/** قراءة علم منطقي مهما اختلف اسمه في الاستجابة */
function flagOf(o, keys) {
  for (const k of keys) {
    if (o && Object.prototype.hasOwnProperty.call(o, k)) {
      const v = o[k];
      if (v === true || v === 1 || v === '1' || v === 'true' || v === 'yes') return true;
      if (v === false || v === 0 || v === '0' || v === 'false' || v === 'no' || v === null || v === '') return false;
    }
  }
  return null; // الحقل غير موجود — لا حكم
}

export const normProduct = (p) => ({
  id: p.id,
  sku: String(pick(p, 'sku', 'barcode', 'code', 'product_code', 'reference') || ''),
  name: String(pick(p, 'name_ar', 'name', 'name_en', 'title') || ''),
  unit: String(pick(p, 'unit_name', 'unit') || (p.unit && p.unit.name) || ''),
  // [إضافة] معرّف وحدة المنتج الأساسية الحقيقي (unit_type بـProductResponse
  // الرسمي — رقم لا نص، مختلف عن حقل "unit" النصي أعلاه) — يُستخدَم فقط من
  // billsPush.js لتعبية line_items[].unit_id. المنتج المصدره ملف يدوي (id
  // المنتج نفسه null أصلاً) يبقى بلا unitTypeId (undefined) بلا أي أثر آخر.
  unitTypeId: typeof p.unit_type === 'number' ? p.unit_type : (num(p.unit_type) ?? undefined),
  taxPercent: num(pick(p, 'tax_percent', 'tax_rate', 'vat')),
  purchasable: flagOf(p, ['is_purchasable', 'purchasable', 'is_purchase', 'can_be_purchased', 'is_bought', 'buy', 'purchase_account_id', 'buying_account_id']),
  active: flagOf(p, ['active', 'is_active', 'enabled', 'status']),
  conversions: (p.unit_conversions || p.conversions || []).map((c) => ({
    name: String(pick(c, 'name', 'unit_name', 'unit') || ''),
    factor: num(pick(c, 'factor', 'quantity', 'conversion_factor', 'number_of_unit')) || null
  }))
});

export const normVendor = (v) => ({
  id: v.id,
  ref: String(pick(v, 'reference', 'code', 'vendor_reference', 'ref', 'number') || ''),
  name: String(pick(v, 'name', 'name_ar', 'organization', 'company_name') || ''),
  phone: digitsOnly(pick(v, 'phone_number', 'phone', 'mobile', 'telephone'))
});

// [إصلاح خطأ حقيقي] الحقل الحقيقي بـGET /taxes الرسمي هو "percentage" لا
// "percent"/"rate"/"value"/"tax_percent" (مؤكَّد حرفياً من توثيق Qoyod: "Select
// on percentage and name_en/name_ar") — لم يكن يطابق أي مرشَّح سابق إطلاقاً،
// فـpercent تبقى null دومًا لكل الضرائب المجلوبة عبر API، فتُستبعَد كلها من
// catalog.taxes (فلترة .filter(t => t.percent != null) أسفل fetchCatalog)
// وتحل محلها ضرائب افتراضية ملفَّقة (15%/معفاة) بتحذير — رغم وجود ضرائب حقيقية
// فعلاً بالمنشأة. "percentage" أُضيف كأول مرشَّح، والبقية أُبقيت احتياطاً بلا ضرر.
export const normTax = (t) => ({
  id: t.id,
  name: String(pick(t, 'name_ar', 'name_en', 'name', 'title') || ''),
  percent: num(pick(t, 'percentage', 'percent', 'rate', 'value', 'tax_percent'))
});

// [إضافة] موقع/مخزون بمعرّفه الحقيقي — منفصل عن catalog.locations (أسماء فقط،
// تُستخدَم لمطابقة قائمة القالب المنسدلة وملف الاستيراد اليدوي، ولا تُمَس هنا
// إطلاقاً). يُستخدَم فقط من billsPush.js لحل inventory_id الحقيقي عند الإرسال
// عبر API مباشرة — احتياج جديد كلياً لم يكن له وجود قبل ميزة الإرسال عبر API.
// [إصلاح] اسم الحقل العربي الحقيقي بـGET /inventories هو "ar_name" (مؤكَّد من
// توثيق Qoyod الرسمي) لا "name_ar" — أُضيف كمرشَّح إضافي؛ "name" (الإنجليزي)
// يبقى الأولوية الأولى فلا يتغيّر أي سلوك حالي عملياً (كل منشأة فيها اسم
// إنجليزي للموقع غالباً)، فقط يُغطّي الحالة النادرة لموقع باسم عربي فقط.
export const normInventoryFull = (i) => ({
  id: i.id,
  name: String(pick(i, 'name', 'ar_name', 'name_ar', 'title') || '')
});

// [إضافة] حساب من شجرة الحسابات بمعرّفه الحقيقي — يُستخدَم فقط لحل
// discount_account_id (حساب خصم المستند) عند الإرسال عبر API مباشرة. GET
// /accounts مؤكَّد فعلياً عبر استخدامه الحي بأدوات أخرى بالمشروع (شجرة
// الحسابات/القيود المحاسبية) — نفس المصدر، هنا فقط id+name للمطابقة النصية.
export const normAccount = (a) => ({
  id: a.id,
  code: String(pick(a, 'code') || ''),
  name: String(pick(a, 'name_ar', 'name', 'name_en') || '')
});

/**
 * جلب كل ما تحتاجه الأداة. القوائم المنسدلة (المواقع والضرائب) تُفضَّل من القالب
 * حين يكون مرفوعاً، لأن قيمها هي المقبولة حرفياً في ملف الاستيراد.
 *
 * [إصلاح أداء حقيقي مبلَّغ ميدانياً 2026-09-14] بلاغ: "وجدت البيانات مقروءة
 * تمام بعد فترة طويلة... المشكلة بالوقت المستغرق، أريده سريعاً". كانت كل
 * الموارد الخمسة (منتجات+موردين معاً، ثم وحدات، ثم مواقع، ثم حسابات، ثم
 * ضرائب) تُجلَب **بالتتابع** (كل مورد ينتظر انتهاء اللي قبله بالكامل قبل أن
 * يبدأ) رغم أنها مستقلة تماماً عن بعضها — فوقت الجلب الكلي كان مجموع أوقات
 * الخمسة (بطيء جداً لمنشأة كبيرة مثل مثال حقيقي: 20100 مورّد). الآن تُجلَب
 * الخمسة **بالتوازي** (Promise.all) — الوقت الكلي يصير أقرب لأبطأ مورد
 * واحد فقط، لا مجموعهم جميعاً. لا تغيير إطلاقاً على منطق أي مورد بمفرده
 * (نفس try/catch، نفس رسائل warnings، نفس سلسلة بدائل الضرائب) — فقط توقيت
 * التنفيذ صار متزامناً بدل متتابع.
 */
export async function fetchCatalog(opts, tpl) {
  const fetchTaxes = async () => {
    for (const ep of ['taxes', 'tax_rates', 'vat_rates']) {
      try {
        const t = (await getAll(ep, opts)).map(normTax).filter((t) => t.percent != null);
        if (t.length) return t;
      } catch { /* المورد غير متاح في هذه المنشأة */ }
    }
    return [];
  };

  const [[prods, vends], unitsRes, invRes, accountsRes, taxesRes] = await Promise.all([
    Promise.all([getAll('products', opts), getAll('vendors', opts)]),
    // [إصلاح خطأ حقيقي] المورد الصحيح فعلياً هو "product_unit_types" لا
    // "product_units" (مؤكَّد من توثيق Qoyod الرسمي) — كان يُرجع 404 دومًا.
    getAll('product_unit_types', opts).then((r) => ({ ok: true, data: r })).catch(() => ({ ok: false })),
    getAll('inventories', opts).then((r) => ({ ok: true, data: r })).catch(() => ({ ok: false })),
    // [إضافة] فشل accounts لا يمنع القراءة/المطابقة اليدوية إطلاقاً، فقط يمنع
    // خيار "الإرسال عبر API" لاحقاً (خطأ واضح حينها من billsPush.js).
    getAll('accounts', opts).then((r) => ({ ok: true, data: r })).catch(() => ({ ok: false })),
    fetchTaxes(),
  ]);

  const catalog = {
    products: prods.map(normProduct).filter((p) => p.sku || p.name),
    vendors: vends.map(normVendor).filter((v) => v.name || v.ref),
    units: [],
    locations: [],
    taxes: [],
    // [إضافة] نسختان بمعرّفات حقيقية (id) — منفصلتان تماماً عن accounts/inventoriesFull
    // القديمتين (أسماء فقط، تُستخدمان بمطابقة القالب/الملف اليدوي كما كانتا دوماً بلا
    // أي تغيير). تُستخدَمان فقط من billsPush.js لحل discount_account_id/inventory_id
    // الحقيقيَين عند الإرسال المباشر عبر API — فشل جلبهما لا يمنع القراءة/المطابقة
    // اليدوية إطلاقاً، فقط يمنع خيار "الإرسال عبر API" لاحقاً (يبقى ملف الاستيراد
    // اليدوي متاحاً كالمعتاد).
    accounts: [],
    inventoriesFull: [],
    // [إصلاح] كانت أخطاء نقاط النهاية تُبتلَع بـcatch فارغ ثم تُلفَّق قيم بديلة
    // (موقع "Main الرئيسي" وضرائب ثابتة) وتُعرَض الرسالة "تم جلب بيانات المنشأة"
    // كأن كل شيء سليم — فيمرّ التحقق على موقع/ضريبة لا وجود لهما بالمنشأة، ثم
    // يرفض قيود الرفع كاملاً وهو بالضبط ما وُجدت الأداة لمنعه. نُسجّل ما فشل.
    warnings: []
  };

  if (unitsRes.ok) catalog.units = unitsRes.data.map((u) => String(pick(u, 'unit_name', 'name', 'name_ar', 'title')));
  else { catalog.units = []; catalog.warnings.push('تعذّر جلب وحدات القياس من المنشأة.'); }

  if (invRes.ok) {
    // [إصلاح] "ar_name" لا "name_ar" — راجع تعليق normInventoryFull أعلاه لنفس الإصلاح
    catalog.locations = invRes.data.map((i) => String(pick(i, 'name', 'ar_name', 'name_ar', 'title'))).filter(Boolean);
    catalog.inventoriesFull = invRes.data.map(normInventoryFull).filter((i) => i.name);
  } else { catalog.locations = []; catalog.inventoriesFull = []; catalog.warnings.push('تعذّر جلب المواقع/المستودعات من المنشأة.'); }

  catalog.accounts = accountsRes.ok ? accountsRes.data.map(normAccount).filter((a) => a.code || a.name) : [];

  let taxes = taxesRes;
  if (!taxes.length) {
    const seen = new Map();
    prods.forEach((p) => {
      const pc = num(pick(p, 'tax_percent', 'tax_rate', 'vat'));
      const nm = pick(p, 'tax_name', 'tax') || '';
      if (pc != null && !seen.has(pc)) {
        seen.set(pc, { id: null, name: typeof nm === 'string' && nm ? nm : `ضريبة ${pc}%`, percent: pc });
      }
    });
    taxes = [...seen.values()];
  }

  if (tpl) {
    catalog.taxes = tpl.taxes.map(tplTax).filter((t) => t.percent != null);
    catalog.locations = tpl.locations.slice();
  } else {
    if (taxes.length) catalog.taxes = taxes;
    else {
      catalog.taxes = [{ id: null, name: 'ضريبة القيمة المضافة 15%', percent: 15 }, { id: null, name: 'معفاة', percent: 0 }];
      catalog.warnings.push('لم تُجلَب ضرائب المنشأة — تُستخدم أسماء ضرائب افتراضية قد لا تطابق منشأتك. ارفع القالب لقراءة القوائم الفعلية منه.');
    }
    if (!catalog.locations.length) {
      catalog.locations = ['Main الرئيسي'];
      catalog.warnings.push('لم تُجلَب المواقع — يُستخدم موقع افتراضي قد لا يطابق منشأتك. ارفع القالب لقراءة قائمة المواقع الفعلية.');
    }
  }
  return catalog;
}
