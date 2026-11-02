// محرك التحليل: قراءة ملف العميل، اكتشاف الترويسة، مطابقة الأعمدة (بالعنوان + بالمحتوى)، التنظيف، التحقق.
import * as XLSXns from 'xlsx';
const XLSX = XLSXns.default ?? XLSXns;
import {
  FIELDS, FIELD_BY_KEY, HEADER_ALIASES, FULLNAME_ALIASES, VALUE_ALIASES, LIST_FIELDS,
  HEADER_NEG, IGNORE_HEADERS, VALUE_TRANSLATE, VALUE_NOISE,
} from './fields.js';
import { transliterate, transliterateAr } from './translit.js';

/* ============================ أدوات النصوص ============================ */
const AR_IND = '٠١٢٣٤٥٦٧٨٩';
const FA_IND = '۰۱۲۳۴۵۶۷۸۹';
export function toLatinDigits(s) {
  return String(s ?? '')
    .replace(/[٠-٩]/g, (d) => AR_IND.indexOf(d))
    .replace(/[۰-۹]/g, (d) => FA_IND.indexOf(d));
}
export function normAr(s) {
  return toLatinDigits(s)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
export function normKey(s) {
  return normAr(s).split(' ').filter(Boolean).map((w) => (w.length > 3 ? w.replace(/^ال/, '') : w)).join(' ');
}
// توحيد كلمات العناوين: حذف "ال" و"بال" و"وال" من بداية الكلمة
const tokNorm = (w) => (w.length > 3 ? w.replace(/^(بال|وال|ال)/, '') : w);
// "D.O.B" ← "DOB"، "Emp_No" ← "Emp No"
const headerTokens = (s) => normAr(String(s ?? '').replace(/\b([A-Za-z])\.(?=[A-Za-z]\b)/g, '$1').replace(/\b([A-Za-z])\.(?=\s|$)/g, '$1').replace(/_/g, ' ')).split(' ').filter(Boolean).map(tokNorm);
export function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  // فرق الطول وحده يحدّ التشابه من فوق: لا داعي للحساب الكامل إذا كان بعيدًا
  const cap = 1 - Math.abs(m - n) / Math.max(m, n);
  if (cap < 0.5) return cap;
  // مسافة Levenshtein بصفّين فقط (أسرع بكثير من مصفوفة كاملة)
  let prev = new Uint16Array(n + 1), cur = new Uint16Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ai === b.charCodeAt(j - 1) ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return 1 - prev[n] / Math.max(m, n);
}
const HAS_AR = /[؀-ۿ]/;
const HAS_LAT = /[A-Za-z]/;
const clean = (s) => String(s ?? '').replace(/[​-‏‪-‮﻿]/g, '').replace(/\s+/g, ' ').trim();
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const colLetter = (n) => { let s = ''; n += 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/* ============================ قراءة الملفات ============================ */
// نص الملف: UTF-8 أو UTF-16 أو Windows-1256 (الترميز الافتراضي لإكسل العربي عند الحفظ CSV)
function decodeText(ab) {
  const u = new Uint8Array(ab);
  if (u[0] === 0xff && u[1] === 0xfe) return new TextDecoder('utf-16le').decode(u.subarray(2));
  if (u[0] === 0xfe && u[1] === 0xff) return new TextDecoder('utf-16be').decode(u.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u).replace(/^﻿/, ''); } catch { /* ليس UTF-8 */ }
  try { return new TextDecoder('windows-1256').decode(u); } catch { return new TextDecoder('latin1').decode(u); }
}
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).slice(0, 10).filter(Boolean);
  const cands = [',', ';', '\t', '|'];
  const count = (l, d) => { let n = 0, q = false; for (const ch of l) { if (ch === '"') q = !q; else if (!q && ch === d) n++; } return n; };
  let delim = ',', bestScore = -1;
  for (const d of cands) {
    const cs = lines.map((l) => count(l, d));
    const mn = Math.min(...cs);
    const sc = mn > 0 ? mn * 10 - (Math.max(...cs) - mn) : -1;
    if (sc > bestScore) { bestScore = sc; delim = d; }
  }
  const rows = [];
  let row = [], cur = '', q = false;
  const push = () => { const v = clean(cur); row.push(v === '' ? null : v); cur = ''; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) push();
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; push(); rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { push(); rows.push(row); }
  return rows;
}

// يُرجع [{name, rows, merges, hidden}] حيث cell: string | number | {d: serial} | null — الصفوف والأعمدة تبدأ من A1 دائمًا
export function readClientFile(arrayBuffer, fileName) {
  if (/\.(csv|txt|tsv)$/i.test(fileName || '')) {
    return [{ name: (fileName || 'CSV').replace(/\.[^.]+$/, ''), rows: parseCsv(decodeText(arrayBuffer)), merges: [] }];
  }
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellNF: true, cellDates: false });
  return wb.SheetNames.map((name, si) => {
    const ws = wb.Sheets[name];
    const hidden = !!wb.Workbook?.Sheets?.[si]?.Hidden;
    if (!ws || !ws['!ref']) return { name, rows: [], merges: [], hidden };
    const range = XLSX.utils.decode_range(ws['!ref']);
    const rows = [];
    for (let r = 0; r <= range.e.r; r++) {
      const row = [];
      for (let c = 0; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell || cell.v === undefined || cell.v === null || cell.v === '') { row.push(null); continue; }
        if (cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) row.push({ d: cell.v });
        else if (cell.t === 'd') row.push({ d: (new Date(cell.v).getTime() / 86400000) + 25569 });
        else if (cell.t === 'b') row.push(String(cell.v));
        else if (cell.t === 'n') row.push(cell.v);
        else { const v = clean(cell.v); row.push(v === '' ? null : v); }
      }
      rows.push(row);
    }
    // الخلايا المدموجة: تُنسخ القيمة لكل الخلايا المدموجة (العمودي يفيد بالأقسام المدموجة، الأفقي بالترويسة)
    const merges = ws['!merges'] || [];
    for (const m of merges) {
      const v = rows[m.s.r]?.[m.s.c];
      if (v === null || v === undefined) continue;
      for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) if (rows[r] && (rows[r][c] === null || rows[r][c] === undefined)) rows[r][c] = v;
    }
    while (rows.length && rows[rows.length - 1].every((c) => c === null)) rows.pop();
    return { name, rows, merges, hidden };
  });
}

export const cellText = (c) => (c === null || c === undefined ? '' : typeof c === 'object' ? serialToIso(c.d) : String(c));

/* ============================ تقييم العناوين ============================ */
const ALIAS_TOK = {};
for (const [k, arr] of Object.entries(HEADER_ALIASES)) ALIAS_TOK[k] = arr.map(headerTokens);
ALIAS_TOK.full_name = FULLNAME_ALIASES.map(headerTokens);
const NEG_TOK = Object.fromEntries(Object.entries(HEADER_NEG).map(([k, arr]) => [k, new Set(arr.map((w) => tokNorm(normAr(w))))]));
const IGNORE_SET = new Set(IGNORE_HEADERS.map((h) => headerTokens(h).join(' ')));
const GENERIC_RE = /^(column|col|field|unnamed|عمود|حقل|بيان|بيانات)?\s*[a-z]?\d*$/i;

function scoreTokens(hTok, aliasToks) {
  if (!hTok.length) return 0;
  const hJoin = hTok.join(' ');
  let best = 0;
  for (const aTok of aliasToks) {
    if (!aTok.length) continue;
    if (aTok.join(' ') === hJoin) return 1;
    const aInH = aTok.every((t) => hTok.includes(t));
    const hInA = hTok.every((t) => aTok.includes(t));
    let s = 0;
    if (aInH) s = 0.75 + 0.2 * (aTok.length / hTok.length);
    else if (hInA && hTok.length >= 2) s = 0.7 + 0.2 * (hTok.length / aTok.length);
    else {
      const sim = similarity(hJoin, aTok.join(' '));
      if (sim >= 0.85) s = sim * 0.9;
    }
    if (s > best) best = s;
  }
  return best;
}
// درجة تطابق عنوان (بأكثر من صيغة بديلة) مع حقل
function headerFieldScore(alts, key) {
  let best = 0;
  for (const tok of alts) {
    const neg = NEG_TOK[key];
    if (neg && tok.some((t) => neg.has(t))) continue;
    best = Math.max(best, scoreTokens(tok, ALIAS_TOK[key] || []));
  }
  return best;
}
const ALL_KEYS = [...FIELDS.map((f) => f.key), 'full_name'];
const HDR_CACHE = new Map(); // نفس النص يتكرر بصفوف البيانات (أسماء أقسام، مدن…)
function bestHeaderScore(text) {
  if (HDR_CACHE.has(text)) return HDR_CACHE.get(text);
  const tok = [headerTokens(text)];
  let m = 0;
  for (const k of ALL_KEYS) m = Math.max(m, headerFieldScore(tok, k));
  if (HDR_CACHE.size < 5000) HDR_CACHE.set(text, m);
  return m;
}

/* ============================ اكتشاف الترويسة ============================ */
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/;
function looksLikeData(c) {
  if (c === null || c === undefined) return false;
  if (typeof c === 'number' || typeof c === 'object') return true;
  const t = toLatinDigits(c);
  if (EMAIL_RE.test(t)) return true;
  if (/^[+\d][\d\s\-/.()]{5,}$/.test(t)) return true;
  if (/^[A-Z]{2}\d{2}/i.test(t.replace(/\s/g, '')) && t.replace(/\s/g, '').length > 15) return true;
  return false;
}
function distinctTexts(row) {
  const s = new Set();
  for (const c of row || []) if (c !== null && c !== undefined && typeof c === 'string') s.add(c);
  return [...s];
}
const nonEmpty = (row) => (row || []).filter((c) => c !== null && c !== undefined && c !== '').length;
function rowHeaderScore(row) {
  let score = 0;
  for (const t of distinctTexts(row)) { const m = bestHeaderScore(t); if (m >= 0.7) score += m; }
  score -= 0.3 * (row || []).filter(looksLikeData).length;
  return score;
}

