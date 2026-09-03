/* محرك التحقق الكامل (26 قاعدة) — نسخ حرفي من qoyod_validator_core.js (أسطر 1672-1873،
   1911-1921، 2002-2012). بلا أي DOM (renderValidationUI/renderMissingLocationUI تنتقلان
   لمكوّنات React). تبديل معماري: state.rows/template/products/customers/stock العامة
   تصبح وسائط rows/refs، وaddIssue(...) الداخلية تبقى كما هي (تبني issuesByRow/summary
   محليًا ثم تُعاد) — كل شرط ومعادلة ورسالة خطأ حرفية 100% بلا أي تغيير. */

import { COLUMNS, COL_KEYS, HEADER_COLS } from './constants.js';
import { norm, isBlank, round2 } from './text.js';
import { parseDateParts, formatDateParts, getDateSep } from './dates.js';
import { normKey } from './text.js';
import { groupRowsByInvoiceRef } from './grouping.js';
import { checkStockSequential } from './stockSimulation.js';

// refs: {template:{loaded,dropdowns,missingFields}, products:{loaded,bySku,byName}, customers:{loaded,byRef,byName}, stock:{loaded,byKey}}
export function runValidation(rows, refs = {}){
  // [أداء] أرقام الصفوف بالرسائل كانت تُستخرَج بـrows.indexOf داخل حلقات تمرّ على
  // كل مجموعة فاتورة — أي مسح خطي لكل صف بكل رسالة (ملف 5000 صف ≈ ملايين
  // المقارنات بكل إعادة تحقق، وإعادة التحقق تجري بكل ضغطة مفتاح بالخطوة 3).
  // خريطة id←فهرس تُبنى مرة واحدة: نفس الأرقام بالضبط، بلا أي تغيير بالمخرجات.
  const rowIndexById = new Map();
  (rows || []).forEach((r, i) => { if(r && r.id !== undefined) rowIndexById.set(r.id, i); });
  const issuesByRow = {}; // id -> {colKey: [{sev,msg}]}
  const summary = []; // {sev, msg, rowId, colKey}

  function addIssue(rowId, colKey, sev, msg){
    if(!issuesByRow[rowId]) issuesByRow[rowId] = {};
    if(!issuesByRow[rowId][colKey]) issuesByRow[rowId][colKey] = [];
    issuesByRow[rowId][colKey].push({sev,msg});
    summary.push({sev, msg, rowId, colKey});
  }

  const template = refs.template || {loaded:false};
  const products = refs.products || {loaded:false};
  const customers = refs.customers || {loaded:false};
  const stock = refs.stock || {loaded:false};
  const DATE_SEP = getDateSep();

  // تجميع حسب مرجع الفاتورة (A) بالترتيب
  const groups = groupRowsByInvoiceRef(rows);

  rows.forEach((row, idx)=>{
    const rn = idx+1;
    // إلزامي على مستوى البند
    ['N','P','R','S','V'].forEach(k=>{
      if(isBlank(row[k])) addIssue(row.id,k,'err',`السطر ${rn}: حقل "${COLUMNS.find(c=>c.key===k).name}" إلزامي ولا يمكن تركه فارغًا.`);
    });
    if(isBlank(row.A)) addIssue(row.id,'A','err',`السطر ${rn}: "مرجع الفاتورة" إلزامي.`);
    if(row.A && norm(row.A).length>191) addIssue(row.id,'A','warn',`السطر ${rn}: مرجع الفاتورة يتجاوز 191 حرفًا (تنبيه فقط، ليس مانعًا فعليًا من الخادم).`);

    // أرقام
    const P = parseFloat(row.P), R = parseFloat(row.R), T = row.T?parseFloat(row.T):null, U = row.U?parseFloat(row.U):null, K = row.K?parseFloat(row.K):null;
    if(row.P!=='' && (isNaN(P) || P<=0)) addIssue(row.id,'P','err',`السطر ${rn}: الكمية يجب أن تكون رقمًا أكبر من صفر.`);
    if(row.R!=='' && (isNaN(R) || R<0)) addIssue(row.id,'R','err',`السطر ${rn}: سعر الوحدة لا يمكن أن يكون سالبًا.`);
    if(T!==null && (isNaN(T) || T<0 || T>100)) addIssue(row.id,'T','err',`السطر ${rn}: نسبة الخصم يجب أن تكون بين 0 و100.`);
    if(U!==null && (isNaN(U) || U<0)) addIssue(row.id,'U','err',`السطر ${rn}: قيمة الخصم لا يمكن أن تكون سالبة.`);
    if(K!==null && (isNaN(K) || K<=0)) addIssue(row.id,'K','err',`السطر ${rn}: قيمة خصم المستند يجب أن تكون أكبر من صفر إن أُدخلت.`);
    if(!isBlank(row.T) && !isBlank(row.U)) { addIssue(row.id,'T','err',`السطر ${rn}: لا يجوز تعبئة نسبة الخصم وقيمة الخصم معًا لنفس البند.`); addIssue(row.id,'U','err',`السطر ${rn}: لا يجوز تعبئة نسبة الخصم وقيمة الخصم معًا لنفس البند.`); }

    if(!isBlank(row.S) && !['نعم','لا'].includes(norm(row.S))) addIssue(row.id,'S','err',`السطر ${rn}: "شامل الضريبة؟" يجب أن تكون نعم أو لا فقط.`);

    // التواريخ: يجب أن تكون مقروءة وبصيغة القالب المختارة
    COLUMNS.filter(c=>c.type==='date').forEach(c=>{
      if(isBlank(row[c.key])) return;
      const p = parseDateParts(row[c.key]);
      if(!p){ addIssue(row.id,c.key,'err',`السطر ${rn}: تعذر قراءة "${c.name}" كتاريخ صحيح ("${row[c.key]}") — استخدم صيغة يوم${DATE_SEP}شهر${DATE_SEP}سنة.`); return; }
      const expected = formatDateParts(p);
      if(norm(row[c.key]) !== expected) addIssue(row.id,c.key,'warn',`السطر ${rn}: سيتم كتابة "${c.name}" في الملف النهائي بصيغة ${expected}.`);
    });

    // القوائم المنسدلة مقابل القالب
    if(template.loaded){
      if(!isBlank(row.G) && !template.dropdowns.G.includes(norm(row.G))) addIssue(row.id,'G','err',`السطر ${rn}: الموقع "${row.G}" غير موجود في قائمة المواقع المحمَّلة من القالب.`);
      if(!isBlank(row.V) && !template.dropdowns.V.includes(norm(row.V))) addIssue(row.id,'V','err',`السطر ${rn}: قيمة الضريبة "${row.V}" غير مطابقة لأي فئة ضريبية في القالب.`);
      if(!isBlank(row.H) && template.dropdowns.H.length && !template.dropdowns.H.includes(norm(row.H))) addIssue(row.id,'H','warn',`السطر ${rn}: طريقة الدفع "${row.H}" غير مطابقة للقائمة المحمَّلة (تحقق من كتابتها).`);
    }

    // المنتج
    if(!isBlank(row.N) && products.loaded){
      const p = products.bySku.get(norm(row.N));
      if(!p) addIssue(row.id,'N','err',`السطر ${rn}: كود المنتج "${row.N}" غير موجود في تقرير المنتجات المرفوع.`);
      else if(p.sellable===false) addIssue(row.id,'N','err',`السطر ${rn}: المنتج "${p.name||row.N}" غير قابل للبيع (حالته "لا" في تقرير المنتجات) ولا يمكن اعتماده ضمن الاستيراد.`);
    }
    // العميل
    if(!isBlank(row.C) && customers.loaded){
      const c = customers.byRef.get(norm(row.C));
      if(!c){
        const dup = customers.byName.get(normKey(row.C)) || [];
        if(dup.length>1){
          addIssue(row.id,'C','err',`السطر ${rn}: الاسم "${row.C}" مكرر لأكثر من عميل — اختر الرقم المرجعي الصحيح من: ${dup.map(x=>x.ref).join('، ')}`);
        } else {
          addIssue(row.id,'C','err',`السطر ${rn}: الرقم المرجعي للعميل "${row.C}" غير موجود في ملف العملاء المرفوع.`);
        }
      }
      else if(c.active===false) addIssue(row.id,'C','warn',`السطر ${rn}: العميل "${c.name||row.C}" مُسجَّل كغير نشط.`);
    }
  });

  // قاعدة تطابق/تفريغ بيانات الرأس داخل كل مجموعة مرجع
  groups.forEach((rowsInGroup, key)=>{
    if(key.startsWith('__blank__')) return; // الفواتير بمرجع فارغ لها تحقق مستقل أدناه
    if(rowsInGroup.length>=2){
      HEADER_COLS.forEach(hk=>{
        const values = rowsInGroup.map(r=>norm(r[hk]));
        const nonBlank = values.filter(v=>v!=='');
        if(nonBlank.length===0) return;
        const allBlankAfterFirst = values.slice(1).every(v=>v==='');
        const allIdentical = values.every(v=>v===values[0]);
        if(!allBlankAfterFirst && !allIdentical){
          rowsInGroup.forEach((r,i)=>{
            if(i===0) return;
            if(norm(r[hk]) !== '' && norm(r[hk]) !== norm(rowsInGroup[0][hk])){
              const rn = (rowIndexById.get(r.id) ?? rows.indexOf(r))+1;
              addIssue(r.id, hk, 'err', `السطر ${rn}: قيمة "${COLUMNS.find(c=>c.key===hk).name}" تختلف عن السطر الأول لنفس مرجع الفاتورة (${key}). اتركها فارغة أو طابقها تمامًا.`);
            }
          });
        }
      });
    }
    // تحقق من الحقول الإلزامية على مستوى الفاتورة (تحسب من أول قيمة غير فارغة بالمجموعة)
    // يجب أن يعمل هذا التحقق حتى لو كانت الفاتورة مكوّنة من سطر واحد فقط
    ['C','D','G'].forEach(hk=>{
      const hasAny = rowsInGroup.some(r=>!isBlank(r[hk]));
      if(!hasAny){
        const rn = (rowIndexById.get(rowsInGroup[0].id) ?? rows.indexOf(rowsInGroup[0]))+1;
        addIssue(rowsInGroup[0].id, hk, 'err', `مجموعة الفاتورة "${key}" (بدءًا من السطر ${rn}): حقل "${COLUMNS.find(c=>c.key===hk).name}" إلزامي ولم يُعبَّأ في أي سطر من المجموعة.`);
      }
    });
  });
  // فواتير بمرجع فارغ ومفردة أيضا تحتاج تحقق C/D/G
  rows.forEach((row,idx)=>{
    if(isBlank(row.A)){
      ['C','D','G'].forEach(hk=>{
        if(isBlank(row[hk])) addIssue(row.id,hk,'err',`السطر ${idx+1}: حقل "${COLUMNS.find(c=>c.key===hk).name}" إلزامي.`);
      });
    }
  });

  // ---------- الخصم أكبر من قيمة البند / قيمة الفاتورة ----------
  // إجمالي البند = الكمية × سعر الوحدة، ثم نطرح خصم البند (نسبة أو قيمة) للوصول لصافي الفاتورة
  // الذي يُقارَن به خصم المستند.
  function lineGross(r){
    const q = parseFloat(r.P), p = parseFloat(r.R);
    return (isNaN(q) || isNaN(p)) ? NaN : q*p;
  }
  rows.forEach((row, idx)=>{
    const gross = lineGross(row);
    if(isNaN(gross)) return;
    const u = isBlank(row.U) ? null : parseFloat(row.U);
    if(u!==null && !isNaN(u) && u > gross + 0.005){
      const msg = `السطر ${idx+1}: قيمة الخصم (${u}) أعلى من قيمة البند نفسه (${round2(gross)} = ${row.P} × ${row.R}) — عدّل الخصم ليكون أقل من قيمة البند أو مساويًا لها.`;
      addIssue(row.id,'U','err',msg);
    }
  });
  groups.forEach((rowsInGroup, key)=>{
    if(key.startsWith('__blank__')) return;
    let net = 0, ok = false;
    rowsInGroup.forEach(r=>{
      const gross = lineGross(r);
      if(isNaN(gross)) return;
      ok = true;
      let lineNet = gross;
      const t = isBlank(r.T) ? null : parseFloat(r.T);
      const u = isBlank(r.U) ? null : parseFloat(r.U);
      if(t!==null && !isNaN(t)) lineNet -= gross * (t/100);
      else if(u!==null && !isNaN(u)) lineNet -= u;
      net += lineNet;
    });
    if(!ok) return;
    // خصم المستند يُكتب في السطر الأول من المجموعة، وقد يُترك فارغًا في بقية الأسطر
    const kRow = rowsInGroup.find(r=>!isBlank(r.K));
    if(!kRow) return;
    const k = parseFloat(kRow.K);
    if(isNaN(k)) return;
    if(k > Math.max(0, net) + 0.005){
      const rn = (rowIndexById.get(kRow.id) ?? rows.indexOf(kRow))+1;
      addIssue(kRow.id,'K','err',`الفاتورة "${key}" (السطر ${rn}): قيمة خصم المستند (${k}) أعلى من إجمالي قيمة الفاتورة (${round2(net)}) — عدّل قيمة الخصم ليكون أقل من إجمالي الفاتورة أو مساويًا له.`);
    }
  });

  // عمود إلزامي لم يُعثر له على موضع في القالب المرفوع = الملف الناتج سيخرج ناقصًا، فنمنع التصدير
  if(template.loaded && rows.length){
    (template.missingFields||[])
      .filter(k=>COLUMNS.find(c=>c.key===k).required)
      .forEach(k=>{
        addIssue(rows[0].id, k, 'err', `عمود "${COLUMNS.find(c=>c.key===k).name}" غير موجود في القالب المرفوع — لن تُكتب قيمه في الملف النهائي. تأكد من رفع قالب قيود الأصلي دون تعديل صف العناوين.`);
      });
  }

  // التحقق التراكمي من كفاية المخزون (محاكاة الاستهلاك التسلسلي) — انظر stockSimulation.js
  if(stock.loaded){
    checkStockSequential(rows, {productsIndex: products.loaded ? products : null, stockIndex: stock}).forEach(iss=>{
      addIssue(iss.rowId, iss.colKey, iss.sev, iss.msg);
    });
  }

  return {byRow: issuesByRow, list: summary};
}

