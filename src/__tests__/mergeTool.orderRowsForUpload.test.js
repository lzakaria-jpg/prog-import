import { describe, it, expect } from "vitest";
import { orderRowsForUpload } from "../MergeTool.jsx";

/**
 * بلاغ حقيقي من المستخدم: أداة مطابقة شجرة الحسابات عرضت "19 حساب جديد
 * سليم" بالملخص، لكن ملف الإكسل المُصدَّر ("تنزيل نسخة أولية") احتوى 18
 * حسابًا فقط - حساب "خطابات ضمان" اختفى بصمت رغم عدّه ضمن الـ19. السبب:
 * orderRowsForUpload كانت تستخدم .code كمفتاح تفرّد (visited) بدل .id
 * الفريد لكل صف - فأي صفّين انتهى بهما الحال لنفس الرمز (تصادم توليد رمز)
 * كان ثانيهما يُعتبر بصمت "سبق ظهوره" فيسقط من ناتج الفرز، رغم بقائه
 * محسوبًا ضمن activeNewRows.length المعروض بالملخص.
 */
describe("orderRowsForUpload", () => {
  it("لا يُسقط أي صف حتى لو تصادف رمزان جديدان على نفس الرمز خطأً", () => {
    const rows = [
      { id: "n-1", code: "110501", parent: "1106", nameAr: "خطابات ضمان" },
      { id: "n-2", code: "110501", parent: "1109", nameAr: "حساب آخر تصادف رمزه" },
      { id: "n-3", code: "1106", parent: "11", nameAr: "الأرصدة المدينة الأخرى" },
    ];
    const out = orderRowsForUpload(rows);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.id).sort()).toEqual(["n-1", "n-2", "n-3"]);
  });

  it("يحافظ على الترتيب الطوبولوجي الطبيعي (الأب قبل الابن) في الحالة العادية بلا تصادم", () => {
    const rows = [
      { id: "n-2", code: "110301", parent: "1103", nameAr: "دفعات مقدّمة" },
      { id: "n-1", code: "1103", parent: "11", nameAr: "مصروفات مقدمة" },
    ];
    const out = orderRowsForUpload(rows);
    expect(out.map((r) => r.id)).toEqual(["n-1", "n-2"]);
  });
});
