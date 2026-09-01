// @vitest-environment jsdom
// مساعدة الذكاء الاصطناعي لمطابقة الأعمدة — تتدخل فقط عند فشل الاكتشاف الحتمي،
// وكل ما تقترحه يُتحقَّق منه مقابل رؤوس الأعمدة الفعلية قبل قبوله.
// ‼️ ملاحظة: رموز allume.xls الحقيقية (acc_arab/acc_lati/acc_levl) كانت مثال
// "غير معروف" هنا سابقاً - لكن بعد إصلاح خطأ جوهري حقيقي شهده المستخدم فعلياً
// (chartOrganizerAgent.columnSynonyms.test.js)، صار autoDetectMapping يتعرّف
// عليها حتمياً بلا حاجة لـAI إطلاقاً. فاستُبدلت هنا برؤوس مصطنعة (col_b/col_c/
// col_d) لا تشبه أي نظام محاسبي حقيقي، لتبقى هذه الاختبارات تفحص آلية مساعدة
// الذكاء الاصطناعي نفسها (حالة استخدام حقيقية منفصلة، لملفات بأعمدة غير مألوفة
// أصلاً)، لا نفس الحالة التي أصبحت الآن حتمية.
import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";
import { organizeChartOfAccounts } from "../chartOrganizerAgent.js";

function buildWorkbookFile() {
  // رؤوس مصطنعة غير معروفة لـ autoDetectMapping عمداً - code فقط يُكتشف
  // تلقائياً (يطابق مباشرة عبر كلمة "code")، بقية الحقول تحتاج مساعدة AI.
  const aoa = [
    ["acc_code", "col_b", "col_c", "col_d"],
    ["1", "Assets", "الأصول", "1"],
    ["11", "Current Assets", "الأصول المتداولة", "2"],
    ["1101", "Cash", "النقدية بالصندوق", "3"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new File([buf], "test_chart.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("organizeChartOfAccounts — مساعدة AI لمطابقة الأعمدة", () => {
  it("يستخدم اقتراح aiColumnMappingResolver فقط للحقول غير المكتشفة، ويتجاهل index خارج النطاق", async () => {
    const file = buildWorkbookFile();
    const aiColumnMappingResolver = vi.fn().mockResolvedValue({
      nameAr: 2, // صحيح
      nameEn: 1, // صحيح
      level: 99, // خارج النطاق - يجب تجاهله بصمت
      code: 0, // code مكتشف حتمياً أصلاً - يجب ألا يُستبدَل (ولن يُطلَب أصلاً)
    });

    const result = await organizeChartOfAccounts(file, { aiColumnMappingResolver });

    expect(aiColumnMappingResolver).toHaveBeenCalledTimes(1);
    // استُدعيت فقط لأن code اكتُشف لكن nameAr/nameEn (وربما غيرها) لم يُكتشفا تلقائياً
    const [headerRowArg, currentMappingArg] = aiColumnMappingResolver.mock.calls[0];
    expect(headerRowArg).toEqual(["acc_code", "col_b", "col_c", "col_d"]);
    expect(currentMappingArg.code).not.toBe(-1); // code مكتشف حتمياً

    // النتيجة استُكملت بنجاح (لم يُرمَ خطأ) بفضل مطابقة AI لعمود الاسم العربي
    expect(result.stats.orderedRows.length).toBeGreaterThan(0);
    expect(result.summary).toContain("طابقها الذكاء الاصطناعي");
  });

  it("لا يستدعي aiColumnMappingResolver إطلاقاً لو الاكتشاف الحتمي كافٍ من البداية", async () => {
    const aoa = [
      ["الرمز", "الاسم العربي", "الاسم الانجليزي", "المستوى"],
      ["1", "الأصول", "Assets", "1"],
      ["11", "الأصول المتداولة", "Current Assets", "2"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const file = new File([buf], "clean_chart.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const aiColumnMappingResolver = vi.fn();
    await organizeChartOfAccounts(file, { aiColumnMappingResolver });
    expect(aiColumnMappingResolver).not.toHaveBeenCalled();
  });

  it("يرمي رسالة الخطأ الحتمية الواضحة لو فشل aiColumnMappingResolver ولم يحل المشكلة", async () => {
    const file = buildWorkbookFile();
    const aiColumnMappingResolver = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(organizeChartOfAccounts(file, { aiColumnMappingResolver })).rejects.toThrow(/تعذّر تحديد عمودي الرمز والاسم/);
  });
});
