import { describe, it, expect } from "vitest";
import { detectColumns, rowsToProducts, resolveSecondaryUnit, buildUnitConversion, buildProductPayload } from "../parsing.js";

describe("أعمدة الوحدة الثانوية", () => {
  it("تُكتشف ولا تخطف عمود الوحدة الأساسية حتى لو سبقته", () => {
    const cols = detectColumns(["الاسم", "الوحدة الثانوية", "الوحدة", "معامل التحويل"]);
    expect(cols.unit2).toBe(1);
    expect(cols.unit).toBe(2);
    expect(cols.unit2_rate).toBe(3);
  });
  it("rowsToProducts تقرأ القيم، وملف بلا الأعمدة يبقى فارغاً", () => {
    const rows = [["الاسم", "الوحدة", "الوحدة الثانوية", "معامل التحويل"], ["دقيق", "جرام", "كيس", 25000]];
    expect(rowsToProducts(rows, 0, detectColumns(rows[0]))[0]).toMatchObject({ unit: "جرام", unit2: "كيس", unit2_rate_raw: "25000" });
    const old = [["الاسم", "الوحدة"], ["دقيق", "جرام"]];
    expect(rowsToProducts(old, 0, detectColumns(old[0]))[0]).toMatchObject({ unit2: "", unit2_rate_raw: "" });
  });
});

describe("resolveSecondaryUnit", () => {
  const raw = (extra) => ({ name: "دجاج", unit: "جرام", unit2: "", unit2_rate_raw: "", ...extra });
  it("مادة أولية بالجرام: كيلو تلقائي ×1000، وبالمل: لتر ×1000", () => {
    expect(resolveSecondaryUnit(raw(), { type: "RawMaterial", autoForRawMaterial: true })).toMatchObject({ unit: "كيلو", rate: 1000, source: "auto" });
    expect(resolveSecondaryUnit(raw({ unit: "مل" }), { type: "RawMaterial", autoForRawMaterial: true })).toMatchObject({ unit: "لتر", rate: 1000 });
  });
  it("لا تلقائي لغير المادة الأولية، ولا مع إيقاف الإعداد، ولا لوحدة غير معروفة (حبة)", () => {
    expect(resolveSecondaryUnit(raw(), { type: "Product", autoForRawMaterial: true })).toBeNull();
    expect(resolveSecondaryUnit(raw(), { type: "RawMaterial", autoForRawMaterial: false })).toBeNull();
    expect(resolveSecondaryUnit(raw({ unit: "حبة" }), { type: "RawMaterial", autoForRawMaterial: true })).toBeNull();
  });
  it("عمود الملف الصريح يتفوّق على التلقائي", () => {
    expect(resolveSecondaryUnit(raw({ unit2: "كرتون", unit2_rate_raw: "5000" }), { type: "RawMaterial", autoForRawMaterial: true }))
      .toEqual({ unit: "كرتون", rate: 5000, source: "file" });
  });
  it("كيلو بدون معامل لوحدة جرام: 1000 (تحويل فيزيائي ثابت)؛ وحدة أخرى بلا معامل => خطأ", () => {
    expect(resolveSecondaryUnit(raw({ unit2: "كيلو" }), {})).toMatchObject({ rate: 1000, source: "auto" });
    expect(resolveSecondaryUnit(raw({ unit2: "كرتون" }), {})).toEqual({ error: "bad_rate" });
  });
  it("بيانات متعارضة => خطأ يمنع الرفع", () => {
    expect(resolveSecondaryUnit(raw({ unit2_rate_raw: "1000" }), {})).toEqual({ error: "rate_without_unit" });
    expect(resolveSecondaryUnit(raw({ unit: "", unit2: "كيلو", unit2_rate_raw: "1000" }), {})).toEqual({ error: "no_base_unit" });
    expect(resolveSecondaryUnit(raw({ unit2: "جرام", unit2_rate_raw: "1" }), {})).toEqual({ error: "same_as_base" });
  });
});

describe("buildUnitConversion + الحمولة", () => {
  it("سعر شراء الكيلو = سعر الجرام × 1000 (نفس علاقة مثال مواصفة قيود)", () => {
    const c = buildUnitConversion({ fromUnitId: 9, rate: 1000, p: { cost: "0.007588", selling_price_raw: "" } });
    expect(c).toEqual({ from_unit: 9, rate: 1000, unit_purchase_price: 7.588 });
  });
  it("بلا تكلفة بالملف: لا سعر شراء للوحدة الثانوية (لا افتراض)", () => {
    expect(buildUnitConversion({ fromUnitId: 9, rate: 1000, p: { cost: "", selling_price_raw: "" } })).toEqual({ from_unit: 9, rate: 1000 });
  });
  it("تُرسَل unit_conversions بالحمولة فقط عند وجودها", () => {
    const base = { unitId: 2, categoryId: null, revId: null, expId: null, selectedTaxId: null, taxInclusive: false, type: "RawMaterial" };
    expect(buildProductPayload({ name: "دجاج", cost: "" }, { ...base, unitConversions: [{ from_unit: 9, rate: 1000 }] }).unit_conversions).toEqual([{ from_unit: 9, rate: 1000 }]);
    expect(buildProductPayload({ name: "دجاج", cost: "" }, base).unit_conversions).toBeUndefined();
  });
});
