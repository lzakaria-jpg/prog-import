import { describe, it, expect } from 'vitest';
import { mapReferenceRecords, parseLocationStock } from '../readWorkbook.js';

describe('mapReferenceRecords — "known quantity" requires a positive stock, not just a value', () => {
  it('Test 5 — a product with stock=0 is not counted as having a known quantity', () => {
    const products = mapReferenceRecords(
      [
        { code: 'P1', name: 'قلم', stock: 30 },
        { code: 'P2', name: 'ممحاة', stock: 0 },
        { code: 'P3', name: 'مسطرة', stock: '' },
      ],
      { code: 'code', name: 'name', stock: 'stock' },
      'products'
    );
    const p1 = products.find(p => p.code === 'P1');
    const p2 = products.find(p => p.code === 'P2');
    const p3 = products.find(p => p.code === 'P3');

    expect(p1.stockKnown).toBe(true);
    // كمية صفر ليست "كمية معروفة" رغم أنها قيمة رقمية صالحة
    expect(p2.stockKnown).toBe(false);
    expect(p2.stock).toBe(0);
    expect(p3.stockKnown).toBe(false);
    expect(p3.stock).toBeNull();
  });
});

describe('parseLocationStock — product count differing from the products file is not an error', () => {
  it('Test 6 — reads whatever rows exist, independent of any other file\'s product count', () => {
    const wbk = {
      headers: ['الرقم التسلسلي', 'اسم المنتج', 'الرياض', 'جدة'],
      records: [
        { 'الرقم التسلسلي': 'P1', 'اسم المنتج': 'قلم', 'الرياض': '10', 'جدة': '25' },
      ],
    };
    const parsed = parseLocationStock(wbk);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].quantities['الرياض']).toBe(10);
    expect(parsed.rows[0].quantities['جدة']).toBe(25);
    expect(parsed.locationColumns.sort()).toEqual(['الرياض', 'جدة']);
  });
});
