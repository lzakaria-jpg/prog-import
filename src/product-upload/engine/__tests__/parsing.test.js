// اختبارات الطبقة النقية لأداة رفع المنتجات إلى قيود — منقولة من قواعد
// qoyod_uploader.html الأصلية (core.js بتوثيق opencode).
import { describe, it, expect } from "vitest";
import { isTrue, detectColumns, buildProductsFromRows, parseCostNumber, buildProductPayload, chooseTax, resolveAccountId } from "../parsing.js";

describe("isTrue", () => {
  it("يتعرّف على مؤشرات المخزون الموجبة", () => {
    expect(isTrue("نعم")).toBe(true);
    expect(isTrue("مخزن")).toBe(true);
    expect(isTrue("yes")).toBe(true);
    expect(isTrue("Y")).toBe(true);
    expect(isTrue("1")).toBe(true);
  });
  it("يرفض القيم الفارغة أو السلبية", () => {
    expect(isTrue("")).toBe(false);
    expect(isTrue(null)).toBe(false);
    expect(isTrue("لا")).toBe(false);
    expect(isTrue("no")).toBe(false);
  });
});

describe("detectColumns", () => {
  it("يكتشف أعمدة الترويسة القياسية (7 أعمدة: كود، اسم، حالة بيع...)", () => {
    const cols = detectColumns(["كود المنتج", "الاسم", "حالة البيع", "حالة التخزين", "الوحدة", "حساب الإيراد", "حساب المصروف"]);
    expect(cols.sku).toBe(0);
    expect(cols.name).toBe(1);
    expect(cols.sellable).toBe(2);
    expect(cols.inventory).toBe(3);
    expect(cols.unit).toBe(4);
    expect(cols.revenue).toBe(5);
    expect(cols.expense).toBe(6);
  });

  it("[إصلاح 2026-09-04] يتعرّف على 'حساب المبيعات' كعمود حساب إيراد (لا 'حساب الإيراد' فقط)", () => {
    const cols = detectColumns(["الأسم", "الرمز", "حساب المبيعات", "حساب المصروف"]);
    expect(cols.revenue).toBe(2);
    expect(cols.expense).toBe(3);
  });

  it("[إصلاح 2026-09-04] يتعرّف على 'حساب البيع' كعمود حساب إيراد بلا تصادم مع عمود 'حالة البيع' (sellable)", () => {
    const cols = detectColumns(["الأسم", "حالة البيع", "حساب البيع", "حساب المصروف"]);
    expect(cols.sellable).toBe(1);
    expect(cols.revenue).toBe(2);
    expect(cols.expense).toBe(3);
  });

  it("[إصلاح 2026-09-04] يتعرّف على 'الإيرادات' (جمع) كعمود حساب إيراد", () => {
    const cols = detectColumns(["الأسم", "الإيرادات", "حساب المصروف"]);
    expect(cols.revenue).toBe(1);
    expect(cols.expense).toBe(2);
  });

  it("يستثني أعمدة الحساب من مطابقة الفئة والتكلفة", () => {
    const cols = detectColumns(["التكلفة", "اسم الوحدة", "اسم الصنف", "رقم الصنف", "مخزن", "الأسم", "الرمز"]);
    expect(cols.cost).toBe(0);
    expect(cols.unit).toBe(1);
    expect(cols.category).toBe(2);
    expect(cols.category_code).toBe(3);
    expect(cols.inventory).toBe(4);
    expect(cols.name).toBe(5);
    expect(cols.sku).toBe(6);
  });

  it("[إصلاح 2026-09-04] يتعرّف على 'الصنف' منفردة كعمود فئة، مع بقاء 'رقم الصنف' مخصصاً لـ category_code فقط (لا يُطابَق كفئة أيضاً)", () => {
    const cols = detectColumns(["الأسم", "الصنف", "رقم الصنف"]);
    expect(cols.category).toBe(1);
    expect(cols.category_code).toBe(2);
  });

  it("[إصلاح 2026-09-04] يتعرّف على 'تصنيف المنتج' كعمود فئة", () => {
    const cols = detectColumns(["الأسم", "تصنيف المنتج"]);
    expect(cols.category).toBe(1);
  });
});

describe("buildProductsFromRows", () => {
  it("يُعيد headerFound:false عند غياب صف ترويسة معروف خلال أول 10 صفوف", () => {
    const rows = [["x", "y"], ["1", "2"]];
    expect(buildProductsFromRows(rows).headerFound).toBe(false);
  });

  it("يتخطى الصف بلا اسم، ويحوّل باقي الصفوف حرفياً", () => {
    const rows = [
      ["التكلفة", "اسم الوحدة", "اسم الصنف", "رقم الصنف", "مخزن", "الأسم", "الرمز"],
      ["10.5", "قطعة", "مشروبات", "1", "نعم", "منتج أ", "SKU1"],
      [null, null, null, null, null, null, null],
      ["", "", "", "", "", "", ""], // صف بلا اسم يُتخطى
    ];
    const { headerFound, data } = buildProductsFromRows(rows);
    expect(headerFound).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ name: "منتج أ", sku: "SKU1", unit: "قطعة", category: "مشروبات", is_inventory: true, cost: "10.5" });
  });

  it("يستخدم التخطيط الموضعي الاحتياطي (7 أعمدة قديمة) عند فشل اكتشاف name/sku/category معاً", () => {
    const rows = [
      // "اسم" وحده (بلا "الاسم" الحرفي أو "اسم المنتج") لا يفعّل مطابقة name، ولا كود/رمز
      // لمطابقة sku، ولا فئة/تصنيف لمطابقة category — فتفشل الثلاثة معاً ويُستخدم
      // التخطيط الموضعي الاحتياطي، مع بقاء الصف مؤهلاً لاكتشاف صف الترويسة (يحوي "اسم").
      ["ترقيم غير معروف", "اسم غير مطابق", "حالة1", "حالة2", "قياس", "حساب A", "حساب B"],
      ["S1", "منتج ب", "نعم", "نعم", "كجم", "", ""],
    ];
    const { data } = buildProductsFromRows(rows);
    expect(data[0].sku).toBe("S1");
    expect(data[0].name).toBe("منتج ب");
  });
});

