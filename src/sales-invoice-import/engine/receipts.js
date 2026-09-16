/*
 ============================================================================
  engine/receipts.js — سندات القبض المرتبطة بفواتير ضمن نفس ملف العميل الخام
  (طلب صريح من المستخدم 2026-09-16، راجع بلاغ اختبار حي يحمل ملفًا فيه صفوف
  "فاتورة" وصفوف "سند قبض" بنفس مرجع الفاتورة).
  ============================================================================
  شكل الملف الخام: عمود "النوع" (اختياري تمامًا — بلا هذا العمود كل الصفوف
  تُعامَل كفواتير كما كان دومًا، توافق تام مع كل الملفات القديمة) يميّز صف
  "فاتورة" (بند فاتورة عادي، لا تغيير) عن صف "سند قبض" (لا بنود منتج/موقع
  إطلاقًا — فقط: نفس مرجع الفاتورة A، نفس العميل C، تاريخ السند D، قيمة الدفعة
  وحساب الدفع الجديدان — راجع AUX_FIELD_KEYWORDS._docType/_paymentAmount/
  _paymentAccountCode بـconstants.js).

  API المستخدَم: POST /2.0/invoice_payments (مؤكَّد من config/qoyod-openapi-v2.1.yaml)
  — endpoint مخصَّص بالضبط لهذي الحالة (لا /receipts العام + allocation يدوي/
  تلقائي المستخدَم لحالات أعم): يستقبل invoice_id/amount/account_id/date فقط،
  ويضبط تلقائيًا contact_id من الفاتورة وkind="received" وis_receipt=true
  وينشئ الربط (allocation) مباشرة — هذا بالضبط "إضافة سند قبض وربطه بفاتورة"
  المطلوب. شرط صريح بالمواصفة: الفاتورة يجب ألا تكون Draft أو "بانتظار الاعتماد"
  وقت إنشاء السند (422 "Cannot pay Draft invoice") — لذلك سند القبض لا يُنشأ إلا
  بعد نجاح إنشاء الفاتورة فعليًا بحالة غير Draft (راجع qoyodSalesInvoicePush.js).

  المطابقة الفعلية (كود حساب الدفع → account_id حقيقي) لا تحدث هنا — هذا ملف
  دوال نقية فقط (بناء الخطة). المطابقة تحدث بلوحة مراجعة مخصَّصة قبل الإرسال
  (PaymentAccountsReviewPanel.jsx)، بنفس فلسفة locationIdByName/productsIndex:
  تُمرَّر Map جاهزة (accountId لكل accountCode) وقت الإرسال الفعلي.
 ============================================================================
*/
import { norm, isBlank } from './text.js';

// كلمات تدل على أن الصف "سند قبض" لا "فاتورة" — تطابق جزئي (includes) بعد
// التطبيع، يشمل الصياغة العربية والإنجليزية الشائعة لنفس المفهوم.
const RECEIPT_TYPE_MARKERS = ['سند قبض', 'سند', 'قبض', 'receipt voucher', 'receipt'];

export function isReceiptRow(row) {
  if (!row || isBlank(row.docType)) return false;
  const v = norm(row.docType).toLowerCase();
  return RECEIPT_TYPE_MARKERS.some((m) => v.includes(m.toLowerCase()));
}

/**
 * يبني خطة سندات القبض من rows (بعد fillDownHeaderFields/التحقق) — دالة نقية
 * قابلة للاختبار مباشرة، على نفس نمط computeMissingEntitiesPlan (validation.js).
 * لا تجميع هنا — كل صف "سند قبض" عنصر مستقل (فاتورة واحدة قد تحمل أكثر من
 * سند/دفعة جزئية، لا شيء يمنع ذلك هيكليًا لا بالملف ولا بـQoyod نفسه).
 * @returns {Array<{rowId, ref, date, amount, accountCode}>}
 *   amount: number أو NaN لو تعذّر التحويل (يُترَك للوحة المراجعة/التحقق لاحقًا).
 *   date: نص بصيغة DD/MM/YYYY (نفس صيغة أي عمود تاريخ آخر بالأداة بعد التطبيع).
 */
export function computeReceiptsPlan(rows) {
  return (rows || [])
    .filter(isReceiptRow)
    .map((row) => ({
      rowId: row.id,
      ref: norm(row.A),
      date: row.D,
      amount: parseFloat(row.paymentAmount),
      accountCode: norm(row.paymentAccountCode),
    }))
    .filter((r) => r.ref);
}