// من findInvoicesMissingLocation (qoyod_validator_core.js أسطر 1911-1920) — نقية، تأخذ rows كوسيط.
export function findInvoicesMissingLocation(rows){
  const groups = groupRowsByInvoiceRef(rows);
  const missing = [];
  groups.forEach((rowsInGroup,key)=>{
    if(key.startsWith('__blank__')) return;
    if(rowsInGroup.every(r=>isBlank(r.G))) missing.push({key, rows:rowsInGroup});
  });
  return missing;
}

// يعيد أسطر الفواتير "السليمة تمامًا" فقط (كل أسطر الفاتورة خالية من أي خطأ حاجب) — تُستخدم في خيار
// "تحميل الفواتير الصحيحة فقط" عندما لا يزال في الملف فواتير أخرى بها أخطاء.
// نسخ حرفي من qoyod_validator_core.js (أسطر 2002-2012).
export function getValidOnlyRows(rows, issuesByRow){
  const groups = groupRowsByInvoiceRef(rows);
  const validRows = [];
  groups.forEach((rowsInGroup, key)=>{
    if(key.startsWith('__blank__')) return; // الفواتير بلا مرجع أصلًا غير صالحة للتصدير
    const anyErr = rowsInGroup.some(r => (issuesByRow[r.id] && Object.values(issuesByRow[r.id]).some(arr=>arr.some(i=>i.sev==='err'))));
    if(!anyErr) for(let i=0;i<rowsInGroup.length;i++) validRows.push(rowsInGroup[i]); // بلا spread — راجع تعليق excelCore.js.readWorkbookRows لسبب تجنّبه مع مصفوفات كبيرة
  });
  return validRows;
}
