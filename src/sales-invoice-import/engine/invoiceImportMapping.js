/* محرك استيراد ملف الفواتير غير المنظم (خطوة 2) — نسخ حرفي من الجزء غير-DOM من
   renderInvoiceImportMappingUI (qoyod_validator_core.js أسطر 1101-1237، استثناء بناء
   HTML وربط الأحداث) و applyInvoiceImportMapping بالكامل (أسطر 1298-1409، استثناء
   confirm()/renderGrid/تحديثات DOM النهائية — تلك تنتقل للهوك).

   تبديل معماري: state.template/products/customers العامة تصبح وسيط واحد refs
   {template, products, customers}، وnewRow() المباشرة تصبح createRowFn() يمرّرها المستدعي
   (الهوك، عبر useRef مستمر لـ rowSeq). كل شرط ومعادلة حرفي 100% بلا أي تغيير. */

import { COLUMNS } from './constants.js';
import { INVOICE_COLUMN_KEYWORDS, AUX_FIELD_KEYWORDS, AUX_FIELD_REJECT } from './constants.js';
import { norm, normKey, isBlank, normalizeNumericText } from './text.js';
import { guessColumnsBatch } from './columnMatching.js';
import { columnValues, sampleValuesFor, analyzeColumnShape, dateLikeRatio, normalizeDateToDMY } from './columnShape.js';
import { normalizeYesNo, normalizePercentValue, normalizeDiscountPercentNumber, parseRateFromDropdownLabel, deriveTaxInclusive, deriveTaxRate, snapTaxCategory } from './taxAndDiscount.js';
import { rowGet } from './referenceIndexes.js';
import { resolveNamesToRefs } from './resolveNames.js';
import { fillDownHeaderFields } from './rows.js';

// من renderInvoiceImportMappingUI (أسطر 1101-1172 و 1186-1189 لجزء التخمين، بلا أي HTML/DOM).
// refs: {template:{loaded,dropdowns}, customers:{loaded}, products:{loaded}} (لأخذ قرارات الاستنتاج بالقيم فقط).
export function guessInvoiceImportMapping(headers, rawRows, refs){
  const mainGuesses = guessColumnsBatch(COLUMNS.map(col=>({key:col.key, kw:[col.name, ...(INVOICE_COLUMN_KEYWORDS[col.key]||[])]})), headers);

  const colValsOf = h => { const i = headers.indexOf(h); return i<0 ? [] : rawRows.slice(0,30).map(r=>r[i]); };

  // فحص طبيعة القيم: نُسقِط أي تخمين لا تناسب قيمُه طبيعة الحقل (مثل إسناد عمود "Total (Tax inclusive)"
  // لحقل "شامل الضريبة؟" لمجرد ورود كلمة tax inclusive في اسمه، بينما قيمه مبالغ لا نعم/لا).
  const shapeGuards = {
    S: h => { const v = colValsOf(h).map(x=>norm(x)).filter(x=>x!==''); return v.length===0 || v.every(x=>normalizeYesNo(x)!==null); },
    D: h => dateLikeRatio(colValsOf(h)) >= 0.5,
    E: h => dateLikeRatio(colValsOf(h)) >= 0.5,
    F: h => dateLikeRatio(colValsOf(h)) >= 0.5,
    P: h => { const s = analyzeColumnShape(colValsOf(h)); return s.count===0 || s.numericRatio>=0.6; },
    R: h => { const s = analyzeColumnShape(colValsOf(h)); return s.count===0 || s.numericRatio>=0.6; },
  };
  Object.keys(shapeGuards).forEach(k=>{
    if(mainGuesses[k] && !shapeGuards[k](mainGuesses[k])) mainGuesses[k] = '';
  });

  // تمييز ذكي بين "نسبة الخصم" و"قيمة الخصم": عند وجود عمود خصم واحد عام لا يحسم اسمه أيًّا منهما،
  // نحكم بشكل القيم نفسها (كسور <1 أو نص بعلامة % ⇐ نسبة، وغير ذلك ⇐ قيمة خصم).
  {
    const discountHeaders = headers.filter(h => ['خصم','discount'].some(kw=>normKey(h).includes(normKey(kw))));
    const exactNames = new Set([...(INVOICE_COLUMN_KEYWORDS.T||[]), ...(INVOICE_COLUMN_KEYWORDS.U||[]),
                                'نسبة الخصم','قيمة الخصم'].map(normKey));
    if(discountHeaders.length===1 && !exactNames.has(normKey(discountHeaders[0]))){
      const cand = discountHeaders[0];
      const usedElsewhere = Object.keys(mainGuesses).some(k=>k!=='T' && k!=='U' && mainGuesses[k]===cand);
      if(!usedElsewhere){
        if(mainGuesses.T===cand) mainGuesses.T='';
        if(mainGuesses.U===cand) mainGuesses.U='';
        const shape = analyzeColumnShape(colValsOf(cand));
        if(shape.count>0 && (shape.percentSuffixRatio>=0.5 || shape.fractionLikeRatio>=0.5)) mainGuesses.T = cand;
        else mainGuesses.U = cand;
      }
    }
  }

  // استنتاج بالقيم عند فشل الاسم: عمود التاريخ يُعرف من قابلية قراءة قيمه كتواريخ،
  // وعمود الموقع من تطابق قيمه مع مواقع القالب، وعمود شامل الضريبة من كون قيمه نعم/لا.
  {
    const usedNow = () => new Set(Object.values(mainGuesses).filter(Boolean));
    if(!mainGuesses.D){
      const used = usedNow();
      const cand = headers.find(h=>!used.has(h) && dateLikeRatio(columnValues(headers, rawRows, h))>=0.6);
      if(cand) mainGuesses.D = cand;
    }
    if(!mainGuesses.G && refs.template && refs.template.loaded && refs.template.dropdowns.G.length){
      const used = usedNow();
      const locKeys = new Set(refs.template.dropdowns.G.map(l=>normKey(l)));
      const cand = headers.find(h=>{
        if(used.has(h)) return false;
        const vals = columnValues(headers, rawRows, h).map(v=>norm(v)).filter(v=>v!=='').slice(0,25);
        return vals.length>0 && vals.filter(v=>locKeys.has(normKey(v))).length/vals.length >= 0.6;
      });
      if(cand) mainGuesses.G = cand;
    }
    if(!mainGuesses.S){
      const used = usedNow();
      const cand = headers.find(h=>{
        if(used.has(h)) return false;
        const vals = columnValues(headers, rawRows, h).map(v=>norm(v)).filter(v=>v!=='').slice(0,25);
        return vals.length>0 && vals.every(v=>normalizeYesNo(v)!==null);
      });
      if(cand) mainGuesses.S = cand;
    }
  }

  const usedByMain = new Set(Object.values(mainGuesses).filter(Boolean));
  const auxGuesses = guessColumnsBatch(Object.keys(AUX_FIELD_KEYWORDS).map(k=>({key:k, kw:AUX_FIELD_KEYWORDS[k], reject:AUX_FIELD_REJECT[k]})), headers, usedByMain);

  return {mainGuesses, auxGuesses};
}

