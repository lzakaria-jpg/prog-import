/* تحليل محتوى/شكل الأعمدة في الملفات المرجعية — نسخ حرفي من qoyod_validator_core.js
   (أسطر 660-746). تبديل معماري وحيد: bestTemplateLocationFor/detectStockFormat كانتا
   تقرآن state.template.dropdowns.G مباشرة؛ هنا تُمرَّر templateLocations كوسيط،
   وجسم كل دالة حرفي بلا أي تغيير آخر. */

import { norm, normKey } from './text.js';
import { tokenize } from './columnMatching.js';
import { parseDateParts, formatDateParts } from './dates.js';

export const TOTAL_COL_RE = /^(المجموع|الإجمالي|الاجمالي|total|sum|grand\s*total)$/i;

// يحاول تحويل قيمة تاريخ بأي شكل شائع (رقم تسلسلي من إكسل، yyyy-mm-dd، dd-mm-yyyy...) إلى تنسيق قيود DD/MM/YYYY.
// إن لم يتم التعرف على الشكل تُعاد القيمة كما هي، وسيُكتشف الخطأ لاحقًا تلقائيًا في خطوة التحقق.
export function normalizeDateToDMY(raw){
  const s = norm(raw);
  if(!s) return '';
  const p = parseDateParts(s);
  return p ? formatDateParts(p) : s;
}
// نسبة القيم التي يمكن قراءتها كتاريخ داخل عمود — تُستخدم للتعرف على عمود التاريخ من محتواه لا من اسمه.
export function dateLikeRatio(values){
  const sample = values.map(v=>norm(v)).filter(v=>v!=='').slice(0,25);
  if(!sample.length) return 0;
  return sample.filter(v=>parseDateParts(v)!==null).length / sample.length;
}

// يحلل عينة من قيم عمود لتحديد "شكلها" (نسبة صغيرة أقل من 1، مبلغ مالي، نص بنسبة%...) — يُستخدم لتمييز
// حقول متشابهة الاسم (مثل نسبة الخصم/قيمة الخصم) بالاعتماد على محتوى القيم نفسها لا اسم العمود فقط.
export function analyzeColumnShape(values){
  const sample = values.map(v=>norm(v)).filter(v=>v!=='').slice(0,25);
  if(sample.length===0) return {count:0};
  let numericCount=0, percentSuffixCount=0, fractionLikeCount=0, moneyLikeCount=0;
  sample.forEach(v=>{
    const isPercentSuffix = /%$/.test(v);
    const numPart = v.replace('%','').replace(',','.').trim();
    const num = parseFloat(numPart);
    if(!isNaN(num) && /^-?\d+(\.\d+)?$/.test(numPart)){
      numericCount++;
      if(isPercentSuffix) percentSuffixCount++;
      else if(Math.abs(num) > 0 && Math.abs(num) < 1) fractionLikeCount++;
      else if(Math.abs(num) >= 1) moneyLikeCount++;
    }
  });
  return {
    count: sample.length,
    numericRatio: numericCount/sample.length,
    percentSuffixRatio: percentSuffixCount/sample.length,
    fractionLikeRatio: fractionLikeCount/sample.length,
    moneyLikeRatio: moneyLikeCount/sample.length,
  };
}

