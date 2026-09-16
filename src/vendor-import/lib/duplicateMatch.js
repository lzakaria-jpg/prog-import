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

/*
 [إصلاح بطء حقيقي مبلَّغ ميدانياً 2026-09-16] بلاغ المستخدم: "صفحة التعديل بطيئة
 جداً". السبب المقيس: كل تعديل خانة واحدة كان يعيد مقارنة كل صفوف الملف بكل جهات
 اتصال المنشأة (75 صفاً × 1383 جهة = ~104 ألف مقارنة)، وكل مقارنة تُعيد تطبيع
 الاسمين وتجريدهما من الصفر ثم تحسب مصفوفة Levenshtein كاملة — لكل ضغطة زر.

 الحل بجزأين، بلا أي تغيير على نتيجة المطابقة نفسها:
   1. فهرس مبني مرة واحدة لكل قائمة جهات اتصال (buildContactIndex) — التطبيع
      والتجريد وبناء مجموعة الكلمات يحدث مرة واحدة لكل جهة، لا لكل مقارنة.
   2. تقليم رياضي قبل Levenshtein: مسافة Levenshtein ≥ فرق الطولين دائماً، فلو
      كان (1 − |فرق الطول| ÷ الأطول) أقل من العتبة، ودرجة الكلمات المشتركة أيضاً
      أقل منها، فيستحيل رياضياً بلوغ العتبة — يُستبعَد المرشّح بلا حساب المصفوفة.
      الدرجة النهائية للمرشّحين الناجين تُحسب بنفس accountNameSimilarity الأصلية
      حرفياً، فالمخرجات مطابقة تماماً لما قبل التحسين.
 نفس أسلوب buildRefIndex/resolveRefFast المعتمد أصلاً بـsrc/lib/excelCore.js.
*/

/** فهرس جهات الاتصال — يُبنى مرة واحدة لكل قائمة، ويُعاد استخدامه لكل صف */
export function buildContactIndex(existingContacts) {
  const entries = (existingContacts || []).map((contact) => {
    const norm = normalizeAccountName(contact?.name);
    const stripped = stripEntityWords(contact?.name);
    return { contact, norm, stripped, words: new Set(stripped ? stripped.split(' ') : []) };
  }).filter((e) => e.norm);
  return { entries };
}

function wordScoreOf(wordsA, wordsB) {
  if (!wordsA.size || !wordsB.size) return 0;
  let hits = 0;
  wordsA.forEach((w) => { if (wordsB.has(w)) hits += 1; });
  return hits / Math.max(wordsA.size, wordsB.size);
}

/** نفس findDuplicateMatches بالضبط، لكن على فهرس مبني مسبقاً (buildContactIndex) */
export function findDuplicateMatchesIndexed(name, index) {
  const raw = String(name || '').trim();
  if (!raw || !index || !index.entries.length) return { exact: null, fuzzy: [] };

  const qNorm = normalizeAccountName(raw);
  const qStripped = stripEntityWords(raw);
  const qWords = new Set(qStripped ? qStripped.split(' ') : []);
  if (!qNorm) return { exact: null, fuzzy: [] };

  let exact = null;
  const fuzzy = [];

  for (const e of index.entries) {
    if (!exact && e.norm === qNorm) { exact = e.contact; continue; }

    const a = e.stripped, b = qStripped;
    if (!a || !b) continue;

    let score;
    if (a === b) score = 1;
    else if (a.includes(b) || b.includes(a)) score = 0.9;
    else {
      const maxLen = Math.max(a.length, b.length);
      const lenGapCeiling = 1 - Math.abs(a.length - b.length) / maxLen;
      const ws = wordScoreOf(e.words, qWords);
      // يستحيل بلوغ العتبة بأي من المسارين ⇒ تخطٍّ بلا حساب Levenshtein
      if (Math.max(ws, lenGapCeiling) < FUZZY_THRESHOLD) continue;
      score = accountNameSimilarity(a, b);
    }

    if (score >= FUZZY_THRESHOLD) fuzzy.push({ contact: e.contact, score });
  }

  // المطابق تماماً يُستبعَد من قائمة المتشابهين (نفس سلوك النسخة الأصلية)
  const fuzzyOut = (exact ? fuzzy.filter((x) => x.contact !== exact) : fuzzy)
    .sort((a, b) => b.score - a.score);

  return { exact, fuzzy: fuzzyOut };
}

/**
 * يبحث عن تطابق تام و/أو مرشّحين ضبابيين لاسم عميل/مورد ملف بين جهات الاتصال
 * الموجودة فعلاً (existingContacts: [{id, name, ...}]).
 * غلاف مباشر فوق النسخة المفهرسة — يبني الفهرس لكل نداء، فلا يُستخدَم داخل حلقة
 * (استخدم buildContactIndex + findDuplicateMatchesIndexed هناك).
 * @returns {{exact: object|null, fuzzy: Array<{contact:object, score:number}>}}
 */
export function findDuplicateMatches(name, existingContacts) {
  return findDuplicateMatchesIndexed(name, buildContactIndex(existingContacts));
}
