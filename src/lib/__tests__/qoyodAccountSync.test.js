import { describe, it, expect } from "vitest";
import {
  mapAccountTypeToQoyod,
  buildQoyodAccountPayload,
  buildQoyodDuplicateIndex,
  checkAccountDuplicate,
  qoyodAccountsToFile1Records,
  QOYOD_TYPE_BY_LEVEL2,
  ALL_QOYOD_ACCOUNT_TYPES,
} from "../qoyodAccountSync.js";
import { LEVEL2_TO_LEVEL1, LEVEL3_MAP, TYPE_TO_LEVEL2, compareTrees } from "../../MergeTool.jsx";

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

  it("يبني الحمولة كاملة بالشكل الصحيح لصف سليم", () => {
    const result = buildQoyodAccountPayload(validRow);
    expect(result.ok).toBe(true);
    expect(result.payload).toEqual({
      account: {
        name_en: "Test Fixed Asset",
        name_ar: "أصل ثابت اختباري",
        code: "120105",
        description: "وصف تجريبي",
        recieve_payments: "false",
        type: "FixedAsset",
      },
    });
  });

  it("يستخدم دومًا اسم الحقل الفعلي recieve_payments (بالتهجئة الناقصة) — مؤكد ميدانيًا مع Qoyod الحقيقي", () => {
    const result = buildQoyodAccountPayload(validRow);
    expect(result.payload.account).toHaveProperty("recieve_payments");
    expect(result.payload.account).not.toHaveProperty("receive_payments");
  });

  it("payCollect='Yes' يصبح recieve_payments:'true'", () => {
    const result = buildQoyodAccountPayload({ ...validRow, payCollect: "Yes" });
    expect(result.payload.account.recieve_payments).toBe("true");
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
