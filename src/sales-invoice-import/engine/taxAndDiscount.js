/* تطبيع نعم/لا والنسب الضريبية، ومطابقة الفئة الضريبية — نسخ حرفي من qoyod_validator_core.js
   (أسطر 995-1050). دالتان إضافيتان (deriveTaxInclusive/deriveTaxRate) مُستخرَجتان حرفيًا
   من applyInvoiceImportMapping (انظر invoiceImportMapping.js) ليصبحا قابلتين للاختبار مستقلاً. */

import { norm, isBlank } from './text.js';

// يوحّد قيمة عمود "شامل الضريبة؟" إلى نعم/لا فقط، ويقبل الصيغ الشائعة (Yes/No, True/False, 1/0...).
// يعيد null إن تعذّر التعرف على القيمة (تُترك كما هي ليكتشفها التحقق لاحقًا كخطأ صيغة).
export function normalizeYesNo(raw){
  const v = norm(raw).toLowerCase();
  if(v==='') return null;
  if(['نعم','yes','y','true','1'].includes(v)) return 'نعم';
  if(['لا','no','n','false','0'].includes(v)) return 'لا';
  if(v.includes('غير') || /^لا\b/.test(v)) return 'لا';
  return null;
}

// يحوّل قيمة نسبة ضريبة/خصم بأي صيغة (كسر عشري 0.15، رقم صحيح 15، أو نص جاهز "15%") إلى صيغة نصية "15%"
// لمطابقة قوائم القالب المنسدلة. النصوص العربية البحتة (مثل "معفى") تُترك كما هي.
export function normalizePercentValue(raw){
  const v = norm(raw);
  if(v==='') return v;
  if(/%$/.test(v)) return v;
  if(/^[؀-ۿ\s]+$/.test(v)) return v;
  const num = parseFloat(v.replace(',','.'));
  if(isNaN(num)) return v;
  if(Math.abs(num) > 0 && Math.abs(num) < 1) return `${Math.round(num*10000)/100}%`;
  return `${num}%`;
}

// "نسبة الخصم" (T) حقل رقمي عادي بمقياس 0-100 (وليس نصًا بعلامة % مثل V) — نحوّل الكسور العشرية <1 (0.10) إلى 10.
export function normalizeDiscountPercentNumber(raw){
  const v = norm(raw);
  if(v==='') return v;
  const numPart = v.replace('%','').replace(',','.').trim();
  const num = parseFloat(numPart);
  if(isNaN(num)) return v;
  if(Math.abs(num) > 0 && Math.abs(num) < 1) return String(Math.round(num*10000)/100);
  return String(num);
}

// يستخرج النسبة الرقمية (كسر عشري) من نص قيمة ضريبة كما تظهر في قوائم القالب المنسدلة (مثل "15%" أو "معفى").
export function parseRateFromDropdownLabel(label){
  const v = norm(label);
  if(/معفى|exempt/i.test(v)) return 0;
  const m = /(-?\d+(\.\d+)?)\s*%/.exec(v);
  if(m) return parseFloat(m[1])/100;
  const num = parseFloat(v);
  return isNaN(num) ? null : num;
}
// يطابق نسبة ضريبة محسوبة (استنتاجًا من الأسعار) مع أقرب قيمة موجودة فعليًا في قوائم القالب، بفارق تسامح بسيط.
export function matchNearestTaxRate(rate, dropdownValues){
  if(!dropdownValues || !dropdownValues.length || rate==null || isNaN(rate)) return null;
  let best=null, bestDiff=Infinity;
  dropdownValues.forEach(dv=>{
    const r = parseRateFromDropdownLabel(dv);
    if(r===null) return;
    const diff = Math.abs(r-rate);
    if(diff<bestDiff){ bestDiff=diff; best=dv; }
  });
  return (best!==null && bestDiff<=0.02) ? best : null;
}

// يحوّل أي قيمة ضريبة (0.15 أو "15%") إلى اسم الفئة الضريبية كما هو مُعرَّف في القالب فعليًا
// (مثل "ضريبة القيمة المضافة 15%")، لأن قيود لا يقبل إلا القيم الموجودة في قائمة القالب.
// نسخ حرفي من qoyod_validator_core.js (أسطر 1241-1255). تبديل معماري: taxList تُمرَّر كوسيط
// بدل قراءتها من state.template.dropdowns.V العام (loaded يُستنتَج من وجود القائمة نفسها).
export function snapTaxCategory(value, taxList){
  const v = norm(value);
  if(v==='') return v;
  const list = taxList || [];
  if(!list.length || list.includes(v)) return v;
  const rate = parseRateFromDropdownLabel(v);
  if(rate===null) return v;
  return matchNearestTaxRate(rate, list) || v;
}
export function snapTaxCategoriesInRows(rows, taxList){
  return rows.map(r=>{
    const next = {...r};
    if(!isBlank(next.V)) next.V = snapTaxCategory(next.V, taxList);
    if(!isBlank(next.M)) next.M = snapTaxCategory(next.M, taxList);
    return next;
  });
}

// ===== دالتان مُستخرَجتان حرفيًا من applyInvoiceImportMapping (لجعل معادلات §6.5/§6.6 قابلة للاختبار مستقلاً) =====

// استنتاج "شامل الضريبة؟" (S) عند غياب عمود صريح — الأولوية المطلقة للعمود الصريح تُطبَّق في invoiceImportMapping.js.
export function deriveTaxInclusive({qty, price, totalForS, rate}){
  const base = qty*price;
  const tol = Math.max(0.02, Math.abs(base)*0.01);
  if(Math.abs(totalForS - base) <= tol) return 'نعم';
  if(rate!==null && rate>0 && Math.abs(totalForS - base*(1+rate)) <= tol) return 'لا';
  if(rate!==null && rate>0 && Math.abs(totalForS - base/(1+rate)) <= tol) return 'نعم';
  return 'لا';
}

// استنتاج نسبة الضريبة (V) عند غياب عمود صريح، عبر النسبة الضمنية من الإجمالي شامل الضريبة.
export function deriveTaxRate({qty, price, grandTotalVal, taxList}){
  const base = qty*price;
  if(!(base>0)) return null;
  const impliedRate = (grandTotalVal/base) - 1;
  return matchNearestTaxRate(impliedRate, taxList);
}
