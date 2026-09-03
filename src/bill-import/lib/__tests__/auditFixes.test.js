// اختبارات انحدار لأخطاء حقيقية اكتُشفت بالفحص الشامل (2026-09) بأداة فواتير المشتريات.
import { describe, it, expect } from "vitest";
import { inferTaxIncl } from "../validation.js";

function row(over) {
  return { qty: 10, price: 100, lineTotal: 1000, taxPct: 15, issues: [], ...over };
}

describe("inferTaxIncl — يحترم أساس الإجمالي المختار", () => {
  it("الأساس 'قبل الضريبة' (الافتراضي): الإجمالي = الكمية×السعر ⇒ السعر غير شامل", () => {
    const r = row();
    inferTaxIncl(r, { totalBasis: "excl" });
    // كانت النتيجة true دائمًا هنا، فتُحتسب 1000 كشاملة (869.57+130.43) بدل 1000+150
    expect(r.taxIncl).toBe(false);
    expect(r.taxInclInferred).toBe(true);
  });

  it("الأساس 'قبل الضريبة': الإجمالي = (الكمية×السعر)÷1.15 ⇒ السعر شامل", () => {
    const r = row({ lineTotal: 1000 / 1.15 });
    inferTaxIncl(r, { totalBasis: "excl" });
    expect(r.taxIncl).toBe(true);
  });

  it("الأساس 'شامل الضريبة': الإجمالي = الكمية×السعر ⇒ السعر شامل", () => {
    const r = row();
    inferTaxIncl(r, { totalBasis: "incl" });
    expect(r.taxIncl).toBe(true);
  });

  it("الأساس 'شامل الضريبة': الإجمالي = (الكمية×السعر)×1.15 ⇒ السعر غير شامل", () => {
    const r = row({ lineTotal: 1150 });
    inferTaxIncl(r, { totalBasis: "incl" });
    expect(r.taxIncl).toBe(false);
  });

  it("قيمة صريحة من الملف أو من المستخدم لا تُمَس إطلاقًا", () => {
    const r = row({ taxInclFromFile: true, taxIncl: true });
    inferTaxIncl(r, { totalBasis: "excl" });
    expect(r.taxIncl).toBe(true);
    expect(r.taxInclInferred).toBe(false);
  });

  it("سعر مشتق: تُتبَع قيمة الأساس المختار كما كان بالضبط", () => {
    const r1 = row({ priceDerived: true });
    inferTaxIncl(r1, { totalBasis: "incl" });
    expect(r1.taxIncl).toBe(true);
    const r2 = row({ priceDerived: true });
    inferTaxIncl(r2, { totalBasis: "excl" });
    expect(r2.taxIncl).toBe(false);
  });
});
