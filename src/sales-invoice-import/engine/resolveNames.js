/* تحويل الأسماء المكتوبة في خانة الرقم المرجعي/الكود إلى الرقم المرجعي/الكود الصحيح —
   نسخ حرفي من qoyod_validator_core.js (أسطر 1260-1279).
   تبديل معماري: الأصل يُعدِّل rows بالإشارة المباشرة ويقرأ state.customers/state.products
   العامّين؛ هنا تُمرَّر الفهارس كوسيطين وتُعاد {rows, ambiguities} بمصفوفة صفوف جديدة
   (نسخ سطحي لكل صف قبل أي تعديل) — نفس الشروط والاستدعاءات حرفيًا. */

import { norm, normKey, isBlank } from './text.js';

export function resolveNamesToRefs(rows, collectAmbiguities, customersIndex, productsIndex){
  const ambiguities = [];
  const customersLoaded = !!(customersIndex && customersIndex.byRef);
  const productsLoaded = !!(productsIndex && productsIndex.bySku);
  const nextRows = rows.map(row=>{
    const r = {...row};
    if(customersLoaded && !isBlank(r.C) && !customersIndex.byRef.has(norm(r.C))){
      const cands = customersIndex.byName.get(normKey(r.C)) || [];
      if(cands.length===1) r.C = cands[0].ref;
      else if(cands.length>1 && collectAmbiguities){
        ambiguities.push({rowId:r.id, field:'C', typedName:norm(r.C), candidates:cands.map(c=>({key:c.ref, label:`${c.name} — ${c.ref}`}))});
      }
    }
    if(productsLoaded && !isBlank(r.N) && !productsIndex.bySku.has(norm(r.N))){
      const cands = productsIndex.byName.get(normKey(r.N)) || [];
      if(cands.length===1){ if(isBlank(r.O)) r.O = norm(r.N); r.N = cands[0].sku; }
      else if(cands.length>1 && collectAmbiguities){
        ambiguities.push({rowId:r.id, field:'N', typedName:norm(r.N), candidates:cands.map(p=>({key:p.sku, label:`${p.name} — ${p.sku}`}))});
      }
    }
    return r;
  });
  return {rows: nextRows, ambiguities};
}
