/*
 ============================================================================
  accountFilters — تصفية دليل حسابات المنشأة (GET /accounts) حسب نوع
  الاستخدام، لعرض قوائم منسدلة مختصرة وذات معنى بمعاينة رفع المنتجات (بدل
  دليل الحسابات الكامل لكل حقل)، طلب صريح من المستخدم 2026-09-19: عند تعديل
  حساب الإيراد لمنتج معيّن تُعرض حسابات الإيراد فقط، وعند تعديل حساب المصروف
  تُعرض حسابات المصروف والأصول غير المتداولة معاً (بعض العملاء يرحّلون تكلفة
  منتج مُرسمَل إلى حساب أصل ثابت لا حساب مصروف تشغيلي).

  [قيد معروف، مطابق لنفس القيد المُوثَّق بـsales-invoice-import/engine/
  accountFilters.js] AccountResponse (GET /accounts، راجع
  config/qoyod-openapi-v2.1.yaml) يكشف فقط type (Asset/Liability/Revenue/
  Expense/Equity، خشن) وgroup_type (تسمية محلَّية، مثال "Current Assets") —
  لا يكشف account_kind الدقيق (property_plant_and_equipment/inventory/...،
  من AccountInput فقط، حقل إنشاء لا قراءة). لذلك:
    - حساب الإيراد/المصروف: type وحده كافٍ ودقيق.
    - "أصل غير متداول" تحديداً: لا حقل حاسم متاح، فالتصفية هنا استدلالية
      (type==='Asset' + كلمات مفتاحية بـgroup_type/الاسم) غير مؤكَّدة ميدانياً
      بعد — ترجع تراجعاً آمناً (isExpenseAccount) لو لم تُطابق أي كلمة مفتاحية
      إطلاقاً، لا قائمة فارغة ولا كامل دليل الحسابات (نفس أسلوب
      filterAccountsWithFallback أدناه، منقول حرفياً من نظيره بسالفة الذكر).
 ============================================================================
*/

const NON_CURRENT_ASSET_KEYWORDS = [
  'غير متداول', 'غير المتداولة', 'أصول ثابتة', 'الأصول الثابتة', 'ثابتة',
  'non-current', 'non current', 'noncurrent', 'fixed asset', 'fixed assets',
];

function accountText(a) {
  return `${a?.group_type || ''} ${a?.name_ar || ''} ${a?.name_en || ''}`.toLowerCase();
}

export const isExpenseAccount = (a) => a?.type === 'Expense';
export const isRevenueAccount = (a) => a?.type === 'Revenue';
export const isAssetAccount = (a) => a?.type === 'Asset';

export const isNonCurrentAssetAccount = (a) =>
  isAssetAccount(a) && NON_CURRENT_ASSET_KEYWORDS.some((kw) => accountText(a).includes(kw));

export const isExpenseOrNonCurrentAssetAccount = (a) => isExpenseAccount(a) || isNonCurrentAssetAccount(a);

/**
 * accounts.filter(predicate)، مع تراجع آمن: لو النتيجة فارغة تمامًا (الاستدلال
 * لم يطابق شيئًا)، ترجع fallbackPredicate(accounts) بدل قائمة فارغة تمامًا
 * (تُعطِّل الحقل بلا أي خيار للمستخدم).
 */
export function filterAccountsWithFallback(accounts, predicate, fallbackPredicate) {
  const list = accounts || [];
  const matched = list.filter(predicate);
  if (matched.length) return matched;
  return fallbackPredicate ? list.filter(fallbackPredicate) : list;
}
