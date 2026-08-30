/**
 * طبقة التعديل اليدوي — تُطبَّق على صفوف القالب النهائية (بعد transformAll، قبل
 * validateAll) في صفحة «المطابقة والمراجعة». تتعمّد عدم لمس أي منطق تحويل أو
 * مطابقة قائم: تعمل فوق مخرجاته مباشرة، بنفس شكل الأعمدة التي تُكتب في ملف
 * التصدير حرفياً — فتعديل «سعر الوحدة» مثلاً يُعدِّل القيمة المصدَّرة فعلياً،
 * لا مدخلاً وسيطاً يُعاد اشتقاقه.
 *
 * المفتاح الثابت لكل فاتورة عبر كل التعديلات هو `row._meta.invoiceRef` كما
 * أنتجه التحويل أول مرة — لا `row.invoiceRef` نفسه، لأن هذا الأخير حقل قابل
 * للتعديل (رقم/مرجع الفاتورة). التعديل على مستوى الفاتورة يُطبَّق على كل صفوفها
 * دفعة واحدة، بصرف النظر عن خيار تكرار بيانات الفاتورة.
 */

import { round, toNum, toStr } from './num.js';
import { YES } from './constants.js';

/** نسبة الضريبة من تسمية القالب: «ضريبة القيمة المضافة - 15.0%» → 0.15 */
export function taxLabelToPct(label) {
  const m = toStr(label).match(/(\d+(?:[.,]\d+)?)\s*%/);
  return m ? Number(m[1].replace(',', '.')) / 100 : 0;
}

/**
 * يحسب إجمالي صف واحد كما سيحسبه قيود فعلياً من حقوله الحالية — يُستخدم في
 * نتيجة التحليل والإجمالي المعروض لكل فاتورة، لا كحقل يُطلب من المستخدم إدخاله.
 * لو اجتمع خصم بالنسبة وبالقيمة معاً (حالة خطأ) يُعتمد النسبة للعرض التقريبي فقط؛
 * التحقق (validate.js) هو من يمنع التصدير في هذه الحالة، لا هذا الحساب.
 */
export function computeRowTotal(row) {
  const qty = toNum(row.quantity);
  const price = toNum(row.unitPrice);
  if (qty === null || price === null) return null;

  const gross = qty * price;
  const pct = toNum(row.discountPct);
  const val = toNum(row.discountVal);
  let net = gross;
  if (pct) net = gross * (1 - pct / 100);
  else if (val) net = gross - val;

  const rate = taxLabelToPct(row.taxRate);
  const total = row.taxInclusive === YES ? net : net * (1 + rate);
  return round(total, 2);
}

/** true إن كان الكائن يحمل مفاتيح فعلية (وليس {} فارغاً) */
function hasKeys(obj) {
  return !!obj && Object.keys(obj).length > 0;
}

export function overridesIsEmpty(overrides) {
  if (!overrides) return true;
  const header = overrides.header || {};
  const lines = overrides.lines || {};
  if (Object.values(header).some(hasKeys)) return false;
  if (Object.values(lines).some(byRow => Object.values(byRow || {}).some(hasKeys))) return false;
  return true;
}

/**
 * يطبّق تعديلات المستخدم على صفوف القالب النهائية.
 *
 * @param {object[]} rows صفوف transformAll (كل صف يحمل _meta.invoiceRef و _meta.sourceRow)
 * @param {{header?: object, lines?: object}} overrides
 *   header: { [invoiceKey]: { customerRef, invoiceRef, issueDate, dueDate, supplyDate,
 *             location, paymentMethod, terms, notes,
 *             docDiscountValue, docDiscountAccount, docDiscountTax } }
 *   lines:  { [invoiceKey]: { [sourceRow]: { productCode, productDesc, quantity,
 *             unitOfConv, unitPrice, discountPct, discountVal, taxRate } } }
 * @returns {object[]} صفوف جديدة (لا تُعدَّل rows الأصلية) بعد تطبيق كل تعديل معروف لها
 */
export function applyRowOverrides(rows, overrides) {
  if (overridesIsEmpty(overrides)) return rows;

  return rows.map(row => {
    const invKey = row._meta?.invoiceRef;
    const headerOv = invKey ? overrides.header?.[invKey] : null;
    const lineOv = invKey ? overrides.lines?.[invKey]?.[row._meta?.sourceRow] : null;
    if (!hasKeys(headerOv) && !hasKeys(lineOv)) return row;

    const next = { ...row, ...(headerOv || {}), ...(lineOv || {}) };

    // اختيار منتج من القائمة يمسح الوصف الحر — قيود يقبل أحدهما فقط، وقالب
    // المنتج هنا مقيَّد بقائمة اختيار لا نص حر (لا يوجد مسار يملأ كليهما معاً)
    if (lineOv && Object.prototype.hasOwnProperty.call(lineOv, 'productCode') && toStr(lineOv.productCode)) {
      next.productDesc = '';
    }

    next._meta = { ...row._meta, expectedTotal: computeRowTotal(next) ?? row._meta?.expectedTotal, edited: true };
    return next;
  });
}

/** يعيد بناء تقرير المطابقة الحسابية (لكل فاتورة) من الصفوف بعد التعديل */
export function recomputeReconciliation(rows) {
  const byInvoice = new Map();
  for (const r of rows) {
    const key = r._meta?.invoiceRef ?? r.invoiceRef;
    if (!byInvoice.has(key)) {
      byInvoice.set(key, { invoiceRef: r.invoiceRef || key, lineCount: 0, expectedTotal: 0 });
    }
    const g = byInvoice.get(key);
    g.lineCount++;
    g.invoiceRef = r.invoiceRef || g.invoiceRef; // يتحدَّث لو غُيِّر رقم الفاتورة نفسه
    g.expectedTotal = round(g.expectedTotal + (r._meta?.expectedTotal || 0), 2);
  }
  return [...byInvoice.values()];
}