// من داخل معالج confirm-invoice-import (أسطر 1219-1229): يحدد أي حقل إلزامي يمكن تدارك غيابه
// عبر الاستنتاج التلقائي، فلا يُحسب "مفقودًا فعليًا" إلا إن لم يوجد أي بديل له.
export function getMissingRequiredAfterDerivation(mapping, refs){
  const derivable = {
    C: !!mapping._customerName && !!(refs.customers && refs.customers.loaded),
    N: (!!mapping._productName || !!mapping.O) && !!(refs.products && refs.products.loaded),
    R: !!mapping._lineTotal && !!mapping.P,
    S: !!mapping._lineTotal || !!mapping._grandTotal,
  };
  return COLUMNS.filter(c=>c.required && !mapping[c.key] && !derivable[c.key]);
}

// من applyInvoiceImportMapping (أسطر 1298-1394)، بلا confirm()/renderGrid/تحديثات DOM.
// refs: {template, products, customers} بنفس شكل useState في الهوك.
// createRowFn: () => row جديد بـ id فريد (يستدعيها الهوك عبر createRow(nextRowId())).
export function applyInvoiceImportMapping(rawRows, headers, mapping, refs, createRowFn){
  const ambiguities = [];

  // [إصلاح] استنتاج "شامل الضريبة؟" كان يقارن (كمية × سعر) لسطر واحد بإجمالي
  // *الفاتورة كاملة* عند غياب عمود إجمالي البند — فأي فاتورة بأكثر من سطر تفشل
  // كل مقارناتها وتُصنَّف "لا" افتراضيًا: قيود تضيف الضريبة فوق سعر يحتويها أصلًا
  // (مثال مؤكَّد: سطران 115.00 شاملة و15%، إجمالي 230 ← يصبح 264.50). نحسب هنا
  // مسبقًا عدد سطور كل فاتورة ومجموع (كمية × سعر) لها، لتتم المقارنة على مستوى
  // الفاتورة كاملة حين يكون المرجع هو الإجمالي الكلي. إن تعذّر الحساب (سعر ناقص
  // بأحد السطور) نُبقي السلوك الحالي حرفيًا كما هو.
  const refH = mapping.A, qtyH = mapping.P, priceH = mapping.R;
  const groupLineCount = new Map();
  const groupBaseSum = new Map();
  const groupBaseUsable = new Map();
  if(refH){
    rawRows.forEach(r=>{
      const key = normKey(norm(rowGet(r, headers, refH)));
      if(!key) return;
      groupLineCount.set(key, (groupLineCount.get(key) || 0) + 1);
      const q = qtyH ? parseFloat(normalizeNumericText(norm(rowGet(r, headers, qtyH)))) : NaN;
      const pr = priceH ? parseFloat(normalizeNumericText(norm(rowGet(r, headers, priceH)))) : NaN;
      if(isNaN(q) || isNaN(pr)){ groupBaseUsable.set(key, false); return; }
      if(groupBaseUsable.get(key) === undefined) groupBaseUsable.set(key, true);
      groupBaseSum.set(key, (groupBaseSum.get(key) || 0) + q*pr);
    });
  }

  const importedRows = rawRows.map(r=>{
    const row = createRowFn();
    COLUMNS.forEach(col=>{
      const h = mapping[col.key];
      if(!h) return;
      let val = norm(rowGet(r, headers, h));
      if(col.type==='date' && val) val = normalizeDateToDMY(val);
      // [إصلاح] الأعمدة الرقمية (الكمية/سعر الوحدة/الخصومات) كانت تُخزَّن بنصها كما
      // هو، وكل مستهلكيها يستخدمون parseFloat مباشرةً: قيمة "1,200.00" من ملف عميل
      // تُقرَأ 1 بصمت في حساب قيمة البند وفحص "الخصم أعلى من قيمة البند" ومحاكاة
      // المخزون، وتُكتَب حرفيًا بالملف النهائي. التقييس هنا يجعل النص رقميًا سليمًا
      // قبل أي استخدام، بلا لمس أي معادلة من المعادلات نفسها.
      if(col.type==='number' && val) val = normalizeNumericText(val);
      row[col.key] = val;
    });

    const lineTotalH = mapping._lineTotal, grandTotalH = mapping._grandTotal;
    const custNameH = mapping._customerName, prodNameH = mapping._productName;
    const lineTotalVal = lineTotalH ? parseFloat(norm(rowGet(r, headers, lineTotalH)).replace(/[^\d.\-]/g,'')) : NaN;
    const grandTotalVal = grandTotalH ? parseFloat(norm(rowGet(r, headers, grandTotalH)).replace(/[^\d.\-]/g,'')) : NaN;
    const qty = parseFloat(row.P);
    let priceWasDerived = false;

    // سعر الوحدة من إجمالي البند إن لم يوجد عمود سعر وحدة صريح (سعر الوحدة = الإجمالي ÷ الكمية)
    if(isBlank(row.R) && !isNaN(lineTotalVal) && !isNaN(qty) && qty>0){
      row.R = String(Math.round((lineTotalVal/qty) * 100) / 100);
      priceWasDerived = true;
    }

    // نسبة الخصم: توحيد المقياس (كسر عشري <1 يعني نسبة مئوية) إلى رقم 0-100 كما يتطلبه القالب
    if(!isBlank(row.T)) row.T = normalizeDiscountPercentNumber(row.T);
    // خصم بقيمة صفر = لا خصم، فنتركه فارغًا بدل كتابة 0.00 في الملف
    ['T','U','K'].forEach(k=>{ if(!isBlank(row[k]) && parseFloat(String(row[k]).replace('%','').replace(',','.'))===0) row[k]=''; });

    // شامل الضريبة؟: أولوية لعمود صريح (مع توحيد صيغته)، وإلا استنتاج من مقارنة (الكمية×السعر) بإجمالي البند
    if(!isBlank(row.S)){
      const normalized = normalizeYesNo(row.S);
      if(normalized) row.S = normalized;
    } else if(!priceWasDerived && (!isNaN(lineTotalVal) || !isNaN(grandTotalVal)) && !isNaN(qty) && !isBlank(row.R)){
      // نستخدم إجمالي البند إن وُجد، وإلا الإجمالي شامل الضريبة كمرجع للمقارنة
      const totalForS = !isNaN(lineTotalVal) ? lineTotalVal : grandTotalVal;
      const price = parseFloat(row.R);
      if(!isNaN(price)){
        const rate = isBlank(row.V) ? null : parseRateFromDropdownLabel(row.V);
        const groupKey = refH ? normKey(norm(rowGet(r, headers, refH))) : '';
        const lineCount = groupKey ? (groupLineCount.get(groupKey) || 1) : 1;
        const usesGrandTotal = isNaN(lineTotalVal);
        const baseSum = groupKey ? groupBaseSum.get(groupKey) : undefined;
        if(usesGrandTotal && lineCount > 1 && groupBaseUsable.get(groupKey) === true && baseSum > 0){
          // مقارنة على مستوى الفاتورة كاملة: (مجموع كمية×سعر لكل سطورها) مقابل إجماليها
          row.S = deriveTaxInclusive({qty: 1, price: baseSum, totalForS, rate});
        } else {
          row.S = deriveTaxInclusive({qty, price, totalForS, rate});
        }
      }
    }

    // نسبة الضريبة: توحيد الصيغة عند وجود عمود صريح، وإلا استنتاجها من سعر الوحدة مقابل الإجمالي شامل الضريبة
    if(!isBlank(row.V)){
      row.V = refs.template && refs.template.loaded
        ? snapTaxCategory(normalizePercentValue(row.V), refs.template.dropdowns.V)
        : normalizePercentValue(row.V);
    } else if(refs.template && refs.template.loaded && !isNaN(grandTotalVal) && !isBlank(row.R) && !isNaN(qty) && qty>0 && row.S !== 'نعم'){
      // [إصلاح] الشرط row.S !== 'نعم' جديد: النسبة الضمنية (الإجمالي ÷ (كمية×سعر) − 1)
      // لا تحمل أي معلومة عن الضريبة حين يكون السعر شاملًا لها أصلًا — تصبح ≈ 0
      // فتُطابَق أقرب فئة صفرية/معفاة بالقالب، أي فاتورة شاملة 15% تُصدَّر "معفى"
      // وتُحتسب ضريبتها صفرًا (على 115.00 يعني نقص 15.00 ريال ضريبة، ويعبر التحقق
      // لأن "معفى" قيمة مشروعة بالقالب). نتركها فارغة ليطلبها التحقق صراحةً.
      const price = parseFloat(row.R);
      const matched = deriveTaxRate({qty, price, grandTotalVal, taxList: refs.template.dropdowns.V});
      if(matched) row.V = matched;
    }

    // مطابقة العميل بالاسم عند غياب رقم مرجعي صريح
    if(isBlank(row.C) && custNameH && refs.customers && refs.customers.loaded){
      const typedName = norm(rowGet(r, headers, custNameH));
      if(typedName){
        const candidates = refs.customers.byName.get(normKey(typedName)) || [];
        if(candidates.length===1){ row.C = candidates[0].ref; }
        else if(candidates.length>1){ ambiguities.push({rowId:row.id, field:'C', typedName, candidates: candidates.map(c=>({key:c.ref, label:`${c.name} — ${c.ref}`}))}); }
      }
    }
    // مطابقة المنتج بالاسم عند غياب كود/باركود صريح — نستخدم عمود "اسم المنتج" المخصص إن حُدد صراحة،
    // وإلا نستخدم "وصف المنتج" (O) نفسه لأن نفس العمود المصدر غالبًا ما يُطابَق تلقائيًا مع O أولًا
    // (كلماتهما المفتاحية شبه متطابقة) فلا يبقى عمود مستقل لحقل اسم المنتج المساعد.
    if(isBlank(row.N) && refs.products && refs.products.loaded){
      const sourceVal = prodNameH ? norm(rowGet(r, headers, prodNameH)) : norm(row.O);
      if(sourceVal){
        const candidates = refs.products.byName.get(normKey(sourceVal)) || [];
        if(candidates.length===1){ row.N = candidates[0].sku; if(isBlank(row.O)) row.O = sourceVal; }
        else if(candidates.length>1){ ambiguities.push({rowId:row.id, field:'N', typedName:sourceVal, candidates: candidates.map(c=>({key:c.sku, label:`${c.name} — ${c.sku}`}))}); }
      }
    }

    return row;
  }).filter(row => COLUMNS.some(c=>!isBlank(row[c.key])));

  // العميل/المنتج المكتوب بالاسم داخل خانة الرقم المرجعي/الكود يُستبدل بالرقم المرجعي الصحيح،
  // ثم تُكرَّر بيانات رأس الفاتورة على كل صفوف نفس المرجع.
  const resolved = resolveNamesToRefs(importedRows, true, refs.customers, refs.products);
  resolved.ambiguities.forEach(a=>ambiguities.push(a));
  const finalRows = fillDownHeaderFields(resolved.rows);

  return {importedRows: finalRows, ambiguities};
}
