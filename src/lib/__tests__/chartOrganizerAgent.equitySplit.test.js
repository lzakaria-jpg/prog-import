// @vitest-environment jsdom
// فصل حقوق الملكية عن جذر "الخصوم" الغامض — قرار المستخدم المعتمد صريحاً:
// "فصل الخصوم واعتبارها التزامات كما قيود، واعتبار 3 حقوق ملكية وفق قواعد
// قيود الافتراضية (1 أصول، 2 التزامات، 3 حقوق ملكية، 4 إيرادات، 5 مصاريف)،
// مع الحفاظ على تسلسل العميل".
//
// يغطي هذا الاختبار الحالة الحقيقية المكتشفة بملف عميل حقيقي (allume.xls):
// جذر "2" مُسمّى حرفياً "الخصوم" (غامض) يحوي جذراً فرعياً "21" مُسمّى خطأً
// "حقوق الملكية" لكنه يحوي مزيجاً من بنود حقوق ملكية حقيقية (رأس المال بصيغتيه
// مع/بلا همزة، حساب الأرباح والخسائر وبنوده الفرعية) وبنود التزامات فعلية
// (جاري الشركاء، مخصص نهاية الخدمة) تحت "مخصصات" التي تحوي أيضاً بند حقوق
// ملكية مبطَّن (مخصص الاحتياطي الإجباري) - بلا عمود "الحساب الرئيسي" أصلاً
// بالملف المصدر (الحالة الحقيقية)، فالهرمية بالاعتماد الكامل على اقتطاع
// الرمز فقط - وهو ما يكسر تماماً عند فصل حقوق الملكية بلا الإصلاحات المصاحبة
// (splitEquityFromAmbiguousLiabilitiesRoot + reattachOrphanNewRows).
import { describe, it, expect } from "vitest";
import { buildOrganizedChart } from "../chartOrganizerAgent.js";

function rec(code, nameAr, level) {
  // بلا عمود أب إطلاقاً (parent فارغ دوماً) - يطابق الحالة الحقيقية بالملف
  // المصدر (allume.xls) حيث الهرمية تُستنتَج فقط من اقتطاع الرمز.
  return { code, nameAr, nameEn: "", level: String(level), parent: "", type: "", desc: "", debit: "", credit: "", payCollect: "" };
}

describe("splitEquityFromAmbiguousLiabilitiesRoot + reattachOrphanNewRows (عبر buildOrganizedChart)", () => {
  it("يفصل حقوق الملكية عن \"الخصوم\" الغامضة بلا فقدان رمز أو أب أو تكرار", async () => {
    const records = [
      rec("2", "الخصوم", 1),
      rec("21", "حقوق الملكية", 2), // غلاف مختلط خطأً - يبقى تحت الالتزامات بعد الفصل
      rec("2101", "راس المال", 3), // بلا همزة - يجب أن يُنقَل لحقوق الملاك
      rec("21010001", "رأس مال إضافي مدفوع", 4), // بالهمزة - صيغة إملائية مختلفة عن أبيه فلا يُدمَج كمستوى مكرر
      rec("21010002", "راس مال شريك1", 4),
      rec("2102", "حساب الارباح والخسائر", 3), // يجب أن يُنقَل لحقوق الملاك
      rec("21020001", "ارباح وخسائر", 4),
      rec("21020002", "ارباح وخسائر 2020", 4),
      rec("2103", "جاري الشركاء", 3), // التزام فعلي - يبقى كما هو
      rec("2104", "المخصصات", 3), // التزام فعلي - يبقى كما هو (غلاف)
      rec("21040001", "مخصص الاحتياطي الاجباري", 4), // مبطَّن خطأً هنا - يجب نقله لحقوق الملاك
      rec("21040002", "مخصص نهاية الخدمة", 4), // التزام فعلي - يبقى كما هو
    ];

    const built = await buildOrganizedChart(records);
    const byName = (n) => built.orderedRows.find((r) => r.nameAr === n);

    // 1) لا حساب بلا رمز إطلاقاً بالنتيجة النهائية - أي رمز فارغ خطأ جوهري بملف رفع
    expect(built.orderedRows.every((r) => String(r.code || "").trim())).toBe(true);

    // 2) الجذر "الخصوم" لا يظهر حرفياً بهذا الاسم بالنتيجة - أُعيد تسميته "الالتزامات"
    expect(built.orderedRows.some((r) => r.nameAr === "الخصوم")).toBe(false);

    // 3) بنود حقوق الملكية الحقيقية انتقلت فعلاً لجذر 3 (حقوق الملاك) بالتصنيف الدقيق
    const capital = byName("راس المال");
    const capitalHamza = byName("رأس مال إضافي مدفوع");
    const partnerCapital = byName("راس مال شريك1");
    const pl = byName("حساب الارباح والخسائر");
    const plLine1 = byName("ارباح وخسائر");
    const plLine2 = byName("ارباح وخسائر 2020");
    const reserve = byName("مخصص الاحتياطي الاجباري");

    [capital, capitalHamza, partnerCapital, pl, plLine1, plLine2, reserve].forEach((r) => {
      expect(r, `الحساب غير موجود بالنتيجة`).toBeTruthy();
      expect(String(r.code).charAt(0)).toBe("3");
      expect(r.errors).toHaveLength(0);
    });

    expect(capital.level2Category).toBe("رأس المال المصدر");
    expect(capital.type).toBe("رأس المال");
    expect(capitalHamza.level2Category).toBe("رأس المال المصدر");
    expect(partnerCapital.level2Category).toBe("رأس المال المصدر");

    expect(pl.level2Category).toBe("الأرباح المبقاة");
    expect(pl.type).toBe("الأرباح المبقاة (أو الخسائر)");
    expect(plLine1.level2Category).toBe("الأرباح المبقاة");
    expect(plLine2.level2Category).toBe("الأرباح المبقاة");

    expect(reserve.level2Category).toBe("حقوق الملاك الأخرى");
    expect(reserve.type).toBe("الاحتياطيات");
    // لم يعد مقفلاً تحت "المخصصات" (التزامات) - انتقل فعلياً بأبيه الجديد
    expect(String(reserve.parent).charAt(0)).toBe("3");

    // 4) البنود التي هي التزامات فعلاً بقيت تحت جذر 2 (الالتزامات) كما هي
    const partnersAccount = byName("جاري الشركاء");
    const provisionsWrapper = byName("المخصصات");
    const eosBenefit = byName("مخصص نهاية الخدمة");
    [partnersAccount, provisionsWrapper, eosBenefit].forEach((r) => {
      expect(r, `الحساب غير موجود بالنتيجة`).toBeTruthy();
      expect(String(r.code).charAt(0)).toBe("2");
    });

    // 5) بلا أي تكرار: كل اسم من أسماء حقوق الملكية المنقولة يظهر مرة واحدة فقط
    [capital, capitalHamza, pl].forEach((r) => {
      const dupes = built.orderedRows.filter((x) => x.nameAr === r.nameAr);
      expect(dupes).toHaveLength(1);
    });

    // 6) ملاحظة تدقيق توضّح إعادة الربط/الفصل لمراجعة العميل
    expect(
      built.auditNotes.some((n) => n.type === "إعادة ربط بلا أب" || n.detail.includes("حقوق"))
    ).toBe(true);
  });
});
