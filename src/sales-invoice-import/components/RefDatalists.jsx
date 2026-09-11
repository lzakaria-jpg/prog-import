import React from 'react';

// نسخ حرفي من buildRefDatalists — قوائم اقتراح مشتركة بين جدولي الخطوتين 2 و3، تُبنى مرة واحدة
// من فهرسي العملاء/المنتجات المحمَّلين، وتُستخدم من خلايا C/N عبر السمة list (انظر GridCell.jsx).
// [إضافة] dl-projects بنفس النمط لعمود المشروع الجديد (InvoiceGrid.jsx) — راجع
// تعليق رأس buildProjectsIndexFromApi بـqoyodSalesRefFetch.js (غير مؤكَّد ميدانيًا).
export default function RefDatalists({ customersRef, productsRef, projectsRef }) {
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
