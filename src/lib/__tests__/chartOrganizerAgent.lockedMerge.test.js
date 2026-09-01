// @vitest-environment jsdom
// دمج الحسابات المكرِّرة معنى لحساب مقفل نظامياً واحد (المدينون/الدائنون) —
// تأكيد صريح من المستخدم: قيود لا تعرف حساب "موردين" مستقل إطلاقاً؛ المورد
// يُضاف من مديول المشتريات ويُربَط تلقائياً بحساب "الدائنون" الافتراضي المقفل
// نظامياً نفسه (لا يُفرَّع تحته أبداً)، تماماً كالمدينون (عملاء) والمخزون
// (مواقع). حالة حقيقية موثَّقة (allume.xls): ملف العميل يفصل "الموردون" عن
// "الدائنون" كجذرين مستقلين على نفس المستوى - يجب دمجهما في حساب واحد فقط،
// مع استبعاد كل الأسماء الحقيقية (موردين/عملاء) تحت الحساب الناتج.
import { describe, it, expect } from "vitest";
import { buildOrganizedChart } from "../chartOrganizerAgent.js";

function rec(code, nameAr, level) {
  // بلا عمود أب (الحالة الحقيقية بالملف المصدر) - الهرمية من اقتطاع الرمز فقط.
  return { code, nameAr, nameEn: "", level: String(level), parent: "", type: "", desc: "", debit: "", credit: "", payCollect: "" };
}

describe("mergeDuplicateLockedTypeNodes (عبر buildOrganizedChart)", () => {
  it("يدمج \"الموردون\" و\"الدائنون\" المنفصلين بالملف المصدر في حساب مقفل واحد فقط", async () => {
    const records = [
      rec("2", "الالتزامات", 1),
      rec("22", "الموردون", 2), // غلاف علوي مرادف - يجب أن يُدمَج لا أن يبقى مستقلاً
      rec("2201", "مؤسسة النور للتجارة", 3), // اسم مورد حقيقي - يُستبعَد كسجل مورد
      rec("23", "الدائنون", 2), // غلاف علوي مطابق حرفياً - يُدمَج أيضاً
      rec("2301", "الدائنون", 3), // الحساب الحقيقي المقفل نظامياً - يبقى (محور الدمج)
      rec("230101", "شركة الأمل التجارية", 4), // اسم مورد آخر تحت الفرع الثاني - يُستبعَد أيضاً
    ];

    const built = await buildOrganizedChart(records);

    // 1) لا يظهر أي حساب مستقل باسم "الموردون" أو غلاف "الدائنون" العلوي المكرَّر
    expect(built.orderedRows.some((r) => r.nameAr === "الموردون")).toBe(false);
    expect(built.orderedRows.filter((r) => r.nameAr === "الدائنون")).toHaveLength(1);

    // 2) الحساب المقفل الباقي فعلاً من نوع "الدائنون" الصحيح تحت الالتزامات المتداولة
    const creditors = built.orderedRows.find((r) => r.nameAr === "الدائنون");
    expect(creditors).toBeTruthy();
    expect(creditors.type).toBe("الدائنون");
    expect(creditors.level2Category).toBe("الالتزامات المتداولة");
    expect(creditors.errors).toHaveLength(0);

    // 3) كلا اسمي الموردين الحقيقيين (من فرعي "الموردون" و"الدائنون" الأصليين
    // المنفصلين) استُبعدا معاً تحت الحساب المدموج نفسه - لا يظهران كحسابات شجرة
    const vendor1 = built.excludedRows.find((r) => r.nameAr === "مؤسسة النور للتجارة");
    const vendor2 = built.excludedRows.find((r) => r.nameAr === "شركة الأمل التجارية");
    expect(vendor1).toBeTruthy();
    expect(vendor2).toBeTruthy();
    expect(vendor1._lockedUnder).toBe("الدائنون");
    expect(vendor2._lockedUnder).toBe("الدائنون");
    expect(built.orderedRows.some((r) => r.nameAr === "مؤسسة النور للتجارة")).toBe(false);
    expect(built.orderedRows.some((r) => r.nameAr === "شركة الأمل التجارية")).toBe(false);

    // 4) ملاحظة تدقيق توضّح الدمج
    expect(built.auditNotes.some((n) => n.type === "دمج حساب مقفل مكرر")).toBe(true);
  });

  it("لا يغيّر شيئاً إذا كان \"الدائنون\" موجوداً مرة واحدة فقط بشكل سليم أصلاً", async () => {
    const records = [
      rec("2", "الالتزامات", 1),
      rec("21", "الالتزامات المتداولة", 2),
      rec("2101", "الدائنون", 3),
      rec("210101", "مورد عادي", 4),
    ];

    const built = await buildOrganizedChart(records);
    expect(built.auditNotes.some((n) => n.type === "دمج حساب مقفل مكرر")).toBe(false);
    const creditors = built.orderedRows.find((r) => r.nameAr === "الدائنون");
    expect(creditors).toBeTruthy();
    expect(creditors.type).toBe("الدائنون");
    expect(built.excludedRows.find((r) => r.nameAr === "مورد عادي")?._lockedUnder).toBe("الدائنون");
  });
});
