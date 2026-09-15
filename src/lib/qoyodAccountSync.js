/*
 ============================================================================
  qoyodAccountSync — تحويل صفوف شجرة الحسابات الداخلية (MergeTool.jsx) إلى
  حسابات فعلية على منشأة العميل عبر Qoyod REST API، وإرسالها.
  ============================================================================
  [إضافة 2026-09-09] الخطوة الأولى من خطة "الاتصال المباشر بـAPI" (بدل قالب
  التصدير اليدوي فقط) — تحديدًا لأداة استيراد ومطابقة شجرة الحسابات.

  حقيقة مؤكدة ميدانيًا (اختبار حقيقي عبر apidoc.qoyod.com + طلب POST فعلي
  بمفتاح تجريبي للمستخدم، 2026-09-09) وليست افتراضًا:
    - GET/POST /accounts في Qoyod لا يحملان أي parent_id ولا level إطلاقًا.
      كل حساب سجل مستقل بالكامل على مستوى API — لا توجد علاقة أب/ابن حقيقية،
      خلافًا للتصنيف الهرمي الداخلي بهذه الأداة (5 مستوى1 → 12 مستوى2 → 59
      مستوى3، حتى 7 مستويات). التسلسل الهرمي بواجهة قيود نفسها بصري فقط
      (بادئة رمز الحساب)، لا تبعية إرسال بالترتيب مطلوبة.
    - حمولة POST /accounts: 6 حقول فقط:
        name_en (مطلوب وفريد), name_ar (مطلوب وفريد), code (مطلوب وفريد),
        description (اختياري), recieve_payments ["true"|"false"] (لاحظ
        التهجئة الناقصة — هذا الاسم الفعلي المقبول من Qoyod، مؤكد باختبار
        حقيقي، رغم أن نص التوثيق نفسه يكتبه "receive_payments" بالوصف)،
        type (مطلوب، من قائمة مغلقة 16 قيمة — QOYOD_ACCOUNT_TYPES تحت).
    - لا حقل "group_type" بالإرسال — Qoyod يحسبه تلقائيًا من type.

  هذا يعني: المشكلة الحقيقية هي تحويل تصنيف الأداة الدقيق (59 نوع) إلى أقرب
  واحدة من الـ16 قيمة المتاحة بـQoyod (mapAccountTypeToQoyod تحت) — وليست أي
  تعقيد بترتيب إرسال أو ربط معرّفات.
 ============================================================================
*/

// [إضافة 2026-09-15] مرجع أنواع حسابات قيود الرسمي (config/qoyod-account-types-
// reference.json) — مصدر الحقيقة الوحيد المعتمد من المستخدم للتحقق من دقة
// account_kind/parent_kind/branch_kind من الآن فصاعدًا (بدل استنتاجها من شجرة
// الأداة الداخلية، التي تعارضت معه بـ6 أنواع مستوى3 من أصل 59 — راجع تعليق
// "مواصفة Qoyod API الرسمية" وQOYOD_KIND_INFO_BY_KIND تحت).
import qoyodAccountTypesReference from "../../config/qoyod-account-types-reference.json";

// القيم الـ16 المسموح بها فعليًا بحقل "type" عند POST /accounts (من توثيق
// Qoyod الرسمي على apidoc.qoyod.com، صفحة "Create an account").
export const QOYOD_ACCOUNT_TYPES = {
  asset: ["FixedAsset", "CurrentAsset", "Bank", "Cash", "Inventory"],
  liability: ["Liability", "CurrentLiability", "NoncurrentLiability"],
  expense: ["Depreciation", "DirectCost", "Expense", "Overhead"],
  equity: ["Equity"],
  revenue: ["OtherIncome", "Revenue", "Sale"],
};
export const ALL_QOYOD_ACCOUNT_TYPES = Object.values(QOYOD_ACCOUNT_TYPES).flat();

// الافتراضي لكل فئة مستوى2 (12 فئة) — يُطبَّق أولاً، وقد يُستبدَل بعده بتخصيص
// أدق حسب نوع المستوى3 نفسه (QOYOD_TYPE_OVERRIDE_BY_LEVEL3 تحت).
//
// [افتراض يحتاج مراجعتك] Qoyod لا يوثّق فرق "Expense" عن "Overhead" دلاليًا —
// لعدم التخمين، كل تكاليف المستوى2 "تشغيلية"/"غير تشغيلية" تُرسَل كـ"Expense"
// العامة افتراضيًا، لا "Overhead". عدّل هذا الجدول لو عندك تعريف أدق منهم.
export const QOYOD_TYPE_BY_LEVEL2 = {
  "الأصول المتداولة": "CurrentAsset",
  "الأصول غير المتداولة": "FixedAsset",
  "الالتزامات المتداولة": "CurrentLiability",
  "الالتزامات غير المتداولة": "NoncurrentLiability",
  "رأس المال المصدر": "Equity",
  "حقوق الملاك الأخرى": "Equity",
  "الأرباح المبقاة": "Equity",
  "المبيعات": "Sale",
  "الإيرادات الأخرى": "OtherIncome",
  "التكلفة المباشرة": "DirectCost",
  "تكاليف تشغيلية": "Expense",
  "تكاليف غير تشغيلية": "Expense",
};

