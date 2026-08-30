import { describe, it, expect } from "vitest";
import { compareTrees } from "../MergeTool.jsx";

/**
 * رمز الحساب أولاً وأخيرًا: حساب فرعي لا يجوز أن يخرج عن عائلة أبيه المباشرة
 * (حساب أصول متداولة رمزه 11xx لا يجوز أن يصبح تكاليف تشغيلية رمزها 5x)،
 * حتى لو ورد ذلك الابن في ملف العميل قبل أبيه — وهو بالضبط السيناريو المُبلَّغ:
 * حساب "1103" (الأصول المتداولة) وابنه "110301" ("دفعات مقدّمة") كان يُصنَّف
 * افتراضيًا ضمن "تكاليف تشغيلية" لأن معالجة الابن سبقت معالجة الأب فورثت بيانات
 * الأب الخام غير المصنَّفة بعد بدل فئته الصحيحة المحسوبة.
 */
describe("compareTrees — الترتيب الهرمي عند التصنيف (الآباء قبل الأبناء)", () => {
  it("يصنَّف حساب فرعي ضمن عائلة أبيه الصحيحة حتى لو ورد قبله في ملف العميل", () => {
    // الأبناء أولاً عمدًا في ملف العميل، ثم الأب فالجد فالجذر - أسوأ ترتيب ممكن
    const file2 = [
      { code: "110301", nameAr: "دفعات مقدّمة", nameEn: "", level: "4" },
      { code: "110302", nameAr: "اشتراكات تقنية", nameEn: "", level: "4" },
      { code: "1103", nameAr: "مصروفات مدفوعة مقدمًا", nameEn: "", level: "3" },
      { code: "11", nameAr: "الأصول المتداولة", nameEn: "", level: "2" },
      { code: "1", nameAr: "الأصول", nameEn: "", level: "1" },
    ];

    const { results } = compareTrees([], file2, true);
    const byCode = Object.fromEntries(results.map((r) => [r.code, r]));

    // الأب: يجب أن يقع ضمن عائلة الأصول (متداولة)، لا المصاريف بأي حال
    expect(byCode["1103"].level2Category).toBe("الأصول المتداولة");

    // الابنان: نفس عائلة الأب حرفيًا - هذا هو جوهر البلاغ
    expect(byCode["110301"].level2Category).toBe("الأصول المتداولة");
    expect(byCode["110302"].level2Category).toBe("الأصول المتداولة");

    // لا خطأ فادح على أي من الحسابات الثلاثة - كلها ضمن عائلتها الصحيحة من أول تصنيف
    expect(byCode["1103"].errors).toHaveLength(0);
    expect(byCode["110301"].errors).toHaveLength(0);
    expect(byCode["110302"].errors).toHaveLength(0);
  });

  it("نفس النتيجة عندما يرد الأب أولاً في الملف (لا يكسر الترتيب الطبيعي)", () => {
    const file2 = [
      { code: "1", nameAr: "الأصول", nameEn: "", level: "1" },
      { code: "11", nameAr: "الأصول المتداولة", nameEn: "", level: "2" },
      { code: "1103", nameAr: "مصروفات مدفوعة مقدمًا", nameEn: "", level: "3" },
      { code: "110301", nameAr: "دفعات مقدّمة", nameEn: "", level: "4" },
    ];
    const { results } = compareTrees([], file2, true);
    const byCode = Object.fromEntries(results.map((r) => [r.code, r]));
    expect(byCode["110301"].level2Category).toBe("الأصول المتداولة");
    expect(byCode["110301"].errors).toHaveLength(0);
  });

  it("رمز الحساب الأب موجود مسبقًا في الشجرة الحالية (ملف 1) لا في ملف العميل", () => {
    const file1 = [
      { code: "1", nameAr: "الأصول", parent: "", level: "1" },
      { code: "11", nameAr: "الأصول المتداولة", parent: "1", level: "2" },
      { code: "1103", nameAr: "مصروفات مدفوعة مقدمًا", parent: "11", level: "3" },
    ];
    const file2 = [
      { code: "110301", nameAr: "دفعات مقدّمة", nameEn: "", level: "4", parent: "1103" },
    ];
    const { results } = compareTrees(file1, file2, true);
    const row = results.find((r) => r.code === "110301");
    expect(row.level2Category).toBe("الأصول المتداولة");
    expect(row.errors).toHaveLength(0);
  });
});
