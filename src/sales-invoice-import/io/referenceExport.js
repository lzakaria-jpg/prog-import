/*
 ============================================================================
  referenceExport — يبني ملف xlsx قابل للتنزيل من الفهارس (productsRef/
  stockRef/customersRef) بعد جلبها عبر API (qoyodSalesRefFetch.js)، بحيث
  يحتفظ المستخدم بنسخة محلية مما جُلب (بلا رفع يدوي يقابله أصلاً بمسار API).
  ============================================================================
  [إضافة] ميزة تصدير بحتة — لا تُعدِّل أي من productsRef/stockRef/customersRef
  ولا تُستهلَك من أي كود مطابقة/تحقق. تقرأ فقط من نفس الفهارس (bySku/byKey/
  byRef) التي يبنيها مساري الرفع اليدوي وAPI كليهما (buildProductsIndex/
  buildStockIndex/buildCustomersIndex في engine/referenceIndexes.js
  وqoyodSalesRefFetch.js) بنفس الشكل تمامًا — فتعمل بلا فرق مهما كان أصل
  البيانات، لكنها تُعرض بالواجهة فقط لبيانات API (راجع Step1References.jsx).

  بناء الصفوف (buildXxxRefRows) مفصول عن التنزيل (downloadXxxRefFile) عمداً —
  نفس نمط product-upload/io/openingBalanceExport.js — ليبقى قابلاً للاختبار
  بلا حاجة لبيئة DOM.
 ============================================================================
*/
import * as XLSX from 'xlsx';
import { downloadBlob } from '../../lib/downloadBlob';

function buildXlsxBlob(header, rows) {
  const data = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** productsRef.bySku -> صف لكل منتج: SKU، الاسم، يُباع؟، مخزَّن؟ */
export function buildProductsRefRows(productsRef, t) {
  const header = [
    t({ ar: 'رمز المنتج (SKU)', en: 'SKU' }),
    t({ ar: 'الاسم', en: 'Name' }),
    t({ ar: 'يُباع؟', en: 'Sellable' }),
    t({ ar: 'مخزَّن؟', en: 'Stocked' }),
  ];
  const yes = t({ ar: 'نعم', en: 'Yes' });
  const no = t({ ar: 'لا', en: 'No' });
  const unknown = t({ ar: 'غير معروف', en: 'Unknown' });
  const rows = Array.from((productsRef?.bySku || new Map()).values()).map((p) => [
    p.sku, p.name || '', p.sellable ? yes : no, p.stocked === null ? unknown : (p.stocked ? yes : no),
  ]);
  return { header, rows };
}

/**
 * stockRef.byKey (مفتاحه sku+'||'+اسم الموقع -> كمية) -> صف لكل (منتج × موقع)،
 * مع اسم المنتج مُستخرَجًا من productsRef.bySku (الأداة تجلب الاثنين معًا دومًا
 * عبر fetchSalesReferencesFromApi، فproductsRef متاح دائمًا وقت هذا التنزيل).
 */
export function buildStockRefRows(stockRef, productsRef, t) {
  const header = [
    t({ ar: 'رمز المنتج (SKU)', en: 'SKU' }),
    t({ ar: 'اسم المنتج', en: 'Product name' }),
    t({ ar: 'الموقع', en: 'Location' }),
    t({ ar: 'الكمية', en: 'Quantity' }),
  ];
  const bySku = productsRef?.bySku || new Map();
  const rows = Array.from((stockRef?.byKey || new Map()).entries()).map(([key, qty]) => {
    const sep = key.indexOf('||');
    const sku = sep >= 0 ? key.slice(0, sep) : key;
    const loc = sep >= 0 ? key.slice(sep + 2) : '';
    return [sku, bySku.get(sku)?.name || '', loc, qty];
  });
  return { header, rows };
}

/** customersRef.byRef -> صف لكل عميل: المرجع (id بمسار API)، الاسم، الحالة */
export function buildCustomersRefRows(customersRef, t) {
  const header = [
    t({ ar: 'الرقم المرجعي', en: 'Reference' }),
    t({ ar: 'الاسم', en: 'Name' }),
    t({ ar: 'الحالة', en: 'Status' }),
  ];
  const active = t({ ar: 'نشط', en: 'Active' });
  const inactive = t({ ar: 'غير نشط', en: 'Inactive' });
  const rows = Array.from((customersRef?.byRef || new Map()).values()).map((c) => [
    c.ref, c.name || '', c.active ? active : inactive,
  ]);
  return { header, rows };
}

export function downloadProductsRefFile(productsRef, filename, t) {
  const { header, rows } = buildProductsRefRows(productsRef, t);
  downloadBlob(buildXlsxBlob(header, rows), filename);
}

export function downloadStockRefFile(stockRef, productsRef, filename, t) {
  const { header, rows } = buildStockRefRows(stockRef, productsRef, t);
  downloadBlob(buildXlsxBlob(header, rows), filename);
}

export function downloadCustomersRefFile(customersRef, filename, t) {
  const { header, rows } = buildCustomersRefRows(customersRef, t);
  downloadBlob(buildXlsxBlob(header, rows), filename);
}
