/*
 ============================================================================
  accountFilters — تصفية دليل حسابات المنشأة (GET /accounts) حسب نوع الاستخدام،
  لعرض قوائم منسدلة مختصرة وذات معنى بلوحات المراجعة (بدل دليل الحسابات الكامل
  لكل حقل)، طلب صريح من المستخدم 2026-09-17.
  ============================================================================
  [قيد معروف] AccountResponse (GET /accounts، راجع config/qoyod-openapi-v2.1.yaml)
  يكشف فقط type (Asset/Liability/Revenue/Expense/Equity، خشن) وgroup_type (تسمية
  محلَّية، مثال "Current Assets") — لا يكشف account_kind الدقيق (inventory/
  bank_account/cost_of_sales/sales/...، من AccountInput فقط، حقل إنشاء لا قراءة).
  لذلك:
    - حساب المصروف/الإيراد: type وحده كافٍ ودقيق (مطابق لطلب المستخدم حرفيًا:
      "حسابات المصروف فقط"/"حسابات الإيرادات فقط" — لا "تكلفة مبيعات" تحديدًا).
    - حساب المخزون (للموقع) وحساب النقد/البنك (للدفع): لا حقل حاسم متاح، فالتصفية
      هنا استدلالية (type==='Asset' + كلمات مفتاحية بـgroup_type/الاسم) غير
      مؤكَّدة ميدانيًا بعد — ترجع القائمة الكاملة (Asset) تلقائيًا لو لم تُطابق
      أي كلمة مفتاحية إطلاقًا (حتى لا تُصبح القائمة فارغة تمامًا لو كان افتراض
      التصنيف خاطئًا)، والبحث اليدوي بالكود/الاسم (SearchableSelect) يبقى متاحًا
      دومًا بجميع الحالات.
 ============================================================================
*/

const CASH_BANK_KEYWORDS = ['نقد', 'بنك', 'صندوق', 'cash', 'bank', 'petty'];
const INVENTORY_KEYWORDS = ['مخزون', 'بضاعة', 'بضائع', 'inventory', 'stock'];

function accountText(a) {
  return `${a?.group_type || ''} ${a?.name_ar || ''} ${a?.name_en || ''}`.toLowerCase();
}

export const isExpenseAccount = (a) => a?.type === 'Expense';
export const isRevenueAccount = (a) => a?.type === 'Revenue';
export const isAssetAccount = (a) => a?.type === 'Asset';

export const isCashOrBankAccount = (a) => isAssetAccount(a) && CASH_BANK_KEYWORDS.some((kw) => accountText(a).includes(kw));
export const isInventoryAccount = (a) => isAssetAccount(a) && INVENTORY_KEYWORDS.some((kw) => accountText(a).includes(kw));

/**
 * accounts.filter(predicate)، مع تراجع آمن: لو النتيجة فارغة تمامًا (الاستدلال
 * لم يطابق شيئًا — قد يعني فقط أن دليل حسابات هذي المنشأة لا يحمل الكلمات
 * المفتاحية المتوقَّعة)، ترجع fallbackPredicate(accounts) بدل قائمة فارغة تمامًا
 * (تُعطِّل الحقل بلا أي خيار للمستخدم). fallbackPredicate افتراضيًا isAssetAccount.
 */
export function filterAccountsWithFallback(accounts, predicate, fallbackPredicate = isAssetAccount) {
  const list = accounts || [];
  const matched = list.filter(predicate);
  if (matched.length) return matched;
  return list.filter(fallbackPredicate);
}
