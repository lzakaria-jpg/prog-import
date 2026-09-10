import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildProductsIndexFromApi,
  buildStockIndexFromApi,
  buildLocationIdIndexFromApi,
  buildCustomersIndexFromApi,
  fetchSalesReferencesFromApi,
} from '../qoyodSalesRefFetch.js';

afterEach(() => { vi.restoreAllMocks(); });

const SAMPLE_PRODUCT = {
  id: 1, sku: '358719364730', name_ar: 'اسوارة', name_en: 'bracelet',
  is_sold: true, track_quantity: true, tax_id: 1,
  inventories: [
    { id: 1, name_ar: 'المركز الرئيسي', name_en: 'Main Branch', stock: '6.0' },
    { id: 2, name_ar: 'النسيم', name_en: 'alnasim', stock: '99.0' },
  ],
};
const SAMPLE_CUSTOMER = { id: 205, name: 'nouf sss', status: 'Active' };

describe('buildProductsIndexFromApi', () => {
  it('يبني bySku بنفس شكل buildProductsIndex اليدوي زائد id', () => {
    const idx = buildProductsIndexFromApi([SAMPLE_PRODUCT]);
    expect(idx.bySku.get('358719364730')).toEqual({ sku: '358719364730', name: 'اسوارة', sellable: true, stocked: true, id: 1 });
  });
  it('is_sold:false يعني sellable:false', () => {
    const idx = buildProductsIndexFromApi([{ ...SAMPLE_PRODUCT, is_sold: false }]);
    expect(idx.bySku.get('358719364730').sellable).toBe(false);
  });
  it('track_quantity:false يعني stocked:false ويُحسب بـnonStockedCount', () => {
    const idx = buildProductsIndexFromApi([{ ...SAMPLE_PRODUCT, track_quantity: false }]);
    expect(idx.bySku.get('358719364730').stocked).toBe(false);
    expect(idx.nonStockedCount).toBe(1);
  });
  it('منتج بلا sku يُتجاهَل', () => {
    const idx = buildProductsIndexFromApi([{ ...SAMPLE_PRODUCT, sku: '' }]);
    expect(idx.bySku.size).toBe(0);
  });
});

describe('buildStockIndexFromApi', () => {
  it('يبني byKey من مصفوفة inventories المُضمَّنة بكل منتج', () => {
    const idx = buildStockIndexFromApi([SAMPLE_PRODUCT]);
    expect(idx.byKey.get('358719364730||المركز الرئيسي')).toBe(6);
    expect(idx.byKey.get('358719364730||النسيم')).toBe(99);
    expect(idx.groupCount).toBe(2);
  });
});

describe('buildLocationIdIndexFromApi', () => {
  it('يبني فهرس اسم الموقع (عربي وإنجليزي) → معرّف المخزون', () => {
    const idx = buildLocationIdIndexFromApi([SAMPLE_PRODUCT]);
    expect(idx.get('المركز الرئيسي')).toBe(1);
    expect(idx.get('Main Branch')).toBe(1);
    expect(idx.get('النسيم')).toBe(2);
  });
});

describe('buildCustomersIndexFromApi', () => {
  it('ref = String(id) الحقيقي، لا رقم مرجعي نصي (غير متاح بالـAPI)', () => {
    const idx = buildCustomersIndexFromApi([SAMPLE_CUSTOMER]);
    expect(idx.byRef.get('205')).toEqual({ ref: '205', name: 'nouf sss', active: true });
  });
  it('status غير Active يعني active:false', () => {
    const idx = buildCustomersIndexFromApi([{ ...SAMPLE_CUSTOMER, status: 'Inactive' }]);
    expect(idx.byRef.get('205').active).toBe(false);
  });
});

describe('fetchSalesReferencesFromApi', () => {
  it('يرمي خطأ واضح بلا مفتاح API', async () => {
    await expect(fetchSalesReferencesFromApi('')).rejects.toThrow(/مفتاح API/);
  });

  it('يجمع المنتجات والعملاء ويبني الفهارس الأربعة معًا', async () => {
    global.fetch = vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('/products')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ products: [SAMPLE_PRODUCT] }) };
      }
      if (String(url).includes('/customers')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ customers: [SAMPLE_CUSTOMER] }) };
      }
      return { ok: false, status: 404, text: async () => 'not found' };
    });
    const result = await fetchSalesReferencesFromApi('KEY');
    expect(result.productsRef.loaded).toBe(true);
    expect(result.productsRef.bySku.get('358719364730').id).toBe(1);
    expect(result.stockRef.loaded).toBe(true);
    expect(result.customersRef.loaded).toBe(true);
    expect(result.customersRef.byRef.get('205').name).toBe('nouf sss');
    expect(result.locationIdByName.get('المركز الرئيسي')).toBe(1);
    expect(result.counts).toEqual({ products: 1, customers: 1 });
  });

  it('يرمي خطأ عربي واضح عند فشل الشبكة', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(fetchSalesReferencesFromApi('KEY')).rejects.toThrow(/تعذّر جلب/);
  });
});
