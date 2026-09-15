import { describe, it, expect } from "vitest";
import { compareTrees } from "../MergeTool.jsx";
import { qoyodAccountsToFile1Records } from "../lib/qoyodAccountSync.js";

/**
 * [إضافة 2026-09-15] اكتشاف الحساب الأب تلقائيًا عند غياب رمز الحساب والأب
 * الصريح - بلاغ المستخدم الحي: بعد جلب حسابات عميل عبر API (94 حسابًا)
 * ورفع ملف عميل (6 صفوف، اسم فقط بلا رمز/نوع/مستوى/أب)، كانت الأداة تعيد
 * كل الصفوف الستة "تحتاج تنبيه" بلا رمز ولا نوع ولا مستوى إطلاقًا - رغم أن
 * حسابات الآباء الصحيحة (2301 "مستحق الموظفين"، 5201 "مصروف رواتب الموظفين")
 * كانت موجودة فعلاً ضمن الحسابات المجلوبة. طلب المستخدم الصريح: التعرّف على
 * الأب من رمز الحساب إن وجد، أو من اسمه الأقرب له.
 */
describe("compareTrees — اكتشاف الحساب الأب تلقائيًا بمطابقة النوع المستنتج من الاسم (بلا رمز/أب صريح)", () => {
  // شجرة مبسّطة تحاكي حسابات عميل حقيقي مجلوبة عبر API: 2301 و5201 موجودان
  // فعلاً تحت آبائهما الصحيحين، بأسماء تمثّل بالضبط ما وصفه المستخدم
  const rawAccounts = [
    { code: "2", name_ar: "الالتزامات", name_en: "Liabilities" },
    { code: "23", name_ar: "التزامات متداولة", name_en: "Current liabilities" },
    { code: "2301", name_ar: "مستحق الموظفين", name_en: "Employees payable" },
    { code: "5", name_ar: "المصاريف", name_en: "Expenses" },
    { code: "52", name_ar: "تكاليف تشغيلية", name_en: "Operational cost" },
    { code: "5201", name_ar: "مصروف رواتب الموظفين", name_en: "Employees salaries expense" },
  ];
  const file1Records = qoyodAccountsToFile1Records(rawAccounts);

  function clientRow(nameAr) {
    return { code: "", nameAr, nameEn: "", level: "", parent: "", type: "", desc: "", debit: "", credit: "", payCollect: "No", extra: {} };
  }

  it("البلاغ الحي كاملاً: 6 صفوف عميل (اسم فقط) تُصنَّف وتُربَط بآبائها الصحيحة تلقائيًا - لا 'تحتاج تنبيه' فارغة", () => {
    const file2 = [
      clientRow("مستحق راتب عبدالعزيز الصادق عتيق الفرزعي"),
      clientRow("مستحق راتب رمزي عنبه"),
      clientRow("مستحق راتب فؤاد سلطان امو"),
      clientRow("مصروف راتب عبدالعزيز الصادق عتيق الفرزعي"),
      clientRow("مصروف راتب رمزي عنبه"),
      clientRow("مصروف راتب فؤاد سلطان امو"),
    ];

    const { results } = compareTrees(file1Records, file2, false);
    const newRows = results.filter((r) => r.status === "new");
    expect(newRows).toHaveLength(6);

    const mustahaqRows = newRows.filter((r) => r.nameAr.startsWith("مستحق راتب"));
    const masroufRows = newRows.filter((r) => r.nameAr.startsWith("مصروف راتب"));
    expect(mustahaqRows).toHaveLength(3);
    expect(masroufRows).toHaveLength(3);

    mustahaqRows.forEach((r) => {
      expect(r.parent).toBe("2301");
      expect(r.level).toBe(4);
      expect(r.level2Category).toBe("الالتزامات المتداولة");
      expect(r.type).toBe("الرواتب والمبالغ المستحقة للموظفين");
      expect(r.code).toMatch(/^2301\d{2}$/);
      expect(r.errors).toHaveLength(0);
    });

    masroufRows.forEach((r) => {
      expect(r.parent).toBe("5201");
      expect(r.level).toBe(4);
      expect(r.level2Category).toBe("تكاليف تشغيلية");
      expect(r.type).toBe("الرواتب");
      expect(r.code).toMatch(/^5201\d{2}$/);
      expect(r.errors).toHaveLength(0);
    });

    // رموز فرعية فريدة ومتسلسلة تحت كل أب (لا تكرار)
    const mustahaqCodes = mustahaqRows.map((r) => r.code).sort();
    expect(new Set(mustahaqCodes).size).toBe(3);
    const masroufCodes = masroufRows.map((r) => r.code).sort();
    expect(new Set(masroufCodes).size).toBe(3);
  });

  it("يُضيف تنبيهًا صريحًا يوضّح أن الأب اكتُشف تلقائيًا مع اسمه ورمزه - للمراجعة اليدوية", () => {
    const { results } = compareTrees(file1Records, [clientRow("مستحق راتب أحمد")], false);
    const row = results.find((r) => r.status === "new");
    expect(row.warnings.some((w) => w.includes("تم تحديد الحساب الأب تلقائيًا") && w.includes("مستحق الموظفين") && w.includes("2301"))).toBe(true);
  });

  it("لا يكتشف أبًا وهميًا حين لا يوجد أي حساب من نفس النوع بالشجرة الحالية - يبقى بلا أب كما كان قبل الإصلاح", () => {
    const { results } = compareTrees(file1Records, [clientRow("إيراد استشارات إدارية متنوعة")], false);
    const row = results.find((r) => r.status === "new");
    expect(row.parent).toBe("");
    expect(row.warnings.some((w) => w.includes("تم تحديد الحساب الأب تلقائيًا"))).toBe(false);
  });

  // [حماية من الانحدار] الحارس الذي يمنع اعتبار صف مستوى1/مستوى2 (اسمه جذر أو
  // فئة معتمدة صراحة) يشبه صفًا فرعيًا فيُنسَب خطأً تحت حساب ورقي - راجع تعليق
  // "لا يشبه صف مستوى1/مستوى2" بجانب looksLikeHeaderRow بالكود
  it("لا يربط صفًا جذريًا (نوعه/اسمه يطابق حرفيًا جذرًا أو فئة معتمدة) بأي حساب ورقي - يبقى بلا أب رغم غياب الرمز", () => {
    const { results } = compareTrees(file1Records, [
      { code: "", nameAr: "المصاريف", nameEn: "", level: "", parent: "", type: "المصاريف", desc: "", debit: "", credit: "", payCollect: "No", extra: {} },
      { code: "", nameAr: "تكاليف تشغيلية", nameEn: "", level: "", parent: "", type: "", desc: "", debit: "", credit: "", payCollect: "No", extra: {} },
    ], false);
    const newRows = results.filter((r) => r.status === "new");
    newRows.forEach((r) => {
      expect(r.warnings.some((w) => w.includes("تم تحديد الحساب الأب تلقائيًا"))).toBe(false);
    });
  });

  it("لا يتدخّل إطلاقًا حين يوجد عمود أب صريح بالصف (السلوك القديم بلا تغيير)", () => {
    const explicit = { code: "", nameAr: "مستحق راتب حساب بأب صريح", nameEn: "", level: "", parent: "2301", type: "", desc: "", debit: "", credit: "", payCollect: "No", extra: {} };
    const { results } = compareTrees(file1Records, [explicit], false);
    const row = results.find((r) => r.nameAr === "مستحق راتب حساب بأب صريح");
    expect(row.parent).toBe("2301");
    expect(row.warnings.some((w) => w.includes("تم تحديد الحساب الأب تلقائيًا"))).toBe(false);
  });

  it("لا يتدخّل إطلاقًا حين ينجح اقتطاع الرمز داخل ملف 2 نفسه (أب وابن كلاهما بالملف)", () => {
    const file2 = [
      { code: "230150", nameAr: "أب فرعي بملف العميل", nameEn: "", level: "", parent: "", type: "", desc: "", debit: "", credit: "", payCollect: "No", extra: {} },
      { code: "23015001", nameAr: "مستحق راتب ابن الأب الفرعي", nameEn: "", level: "", parent: "", type: "", desc: "", debit: "", credit: "", payCollect: "No", extra: {} },
    ];
    const { results } = compareTrees(file1Records, file2, true);
    const child = results.find((r) => r.nameAr === "مستحق راتب ابن الأب الفرعي");
    // الاقتطاع يجد "230150" (بملف العميل نفسه) أبًا مباشرة - بلا حاجة للاكتشاف الجديد
    expect(child.parent).toBe("230150");
    expect(child.warnings.some((w) => w.includes("تم تحديد الحساب الأب تلقائيًا"))).toBe(false);
  });
});
