import { describe, it, expect } from "vitest";
import {
  compareTrees, detectRootDigitRemap, applyRootDigitRemap, ensureParentsExist,
  enforceQoyodParentConstraints,
} from "../MergeTool.jsx";

/**
 * بلاغ حقيقي (2026-10-07): ملف عميل جذوره 2 = حقوق الملاك و3 = الالتزامات.
 * الأداة كانت تفرض معنى قيود للرقم الأول فانقلب تصنيف كل حسابات الجذرين،
 * ورفض قيود 59 حساباً من 304. هذه الاختبارات تثبّت الإصلاح.
 */
const rec = (code, nameAr, level, parent, type = "", payCollect = "No") => ({ code, nameAr, nameEn: "", level: String(level), parent, type, payCollect });

const clientFile = [
  rec("1", "الأصول", 1, "", "الاصول"),
  rec("12", "الأصول المتداولة", 2, "1", "الاصول"),
  rec("1201", "النقد والنقد المعادل", 3, "12", "الاصول"),
  rec("2", "حقوق الملاك", 1, "", "حقوق الملاك"),
  rec("21", "حقوق الملكية", 2, "2", "حقوق الملاك"),
  rec("2101", "راس المال", 3, "21", "حقوق الملاك"),
  rec("210101", "راس مال الشريك", 4, "2101", "حقوق الملاك", "Yes"),
  rec("3", "الالتزامات", 1, "", "الالتزامات"),
  rec("32", "الالتزامات المتداولة", 2, "3", "الالتزامات"),
  rec("3202", "مصاريف مستحقة", 3, "32", "الالتزامات"),
  rec("4", "الايرادات", 1, "", "الايرادات"),
  rec("5", "المصاريف", 1, "", "المصاريف"),
];

describe("detectRootDigitRemap — معنى أرقام الجذور من ملف العميل نفسه", () => {
  it("2 = حقوق الملاك و3 = الالتزامات -> تبديل 2↔3", () => {
    const { map, conflicts } = detectRootDigitRemap(clientFile);
    expect([...map].sort()).toEqual([["2", "3"], ["3", "2"]]);
    expect(conflicts).toEqual([]);
  });

  it("ترقيم قيود القياسي -> لا تحويل إطلاقاً", () => {
    const std = [rec("1", "الأصول", 1, ""), rec("2", "الالتزامات", 1, ""), rec("3", "حقوق الملكية", 1, ""), rec("4", "الإيرادات", 1, ""), rec("5", "المصروفات", 1, "")];
    expect(detectRootDigitRemap(std).map.size).toBe(0);
  });

  it("جذر باسم ملتبس (الالتزامات وحقوق الملكية) لا يُحوَّل", () => {
    const amb = [rec("1", "الأصول", 1, ""), rec("2", "الالتزامات وحقوق الملكية", 1, ""), rec("21", "قروض", 2, "2")];
    expect(detectRootDigitRemap(amb).map.size).toBe(0);
  });

  it("نوع الصف يخالف اسمه -> تعارض بلا تحويل", () => {
    const bad = [rec("2", "حقوق الملاك", 1, "", "الالتزامات"), rec("3", "الالتزامات", 1, "", "حقوق الملاك")];
    const { map, conflicts } = detectRootDigitRemap(bad);
    expect(map.size).toBe(0);
    expect(conflicts.length).toBe(2);
  });

  it("جذر إضافي بنفس معنى جذر موجود (6 = مصاريف و5 = مصاريف) لا يُدمج", () => {
    const dup = [rec("5", "المصاريف", 1, ""), rec("6", "مصاريف أخرى", 1, ""), rec("61", "مصروف", 2, "6")];
    const { map, conflicts } = detectRootDigitRemap(dup);
    expect(map.size).toBe(0);
    expect(conflicts.length).toBe(1);
  });

  it("جذر غير قياسي برقم فارغ يُنقل لرقمه (6 = المصاريف ولا يوجد 5)", () => {
    const six = [rec("1", "الأصول", 1, ""), rec("6", "المصروفات", 1, ""), rec("61", "مصاريف إدارية", 2, "6")];
    expect([...detectRootDigitRemap(six).map]).toEqual([["6", "5"]]);
  });

  it("ملف بلا صفوف جذور: أغلبية واضحة من عمود النوع الصريح", () => {
    const noRoots = [
      rec("2101", "رأس المال", 3, "21", "رأس المال"),
      rec("2102", "احتياطي نظامي", 3, "21", "الاحتياطيات"),
      rec("2103", "أرباح مبقاة", 3, "21", "حقوق ملكية أخرى"),
      rec("3101", "موردين", 3, "31", "التزامات متداولة أخرى"),
      rec("3102", "مصاريف مستحقة", 3, "31", "مصاريف مستحقة"),
      rec("3103", "قروض", 3, "31", "قروض قصيرة الأجل"),
    ];
    expect([...detectRootDigitRemap(noRoots).map].sort()).toEqual([["2", "3"], ["3", "2"]]);
  });

  it("applyRootDigitRemap يحوّل الرمز والأب معاً ويحفظ رمز العميل الأصلي", () => {
    const out = applyRootDigitRemap(clientFile, new Map([["2", "3"], ["3", "2"]]));
    const r = out.find((x) => x.clientCode === "210101");
    expect(r.code).toBe("310101");
    expect(r.parent).toBe("3101");
    expect(out.find((x) => x.clientCode === "3202").parent).toBe("22");
    expect(out.find((x) => x.code === "1201").clientCode).toBeUndefined();
  });
});