// تخصيص أدق لأنواع مستوى3 معينة تحتاج قيمة Qoyod أخص من افتراضي فئتها
// (مستوى2). كل سطر هنا قرار محاسبي صريح — راجعه:
//   - حساب البنك / النقدية ومافي حكمها / المخزون: قيم Qoyod مخصصة لها فعلاً
//     (Bank/Cash/Inventory) بدل CurrentAsset العام — مطابقة مباشرة واضحة.
//   - عهد نقدية (عهدة/سلفة نقدية للموظف): [افتراض] عُومِلت كـCash لأنها فعليًا
//     نقدية بحوزة شخص، لا CurrentAsset عام — راجعها لو تفضّل غير ذلك.
//   - مصاريف الاستهلاك / مصاريف الإطفاء: Qoyod عنده قيمة "Depreciation"
//     مخصصة تحديدًا لهذا — مطابقة مباشرة واضحة (الإطفاء أقرب مفهوم متاح لها).
export const QOYOD_TYPE_OVERRIDE_BY_LEVEL3 = {
  "حساب البنك": "Bank",
  "النقدية ومافي حكمها": "Cash",
  "عهد نقدية": "Cash",
  "المخزون": "Inventory",
  "مصاريف الاستهلاك": "Depreciation",
  "مصاريف الإطفاء": "Depreciation",
};

/**
 * يحوّل تصنيف الأداة الداخلي (نوع مستوى3 + فئة مستوى2) إلى أقرب قيمة من
 * الـ16 المتاحة بـQoyod. يرجّع null لو تعذّر الاستنتاج (لا فئة مستوى2 صالحة).
 * دالة نقية بالكامل — قابلة للاختبار المباشر.
 */
export function mapAccountTypeToQoyod(level3Type, level2Category) {
  const override = level3Type ? QOYOD_TYPE_OVERRIDE_BY_LEVEL3[level3Type] : null;
  if (override) return override;
  if (level2Category && QOYOD_TYPE_BY_LEVEL2[level2Category]) {
    return QOYOD_TYPE_BY_LEVEL2[level2Category];
  }
  return null;
}

// [تصحيح 2026-09-09] حسابات جذر مستوى1 المسموح بإنشائها (الإيرادات/المصاريف
// فقط - راجع LEVEL1_TYPES_ALLOWING_NEW بـMergeTool.jsx) لا فئة مستوى2 أصلاً
// لها - افتراض معقول لعدم وجود تصنيف Qoyod عام لكل الإيرادات/كل المصاريف.
export const QOYOD_TYPE_BY_LEVEL1_ROOT = {
  "الايرادات": "Revenue",
  "المصاريف": "Expense",
};

/**
 * [تصحيح 2026-09-09] بلاغ اختبار حي: حساب مستوى2 جديد (مثال: "12 - أصول غير
 * متداولة") فشل إرساله دومًا بـ"تعذّر تحديد نوع الحساب" حتى بعد اختيار
 * المستخدم لنوعه من القائمة - السبب: حساب مستوى2 يحمل فئته بحقل "type" نفسه
 * لا "level2Category" (قاعدة ثابتة معتمدة بكل منطق الشجرة الداخلي بـ
 * MergeTool.jsx - راجع تعليق "حساب مستوى 2 يحمل فئته في حقل type نفسه" هناك)،
 * لكن buildQoyodAccountPayload كان يمرر row.type دومًا كـ"نوع مستوى3" بصرف
 * النظر عن مستوى الصف الفعلي، فتظل level2Category فارغة لأي صف مستوى2 مهما
 * اختار المستخدم - فشل مضمون 100% بلا علاقة باختياره. هذه الدالة تصحح ذلك:
 * تقرأ مستوى الصف فعليًا وتحدد أي حقل يحمل الفئة الحقيقية قبل الاستنتاج.
 * دالة نقية، مُصدَّرة، قابلة للاختبار المباشر - ويجب استخدامها (لا
 * mapAccountTypeToQoyod مباشرة) لأي صف قادم من MergeTool.jsx.
 */
export function mapRowToQoyodType(row) {
  const level = Number(row?.level);
  if (level === 1) return QOYOD_TYPE_BY_LEVEL1_ROOT[row?.type] || null;
  if (level === 2) return mapAccountTypeToQoyod("", row?.type || "");
  return mapAccountTypeToQoyod(row?.type, row?.level2Category);
}

