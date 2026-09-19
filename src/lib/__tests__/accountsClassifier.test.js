import { describe, it, expect } from "vitest";
import { matchAccountType, buildCodeCategoryHints, lookupCodeCategoryHint, classifyMissingAccount } from "../accountsClassifier.js";

describe("matchAccountType — بلا قيد (السلوك الأصلي، لأداة استيراد شجرة الحسابات، لم يتغيّر)", () => {
  it("يطابق كلمة مفتاحية معروفة", () => {
    expect(matchAccountType("إيجار مقدم").type).toBe("مصروفات مقدمة");
    expect(matchAccountType("راتب موظف").type).toBe("الرواتب");
  });
  it("لا يجد تطابقًا لاسم غير معروف", () => {
    expect(matchAccountType("ايرادات تأجير").type).toBe("");
  });
  it("candidateTypes يقصر البحث على مجموعة فرعية فقط", () => {
    expect(matchAccountType("حساب بنك الراجحي").type).toBe("حساب البنك");
    expect(matchAccountType("حساب بنك الراجحي", ["المدينون", "الرواتب"]).type).toBe("");
  });
});

// [إضافة] طلب المستخدم الصريح: "رمز الحساب مهم جدًا بتحديد نوع الحساب بعد جلب
// شجرة حسابات العميل" — أمثلته الحقيقية بالضبط، عبر نفس محرك المطابقة الحقيقي
// المعتمَد بأداة استيراد شجرة الحسابات (MergeTool.jsx)، لا نسخة محلية أضعف.
describe("buildCodeCategoryHints / lookupCodeCategoryHint — تعلّم فئات الحساب من شجرة العميل الفعلية لا افتراض ثابت", () => {
  it("يحفظ فئة مستوى2 دقيقة لحساب اسمه اسم الفئة الرسمي حرفيًا", () => {
    const hints = buildCodeCategoryHints([{ code: "11", name: "الأصول المتداولة" }, { code: "42", name: "الإيرادات الأخرى" }]);
    expect(hints.explicit["11"]).toEqual({ level2Category: "الأصول المتداولة", level1Root: "الأصول" });
    expect(hints.explicit["42"]).toEqual({ level2Category: "الإيرادات الأخرى", level1Root: "الإيرادات" });
  });

  it("يحفظ جذر مستوى1 فقط (لا فئة مستوى2 مقفَلة خطأً) لحساب اسمه مرادف جذر لا اسم فئة رسمي — مثال حقيقي: 'حقوق الملكية'", () => {
    const hints = buildCodeCategoryHints([{ code: "3", name: "حقوق الملكية" }]);
    expect(hints.explicit["3"]).toEqual({ level1Root: "حقوق الملاك" });
  });

  it("يحفظ فئة دقيقة لحساب اسمه يحوي مؤهِّل 'متداولة' فعليًا (لا مجرد جذر) — مثال حقيقي: '21 = التزامات متداولة'", () => {
    const hints = buildCodeCategoryHints([{ code: "21", name: "التزامات متداولة" }]);
    expect(hints.explicit["21"]).toEqual({ level2Category: "الالتزامات المتداولة", level1Root: "الالتزامات" });
  });

  it("lookupCodeCategoryHint يجد أطول رمز أب موجود فعليًا بالفهرس (اقتطاع من اليمين)", () => {
    const hints = buildCodeCategoryHints([{ code: "42", name: "الإيرادات الأخرى" }]);
    expect(lookupCodeCategoryHint("420102", hints)).toEqual({ level2Category: "الإيرادات الأخرى", level1Root: "الإيرادات" });
  });

  it("لا يفترض ترقيمًا قياسيًا — عميل يستخدم الجذر 2 لإيراداته لا 4 يبقى بلا فئة إن لم تسمِّه شجرته صراحةً", () => {
    const hints = buildCodeCategoryHints([{ code: "2", name: "الإيرادات" }]);
    expect(lookupCodeCategoryHint("201", hints)).toEqual({ level1Root: "الايرادات" });
  });
});

