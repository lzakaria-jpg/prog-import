import { describe, it, expect } from "vitest";
import {
  normalizeProductType, detectColumns, rowsToProducts, buildProductPayload,
  parseBomRows, planBundles, suggestLinks,
} from "../parsing.js";

const NO_IDS = { unitId: null, categoryId: null, revId: null, expId: null, selectedTaxId: null, taxInclusive: false };
const prod = (name, extra = {}) => ({ name, sku: "", product_type: "Product", product_type_explicit: false, ...extra });

describe("normalizeProductType", () => {
  it("يطابق الأنواع الخمسة بالعربي والإنجليزي", () => {
    expect(normalizeProductType("مادة أولية").type).toBe("RawMaterial");
    expect(normalizeProductType("مادة خام").type).toBe("RawMaterial");
    expect(normalizeProductType("منتج").type).toBe("Product");
    expect(normalizeProductType("خدمة").type).toBe("Service");
    expect(normalizeProductType("مصروف").type).toBe("Expense");
    expect(normalizeProductType("Raw Material").type).toBe("RawMaterial");
    expect(normalizeProductType("recipe").type).toBe("Recipe");
  });
  it("منتج مجمّع لا يُخطَف كمنتج عادي رغم احتوائه كلمة منتج", () => {
    expect(normalizeProductType("منتج مجمع").type).toBe("Recipe");
    expect(normalizeProductType("منتج مجمّع").type).toBe("Recipe");
  });
  it("فارغ => Product غير صريح، ونص مجهول => غير معروف (لا افتراض صامت)", () => {
    expect(normalizeProductType("")).toEqual({ type: "Product", recognized: true, explicit: false });
    expect(normalizeProductType("شيء ثاني")).toEqual({ type: "Product", recognized: false, explicit: true });
  });
});

describe("عمود نوع المنتج بشيت المنتجات", () => {
  it("يُكتشف ولا يلتقط عمود نوع الحساب", () => {
    expect(detectColumns(["الاسم", "نوع المنتج"]).product_type).toBe(1);
    expect(detectColumns(["الاسم", "نوع الحساب"]).product_type).toBe(-1);
  });
  it("rowsToProducts تملأ النوع، وملف بلا العمود يبقى Product", () => {
    const rows = [["الاسم", "نوع المنتج"], ["دجاج", "مادة أولية"], ["ساندوتش", ""]];
    const data = rowsToProducts(rows, 0, detectColumns(rows[0]));
    expect(data[0]).toMatchObject({ product_type: "RawMaterial", product_type_explicit: true });
    expect(data[1]).toMatchObject({ product_type: "Product", product_type_explicit: false });
  });
});

describe("buildProductPayload حسب النوع", () => {
  it("بلا نوع: type=Product وباقي الحمولة كما كانت", () => {
    const pl = buildProductPayload({ name: "منتج", is_inventory: true, is_sellable: true, cost: "" }, NO_IDS);
    expect(pl.type).toBe("Product");
    expect(pl.track_quantity).toBe(true);
    expect(pl.sale_item).toBe(true);
    expect(pl.ingredients).toBeUndefined();
  });
  it("خدمة/مصروف: لا تتبّع كمية أبداً", () => {
    const p = { name: "تركيب", is_inventory: true, is_sellable: true, sellable_explicit: true, cost: "" };
    expect(buildProductPayload(p, { ...NO_IDS, type: "Service" }).track_quantity).toBe(false);
    expect(buildProductPayload(p, { ...NO_IDS, type: "Expense" }).track_quantity).toBe(false);
  });
  it("مادة أولية بلا عمود حالة البيع: غير قابلة للبيع؛ عمود صريح يتفوّق", () => {
    const implicit = { name: "دجاج", is_inventory: true, is_sellable: true, sellable_explicit: false, cost: "" };
    expect(buildProductPayload(implicit, { ...NO_IDS, type: "RawMaterial" }).sale_item).toBe(false);
    expect(buildProductPayload({ ...implicit, sellable_explicit: true }, { ...NO_IDS, type: "RawMaterial" }).sale_item).toBe(true);
  });
  it("المكوّنات تُرسَل للمنتج المجمّع فقط", () => {
    const ing = [{ product_id: 5, quantity: 80, product_unit_id: 2 }];
    expect(buildProductPayload({ name: "ساندوتش", cost: "" }, { ...NO_IDS, type: "Recipe", ingredients: ing }).ingredients).toEqual(ing);
    expect(buildProductPayload({ name: "دجاج", cost: "" }, { ...NO_IDS, type: "RawMaterial", ingredients: ing }).ingredients).toBeUndefined();
  });
});

describe("parseBomRows", () => {
  it("يقرأ الشيت ويفصل الأسطر الناقصة بدل افتراض كمية", () => {
    const rows = [
      ["المنتج المجمع", "المكون", "الكمية"],
      ["ستيك ساندوتش", "لحم", 80],
      ["ستيك ساندوتش", "بصل", "20"],
      [null, null, null],
      ["وجبة افكادو", "ساندوتش افكادو", ""],
    ];
    const r = parseBomRows(rows);
    expect(r.found).toBe(true);
    expect(r.lines).toEqual([
      { parent: "ستيك ساندوتش", component: "لحم", qty: 80, rowNumber: 2 },
      { parent: "ستيك ساندوتش", component: "بصل", qty: 20, rowNumber: 3 },
    ]);
    expect(r.errors).toEqual([{ rowNumber: 5, reason: "bad_qty", parent: "وجبة افكادو", component: "ساندوتش افكادو" }]);
  });
  it("شيت بلا أعمدة المكوّنات => found:false", () => {
    expect(parseBomRows([["الصنف", "السعر"]]).found).toBe(false);
  });
});