// ============================================================================
// [إضافة 2026-09-14] مواصفة Qoyod API الرسمية (OpenAPI v2) — طبقة ثانية إضافية
// ============================================================================
// طلب صريح من المستخدم (2026-09-14): "القديم شغال طبيعي، بس التحديث مهم" —
// مواصفة OpenAPI الرسمية توثّق حمولة POST /accounts مختلفة تماماً عن الشكل
// القديم المثبت ميدانياً أعلاه: en_name/ar_name (لا name_en/name_ar)،
// account_kind (مطلوب، ~40 قيمة دقيقة)، parent_kind (مطلوب، 5 قيم)، branch_kind
// (مطلوب، 12 قيمة) — راجع AccountInput بملف الـYAML الرسمي، سطر 8874.
//
// القرار الهندسي: الحقول الجديدة تُضاف *بجانب* الحقول القديمة (لا تستبدلها) —
// راجع buildQoyodAccountPayload تحت. هذا يحترم طلب المستخدم الصريح بعدم المساس
// بآلية العمل الصحيحة المثبتة ميدانياً: لو قيود لسا يعتمد الحقول القديمة فقط،
// تستمر الأداة تعمل بالضبط كما كانت (صفر تغيير سلوك)؛ ولو صار يتطلب/يفضّل
// الحقول الجديدة، فهي مُرسَلة بالفعل وصحيحة معه.
//
// دليل ثقة عالٍ (لا تخمين اعتباطي) لربط parent_kind/branch_kind بتصنيف الأداة
// الداخلي: قيم branch_kind الاثنتا عشرة الرسمية تطابق حرفياً (تطابق 1:1 كامل،
// بلا زيادة ولا نقصان) فئات المستوى2 الاثنتي عشرة المعتمدة أصلاً بهذه الأداة
// (LEVEL2_TO_LEVEL1 بـMergeTool.jsx) — وكذلك قيم parent_kind الخمس تطابق جذور
// المستوى1 الخمسة تماماً. هذا شبه مؤكَّد أن قيود بنى enum هذه الحمولة على نفس
// شجرة الحسابات المعيارية التي بُنيت عليها هذه الأداة أصلاً، لا تصنيف مختلف.
//
// أما account_kind (الأدق، 40 قيمة موزّعة على الفروع الـ12) فبعض خلاياها غير
// مؤكَّدة 100% (لا مثال رسمي محدد لكل قيمة) — كل خلية "[تقدير]" أدناه هي أفضل
// مطابقة ممكنة ضمن نفس الفرع الصحيح (لا تُخرِج الحساب أبداً من فرعه الصحيح،
// فقط قد لا تكون الوسم الأدق الممكن لو توفّر بديل أدق مستقبلاً) — راجعها.
// ============================================================================

// [إضافة 2026-09-15] {account_kind: {parentKind, branchKind}} مبنية مباشرة من
// المرجع الرسمي (config/qoyod-account-types-reference.json، حقل accountKinds) —
// هذا الآن المصدر الوحيد لـparent_kind/branch_kind لأي account_kind، بدل
// اشتقاقهما من فئة مستوى2 الداخلية للأداة (QOYOD_BRANCH_KIND_BY_LEVEL2 تحت،
// المُبقاة فقط للتحقق من أن فئة مستوى2 معروفة قبل الاستنتاج). طلب المستخدم
// الصريح 2026-09-15: "أصلحه الحين (اشتقاق branch/parent من الـkind) واضح
// ومؤكد بالمرجع." — راجع mapRowToQoyodAccountKind تحت لطريقة الاستخدام.
export const QOYOD_KIND_INFO_BY_KIND = Object.freeze(
  Object.fromEntries(
    Object.values(qoyodAccountTypesReference.accountKinds)
      .flat()
      .map((k) => [k.kind, { parentKind: k.parent_kind, branchKind: k.branch_kind, nameAr: k.name_ar, nameEn: k.name_en }])
  )
);

// [إضافة 2026-09-15] الأنواع الثمانية المقفلة نظاميًا بقيود (systemLockedAccounts
// بالمرجع) — لا يجوز إنشاؤها عبر API إطلاقًا (Qoyod يديرها تلقائيًا/عبر وحدات
// خاصة كالبنك). قرار المستخدم الصريح: استبعادها من الإرسال + تنبيه المستخدم،
// لا استبدالها بأقرب نوع بديل. راجع buildQoyodAccountPayload تحت.
export const QOYOD_LOCKED_ACCOUNT_KINDS = new Set(qoyodAccountTypesReference.systemLockedAccounts || []);

// parent_kind يُشتَق حصراً من branch_kind (علاقة ثابتة لا لبس فيها، مؤكَّدة من
// نص التوثيق: "type_of_account auto-set based on parent_kind") — لا حاجة
// لجدول منفصل من level1، ولا لاستيراد من MergeTool.jsx (طبقة مستقلة نقية).
// [إبقاء 2026-09-15] لم تعد تُستخدم لاشتقاق parentKind/branchKind النهائيين
// (ذلك الآن حصرًا عبر QOYOD_KIND_INFO_BY_KIND أعلاه) — أُبقيت فقط كمرجع تاريخي
// موثَّق لعلاقة branch→parent، بلا أي استخدام فعلي بالكود تحت.
const QOYOD_PARENT_KIND_BY_BRANCH = {
  current_assets: "assets",
  fixed_assets: "assets",
  current_liability: "liability",
  non_current_liability: "liability",
  issued_capital: "equity",
  other_equity: "equity",
  retained_earnings: "equity",
  sales: "revenue",
  non_operative_revenue: "revenue",
  direct_cost: "expense",
  operational_cost: "expense",
  non_operational_expense: "expense",
};