describe("classifyMissingAccount — أمثلة حقيقية من المستخدم (جولتان)", () => {
  it("رمز 420102 تحت فئة العميل '42 = الإيرادات الأخرى' يُصنَّف بهذه الفئة (سواء عبر تطابق الاسم أو الرمز)", () => {
    const hints = buildCodeCategoryHints([{ code: "42", name: "الإيرادات الأخرى" }]);
    const r = classifyMissingAccount("ايراد تأجير", "420102", hints);
    expect(r.level2Category).toBe("الإيرادات الأخرى");
  });

  it("اسم لا يطابق أي كلمة مفتاحية إطلاقًا يعتمد على الرمز وحده (confidence: code)", () => {
    const hints = buildCodeCategoryHints([{ code: "42", name: "الإيرادات الأخرى" }]);
    const r = classifyMissingAccount("عمولة وكيل توزيع خارجي", "420102", hints);
    expect(r).toEqual({ type: "إيرادات أخرى", level2Category: "الإيرادات الأخرى", confidence: "code" });
  });

  it("اسم شخص برمز يبدأ بـ11 (أصول متداولة بشجرة العميل) يُقترَح 'عهد نقدية'", () => {
    const hints = buildCodeCategoryHints([{ code: "11", name: "الأصول المتداولة" }]);
    expect(classifyMissingAccount("مي القديري", "1140100227", hints)).toEqual({ type: "عهد نقدية", level2Category: "الأصول المتداولة", confidence: "code" });
  });

  it("رمز خارج نطاق أي فئة معروفة بشجرة العميل يعتمد مطابقة الاسم وحدها كالسابق تمامًا", () => {
    const hints = buildCodeCategoryHints([{ code: "11", name: "الأصول المتداولة" }]);
    expect(classifyMissingAccount("راتب موظف", "599901", hints)).toEqual({ type: "الرواتب", level2Category: "تكاليف تشغيلية", confidence: "name" });
  });

  // --- الجولة الثانية: "لسا مش شغال 100%" ---

  it("21 = التزامات متداولة بشجرة العميل: اسم شخص أو شركة أو 'أطراف ذات علاقة' → الدائنون", () => {
    const hints = buildCodeCategoryHints([{ code: "21", name: "التزامات متداولة" }]);
    for (const name of ["شركة الرياض للمقاولات", "فيصل الدهام", "أطراف ذات علاقة"]) {
      expect(classifyMissingAccount(name, "2101", hints)).toEqual({ type: "الدائنون", level2Category: "الالتزامات المتداولة", confidence: "code" });
    }
  });

  it("21 = التزامات متداولة: اسم يطابق نوعًا آخر فعليًا (لا طرفًا) يبقى يُصنَّف بنوعه الحقيقي لا الدائنون", () => {
    const hints = buildCodeCategoryHints([{ code: "21", name: "التزامات متداولة" }]);
    const r = classifyMissingAccount("مصروف مستحق كهرباء", "2104", hints);
    expect(r.type).toBe("مصاريف مستحقة");
  });

  it("21 = التزامات متداولة: اسم غير مطابق ولا يشبه طرفًا (نص عشوائي فارغ المعنى) يقع تحت الاحتياط العام لا الدائنون", () => {
    const hints = buildCodeCategoryHints([{ code: "21", name: "التزامات متداولة" }]);
    // نص فارغ لا يمر looksLikePartyName أصلاً (طول صفر) — يذهب مباشرة للاحتياط العام
    expect(classifyMissingAccount("", "2199", hints)).toEqual({ type: "التزامات متداولة أخرى", level2Category: "الالتزامات المتداولة", confidence: "code" });
  });

  it("3 = حقوق الملكية (جذر فقط، لا فئة مقفَلة): كل نوع حقوق ملكية يُصنَّف بنوعه الحقيقي من اسمه", () => {
    const hints = buildCodeCategoryHints([{ code: "3", name: "حقوق الملكية" }]);
    expect(classifyMissingAccount("رأس المال", "301", hints)).toMatchObject({ type: "رأس المال", level2Category: "رأس المال المصدر" });
    expect(classifyMissingAccount("جاري شريك محمد", "302", hints)).toMatchObject({ type: "حقوق ملكية أخرى", level2Category: "حقوق الملاك الأخرى" });
    expect(classifyMissingAccount("تسويات سنوية", "303", hints)).toMatchObject({ type: "الأرباح المبقاة (أو الخسائر)", level2Category: "الأرباح المبقاة" });
  });

  it("3 = حقوق الملكية: اسم شخص محدَّد بلا أي مؤهِّل آخر → حقوق ملكية أخرى (الاحتياط العام لجذر حقوق الملاك)", () => {
    const hints = buildCodeCategoryHints([{ code: "3", name: "حقوق الملكية" }]);
    expect(classifyMissingAccount("خالد العتيبي", "304", hints)).toEqual({ type: "حقوق ملكية أخرى", level2Category: "حقوق الملاك الأخرى", confidence: "code" });
  });

  it("5 = المصاريف (جذر فقط): تكلفة بضاعة/زكاة تُصنَّف بنوعها الدقيق، وأي اسم آخر يقع تحت 'تكاليف تشغيلية أخرى'", () => {
    const hints = buildCodeCategoryHints([{ code: "5", name: "المصاريف" }]);
    expect(classifyMissingAccount("تكلفة بضاعة", "501", hints)).toMatchObject({ type: "تكلفة المبيعات", level2Category: "التكلفة المباشرة" });
    expect(classifyMissingAccount("مصروف زكاة", "502", hints)).toMatchObject({ type: "الزكاة", level2Category: "تكاليف غير تشغيلية" });
    expect(classifyMissingAccount("مصروف غير مفهوم", "599", hints)).toEqual({ type: "تكاليف تشغيلية أخرى", level2Category: "تكاليف تشغيلية", confidence: "code" });
  });

  it("بلا أي لافتة بشجرة العميل ولا اسم مطابق: احتياط أخير بالترقيم القياسي (1 أصول، 4 إيرادات) — لا يترك الحساب بلا تصنيف إطلاقًا", () => {
    expect(classifyMissingAccount("شيء غامض", "199001", {})).toEqual({ type: "أصول متداولة أخرى", level2Category: "الأصول المتداولة", confidence: "guess" });
    expect(classifyMissingAccount("شيء غامض", "499001", {})).toEqual({ type: "إيرادات أخرى", level2Category: "الإيرادات الأخرى", confidence: "guess" });
  });

  // --- الجولة الثالثة: "الاداة لم تعتمد على رمز الحساب اولا في تحديد نوع الحساب" ---

  // شجرة عميل واقعية بأسماء عملية بحتة: لا حساب واحد فيها اسمه اسم فئة أو جذر
  // معروف — الحالة الشائعة فعليًا، وهي بالضبط التي أخفقت ببلاغ المستخدم.
  const practicalChart = [
    { code: "1101", name: "الصندوق" },
    { code: "1102", name: "بنك الراجحي" },
    { code: "1201", name: "سيارات" },
    { code: "5101", name: "رواتب وأجور" },
    { code: "5102", name: "إيجار المكتب" },
    { code: "5103", name: "كهرباء ومياه" },
  ];

  it("شجرة بلا أي لافتة صريحة: الجذر يُستنتَج بالتصويت من أسماء حسابات العميل نفسها", () => {
    const hints = buildCodeCategoryHints(practicalChart);
    expect(hints.derived["5"]).toEqual({ level1Root: "المصاريف" });
    expect(hints.derived["1"]).toEqual({ level1Root: "الاصول" });
  });

  it("حساب 5301 'حاسب آلي وطابعات' يُصنَّف مصاريف لا أصولًا غير متداولة (بلاغ المستخدم الحرفي)", () => {
    const hints = buildCodeCategoryHints(practicalChart);
    for (const name of ["حاسب آلي وطابعات", "أثاث مكتبي", "سيارات"]) {
      const r = classifyMissingAccount(name, "5301", hints);
      expect(r.level2Category).toBe("تكاليف تشغيلية");
      expect(r.type).toBe("تكاليف تشغيلية أخرى");
    }
  });

  it("نفس الاسم برمز أصول يبقى أصولًا — الرمز هو الحاكم لا الاسم", () => {
    const hints = buildCodeCategoryHints(practicalChart);
    expect(classifyMissingAccount("أجهزة حاسب", "1205", hints)).toMatchObject({
      type: "عقارات وآلات ومعدات", level2Category: "الأصول غير المتداولة",
    });
  });

  it("داخل جذر المصاريف المستنتَج، الاسم لا يزال يحسم الفئة الصحيحة (لا تُقفَل كلها بفئة واحدة)", () => {
    const hints = buildCodeCategoryHints(practicalChart);
    expect(classifyMissingAccount("تكلفة بضاعة مباعة", "5401", hints)).toMatchObject({ level2Category: "التكلفة المباشرة" });
    expect(classifyMissingAccount("مصروف زكاة", "5501", hints)).toMatchObject({ level2Category: "تكاليف غير تشغيلية" });
  });

  it("بلا رمز إطلاقًا وبلا تطابق اسم: لا شيء (لا يوجد حتى رقم جذر لتخمينه)", () => {
    expect(classifyMissingAccount("شيء غامض", "", {})).toEqual({ type: "", level2Category: "", confidence: "none" });
  });
});
