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

  const qoyodType = mapAccountTypeToQoyod(row?.type, row?.level2Category);
  if (!qoyodType) {
    return { ok: false, error: `تعذّر تحديد نوع الحساب المطابق بقيود لـ"${row?.type || row?.level2Category || "—"}"` };
  }

  return {
    ok: true,
    payload: {
      account: {
        name_en: nameEn,
        name_ar: nameAr,
        code,
        description: String(row?.desc ?? "").trim() || undefined,
        // [مؤكد ميدانيًا 2026-09-09] "recieve_payments" هو الاسم الفعلي
        // المقبول من Qoyod (بالتهجئة الناقصة) — لا تصحّحه لـ"receive_payments".
        recieve_payments: row?.payCollect === "Yes" ? "true" : "false",
        type: qoyodType,
      },
    },
  };
}

// ===== فحص التكرار قبل الإرسال =====
// Qoyod يرفض name_en/name_ar/code لو كانت مكررة فعليًا بمنشأة العميل (الثلاثة
// معًا "مطلوب وفريد" حسب التوثيق) — نجلب حسابات العميل الحالية أولاً ونتخطى
// أي صف يطابق واحدًا منها، بدل ما نكتشف الرفض بعد الإرسال.

function normKey(s) {
  return String(s ?? "").trim().toLowerCase();
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
