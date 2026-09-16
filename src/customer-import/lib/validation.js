/**
 * validation.js — التحقق من صفوف ملف العملاء + كشف التكرار قبل الإرسال/التصدير.
 * كل رسالة خطأ هنا تقابل قاعدة حقيقية موثَّقة بمواصفة Qoyod الرسمية
 * (OpenAPI v2.1: POST/PUT /customers، /vendors) — راجع تعليقات كل دالة.
 */
import { norm, digitsOnly } from './text.js';
import { findDuplicateMatches } from './duplicateMatch.js';

const ACTIVE_WORDS = new Set(['active', 'نشط', 'فعال']);
const INACTIVE_WORDS = new Set(['inactive', 'غيرنشط', 'معطل', 'موقوف']);

/** ٩٦٦ + بالضبط ١٢ رقماً — مطابق حرفياً لمثال المواصفة الرسمية "+966501234567" */
export function normalizePhone(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  if (s.startsWith('+')) s = s.slice(1);
  return digitsOnly(s);
}

export function isValidPhone(raw) {
  const d = normalizePhone(raw);
  if (!d) return true; // فارغ = لا خطأ (الهاتف غير إلزامي أصلاً بالمواصفة الرسمية)
  return d.startsWith('966') && d.length === 12;
}

/** ١٥ رقماً بالضبط، يبدأ وينتهي بـ٣ — مطابق حرفياً لمثال المواصفة "312345678912343" */
export function normalizeTaxNumber(raw) {
  return digitsOnly(raw);
}

export function isValidTaxNumber(raw) {
  const d = normalizeTaxNumber(raw);
  if (!d) return true; // فارغ = لا خطأ
  return d.length === 15 && d[0] === '3' && d[14] === '3';
}

/** الحالة: نشط/فعال/Active أو غير نشط/معطل/موقوف/Inactive، والافتراض Active (نفس افتراض المواصفة الرسمية) */
export function normalizeStatus(raw) {
  const s = norm(raw);
  if (INACTIVE_WORDS.has(s)) return 'Inactive';
  if (ACTIVE_WORDS.has(s) || !s) return 'Active';
  return 'Active';
}

/** الرمز البريدي: تحذير فقط لا خطأ مانع — الشرط الرسمي مشروط بتفعيل ZATCA
 * بمنشأة العميل (إعداد لا تكشفه هذه الأداة)، فلا يمكن الجزم بإلزاميته هنا. */
export function isBillingZipPlausible(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return true;
  return /^\d{5}$/.test(s);
}

/**
 * فحص صف واحد؛ يملأ row.issues بقائمة {l:'e'|'w', m}، ويطبّع status/phone/tax
 * بحقول جاهزة لبناء حمولة API لاحقاً (contactsPush.js).
 */
export function validateRow(row) {
  const is = [];
  const E = (m) => is.push({ l: 'e', m });
  const W = (m) => is.push({ l: 'w', m });

  if (!row.name || !row.name.trim()) E('الاسم مفقود — حقل إلزامي');

  if (row.phone && !isValidPhone(row.phone)) {
    E('رقم التواصل الأساسي غير صالح — يجب أن يبدأ بـ966 ويتكوّن من 12 رقماً بالضبط');
  } else if (!row.phone) {
    W('لا يوجد رقم تواصل أساسي');
  }
  if (row.phone2 && !isValidPhone(row.phone2)) {
    E('رقم التواصل الثانوي غير صالح — يجب أن يبدأ بـ966 ويتكوّن من 12 رقماً بالضبط');
  }

  if (row.taxNumber && !isValidTaxNumber(row.taxNumber)) {
    E('الرقم الضريبي غير صالح — يجب أن يتكوّن من 15 رقماً، يبدأ وينتهي بالرقم 3');
  }

  if (!isBillingZipPlausible(row.billingZip)) {
    W('الرمز البريدي لعنوان الفوترة ليس 5 أرقام — قد يُرفض لو كانت خاصية ZATCA مفعّلة بمنشأة العميل');
  }

  row.statusNorm = normalizeStatus(row.status);
  row.issues = is;
  return is;
}

export const rowErr = (r) => r.issues.some((x) => x.l === 'e');
export const rowWarn = (r) => !rowErr(r) && r.issues.some((x) => x.l === 'w');

/**
 * الدورة الكاملة: تحقق كل صف + كشف تكرار الاسم مقابل جهات الاتصال الموجودة
 * فعلاً (existingContacts — عملاء أو موردون بحسب الأداة). التكرار تحذير لا
 * خطأ مانع، لكن يُبقي action الصف بلا قرار (null) حتى يختار المستخدم صراحةً
 * إنشاء/تحديث/تجاوز — لا تحديث تلقائي بلا تأكيد صريح لكل صف.
 */
export function validateAll(rows, existingContacts) {
  rows.forEach((row) => {
    validateRow(row);
    const { exact, fuzzy } = findDuplicateMatches(row.name, existingContacts || []);
    row.dupExact = exact;
    row.dupFuzzy = fuzzy;
    if (exact) {
      row.issues.push({ l: 'w', m: `اسم مطابق تماماً لعميل/مورد موجود فعلاً: «${exact.name}»${exact.id != null ? ` (#${exact.id})` : ''} — اختر إنشاء جديد أو تحديث الموجود` });
      if (row.action === undefined) row.action = null;
    } else if (fuzzy.length) {
      const best = fuzzy[0];
      row.issues.push({ l: 'w', m: `اسم مشابه جداً لعميل/مورد موجود: «${best.contact.name}»${best.contact.id != null ? ` (#${best.contact.id})` : ''} (تشابه ${(best.score * 100).toFixed(0)}%) — اختر إنشاء جديد أو تحديث الموجود` });
      if (row.action === undefined) row.action = null;
    } else if (row.action === undefined || row.action === null) {
      row.action = 'create';
    }
  });
  return rows;
}

/** هل الصف جاهز للإرسال المباشر عبر API؟ لا أخطاء مانعة، وقرار تكرار صريح لو وُجد تكرار */
export const rowReadyForApi = (r) => !rowErr(r) && r.action !== null && r.action !== undefined && r.action !== 'skip';