describe("parseCostNumber — سعر الشراء (بند «Buying price must be a number»)", () => {
  it("يُرجع 1 للقيمة الفارغة أو صفر أو غير الصالحة", () => {
    expect(parseCostNumber("")).toBe(1);
    expect(parseCostNumber("0")).toBe(1);
    expect(parseCostNumber("abc")).toBe(1);
    expect(parseCostNumber(null)).toBe(1);
  });
  it("يحوّل كل فاصلة إلى نقطة عشرية حرفياً (لا يوجد دعم لفاصل آلاف بالأصل — نفس سلوك الأداة الأصلية)", () => {
    // ملاحظة أمانة النقل: هذا يعني أن "1,500" تُقرأ 1.5 لا 1500 — سلوك أصلي حرفي
    // لم يطلب المستخدم تغييره (فقط أصلح خلل 404 القائمة الفارغة، لا هذا).
    expect(parseCostNumber("1,500")).toBe(1.5);
    expect(parseCostNumber("12.75 ريال")).toBe(12.75);
  });
});

describe("buildProductPayload", () => {
  it("يبني الحمولة الكاملة بنفس ترتيب وشروط الأصل، ويعطي selling_price=1 فقط للمخزون القابل للبيع", () => {
    const p = { name: "منتج", sku: "S1", is_inventory: true, is_sellable: true, cost: "" };
    const payload = buildProductPayload(p, { unitId: 5, categoryId: 7, revId: 1, expId: 2, selectedTaxId: 9, taxInclusive: true });
    expect(payload).toMatchObject({
      name_en: "منتج", name_ar: "منتج", sku: "S1",
      product_unit_type_id: 5, category_id: 7, sales_account_id: 1, expense_account_id: 2,
      buying_price: 1, track_quantity: true, purchase_item: true, sale_item: true,
      selling_price: 1, tax_id: 9, tax_inclusive: true,
    });
  });
  it("لا يضيف selling_price لمنتج غير مخزون أو غير قابل للبيع", () => {
    const p = { name: "منتج", sku: "", is_inventory: false, is_sellable: true, cost: "" };
    const payload = buildProductPayload(p, { unitId: null, categoryId: null, revId: null, expId: null, selectedTaxId: null, taxInclusive: false });
    expect(payload.selling_price).toBeUndefined();
  });
});

describe("resolveAccountId — [إصلاح 2026-09-04] خلل الربط الافتراضي الكامل رغم وجود عمود حساب لكل منتج", () => {
  const accountsByCode = { "4102": { id: 501, code: "4102" }, "5102": { id: 502, code: "5102" } };
  const accountsByName = { "إيرادات خدمات": { id: 601 }, "مصروف تشغيلي": { id: 602 } };

  it("يطابق برقم الحساب (الحالة الحقيقية: ملف العميل يكتب رقم الحساب لا اسمه)", () => {
    const r = resolveAccountId("4102", accountsByCode, accountsByName);
    expect(r).toEqual({ id: 501, matched: true });
  });

  it("يطابق باسم الحساب كبديل لمن يكتب الاسم فعلاً", () => {
    const r = resolveAccountId("إيرادات خدمات", accountsByCode, accountsByName);
    expect(r).toEqual({ id: 601, matched: true });
  });

  it("لا يطابق شيئاً ويُعيد matched:false لرقم/اسم غير موجود (بدل استبدال صامت بالافتراضي هنا)", () => {
    expect(resolveAccountId("9999", accountsByCode, accountsByName)).toEqual({ id: null, matched: false });
  });

  it("يُعيد matched:false للقيمة الفارغة", () => {
    expect(resolveAccountId("", accountsByCode, accountsByName)).toEqual({ id: null, matched: false });
    expect(resolveAccountId(null, accountsByCode, accountsByName)).toEqual({ id: null, matched: false });
  });
});

describe("chooseTax", () => {
  it("يختار ضريبة 15% إن وُجدت", () => {
    const taxes = [{ id: 1, rate: 5 }, { id: 2, rate: 15 }];
    expect(chooseTax(taxes).id).toBe(2);
  });
  it("يأخذ أول ضريبة إن لم توجد 15%", () => {
    const taxes = [{ id: 1, percentage: 5 }];
    expect(chooseTax(taxes).id).toBe(1);
  });
  it("يُرجع null لقائمة فارغة", () => {
    expect(chooseTax([])).toBeNull();
  });
});