describe("planBundles", () => {
  const products = [
    prod("لحم", { product_type: "RawMaterial", product_type_explicit: true }),
    prod("بطاطس", { product_type: "RawMaterial", product_type_explicit: true }),
    prod("ستيك ساندوتش", { product_type: "Recipe", product_type_explicit: true }),
    prod("وجبة ستيك"),
  ];

  it("يحل المكوّنات بالاسم حرفياً ويرتب المجمّع بعد مكوّناته (مجمّع داخل مجمّع)", () => {
    const bom = [
      { parent: "وجبة ستيك", component: "ستيك ساندوتش", qty: 1, rowNumber: 2 },
      { parent: "وجبة ستيك", component: "بطاطس", qty: 80, rowNumber: 3 },
      { parent: "ستيك ساندوتش", component: "لحم", qty: 80, rowNumber: 4 },
    ];
    const plan = planBundles({ products, bomLines: bom, existingProducts: [], links: {} });
    expect(plan.unresolved).toEqual([]);
    expect(plan.issues).toEqual([]);
    expect(plan.effectiveTypes[3]).toBe("Recipe"); // نوع غير محدد + له مكوّنات
    expect(plan.order.indexOf(2)).toBeLessThan(plan.order.indexOf(3));
    expect(plan.order.indexOf(0)).toBeLessThan(plan.order.indexOf(2));
  });

  it("لا مطابقة تقريبية: اسم مختلف بالكتابة يبقى غير مربوط، مع اقتراح للعرض فقط", () => {
    const bom = [{ parent: "ستيك ساندوتش", component: "لحم بقري", qty: 80, rowNumber: 2 }];
    const plan = planBundles({ products, bomLines: bom, existingProducts: [], links: {} });
    expect(plan.unresolved).toEqual([{ key: "لحم بقري", ref: "لحم بقري", usedBy: ["ستيك ساندوتش"] }]);
    expect(suggestLinks("لحم بقري", [{ name: "لحم" }, { name: "بطاطس" }])).toEqual([{ name: "لحم" }]);
  });

  it("الربط اليدوي يحل المكوّن (بالملف، بقيود، أو إنشاء جديد)", () => {
    const bom = [
      { parent: "ستيك ساندوتش", component: "لحم بقري", qty: 80, rowNumber: 2 },
      { parent: "ستيك ساندوتش", component: "صوص ستيك", qty: 40, rowNumber: 3 },
      { parent: "ستيك ساندوتش", component: "زيت زيتون", qty: 13, rowNumber: 4 },
    ];
    const plan = planBundles({
      products, bomLines: bom, existingProducts: [{ id: 77, name_ar: "صوص ستيك قيود", unit_type: 3 }],
      links: { "لحم بقري": { kind: "file", index: 0 }, "صوص ستيك": { kind: "existing", id: 77, unitTypeId: 3 }, "زيت زيتون": { kind: "create" } },
    });
    expect(plan.unresolved).toEqual([]);
    expect(plan.recipes.get(2).map((c) => c.target.kind)).toEqual(["file", "existing", "create"]);
    expect(plan.createRefs).toEqual([{ key: "زيت زيتون", name: "زيت زيتون" }]);
  });

  it("يطابق منتجاً موجوداً مسبقاً بقيود بالاسم أو الرمز", () => {
    const bom = [{ parent: "ستيك ساندوتش", component: "خبز", qty: 1, rowNumber: 2 }];
    const plan = planBundles({ products, bomLines: bom, existingProducts: [{ id: 9, name_ar: "خبز", unit_type: 1 }], links: {} });
    expect(plan.recipes.get(2)[0].target).toEqual({ kind: "existing", id: 9, unitTypeId: 1 });
  });

  it("أخطاء بنيوية: مجمّع غير موجود، نوع صريح مخالف، مجمّع بلا مكوّنات، حلقة", () => {
    const ps = [
      prod("أ", { product_type: "Recipe", product_type_explicit: true }),
      prod("ب", { product_type: "Recipe", product_type_explicit: true }),
      prod("لحم", { product_type: "RawMaterial", product_type_explicit: true }),
      prod("ج", { product_type: "Recipe", product_type_explicit: true }),
    ];
    const bom = [
      { parent: "غير موجود", component: "لحم", qty: 1, rowNumber: 2 },
      { parent: "لحم", component: "أ", qty: 1, rowNumber: 3 },
      { parent: "أ", component: "ب", qty: 1, rowNumber: 4 },
      { parent: "ب", component: "أ", qty: 1, rowNumber: 5 },
    ];
    const kinds = planBundles({ products: ps, bomLines: bom, existingProducts: [], links: {} }).issues.map((x) => x.kind);
    expect(kinds).toContain("parent_not_found");
    expect(kinds).toContain("parent_wrong_type");
    expect(kinds).toContain("recipe_without_components");
    expect(kinds).toContain("cycle");
  });
});