// branch_kind من فئة المستوى2 — مطابقة 1:1 مباشرة (راجع تعليق "دليل ثقة عالٍ" أعلاه).
export const QOYOD_BRANCH_KIND_BY_LEVEL2 = {
  "الأصول المتداولة": "current_assets",
  "الأصول غير المتداولة": "fixed_assets",
  "الالتزامات المتداولة": "current_liability",
  "الالتزامات غير المتداولة": "non_current_liability",
  "رأس المال المصدر": "issued_capital",
  "حقوق الملاك الأخرى": "other_equity",
  "الأرباح المبقاة": "retained_earnings",
  "المبيعات": "sales",
  "الإيرادات الأخرى": "non_operative_revenue",
  "التكلفة المباشرة": "direct_cost",
  "تكاليف تشغيلية": "operational_cost",
  "تكاليف غير تشغيلية": "non_operational_expense",
};

// account_kind الافتراضي لكل فئة مستوى2 (يُستخدم لحساب "عقدة مستوى2" نفسها -
// حين ينشئ المستخدم حساباً يمثّل الفئة كاملة لا نوعاً فرعياً محدداً - وكـfallback
// أخير لأي نوع مستوى3 غير مغطى بالجدول التالي).
export const QOYOD_ACCOUNT_KIND_DEFAULT_BY_LEVEL2 = {
  "الأصول المتداولة": "other_current_assets",
  "الأصول غير المتداولة": "other_fixed_assets",
  "الالتزامات المتداولة": "other_current_liability",
  "الالتزامات غير المتداولة": "other_non_current_liabilities",
  "رأس المال المصدر": "registered_capital",
  "حقوق الملاك الأخرى": "other_equity",
  "الأرباح المبقاة": "retained_earnings",
  "المبيعات": "sales",
  "الإيرادات الأخرى": "other_revenue",
  "التكلفة المباشرة": "other_direct_cost",
  "تكاليف تشغيلية": "other_operational_cost",
  // [تقدير] لا يوجد account_kind عام مخصص لهذا الفرع بالمواصفة الرسمية (الفرع
  // نفسه - non_operational_expense - يحوي عملياً "taxes" فقط من ضمن كل القيم
  // الأربعين). يُستخدم لأي نوع هنا بلا مطابقة أدق (الزكاة/الفوائد/ترجمة العملات).
  "تكاليف غير تشغيلية": "taxes",
};

