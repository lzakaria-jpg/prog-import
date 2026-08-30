import { describe, it, expect } from "vitest";
import { compareTrees, resolveAccountTypeAndCategory } from "../MergeTool.jsx";

/**
 * رمز الحساب أولاً وأخيرًا (طبقة دفاع ثانية): حساب رمزه يبدأ بـ 5 هو مصروف
 * حتمًا (تكلفة مباشرة/تكاليف تشغيلية/تكاليف غير تشغيلية)، ولا يجوز أبدًا أن
 * يُصنَّف ضمن الإيرادات - بصرف النظر عن نجاح أو فشل أي استنتاج آخر (اسم الأب،
 * موقعه في الشجرة، عمود النوع). هذا بالضبط السيناريو المُبلَّغ: حساب أب "51"
 * (تكاليف تشغيلية فعليًا) من ملف الشجرة الحالية بلا عمود "مستوى" صريح، وأبناؤه
 * بأسماء لا تحوي كلمة "مصروف" (فيفشل الاستنتاج من الاسم) كانوا يُصنَّفون ضمن
 * "الإيرادات الأخرى" لأن قراءة مستوى الأب فشلت صامتة.
 */
describe("resolveAccountTypeAndCategory — رمز الحساب يحدد الجذر حتمًا (1-5)", () => {
  it("حساب مستوى 3+ رمزه يبدأ بـ 5 لا يصنَّف ضمن الإيرادات مهما فشل استنتاج الاسم", () => {
    const parentRow = { code: "51", level: 2, type: "تكاليف تشغيلية", nameAr: "" };
    const row = { level: 3, code: "510101", nameAr: "تكلفة الفحص", nameEn: "", type: "", level2Category: "" };
    const r = resolveAccountTypeAndCategory(row, parentRow, {}, "تكاليف تشغيلية");
    expect(r.level2Category).toBe("تكاليف تشغيلية");
    expect(["الرواتب", "مكافآت وحوافز", "مصاريف عمومية وإدارية", "مصاريف تسويقية", "تكاليف تشغيلية أخرى",
      "مصاريف الاستهلاك", "مصاريف الإطفاء", "مصاريف تقنية واستشارية", "مصاريف البحث والتطوير"]).toContain(r.type);
  });

  it("حساب مستوى 2 رمزه \"5x\" يُصنَّف ضمن جذر المصاريف حتى بلا اسم يدل عليه", () => {
    const row = { level: 2, code: "51", nameAr: "شيء غامض", nameEn: "", type: "", level2Category: "" };
    const r = resolveAccountTypeAndCategory(row, null, {}, null);
    expect(r.type).toBe("تكاليف تشغيلية"); // DEFAULT_LEVEL2_BY_ROOT["المصاريف"]
  });

  it("لا يفسد رمزًا غير قياسي (لا يبدأ بـ 1-5) - يستمر الاستنتاج القديم كما كان", () => {
    const parentRow = { code: "الف", level: 2, type: "المبيعات", nameAr: "" };
    const row = { level: 3, code: "الف-١", nameAr: "مبيعات تجزئة", nameEn: "", type: "", level2Category: "" };
    const r = resolveAccountTypeAndCategory(row, parentRow, {}, "المبيعات");
    expect(r.level2Category).toBe("المبيعات");
  });
});

describe("compareTrees — نفس السيناريو المُبلَّغ عبر مسار كامل: أب من الشجرة الحالية بلا عمود مستوى", () => {
  it("أبناء حساب '51' (تكاليف تشغيلية) لا يقعون ضمن الإيرادات", () => {
    // ملف الشجرة الحالية: حساب "51" بلا عمود مستوى صريح إطلاقًا (سيناريو حقيقي شائع)
    const file1 = [
      { code: "5", nameAr: "المصاريف", parent: "" },
      { code: "51", nameAr: "التكاليف التشغيلية", parent: "5", type: "تكاليف تشغيلية" },
    ];
    const file2 = [
      { code: "510101", nameAr: "تكلفة الفحص", nameEn: "", parent: "51" },
      { code: "510102", nameAr: "حوافز وعمولات", nameEn: "", parent: "51" },
      { code: "510103", nameAr: "رسوم البريد والشحن", nameEn: "", parent: "51" },
    ];
    const { results } = compareTrees(file1, file2, true);
    const byCode = Object.fromEntries(results.map((r) => [r.code, r]));

    for (const code of ["510101", "510102", "510103"]) {
      expect(byCode[code].level2Category).toBe("تكاليف تشغيلية");
      expect(byCode[code].errors).toHaveLength(0);
    }
  });
});
