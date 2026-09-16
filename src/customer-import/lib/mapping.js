/**
 * mapping.js — المطابقة الذكية بين أعمدة ملف العميل وحقول قالب العملاء.
 * نفس مبدأ bill-import/lib/mapping.js حرفياً (القرار مبني على اسم العمود
 * وطبيعة قيمه معاً)، لكن valueScore هنا مُكيَّف لحقول جهة اتصال (عميل/مورد)
 * لا فاتورة: هاتف، بريد، رقم ضريبي، حالة، نص عنوان — بلا أي اعتماد على
 * كتالوج منتجات/موردين/ضرائب (لا وجود لمفهومه هنا إطلاقاً).
 */
import { toks, norm, num, digitsOnly } from './text.js';
import { FIELDS, NEG, NAME_REQUIRED } from './fields.js';

const STOP = new Set(['the', 'of', 'no', 'رقم', 'ال', 'في', 'هذا']);

/** درجة تطابق اسم العمود مع مرادفات الحقل (0 = لا تطابق) — منقولة حرفياً */
export function nameScore(header, syns, negs) {
  const h = toks(header);
  if (!h.length) return 0;
  const hs = new Set(h);
  let best = 0;
  for (const syn of syns) {
    const all = toks(syn);
    const p = all.filter((t) => !STOP.has(t) || all.length === 1);
    if (!p.length) continue;
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

const ACTIVE_WORDS = new Set(['active', 'نشط', 'فعال']);
const INACTIVE_WORDS = new Set(['inactive', 'غيرنشط', 'معطل', 'موقوف']);

/** تنميط عمود: إحصاءات عن قيمه تُستخدم للاستدلال على الحقل */
export function profileCol(aoa, headerRow, i) {
  const raw = aoa.slice(headerRow + 1, headerRow + 301).map((r) => r[i]);
  const vals = raw.filter((v) => String(v ?? '').trim() !== '');
  const n = Math.max(vals.length, 1);
  const nums = vals.map(num).filter((v) => v != null);
  const uniq = new Set(vals.map((v) => norm(v))).size / n;
  const codeish = vals.filter(
    (v) => /^[\w؀-ۿ][\w؀-ۿ\-_/]{1,24}$/.test(String(v).trim()) && /\d/.test(String(v))
  ).length / n;

  return {
    n,
    uniq,
    codeish,
    filled: vals.length / Math.max(raw.length, 1),
    numRatio: nums.length / n,
    avgLen: vals.length ? vals.reduce((s, v) => s + String(v).length, 0) / vals.length : 0,
    emailRatio: vals.filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())).length / n,
    urlRatio: vals.filter((v) => /^(https?:\/\/|www\.)/i.test(String(v).trim()) || /\.[a-z]{2,}(\/|$)/i.test(String(v).trim())).length / n,
    phoneRatio: vals.filter((v) => { const d = digitsOnly(v); return d.length >= 9 && d.length <= 15; }).length / n,
    taxRatio: vals.filter((v) => digitsOnly(v).length === 15).length / n,
    zipRatio: vals.filter((v) => { const d = digitsOnly(v); return d.length >= 4 && d.length <= 6; }).length / n,
    statusRatio: vals.filter((v) => { const nn = norm(v); return ACTIVE_WORDS.has(nn) || INACTIVE_WORDS.has(nn); }).length / n
  };
}

/** كم تدعم قيمُ العمود هذا الحقل تحديداً */
export function valueScore(key, p) {
  const D = (c, s) => (c ? s : 0);
  switch (key) {
    case 'ref':
      return (p.numRatio < 0.6 && p.codeish > 0.6 ? 0.7 : 0) + (p.uniq < 0.85 ? 0.4 : 0) + (p.uniq < 0.5 ? 0.2 : 0);
    case 'name':
      return D(p.numRatio < 0.3, 0.5) + D(p.uniq > 0.6, 0.6) + D(p.emailRatio > 0.3, -1.5) + D(p.phoneRatio > 0.6 && p.numRatio > 0.6, -1.5);
    case 'phone':
      return p.phoneRatio * 2.5 + D(p.numRatio > 0.5, 0.3);
    case 'email':
      return p.emailRatio * 3;
    case 'status':
      return p.statusRatio * 3 + D(p.uniq < 0.3, 0.4);
    case 'billingZip':
    case 'shippingZip':
      return p.zipRatio * 1.5 + D(p.numRatio > 0.7, 0.3) + D(p.avgLen <= 6, 0.3);
    case 'taxNumber':
      return p.taxRatio * 3.5;
    default:
      return 0;
  }
}

/**
 * الربط التلقائي: يبني مصفوفة درجات (حقل × عمود) ثم يوزّع بالأولوية،
 * فلا يُربط عمود بحقلين ولا حقل بعمودين. نفس خوارزمية bill-import/lib/mapping.js.
 */
export function autoMap(aoa, headerRow, headers) {
  const map = {};
  const prof = headers.map((_, i) => profileCol(aoa, headerRow, i));
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
  return { map, prof };
}
