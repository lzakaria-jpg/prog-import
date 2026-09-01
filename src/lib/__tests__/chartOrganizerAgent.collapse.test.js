// @vitest-environment jsdom
// دمج المستويات المكرِّرة اسم أبيها — قرار المستخدم المعتمد: "دمج تلقائي عند
// تطابق الاسم مع الأب". يغطي هذا الاختبار الحالتين الحقيقيتين المكتشفتين في
// ملف عميل حقيقي (allume.xls):
//  1) "المصاريف" مكرر 3 مستويات متتالية فوق حسابات مصاريف حقيقية متنوعة —
//     يجب أن يُحذف التكرار وتُصنَّف كل ورقة من اسمها الخاص (لا فئة واحدة للجميع).
//  2) "الدائنون" مكرر مرتين فوق دفتر مساعد موردين قديم — يجب ألا يُفقَد القفل
//     النظامي (المستوى الأعمق هو من يحمل النوع الحقيقي "الدائنون") فيهرب
//     الموردون من الاستبعاد ويظهروا كحسابات شجرة عادية.
import { describe, it, expect } from "vitest";
import { buildOrganizedChart, LOCKED_NO_SUBDIVISION_TYPES } from "../chartOrganizerAgent.js";

function rec(code, nameAr, level, parent) {
  return { code, nameAr, nameEn: "", level: String(level), parent, type: "", desc: "", debit: "", credit: "", payCollect: "" };
}

describe("collapseRedundantWrapperLevels (عبر buildOrganizedChart)", () => {
  it("يحذف 3 مستويات مكررة اسم \"المصاريف\" ويصنّف كل ورقة من اسمها الخاص", async () => {
    const records = [
      rec("3", "المصاريف", 1, ""), // جذر بترقيم عميل أجنبي (سيُعاد ترقيمه لجذر 5 داخلياً)
      rec("31", "المصاريف", 2, "3"), // مستوى مكرر أول
      rec("3101", "المصاريف", 3, "31"), // مستوى مكرر ثانٍ
      rec("310101", "رواتب الاداره", 4, "3101"),
      rec("310102", "مصاريف كهرباء وماء وهاتف", 4, "3101"),
    ];

    const built = await buildOrganizedChart(records);
    const byName = (n) => built.orderedRows.find((r) => r.nameAr === n);

    // المستويات المكرِّرة الثلاثة الاسمية نفسها لا تظهر إطلاقاً كحسابات بالنتيجة
    expect(built.orderedRows.some((r) => r.nameAr === "المصاريف")).toBe(false);

    const salaries = byName("رواتب الاداره");
    const utilities = byName("مصاريف كهرباء وماء وهاتف");
    expect(salaries).toBeTruthy();
    expect(utilities).toBeTruthy();

    // كل ورقة صُنِّفت من اسمها الخاص - نوعان مختلفان فعلاً، لا فئة واحدة اعتباطية للجميع
    expect(salaries.type).not.toBe("");
    expect(utilities.type).not.toBe("");
    expect(salaries.type).not.toBe(utilities.type);

    // فئتهما (م2) ضمن جذر المصاريف الصحيح فقط
    expect(["تكاليف تشغيلية", "التكلفة المباشرة", "تكاليف غير تشغيلية"]).toContain(salaries.level2Category);
    expect(["تكاليف تشغيلية", "التكلفة المباشرة", "تكاليف غير تشغيلية"]).toContain(utilities.level2Category);

    // بلا أي خطأ "توافق النوع مع الأب" متبقٍ من السلسلة القديمة المحذوفة
    expect(salaries.errors).toHaveLength(0);
    expect(utilities.errors).toHaveLength(0);

    // ملاحظة تدقيق توضّح أن الدمج حدث
    expect(built.auditNotes.some((n) => n.type === "دمج مستوى مكرر")).toBe(true);
  });

  it("لا يُفقَد قفل \"الدائنون\" عندما يتكرر اسمه على مستويين متتاليين", async () => {
    // ملاحظة: الرموز الخام هنا مقصودة بعدد خانات أكبر من رموز الفئات الثابتة
    // بالسقالة ("21"، "22"...) لتجنّب تصادم عرضي معها يُفسد سلسلة البحث عن الأب
    // الخام (بلا علاقة بالمنطق المطلوب اختباره) - الترقيم النهائي يُعاد توليده
    // داخلياً دومًا (useFile2Codes=false) فلا قيمة لمطابقة الرموز الخام لشيء.
    const records = [
      rec("2", "الالتزامات", 1, ""),
      rec("2900", "الدائنون", 2, "2"), // مكرر خارجي (فارغ من نوع حقيقي فعلياً)
      rec("290001", "الدائنون", 3, "2900"), // المستوى الذي يحمل النوع الحقيقي "الدائنون"
      rec("29000101", "شركة اختبار للتجارة", 4, "290001"),
      rec("29000102", "مؤسسة تجريبية", 4, "290001"),
    ];

    const built = await buildOrganizedChart(records);

    const vendor1 = built.excludedRows.find((r) => r.nameAr === "شركة اختبار للتجارة");
    const vendor2 = built.excludedRows.find((r) => r.nameAr === "مؤسسة تجريبية");
    expect(vendor1).toBeTruthy();
    expect(vendor2).toBeTruthy();
    expect(vendor1._lockedUnder).toBe("الدائنون");
    expect(vendor2._lockedUnder).toBe("الدائنون");

    // لا يظهران إطلاقاً كحسابات شجرة عادية بالنتيجة النهائية
    expect(built.orderedRows.some((r) => r.nameAr === "شركة اختبار للتجارة")).toBe(false);
    expect(built.orderedRows.some((r) => r.nameAr === "مؤسسة تجريبية")).toBe(false);

    // حساب "الدائنون" الحقيقي نفسه (المستوى الأعمق من التكرار) يبقى موجوداً -
    // هو حساب النظام المقفل الشرعي نفسه، وليس ابناً له؛ لا يُحذف مطلقاً، فقط
    // أبناؤه (أسماء العملاء/الموردين) هم من يُستبعدون. لا يظهر إلا مرة واحدة
    // (فُقد المستوى الخارجي المكرر فقط، لا الحساب الحقيقي).
    const lockedRows = built.orderedRows.filter((r) => LOCKED_NO_SUBDIVISION_TYPES.includes(r.type));
    expect(lockedRows).toHaveLength(1);
    expect(lockedRows[0].type).toBe("الدائنون");
  });
});
