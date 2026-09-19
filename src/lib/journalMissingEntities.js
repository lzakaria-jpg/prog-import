/*
 ============================================================================
  journalMissingEntities — يحوّل قائمة القيود + أخطاء التدقيق الحالية (issuesBySeq
  من JournalTool.jsx) إلى "خطة" كيانات ناقصة قابلة للإنشاء عبر API — طلب صريح
  من المستخدم 2026-09-21، نفس فلسفة computeMissingEntitiesPlan بأداة فواتير
  المبيعات (sales-invoice-import/engine/validation.js) حرفيًا: تجميع بالاسم/
  الرمز المُطبَّع، لا إعادة اكتشاف منطق مطابقة جديد — الأخطاء نفسها (المُثراة
  ببيانات إضافية داخل buildStructuralIssues بـJournalTool.jsx) هي مصدر الحقيقة
  الوحيد لما هو "ناقص فعلاً".
  ============================================================================
  دالة نقية بالكامل، بلا أي استدعاء شبكة — قابلة للاختبار المباشر.
 ============================================================================
*/
import { normalizeAccountName } from './excelCore.js';

// أنواع الأخطاء التي "لوحة مراجعة الكيانات الناقصة" الجديدة تعرض حلاً تلقائيًا
// لها — يُستثنى وجودها وحدها (بلا أي خطأ آخر) من حساب "هل القيد جاهز فعليًا
// للمراجعة/الإرسال بعد حل الناقص؟" (JournalTool.jsx، entriesPendingOnlyMissingEntities)،
// بخلاف قاعدة الإرسال الفعلي (sendableEntries) التي تبقى صفر أخطاء تمامًا
// كما كانت — لا تغيير على تلك القاعدة إطلاقًا.
export const MISSING_ENTITY_ISSUE_TYPES = new Set([
  'unknown_code', 'missing_customer_ref', 'missing_vendor_ref', 'missing_project', 'missing_location',
]);

/** هل قائمة أخطاء قيد واحد بأكملها من نوع "كيان ناقص قابل للحل تلقائيًا"؟ (قيد بلا أي خطأ آخر) */
export function issuesAreOnlyMissingEntities(issues) {
  return !!issues && issues.length > 0 && issues.every((i) => MISSING_ENTITY_ISSUE_TYPES.has(i.type));
}

function pushToGroup(map, key, seq, extra) {
  if (!map.has(key)) map.set(key, { ...extra, seqs: [] });
  const g = map.get(key);
  if (!g.seqs.includes(seq)) g.seqs.push(seq);
}

/**
 * يبني خطة الكيانات الناقصة من entries + issuesBySeq الحاليين (بعد آخر تدقيق).
 * يفحص فقط الأنواع الخمسة أعلاه؛ أي خطأ آخر (توازن، تاريخ، حساب أب...) يُتجاهَل
 * هنا تمامًا (لا علاقة له بهذه اللوحة).
 *
 * @param {Array} entries قيود الأداة الداخلية (لقراءة seq فقط هنا، لا شيء آخر)
 * @param {Object} issuesBySeq {seq: issue[]} — كما تبنيه JournalTool.jsx (المُثرى)
 * @returns {{accounts:Array, customers:Array, vendors:Array, projects:Array, locations:Array}}
 */
export function computeMissingJournalEntitiesPlan(entries, issuesBySeq) {
  const accounts = new Map();   // normalizedCode -> {code, nameFromFile, seqs}
  const customers = new Map();  // normalizedName -> {typedName, seqs}
  const vendors = new Map();
  const projects = new Map();   // normalizedName -> {typedName, seqs} (رصد فقط — لا إنشاء ممكن)
  const locations = new Map();

  (entries || []).forEach((entry) => {
    const issues = (issuesBySeq && issuesBySeq[entry.seq]) || [];
    issues.forEach((iss) => {
      if (iss.type === 'unknown_code' && iss.code) {
        const key = normalizeAccountName(iss.code) || String(iss.code).trim().toLowerCase();
        pushToGroup(accounts, key, entry.seq, { code: iss.code, nameFromFile: iss.accountNameFromFile || '' });
      } else if (iss.type === 'missing_customer_ref' && iss.typedName) {
        pushToGroup(customers, normalizeAccountName(iss.typedName), entry.seq, { typedName: iss.typedName });
      } else if (iss.type === 'missing_vendor_ref' && iss.typedName) {
        pushToGroup(vendors, normalizeAccountName(iss.typedName), entry.seq, { typedName: iss.typedName });
      } else if (iss.type === 'missing_project' && iss.typedName) {
        pushToGroup(projects, normalizeAccountName(iss.typedName), entry.seq, { typedName: iss.typedName });
      } else if (iss.type === 'missing_location' && iss.typedName) {
        pushToGroup(locations, normalizeAccountName(iss.typedName), entry.seq, { typedName: iss.typedName });
      }
    });
  });

  return {
    accounts: Array.from(accounts.values()),
    customers: Array.from(customers.values()),
    vendors: Array.from(vendors.values()),
    projects: Array.from(projects.values()),
    locations: Array.from(locations.values()),
  };
}

/** الخطة فارغة تمامًا (لا شيء لعرضه/إنشائه، ولا حتى مشاريع للرصد فقط)؟ */
export function isMissingJournalEntitiesPlanEmpty(plan) {
  return !plan || (
    !plan.accounts.length && !plan.customers.length && !plan.vendors.length &&
    !plan.projects.length && !plan.locations.length
  );
}