// account_kind لكل نوع مستوى3 (59 نوعاً) — مطابقة مباشرة حيث توجد قيمة رسمية
// بنفس المعنى تماماً (أغلبها)، و[تقدير] موثَّق صراحة حيث لا توجد قيمة مخصصة
// فاستُخدمت أقرب قيمة عامة **ضمن نفس الفرع الصحيح** (لا تُخرج الحساب من فرعه
// أبداً - فقط الوسم الدقيق قد لا يكون الأمثل). راجع كل خلية "[تقدير]" بدقة.
export const QOYOD_ACCOUNT_KIND_BY_LEVEL3 = {
  // ── الأصول المتداولة (current_assets) ──
  "المدينون": "accounts_receivable",
  "حساب البنك": "bank_account",
  "سلف موظفين": "employees_advances",
  "المخزون": "inventory",
  "النقدية ومافي حكمها": "non_bank_cash_and_equivalents",
  "أصول متداولة أخرى": "other_current_assets",
  "عهد نقدية": "petty_cash", // [تحسين عن الشكل القديم] Cash العام سابقاً ← الآن قيمة مخصصة فعلياً
  "مصروفات مقدمة": "prepaid_expenses_and_others",
  "مخزون قطع غيار أصول": "other_current_assets", // [تقدير] لا "inventory" مخصص لقطع غيار أصول (ليست للبيع)

  // ── الأصول غير المتداولة (fixed_assets) ──
  "أصول غير ملموسة": "intangible_assets",
  "أصول غير متداولة أخرى": "other_fixed_assets",
  "عقارات وآلات ومعدات": "property_plant_and_equipment",
  "استثمارات بشركة تابعة": "other_fixed_assets", // [تقدير] لا "investments" مخصص
  "مشاريع تحت التنفيذ": "property_plant_and_equipment", // [تقدير] أقرب للأصول الثابتة تحت الإنشاء

  // ── الالتزامات المتداولة (current_liability) ──
  "الدائنون": "accounts_payable",
  "مصاريف مستحقة": "accrued_expenses",
  "الرواتب والمبالغ المستحقة للموظفين": "accrued_salaries_and_amounts_owed_to_employees",
  "مجمع الاستهلاك": "accumulated_depreciation",
  // [تقدير] accumulated_amortization موثَّقة بترتيب المواصفة ضمن مجموعة
  // تكاليف تشغيلية لا هذا الفرع (current_liability) — لتفادي تعارض محتمل بين
  // account_kind وbranch_kind (فرع "مجمع الإطفاء" الصحيح هنا حسب تصنيف الأداة
  // نفسها) استُخدمت فئة عامة بدل قيمة قد تخالف الفرع. راجعها لو عندك تأكيد.
  "مجمع الإطفاء": "other_current_liability",
  "مخصص الديون المشكوك في تحصيلها": "allowance_for_doubtful_accounts",
  "التزامات متداولة أخرى": "other_current_liability",
  "مخصصات": "provisions",
  "قروض قصيرة الأجل": "short_term_borrowings",
  "الضرائب المستحقة": "taxes_payable",
  "الإيرادات المقدمة": "unearned_revenues",
  "الزكاة المستحقة": "other_current_liability", // [تقدير] لا "zakat_payable" مخصص
  // [تقدير] قيمة "vat" الرسمية موثَّقة بترتيب المواصفة قرب مجموعة المبيعات
  // لا هذا الفرع — وحسابات ضريبة القيمة المضافة غالباً محميّة/مُدارة نظامياً
  // بمنصات كثيرة، فتفادياً لأي تعارض استُخدمت taxes_payable الآمنة بنفس الفرع.
  "ضريبة القيمة المضافة المستحقة": "taxes_payable",
  "فوائد مستحقة": "other_current_liability", // [تقدير] لا "accrued_interest" مخصص
  "الجزء المتداول من التزامات طويلة أجل": "other_current_liability", // [تقدير]

  // ── الالتزامات غير المتداولة (non_current_liability) ──
  "قروض طويلة الأجل": "long_term_borrowings",
  "التزامات غير متداولة أخرى": "other_non_current_liabilities",
  "مخصص مكافأة نهاية الخدمة": "end_of_service_benefits",
  "ضمان حسن التنفيذ": "other_non_current_liabilities", // [تقدير]

  // ── رأس المال المصدر (issued_capital) ──
  "رأس المال": "registered_capital",
  "رأس المال الإضافي المدفوع": "additional_paid_in_capital",

  // ── حقوق الملاك الأخرى (other_equity) ──
  "حقوق ملكية أخرى": "other_equity",
  // [تقدير] "employees_equity" الرسمية موثَّقة ضمن مجموعة رأس المال المصدر
  // (issued_capital) بترتيب المواصفة لا هذا الفرع — نفس منطق تفادي التعارض أعلاه.
  "حقوق الموظفين": "other_equity",
  "الاحتياطيات": "reserves",

  // ── الأرباح المبقاة (retained_earnings) ──
  "الأرباح المبقاة (أو الخسائر)": "retained_earnings",
  "توزيع الأرباح": "retained_earnings", // [تقدير] لا قيمة مخصصة لتوزيعات الأرباح تحديداً

  // ── المبيعات (sales) ──
  "المبيعات": "sales",

  // ── الإيرادات الأخرى (non_operative_revenue) ──
  "إيرادات أخرى": "other_revenue",
  "مكاسب/خسائر بيع أصول": "other_revenue", // [تقدير]
  "مكاسب/خسائر بيع أصول غير ملموسة": "other_revenue", // [تقدير]

  // ── التكلفة المباشرة (direct_cost) ──
  "تكلفة المبيعات": "cost_of_sales",
  "تكاليف مباشرة أخرى": "other_direct_cost",

  // ── تكاليف تشغيلية (operational_cost) ──
  "الرواتب": "salaries",
  "مكافآت وحوافز": "employee_incentives_and_benefits",
  "مصاريف عمومية وإدارية": "general_and_administrative",
  "مصاريف تسويقية": "marketing",
  "تكاليف تشغيلية أخرى": "other_operational_cost",
  "مصاريف الاستهلاك": "depreciation",
  "مصاريف الإطفاء": "amortization",
  "مصاريف تقنية واستشارية": "technical_and_consulting_expenses",
  "مصاريف البحث والتطوير": "other_operational_cost", // [تقدير] لا "R&D" مخصصة

  // ── تكاليف غير تشغيلية (non_operational_expense) ──
  // [تقدير للأربعة] هذا الفرع بأكمله لا يحوي بمواصفة قيود الرسمية سوى قيمة
  // "taxes" الوحيدة (تأكَّد بفحص كل القيم الأربعين) — لا قيمة مخصصة للزكاة أو
  // الفوائد أو ترجمة العملات إطلاقاً. الأربعة تُرسَل بنفس account_kind="taxes"،
  // لكن هذا لا يخرجها من فرعها الصحيح (branch_kind يبقى دقيقاً) — الوسم فقط أعم
  // مما هو مثالي. إن أضاف قيود قيماً أدق مستقبلاً، حدّث هذا الجدول.
  "الضرائب": "taxes",
  "الزكاة": "taxes",
  "مصروف فوائد": "taxes",
  "ترجمة عملات أجنبية": "taxes",
};

