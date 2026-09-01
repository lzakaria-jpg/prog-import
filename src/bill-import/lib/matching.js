/**
 * matching.js — مطابقة الموردين والمنتجات والضرائب مع بيانات المنشأة.
 * كلها تعمل على النص المُطبَّع، فاختلاف الإملاء أو التشكيل لا يُفشل البحث.
 */
import { norm, num, digitsOnly, fixDigits } from './text.js';

/** منتج قابل للاعتماد في الشراء */
export const isBuyable = (p) => p.purchasable !== false && p.active !== false;

/**
 * فهرسة الموردين مرة واحدة (Map) بدل إعادة مسح مصفوفة الموردين كاملة لكل صف — كان
 * matchVendor يُستدعى per-row بـbuildRows، فملف ٥٠٠٠ صف × مورّدين بالآلاف يعني ملايين
 * عمليات normalize+compare. الفهرسة هنا لا تغيّر أي نتيجة مطابقة: refMap/nameMap تُبنى
 * بنفس ترتيب مصفوفة vendors الأصلية، فأول عنصر بكل مفتاح مطابق تماماً لما يُرجعه
 * .find()، وقوائم التطابق التام بنفس ترتيب .filter() الأصلي حرفياً — فقط أسرع.
 * المطابقة الجزئية (substring) وبالهاتف تبقيان مسحاً كاملاً (نادرتا الحدوث فعلياً، ولا
 * يمكن فهرستهما بـMap بلا تغيير حقيقي بالخوارزمية).
 */
export function buildVendorIndex(vendors) {
  const refMap = new Map();
  const nameMap = new Map();
  for (const v of vendors) {
    const r = norm(v.ref);
    if (!refMap.has(r)) refMap.set(r, v);
    if (!nameMap.has(norm(v.name))) nameMap.set(norm(v.name), []);
    nameMap.get(norm(v.name)).push(v);
  }
  return { refMap, nameMap };
}

/** فهرسة المنتجات مرة واحدة — نفس مبدأ buildVendorIndex أعلاه */
export function buildProductIndex(products) {
  const skuMap = new Map();
  const nameMap = new Map();
  for (const p of products) {
    const s = norm(p.sku);
    if (!skuMap.has(s)) skuMap.set(s, p);
    if (!nameMap.has(norm(p.name))) nameMap.set(norm(p.name), []);
    nameMap.get(norm(p.name)).push(p);
  }
  return { skuMap, nameMap };
}

/**
 * المورد: الرقم المرجعي أولاً، ثم الاسم تاماً، ثم جزئياً، ثم آخر 9 أرقام من الهاتف.
 * عند تعدد المرشحين يعود by='dup' مع قائمتهم ليختار المستخدم.
 * idx (اختياري): فهرس buildVendorIndex مسبق البناء — يُسرّع خطوتي التطابق التام (الرقم
 * المرجعي والاسم) بلا أي تغيير بالنتيجة؛ بدونه يعمل بالمسح الكامل كما كان دائماً.
 */
export function matchVendor(row, vendors, idx) {
  const ref = String(row.vendorRefRaw || '').trim();
  const name = String(row.vendorNameRaw || '').trim();
  const ph = digitsOnly(row.vendorPhoneRaw);

  if (ref) {
    const hit = idx ? idx.refMap.get(norm(ref)) : vendors.find((v) => norm(v.ref) === norm(ref));
    if (hit) return { v: hit, by: 'ref', cands: [] };
  }
  if (name) {
    let c = idx ? (idx.nameMap.get(norm(name)) || []) : vendors.filter((v) => norm(v.name) === norm(name));
    if (!c.length) {
      c = vendors.filter(
        (v) => norm(v.name) && norm(name) && (norm(v.name).includes(norm(name)) || norm(name).includes(norm(v.name)))
      );
    }
    if (c.length === 1) return { v: c[0], by: 'name', cands: [] };
    if (c.length > 1) return { v: null, by: 'dup', cands: c };
  }
  if (ph) {
    const c = vendors.filter((v) => v.phone && (v.phone.endsWith(ph.slice(-9)) || ph.endsWith(v.phone.slice(-9))));
    if (c.length === 1) return { v: c[0], by: 'phone', cands: [] };
    if (c.length > 1) return { v: null, by: 'dup', cands: c };
  }
  if (ref) {
    const c = idx ? (idx.nameMap.get(norm(ref)) || []) : vendors.filter((v) => norm(v.name) === norm(ref));
    if (c.length === 1) return { v: c[0], by: 'name', cands: [] };
    if (c.length > 1) return { v: null, by: 'dup', cands: c };
  }
  return { v: null, by: 'none', cands: [] };
}

