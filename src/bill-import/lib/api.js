/**
 * api.js — جلب بيانات المنشأة من واجهة قيود البرمجية.
 * المصادقة بترويسة API-KEY. المفتاح يبقى في ذاكرة المتصفح ولا يُخزَّن.
 * ملاحظة: المتصفح قد يمنع النداء المباشر (CORS)، ولذلك يوجد حقل وسيط اختياري،
 * وبديل كامل هو رفع قوائم المنتجات والموردين يدوياً.
 */
import { pick, num, digitsOnly } from './text.js';
import { tplTax } from './matching.js';

export const DEFAULT_BASE = 'https://api.qoyod.com/2.0';

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
    out.push(...arr);
    if (arr.length === 0 || arr.length < 15) break;
  }
  return out;
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
    taxes: []
  };

  try { catalog.units = (await getAll('product_units', opts)).map((u) => String(pick(u, 'name', 'name_ar', 'title'))); }
  catch { catalog.units = []; }

  try {
    catalog.locations = (await getAll('inventories', opts))
      .map((i) => String(pick(i, 'name', 'name_ar', 'title'))).filter(Boolean);
  } catch { catalog.locations = []; }

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
    catalog.taxes = taxes.length ? taxes
      : [{ id: null, name: 'ضريبة القيمة المضافة 15%', percent: 15 }, { id: null, name: 'معفاة', percent: 0 }];
    if (!catalog.locations.length) catalog.locations = ['Main الرئيسي'];
  }
  return catalog;
}
