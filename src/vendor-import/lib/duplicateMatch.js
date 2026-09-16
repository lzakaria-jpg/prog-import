/*
 ============================================================================
  duplicateMatch.js — كشف التكرار بالاسم (تام أو ضبابي) بين صفوف الملف
  والعملاء/الموردين الموجودين فعلاً بحساب قيود الحي — قبل الإنشاء عبر API.
 ============================================================================
  لا خوارزمية تشابه جديدة هنا إطلاقاً — يُعاد استخدام accountNameSimilarity
  الموجودة فعلاً بـsrc/lib/excelCore.js (مُستخدَمة أصلاً بـMergeTool.jsx
  لنفس فكرة "تشابه اسمين عربيين")، بنفس عتبة 0.85 المعتمدة هناك
  (similarityNormalized(...) >= 0.85 بـMergeTool.jsx، راجع تعليقها).

  الإضافة الوحيدة هنا: تجريد الاسمين من كلمات الكيان القانوني الشائعة
  ("شركة"، "مؤسسة"، "مجموعة"...) *قبل* تمرير كليهما لـaccountNameSimilarity —
  خطوة تحضير مدخلات عادية بمطابقة الأسماء التجارية، لا خوارزمية تشابه بديلة.
  السبب: المثال الحقيقي المعتمَد من المستخدم — اسم موجود "خميس محمد السندواي"
  مقابل اسم بالملف "شركة خميس محمد السنداوي" — يجب أن يتطابق ضبابياً، لكن
  accountNameSimilarity مباشرة على النصين الكاملين تُعطي 0.70 فقط (كلمة
  "شركة" الإضافية + طول النص المختلف يُنقصان الدرجة تحت أي عتبة معقولة)، بينما
  تجريد "شركة" من الاسمين أولاً يرفعها إلى 0.89 — نفس المقارنة الجوهرية
  المقصودة (هل الاسمان التجاريان نفس الجهة، بصرف النظر عن بادئة الشكل
  القانوني)، بلا أي تغيير على accountNameSimilarity نفسها.
 ============================================================================
*/
import { accountNameSimilarity, normalizeAccountName } from '../../lib/excelCore.js';

export const FUZZY_THRESHOLD = 0.85;

const ENTITY_WORDS = new Set([
  'شركه', 'مؤسسه', 'مجموعه', 'مصنع', 'محل', 'متجر', 'مكتب', 'ورشه',
  'company', 'co', 'llc', 'ltd', 'corp', 'corporation', 'est', 'establishment', 'group', 'inc'
]);

function stripEntityWords(name) {
  const norm = normalizeAccountName(name);
  if (!norm) return norm;
  const toks = norm.split(' ').filter((t) => t && !ENTITY_WORDS.has(t));
  return toks.join(' ') || norm;
}

/** تطابق تام بالاسم بعد التطبيع (بلا تجريد كيان قانوني — تطابق حرفي كامل) */
export function isExactNameMatch(a, b) {
  const na = normalizeAccountName(a), nb = normalizeAccountName(b);
  return !!na && !!nb && na === nb;
}

/** درجة تشابه 0..1 بعد تجريد كلمات الكيان القانوني من الاسمين */
export function nameSimilarity(a, b) {
  return accountNameSimilarity(stripEntityWords(a), stripEntityWords(b));
}

/**
 * يبحث عن تطابق تام و/أو مرشّحين ضبابيين لاسم عميل/مورد ملف بين جهات الاتصال
 * الموجودة فعلاً (existingContacts: [{id, name, ...}]).
 * @returns {{exact: object|null, fuzzy: Array<{contact:object, score:number}>}}
 */
export function findDuplicateMatches(name, existingContacts) {
  const n = String(name || '').trim();
  if (!n || !existingContacts || !existingContacts.length) return { exact: null, fuzzy: [] };

  const exact = existingContacts.find((c) => isExactNameMatch(c.name, n)) || null;
  const fuzzy = existingContacts
    .filter((c) => c !== exact)
    .map((c) => ({ contact: c, score: nameSimilarity(c.name, n) }))
    .filter((x) => x.score >= FUZZY_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  return { exact, fuzzy };
}
