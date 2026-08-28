/**
 * mapping.js — المطابقة الذكية بين أعمدة ملف العميل وحقول قالب قيود.
 * القرار مبني على شيئين معاً: اسم العمود (بالكلمات لا بالحروف) وطبيعة القيم داخله.
 */
import { toks, norm, num, digitsOnly, truthy, fixDigits } from './text.js';
import { FIELDS, NEG, NAME_REQUIRED } from './fields.js';

const STOP = new Set(['the', 'of', 'no', 'رقم', 'ال', 'في', 'هذا']);

/** درجة تطابق اسم العمود مع مرادفات الحقل (0 = لا تطابق) */
export function nameScore(header, syns, negs) {
  const h = toks(header);
  if (!h.length) return 0;
  const hs = new Set(h);
  let best = 0;
  for (const syn of syns) {
    const all = toks(syn);
    const p = all.filter((t) => !STOP.has(t) || all.length === 1);
    if (!p.length) continue;
    // المطابقة بالكلمة الكاملة أو ببادئة قريبة الطول فقط،
    // حتى لا تُطابق "discount" كلمةَ "count" ولا "الكمية" كلمةَ "كم".
    const near = (x, t) => x !== t && t.length >= 4 && x.startsWith(t) && x.length - t.length <= 3;
    const hit = p.filter((t) => hs.has(t) || h.some((x) => near(x, t))).length;
    if (!hit) continue;
    let sc = hit / p.length;
    if (sc === 1) sc += Math.min(p.length, 3) * 0.12;
    if (hs.size === p.length && sc >= 1) sc += 0.2;
    best = Math.max(best, sc);
  }
  if (best && negs) {
    for (const ng of negs) {
      const nearNeg = (x, t) => x !== t && t.length >= 4 && x.startsWith(t) && x.length - t.length <= 3;
      if (toks(ng).every((t) => hs.has(t) || h.some((x) => nearNeg(x, t)))) best -= 0.75;
    }
  }
  return Math.max(0, best);
}

/** تنميط عمود: إحصاءات عن قيمه تُستخدم للاستدلال على الحقل */
export function profileCol(aoa, headerRow, i, catalog, tpl) {
  const raw = aoa.slice(headerRow + 1, headerRow + 301).map((r) => r[i]);
  const vals = raw.filter((v) => String(v ?? '').trim() !== '');
  const n = Math.max(vals.length, 1);
  const nums = vals.map(num).filter((v) => v != null);
  const isDate = (v) =>
    v instanceof Date ? true
      : typeof v === 'number' ? v > 40000 && v < 60000
        : /^\s*\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}/.test(fixDigits(String(v)));
  const has = (set) => vals.filter((v) => set.has(norm(v))).length / n;
  const setOf = (arr, f) => new Set(arr.map(f).map(norm).filter(Boolean));
  const catPct = new Set(catalog.taxes.map((t) => t.percent));
  const uniq = new Set(vals.map((v) => norm(v))).size / n;
  const codeish = vals.filter(
    (v) => /^[\w\u0600-\u06FF][\w\u0600-\u06FF\-_/]{1,24}$/.test(String(v).trim()) && /\d/.test(String(v))
  ).length / n;

  return {
    n,
    uniq,
    codeish,
    filled: vals.length / Math.max(raw.length, 1),
    numRatio: nums.length / n,
    dateRatio: vals.filter(isDate).length / n,
    pctRatio: vals.filter((v) => /%/.test(String(v))).length / n,
    fracRatio: nums.filter((v) => v > 0 && v < 1).length / Math.max(nums.length, 1),
    intRatio: nums.filter((v) => Number.isInteger(v)).length / Math.max(nums.length, 1),
    posRatio: nums.filter((v) => v > 0).length / Math.max(nums.length, 1),
    avg: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0,
    yesNo: vals.filter((v) => truthy(v) != null).length / n,
    phone: vals.filter((v) => {
      const d = digitsOnly(v);
      return d.length >= 9 && d.length <= 15;
    }).length / n,
    vRef: has(setOf(catalog.vendors, (v) => v.ref)),
    vName: has(setOf(catalog.vendors, (v) => v.name)),
    pSku: has(setOf(catalog.products, (p) => p.sku)),
    pName: has(setOf(catalog.products, (p) => p.name)),
    loc: has(new Set(catalog.locations.map(norm))),
    unit: has(new Set((tpl ? tpl.units : []).map(norm))),
    taxish: vals.filter((v) => {
      const x = num(v);
      return /%/.test(String(v)) || (x != null && x >= 0 && x <= 1) || (x != null && catPct.has(x) && uniq <= 0.4);
    }).length / n
  };
}

