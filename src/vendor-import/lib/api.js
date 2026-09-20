/**
 * api.js — جلب الموردين الموجودين فعلاً (GET /vendors) وإنشاء/تحديث عميل
 * (POST/PUT /vendors) عبر واجهة قيود البرمجية.
 * يُعاد استخدام src/product-upload/io/network.js's api()/fetchAll() حرفياً —
 * نفس الوكيل (PROXY_BASE) ونفس محدِّد المعدّل المشترك بين كل أدوات المشروع
 * (300 طلب/60 ثانية لكل منشأة)، بدل إعادة تعريف طبقة شبكة محلية جديدة.
 */
import { api, fetchAll } from '../../product-upload/io/network.js';
import { RESOURCE } from './fields.js';

/** جهة اتصال مُطبَّعة من استجابة ContactResponse — الحقول التي تحتاجها هذه الأداة فقط */
function normContact(c) {
  return {
    id: c.id,
    name: String(c.name || c.organization || '').trim(),
    organization: String(c.organization || '').trim(),
    status: c.status,
    email: c.email || '',
    phone: c.phone_number || '',
    taxNumber: c.tax_number || '',
    raw: c,
  };
}

/** كل الموردين الموجودين فعلاً بالمنشأة — لكشف التكرار قبل الإنشاء */
export async function fetchExistingContacts(apiKey) {
  const raw = await fetchAll(`/${RESOURCE}`, apiKey);
  return raw.map(normContact).filter((c) => c.name);
}

export async function createContact(payload, apiKey) {
  return api('POST', `/${RESOURCE}`, { contact: payload }, apiKey);
}

export async function updateContact(id, payload, apiKey) {
  return api('PUT', `/${RESOURCE}/${id}`, { contact: payload }, apiKey);
}
