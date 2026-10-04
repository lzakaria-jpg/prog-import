import { describe, it, expect } from "vitest";
import { detectColumns, rowsToProducts, resolveSecondaryUnit, buildUnitConversion, buildProductPayload, unitKey, autoSecondaryFor } from "../parsing.js";

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
  it("كيلو بدون معامل لوحدة جرام: 1000 (تحويل فيزيائي ثابت)؛ وحدة أخرى بلا معامل => تُتخطّى الثانوية فقط", () => {
    expect(resolveSecondaryUnit(raw({ unit2: "كيلو" }), {})).toMatchObject({ rate: 1000, source: "auto" });
    expect(resolveSecondaryUnit(raw({ unit2: "كرتون" }), {})).toEqual({ skip: "bad_rate" });
  });
  it("[بلاغ حقيقي] معامل تحويل بلا وحدة ثانوية = منتج بلا وحدة ثانوية (لا خطأ ولا إيقاف)", () => {
    expect(resolveSecondaryUnit({ name: "خضار", unit: "ريال", unit2: "", unit2_rate_raw: "1" }, { type: "Product" })).toBeNull();
    expect(resolveSecondaryUnit({ name: "خردل", unit: "جرام", unit2: "", unit2_rate_raw: "255" }, { type: "Product" })).toBeNull();
  });
  it("ملف مختلط: الصف اللي له وحدة ثانوية ياخذها، والباقي بوحدته الأساسية فقط", () => {
    const rows = [
      ["الاسم", "الوحدة", "الوحدة الثانوية", "معامل التحويل"],
      ["زيت", "لتر", "كرتون", "12"],
      ["خضار", "ريال", "", "1"],
      ["ملح", "جرام", "", ""],
    ];
    const res = rowsToProducts(rows, 0, detectColumns(rows[0])).map((p) => resolveSecondaryUnit(p, { type: "Product" }));
    expect(res).toEqual([{ unit: "كرتون", rate: 12, source: "file" }, null, null]);
  });
  it("وحدة ثانوية مكتوبة لكن متعارضة => skip (يُرفَع المنتج بالأساسية، لا إيقاف)", () => {
    expect(resolveSecondaryUnit(raw({ unit: "", unit2: "كيلو", unit2_rate_raw: "1000" }), {})).toEqual({ skip: "no_base_unit" });
    expect(resolveSecondaryUnit(raw({ unit2: "جرام", unit2_rate_raw: "1" }), {})).toEqual({ skip: "same_as_base" });
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

describe("[بلاغ حقيقي] unitKey — ياء/كاف فارسية بأسماء وحدات منشأة العميل", () => {
  it("كیلو جرام (ی فارسية) = كيلو جرام", () => {
    expect(unitKey("كیلو جرام")).toBe(unitKey("كيلو جرام"));
    expect(autoSecondaryFor("جرام").aliases.test(unitKey("كیلو جرام"))).toBe(true);
  });
  it("منتج مجمّع قابل للبيع بلا مخزون: حمولته فيها سعر بيع", () => {
    const pl = buildProductPayload({ name: "ستيك ساندوتش", is_inventory: false, is_sellable: true, sellable_explicit: true, cost: "" }, { type: "Recipe", ingredients: [{ product_id: 1, quantity: 80 }] });
    expect(pl.selling_price).toBe(1);
    expect(pl.sale_item).toBe(true);
  });
});
