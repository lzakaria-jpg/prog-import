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

/** جلب مورد بكل صفحاته */
export async function getAll(resource, { base = DEFAULT_BASE, proxy = '', apiKey }) {
  const out = [];
  for (let page = 1; page <= 60; page++) {
    const res = await fetch(url(base, proxy, `/${resource}?page=${page}`), {
      headers: { 'API-KEY': apiKey, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`${resource}: ${res.status} ${res.statusText}`);
    const j = await res.json();
    const arr = Array.isArray(j) ? j : j[resource] || Object.values(j).find(Array.isArray) || [];
    for (const item of arr) out.push(item); // بلا out.push(...arr) — يتجنب "Maximum call stack size exceeded" لو صفحة واحدة كانت كبيرة جداً
    if (arr.length === 0 || arr.length < 15) break;
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

export const normTax = (t) => ({
  id: t.id,
  name: String(pick(t, 'name', 'name_ar', 'title') || ''),
  percent: num(pick(t, 'percent', 'rate', 'value', 'tax_percent'))
});

// [إضافة] موقع/مخزون بمعرّفه الحقيقي — منفصل عن catalog.locations (أسماء فقط،
// تُستخدَم لمطابقة قائمة القالب المنسدلة وملف الاستيراد اليدوي، ولا تُمَس هنا
// إطلاقاً). يُستخدَم فقط من billsPush.js لحل inventory_id الحقيقي عند الإرسال
// عبر API مباشرة — احتياج جديد كلياً لم يكن له وجود قبل ميزة الإرسال عبر API.
export const normInventoryFull = (i) => ({
  id: i.id,
  name: String(pick(i, 'name', 'name_ar', 'title') || '')
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
 */
export async function fetchCatalog(opts, tpl) {
  const [prods, vends] = await Promise.all([getAll('products', opts), getAll('vendors', opts)]);
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

  try { catalog.units = (await getAll('product_units', opts)).map((u) => String(pick(u, 'name', 'name_ar', 'title'))); }
  catch { catalog.units = []; catalog.warnings.push('تعذّر جلب وحدات القياس من المنشأة.'); }

  try {
    const inv = await getAll('inventories', opts);
    catalog.locations = inv.map((i) => String(pick(i, 'name', 'name_ar', 'title'))).filter(Boolean);
    catalog.inventoriesFull = inv.map(normInventoryFull).filter((i) => i.name);
  } catch { catalog.locations = []; catalog.inventoriesFull = []; catalog.warnings.push('تعذّر جلب المواقع/المستودعات من المنشأة.'); }

  // [إضافة] لا تُضاف لـwarnings (لا تمنع القراءة/التحقق اليدوي بأي حال) — فقط
  // تبقى accounts فارغة، فيتعذّر لاحقاً حل discount_account_id لأي فاتورة عليها
  // خصم مستند عند محاولة الإرسال عبر API تحديداً (خطأ واضح حينها من billsPush.js).
  try { catalog.accounts = (await getAll('accounts', opts)).map(normAccount).filter((a) => a.code || a.name); }
  catch { catalog.accounts = []; }

  let taxes = [];
  for (const ep of ['taxes', 'tax_rates', 'vat_rates']) {
    try {
      taxes = (await getAll(ep, opts)).map(normTax).filter((t) => t.percent != null);
      if (taxes.length) break;
    } catch { /* المورد غير متاح في هذه المنشأة */ }
  }
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