export function columnValues(headers, rows, header, limit){
  const idx = headers.indexOf(header);
  if(idx<0) return [];
  return rows.slice(0, limit||60).map(r=>r[idx]);
}
export function sampleValuesFor(headers, rows, header, n){
  const idx = headers.indexOf(header);
  if(idx<0) return [];
  const out = [];
  for(const r of rows){ const v = norm(r[idx]); if(v!==''){ out.push(v); if(out.length>=(n||3)) break; } }
  return out;
}
export function columnStats(headers, rows, header){
  const vals = columnValues(headers, rows, header).map(v=>norm(v)).filter(v=>v!=='');
  if(!vals.length) return {count:0, distinct:0, maxLen:0, numericRatio:0, uniqueRatio:0};
  const distinct = new Set(vals.map(v=>v.toLowerCase())).size;
  const numeric = vals.filter(v=>/^-?[\d,]+(\.\d+)?$/.test(v.replace(/\s/g,''))).length;
  return {
    count: vals.length,
    distinct,
    maxLen: Math.max(...vals.map(v=>v.length)),
    numericRatio: numeric/vals.length,
    uniqueRatio: distinct/vals.length,
  };
}
// يصحّح تخمين الأعمدة بالاعتماد على شكل القيم داخلها عندما يفشل التخمين بالاسم أو يعطي عمودًا غير منطقي.
// ملاحظة: تُعدِّل الوسيط guesses بالإشارة المباشرة (كما في الأصل) وتعيده أيضًا — لا تعتمد على أي state عام.
export function refineReferenceGuesses(kind, headers, rows, guesses){
  const used = new Set(Object.values(guesses).filter(Boolean));
  const stats = {};
  headers.forEach(h=>{ stats[h] = columnStats(headers, rows, h); });
  function pick(field, test){
    const cur = guesses[field];
    if(cur && stats[cur] && test(stats[cur])) return;      // التخمين الحالي منطقي — لا نغيّره
    const cand = headers.find(h=>!used.has(h) && stats[h] && test(stats[h]));
    if(cand){ if(cur) used.delete(cur); guesses[field] = cand; used.add(cand); }
  }
  const isFlagCol = s => s.count>0 && s.distinct<=4 && s.maxLen<=18 && s.numericRatio<0.5;
  // عمود حالة البيع تحديدًا: نفضّل أولًا عمودًا يشير اسمه للبيع وقيمه نعم/لا، قبل أي عمود ثنائي القيم آخر
  function pickSellableByName(field, re){
    if(guesses[field]) return;
    const cand = headers.find(h=>!used.has(h) && re.test(normKey(h)) && isFlagCol(stats[h]||{count:0}));
    if(cand){ guesses[field]=cand; used.add(cand); }
  }
  if(kind==='products'){
    pickSellableByName('sellable', /يباع|بيع|sale|sell/);
    pickSellableByName('stocked', /مخزن|مخزون|يخزن|تتبع|stock|inventory|نوعالمنتج|producttype/);
  }
  if(kind==='customers') pickSellableByName('status', /حاله|حالة|status|نشط|active/);
  const isCodeCol = s => s.count>0 && s.uniqueRatio>=0.85 && s.maxLen<=40;
  const isNameCol = s => s.count>0 && s.numericRatio<0.3 && s.uniqueRatio>=0.6 && s.maxLen>=3;
  if(kind==='products'){ pick('sellable', isFlagCol); pick('sku', isCodeCol); pick('name', isNameCol); }
  if(kind==='customers'){ pick('status', isFlagCol); pick('ref', isCodeCol); pick('name', isNameCol); }
  if(kind==='stock'){ pick('sku', isCodeCol); pick('qty', s=>s.count>0 && s.numericRatio>=0.7); }
  return guesses;
}

// تقرير مواقع المنتجات في قيود يُصدَّر بصيغة "عريضة": صف لكل منتج، وعمود مستقل لكل موقع تحته الكمية.
// نكتشف هذه الصيغة تلقائيًا ونحوّلها داخليًا إلى ثلاثيات (منتج، موقع، كمية).
// templateLocations: مصفوفة مواقع القالب (كانت تُقرأ من state.template.dropdowns.G في الأصل).
export function bestTemplateLocationFor(header, templateLocations){
  const locs = templateLocations || [];
  if(!locs.length) return '';
  const nk = normKey(header);
  let exact = locs.find(l=>normKey(l)===nk);
  if(exact) return exact;
  let partial = locs.find(l=>normKey(l).includes(nk) || nk.includes(normKey(l)));
  if(partial) return partial;
  const hTokens = tokenize(header);
  let best='', bestScore=0;
  locs.forEach(l=>{
    const lTokens = tokenize(l);
    const shared = lTokens.filter(t=>hTokens.includes(t)).length;
    const score = shared / Math.max(1, Math.min(lTokens.length, hTokens.length));
    if(shared>0 && score>bestScore){ bestScore=score; best=l; }
  });
  return bestScore>=0.5 ? best : '';
}
export function detectStockFormat(headers, rows, templateLocations){
  const locMatches = headers.filter(h=>!TOTAL_COL_RE.test(norm(h)) && bestTemplateLocationFor(h, templateLocations));
  if(locMatches.length>=1) return 'wide';
  const hasLocKw = headers.some(h=>/موقع|فرع|location|branch|مستودع|warehouse/i.test(norm(h)));
  const hasQtyKw = headers.some(h=>/كمية|qty|quantity|متوفر|available|رصيد/i.test(norm(h)));
  if(hasLocKw && hasQtyKw) return 'long';
  const numericCols = headers.filter(h=>!TOTAL_COL_RE.test(norm(h)) && columnStats(headers, rows, h).numericRatio>=0.7);
  return numericCols.length>=2 ? 'wide' : 'long';
}