describe("compareTrees — ملف العميل بجذور مقلوبة يُصنَّف صح", () => {
  const tenant = [
    { code: "1", nameAr: "الأصول", parent: "" },
    { code: "2", nameAr: "الالتزامات", parent: "" },
    { code: "3", nameAr: "حقوق الملكية", parent: "" },
  ];

  it("حسابات حقوق الملاك تحت 3 والالتزامات تحت 2 بلا أي تعارض جذور", () => {
    const { results, rootRemap } = compareTrees(tenant, clientFile, true);
    expect(rootRemap.map.size).toBe(2);
    const byClient = Object.fromEntries(results.filter((r) => r.status === "new").map((r) => [r.source.clientCode || r.source.code, r]));
    expect(byClient["2101"].code).toBe("3101");
    expect(byClient["2101"].level2Category).toMatch(/حقوق الملاك|رأس المال/);
    expect(byClient["210101"].parent).toBe("3101");
    expect(byClient["3202"].code).toBe("2202");
    expect(byClient["3202"].type).toBe("مصاريف مستحقة");
    results.filter((r) => r.status === "new").forEach((r) => {
      expect(r.errors.filter((e) => e.startsWith("تعارض جوهري"))).toEqual([]);
    });
  });

  it("أب صريح غائب (192404 أبوه 1924) لا يُرقّى لمستوى 2 تحت الجذر", () => {
    const file2 = [
      rec("1", "الأصول", 1, "", "الاصول"),
      rec("192404", "استثمار", 4, "1924", "الاصول"),
    ];
    const meta = compareTrees(tenant, file2, true);
    const row = meta.results.find((r) => r.code === "192404");
    expect(row.parent).toBe("1924");
    expect(row.warnings.some((w) => w.includes("1924") && w.includes("غير موجود"))).toBe(true);
    const { created } = ensureParentsExist(meta.results, meta);
    expect(created).toContain("1924");
  });

  it("عمود النوع يصرّح بجذر يخالف رمز الحساب -> خطأ يحتاج تعديل", () => {
    const file2 = [
      rec("1", "الأصول", 1, "", "الاصول"),
      rec("11", "الأصول المتداولة", 2, "1", "الاصول"),
      rec("1101", "الخسائر المرحلة", 3, "11", "حقوق الملاك"),
    ];
    const { results } = compareTrees(tenant, file2, true);
    const row = results.find((r) => r.code === "1101");
    expect(row.errors.some((e) => e.startsWith("تعارض جوهري"))).toBe(true);
  });

  it("نوع لا يدل على جذر بعينه (إيرادات مستحقة) لا يولّد تعارضاً وهمياً", () => {
    const file2 = [
      rec("1", "الأصول", 1, "", "الاصول"),
      rec("11", "الأصول المتداولة", 2, "1", "الاصول"),
      rec("1101", "إيرادات مستحقة", 3, "11", "إيرادات مستحقة"),
    ];
    const { results } = compareTrees(tenant, file2, true);
    expect(results.find((r) => r.code === "1101").errors.some((e) => e.startsWith("تعارض جوهري"))).toBe(false);
  });
});

