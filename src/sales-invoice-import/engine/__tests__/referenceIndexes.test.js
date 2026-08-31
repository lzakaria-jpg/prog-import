import { describe, it, expect } from "vitest";
import { rowGet, buildProductsIndex, buildStockIndex, buildCustomersIndex } from "../referenceIndexes.js";

describe("rowGet", () => {
  it("يعيد '' عند عدم تحديد عمود، والقيمة الصحيحة عند وجوده", () => {
    const headers = ['sku', 'name'];
    expect(rowGet(['A1', 'منتج'], headers, '')).toBe('');
    expect(rowGet(['A1', 'منتج'], headers, 'name')).toBe('منتج');
    expect(rowGet(['A1', 'منتج'], headers, 'missing')).toBe('');
  });
});

describe("buildProductsIndex", () => {
  const headers = ['sku', 'name', 'sellable', 'stocked'];
  it("يبني فهرس bySku/byName ويحسب nonStockedCount", () => {
    const raw = [
      ['SKU-1', 'منتج أ', 'نعم', 'مخزن'],
      ['SKU-2', 'خدمة توصيل', 'نعم', 'خدمة'],
      ['SKU-3', 'منتج ب', 'لا', ''],
    ];
    const idx = buildProductsIndex(raw, headers, { sku: 'sku', name: 'name', sellable: 'sellable', stocked: 'stocked' });
    expect(idx.bySku.get('SKU-1').stocked).toBe(true);
    expect(idx.bySku.get('SKU-2').stocked).toBe(false);
    expect(idx.bySku.get('SKU-3').sellable).toBe(false);
    expect(idx.bySku.get('SKU-3').stocked).toBeNull(); // العمود فارغ ⇒ null (السلوك السابق يبقى)
    expect(idx.nonStockedCount).toBe(1);
  });

  it("'غير مخزن' تُفحص قبل 'مخزن' فلا تُصنَّف بالخطأ كـ true", () => {
    const raw = [['SKU-9', 'صنف', '', 'غير مخزن']];
    const idx = buildProductsIndex(raw, headers, { sku: 'sku', name: 'name', stocked: 'stocked' });
    expect(idx.bySku.get('SKU-9').stocked).toBe(false);
  });

  it("صف بلا sku يُتجاهَل تمامًا", () => {
    const raw = [['', 'بلا كود', 'نعم', 'مخزن']];
    const idx = buildProductsIndex(raw, headers, { sku: 'sku', name: 'name' });
    expect(idx.bySku.size).toBe(0);
  });
});

describe("buildStockIndex", () => {
  it("الصيغة الافتراضية: sku||loc -> qty", () => {
    const headers = ['sku', 'loc', 'qty'];
    const raw = [['SKU-1', 'الرياض', '15']];
    const idx = buildStockIndex(raw, headers, { sku: 'sku', location: 'loc', qty: 'qty' });
    expect(idx.byKey.get('SKU-1||الرياض')).toBe(15);
  });

  it("الصيغة العريضة (wide): كل عمود موقع مستقل تحته الكمية", () => {
    const headers = ['sku', 'المركز الرئيسي', 'فرع محلي-2'];
    const raw = [['SKU-1', '10', '5']];
    const idx = buildStockIndex(raw, headers, {
      mode: 'wide', sku: 'sku',
      locCols: { 'المركز الرئيسي': 'المركز الرئيسي', 'فرع محلي-2': 'فرع محلي-2' },
    });
    expect(idx.byKey.get('SKU-1||المركز الرئيسي')).toBe(10);
    expect(idx.byKey.get('SKU-1||فرع محلي-2')).toBe(5);
    expect(idx.locHeaderCount).toBe(2);
  });
});

describe("buildCustomersIndex", () => {
  it("يبني byRef/byName ويحدد active من عمود الحالة", () => {
    const headers = ['ref', 'name', 'status'];
    const raw = [
      ['C-1', 'عميل أ', 'نشط'],
      ['C-2', 'عميل ب', 'غير نشط'],
    ];
    const idx = buildCustomersIndex(raw, headers, { ref: 'ref', name: 'name', status: 'status' });
    expect(idx.byRef.get('C-1').active).toBe(true);
    expect(idx.byRef.get('C-2').active).toBe(false);
  });
});
