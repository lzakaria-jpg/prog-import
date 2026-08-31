import React from 'react';

// نسخ حرفي من buildRefDatalists — قوائم اقتراح مشتركة بين جدولي الخطوتين 2 و3، تُبنى مرة واحدة
// من فهرسي العملاء/المنتجات المحمَّلين، وتُستخدم من خلايا C/N عبر السمة list (انظر GridCell.jsx).
export default function RefDatalists({ customersRef, productsRef }) {
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
    </div>
  );
}
