import React, { useMemo } from 'react';
import { productDatalistIdForLocation } from '../engine/text.js';

// نسخ حرفي من buildRefDatalists — قوائم اقتراح مشتركة بين جدولي الخطوتين 2 و3، تُبنى مرة واحدة
// من فهرسي العملاء/المنتجات المحمَّلين، وتُستخدم من خلايا C/N عبر السمة list (انظر GridCell.jsx).
// [إضافة] dl-projects بنفس النمط لعمود المشروع الجديد (InvoiceGrid.jsx) — راجع
// تعليق رأس buildProjectsIndexFromApi بـqoyodSalesRefFetch.js (غير مؤكَّد ميدانيًا).
// [إضافة] stockRef — يبني قائمة منتجات إضافية منفصلة لكل موقع مخزون حقيقي ورد فعليًا
// بـstockRef.byKey (نفس فهرس الكمية المستخدَم بالفعل من stockSimulation.checkStockSequential
// بلا أي تعديل عليه هناك — راجع buildStockIndexFromApi/buildStockIndex)، بلاحقة الكمية
// المتوفرة بذلك الموقع بجانب اسم المنتج. GridCell.jsx يختار أيها يعرضه لعمود N حسب قيمة G
// بنفس الصف (productDatalistIdForLocation) — لا علاقة لهذا بأي منطق تحقق/مطابقة، مجرد
// مساعدة عرض بحتة (نفس رقم/سطر المنتج المُطابَق يبقى كما هو بلا تغيير).
export default function RefDatalists({ customersRef, productsRef, projectsRef, stockRef }) {
  const hasStock = !!(stockRef && stockRef.loaded && stockRef.byKey && stockRef.byKey.size > 0);
  const stockLocationNames = useMemo(() => {
    if (!hasStock) return [];
    const set = new Set();
    stockRef.byKey.forEach((_qty, key) => {
      const i = key.indexOf('||');
      if (i >= 0) set.add(key.slice(i + 2));
    });
    return Array.from(set);
  }, [hasStock, stockRef]);

  return (
    <div style={{ display: 'none' }}>
      {customersRef.loaded && (
        <datalist id="dl-customers">
          {Array.from(customersRef.byRef.values()).map((c) => (
            <option key={c.ref} value={c.ref} label={`${c.name || ''} — ${c.ref}`} />
          ))}
        </datalist>
      )}
      {productsRef.loaded && (
        <datalist id="dl-products">
          {Array.from(productsRef.bySku.values()).map((p) => (
            <option key={p.sku} value={p.sku} label={`${p.name || ''} — ${p.sku}`} />
          ))}
        </datalist>
      )}
      {productsRef.loaded && hasStock && stockLocationNames.map((loc) => (
        <datalist key={loc} id={productDatalistIdForLocation(loc)}>
          {Array.from(productsRef.bySku.values()).map((p) => {
            const qty = stockRef.byKey.get(`${p.sku}||${loc}`);
            const qtyPart = qty === undefined ? '' : ` (${qty})`;
            return <option key={p.sku} value={p.sku} label={`${p.name || ''}${qtyPart} — ${p.sku}`} />;
          })}
        </datalist>
      ))}
      {projectsRef && projectsRef.loaded && (
        // [ملاحظة] القيمة المخزَّنة هي رقم المشروع (String(p.id))، لا الاسم — نفس نمط
        // dl-customers/dl-products أعلاه (قيمة فريدة مضمونة لا اسم قد يتكرر)، والاسم
        // يظهر فقط بـlabel للبحث. يطابق byId أولًا بـbuildSalesInvoicePayload مباشرة.
        <datalist id="dl-projects">
          {Array.from(projectsRef.byId.values()).map((p) => (
            <option key={p.id} value={String(p.id)} label={`${p.name || ''} — ${p.id}`} />
          ))}
        </datalist>
      )}
    </div>
  );
}