/**
 * المنتج: الكود أو الباركود أولاً، ثم الاسم. غير القابل للشراء يُقصى من المرشحين.
 * idx (اختياري): فهرس buildProductIndex مسبق البناء — نفس مبدأ matchVendor أعلاه.
 */
export function matchProduct(row, products, idx) {
  const prefer = (c) => {
    if (c.length <= 1) return c;
    const ok = c.filter(isBuyable);
    return ok.length ? ok : c;
  };
  const ref = String(row.prodRefRaw || '').trim();
  const name = String(row.prodNameRaw || '').trim();

  if (ref) {
    const hit = idx ? idx.skuMap.get(norm(ref)) : products.find((p) => norm(p.sku) === norm(ref));
    if (hit) return { p: hit, by: 'sku', cands: [] };
  }
  if (name) {
    let c = prefer(idx ? (idx.nameMap.get(norm(name)) || []) : products.filter((p) => norm(p.name) === norm(name)));
    if (!c.length) {
      c = prefer(products.filter(
        (p) => norm(p.name) && norm(name) && (norm(p.name).includes(norm(name)) || norm(name).includes(norm(p.name)))
      ));
    }
    if (c.length === 1) return { p: c[0], by: 'name', cands: [] };
    if (c.length > 1) return { p: null, by: 'dup', cands: c.slice(0, 25) };
  }
  if (ref) {
    const c = idx ? (idx.nameMap.get(norm(ref)) || []) : products.filter((p) => norm(p.name) === norm(ref));
    if (c.length === 1) return { p: c[0], by: 'name', cands: [] };
  }
  return { p: null, by: 'none', cands: [] };
}

/**
 * الضريبة: تُطابَق بالنسبة المئوية لا بالاسم.
 * "0.15" و"15%" و"15" كلها 15%. عند تعدد ضرائب بنفس النسبة تعود قائمتها.
 */
export function matchTax(raw, fallbackPercent, taxes) {
  let pct = num(raw);
  if (pct == null && fallbackPercent != null) pct = fallbackPercent;
  if (pct == null) {
    const t = taxes.find((t) => norm(t.name) === norm(raw));
    return { t: t || null, pct: t ? t.percent : null, cands: t ? [t] : [] };
  }
  if (pct > 0 && pct < 1) pct = pct * 100;
  const cands = taxes.filter((t) => Math.abs(t.percent - pct) < 0.01);
  return { t: cands[0] || null, pct, cands };
}

/** استخراج النسبة من صيغة القالب: "S 15.0% (ضريبة القيمة المضافة)" */
export const tplTax = (s) => ({
  id: null,
  name: s,
  percent: (() => {
    const m = /(-?\d+(?:\.\d+)?)\s*%/.exec(fixDigits(s));
    return m ? parseFloat(m[1]) : null;
  })()
});

/** idx (اختياري): فهرس buildProductIndex — بحث O(1) بدل مسح المصفوفة كاملة */
export const findProdBySku = (products, sku, idx) =>
  idx ? idx.skuMap.get(norm(sku)) : products.find((p) => norm(p.sku) === norm(sku));
