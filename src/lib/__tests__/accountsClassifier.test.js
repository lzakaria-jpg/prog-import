import { describe, it, expect } from "vitest";
import { matchAccountType, buildCodeCategoryHints, lookupCodeCategoryHint, classifyMissingAccount } from "../accountsClassifier.js";

describe("matchAccountType — بلا قيد (السلوك الأصلي، لأداة استيراد شجرة الحسابات)", () => {
  it("يطابق كلمة مفتاحية معروفة", () => {
    expect(matchAccountType("إيجار مقدم").type).toBe("مصروفات مقدمة");
    expect(matchAccountType("راتب موظف").type).toBe("الرواتب");
  });
  it("لا يجد تطابقًا لاسم غير معروف", () => {
    expect(matchAccountType("ايرادات تأجير").type).toBe("");
  });
  it("candidateTypes يقصر البحث على مجموعة فرعية فقط", () => {
    // "بنك" يطابق "حساب البنك" افتراضيًا...
    expect(matchAccountType("حساب بنك الراجحي").type).toBe("حساب البنك");
    // ...لكن يفشل لو استُبعِد "حساب البنك" من المرشحين
    expect(matchAccountType("حساب بنك الراجحي", ["المدينون", "الرواتب"]).type).toBe("");
  });
});

// [إضافة] طلب المستخدم الصريح: "رمز الحساب مهم جدًا بتحديد نوع الحساب بعد جلب
// شجرة حسابات العميل" — أمثلته الحقيقية بالضبط.
describe("buildCodeCategoryHints / lookupCodeCategoryHint — تعلّم فئات الحساب من شجرة العميل الفعلية لا افتراض ثابت", () => {
  const chartAccounts = [
    { code: "11", name: "الأصول المتداولة" },
    { code: "12", name: "الأصول غير المتداولة" },
    { code: "42", name: "الإيرادات الأخرى" },
    { code: "2", name: "الالتزامات" },
  ];
  const hints = buildCodeCategoryHints(chartAccounts);

  it("يحفظ فئة مستوى2 لرمز الحساب الذي اسمه يطابق اسم الفئة حرفيًا", () => {
    expect(hints["11"]).toEqual({ level2Category: "الأصول المتداولة", level1Root: "الأصول" });
    expect(hints["42"]).toEqual({ level2Category: "الإيرادات الأخرى", level1Root: "الإيرادات" });
  });
  it("يحفظ جذر مستوى1 فقط حين يطابق الاسم جذرًا لا فئة مستوى2 محددة", () => {
    expect(hints["2"]).toEqual({ level1Root: "الالتزامات" });
  });
  it("lookupCodeCategoryHint يجد أطول رمز أب موجود فعليًا بالفهرس (اقتطاع من اليمين)", () => {
    expect(lookupCodeCategoryHint("420102", hints)).toEqual({ level2Category: "الإيرادات الأخرى", level1Root: "الإيرادات" });
    expect(lookupCodeCategoryHint("1140100227", hints)).toEqual({ level2Category: "الأصول المتداولة", level1Root: "الأصول" });
  });
  it("لا يجد شيئًا لرمز لا يشترك بأي بادئة مع الفهرس", () => {
    expect(lookupCodeCategoryHint("599901", hints)).toBeNull();
  });
  it("لا يفترض ترقيمًا قياسيًا — عميل يستخدم الجذر 2 لإيراداته لا 4 يبقى بلا فئة إن لم تسمِّه شجرته صراحةً", () => {
    const nonStandard = [{ code: "2", name: "الإيرادات" }];
    const h = buildCodeCategoryHints(nonStandard);
    expect(lookupCodeCategoryHint("201", h)).toEqual({ level1Root: "الإيرادات" });
  });
});

describe("classifyMissingAccount — أمثلة حقيقية من المستخدم", () => {
  const chartAccounts = [
    { code: "11", name: "الأصول المتداولة" },
    { code: "12", name: "الأصول غير المتداولة" },
    { code: "42", name: "الإيرادات الأخرى" },
  ];
  const hints = buildCodeCategoryHints(chartAccounts);

  it("رمز 420102 تحت فئة العميل '42 = الإيرادات الأخرى' يُصنَّف بهذه الفئة حتى لو الاسم غير معروف", () => {
    const r = classifyMissingAccount("ايراد تأجير", "420102", hints);
    expect(r.level2Category).toBe("الإيرادات الأخرى");
    expect(r.confidence).toBe("code");
  });

  it("اسم شخص برمز يبدأ بـ11 (أصول متداولة بشجرة العميل) يُقترَح 'عهد نقدية'", () => {
    const r = classifyMissingAccount("مي القديري", "1140100227", hints);
    expect(r).toEqual({ type: "عهد نقدية", level2Category: "الأصول المتداولة", confidence: "code" });
  });

  it("اسم منشأة (لا شخص) بنفس نطاق الرمز لا يُصنَّف زائفًا كـ'عهد نقدية'", () => {
    const r = classifyMissingAccount("شركة الأمل للمقاولات", "110499", hints);
    expect(r.type).toBe("");
    expect(r.level2Category).toBe("الأصول المتداولة");
  });

  it("رمز خارج نطاق أي فئة معروفة بشجرة العميل يعتمد مطابقة الاسم وحدها كالسابق تمامًا", () => {
    const r = classifyMissingAccount("راتب موظف", "599901", hints);
    expect(r).toEqual({ type: "الرواتب", level2Category: "تكاليف تشغيلية", confidence: "name" });
  });

  it("تعارض بين اسم مطابَق عامةً ورمز يوحي بفئة مختلفة — الرمز يفوز (طلب صريح من المستخدم)", () => {
    // "بنك" يطابق افتراضيًا "حساب البنك" (أصول متداولة)، لكن الرمز هنا (تحت فئة
    // العميل "42 = الإيرادات الأخرى") يفرض إعادة المطابقة ضمن أنواع تلك الفئة فقط.
    const r = classifyMissingAccount("بنك", "420199", hints);
    expect(r.level2Category).toBe("الإيرادات الأخرى");
    expect(r.type).not.toBe("حساب البنك");
  });

  it("بلا أي فهرس (chartAccounts فارغة/غير مُمرَّرة) يتصرف تمامًا كمطابقة الاسم فقط", () => {
    const r = classifyMissingAccount("إيجار مقدم", "110402", {});
    expect(r).toEqual({ type: "مصروفات مقدمة", level2Category: "الأصول المتداولة", confidence: "name" });
  });
});