// حسابات جذر مستوى1 (الإيرادات/المصاريف بلا فئة مستوى2 - نفس حالات
// QOYOD_TYPE_BY_LEVEL1_ROOT أعلاه) — account_kind عام يمثّل كل الفئة، بنفس
// القيم الافتراضية المستخدمة أصلاً لفئتي "الإيرادات الأخرى"/"تكاليف تشغيلية"
// (QOYOD_ACCOUNT_KIND_DEFAULT_BY_LEVEL2) تفادياً لازدواج مصدر الحقيقة.
// [تبسيط 2026-09-15] branchKind لم تعد تُخزَّن هنا — تُشتَق الآن حصرًا من
// المرجع عبر QOYOD_KIND_INFO_BY_KIND[accountKind] بـmapRowToQoyodAccountKind.
const QOYOD_LEVEL1_ROOT_TRIPLE = {
  "الايرادات": { accountKind: QOYOD_ACCOUNT_KIND_DEFAULT_BY_LEVEL2["الإيرادات الأخرى"] },
  "المصاريف": { accountKind: QOYOD_ACCOUNT_KIND_DEFAULT_BY_LEVEL2["تكاليف تشغيلية"] },
};

/**
 * [إضافة 2026-09-14، صُحِّح 2026-09-15] نظير مواصفة OpenAPI الرسمية لـ
 * mapRowToQoyodType أعلاه — يرجّع {accountKind, parentKind, branchKind} أو
 * null لو تعذّر الاستنتاج (نفس منطق مستويات الصف بالضبط: مستوى1 جذر
 * إيرادات/مصاريف، مستوى2 يحمل فئته بحقل type نفسه، مستوى3 فأعمق يستخدم
 * level2Category). دالة نقية، قابلة للاختبار المباشر، لا تُغيّر أي شيء بمنطق
 * الأب/الابن أو الترقيم أو استيراد/تصدير إكسل.
 *
 * [تصحيح 2026-09-15] طلب المستخدم الصريح: "أصلحه الحين (اشتقاق branch/parent
 * من الـkind) واضح ومؤكد بالمرجع." — accountKind يُستنتج أولاً بالضبط كما
 * كان (بلا تغيير، من تصنيف الأداة الداخلي)، ثم parentKind/branchKind يُشتَقان
 * الآن حصرًا من القيمة الرسمية لهذا الـaccountKind بالمرجع
 * (QOYOD_KIND_INFO_BY_KIND) بدل اشتقاقهما بشكل مستقل من فئة مستوى2 الداخلية
 * للأداة — كان هذا يتعارض مع المرجع الرسمي في 6 أنواع من أصل 59 (مثال:
 * "مجمع الاستهلاك" مصنَّف داخليًا تحت الالتزامات المتداولة، بينما
 * accumulated_depreciation الرسمي أصوله assets/fixed_assets).
 */
export function mapRowToQoyodAccountKind(row) {
  const level = Number(row?.level);

  let accountKind;
  if (level === 1) {
    const t = QOYOD_LEVEL1_ROOT_TRIPLE[row?.type];
    accountKind = t ? t.accountKind : null;
  } else {
    const level2Category = level === 2 ? (row?.type || "") : (row?.level2Category || "");
    const level3Type = level === 2 ? "" : (row?.type || "");
    // لا نستنتج account_kind بدون فئة مستوى2 معروفة فعليًا بالأداة (تفادي
    // تخمين اعتباطي) — QOYOD_BRANCH_KIND_BY_LEVEL2 يُستخدم هنا فقط كفحص
    // "هل هذه الفئة معروفة؟"، لا كمصدر لقيمة branchKind النهائية (تلك من
    // المرجع حصرًا تحت).
    if (!QOYOD_BRANCH_KIND_BY_LEVEL2[level2Category]) return null;
    accountKind = (level3Type && QOYOD_ACCOUNT_KIND_BY_LEVEL3[level3Type])
      || QOYOD_ACCOUNT_KIND_DEFAULT_BY_LEVEL2[level2Category]
      || null;
  }
  if (!accountKind) return null;

  const info = QOYOD_KIND_INFO_BY_KIND[accountKind];
  if (!info) return null; // account_kind غير موجود بالمرجع الرسمي — احتياط أمان، لا يُفترض حدوثه

  return { accountKind, parentKind: info.parentKind, branchKind: info.branchKind };
}

