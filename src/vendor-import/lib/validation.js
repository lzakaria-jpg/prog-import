/**
 * validation.js — التحقق من صفوف ملف الموردين + كشف التكرار قبل الإرسال/التصدير.
 * كل رسالة خطأ هنا تقابل قاعدة حقيقية موثَّقة بمواصفة Qoyod الرسمية
 * (OpenAPI v2.1: POST/PUT /customers، /vendors) — راجع تعليقات كل دالة.
 */
import { norm, digitsOnly } from './text.js';
import { buildContactIndex, findDuplicateMatchesIndexed } from './duplicateMatch.js';

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

/**
 * [إضافة 2026-09-21، طلب صريح من المستخدم] تصحيح تلقائي لرقم هاتف غير صالح —
 * يُستخدَم بزر "تطبيق كل التصحيحات التلقائية" بمرحلة المراجعة. يزيل صفراً
 * محلياً بادئاً شائعاً (0501234567) ثم يضيف 966 لو لم يكن موجوداً أصلاً —
 * التحويل الوحيد الآمن ميكانيكياً بلا أي تخمين. لا يقصّ ولا يكمل الأرقام لو
 * الناتج ليس 12 رقماً بالضبط (رقم فيه خانات ناقصة/زائدة فعلياً) — يُترك كما هو
 * بعد المحاولة، فيستمر isValidPhone برفضه برسالة واضحة بدل إخفاء الخطأ.
 */
export function autoFixPhone(raw) {
  let d = digitsOnly(raw);
  if (!d || d.startsWith('966')) return d;
  if (d.startsWith('0')) d = d.slice(1);
  return '966' + d;
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

/**
 * [إضافة 2026-09-21، طلب صريح من المستخدم] تصحيح تلقائي للرقم الضريبي —
 * لو كان يبدأ فعلاً بـ3 (كما يجب) لكن لا ينتهي بـ3، يُصحَّح آخر رقم فقط إلى 3
 * — التصحيح الميكانيكي الوحيد الآمن (بلا أي تخمين لأرقام مفقودة لو كان الطول
 * غير 15 أصلاً؛ عندها يبقى isValidTaxNumber يرفضه بخطأ الطول كما هو، بعد
 * تطبيق تصحيح آخر رقم بلا تغيير). رقم لا يبدأ بـ3 أصلاً، أو ينتهي بـ3 فعلاً،
 * يُعاد كما هو بلا أي تعديل.
 */
export function autoFixTaxNumber(raw) {
  const d = normalizeTaxNumber(raw);
  if (!d || d[0] !== '3' || d[d.length - 1] === '3') return d;
  return d.slice(0, -1) + '3';
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
export function validateAll(rows, existingContacts, prebuiltIndex) {
  // الفهرس يُبنى مرة واحدة لكل تشغيل، لا لكل صف — راجع تعليق buildContactIndex
  // بـduplicateMatch.js لسبب ذلك (بطء حقيقي مبلَّغ ميدانياً).
  const index = prebuiltIndex || buildContactIndex(existingContacts);
  rows.forEach((row) => validateRowWithDuplicates(row, index));
  return rows;
}

/**
 * [إضافة 2026-09-16] فحص صف واحد فقط مقابل فهرس جاهز — يُستدعى عند تعديل خانة
 * واحدة بجدول المراجعة بدل إعادة فحص كل صفوف الملف (تعديل صف لا يؤثر إطلاقاً
 * على نتيجة أي صف آخر: كل التحقق وكشف التكرار هنا يخص الصف ذاته وحده).
 */
export function validateRowWithDuplicates(row, index) {
  validateRow(row);
  const { exact, fuzzy } = findDuplicateMatchesIndexed(row.name, index);
  row.dupExact = exact;
  row.dupFuzzy = fuzzy;
  if (exact) {
    row.issues.push({ l: 'w', m: `اسم مطابق تماماً لمورد موجود فعلاً: «${exact.name}»${exact.id != null ? ` (#${exact.id})` : ''} — اختر إنشاء جديد أو تحديث الموجود` });
    if (row.action === undefined) row.action = null;
  } else if (fuzzy.length) {
    const best = fuzzy[0];
    row.issues.push({ l: 'w', m: `اسم مشابه جداً لمورد موجود: «${best.contact.name}»${best.contact.id != null ? ` (#${best.contact.id})` : ''} (تشابه ${(best.score * 100).toFixed(0)}%) — اختر إنشاء جديد أو تحديث الموجود` });
    if (row.action === undefined) row.action = null;
  } else if (row.action === undefined || row.action === null) {
    row.action = 'create';
  }
  return row;
}

/** هل الصف جاهز للإرسال المباشر عبر API؟ لا أخطاء مانعة، وقرار تكرار صريح لو وُجد تكرار */
export const rowReadyForApi = (r) => !rowErr(r) && r.action !== null && r.action !== undefined && r.action !== 'skip';