describe("قيود الحسابات الأب: المقفل نظامياً، والمفعّل للدفع والتحصيل", () => {
  const tenant = [{ code: "2", nameAr: "الالتزامات", parent: "" }, { code: "22", nameAr: "الالتزامات المتداولة", parent: "2", type: "الالتزامات المتداولة" }];

  it("أب اسمه الدائنون حرفياً وله فروع -> خطأ على الفروع", () => {
    const file2 = [
      rec("2201", "الدائنون", 3, "22"),
      rec("220101", "موردين", 4, "2201"),
    ];
    const { results } = compareTrees(tenant, file2, true);
    expect(results.find((r) => r.code === "2201").type).toBe("الدائنون");
    expect(results.find((r) => r.code === "220101").errors.some((e) => e.startsWith("حساب مقفل نظامياً:"))).toBe(true);
  });

  it("أب نوعه مستنتج كمقفل من اسمه (أرصدة دائنة أخرى) -> يُستبدل بنوع غير مقفل وفروعه سليمة", () => {
    const file2 = [
      rec("2203", "أرصدة دائنة أخرى", 3, "22"),
      rec("220301", "إيرادات مقبوضة مقدماً", 4, "2203"),
    ];
    const { results } = compareTrees(tenant, file2, true);
    const parent = results.find((r) => r.code === "2203");
    expect(["المدينون", "الدائنون"]).not.toContain(parent.type);
    expect(results.find((r) => r.code === "220301").errors.some((e) => e.startsWith("حساب مقفل نظامياً:"))).toBe(false);
  });

  it("أب جديد مفعّل للدفع والتحصيل وله فروع -> يُلغى الخيار تلقائياً مع تنبيه", () => {
    const file2 = [
      rec("2202", "مصاريف مستحقة", 3, "22", "", "Yes"),
      rec("220201", "إيجار مستحق", 4, "2202", "", "Yes"),
    ];
    const { results } = compareTrees(tenant, file2, true);
    const parent = results.find((r) => r.code === "2202");
    expect(parent.payCollect).toBe("No");
    expect(parent.warnings.some((w) => w.includes("يمكن الدفع والتحصيل"))).toBe(true);
    expect(results.find((r) => r.code === "220201").payCollect).toBe("Yes");
  });

  it("أب موجود بالمنشأة مفعّل للدفع والتحصيل -> خطأ على الابن الجديد", () => {
    const tenantWithPay = [...tenant, { code: "2202", nameAr: "مصاريف مستحقة", parent: "22", payCollect: "Yes" }];
    const file2 = [rec("220201", "إيجار مستحق", 4, "2202")];
    const { results } = compareTrees(tenantWithPay, file2, true);
    expect(results.find((r) => r.code === "220201").errors.some((e) => e.startsWith("أب مفعّل للدفع والتحصيل:"))).toBe(true);
  });

  it("آمنة للتكرار: تشغيلها مرتين لا يكرر الأخطاء", () => {
    const file2 = [rec("2201", "الدائنون", 3, "22"), rec("220101", "موردين", 4, "2201")];
    const meta = compareTrees(tenant, file2, true);
    const { rows } = enforceQoyodParentConstraints(meta.results, meta.tree1Index);
    expect(rows.find((r) => r.code === "220101").errors.filter((e) => e.startsWith("حساب مقفل نظامياً:")).length).toBe(1);
  });
});
