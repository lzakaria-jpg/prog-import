import { describe, it, expect } from "vitest";
import { enforceCategoryInheritance } from "../MergeTool.jsx";

// صف مساعد لبناء صفوف "new" مطابقة لشكل الصفوف الفعلي في MergeTool
function row({ id, code, parent, level, type, level2Category = "", nameAr = "", errors = [], warnings = [] }) {
  return { id, status: "new", deleted: false, code, parent, level, type, level2Category, nameAr, nameEn: "", errors, warnings };
}

describe("enforceCategoryInheritance — توافق النوع مع عائلة الأب (المستويات 3-7)", () => {
  it("Test 1 — الحالة الواقعية المُبلَّغة: الأب 54 = تكاليف تشغيلية، الابن 540102 = تكلفة المبيعات (عائلة أخرى) => خطأ", () => {
    const rows = [
      row({ id: "p54", code: "54", parent: "5", level: 2, type: "تكاليف تشغيلية" }),
      row({ id: "c540102", code: "540102", parent: "54", level: 3, type: "تكلفة المبيعات", level2Category: "التكلفة المباشرة", nameAr: "عمولات مندوب" }),
    ];
    const { rows: out } = enforceCategoryInheritance(rows, []);
    const child = out.find((r) => r.id === "c540102");
    expect(child.errors.length).toBeGreaterThan(0);
    expect(child.errors[0]).toMatch(/توافق النوع مع الأب/);
    expect(child.errors[0]).toMatch(/تكاليف تشغيلية/); // اقتراح من عائلة الأب مذكور في الرسالة
  });

  it("Test 2 — الأب 56، الابن 560101 مصنَّف \"غير تشغيلية\" (عائلة أخرى) => يُصحَّح لعائلة الأب (يُصنَّف خطأ مع اقتراح)", () => {
    const rows = [
      row({ id: "p56", code: "56", parent: "5", level: 2, type: "تكاليف غير تشغيلية" }),
      row({ id: "c560101", code: "560101", parent: "56", level: 3, type: "مصاريف عمومية وإدارية", nameAr: "شيء ما" }),
    ];
    const { rows: out } = enforceCategoryInheritance(rows, []);
    const child = out.find((r) => r.id === "c560101");
    expect(child.errors.length).toBeGreaterThan(0);
    expect(child.errors[0]).toMatch(/تكاليف غير تشغيلية/);
  });

  it('Test 3 — التصنيف الصحيح "تكاليف تشغيلية أخرى" تحت أب من نفس العائلة => سليم بلا أي خطأ أو تنبيه', () => {
    const rows = [
      row({ id: "p54", code: "54", parent: "5", level: 2, type: "تكاليف تشغيلية" }),
      row({ id: "c540103", code: "540103", parent: "54", level: 3, type: "تكاليف تشغيلية أخرى", nameAr: "مصاريف متنوعة" }),
    ];
    const { rows: out } = enforceCategoryInheritance(rows, []);
    const child = out.find((r) => r.id === "c540103");
    expect(child.errors).toHaveLength(0);
    expect(child.warnings).toHaveLength(0);
    expect(child.level2Category).toBe("تكاليف تشغيلية");
  });

  it("لا يُصنَّف خطأ عندما لا يوجد نوع محدد أصلًا (يبقى ضمن تنبيه آخر غير محتسب هنا)", () => {
    const rows = [
      row({ id: "p54", code: "54", parent: "5", level: 2, type: "تكاليف تشغيلية" }),
      row({ id: "c1", code: "540199", parent: "54", level: 3, type: "", nameAr: "بلا نوع" }),
    ];
    const { rows: out } = enforceCategoryInheritance(rows, []);
    const child = out.find((r) => r.id === "c1");
    expect(child.errors).toHaveLength(0);
  });

  it("يعمل عبر أب موجود مسبقًا في الشجرة الحالية (tree1Index) لا فقط أب \"جديد\"", () => {
    const tree1Index = [{ code: "54", level: 2, type: "تكاليف تشغيلية", level2Category: null }];
    const rows = [
      row({ id: "c1", code: "540102", parent: "54", level: 3, type: "تكلفة المبيعات", nameAr: "عمولات مندوب" }),
    ];
    const { rows: out } = enforceCategoryInheritance(rows, tree1Index);
    const child = out.find((r) => r.id === "c1");
    expect(child.errors.length).toBeGreaterThan(0);
  });

  it("يفحص تصاعديًا حتى المستوى 7 دون أن يمس المستوى 8+ (خارج النطاق المطلوب)", () => {
    const rows = [
      row({ id: "p", code: "5410102030", parent: "541010203", level: 8, type: "تكلفة المبيعات" }),
    ];
    // بلا أب معروف الفئة أصلًا هنا، لكن الأهم أن level=8 لا يدخل حلقة 3..7 إطلاقًا
    const { rows: out } = enforceCategoryInheritance(rows, []);
    expect(out[0].errors).toHaveLength(0);
  });
});
