/**
 * clientFile.js — قراءة ملف العميل غير المنظم وبناء صفوف البنود.
 * كل المعالجة داخل المتصفح؛ لا يُرفع الملف إلى أي خادم.
 */
import * as XLSX from 'xlsx';
import { num, toDate, truthy, norm } from './text.js';
import { FIELDS } from './fields.js';
import { matchVendor, matchProduct, matchTax } from './matching.js';

const isText = (file) => /\.(csv|txt|tsv)$/i.test(file.name || '') || /text\/(csv|plain)/.test(file.type || '');

/**
 * قراءة المصنّف من ملف مرفوع.
 * ملفات CSV تُفكّ صراحةً بترميز UTF-8، وإلا قرأها المحلل بترميز لاتيني
 * فتتحول النصوص العربية إلى رموز مشوّهة.
 */
export async function readWorkbook(file) {
  const buf = await file.arrayBuffer();
  if (isText(file)) {
    const text = new TextDecoder('utf-8').decode(new Uint8Array(buf)).replace(/^\uFEFF/, '');
    return XLSX.read(text, { type: 'string', cellDates: true, raw: false });
  }
  return XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
}

/** تحويل ورقة إلى مصفوفة صفوف خام */
export function sheetToAoa(wb, name) {
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true, blankrows: false });
}

/** ترجيح صف العناوين: أكثر صف يحتوي كلمات معروفة من قاموس الحقول */
export function guessHeaderRow(aoa) {
  const limit = Math.min(aoa.length, 20);
  let best = 0, bestScore = -1;
  for (let i = 0; i < limit; i++) {
    const cells = (aoa[i] || []).map(norm).filter(Boolean);
    let score = cells.length * 0.4;
    FIELDS.forEach(([, , , syn]) => {
      if (cells.some((c) => syn.some((w) => c.includes(norm(w))))) score += 3;
    });
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** أسماء الأعمدة، مع تعويض الفارغ منها بـ«عمود N» */
export function buildHeaders(aoa, headerRow) {
  const h = aoa[headerRow] || [];
  const width = Math.max(...aoa.slice(0, 50).map((r) => r.length), h.length);
  return Array.from({ length: width }, (_, i) => String(h[i] ?? '').trim() || `عمود ${i + 1}`);
}

/** قراءة قائمة (منتجات/موردين) من ملف إكسل أو CSV مرفوع يدوياً */
export async function readListFile(file) {
  const wb = await readWorkbook(file);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true });
}

export const findKey = (obj, words) =>
  Object.keys(obj || {}).find((k) => {
    const n = norm(k);
    return words.some((w) => n.includes(norm(w)));
  });

/**
 * بناء صفوف البنود من المصفوفة الخام حسب خريطة الأعمدة، ثم مطابقتها ببيانات المنشأة.
 * الصف بلا مرجع يُلحق بالمرجع السابق (نمط شائع في ملفات العملاء).
 */
export function buildRows(aoa, headerRow, map, catalog) {
  const g = (r, k) => (map[k] != null ? r[map[k]] : '');
  const body = aoa.slice(headerRow + 1).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  let lastRef = '';

  const rows = body.map((r, i) => {
    const ref = String(g(r, 'ref') ?? '').trim() || lastRef || `AUTO-${i + 1}`;
    lastRef = ref;
    const rawIncl = truthy(g(r, 'taxIncl'));
    return {
      i: i + 1,
      ref,
      desc: String(g(r, 'desc') ?? ''),
      terms: String(g(r, 'terms') ?? ''),
      notes: String(g(r, 'notes') ?? ''),
      vendorRefRaw: String(g(r, 'vendorRef') ?? ''),
      vendorNameRaw: String(g(r, 'vendorName') ?? ''),
      vendorPhoneRaw: String(g(r, 'vendorPhone') ?? ''),
      vendorRef: '',
      vendorCands: [],
      issueDate: toDate(g(r, 'issueDate')),
      dueDate: toDate(g(r, 'dueDate')),
      supplyDate: toDate(g(r, 'supplyDate')),
      location: String(g(r, 'location') ?? '').trim(),
      docDiscVal: num(g(r, 'docDiscVal')),
      docDiscAcc: String(g(r, 'docDiscAcc') ?? ''),
      docDiscTax: String(g(r, 'docDiscTax') ?? ''),
      prodRefRaw: String(g(r, 'prodRef') ?? ''),
      prodNameRaw: String(g(r, 'prodName') ?? ''),
      prodDesc: String(g(r, 'prodDesc') ?? ''),
      prodSku: '',
      prodCands: [],
      qty: num(g(r, 'qty')),
      unit: String(g(r, 'unit') ?? '').trim(),
      price: num(g(r, 'price')),
      lineTotal: num(g(r, 'lineTotal')),
      taxIncl: rawIncl,
      taxInclFromFile: map.taxIncl != null && rawIncl != null,
      discPct: ((v) => (v != null && v > 0 && v < 1 ? v * 100 : v))(num(g(r, 'discPct'))),
      discVal: num(g(r, 'discVal')),
      taxRaw: String(g(r, 'tax') ?? ''),
      taxName: '',
      issues: []
    };
  });

  rows.forEach((row) => {
    const mv = matchVendor(row, catalog.vendors);
    row.vendorRef = mv.v ? mv.v.ref : '';
    row.vendorCands = mv.cands;
    row.vendorBy = mv.by;

    const mp = matchProduct(row, catalog.products);
    row.prodSku = mp.p ? mp.p.sku : '';
    row.prodCands = mp.cands;
    row.prodBy = mp.by;

    const mt = matchTax(row.taxRaw, mp.p ? mp.p.taxPercent : null, catalog.taxes);
    row.taxName = mt.t ? mt.t.name : '';
    row.taxPct = mt.pct;
    row.taxCands = (mt.cands || []).length;
  });

  return rows;
}