/**
 * يبني حمولة POST /accounts من صف الأداة الداخلي (شكل results/activeNewRows
 * بـMergeTool.jsx: code, nameAr, nameEn, level2Category, type, desc,
 * payCollect). يرجّع { ok:true, payload } أو { ok:false, error } — بلا أي
 * إرسال فعلي هنا (فصل البناء عن الإرسال لتسهيل الاختبار).
 */
export function buildQoyodAccountPayload(row) {
  const code = String(row?.code ?? "").trim();
  const nameEn = String(row?.nameEn ?? "").trim();
  const nameAr = String(row?.nameAr ?? "").trim();
  if (!code) return { ok: false, error: "الرمز فارغ" };
  if (!nameEn) return { ok: false, error: "الاسم الإنجليزي فارغ (مطلوب من Qoyod)" };
  if (!nameAr) return { ok: false, error: "الاسم العربي فارغ (مطلوب من Qoyod)" };

  const qoyodType = mapRowToQoyodType(row);
  // [إضافة 2026-09-14] الحقول الثلاثة الرسمية الجديدة (account_kind/parent_kind/
  // branch_kind) — راجع تعليق "مواصفة Qoyod API الرسمية" أعلاه لمصدر الثقة بها.
  const qoyodKind = mapRowToQoyodAccountKind(row);
  if (!qoyodType || !qoyodKind) {
    return { ok: false, error: `تعذّر تحديد نوع الحساب المطابق بقيود لـ"${row?.type || row?.level2Category || "—"}"` };
  }

  // [إضافة 2026-09-15] استبعاد الأنواع المقفلة نظاميًا (systemLockedAccounts
  // بالمرجع الرسمي) من الإرسال عبر API — قرار المستخدم الصريح: "أستبعده من
  // الإرسال عبر API (يظهر تنبيه للمستخدم)"، لا استبدالها بأقرب نوع بديل.
  // Qoyod يدير هذه الحسابات تلقائيًا (مثال: accounts_receivable/accounts_payable
  // تُنشَأ تلقائيًا من قيود العملاء/الموردين، bank_account فقط عبر وحدة البنك).
  if (QOYOD_LOCKED_ACCOUNT_KINDS.has(qoyodKind.accountKind)) {
    const kindInfo = QOYOD_KIND_INFO_BY_KIND[qoyodKind.accountKind];
    const kindLabel = kindInfo?.nameAr ? `"${kindInfo.nameAr}"` : `"${qoyodKind.accountKind}"`;
    return {
      ok: false,
      locked: true,
      error: `هذا الحساب من نوع ${kindLabel} — حساب مُدار تلقائيًا بقيود ولا يمكن إنشاؤه عبر API، تم استبعاده من الإرسال.`,
    };
  }

  const payCollectYes = row?.payCollect === "Yes";

  return {
    ok: true,
    payload: {
      account: {
        // ===== الحقول القديمة — مثبتة ميدانياً (إنشاء حساب حقيقي id 52،
        // 2026-09-09) — بلا أي تغيير، بالضبط كما كانت. =====
        name_en: nameEn,
        name_ar: nameAr,
        code,
        description: String(row?.desc ?? "").trim() || undefined,
        // [مؤكد ميدانيًا 2026-09-09] "recieve_payments" هو الاسم الفعلي
        // المقبول من Qoyod (بالتهجئة الناقصة) — لا تصحّحه لـ"receive_payments".
        recieve_payments: payCollectYes ? "true" : "false",
        type: qoyodType,

        // ===== [إضافة 2026-09-14] الحقول الرسمية حسب مواصفة OpenAPI v2 —
        // تُرسَل معاً مع القديمة أعلاه بلا حذفها (طبقة توافق مزدوجة، قرار
        // المستخدم الصريح: "القديم شغال طبيعي بس التحديث مهم"). en_name/ar_name
        // بنفس قيم name_en/name_ar تماماً (على الأغلب alias لنفس الحقل بقيود -
        // AccountResponse يوثّق "name_en: mapped from en_name" صراحة)، فلا
        // تعارض بإرسال الاثنين معاً بنفس القيمة. =====
        en_name: nameEn,
        ar_name: nameAr,
        account_kind: qoyodKind.accountKind,
        parent_kind: qoyodKind.parentKind,
        branch_kind: qoyodKind.branchKind,
        receive_payments: payCollectYes,
      },
    },
  };
}

// ===== فحص التكرار قبل الإرسال =====
// Qoyod يرفض name_en/name_ar/code لو كانت مكررة فعليًا بمنشأة العميل (الثلاثة
// معًا "مطلوب وفريد" حسب التوثيق) — نجلب حسابات العميل الحالية أولاً ونتخطى
// أي صف يطابق واحدًا منها، بدل ما نكتشف الرفض بعد الإرسال.