// يُرجع {top, idx}: idx = آخر صف بالترويسة، top = أولها (ترويسة بصفين)، idx = -1 يعني الملف بدون ترويسة
export function detectHeader(rows) {
  const limit = Math.min(rows.length, 50);
  let bestIdx = -1, bestScore = 0;
  for (let i = 0; i < limit; i++) {
    if (distinctTexts(rows[i]).length < 2) continue;
    const s = rowHeaderScore(rows[i]) + nonEmpty(rows[i]) * 0.01;
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  }
  if (bestIdx < 0 || bestScore < 1.4) return { top: -1, idx: -1 };
  let top = bestIdx, idx = bestIdx;
  const isTextRow = (r) => nonEmpty(r) > 0 && !(r || []).some(looksLikeData);
  // صف مجموعات فوق الترويسة (مدموج أفقيًا: قيم مكررة)
  const prev = rows[bestIdx - 1];
  if (prev && isTextRow(prev)) {
    const d = distinctTexts(prev).length, n = nonEmpty(prev);
    if (d >= 2 && d < n) top = bestIdx - 1;
  }
  // ترويسة فرعية تحت الصف المختار: الصف الحالي مدموج والتالي عناوين نصية
  const next = rows[bestIdx + 1];
  if (top === bestIdx && next && isTextRow(next) && nonEmpty(next) >= 2) {
    const cur = rows[bestIdx];
    const merged = distinctTexts(cur).length < nonEmpty(cur);
    const nextScore = rowHeaderScore(next);
    const after = rows[bestIdx + 2];
    if (merged && after && (after.some(looksLikeData) || nextScore > 0)) { top = bestIdx; idx = bestIdx + 1; }
  }
  return { top, idx };
}
// توافق مع الإصدار السابق
export const detectHeaderRow = (rows) => detectHeader(rows).idx;

/* ============================ تجهيز الشيت ============================ */
const TOTAL_RE = /^(الاجمالي|إجمالي|الإجمالي|اجمالي|المجموع|مجموع|total|grand total|sum|subtotal|number of records|عدد الموظفين|عدد السجلات)(\s|:|$)/i;
const FOOTER_RE = /^(إعداد|اعداد|اعتماد|إعتماد|المدير العام|التوقيع|توقيع|الختم|ختم|prepared by|approved by|reviewed by|checked by|signature|authorized|stamp|مراجعة|مدقق)(\s|:|$)/i;
// يُرجع P = { name, cols: [{col, text, alts, synthetic?}], data: [[cell]], src: [رقم الصف بملف العميل], skipped: [...] }
export function prepareSheet(sheet, hdr) {
  const rows = sheet.rows;
  const idx = hdr?.idx ?? -1;
  const top = hdr?.top ?? idx;
  let width = 0;
  for (let i = Math.max(0, top); i < rows.length; i++) width = Math.max(width, rows[i].length);
  const hmerge = (sheet.merges || []).filter((m) => m.e.c > m.s.c);
  const isHFill = (r, c) => hmerge.some((m) => r >= m.s.r && r <= m.e.r && c > m.s.c && c <= m.e.c);
  // نصوص الترويسة لكل عمود
  const own = [], group = [];
  for (let c = 0; c < width; c++) {
    own[c] = idx >= 0 ? cellText(rows[idx][c]) : '';
    const g = [];
    for (let r = Math.max(0, top); r < idx; r++) { const t = cellText(rows[r][c]); if (t && !g.includes(t) && t !== own[c]) g.push(t); }
    group[c] = g.join(' ');
  }
  const ownNorm = own.map((t) => normAr(t));
  const data = [], src = [], section = [], skipped = [];
  let curSection = '';
  for (let i = idx + 1; i < rows.length; i++) {
    const row = (rows[i] || []).slice(0, width).map((c, ci) => (isHFill(i, ci) ? null : c));
    while (row.length < width) row.push(null);
    const ne = row.filter((c) => c !== null && c !== '');
    if (!ne.length) continue;
    const distinct = new Set(ne.map(cellText));
    if (distinct.size === 1 && width > 2) {
      const t = [...distinct][0];
      if (!TOTAL_RE.test(t)) curSection = t;
      skipped.push({ src: i + 1, reason: 'عنوان/ملاحظة', text: t });
      continue;
    }
    if (idx >= 0) {
      const same = row.filter((c, ci) => c !== null && ownNorm[ci] && normAr(cellText(c)) === ownNorm[ci]).length;
      if (same >= Math.max(2, ne.length * 0.6)) { skipped.push({ src: i + 1, reason: 'ترويسة مكررة', text: '' }); continue; }
    }
    const texts = ne.map(cellText);
    const strTexts = ne.filter((c) => typeof c === 'string').map(clean);
    // صف إجماليات: نص "الإجمالي/Total" مع أرقام فقط (أيًا كان عدد أعمدة المجاميع)
    if (strTexts.length <= 2 && strTexts.some((t) => TOTAL_RE.test(t))) { skipped.push({ src: i + 1, reason: 'صف إجماليات', text: texts.join(' ') }); continue; }
    if (ne.length <= 3 && strTexts.some((t) => FOOTER_RE.test(t))) { skipped.push({ src: i + 1, reason: 'توقيع/اعتماد', text: texts.join(' ') }); continue; }
    data.push(row); src.push(i + 1); section.push(curSection);
  }
  // صفوف شبه فاضية مقارنةً ببقية الصفوف (ملاحظات تذييل غالبًا)
  const counts = data.map((r) => r.filter((c) => c !== null && c !== '').length);
  const medN = median(counts);
  for (let k = data.length - 1; k >= 0; k--) {
    if (medN >= 6 && counts[k] <= 2) {
      skipped.push({ src: src[k], reason: 'صف شبه فاضي', text: data[k].map(cellText).filter(Boolean).join(' | ') });
      data.splice(k, 1); src.splice(k, 1); section.splice(k, 1);
    }
  }
  const cols = [];
  for (let c = 0; c < width; c++) {
    const hasData = data.some((r) => r[c] !== null && r[c] !== undefined && r[c] !== '');
    if (!own[c] && !group[c] && !hasData) continue;
    const alts = [];
    if (own[c]) alts.push(headerTokens(own[c]));
    if (group[c]) alts.push(headerTokens(`${group[c]} ${own[c]}`));
    const text = own[c] ? (group[c] ? `${group[c]} / ${own[c]}` : own[c]) : (group[c] || `عمود ${colLetter(c)}`);
    cols.push({ col: c, text, own: own[c], group: group[c], alts, letter: colLetter(c) });
  }
  // عمود مشتق من عناوين المجموعات بين الصفوف (مثل "إدارة المالية" فوق موظفيها)
  const secs = new Set(section.filter(Boolean));
  if (secs.size >= 2 && section.filter(Boolean).length >= data.length * 0.6) {
    const c = width;
    data.forEach((r, k) => { r[c] = section[k] || null; });
    cols.push({ col: c, text: 'عنوان المجموعة (من صفوف العناوين)', alts: [], synthetic: '@group', letter: '—' });
    width++;
  }
  return { name: sheet.name, cols, data, src, skipped, width, hdr: { top, idx } };
}

// دمج عدة شيتات بنفس البنية (شيت لكل فرع مثلًا) مع عمود مشتق باسم الشيت
export function mergePrepared(list) {
  const base = list[0];
  const cols = base.cols.map((c) => ({ ...c }));
  const keyOf = (c) => (c.synthetic ? c.synthetic : normAr(c.text));
  const pos = new Map(cols.map((c) => [keyOf(c), c.col]));
  let width = base.width;
  const data = [], src = [], skipped = [];
  for (const P of list) {
    const colMap = new Map();
    for (const c of P.cols) {
      const k = keyOf(c);
      if (!pos.has(k)) { const nc = { ...c, col: width }; cols.push(nc); pos.set(k, width); width++; }
      colMap.set(c.col, pos.get(k));
    }
    P.data.forEach((r, i) => {
      const nr = [];
      for (const [from, to] of colMap) nr[to] = r[from] ?? null;
      data.push(nr); src.push(`${P.name}!${P.src[i]}`);
    });
    skipped.push(...P.skipped.map((s) => ({ ...s, src: `${P.name}!${s.src}` })));
  }
  const sc = width++;
  let k = 0;
  for (const P of list) for (let i = 0; i < P.data.length; i++) data[k++][sc] = P.name;
  for (const r of data) for (let c = 0; c < width; c++) if (r[c] === undefined) r[c] = null;
  cols.push({ col: sc, text: 'اسم الشيت', alts: [], synthetic: '@sheet', letter: '—' });
  return { name: list.map((p) => p.name).join(' + '), cols, data, src, skipped, width, merged: list.map((p) => p.name), hdr: base.hdr };
}

export function columnSample(P, col, n = 40) {
  const out = [];
  for (let i = 0; i < P.data.length && out.length < n; i++) {
    const t = cellText(P.data[i][col]);
    if (t) out.push(t);
  }
  return out;
}
const scriptShare = (vals, re) => (vals.length ? vals.filter((v) => re.test(v)).length / vals.length : 0);

