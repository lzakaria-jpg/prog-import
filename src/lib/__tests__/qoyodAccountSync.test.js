import { describe, it, expect } from "vitest";
import {
  mapAccountTypeToQoyod,
  mapRowToQoyodType,
  mapRowToQoyodAccountKind,
  buildQoyodAccountPayload,
  buildQoyodDuplicateIndex,
  checkAccountDuplicate,
  qoyodAccountsToFile1Records,
  QOYOD_TYPE_BY_LEVEL2,
  QOYOD_TYPE_BY_LEVEL1_ROOT,
  ALL_QOYOD_ACCOUNT_TYPES,
  QOYOD_BRANCH_KIND_BY_LEVEL2,
  QOYOD_KIND_INFO_BY_KIND,
  QOYOD_LOCKED_ACCOUNT_KINDS,
  mapQoyodTypeToLevel2,
  QOYOD_LEVEL2_BY_UNIQUE_TYPE,
} from "../qoyodAccountSync.js";
import { LEVEL2_TO_LEVEL1, LEVEL3_MAP, TYPE_TO_LEVEL2, compareTrees } from "../../MergeTool.jsx";
import qoyodAccountTypesReference from "../../../config/qoyod-account-types-reference.json";

describe("mapAccountTypeToQoyod — تحويل تصنيف الأداة (59 نوع) لقيم Qoyod الـ16", () => {
  it("كل قيمة بجدول الافتراضي حسب مستوى2 من ضمن الـ16 المسموحة فعليًا بـQoyod", () => {
    Object.values(QOYOD_TYPE_BY_LEVEL2).forEach((v) => {
      expect(ALL_QOYOD_ACCOUNT_TYPES).toContain(v);
    });
  });

  it("كل فئة مستوى2 الـ12 الفعلية بالأداة لها افتراضي بجدول التحويل (لا فئة منسية)", () => {
    Object.keys(LEVEL2_TO_LEVEL1).forEach((level2) => {
      expect(QOYOD_TYPE_BY_LEVEL2[level2]).toBeTruthy();
    });
  });

  it("التخصيصات الأخص (Bank/Cash/Inventory/Depreciation) تطغى على افتراضي مستوى2", () => {
    expect(mapAccountTypeToQoyod("حساب البنك", "الأصول المتداولة")).toBe("Bank");
    expect(mapAccountTypeToQoyod("النقدية ومافي حكمها", "الأصول المتداولة")).toBe("Cash");
    expect(mapAccountTypeToQoyod("عهد نقدية", "الأصول المتداولة")).toBe("Cash");
    expect(mapAccountTypeToQoyod("المخزون", "الأصول المتداولة")).toBe("Inventory");
    expect(mapAccountTypeToQoyod("مصاريف الاستهلاك", "تكاليف تشغيلية")).toBe("Depreciation");
    expect(mapAccountTypeToQoyod("مصاريف الإطفاء", "تكاليف تشغيلية")).toBe("Depreciation");
  });

  it("نوع مستوى3 بلا تخصيص خاص يرث افتراضي فئته (مستوى2) كما هو", () => {
    // "المدينون" (Accounts receivable) تحت "الأصول المتداولة" — بلا تخصيص خاص له
    expect(mapAccountTypeToQoyod("المدينون", "الأصول المتداولة")).toBe("CurrentAsset");
    // "الدائنون" تحت "الالتزامات المتداولة"
    expect(mapAccountTypeToQoyod("الدائنون", "الالتزامات المتداولة")).toBe("CurrentLiability");
  });

  it("يرجّع null لو فئة مستوى2 غير معروفة إطلاقًا وبلا تخصيص مستوى3", () => {
    expect(mapAccountTypeToQoyod("نوع غير موجود", "فئة غير موجودة")).toBeNull();
    expect(mapAccountTypeToQoyod("", "")).toBeNull();
    expect(mapAccountTypeToQoyod(null, null)).toBeNull();
  });

  it("تغطية كاملة: كل نوع من الـ59 نوعًا الفعلي بـLEVEL3_MAP يُحوَّل لقيمة Qoyod صالحة", () => {
    const allLevel3Types = Object.values(LEVEL3_MAP).flat();
    expect(allLevel3Types.length).toBe(59);
    allLevel3Types.forEach((type) => {
      const level2 = TYPE_TO_LEVEL2[type];
      const mapped = mapAccountTypeToQoyod(type, level2);
      expect(mapped, `النوع "${type}" (مستوى2: ${level2}) لازم يتحوّل لقيمة Qoyod صالحة`).toBeTruthy();
      expect(ALL_QOYOD_ACCOUNT_TYPES).toContain(mapped);
    });
  });
});

