import { describe, it, expect } from "vitest";
import { nextChildCodeForParent } from "../MergeTool.jsx";

/**
 * نقل حساب في مخطط الشجرة يعيد ترقيمه تلقائيًا ليتناسب مع أبناء أبيه الجديد -
 * هذا الاختبار يغطي الدالة المحورية (nextChildCodeForParent) التي تحدد الرمز
 * التالي المتاح. سيناريو التقرير بالضبط: أبناء الحساب "11" تصل إلى 1106، فحساب
 * منقول تحته يجب أن يأخذ 1107 - بصرف النظر عن اسمه أو رمزه القديم.
 */
describe("nextChildCodeForParent — إعادة الترقيم الهرمي عند نقل حساب في المخطط", () => {
  it("يعيد الرمز التالي بعد أعلى رمز شقيق موجود في الشجرة الحالية", () => {
    const tree1Index = [
      { code: "11", parent: "1" },
      { code: "1101", parent: "11" },
      { code: "1106", parent: "11" }, // أعلى رمز شقيق حاليًا
      { code: "1103", parent: "11" },
    ];
    expect(nextChildCodeForParent("11", [], tree1Index)).toBe("1107");
  });

  it("يأخذ بعين الاعتبار حسابات هذا الملف الجديدة أيضًا لا الشجرة الحالية وحدها", () => {
    const tree1Index = [{ code: "11", parent: "1" }, { code: "1106", parent: "11" }];
    const rows = [
      { status: "new", deleted: false, code: "1107", parent: "11" }, // أُضيف سابقًا في نفس الجلسة
    ];
    expect(nextChildCodeForParent("11", rows, tree1Index)).toBe("1108");
  });

  it("يتجاهل الصفوف المحذوفة عند حساب أعلى رمز شقيق", () => {
    const rows = [
      { status: "new", deleted: false, code: "1106", parent: "11" },
      { status: "new", deleted: true, code: "1199", parent: "11" }, // مستبعد - لا يُحتسب
    ];
    expect(nextChildCodeForParent("11", rows, [])).toBe("1107");
  });

  it("يحافظ على عرض الرقم (الأصفار البادئة) عند الترقيم", () => {
    const tree1Index = [{ code: "010203", parent: "0102" }];
    expect(nextChildCodeForParent("0102", [], tree1Index)).toBe("010204");
  });

  it('لا يوجد أبناء بعد تحت الأب الجديد - يعيد "" (لا رمز يُقترح، لا يُخمَّن)', () => {
    expect(nextChildCodeForParent("99", [], [])).toBe("");
  });
});