/* ============================ تحليل المحتوى ============================ */
const digitsOf = (s) => toLatinDigits(s).replace(/\D/g, '');
const firstPart = (t) => toLatinDigits(t).split(/\s*[\/,;|،]\s*|\s+-\s+|\s+و\s+/)[0];
function isPhoneVal(v) {
  if (typeof v === 'object' && v !== null) return false;
  let t = firstPart(String(v)).replace(/^[^\d+]+/, '');
  if (/[A-Za-z؀-ۿ]/.test(t)) return false;
  t = t.replace(/[()\-.\s]/g, '');
  if (t.startsWith('00')) t = '+' + t.slice(2);
  const d = t.replace(/^\+/, '');
  if (/^(9665\d{8}|05\d{8}|5\d{8}|9661\d{8}|01\d{8}|800\d{7}|9200\d{5})$/.test(d)) return true;
  return t.startsWith('+') && /^\d{9,15}$/.test(d);
}
function isIdVal(v) {
  if (typeof v === 'object' && v !== null) return false;
  const t = toLatinDigits(typeof v === 'number' ? String(Math.round(v)) : String(v)).replace(/^['`’]/, '').replace(/[\s\-.]/g, '');
  return /^[12]\d{9}$/.test(t);
}
const ibanOf = (v) => toLatinDigits(String(v)).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^IBAN(NO|NUMBER)?/, '');
const isIbanVal = (v) => typeof v === 'string' && /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(ibanOf(v));
const isEmailVal = (v) => typeof v === 'string' && EMAIL_RE.test(v);
function numOf(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const s = toLatinDigits(v).replace(/[٬,]/g, '').replace(/٫/g, '.').replace(/(ريال|سعودي|ر\.?\s?س|sar|sr|riyals?|\$|usd)/gi, '').trim();
  return /^\d+(\.\d+)?$/.test(s) ? +s : NaN;
}
function dateIsoLoose(v) {
  if (v && typeof v === 'object') return serialToIso(v.d);
  if (typeof v !== 'string') return null;
  if (!/\d/.test(v)) return null;
  const r = parseDate(v, 'unknown', 'dmy');
  return r.status !== 'error' ? r.iso : null;
}
const isArName = (t) => HAS_AR.test(t) && !/\d/.test(toLatinDigits(t)) && !t.includes('@') && t.split(' ').length <= 6;
const isEnName = (t) => HAS_LAT.test(t) && !HAS_AR.test(t) && !/\d/.test(t) && !t.includes('@') && t.split(' ').length <= 6;

// مُحلّلات قوائم لاختبار المحتوى (من قوائم القالب إن وجدت، وإلا من القيم المعروفة)
function contentResolvers(lists) {
  const out = {};
  for (const k of LIST_FIELDS) {
    const list = lists?.[k]?.length ? lists[k] : Object.keys(VALUE_ALIASES[k] || {});
    if (list.length) out[k] = makeResolver(k, list);
  }
  return out;
}
const CONTENT_ONLY_LISTS = ['gender', 'marital_status', 'nationality', 'employment_status', 'department', 'location', 'employment_type', 'contract_type', 'education_level', 'bank_account_currency', 'salary_pay_frequency'];

// يحسب لكل حقل: k = نسبة القيم الصالحة لنوع الحقل (لتأكيد العنوان)، c = درجة ربط من المحتوى فقط (0 = لا)
function profileColumn(vals, rowsCount, resolvers) {
  const n = vals.length;
  const res = {};
  if (!n) return res;
  const texts = vals.map(cellText);
  const share = (pred) => vals.filter(pred).length / n;
  const uniq = new Set(texts.map((t) => normAr(t))).size / n;
  const fill = n / Math.max(1, rowsCount);
  const put = (key, k, c = 0) => { res[key] = { k, c }; };

  const email = share(isEmailVal);
  put('email', email, email >= 0.8 ? email : 0);
  put('work_email', email);
  const iban = share(isIbanVal);
  put('iban', iban, iban >= 0.8 ? iban : 0);
  const id = share(isIdVal);
  put('national_id_number', id, id >= 0.8 && uniq >= 0.8 ? id : 0);
  const phone = share(isPhoneVal);
  put('work_phone_number', phone, phone >= 0.8 ? phone : 0);
  for (const k of ['home_phone_number', 'emergency_contact_home_phone_number', 'emergency_contact_mobile_phone_number']) put(k, phone);

  // التواريخ + أدوارها حسب المدى الزمني
  const isos = vals.map(dateIsoLoose);
  const dShare = isos.filter(Boolean).length / n;
  const ages = isos.filter(Boolean).map((s) => (Date.now() - Date.parse(s)) / 3.15576e10);
  const med = median(ages);
  const inR = (a, b) => (ages.length ? ages.filter((x) => x >= a && x <= b).length / ages.length : 0);
  const onlyNums = vals.every((v) => typeof v === 'number');
  const dOk = dShare >= 0.8 && !onlyNums;
  // أرقام إكسل التسلسلية بدون تنسيق تاريخ تُقبل لتأكيد عنوان تاريخ (لا للربط من المحتوى وحده)
  const serialShare = share((v) => typeof v === 'number' && v > 20000 && v < 80000);
  for (const f of FIELDS.filter((x) => x.type === 'date')) put(f.key, Math.max(onlyNums ? 0 : dShare, serialShare));
  if (dOk) {
    if (med >= 18) res.date_of_birth.c = dShare * inR(15, 80);
    if (med < 0) res.national_id_expiry_date.c = dShare * inR(-15, 3) * 0.95;
    if (med >= 0 && med <= 25) res.join_date.c = dShare * inR(-1, 45) * 0.97;
  }

  // المبالغ والأرقام الوظيفية
  const nums = vals.map(numOf);
  const numShare = nums.filter((x) => !isNaN(x)).length / n;
  const ints = nums.filter((x) => Number.isInteger(x));
  const sorted = [...ints].sort((a, b) => a - b);
  const consecutive = sorted.length > 3 && sorted.filter((x, i) => i && x - sorted[i - 1] === 1).length >= (sorted.length - 1) * 0.8;
  const amt = nums.filter((x) => x >= 200 && x <= 1e6).length / n;
  put('salary_basic_salary_amount', numShare, amt >= 0.85 && !consecutive && median(nums.filter((x) => !isNaN(x))) >= 1000 ? amt * 0.97 : 0);
  const codeRe = /^[A-Za-z؀-ۿ]{0,5}[-_/.\s]?\d{1,8}$/;
  const codeShare = share((v) => (typeof v === 'number' ? Number.isInteger(v) && v < 1e8 : codeRe.test(String(v).trim())));
  const serial = consecutive && sorted[0] <= 1;
  put('employee_no', codeShare, codeShare >= 0.9 && uniq >= 0.95 && !serial && id < 0.5 && phone < 0.5 ? codeShare * 0.9 : 0);

  // قيم القوائم
  for (const k of LIST_FIELDS) {
    const r = resolvers[k];
    if (!r) continue;
    const ok = share((v) => { const x = r(cellText(v), true); return x && x.how !== 'none' && x.how !== 'fuzzy' && x.how !== 'token'; });
    put(k, ok, CONTENT_ONLY_LISTS.includes(k) && ok >= 0.7 && (k !== 'department' && k !== 'location' ? true : ok >= 0.7) ? ok : 0);
  }

  // الأسماء
  const arN = share((v) => typeof v === 'string' && isArName(v));
  const enN = share((v) => typeof v === 'string' && isEnName(v));
  const multi = share((v) => typeof v === 'string' && clean(v).split(' ').length >= 2);
  const bi = share((v) => typeof v === 'string' && HAS_AR.test(v) && HAS_LAT.test(v) && !/\d/.test(v));
  const nameOk = uniq >= 0.85 && fill >= 0.6 && multi >= 0.8;
  const listMax = Math.max(0, ...LIST_FIELDS.map((k) => res[k]?.k || 0));
  put('full_name_ar', Math.max(arN, bi), nameOk && listMax < 0.5 && (arN >= 0.8 || bi >= 0.6) ? Math.max(arN, bi) * 0.95 : 0);
  put('full_name_en', enN, nameOk && listMax < 0.5 && enN >= 0.8 ? enN * 0.95 : 0);
  for (const k of ['first_name_ar', 'last_name_ar']) put(k, arN);
  for (const k of ['first_name', 'last_name']) put(k, enN);

  // المسمى الوظيفي: نص متكرر لا ينتمي لقائمة
  const textShare = share((v) => typeof v === 'string' && !/\d/.test(toLatinDigits(v)) && !v.includes('@'));
  put('job_title', textShare, textShare >= 0.9 && uniq < 0.8 && uniq > 0.05 && listMax < 0.4 && fill >= 0.6 ? 0.5 : 0);
  return res;
}

const STRICT_TYPES = new Set(['email', 'iban', 'id', 'phone', 'date', 'amount']);

// يُرجع { mapping: {fieldKey|full_name_ar|full_name_en: {col, score, by}}, headers }
export function autoMap(P, lists) {
  const resolvers = contentResolvers(lists);
  const cands = [];
  const profiles = {};
  for (const h of P.cols) {
    const vals = [];
    for (const r of P.data) { const v = r[h.col]; if (v !== null && v !== undefined && v !== '') vals.push(v); if (vals.length >= 300) break; }
    const prof = profileColumn(vals, P.data.length, resolvers);
    profiles[h.col] = { prof, vals };
    const ownTok = h.own ? headerTokens(h.own).join(' ') : '';
    if (ownTok && IGNORE_SET.has(ownTok)) continue;
    const negAll = h.alts.length && ['full_name', ...FIELDS.map((f) => f.key)].every((k) => (NEG_TOK[k] ? h.alts.every((tok) => tok.some((t) => NEG_TOK[k].has(t))) : false));
    const generic = !h.own || h.synthetic || GENERIC_RE.test(normAr(h.own));
    // مرشحو العنوان
    const keys = [...FIELDS.map((f) => f.key), 'full_name'];
    let headerHit = false;
    for (const key of keys) {
      const hs = headerFieldScore(h.alts, key);
      if (hs < 0.7) continue;
      headerHit = true;
      const f = FIELD_BY_KEY[key];
      let k;
      if (key === 'full_name') k = Math.max(prof.full_name_ar?.k || 0, prof.full_name_en?.k || 0);
      else k = prof[key]?.k;
      let score = hs;
      if (k !== undefined && vals.length) {
        if (f && STRICT_TYPES.has(f.type)) score = hs * (0.35 + 0.65 * k);
        else if (f && f.type === 'list' && lists?.[key]?.length) score = hs * (0.6 + 0.4 * k);
        else if (key === 'full_name' || (f && (f.type === 'name_ar' || f.type === 'name_en'))) score = hs * (0.6 + 0.4 * k);
      }
      cands.push({ col: h.col, key, score, by: 'header' });
    }
    if (negAll) continue;
    // مرشحو المحتوى: الأنواع القوية دائمًا، والضعيفة (تواريخ/مبالغ/أسماء) فقط إذا العنوان فاضي أو عام
    for (const [key, p] of Object.entries(prof)) {
      if (!p.c) continue;
      const f = FIELD_BY_KEY[key];
      const strong = ['email', 'iban', 'national_id_number', 'work_phone_number'].includes(key) || (f && f.type === 'list');
      if (!strong && !generic) continue;
      if (headerHit && !strong) continue;
      cands.push({ col: h.col, key, score: 0.45 + 0.3 * p.c, by: 'content' });
    }
  }
  cands.sort((a, b) => b.score - a.score || a.col - b.col);
  const usedCols = new Set(), mapping = {};
  const colText = (c) => P.cols.find((x) => x.col === c);
  for (const c of cands) {
    if (usedCols.has(c.col)) continue;
    let key = c.key;
    if (key === 'full_name') {
      const sample = columnSample(P, c.col);
      const arShare = scriptShare(sample, HAS_AR);
      const hn = normAr(colText(c.col)?.text || '');
      key = arShare >= 0.5 ? 'full_name_ar' : 'full_name_en';
      if (/(انجليزي|english|\ben\b)/.test(hn) && arShare < 0.5) key = 'full_name_en';
      if (/(عربي|arabic|\bar\b)/.test(hn) && arShare >= 0.3) key = 'full_name_ar';
    }
    if (mapping[key]) continue;
    mapping[key] = { col: c.col, score: c.score, by: c.by };
    usedCols.add(c.col);
  }
  const share = (col, re) => scriptShare(columnSample(P, col), re);
  // تصحيح الخلط بين الإنجليزي والعربي بحسب محتوى العمود
  const fixPair = (en, ar) => {
    const me = mapping[en], ma = mapping[ar];
    if (me && !ma) { if (share(me.col, HAS_AR) >= 0.6) { mapping[ar] = me; delete mapping[en]; } }
    else if (ma && !me) { if (share(ma.col, HAS_LAT) >= 0.6 && share(ma.col, HAS_AR) < 0.3) { mapping[en] = ma; delete mapping[ar]; } }
    else if (me && ma) {
      if (share(me.col, HAS_AR) >= 0.6 && share(ma.col, HAS_LAT) >= 0.6) { mapping[en] = ma; mapping[ar] = me; }
    }
  };
  fixPair('first_name', 'first_name_ar');
  fixPair('last_name', 'last_name_ar');
  fixPair('full_name_en', 'full_name_ar');
  // اسم "كامل" قيمه كلمة وحدة مع وجود عمود عائلة ← هو الاسم الأول
  for (const [full, first, last] of [['full_name_ar', 'first_name_ar', 'last_name_ar'], ['full_name_en', 'first_name', 'last_name']]) {
    const m = mapping[full];
    if (m && mapping[last] && !mapping[first]) {
      const s = columnSample(P, m.col);
      if (s.filter((t) => clean(t).split(' ').length === 1).length >= s.length * 0.7) { mapping[first] = m; delete mapping[full]; }
    }
  }
  // بريد واحد فقط وعنوانه "بريد العمل": الحقل الإلزامي هو البريد
  if (!mapping.email && mapping.work_email) { mapping.email = mapping.work_email; delete mapping.work_email; }
  return { mapping, headers: P.cols, profiles };
}

// يختار الشيت والترويسة ويقرر دمج الشيتات المتشابهة، ثم يطابق
export function analyzeWorkbook(sheets, lists, opts = {}) {
  const visible = sheets.filter((s) => s.rows.length && !s.hidden);
  const pool = visible.length ? visible : sheets.filter((s) => s.rows.length);
  const results = pool.map((s) => {
    const hdr = detectHeader(s.rows);
    const P = prepareSheet(s, hdr);
    const am = autoMap(P, lists);
    const keys = Object.keys(am.mapping);
    return { sheet: s, sheetIdx: sheets.indexOf(s), hdr, P, ...am, keys, score: keys.length + Math.min(P.data.length, 50) / 100 };
  });
  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  if (!best) return null;
  const similar = results.filter((r) => {
    if (r === best || r.P.data.length === 0) return r === best;
    const inter = r.keys.filter((k) => best.keys.includes(k)).length;
    const uni = new Set([...r.keys, ...best.keys]).size;
    return r.keys.length >= Math.max(4, best.keys.length * 0.6) && inter / uni >= 0.6;
  });
  const mergeNames = similar.map((r) => r.sheet.name);
  if (similar.length >= 2 && opts.merge !== false) {
    const ordered = pool.filter((s) => mergeNames.includes(s.name)).map((s) => results.find((r) => r.sheet === s));
    const P = mergePrepared(ordered.map((r) => r.P));
    const am = autoMap(P, lists);
    return { ...am, prepared: P, sheet: P, headerIdx: 0, hdr: best.hdr, sheetIdx: best.sheetIdx, merged: true, mergeNames };
  }
  return { mapping: best.mapping, headers: best.headers, profiles: best.profiles, prepared: best.P, sheet: best.P, hdr: best.hdr, sheetIdx: best.sheetIdx, merged: false, mergeNames };
}
export const MAPPABLE_KEYS = new Set([...FIELDS.map((f) => f.key), 'full_name_ar', 'full_name_en']);

/* ============================ التواريخ ============================ */
const MONTHS = {
  يناير: 1, 'كانون الثاني': 1, jan: 1, january: 1, فبراير: 2, شباط: 2, feb: 2, february: 2,
  مارس: 3, اذار: 3, mar: 3, march: 3, ابريل: 4, نيسان: 4, apr: 4, april: 4,
  مايو: 5, ايار: 5, may: 5, يونيو: 6, حزيران: 6, jun: 6, june: 6, يوليو: 7, تموز: 7, jul: 7, july: 7,
  اغسطس: 8, اب: 8, aug: 8, august: 8, سبتمبر: 9, ايلول: 9, sep: 9, sept: 9, september: 9,
  اكتوبر: 10, 'تشرين الاول': 10, oct: 10, october: 10, نوفمبر: 11, 'تشرين الثاني': 11, nov: 11, november: 11,
  ديسمبر: 12, 'كانون الاول': 12, dec: 12, december: 12,
};
const pad = (n) => String(n).padStart(2, '0');
export function serialToIso(serial) {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function isoToDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const validYMD = (y, m, d) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
let _hf;
function hijriToGregorian(hy, hm, hd) {
  try {
    _hf = _hf || new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const approx = Math.floor(hy * 0.970229 + 621.5674);
    let t = Date.UTC(approx - 1, 0, 1);
    const end = Date.UTC(approx + 2, 0, 1);
    for (; t < end; t += 86400000) {
      const p = Object.fromEntries(_hf.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
      if (parseInt(p.year, 10) === hy && +p.month === hm && +p.day === hd) {
        const d = new Date(t);
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      }
    }
  } catch { /* لا يوجد دعم للتقويم */ }
  return null;
}

// يكتشف اصطلاح اليوم/الشهر لعمود كامل
export function inferDateConvention(values) {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const m = toLatinDigits(v).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (!m) continue;
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  if (dmy && !mdy) return 'dmy';
  if (mdy && !dmy) return 'mdy';
  if (dmy && mdy) return 'mixed';
  return 'unknown';
}

export function parseDate(raw, conv, defaultConv = 'dmy') {
  if (raw && typeof raw === 'object' && raw.d !== undefined) return { iso: serialToIso(raw.d), status: 'ok' };
  if (typeof raw === 'number') {
    if (raw > 20000 && raw < 80000) return { iso: serialToIso(raw), status: 'fixed', msg: 'رقم تسلسلي إكسل حُوّل لتاريخ' };
    if (Number.isInteger(raw) && raw >= 19000101 && raw <= 21001231) raw = String(raw);
    else return { status: 'error', msg: 'تاريخ غير مفهوم' };
  }
  let s = toLatinDigits(clean(raw));
  // حذف الوقت الملحق بالتاريخ ("1990-03-15 00:00:00" أو "...T00:00:00Z")
  s = s.replace(/[T\s]+\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(z|[ap]\.?m\.?|ص|م)?$/i, '');
  s = s.replace(/(\d{4})\s*م$/, '$1');
  s = s.replace(/[٫،,]/g, ' ').replace(/\s*[\/\-.]\s*/g, '/').replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*(هـ|هجري|h|ه)$/i, (m0, g) => (g ? ' H' : ''));
  const hijriFlag = / H$/.test(s);
  s = s.replace(/ H$/, '');
  let y, m, d, how = 'fixed', msg = 'توحيد صيغة التاريخ', ambiguous = false;
  let mt;
  if ((mt = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else if ((mt = s.match(/^(\d{8})$/))) { y = +mt[1].slice(0, 4); m = +mt[1].slice(4, 6); d = +mt[1].slice(6); }
  else if ((mt = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) {
    let a = +mt[1], b = +mt[2]; y = +mt[3];
    if (mt[3].length === 2) { y += y > (new Date().getUTCFullYear() % 100) + 1 ? 1900 : 2000; how = 'review'; msg = 'سنة بخانتين — راجع القرن'; }
    let c = conv;
    if (a > 12 && b <= 12) c = 'dmy';
    else if (b > 12 && a <= 12) c = 'mdy';
    else if (a <= 12 && b <= 12 && a !== b) {
      if (!c || c === 'unknown' || c === 'mixed') { c = defaultConv; ambiguous = true; }
    }
    if (c === 'mdy') { m = a; d = b; } else { d = a; m = b; }
    if (ambiguous) { how = 'review'; msg = `يوم/شهر غير محسوم، افتُرض ${defaultConv === 'dmy' ? 'يوم/شهر' : 'شهر/يوم'}`; }
  } else {
    const t = normAr(s);
    const mm = t.match(/^(\d{1,2}) ([^\d]+) (\d{4}|\d{2})$/) || t.match(/^([^\d]+) (\d{1,2}) (\d{4}|\d{2})$/);
    if (mm) {
      const dayFirst = /^\d/.test(mm[1]);
      const mon = MONTHS[(dayFirst ? mm[2] : mm[1]).trim()];
      if (mon) {
        d = +(dayFirst ? mm[1] : mm[2]); m = mon; y = +mm[3];
        if (mm[3].length === 2) { y += y > (new Date().getUTCFullYear() % 100) + 1 ? 1900 : 2000; how = 'review'; msg = 'سنة بخانتين — راجع القرن'; }
      }
    }
  }
  if (y === undefined) return { status: 'error', msg: `تاريخ غير مفهوم: "${clean(raw)}"` };
  if (hijriFlag || (y >= 1300 && y <= 1500)) {
    const g = hijriToGregorian(y, m, d);
    // التحويل بتقويم أم القرى دقيق، فيُعلَّم "مُصحَّح" لا "للمراجعة"
    if (g) return { iso: g, status: 'fixed', msg: `تاريخ هجري (${y}/${m}/${d}هـ) حُوّل لميلادي بتقويم أم القرى` };
    return { status: 'error', msg: 'تاريخ هجري تعذّر تحويله' };
  }
  if (!validYMD(y, m, d)) return { status: 'error', msg: `تاريخ غير صالح: "${clean(raw)}"` };
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  if (iso === clean(raw)) return { iso, status: 'ok' };
  return { iso, status: how, msg };
}

/* ============================ الهاتف / البريد / آيبان / رقم ============================ */
export function cleanPhone(raw, { addCC }) {
  const full = toLatinDigits(clean(typeof raw === 'number' ? String(raw) : raw));
  const parts = full.split(/\s*[\/,;|،]\s*|\s+-\s+|\s+و\s+/).filter((p) => digitsOf(p).length >= 7);
  const multi = parts.length > 1;
  let s = (parts[0] || full).replace(/^[^\d+]+/, '');
  const orig = full;
  s = s.replace(/[()\-.\s\/]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (addCC) {
    if (/^0[1-9]\d{8}$/.test(s)) s = '+966' + s.slice(1); // جوال 05… أو هاتف ثابت 01…
    else if (/^5\d{8}$/.test(s)) s = '+966' + s;
    else if (/^966[1-9]\d{8}$/.test(s)) s = '+' + s;
  }
  if (!/^\+?\d{7,15}$/.test(s)) return { status: 'error', msg: `رقم هاتف غير صالح: "${orig}"` };
  // جوال سعودي بطول خاطئ: قيود يرفضه ("Work phone number is invalid")
  if (/^(05|5|9665|\+9665)/.test(s) && !/^(05\d{8}|5\d{8}|9665\d{8}|\+9665\d{8})$/.test(s)) {
    return { value: s, status: 'error', msg: `رقم جوال سعودي ناقص أو زائد (${s.replace(/^\+?966/, '0').length} خانات بدل 10): "${orig}"` };
  }
  // مع خيار +966: قيود يحتاج الرقم الدولي الكامل
  if (addCC && !/^\+\d{9,15}$/.test(s)) return { value: s, status: 'error', msg: `رقم غير مكتمل لقيود (المطلوب رقم دولي مثل +9665XXXXXXXX): "${orig}"` };
  let status = s === orig ? 'ok' : 'fixed', msg = status === 'fixed' ? 'إزالة الفواصل/توحيد الأرقام' : undefined;
  if (multi) msg = `الخلية فيها ${parts.length} أرقام، أُخذ الأول`;
  if (typeof raw === 'number' && /^5\d{8}$/.test(s)) { status = 'review'; msg = 'الرقم يبدو ناقصًا الصفر الأول (جوال سعودي من 9 خانات)'; }
  else if (/^(05|\+9665|9665)/.test(s)) {
    const okLen = /^05\d{8}$/.test(s) || /^\+9665\d{8}$/.test(s) || /^9665\d{8}$/.test(s);
    if (!okLen) { status = 'review'; msg = 'جوال سعودي بطول غير معتاد'; }
  }
  return { value: s, status, msg };
}
export function cleanEmail(raw) {
  const orig = clean(raw);
  const all = orig.toLowerCase().replace(/mailto:/g, ' ').replace(/[<>()"']/g, ' ').split(/[\s;,/|]+/).filter((x) => x.includes('@'));
  const s = (all[0] || orig.toLowerCase()).replace(/\.+$/, '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return { status: 'error', msg: `بريد غير صالح: "${orig}"` };
  if (s === orig) return { value: s, status: 'ok' };
  return { value: s, status: 'fixed', msg: all.length > 1 ? `الخلية فيها ${all.length} عناوين، أُخذ الأول` : 'توحيد البريد (أحرف صغيرة/حذف الزوائد)' };
}
export function ibanValid(iban) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const r = iban.slice(4) + iban.slice(0, 4);
  const num = r.replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
  let rem = 0;
  for (const ch of num) rem = (rem * 10 + +ch) % 97;
  return rem === 1;
}
export function cleanIban(raw) {
  const orig = clean(raw);
  const s = ibanOf(orig);
  if (!/^[A-Z0-9]+$/.test(s) || !s) return { status: 'error', msg: 'الآيبان يحوي رموزًا غير صالحة' };
  const changed = s !== orig;
  if (s.startsWith('SA') && s.length !== 24) return { value: s, status: 'review', msg: `الآيبان السعودي 24 خانة وهذا ${s.length}` };
  if (!ibanValid(s)) return { value: s, status: 'review', msg: 'فشل فحص صحة الآيبان (mod 97)' };
  return { value: s, status: changed ? 'fixed' : 'ok', msg: changed ? 'إزالة المسافات/الزوائد/أحرف كبيرة' : undefined };
}
export function saudiIdChecksum(id) {
  if (!/^\d{10}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let n = +id[i];
    if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}
export function cleanId(raw) {
  let s = typeof raw === 'number' ? String(Math.round(raw)) : clean(raw);
  s = toLatinDigits(s);
  const orig = s;
  s = s.replace(/^['`’]/, '').replace(/[\s\-.]/g, '');
  if (!/^\d+$/.test(s)) {
    // نحدد الحرف ومكانه: حرف O يشبه الصفر بأغلب الخطوط فما ينشاف بالعين
    const what = (ch) => (/[Oo]/.test(ch) ? 'حرف O إنجليزي بدل صفر' : /[lIi|]/.test(ch) ? 'حرف إنجليزي بدل 1' : /[A-Za-z]/.test(ch) ? 'حرف إنجليزي' : HAS_AR.test(ch) ? 'حرف عربي' : 'رمز');
    const bad = [...s].map((ch, i) => ({ ch, i })).filter((x) => !/\d/.test(x.ch));
    const parts = bad.slice(0, 3).map((x) => `الخانة ${x.i + 1} "${x.ch}" (${what(x.ch)})`);
    if (bad.length > 3) parts.push(`+${bad.length - 3}`);
    return { status: 'error', msg: `رقم الهوية فيه حرف بدل رقم: ${parts.join('، ')} — قيود يقبل أرقام فقط` };
  }
  const changed = s !== orig;
  return { value: s, status: changed ? 'fixed' : 'ok', msg: changed ? 'إزالة المسافات/الرموز' : undefined };
}
export function cleanAmount(raw) {
  if (typeof raw === 'number') return raw > 0 ? { value: raw, status: 'ok' } : { status: 'error', msg: 'المبلغ يجب أن يكون أكبر من صفر' };
  const orig = clean(raw);
  let s = toLatinDigits(orig).replace(/[٬,]/g, '').replace(/٫/g, '.');
  s = s.replace(/(ريال|سعودي|ر\.?\s?س|sar|sr|riyals?|\$|usd)/gi, '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return { status: 'error', msg: `مبلغ غير مفهوم: "${orig}"` };
  const v = +s;
  if (v <= 0) return { status: 'error', msg: 'المبلغ يجب أن يكون أكبر من صفر' };
  if (String(v) === orig) return { value: v, status: 'ok' };
  return { value: v, status: 'fixed', msg: 'تنظيف المبلغ (إزالة الفواصل/العملة)' };
}

/* ============================ حلّ قيم القوائم ============================ */
export function makeResolver(fieldKey, list) {
  const byKey = new Map();
  for (const v of list) byKey.set(normKey(v), v);
  const aliasMap = new Map(); // aliasKey → {value, approx}
  const spec = VALUE_ALIASES[fieldKey] || {};
  // القيمة المعتمدة قد تُكتب بقالب الشركة بتهجئة مختلفة (بنغلاديش/بنغلادش): نأخذ الأقرب إذا كان واضحًا
  const keys = [...byKey.keys()];
  const findTarget = (canon) => {
    const k = normKey(canon);
    if (byKey.has(k)) return byKey.get(k);
    const sc = keys.map((x) => ({ x, s: similarity(k, x) })).sort((a, b) => b.s - a.s);
    if (sc[0] && sc[0].s >= 0.8 && (!sc[1] || sc[0].s - sc[1].s > 0.1)) return byKey.get(sc[0].x);
    return null;
  };
  for (const [canon, aliases] of Object.entries(spec)) {
    const target = findTarget(canon);
    if (!target) continue;
    aliasMap.set(normKey(canon), { value: target, approx: false });
    for (const a of aliases) {
      const approx = a.startsWith('~');
      aliasMap.set(normKey(approx ? a.slice(1) : a), { value: target, approx });
    }
  }
  const entries = [...byKey.entries()];
  const translate = VALUE_TRANSLATE[fieldKey] ? new Map(Object.entries(VALUE_TRANSLATE[fieldKey]).map(([k, v]) => [normKey(k), v])) : null;
  const noise = new Set((VALUE_NOISE[fieldKey] || []).map((w) => normKey(w)));
  const isCountry = fieldKey === 'nationality' || fieldKey === 'residence_country';

  // نفس القيمة بدون مسافات ("متميز خريطة" = "متميزخريطة")
  const byTight = new Map();
  for (const [kk, v] of byKey) { const t = kk.replace(/ /g, ''); byTight.set(t, byTight.has(t) && byTight.get(t) !== v ? null : v); }
  function direct(k, s) {
    if (byKey.has(k)) { const value = byKey.get(k); return { value, how: value === s ? 'exact' : 'norm' }; }
    const tight = byTight.get(k.replace(/ /g, ''));
    if (tight) return { value: tight, how: 'norm' };
    if (aliasMap.has(k)) { const a = aliasMap.get(k); return { value: a.value, how: a.approx ? 'approx' : 'alias' }; }
    return null;
  }
  const entryTok = entries.map(([ek]) => ek.split(' '));
  function contain(k) {
    const kTok = k.split(' ');
    const sub = entries.filter((_, i) => { const eTok = entryTok[i]; return eTok.length > kTok.length && kTok.every((t) => eTok.includes(t)); });
    if (sub.length === 1) return { value: sub[0][1], how: 'approx' };
    const sup = entries.filter((_, i) => { const eTok = entryTok[i]; return kTok.length > eTok.length && eTok.every((t) => kTok.includes(t)); });
    if (sup.length === 1) return { value: sup[0][1], how: 'approx' };
    return null;
  }
  // نفس القيمة تتكرر كثيرًا بالملف: نحفظ نتيجتها
  // quick: لفحص المحتوى فقط — يتوقف قبل المطابقة الضبابية المكلفة (فحص المحتوى لا يعتدّ بها أصلًا)
  const cache = new Map();
  return function resolve(raw, quick = false) {
    const key = (quick ? '' : '') + String(raw ?? '');
    if (cache.has(key)) return cache.get(key);
    const out = resolveOnce(raw, quick);
    if (cache.size < 20000) cache.set(key, out);
    return out;
  };
  function resolveOnce(raw, quick) {
    const s = clean(raw);
    const k = normKey(s);
    if (!k) return null;
    let r = direct(k, s);
    if (r) return r;
    // صيغة المؤنث للجنسية ("أمريكية" ← "أمريكي")
    if (isCountry && /ه$/.test(k)) { r = direct(k.replace(/ه$/, ''), s); if (r) return { ...r, how: r.how === 'exact' ? 'norm' : r.how }; }
    // حذف الكلمات الزائدة ("إدارة المالية" ← "المالية")
    const kn = k.split(' ').filter((w) => !noise.has(w)).join(' ');
    if (kn && kn !== k) { r = direct(kn, s); if (r) return { ...r, how: r.how === 'exact' ? 'norm' : r.how === 'norm' ? 'norm' : r.how }; }
    // ترجمة كلمة بكلمة (Riyadh HQ ← الرياض المقر الرئيسي) ثم مطابقة
    if (translate) {
      const words = (kn || k).split(' ');
      const tr = [];
      let whole = true; // كل الكلمات لها ترجمة بالقاموس
      for (let i = 0; i < words.length; i++) {
        const two = i + 1 < words.length ? translate.get(`${words[i]} ${words[i + 1]}`) : null;
        if (two) { tr.push(two); i++; continue; }
        const one = translate.get(words[i]);
        if (!one) whole = false;
        tr.push(one || words[i]);
      }
      const tk = normKey(tr.join(' '));
      if (tk !== (kn || k)) {
        // ترجمة كاملة من القاموس تطابق قيمة القالب حرفيًا (Factory ← المصنع): تصحيح مؤكد وليس تقريبي
        const exact = whole && direct(tk, tr.join(' '));
        if (exact) return { ...exact, how: 'alias' };
        r = direct(tk, tr.join(' ')) || contain(tk);
        if (!r) { for (const w of tr) { const x = normKey(w); const c = x !== tk && (direct(x, w) || contain(x)); if (c) { r = c; break; } } }
        if (r) return { ...r, how: 'approx' };
      }
    }
    r = contain(kn || k);
    if (r) return r;
    // مطابقة بالكلمات: كل كلمة معروفة تشير لنفس القيمة ("Accounts & Finance" ← المالية)
    const hits = new Set();
    for (const w of (kn || k).split(' ')) { const x = direct(w, w); if (x) hits.add(x.value); }
    if (hits.size === 1) return { value: [...hits][0], how: 'token' };
    if (quick) return { value: null, how: 'none' };
    const scored = entries.map(([ek, ev]) => ({ ev, s: similarity(kn || k, ek) })).sort((a, b) => b.s - a.s);
    if (scored[0] && scored[0].s >= 0.84 && (!scored[1] || scored[0].s - scored[1].s > 0.05)) return { value: scored[0].ev, how: 'fuzzy', score: scored[0].s };
    // آخر محاولة: كلمة مشتركة مع خيار واحد فقط من القائمة ("المقر - الرياض" ← "الرياض خريطة")
    const ws = (kn || k).split(' ').filter((w) => w.length >= 3 && !/^\d+$/.test(w));
    const share = entries.filter(([ek]) => ek.split(' ').some((t) => ws.includes(t)));
    if (share.length === 1) return { value: share[0][1], how: 'token' };
    return { value: null, how: 'none', suggestions: scored.filter((x) => x.s >= 0.5).slice(0, 3).map((x) => x.ev) };
  }
}

/* ============================ تقسيم الاسم الكامل ============================ */
const COMPOUND = new Set(['عبد', 'ابو', 'أبو', 'ام', 'أم', 'بن', 'ابن', 'abdul', 'abd', 'abu', 'bin']);
export function splitName(full, mode = 'rest') {
  const t = clean(full).split(' ').filter(Boolean);
  if (t.length === 0) return ['', ''];
  if (t.length === 1) return [t[0], ''];
  let firstLen = 1;
  if (COMPOUND.has(t[0].toLowerCase()) && t.length > 2) firstLen = 2;
  const first = t.slice(0, firstLen).join(' ');
  const rest = t.slice(firstLen);
  if (!rest.length) return [first, ''];
  return [first, mode === 'last' ? rest[rest.length - 1] : rest.join(' ')];
}
// "محمد العتيبي - Mohammed Alotaibi" ← {ar, en}
export function splitScripts(text) {
  const tok = clean(text).split(/[\s\-–|/,()]+/).filter(Boolean);
  return { ar: tok.filter((t) => HAS_AR.test(t)).join(' '), en: tok.filter((t) => HAS_LAT.test(t) && !HAS_AR.test(t)).join(' ') };
}

/* ============================ بناء السجلات ============================ */
// P: شيت مُجهّز من prepareSheet/mergePrepared ; mapping: {fieldKey: {col}} ; constants: {fieldKey: 'value'}
export function buildRecords(P, mapping, constants = {}, settings = {}) {
  const records = [];
  for (let i = 0; i < P.data.length; i++) {
    const row = P.data[i];
    const vals = {};
    for (const [key, m] of Object.entries(mapping)) {
      if (m == null || m.col === undefined || m.col === null || m.col === '') continue;
      const c = row[m.col];
      if (c === null || c === undefined || c === '') continue;
      vals[key] = c;
    }
    // اسم بلغتين بنفس الخلية، أو اسم بلغة غير متوقعة
    for (const [fk, other, otherFirst, script] of [['full_name_ar', 'full_name_en', 'first_name', HAS_AR], ['full_name_en', 'full_name_ar', 'first_name_ar', HAS_LAT]]) {
      if (vals[fk] === undefined) continue;
      const t = cellText(vals[fk]);
      if (HAS_AR.test(t) && HAS_LAT.test(t)) {
        const sp = splitScripts(t);
        vals[fk] = fk === 'full_name_ar' ? sp.ar : sp.en;
        const o = fk === 'full_name_ar' ? sp.en : sp.ar;
        if (o && vals[other] === undefined && vals[otherFirst] === undefined) vals[other] = o;
      } else if (!script.test(t) && vals[other] === undefined && vals[otherFirst] === undefined) {
        vals[other] = t; delete vals[fk];
      }
    }
    for (const [fk, fkFirst, fkLast] of [['full_name_ar', 'first_name_ar', 'last_name_ar'], ['full_name_en', 'first_name', 'last_name']]) {
      if (vals[fk] !== undefined) {
        const [a, b] = splitName(cellText(vals[fk]), settings.nameSplit || 'rest');
        if (vals[fkFirst] === undefined && a) vals[fkFirst] = a;
        if (vals[fkLast] === undefined && b) vals[fkLast] = b;
        delete vals[fk];
      }
    }
    for (const [k, v] of Object.entries(constants)) if (vals[k] === undefined && v !== '' && v != null) vals[k] = v;
    if (!Object.keys(vals).length) continue;
    records.push({ src: P.src[i], vals });
  }
  return records;
}

/* ============================ المعالجة والتحقق ============================ */
const todayIso = () => new Date().toISOString().slice(0, 10);

export function processRecords(records, ctx) {
  const { lists, required, settings = {}, userMaps = {}, overrides = {}, reviewed = {} } = ctx;
  const resolvers = {};
  for (const k of LIST_FIELDS) resolvers[k] = makeResolver(k, lists[k] || []);
  const hasList = (k) => (lists[k] || []).length > 0;

  // اصطلاح التاريخ لكل عمود
  const dateConv = {};
  for (const f of FIELDS.filter((x) => x.type === 'date')) {
    dateConv[f.key] = inferDateConvention(records.map((r) => r.vals[f.key]));
  }
  const defaultConv = settings.dateOrder || 'dmy';
  const saudiKey = normKey('السعودية');
  const today = todayIso();

  const rows = records.map((rec, idx) => {
    const vals = { ...rec.vals };
    const ovs = overrides[rec.src] || {};
    const note = {};
    // ترجمة حرفية متبادلة للأسماء: عربي ناقص ← من الإنجليزي، إنجليزي ناقص ← من العربي
    if (settings.translit !== false) {
      for (const [ar, en] of [['first_name_ar', 'first_name'], ['last_name_ar', 'last_name']]) {
        const a = clean(cellText(ovs[ar] ?? vals[ar])), e = clean(cellText(ovs[en] ?? vals[en]));
        const aLatin = a && !HAS_AR.test(a) && HAS_LAT.test(a);
        const eArabic = e && HAS_AR.test(e) && !HAS_LAT.test(e);
        const arSrc = aLatin ? a : !a && e && !eArabic ? e : '';
        const enSrc = eArabic ? e : !e && a && !aLatin ? a : '';
        if (ovs[ar] === undefined && arSrc) { const t = transliterate(arSrc); if (t.ar) { vals[ar] = t.ar; note[ar] = { from: arSrc, known: t.known }; } }
        if (ovs[en] === undefined) {
          if (!e && aLatin) { vals[en] = a; note[en] = { moved: true, from: a }; }
          else if (enSrc) { const t = transliterateAr(enSrc); if (t.en) { vals[en] = t.en; note[en] = { from: enSrc, known: t.known }; } }
        }
      }
    }
    // قيم افتراضية يحتاجها قيود (تُعلَّم "مُصحَّح" مع السبب، والتعديل اليدوي يتقدّم عليها)
    const auto = {};
    const has = (k) => { const v = ovs[k] !== undefined ? ovs[k] : vals[k]; return v !== undefined && v !== null && clean(cellText(v)) !== ''; };
    const inList = (k, want) => (lists[k] || []).find((v) => normKey(v) === normKey(want));
    const setAuto = (k, v, msg) => { if (v !== undefined && v !== null && v !== '' && !has(k)) { vals[k] = v; auto[k] = msg; } };
    if (has('salary_basic_salary_amount') && settings.salaryDefaults !== false) {
      // قيود يرفض راتبًا بدون تاريخ بدء ("Start date can't be blank")
      if (has('join_date')) setAuto('salary_start_date', ovs.join_date !== undefined ? ovs.join_date : vals.join_date, 'افتراضي: تاريخ بدء الراتب = تاريخ الانضمام');
      setAuto('salary_pay_frequency', inList('salary_pay_frequency', 'Monthly'), 'افتراضي: الدفع شهري');
      setAuto('salary_basic_salary_kind', inList('salary_basic_salary_kind', 'Fixed'), 'افتراضي: راتب ثابت');
      setAuto('salary_input_time_type', (lists.salary_input_time_type || [])[0], `افتراضي: ${(lists.salary_input_time_type || [])[0] || ''}`);
    }
    // عقد له تاريخ نهاية بدون نوع: قيود يعتبر الفاضي "غير محدد المدة" ويرفض تاريخ النهاية، فنحدده "محدد المدة"
    if (has('contract_end_date')) setAuto('contract_type', inList('contract_type', 'محدد المدة'), 'للعقد تاريخ نهاية ← محدد المدة');

    const cells = {};
    for (const f of FIELDS) {
      const ov = ovs[f.key];
      const raw = ov !== undefined ? ov : vals[f.key];
      cells[f.key] = processCell(f, raw, ov !== undefined);
      if (auto[f.key] && cells[f.key].status !== 'error') {
        const c = cells[f.key];
        c.status = 'fixed'; c.msg = auto[f.key]; c.notes = [{ status: 'fixed', msg: auto[f.key] }]; c.auto = true; c.raw = '';
      }
      const n = note[f.key];
      if (n && cells[f.key].status !== 'error') {
        const c = cells[f.key];
        c.raw = n.from;
        if (n.moved) { c.status = 'fixed'; c.msg = 'نُقل من عمود الاسم العربي لأنه مكتوب بالإنجليزي'; }
        else { c.status = 'review'; c.translit = true; c.msg = `ترجمة حرفية تلقائية من "${n.from}"${n.known ? '' : ' (تهجئة تقديرية)'} — تأكد منها`; }
        c.notes = [{ status: c.status, msg: c.msg }];
      }
    }
    return { id: idx, src: rec.src, cells, excluded: false };
  });

  function processCell(f, raw, manual) {
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && clean(raw) === '');
    const base = { raw: empty ? '' : (typeof raw === 'object' ? cellText(raw) : String(raw)), manual };
    if (empty) {
      if (required.has(f.key)) return { ...base, value: '', status: 'error', msg: 'حقل إلزامي فاضي', notes: [{ status: 'error', msg: 'حقل إلزامي فاضي' }] };
      return { ...base, value: '', status: 'empty', notes: [] };
    }
    let r;
    switch (f.type) {
      case 'date': { const d = parseDate(raw, dateConv[f.key], defaultConv); r = { ...d, value: d.iso }; break; }
      case 'email': r = cleanEmail(raw); break;
      case 'phone': r = cleanPhone(raw, { addCC: settings.addCC }); break;
      case 'iban': r = cleanIban(raw); break;
      case 'id': r = cleanId(raw); break;
      case 'amount': r = cleanAmount(raw); break;
      case 'name_en': {
        const v = clean(raw);
        if (!HAS_LAT.test(v)) r = { value: v, status: 'error', msg: 'الاسم يجب أن يكون بالإنجليزية' };
        else if (HAS_AR.test(v)) r = { value: v, status: 'review', msg: 'خليط عربي/إنجليزي' };
        else r = { value: v, status: v === String(raw) ? 'ok' : 'fixed', msg: v === String(raw) ? undefined : 'تنظيف المسافات' };
        break;
      }
      case 'name_ar': {
        const v = clean(raw);
        if (!HAS_AR.test(v)) r = { value: v, status: 'error', msg: 'الاسم يجب أن يكون بالعربية' };
        else if (HAS_LAT.test(v)) r = { value: v, status: 'review', msg: 'خليط عربي/إنجليزي' };
        else r = { value: v, status: v === String(raw) ? 'ok' : 'fixed', msg: v === String(raw) ? undefined : 'تنظيف المسافات' };
        break;
      }
      case 'list': {
        const s = clean(typeof raw === 'object' ? cellText(raw) : raw);
        if (!hasList(f.key)) { r = { value: s, status: 'ok' }; break; }
        const um = userMaps[f.key]?.[normKey(s)];
        if (um) { r = { value: um, status: 'fixed', msg: `مطابقة يدوية: "${s}"` }; break; }
        const res = resolvers[f.key](s);
        if (!res || res.how === 'none') r = { value: s, status: 'error', msg: `"${s}" غير موجود بقائمة القالب`, suggestions: res?.suggestions };
        else if (res.how === 'exact') r = { value: res.value, status: 'ok' };
        else if (res.how === 'norm') r = { value: res.value, status: 'fixed', msg: `توحيد الكتابة: "${s}"` };
        else if (res.how === 'alias') r = { value: res.value, status: 'fixed', msg: `"${s}" ← ${res.value}` };
        else r = { value: res.value, status: 'review', msg: `مطابقة تقريبية: "${s}" ← ${res.value}`, approx: true };
        break;
      }
      default: { // text, code
        const v = typeof raw === 'number' ? String(raw) : clean(raw);
        r = { value: v, status: v === String(raw) ? 'ok' : 'fixed', msg: v === String(raw) ? undefined : 'تنظيف المسافات' };
      }
    }
    return { ...base, ...r, value: r.value ?? '', notes: r.msg ? [{ status: r.status, msg: r.msg }] : [] };
  }

  // ---------- فحوص على مستوى الصف ----------
  // كل خانة: notes = قائمة ملاحظات منفصلة {status, msg, ref?}، وmsg = نصها المجمّع (للتقارير)
  const setIssue = (row, key, status, msg, ref) => {
    const c = row.cells[key];
    const rank = { ok: 0, empty: 0, fixed: 1, review: 2, error: 3 };
    if (!c.notes) c.notes = c.msg ? [{ status: c.status, msg: c.msg }] : [];
    c.notes.push({ status, msg, ...(ref !== undefined && { ref }) });
    if (rank[status] > rank[c.status]) c.status = status;
    c.msg = c.notes.map((n) => n.msg).join(' • ');
  };
  const seen = { national_id_number: new Map(), email: new Map(), employee_no: new Map() };
  const nameOf = (row) => `${row.cells.first_name_ar.value || row.cells.first_name.value || ''} ${row.cells.last_name_ar.value || row.cells.last_name.value || ''}`.trim();
  for (const row of rows) {
    const c = row.cells;
    const v = (k) => c[k].value;
    const ok = (k) => c[k].value && c[k].status !== 'error';
    const nat = v('nationality'), isSaudi = normKey(nat) === saudiKey;
    // الهوية
    if (ok('national_id_number')) {
      const id = v('national_id_number');
      if (id.length !== 10) setIssue(row, 'national_id_number', 'review', `طول الرقم ${id.length} (الهوية/الإقامة 10 خانات)`);
      else {
        if (!['1', '2'].includes(id[0])) setIssue(row, 'national_id_number', 'review', 'يبدأ بـ 1 للسعودي أو 2 للمقيم عادةً');
        else if (nat && isSaudi && id[0] !== '1') setIssue(row, 'national_id_number', 'review', 'جنسية سعودية لكن الرقم يبدأ بـ 2');
        else if (nat && !isSaudi && id[0] === '1') setIssue(row, 'national_id_number', 'review', 'غير سعودي لكن الرقم يبدأ بـ 1');
        if (!saudiIdChecksum(id)) setIssue(row, 'national_id_number', 'review', 'فشل فحص خانة التحقق للهوية');
      }
    }
    // تكرارات
    for (const k of Object.keys(seen)) {
      if (!ok(k)) continue;
      const key = k === 'email' ? v(k).toLowerCase() : v(k);
      if (seen[k].has(key)) {
        const other = seen[k].get(key);
        setIssue(row, k, 'error', `نفس القيمة موجودة عند موظف آخر: الصف ${other.src}${other.name ? ` (${other.name})` : ''} — قيود لا يقبل التكرار، صحّح القيمة عند أحدهما`, other.src);
      } else seen[k].set(key, { src: row.src, name: nameOf(row) });
    }
    // التواريخ
    const D = (k) => (ok(k) && /^\d{4}-\d{2}-\d{2}$/.test(v(k)) ? v(k) : null);
    const dob = D('date_of_birth'), iss = D('national_id_issued_date'), exp = D('national_id_expiry_date');
    const join = D('join_date'), cend = D('contract_end_date'), sstart = D('salary_start_date');
    if (dob) {
      const age = (new Date(today) - new Date(dob)) / 31557600000;
      if (dob > today) setIssue(row, 'date_of_birth', 'error', 'تاريخ ميلاد مستقبلي');
      else if (age < 15 || age > 80) setIssue(row, 'date_of_birth', 'review', `عمر غير معتاد (${Math.floor(age)} سنة)`);
    }
    if (iss && exp && exp <= iss) setIssue(row, 'national_id_expiry_date', 'error', 'تاريخ الانتهاء قبل أو يساوي الإصدار');
    else if (exp && exp < today) setIssue(row, 'national_id_expiry_date', 'review', 'الهوية منتهية');
    if (iss && iss > today) setIssue(row, 'national_id_issued_date', 'review', 'تاريخ إصدار مستقبلي');
    if (join && join > new Date(Date.now() + 366 * 864e5).toISOString().slice(0, 10)) setIssue(row, 'join_date', 'review', 'تاريخ انضمام بعيد بالمستقبل');
    if (join && dob && join < dob) setIssue(row, 'join_date', 'error', 'الانضمام قبل الميلاد');
    else if (join && dob && (new Date(join) - new Date(dob)) / 31557600000 < 15) setIssue(row, 'join_date', 'review', 'عمر الموظف عند الانضمام أقل من 15 سنة');
    if (join && cend && cend <= join) setIssue(row, 'contract_end_date', 'error', 'نهاية العقد قبل الانضمام');
    else if (cend && cend < today) setIssue(row, 'contract_end_date', 'review', 'العقد منتهي — تأكد من التجديد');
    // العقد لغير السعوديين
    if (nat && !isSaudi && !c.contract_end_date.value) setIssue(row, 'contract_end_date', 'error', 'مطلوب لغير السعوديين حسب القالب');
    if (v('contract_type') && normKey(v('contract_type')) === normKey('محدد المدة') && !c.contract_end_date.value && isSaudi) setIssue(row, 'contract_end_date', 'review', 'عقد محدد المدة بدون تاريخ نهاية');
    // شرط قيود: العقد غير محدد المدة لا يقبل تاريخ نهاية
    if (v('contract_type') && normKey(v('contract_type')) === normKey('غير محدد المدة') && c.contract_end_date.value) {
      setIssue(row, 'contract_end_date', 'error', 'يجب أن يكون فارغًا لأن العقد "غير محدد المدة" (شرط قيود): احذف التاريخ أو غيّر نوع العقد');
    }
    if (c.contract_type.auto && isSaudi) setIssue(row, 'contract_type', 'review', 'موظف سعودي بعقد "محدد المدة" لأن له تاريخ نهاية — تأكد، أو احذف تاريخ النهاية ليصير غير محدد المدة');
    // الراتب
    const SAL = ['salary_start_date', 'salary_pay_frequency', 'salary_basic_salary_kind', 'salary_input_time_type'];
    if (c.salary_basic_salary_amount.value) {
      const miss = SAL.filter((k) => !c[k].value).map((k) => FIELD_BY_KEY[k].label);
      if (miss.length) setIssue(row, 'salary_basic_salary_amount', 'review', `ناقص مع الراتب: ${miss.join('، ')} (اضبط قيمًا ثابتة بخطوة المطابقة)`);
    } else if (SAL.some((k) => c[k].value)) {
      setIssue(row, 'salary_basic_salary_amount', 'review', 'بيانات راتب بدون مبلغ');
    }
    if (sstart && join && sstart < join) setIssue(row, 'salary_start_date', 'review', 'بدء الراتب قبل الانضمام');
    if (ok('email') && ok('work_email') && v('email') === v('work_email')) { /* مسموح */ }

    // "تمت المراجعة": الخانة الصفراء اللي راجعها المستخدم تصير سليمة (طالما القيمة نفسها ما تغيّرت)
    for (const [k, cell] of Object.entries(c)) {
      if (cell.status === 'review' && reviewed[row.src]?.[k] !== undefined && reviewed[row.src][k] === String(cell.value ?? '')) {
        cell.status = 'ok'; cell.acked = true;
      }
    }
    // حالة الصف
    const sts = Object.values(c).map((x) => x.status);
    row.status = sts.includes('error') ? 'error' : sts.includes('review') ? 'review' : 'ok';
    row.errorCount = sts.filter((s) => s === 'error').length;
    row.reviewCount = sts.filter((s) => s === 'review').length;
    row.fixedCount = sts.filter((s) => s === 'fixed').length;
  }
  return rows;
}

// قيم القوائم غير المطابقة، مجمّعة، لمعالج المطابقة اليدوية
export function unmatchedValues(rows) {
  const out = {};
  for (const r of rows) {
    for (const f of FIELDS) {
      if (f.type !== 'list') continue;
      const c = r.cells[f.key];
      if (c.status === 'error' && c.raw && /غير موجود بقائمة/.test(c.msg || '')) {
        const o = (out[f.key] = out[f.key] || new Map());
        const e = o.get(normKey(c.raw)) || { raw: c.raw, count: 0, suggestions: c.suggestions || [] };
        e.count++;
        o.set(normKey(c.raw), e);
      }
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, m]) => [k, [...m.entries()].map(([nk, e]) => ({ nk, ...e }))]));
}
// قراءة ملف الاستكمال بعد ما يعبيه العميل ← تعديلات (overrides) على الصفوف الحالية
// يُرجع { overrides: {src: {field: raw}}, changed, rowsMatched, unknownRows } أو null إذا الملف ليس ملف استكمال
export function parseFollowup(sheets, rows) {
  const bySrc = new Map(rows.map((r) => [String(r.src), r]));
  for (const s of sheets) {
    const ki = s.rows.slice(0, 6).findIndex((r) => r.some((c) => c === '__src'));
    if (ki < 0) continue;
    const keys = s.rows[ki].map((c) => (typeof c === 'string' ? c : null));
    const srcCol = keys.indexOf('__src');
    const out = {}; let changed = 0; const matched = new Set(); const unknownRows = [];
    for (let i = ki + 1; i < s.rows.length; i++) {
      const row = s.rows[i];
      const sk = cellText(row[srcCol]).trim();
      if (!sk) continue;
      const r = bySrc.get(sk);
      if (!r) { unknownRows.push(sk); continue; }
      matched.add(sk);
      keys.forEach((k, c) => {
        if (!k || !FIELD_BY_KEY[k]) return;
        const v = row[c];
        if (v === null || v === undefined || v === '') return;
        const cur = r.cells[k];
        const now = clean(cellText(v)), was = clean(String(cur.value ?? ''));
        if (now === was || (FIELD_BY_KEY[k].type === 'amount' && Number(now) === Number(was))) return;
        (out[r.src] = out[r.src] || {})[k] = typeof v === 'number' && FIELD_BY_KEY[k].type !== 'amount' && FIELD_BY_KEY[k].type !== 'date' ? String(v) : v;
        changed++;
      });
    }
    return { overrides: out, changed, rowsMatched: matched.size, unknownRows };
  }
  return null;
}

// المطابقات التقريبية مجمّعة (لاعتمادها أو تغييرها دفعة واحدة)
export function approxValues(rows) {
  const out = {};
  for (const r of rows) {
    for (const f of FIELDS) {
      if (f.type !== 'list') continue;
      const c = r.cells[f.key];
      if (!c.approx || c.manual) continue;
      const o = (out[f.key] = out[f.key] || new Map());
      const nk = normKey(c.raw);
      const e = o.get(nk) || { raw: c.raw, value: c.value, count: 0 };
      e.count++;
      o.set(nk, e);
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, m]) => [k, [...m.entries()].map(([nk, e]) => ({ nk, ...e }))]));
}
