/* محاكاة استهلاك المخزون التسلسلية — نسخ حرفي من قسم "التحقق التراكمي من كفاية المخزون"
   داخل runValidation (qoyod_validator_core.js أسطر 1840-1868)، مُستخرَج لدالة مستقلة
   قابلة للاختبار مباشرة. تبديل معماري: state.products/state.stock تصبحان وسيطين
   productsIndex/stockIndex، وaddIssue(...) تصبح issues.push({...}) — نفس الشرط
   والمنطق التسلسلي حرفيًا بلا أي تغيير، بما فيه اعتماد النتيجة على ترتيب rows نفسه
   (يُمنع فرز rows في أي مكان بالواجهة لأجل هذا). */

import { norm } from './text.js';

export function checkStockSequential(rows, {productsIndex, stockIndex} = {}){
  const issues = []; // {rowId, colKey:'P', sev:'warn'|'err', msg}
  if(!stockIndex) return issues;
  const running = new Map(); // sku||loc -> remaining
  rows.forEach((row, idx)=>{
    const sku = norm(row.N), loc = norm(row.G);
    if(!sku || !loc) return;
    const qty = parseFloat(row.P);
    if(isNaN(qty) || qty<=0) return;
    // منتج "غير مخزَّن" (خدمة أو صنف بلا تتبع مخزون): يُباع بلا حد للكمية ولا يظهر أصلًا في
    // تقرير مواقع المنتجات — فلا نفحص له مخزونًا ولا نُصدر تنبيه "لا تتوفر بيانات كمية".
    const prod = productsIndex ? productsIndex.bySku.get(sku) : null;
    if(prod && prod.stocked===false) return;
    const key = sku+'||'+loc;
    if(!running.has(key)){
      const avail = stockIndex.byKey.has(key) ? stockIndex.byKey.get(key) : null;
      running.set(key, avail===null ? null : avail);
    }
    const rem = running.get(key);
    if(rem===null){
      issues.push({rowId:row.id, colKey:'P', sev:'warn', msg:`السطر ${idx+1}: لا تتوفر بيانات كمية لهذا المنتج/الموقع في تقرير مواقع المنتجات المرفوع — تعذر التحقق من كفاية المخزون.`});
      return;
    }
    if(qty <= rem){
      running.set(key, rem-qty);
    } else {
      issues.push({rowId:row.id, colKey:'P', sev:'err', msg:`السطر ${idx+1}: ⚠️ يُتوقَّع رفض هذه الفاتورة من قيود لعدم توفر كمية كافية من المنتج "${row.N}" في الموقع "${row.G}" — المتبقي المتوقع بعد الفواتير السابقة في هذا الملف: ${rem}، والمطلوب هنا: ${qty}. (الفواتير السابقة لنفس المنتج/الموقع في هذا الملف قد تنجح وتستهلك الكمية أولًا).`});
      running.set(key, 0);
    }
  });
  return issues;
}
