/*
 ============================================================================
  contactsPush — إنشاء/تحديث الموردين الجاهزين (بعد اجتياز كل تحقق الأداة —
  راجع validation.js) مباشرة بحساب قيود عبر REST API، مبنية على نفس فلسفة
  bill-import/lib/billsPush.js تمامًا (مستقلة صفاً بصف، فشل صف واحد لا يوقف
  الباقي، تأخير 300ms بين الطلبات، قابلة للإيقاف اليدوي عبر stoppedRef).

  [ملاحظة مهمة] لا حقل "الرقم المرجعي" (Ref. No.) في هذه الحمولة إطلاقاً —
  لا يوجد حقل حقيقي موثَّق بمواصفة Qoyod الرسمية لإرساله إليه لا لـ/customers
  ولا لـ/vendors (راجع تعليق رأس lib/refSuggest.js للتفصيل الكامل). المرجع
  يبقى محلياً بالأداة/ملف التصدير فقط.
 ============================================================================
*/
import { createContact, updateContact } from './api.js';
import { normalizePhone, normalizeTaxNumber } from './validation.js';
import { HAS_SHIPPING } from './fields.js';

const RATE_LIMIT_MS = 300; // نفس التأخير المستخدم فعليًا بأدوات API الأخرى بالمشروع

/**
 * يبني حمولة POST/PUT /customers أو /vendors من صف ملف واحد (بعد validateAll).
 * دالة نقية بالكامل — بلا أي إرسال فعلي هنا.
 * @returns {{ok:true, payload:object}|{ok:false, error:string}}
 */
export function buildContactPayload(row) {
  if (!row || !row.name || !row.name.trim()) return { ok: false, error: 'الاسم مفقود' };

  const payload = { name: row.name.trim(), status: row.statusNorm || 'Active' };
  if (row.organization) payload.organization = row.organization;
  if (row.website) payload.website = row.website;
  if (row.email) payload.email = row.email;
  if (row.email2) payload.secondary_email = row.email2;
  if (row.phone) payload.phone_number = '+' + normalizePhone(row.phone);
  if (row.phone2) payload.secondary_phone_number = '+' + normalizePhone(row.phone2);
  if (row.taxNumber) payload.tax_number = normalizeTaxNumber(row.taxNumber);

  const hasBilling = row.billingAddress || row.billingCity || row.billingState || row.billingZip || row.billingCountry;
  if (hasBilling) {
    payload.billing_address = {};
    if (row.billingAddress) payload.billing_address.billing_address = row.billingAddress;
    if (row.billingCity) payload.billing_address.billing_city = row.billingCity;
    if (row.billingState) payload.billing_address.billing_state = row.billingState;
    if (row.billingZip) payload.billing_address.billing_zip = row.billingZip;
    if (row.billingCountry) payload.billing_address.billing_country = row.billingCountry;
  }

  if (HAS_SHIPPING) {
    const hasShipping = row.shippingAddress || row.shippingCity || row.shippingState || row.shippingZip || row.shippingCountry;
    if (hasShipping) {
      payload.shipping_address = {};
      if (row.shippingAddress) payload.shipping_address.shipping_address = row.shippingAddress;
      if (row.shippingCity) payload.shipping_address.shipping_city = row.shippingCity;
      if (row.shippingState) payload.shipping_address.shipping_state = row.shippingState;
      if (row.shippingZip) payload.shipping_address.shipping_zip = row.shippingZip;
      if (row.shippingCountry) payload.shipping_address.shipping_country = row.shippingCountry;
    }
  }

  return { ok: true, payload };
}

/**
 * يرسل صفوفاً جاهزة (rowReadyForApi، بعد استبعاد الأخطاء والتكرارات بلا قرار)
 * إلى Qoyod عبر API — إنشاء، أو تحديث عند action==='update' (بمعرّف
 * row.updateTargetId أو row.dupExact.id).
 * @param {Array} rows صفوف buildRows بعد validateAll
 * @param {string} apiKey
 * @param {{onEntry?:Function, onProgress?:Function, stoppedRef?:{current:boolean}}} [opts]
 */
export async function pushContactsToQoyod(rows, apiKey, opts = {}) {
  const { onEntry, onProgress, stoppedRef } = opts;
  const entries = [];
  const emit = (entry) => { entries.push(entry); if (onEntry) onEntry(entry); };

  const key = (apiKey || '').trim();
  if (!key) return { total: 0, sent: 0, failed: 0, stoppedEarly: false, fatalError: 'أدخل مفتاح API أولاً', entries };
  if (!rows || !rows.length) return { total: 0, sent: 0, failed: 0, stoppedEarly: false, fatalError: 'لا توجد صفوف جاهزة للإرسال', entries };

  let sent = 0, failed = 0, stoppedEarly = false;

  for (let i = 0; i < rows.length; i++) {
    if (stoppedRef && stoppedRef.current) { stoppedEarly = true; break; }
    const row = rows[i];
    if (onProgress) onProgress(i, rows.length);

    const built = buildContactPayload(row);
    const label = row.name || row.ref || `#${row.i}`;
    if (!built.ok) {
      failed++;
      emit({ ref: label, status: 'error', reason: built.error });
    } else {
      try {
        const isUpdate = row.action === 'update';
        const targetId = row.updateTargetId ?? (row.dupExact ? row.dupExact.id : null);
        const res = (isUpdate && targetId != null)
          ? await updateContact(targetId, built.payload, key)
          : await createContact(built.payload, key);
        const created = res && res.contact;
        if (created && created.id != null) {
          sent++;
          emit({ ref: label, status: 'success', id: created.id, action: isUpdate ? 'update' : 'create', response: created });
        } else {
          failed++;
          emit({ ref: label, status: 'error', reason: 'رد غير متوقع من Qoyod (بلا معرّف جهة اتصال)' });
        }
      } catch (e) {
        failed++;
        emit({ ref: label, status: 'error', reason: e.message || String(e) });
      }
    }

    if (i < rows.length - 1) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  if (onProgress) onProgress(entries.length, rows.length);
  return { total: rows.length, sent, failed, stoppedEarly, entries };
}