describe("buildQoyodAccountPayload — بناء حمولة POST /accounts", () => {
  const validRow = {
    code: "120105",
    nameEn: "Test Fixed Asset",
    nameAr: "أصل ثابت اختباري",
    level2Category: "الأصول غير المتداولة",
    type: "عقارات وآلات ومعدات",
    desc: "وصف تجريبي",
    payCollect: "No",
  };

  it("يبني الحمولة كاملة بالشكل الصحيح لصف سليم (الحقول القديمة المثبتة ميدانياً + الحقول الرسمية الجديدة معاً)", () => {
    const result = buildQoyodAccountPayload(validRow);
    expect(result.ok).toBe(true);
    expect(result.payload).toEqual({
      account: {
        // القديمة — بلا أي تغيير
        name_en: "Test Fixed Asset",
        name_ar: "أصل ثابت اختباري",
        code: "120105",
        description: "وصف تجريبي",
        recieve_payments: "false",
        type: "FixedAsset",
        // [إضافة 2026-09-14] الجديدة حسب مواصفة OpenAPI الرسمية
        en_name: "Test Fixed Asset",
        ar_name: "أصل ثابت اختباري",
        account_kind: "property_plant_and_equipment",
        parent_kind: "assets",
        branch_kind: "fixed_assets",
        receive_payments: false,
      },
    });
  });

  it("يستخدم دومًا اسم الحقل الفعلي recieve_payments (بالتهجئة الناقصة) القديم — مؤكد ميدانيًا مع Qoyod الحقيقي — بجانب receive_payments الرسمي الجديد (الاثنان معاً، لا تعارض)", () => {
    const result = buildQoyodAccountPayload(validRow);
    expect(result.payload.account).toHaveProperty("recieve_payments");
    // [إضافة 2026-09-14] receive_payments (تهجئة صحيحة، boolean) هو الحقل
    // الرسمي بمواصفة OpenAPI — يُرسَل الآن أيضاً بجانب القديم عمداً.
    expect(result.payload.account).toHaveProperty("receive_payments");
  });

  it("payCollect='Yes' يصبح recieve_payments:'true' (قديم) وreceive_payments:true (جديد)", () => {
    const result = buildQoyodAccountPayload({ ...validRow, payCollect: "Yes" });
    expect(result.payload.account.recieve_payments).toBe("true");
    expect(result.payload.account.receive_payments).toBe(true);
  });

  it("يرفض صف بلا رمز، بلا اسم إنجليزي، أو بلا اسم عربي، مع رسالة واضحة", () => {
    expect(buildQoyodAccountPayload({ ...validRow, code: "" }).ok).toBe(false);
    expect(buildQoyodAccountPayload({ ...validRow, nameEn: "" }).ok).toBe(false);
    expect(buildQoyodAccountPayload({ ...validRow, nameAr: "" }).ok).toBe(false);
  });

  it("يرفض صف بنوع/فئة لا يمكن تحويلها لقيمة Qoyod", () => {
    const result = buildQoyodAccountPayload({ ...validRow, type: "غير موجود", level2Category: "غير موجود" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("تعذّر تحديد نوع الحساب");
  });

  // [تصحيح 2026-09-09] بلاغ اختبار حي: حساب مستوى2 جديد ("12 - أصول غير
  // متداولة") فشل إرساله دومًا بـ"تعذّر تحديد نوع الحساب" حتى بعد اختيار
  // المستخدم لنوعه - لأن حساب مستوى2 يحمل فئته بحقل type نفسه لا
  // level2Category، وbuildQoyodAccountPayload كان يتجاهل ذلك دومًا.
  it("صف مستوى2 جديد (فئته بحقل type نفسه) يُبنى بنجاح بعد التصحيح — كان يفشل دومًا قبله بصرف النظر عن اختيار المستخدم", () => {
    const level2Row = {
      code: "12",
      nameEn: "Non-current assets",
      nameAr: "أصول غير متداولة",
      level: 2,
      level2Category: "", // فارغ عمدًا - بالضبط كما يصله فعليًا من الشجرة الحقيقية
      type: "الأصول غير المتداولة", // حساب مستوى2 يحمل فئته هنا
      desc: "",
      payCollect: "No",
    };
    const result = buildQoyodAccountPayload(level2Row);
    expect(result.ok).toBe(true);
    expect(result.payload.account.type).toBe("FixedAsset");
  });

  it("يعمل نفس التصحيح لصف مستوى2 بـlevel كنص \"2\" (لا رقم) - نفس مصدر البيانات الفعلي بالجدول", () => {
    const result = buildQoyodAccountPayload({
      code: "21", nameEn: "Current liabilities", nameAr: "الالتزامات المتداولة",
      level: "2", level2Category: "", type: "الالتزامات المتداولة", payCollect: "No",
    });
    expect(result.ok).toBe(true);
    expect(result.payload.account.type).toBe("CurrentLiability");
  });

  it("صف مستوى1 جديد (إيرادات/مصاريف فقط - الوحيدان المسموح إنشاؤهما) يُبنى بنجاح", () => {
    const revenueRoot = buildQoyodAccountPayload({ code: "4", nameEn: "Revenue", nameAr: "الايرادات", level: 1, type: "الايرادات", payCollect: "No" });
    expect(revenueRoot.ok).toBe(true);
    expect(revenueRoot.payload.account.type).toBe("Revenue");

    const expenseRoot = buildQoyodAccountPayload({ code: "5", nameEn: "Expenses", nameAr: "المصاريف", level: 1, type: "المصاريف", payCollect: "No" });
    expect(expenseRoot.ok).toBe(true);
    expect(expenseRoot.payload.account.type).toBe("Expense");
  });

  // [إضافة 2026-09-15] طلب المستخدم الصريح: "أستبعده من الإرسال عبر API (يظهر
  // تنبيه للمستخدم)" لأي حساب من الأنواع الثمانية المقفلة نظاميًا بقيود.
  describe("الحسابات المقفلة نظاميًا (systemLockedAccounts) — استبعاد من الإرسال + تنبيه", () => {
    it("يرفض بناء الحمولة لصف يُصنَّف لأي من الأنواع الثمانية المقفلة، مع ok:false وlocked:true ورسالة تنبيه واضحة", () => {
      const lockedRow = { code: "1102", nameEn: "Accounts receivable", nameAr: "المدينون", level: 3, type: "المدينون", level2Category: "الأصول المتداولة", payCollect: "No" };
      const result = buildQoyodAccountPayload(lockedRow);
      expect(result.ok).toBe(false);
      expect(result.locked).toBe(true);
      expect(result.error).toContain("المدينون");
      expect(result.payload).toBeUndefined();
    });

    it("تغطية كاملة: كل نوع مستوى3 يُطابق account_kind مقفلاً يُستبعَد (locked:true)، وأي نوع آخر لا", () => {
      const allLevel3Types = Object.values(LEVEL3_MAP).flat();
      allLevel3Types.forEach((type) => {
        const level2 = TYPE_TO_LEVEL2[type];
        const kind = mapRowToQoyodAccountKind({ level: 3, type, level2Category: level2 });
        const row = { code: "999", nameEn: "x", nameAr: type, level: 3, type, level2Category: level2, payCollect: "No" };
        const result = buildQoyodAccountPayload(row);
        if (QOYOD_LOCKED_ACCOUNT_KINDS.has(kind.accountKind)) {
          expect(result.ok, `النوع "${type}" (${kind.accountKind}) مقفل ولازم يُستبعَد`).toBe(false);
          expect(result.locked, `النوع "${type}"`).toBe(true);
        } else {
          expect(result.ok, `النوع "${type}" (${kind.accountKind}) غير مقفل ولازم يُبنى بنجاح`).toBe(true);
        }
      });
    });

    it("قائمة الأنواع المقفلة بالمرجع لم تتغيّر (8 أنواع) — لو زادت/نقصت لازم مراجعة هذا الاختبار عمدًا", () => {
      expect([...QOYOD_LOCKED_ACCOUNT_KINDS].sort()).toEqual([
        "accounts_payable", "accounts_receivable", "accumulated_amortization",
        "accumulated_depreciation", "amortization", "bank_account", "depreciation", "retained_earnings",
      ]);
      expect(qoyodAccountTypesReference.systemLockedAccounts.length).toBe(QOYOD_LOCKED_ACCOUNT_KINDS.size);
    });
  });
});

describe("mapRowToQoyodType — استنتاج نوع Qoyod حسب مستوى الصف الفعلي (المصدر الوحيد الصحيح بعد التصحيح)", () => {
  it("مستوى3 فأعمق: يقرأ type كنوع مستوى3 وlevel2Category كفئته، تمامًا كما كان مسبقًا (بلا تغيير سلوك)", () => {
    expect(mapRowToQoyodType({ level: 3, type: "حساب البنك", level2Category: "الأصول المتداولة" })).toBe("Bank");
    expect(mapRowToQoyodType({ level: 4, type: "المدينون", level2Category: "الأصول المتداولة" })).toBe("CurrentAsset");
  });

  it("مستوى2: يقرأ الفئة من type نفسه بصرف النظر عن level2Category (حتى لو فارغة أو خاطئة)", () => {
    expect(mapRowToQoyodType({ level: 2, type: "المبيعات", level2Category: "" })).toBe("Sale");
    expect(mapRowToQoyodType({ level: 2, type: "المبيعات", level2Category: "قيمة عشوائية لا معنى لها" })).toBe("Sale");
  });

  it("مستوى1: يقبل فقط الايرادات/المصاريف (الوحيدان المسموح إنشاؤهما فعليًا)، ويرجّع null لأي شيء آخر", () => {
    expect(mapRowToQoyodType({ level: 1, type: "الايرادات" })).toBe(QOYOD_TYPE_BY_LEVEL1_ROOT["الايرادات"]);
    expect(mapRowToQoyodType({ level: 1, type: "المصاريف" })).toBe(QOYOD_TYPE_BY_LEVEL1_ROOT["المصاريف"]);
    expect(mapRowToQoyodType({ level: 1, type: "الاصول" })).toBeNull();
  });

  it("يرجّع null بأمان لصف بلا level إطلاقًا مهما كان type/level2Category — لا يرمي استثناء", () => {
    expect(mapRowToQoyodType({ type: "", level2Category: "" })).toBeNull();
    expect(mapRowToQoyodType({})).toBeNull();
    expect(mapRowToQoyodType(null)).toBeNull();
  });
});

// [إضافة 2026-09-14، حُدِّثت 2026-09-15] mapRowToQoyodAccountKind — نظير مواصفة OpenAPI الرسمية
describe("mapRowToQoyodAccountKind — استنتاج account_kind/parent_kind/branch_kind الرسمية", () => {
  it("تغطية كاملة: كل نوع من الـ59 نوعًا الفعلي بـLEVEL3_MAP يُحوَّل لثلاثية صالحة", () => {
    const allLevel3Types = Object.values(LEVEL3_MAP).flat();
    expect(allLevel3Types.length).toBe(59);
    allLevel3Types.forEach((type) => {
      const level2 = TYPE_TO_LEVEL2[type];
      const result = mapRowToQoyodAccountKind({ level: 3, type, level2Category: level2 });
      expect(result, `النوع "${type}" (مستوى2: ${level2}) لازم يتحوّل لثلاثية صالحة`).toBeTruthy();
      expect(["assets", "liability", "equity", "revenue", "expense"]).toContain(result.parentKind);
      expect(result.accountKind).toBeTruthy();
    });
  });

  // [إضافة 2026-09-15] طلب المستخدم الصريح: "أصلحه الحين (اشتقاق branch/parent
  // من الـkind) واضح ومؤكد بالمرجع." — هذا اختبار الحماية الدائم: parentKind/
  // branchKind لأي نوع من الـ59 لازم يطابقا حرفيًا المرجع الرسمي (config/
  // qoyod-account-types-reference.json)، لا شجرة الأداة الداخلية. كان هذا
  // يتعارض فعليًا بـ6 أنواع قبل التصحيح (مثال: "مجمع الاستهلاك").
  it("parentKind/branchKind لكل نوع من الـ59 يطابقان المرجع الرسمي حرفيًا (لا شجرة الأداة الداخلية)", () => {
    const allLevel3Types = Object.values(LEVEL3_MAP).flat();
    allLevel3Types.forEach((type) => {
      const level2 = TYPE_TO_LEVEL2[type];
      const result = mapRowToQoyodAccountKind({ level: 3, type, level2Category: level2 });
      const canonical = QOYOD_KIND_INFO_BY_KIND[result.accountKind];
      expect(canonical, `account_kind "${result.accountKind}" لازم يكون موجودًا بالمرجع الرسمي`).toBeTruthy();
      expect(result.parentKind, `parentKind للنوع "${type}" لازم يطابق المرجع`).toBe(canonical.parentKind);
      expect(result.branchKind, `branchKind للنوع "${type}" لازم يطابق المرجع`).toBe(canonical.branchKind);
    });
  });

  it("مثال التعارض المُصحَّح فعليًا: 'مجمع الاستهلاك' (تصنَّف داخليًا تحت الالتزامات المتداولة) يُشتَق الآن أصوله/فرعه من accumulated_depreciation الرسمي (assets/fixed_assets) لا من فئته الداخلية", () => {
    const result = mapRowToQoyodAccountKind({ level: 3, type: "مجمع الاستهلاك", level2Category: "الالتزامات المتداولة" });
    expect(result).toEqual({ accountKind: "accumulated_depreciation", parentKind: "assets", branchKind: "fixed_assets" });
  });

  it("الأنواع الثمانية المقفلة نظاميًا بالمرجع (systemLockedAccounts) لا تزال تُحوَّل لثلاثية صالحة (القفل يُفحَص لاحقًا بـbuildQoyodAccountPayload لا هنا)", () => {
    expect(QOYOD_LOCKED_ACCOUNT_KINDS.size).toBe(8);
    ["المدينون", "حساب البنك", "الدائنون", "مصاريف الاستهلاك", "مصاريف الإطفاء", "الأرباح المبقاة (أو الخسائر)"].forEach((type) => {
      const level2 = TYPE_TO_LEVEL2[type];
      const result = mapRowToQoyodAccountKind({ level: 3, type, level2Category: level2 });
      expect(result, `النوع "${type}"`).toBeTruthy();
      expect(QOYOD_LOCKED_ACCOUNT_KINDS.has(result.accountKind), `${type} -> ${result.accountKind} لازم يكون مقفلاً`).toBe(true);
    });
  });

  it("مطابقات مباشرة مؤكَّدة (اسم الحقل الرسمي مطابق تماماً لمعنى نوع الأداة)", () => {
    expect(mapRowToQoyodAccountKind({ level: 3, type: "المدينون", level2Category: "الأصول المتداولة" }))
      .toEqual({ accountKind: "accounts_receivable", parentKind: "assets", branchKind: "current_assets" });
    expect(mapRowToQoyodAccountKind({ level: 3, type: "حساب البنك", level2Category: "الأصول المتداولة" }))
      .toEqual({ accountKind: "bank_account", parentKind: "assets", branchKind: "current_assets" });
    expect(mapRowToQoyodAccountKind({ level: 3, type: "عهد نقدية", level2Category: "الأصول المتداولة" }))
      .toEqual({ accountKind: "petty_cash", parentKind: "assets", branchKind: "current_assets" });
    expect(mapRowToQoyodAccountKind({ level: 3, type: "الدائنون", level2Category: "الالتزامات المتداولة" }))
      .toEqual({ accountKind: "accounts_payable", parentKind: "liability", branchKind: "current_liability" });
    expect(mapRowToQoyodAccountKind({ level: 3, type: "المبيعات", level2Category: "المبيعات" }))
      .toEqual({ accountKind: "sales", parentKind: "revenue", branchKind: "sales" });
    expect(mapRowToQoyodAccountKind({ level: 3, type: "تكلفة المبيعات", level2Category: "التكلفة المباشرة" }))
      .toEqual({ accountKind: "cost_of_sales", parentKind: "expense", branchKind: "direct_cost" });
  });

  it("مستوى2 (فئته بحقل type نفسه): يُستخدم account_kind الافتراضي لتلك الفئة", () => {
    const result = mapRowToQoyodAccountKind({ level: 2, type: "الأصول غير المتداولة", level2Category: "" });
    expect(result).toEqual({ accountKind: "other_fixed_assets", parentKind: "assets", branchKind: "fixed_assets" });
  });

  it("مستوى1 (الإيرادات/المصاريف فقط): ثلاثية عامة صحيحة الفرع", () => {
    expect(mapRowToQoyodAccountKind({ level: 1, type: "الايرادات" }))
      .toEqual({ accountKind: "other_revenue", parentKind: "revenue", branchKind: "non_operative_revenue" });
    expect(mapRowToQoyodAccountKind({ level: 1, type: "المصاريف" }))
      .toEqual({ accountKind: "other_operational_cost", parentKind: "expense", branchKind: "operational_cost" });
    expect(mapRowToQoyodAccountKind({ level: 1, type: "الاصول" })).toBeNull();
  });

  it("يرجّع null بأمان لصف بلا فئة معروفة، بلا رمي استثناء", () => {
    expect(mapRowToQoyodAccountKind({ type: "غير موجود", level2Category: "غير موجود" })).toBeNull();
    expect(mapRowToQoyodAccountKind({})).toBeNull();
    expect(mapRowToQoyodAccountKind(null)).toBeNull();
  });
});

describe("فحص التكرار قبل الإرسال (buildQoyodDuplicateIndex / checkAccountDuplicate)", () => {
  const existingAccounts = [
    { id: 1, code: "1103", name_en: "Accounts receivable", name_ar: "المدينون" },
    { id: 2, code: "2101", name_en: "Accounts payable", name_ar: "الدائنون" },
  ];
  const index = buildQoyodDuplicateIndex(existingAccounts);

  it("يكتشف تكرار الرمز", () => {
    expect(checkAccountDuplicate({ code: "1103", nameEn: "x", nameAr: "ص" }, index)).toBe("code");
  });

  it("يكتشف تكرار الاسم الإنجليزي أو العربي بصرف النظر عن حالة الأحرف/المسافات", () => {
    expect(checkAccountDuplicate({ code: "999", nameEn: "  accounts receivable  ", nameAr: "ص" }, index)).toBe("name");
    expect(checkAccountDuplicate({ code: "999", nameEn: "x", nameAr: "الدائنون" }, index)).toBe("name");
  });

  it("يرجّع null لصف غير مكرر إطلاقًا", () => {
    expect(checkAccountDuplicate({ code: "999999", nameEn: "Brand New", nameAr: "حساب جديد" }, index)).toBeNull();
  });

  // [تصحيح 2026-09-09] فحص التكرار فشل ميدانيًا مع حساب "المدينون" (1102) رغم
  // وجوده فعليًا بمنشأة العميل - هذه المجموعة تغطي فروق الترميز/التنسيق التي
  // كان يُفترض أن normKey تتعامل معها فتلتقط التكرار رغم الاختلاف الشكلي.
  it("يكتشف تكرار الرمز حتى لو كُتب بأرقام عربية-هندية بأحد الطرفين", () => {
    const idx = buildQoyodDuplicateIndex([{ id: 52, code: "1102", name_en: "Accounts receivable", name_ar: "المدينون" }]);
    expect(checkAccountDuplicate({ code: "١١٠٢", nameEn: "x", nameAr: "ص" }, idx)).toBe("code");
  });

  it("يكتشف تكرار الرمز حتى لو احتوى على مسافة غير قابلة للكسر (NBSP) أو أحرف zero-width", () => {
    const idx = buildQoyodDuplicateIndex([{ id: 52, code: "1102", name_en: "Accounts receivable", name_ar: "المدينون" }]);
    expect(checkAccountDuplicate({ code: "1102​", nameEn: "x", nameAr: "ص" }, idx)).toBe("code");
    expect(checkAccountDuplicate({ code: " 1102", nameEn: "x", nameAr: "ص" }, idx)).toBe("code");
  });

  it("يكتشف تكرار الرمز حتى لو أضاف إكسل لاحقة '.0' الزائدة لكود رقمي بحت", () => {
    const idx = buildQoyodDuplicateIndex([{ id: 52, code: "1102", name_en: "Accounts receivable", name_ar: "المدينون" }]);
    expect(checkAccountDuplicate({ code: "1102.0", nameEn: "x", nameAr: "ص" }, idx)).toBe("code");
  });
});

describe("qoyodAccountsToFile1Records — تحويل رد GET /accounts الفعلي لشكل ملف 1 (بديل الرفع اليدوي)", () => {
  const rawAccounts = [
    { id: 1, code: "1", name_ar: "الأصول", name_en: "Assets", description: "", recieve_payments: "false" },
    { id: 2, code: "11", name_ar: "الأصول المتداولة", name_en: "Current Assets", description: "", recieve_payments: "false" },
    { id: 3, code: "1101", name_ar: "النقدية ومافي حكمها", name_en: "Cash and cash equivalents", description: "", recieve_payments: "false" },
    { id: 4, code: "110101", name_ar: "بنك الراجحي", name_en: "Al Rajhi Bank", description: "حساب جاري", recieve_payments: true },
    { id: 5, code: "", name_ar: "حساب بلا رمز يُستبعد", name_en: "no code" },
  ];

  it("يستبعد أي حساب بلا رمز", () => {
    expect(qoyodAccountsToFile1Records(rawAccounts).length).toBe(4);
  });

  it("يستنتج الأب بالاقتطاع من اليمين لكل حساب حسب أقرب رمز أب موجود فعليًا - لأن Qoyod لا يرسل parent_id إطلاقًا", () => {
    const byCode = Object.fromEntries(qoyodAccountsToFile1Records(rawAccounts).map((r) => [r.code, r]));
    expect(byCode["1"].parent).toBe("");
    expect(byCode["11"].parent).toBe("1");
    expect(byCode["1101"].parent).toBe("11");
    expect(byCode["110101"].parent).toBe("1101");
  });

  it("يحوّل recieve_payments (منطقي true أو نصي 'true') إلى Yes/No بنفس شكل صفوف الأداة", () => {
    const byCode = Object.fromEntries(qoyodAccountsToFile1Records(rawAccounts).map((r) => [r.code, r]));
    expect(byCode["110101"].payCollect).toBe("Yes");
    expect(byCode["1"].payCollect).toBe("No");
  });

  it("ينقل الاسمين والوصف كما هي، ويترك type فارغًا (يُستنتج من الاسم لاحقًا تمامًا كملف بلا عمود نوع صريح)", () => {
    const bank = qoyodAccountsToFile1Records(rawAccounts).find((r) => r.code === "110101");
    expect(bank.nameAr).toBe("بنك الراجحي");
    expect(bank.nameEn).toBe("Al Rajhi Bank");
    expect(bank.desc).toBe("حساب جاري");
    expect(bank.type).toBe("");
  });

  // [إضافة — بلاغ حقيقي من المستخدم] qoyodType (منفصل عن type المعروض، يبقى
  // فارغًا كالسابق) يحمل قيمة "type" الخام من GET /accounts كما هي — تُستخدم
  // داخليًا فقط (MergeTool.jsx) لتحديد فئة حساب أب موجود فعليًا بيقين تام.
  it("qoyodType يحمل قيمة type الخام من رد API كما هي (منفصل عن .type المعروض الفارغ)", () => {
    const raw = [{ id: 9, code: "5101", name_ar: "تكاليف مباشرة", name_en: "Direct Costs", type: "DirectCost", description: "", recieve_payments: "false" }];
    const rec = qoyodAccountsToFile1Records(raw)[0];
    expect(rec.qoyodType).toBe("DirectCost");
    expect(rec.type).toBe("");
  });

  it("qoyodType فارغة لو الرد لا يحمل type إطلاقًا", () => {
    const rec = qoyodAccountsToFile1Records(rawAccounts).find((r) => r.code === "1");
    expect(rec.qoyodType).toBe("");
  });

  it("تكامل حقيقي: تمريرها لـcompareTrees يحسب مستوى كل حساب صحيحًا رغم غياب level/parent صريح من Qoyod", () => {
    const file1Records = qoyodAccountsToFile1Records(rawAccounts);
    const { tree1Index } = compareTrees(file1Records, [], false);
    const byCode = Object.fromEntries(tree1Index.map((r) => [r.code, r]));
    expect(byCode["1"].level).toBe(1);
    expect(byCode["11"].level).toBe(2);
    expect(byCode["1101"].level).toBe(3);
    expect(byCode["110101"].level).toBe(4);
  });
});

// [إصلاح خطأ حقيقي شهده المستخدم] رفض حي من قيود:
//   API 422: {"error":"Invalid resource","messages":{"account_kind":["Invalid branch"]}}
// سببه أن الحمولة كانت تناقض نفسها: "type" القديم يُشتَق من فئة مستوى2 الداخلية
// للأداة، بينما branch_kind/account_kind يُشتَقان من مرجع قيود الرسمي — وهما
// يختلفان فعليًا في 6 أنواع من أصل 59. الفرع الرسمي هو الحكم (هو مصدر
// account_kind نفسه)، فيُشتَق منه "type" عند أي تعارض.
describe("buildQoyodAccountPayload — حقل type القديم لا يناقض branch_kind الرسمي أبدًا", () => {
  const TYPE_BY_BRANCH = {
    current_assets: "CurrentAsset", fixed_assets: "FixedAsset",
    current_liability: "CurrentLiability", non_current_liability: "NoncurrentLiability",
    issued_capital: "Equity", other_equity: "Equity", retained_earnings: "Equity",
    sales: "Sale", non_operative_revenue: "OtherIncome",
    direct_cost: "DirectCost", operational_cost: "Expense", non_operational_expense: "Expense",
  };
  // القيم الأخص المعتمدة عمدًا داخل نفس الفرع (لا تناقضه) — تبقى كما هي.
  const ALLOWED_SPECIFIC = { Inventory: "current_assets", Cash: "current_assets", Bank: "current_assets" };

  it("الحالة الحقيقية التي فشلت: مخصص مكافأة نهاية الخدمة", () => {
    const res = buildQoyodAccountPayload({
      code: "2401", nameAr: "مخصص مكافأت نهاية الخدمة", nameEn: "EOS",
      level: 3, level2Category: "الالتزامات غير المتداولة", type: "مخصص مكافأة نهاية الخدمة",
    });
    expect(res.ok).toBe(true);
    expect(res.payload.account.account_kind).toBe("end_of_service_benefits");
    expect(res.payload.account.branch_kind).toBe("current_liability");
    // سابقًا كانت "NoncurrentLiability" فتتناقض مع الفرع أعلاه ويرفضها قيود
    expect(res.payload.account.type).toBe("CurrentLiability");
  });

  it("لكل الأنواع الـ59: type يطابق فرعه الرسمي (أو قيمة أخص ضمن نفس الفرع)", () => {
    for (const [cat, types] of Object.entries(LEVEL3_MAP)) {
      for (const ty of types) {
        const res = buildQoyodAccountPayload({ code: "9999", nameAr: "أ", nameEn: "A", level: 3, level2Category: cat, type: ty });
        if (!res.ok) { expect(res.locked).toBe(true); continue; }
        const { type, branch_kind: branch } = res.payload.account;
        if (ALLOWED_SPECIFIC[type]) expect(ALLOWED_SPECIFIC[type]).toBe(branch);
        else expect(type).toBe(TYPE_BY_BRANCH[branch]);
      }
    }
  });
});

// [إضافة — بلاغ حقيقي من المستخدم] حساب "تكاليف مباشرة" (5101) موجود فعليًا
// بشجرة العميل عبر API صُنِّف خطأً "تكاليف تشغيلية" عند إضافة أبناء تحته من
// ملف عميل يحمل عمود "حساب الأب" صريحًا — رغم أن الأب موجود فعلًا بالشجرة.
// السبب: canonicalizeLevel2Category (تخمين نصي من اسم الحساب) لا يطابق صياغة
// "تكاليف مباشرة" (بلا "ال" التعريف) مع الاسم الرسمي "التكلفة المباشرة".
// mapQoyodTypeToLevel2 يتفادى هذا كليًا باستخدام نوع Qoyod الحقيقي المؤكَّد.
describe("mapQoyodTypeToLevel2 — عكس QOYOD_TYPE_BY_LEVEL2 لقيم غير ملتبسة فقط", () => {
  it("DirectCost يطابق التكلفة المباشرة (قيمة فريدة بلا لبس)", () => {
    expect(mapQoyodTypeToLevel2("DirectCost")).toBe("التكلفة المباشرة");
  });

  it("CurrentAsset / FixedAsset / Sale / OtherIncome — كلها فريدة بلا لبس", () => {
    expect(mapQoyodTypeToLevel2("CurrentAsset")).toBe("الأصول المتداولة");
    expect(mapQoyodTypeToLevel2("FixedAsset")).toBe("الأصول غير المتداولة");
    expect(mapQoyodTypeToLevel2("Sale")).toBe("المبيعات");
    expect(mapQoyodTypeToLevel2("OtherIncome")).toBe("الإيرادات الأخرى");
  });

  it("Equity ملتبسة (3 فئات) — ترجع فارغة عمدًا، يبقى الاستنتاج النصي المعتاد", () => {
    expect(mapQoyodTypeToLevel2("Equity")).toBe("");
    expect(QOYOD_LEVEL2_BY_UNIQUE_TYPE.Equity).toBeUndefined();
  });

  it("Expense ملتبسة (تكاليف تشغيلية/غير تشغيلية) — ترجع فارغة عمدًا", () => {
    expect(mapQoyodTypeToLevel2("Expense")).toBe("");
    expect(QOYOD_LEVEL2_BY_UNIQUE_TYPE.Expense).toBeUndefined();
  });

  it("قيمة فارغة أو غير معروفة ترجع فارغة بلا رمي خطأ", () => {
    expect(mapQoyodTypeToLevel2("")).toBe("");
    expect(mapQoyodTypeToLevel2(undefined)).toBe("");
    expect(mapQoyodTypeToLevel2("NotARealType")).toBe("");
  });
});

// [إضافة — البلاغ الحقيقي كاملاً، سيناريو تكامل] ملف عميل يحمل عمود "حساب
// الأب" صريحًا (5101 موجود فعليًا بالشجرة المجلوبة عبر API، مصنَّف Qoyod نفسه
// "DirectCost") — النتيجة يجب أن تكون level2Category = "التكلفة المباشرة"
// (لا "تكاليف تشغيلية" كما كان يحدث خطأً)، والأب المُعتمَد = 5101 كما هو
// بالضبط، بلا أي تحذير "أب مفقود" (5101 موجود فعليًا بـexistingCodes).
describe("compareTrees — الأب الصريح من ملف العميل + qoyodType يحسمان الفئة بدقة (لا تخمين نصي)", () => {
  it("حساب أب 5101 (DirectCost) موجود فعليًا عبر API — الابن يرث الفئة الصحيحة بيقين، لا 'تكاليف تشغيلية' الافتراضية", () => {
    const file1Records = qoyodAccountsToFile1Records([
      { id: 1, code: "5", name_ar: "المصاريف", name_en: "Expenses", type: "" },
      { id: 2, code: "51", name_ar: "تكاليف مباشرة", name_en: "Direct Costs", type: "" },
      { id: 3, code: "5101", name_ar: "تكاليف مباشرة", name_en: "Direct Costs", type: "DirectCost" },
    ]);
    const file2Records = [
      { code: "5101001", nameAr: "مصروف الرواتب (001)", nameEn: "", level: "", parent: "5101", type: "", desc: "", debit: "", credit: "", payCollect: "", extra: {}, _rowIndex: 1 },
    ];
    const { results, existingCodes } = compareTrees(file1Records, file2Records, false);
    expect(existingCodes).toContain("5101");
    const newRow = results.find((r) => r.status === "new");
    expect(newRow.parent).toBe("5101");
    expect(newRow.level2Category).toBe("التكلفة المباشرة");
    expect(newRow.warnings.some((w) => w.includes("أب مفقود"))).toBe(false);
  });

  it("بلا qoyodType (ملف 1 مرفوع يدويًا، لا API) — حساب مستوى2 اسمه 'تكاليف مباشرة' يُكتشَف عبر كلمة 'تكاليف' المضافة لجذر المصاريف", () => {
    // "51" حساب مستوى2 فعلي (رمز من خانتين) — الشكل المعتاد لشجرة حسابات
    // سعودية قياسية (1-2-4-6 خانات). بلا الكلمة المضافة ("تكاليف") لم يكن
    // جذر "المصاريف" يُكتشَف من هذا الاسم إطلاقًا (يطابق "مصروف/مصاريف" فقط
    // سابقًا)، فتفشل canonicalizeLevel2Category بالكامل (لا مطابقة حرفية، لا
    // تشابه كافٍ، ولا كشف جذر) وتُرجع فئة فارغة.
    const file1Records = [
      { code: "5", nameAr: "المصاريف", nameEn: "Expenses", level: "", parent: "", type: "", desc: "", debit: "", credit: "", payCollect: "No", extra: {}, _rowIndex: -1 },
      { code: "51", nameAr: "تكاليف مباشرة", nameEn: "Direct Costs", level: "", parent: "5", type: "", desc: "", debit: "", credit: "", payCollect: "No", extra: {}, _rowIndex: -1 },
    ];
    const { tree1Index } = compareTrees(file1Records, [], false);
    const acc51 = tree1Index.find((r) => r.code === "51");
    expect(acc51.level).toBe(2);
    expect(acc51.level2Category).toBe("التكلفة المباشرة");
  });
});
