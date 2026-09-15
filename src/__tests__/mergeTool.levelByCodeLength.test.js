import { describe, it, expect } from "vitest";
import { compareTrees } from "../MergeTool.jsx";
import { qoyodAccountsToFile1Records } from "../lib/qoyodAccountSync.js";

/**
 * [إضافة 2026-09-15] بلاغ مستخدم حي: حساب جديد تحت أب برمز "210301" (6 خانات)
 * حُسب مستواه 4 بدل 5 الصحيح، لأن قيود لا يشترط وجود حساب فعلي وسيط بكل طول
 * (هنا: لا حساب بـ4 خانات بين "21" و"210301" ضمن الحسابات المجلوبة عبر API)،
 * وحساب المستوى القديم كان يعدّ فقط الآباء الموجودين فعلاً بسلسلة الاقتطاع
 * (truncation chain) فيُنقِص المستوى الحقيقي 1 كلما غاب حساب وسيط. المستخدم
 * أكد ميدانيًا (قيود نفسه رفض المستوى 4 واشترط 5) أن طول الرمز وحده هو المرجع
 * الصحيح دومًا لدى قيود، بصرف النظر عن أي فجوة بالبيانات المجلوبة.
 */
describe("compareTrees — المستوى يُشتق من طول الرمز كحدّ أدنى (يصحّح فجوات الحسابات الوسيطة المفقودة)", () => {
  function clientRow(nameAr) {
    return { code: "", nameAr, nameEn: "", level: "", parent: "", type: "", desc: "", debit: "", credit: "", payCollect: "No", extra: {} };
  }

  it("البلاغ الحي: أب برمز 6 خانات بلا أي حساب وسيط 4 خانات - الابن الجديد مستواه 5 لا 4", () => {
    // فجوة متعمدة: "2" (1 خانة) ثم "21" (خانتان) ثم قفزة مباشرة لـ"210301"
    // (6 خانات) بلا أي حساب 4 خانات بينهما بالحسابات المجلوبة فعليًا
    const rawAccounts = [
      { code: "2", name_ar: "الالتزامات", name_en: "Liabilities" },
      { code: "21", name_ar: "التزامات متداولة", name_en: "Current liabilities" },
      { code: "210301", name_ar: "مستحق راتب عبدالعزيز الصادق عتيق الفرزعي", name_en: "" },
    ];
    const file1Records = qoyodAccountsToFile1Records(rawAccounts);

    const { results } = compareTrees(file1Records, [clientRow("مستحق راتب رمزي عنبه")], false);
    const row = results.find((r) => r.status === "new");

    expect(row.parent).toBe("210301");
    expect(row.level).toBe(5);
    expect(row.code).toBe("21030101");
    expect(row.errors).toHaveLength(0);
  });

  it("بلا فجوة (كل الأطوال الوسيطة موجودة فعليًا): يبقى السلوك كما كان - مستوى 4 لحساب رمزه 6 خانات", () => {
    const rawAccounts = [
      { code: "2", name_ar: "الالتزامات", name_en: "" },
      { code: "23", name_ar: "التزامات متداولة", name_en: "" },
      { code: "2301", name_ar: "مستحق الموظفين", name_en: "" },
    ];
    const file1Records = qoyodAccountsToFile1Records(rawAccounts);
    const { results } = compareTrees(file1Records, [clientRow("مستحق راتب موظف")], false);
    const row = results.find((r) => r.status === "new");

    expect(row.parent).toBe("2301");
    expect(row.level).toBe(4);
    expect(row.code).toBe("230101");
  });

  it("تنبيه (لا استبدال صامت) حين يخالف المستوى المكتوب صراحة بملف العميل موقع الحساب الفعلي بالشجرة", () => {
    const rawAccounts = [
      { code: "1", name_ar: "الاصول", name_en: "" },
      { code: "11", name_ar: "الأصول المتداولة", name_en: "" },
    ];
    const file1Records = qoyodAccountsToFile1Records(rawAccounts);
    const row2 = { code: "", nameAr: "عهدة موظف", nameEn: "", level: "7", parent: "11", type: "", desc: "", debit: "", credit: "", payCollect: "No", extra: {} };
    const { results } = compareTrees(file1Records, [row2], false);
    const row = results.find((r) => r.status === "new");

    // الأب الصريح "11" (مستوى2) يحدد المستوى الفعلي 3 - يُعتمد رغم أن الملف كتب 7
    expect(row.level).toBe(3);
    expect(row.warnings.some((w) => w.includes('المستوى المكتوب بالملف "7"') && w.includes("يخالف موقع الحساب الفعلي"))).toBe(true);
  });

  it("لا تنبيه حين يتطابق المستوى المكتوب بالملف مع الموقع الفعلي المحسوب", () => {
    const rawAccounts = [
      { code: "1", name_ar: "الاصول", name_en: "" },
      { code: "11", name_ar: "الأصول المتداولة", name_en: "" },
    ];
    const file1Records = qoyodAccountsToFile1Records(rawAccounts);
    const row2 = { code: "", nameAr: "نقدية في الصندوق", nameEn: "", level: "3", parent: "11", type: "", desc: "", debit: "", credit: "", payCollect: "No", extra: {} };
    const { results } = compareTrees(file1Records, [row2], false);
    const row = results.find((r) => r.status === "new");

    expect(row.level).toBe(3);
    expect(row.warnings.some((w) => w.includes("يخالف موقع الحساب الفعلي"))).toBe(false);
  });
});