// [تصحيح 2026-09-09] فحص التكرار المسبق فشل ميدانيًا مع حساب "المدينون"
// (1102) رغم وجوده فعليًا بمنشأة العميل — على الأرجح فرق ترميز/تنسيق غير
// مرئي بين رمز الملف المصدر ورمز قيود الفعلي. normKey تُطبّع الآن أيضًا:
// الأرقام العربية-الهندية (١٢٣) والفارسية الممتدة إلى غربية، إزالة أحرف
// التحكم غير المرئية الشائعة (zero-width، BOM) وتحويل المسافة غير القابلة
// للكسر (NBSP) لمسافة عادية، وإزالة لاحقة ".0" الزائدة التي يضيفها إكسل
// أحيانًا لأكواد رقمية بحتة (مثال: "1102.0" ← "1102"). هذا دفاع أول —
// الدفاع الثاني (isDuplicateApiError بـqoyodAccountPush.js) يلتقط أي حالة
// تفلت من هذا رغم كل شيء عند الإرسال الفعلي بدل إيقاف العملية كاملة.
function normKey(s) {
  let str = String(s ?? "").trim();
  str = str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)); // أرقام عربية-هندية
  str = str.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)); // أرقام فارسية ممتدة
  str = str.replace(/[​-‏﻿]/g, ""); // zero-width/BOM/اتجاه غير مرئي
  str = str.replace(/ /g, " "); // مسافة غير قابلة للكسر
  str = str.trim();
  if (/^\d+\.0+$/.test(str)) str = str.replace(/\.0+$/, "");
  return str.toLowerCase();
}

/** يبني فهرس تكرار من رد GET /accounts (مصفوفة كائنات account). */
export function buildQoyodDuplicateIndex(existingAccounts) {
  const codes = new Set();
  const names = new Set();
  (existingAccounts || []).forEach((a) => {
    const code = normKey(a.code);
    if (code) codes.add(code);
    const en = normKey(a.name_en);
    if (en) names.add(en);
    const ar = normKey(a.name_ar);
    if (ar) names.add(ar);
  });
  return { codes, names };
}

/** يرجّع سبب التكرار ("code"|"name") أو null لو الصف غير مكرر. */
export function checkAccountDuplicate(row, duplicateIndex) {
  if (!duplicateIndex) return null;
  const code = normKey(row?.code);
  if (code && duplicateIndex.codes.has(code)) return "code";
  const en = normKey(row?.nameEn);
  if (en && duplicateIndex.names.has(en)) return "name";
  const ar = normKey(row?.nameAr);
  if (ar && duplicateIndex.names.has(ar)) return "name";
  return null;
}

// ===== [إضافة 2026-09-09] جلب "ملف 1" مباشرة عبر API بدل رفعه يدويًا =====
// خطوة ثانية من نفس الميزة: بدل ما يرفع المستخدم تصدير شجرة الحسابات الحالية
// يدويًا (ملف 1)، نجلبها مباشرة من GET /accounts ونحوّلها لنفس شكل "records"
// الذي تنتجه buildRecords() بـMergeTool.jsx، لتُمرَّر مباشرة لـcompareTrees().

/**
 * يستنتج رمز الأب بالاقتطاع من اليمين (نفس أسلوب findParentByCodeTruncation/
 * guessAncestorCode بـMergeTool.jsx) — لازم لأن GET /accounts الفعلي بقيود لا
 * يرسل أي parent_id/level إطلاقًا، فقط بنية ترقيم الرمز نفسها تدل على الهرمية.
 */
function guessParentByCodeTruncation(code, codesSet) {
  let current = String(code || "").trim();
  while (current.length > 1) {
    current = current.slice(0, -1);
    if (codesSet.has(current)) return current;
  }
  return "";
}

/**
 * يحوّل مصفوفة حسابات Qoyod الفعلية (رد GET /accounts المسطّح) إلى نفس شكل
 * "records" الذي تنتجه buildRecords() من ملف إكسل مرفوع يدويًا - بحيث تُمرَّر
 * مباشرة لـcompareTrees() كبديل لرفع "ملف 1". لا نحاول ترجمة حقل type الفعلي
 * (enum إنجليزي مثل "CurrentAsset") لتصنيف عربي - نتركه فارغًا ونعتمد نفس
 * منطق الاستنتاج من الاسم الموجود أصلاً بالأداة لأي ملف بلا عمود نوع صريح.
 */
export function qoyodAccountsToFile1Records(accounts) {
  const list = (accounts || []).filter((a) => a && a.code !== undefined && a.code !== null && String(a.code).trim() !== "");
  const codesSet = new Set(list.map((a) => String(a.code).trim()));
  return list.map((a) => {
    const code = String(a.code).trim();
    return {
      code,
      nameAr: String(a.name_ar ?? "").trim(),
      nameEn: String(a.name_en ?? "").trim(),
      level: "",
      parent: guessParentByCodeTruncation(code, codesSet),
      type: "",
      desc: String(a.description ?? "").trim(),
      debit: "",
      credit: "",
      payCollect: a.recieve_payments === true || a.recieve_payments === "true" ? "Yes" : "No",
      extra: {},
      _rowIndex: -1,
    };
  });
}
