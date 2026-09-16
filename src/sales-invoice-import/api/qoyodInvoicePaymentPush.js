/*
 ============================================================================
  qoyodInvoicePaymentPush — إنشاء سند قبض مرتبط بفاتورة حقيقية بمنشأة العميل
  (POST /2.0/invoice_payments)، بعد نجاح إنشاء تلك الفاتورة فعليًا عبر
  qoyodSalesInvoicePush.js. راجع تعليق رأس engine/receipts.js للسياق الكامل
  (شكل ملف العميل، سبب اختيار هذا الـendpoint بالذات دون /receipts العام).

  حمولة الإنشاء (مؤكَّدة من config/qoyod-openapi-v2.1.yaml، قسم Invoice Payments):
    POST /2.0/invoice_payments
    { invoice_payment: { invoice_id, amount, account_id, date, reference?, description? } }
  الخادم يضبط تلقائيًا contact_id من الفاتورة نفسها وkind="received" وis_receipt=true
  وينشئ الربط (allocation) مباشرة — لا حاجة لأي خطوة تخصيص يدوية منفصلة.
  شرط صريح: الفاتورة يجب ألا تكون Draft ولا "بانتظار الاعتماد" وقت الإنشاء
  (422 "Cannot pay Draft invoice") — يُفرَض من المستدعي (qoyodSalesInvoicePush.js)
  بفحص invoice.status الفعلي بعد إنشائها، لا افتراض حالة الإرسال المطلوبة.

  الرد (ReceiptResponse بالمواصفة): {receipt:{id,...}} — بلا تأكيد ميداني حي بعد
  لهذا الـendpoint تحديدًا (بخلاف /inventories وPOST /invoices الموثَّقين حيًا
  بهذا المشروع)، فنتعامل دفاعيًا مع رد غير مغلَّف أيضًا (id مباشرة على الجذر) —
  نفس نمط pushMissingEntitiesToQoyod (location/describeUnexpectedResponse).
 ============================================================================
*/
import { api } from '../../product-upload/io/network.js';
import { fromDMY } from '../engine/dates.js';

function describeUnexpectedResponse(res) {
  try {
    const s = JSON.stringify(res);
    return s && s.length ? s.substring(0, 300) : String(res);
  } catch {
    return String(res);
  }
}

/**
 * amount: number. date: نص بصيغة DD/MM/YYYY (نفس صيغة أي عمود تاريخ آخر بالأداة
 * بعد normalizeDateToDMY وقت الاستيراد) — يُحوَّل هنا لـYYYY-MM-DD عبر fromDMY
 * (نفس الدالة المستخدَمة لـissue_date/due_date بـbuildSalesInvoicePayload).
 */
export function buildInvoicePaymentPayload({ invoiceId, amount, accountId, date, reference, description } = {}) {
  if (!invoiceId) return { ok: false, error: 'معرّف الفاتورة الحقيقي مفقود' };
  if (!accountId) return { ok: false, error: 'حساب الدفع مفقود أو غير مطابَق بحساب حقيقي' };
  const amt = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return { ok: false, error: 'قيمة الدفعة يجب أن تكون رقمًا أكبر من صفر' };
  const isoDate = fromDMY(date);
  if (!isoDate) return { ok: false, error: `تعذّر قراءة تاريخ سند القبض ("${date || '—'}")` };
  const payload = { invoice_id: invoiceId, amount: String(amt), account_id: accountId, date: isoDate };
  if (reference) payload.reference = reference;
  if (description) payload.description = description;
  return { ok: true, payload };
}

/** ينفّذ POST /2.0/invoice_payments فعليًا. built = payload من buildInvoicePaymentPayload أعلاه. */
export async function pushInvoicePayment(built, apiKey) {
  const res = await api('POST', '/invoice_payments', { invoice_payment: built }, apiKey);
  const receipt = res && (res.receipt || (res.id != null ? res : null));
  if (receipt && receipt.id != null) return { ok: true, id: receipt.id, response: receipt };
  return { ok: false, error: `رد غير متوقع من قيود (بلا معرّف سند قبض): ${describeUnexpectedResponse(res)}` };
}