/** كم تدعم قيمُ العمود هذا الحقل تحديداً */
export function valueScore(key, p) {
  const D = (c, s) => (c ? s : 0);
  switch (key) {
    case 'ref':
      return (p.numRatio < 0.6 && p.dateRatio < 0.2 && p.codeish > 0.6 ? 0.7 : 0)
        + (p.uniq < 0.85 ? 0.4 : 0) + (p.uniq < 0.5 ? 0.2 : 0);
    case 'vendorRef': return p.vRef * 3;
    case 'vendorName': return p.vName * 3;
    case 'vendorPhone': return p.phone * 2.5;
    case 'issueDate': return p.dateRatio * 2.2;
    case 'dueDate':
    case 'supplyDate': return p.dateRatio * 1.8;
    case 'location': return p.loc * 4;
    case 'prodRef': return p.pSku * 4 + D(p.pSku < 0.1 && p.pName > 0.5, -1);
    case 'prodName': return p.pName * 3;
    case 'unit': return p.unit * 3 + D(p.numRatio < 0.2 && p.uniq < 0.3, 0.3);
    case 'qty': return D(p.numRatio > 0.85 && p.posRatio > 0.9, 0.8) + D(p.intRatio > 0.8, 0.5) + D(p.avg < 500, 0.3);
    case 'price': return D(p.numRatio > 0.85, 0.7) + D(p.avg > 1, 0.3) + D(p.fracRatio > 0.7, -1);
    case 'lineTotal': return D(p.numRatio > 0.85, 0.6) + D(p.avg > 10, 0.3) + D(p.fracRatio > 0.7, -1);
    case 'taxIncl': return p.yesNo * 3.5 + D(p.numRatio > 0.9, -2.2);
    case 'tax': return p.taxish * 2.2 + D(p.pctRatio > 0.5, 0.8);
    case 'discPct':
      return D(p.numRatio > 0.7, 0.3) + D(p.fracRatio > 0.6, 1.4) + D(p.pctRatio > 0.5, 1.4)
        + D(p.avg > 1 && p.fracRatio < 0.3, -0.9);
    case 'discVal':
      return D(p.numRatio > 0.7, 0.3) + D(p.fracRatio < 0.3 && p.avg >= 1, 1.0) + D(p.fracRatio > 0.6, -0.9);
    default: return 0;
  }
}

/** الخصم: نسبة أم قيمة؟ يُحسم بالقيم لا بالعنوان وحده */
function fixDiscountKind(map, prof) {
  ['discPct', 'discVal'].forEach((key) => {
    const i = map[key];
    if (i == null) return;
    const p = prof[i];
    const other = key === 'discPct' ? 'discVal' : 'discPct';
    const looksPct = p.pctRatio > 0.4 || p.fracRatio > 0.6;
    const wantPct = key === 'discPct';
    if (looksPct !== wantPct && map[other] == null) {
      delete map[key];
      map[other] = i;
    }
  });
}

/** سعر الوحدة مقابل الإجمالي: يُختبر بالعلاقة إجمالي ≈ كمية × سعر */
function fixPriceTotal(map, aoa, headerRow) {
  const a = map.price, b = map.lineTotal, q = map.qty;
  if (a == null || b == null || q == null) return;
  const rows = aoa.slice(headerRow + 1, headerRow + 201);
  let keep = 0, swap = 0;
  rows.forEach((r) => {
    const Q = num(r[q]), A = num(r[a]), B = num(r[b]);
    if (!(Q > 0) || A == null || B == null) return;
    if (Math.abs(Q * A - B) / Math.max(B, 1) < 0.35) keep++;
    if (Math.abs(Q * B - A) / Math.max(A, 1) < 0.35) swap++;
  });
  if (swap > keep) {
    map.price = b;
    map.lineTotal = a;
  }
}

/**
 * الربط التلقائي: يبني مصفوفة درجات (حقل × عمود) ثم يوزّع بالأولوية،
 * فلا يُربط عمود بحقلين ولا حقل بعمودين.
 */
export function autoMap(aoa, headerRow, headers, catalog, tpl) {
  const map = {};
  const prof = headers.map((_, i) => profileCol(aoa, headerRow, i, catalog, tpl));
  const cand = [];
  FIELDS.forEach(([key, , , syns]) => {
    headers.forEach((h, i) => {
      const ns = nameScore(h, syns, NEG[key]);
      const vs = valueScore(key, prof[i]);
      if (ns === 0 && NAME_REQUIRED.has(key)) return;
      const total = ns * 2 + vs;
      if (total > 0.55 && !(ns === 0 && vs < 0.9)) cand.push({ key, i, total });
    });
  });
  cand.sort((a, b) => b.total - a.total);
  const usedCol = new Set(), usedKey = new Set();
  cand.forEach((c) => {
    if (usedCol.has(c.i) || usedKey.has(c.key)) return;
    map[c.key] = c.i;
    usedCol.add(c.i);
    usedKey.add(c.key);
  });
  fixDiscountKind(map, prof);
  fixPriceTotal(map, aoa, headerRow);
  return { map, prof };
}
