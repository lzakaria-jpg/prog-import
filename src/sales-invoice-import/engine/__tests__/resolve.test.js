import { describe, it, expect } from 'vitest';
import {
  buildCustomerIndex, matchCustomer, buildProductIndex, matchProduct,
  checkStock, buildLocationStockIndex, matchListValueSmart,
} from '../resolve.js';
import { LOCATION_SYNONYM_GROUPS, PAYMENT_METHOD_SYNONYM_GROUPS } from '../constants.js';

describe('matchCustomer — duplicate name resolution', () => {
  const customers = [
    { ref: '10025', name: 'محمد أحمد' },
    { ref: '10071', name: 'محمد أحمد' },
    { ref: '10280', name: 'محمد أحمد' },
    { ref: '20000', name: 'سارة علي' },
  ];
  const index = buildCustomerIndex(customers);

  it('returns all candidate refs for a duplicated name instead of picking one silently', () => {
    const m = matchCustomer('محمد أحمد', index, {});
    expect(m.status).toBe('ambiguous');
    expect(m.candidates.map(c => c.ref).sort()).toEqual(['10025', '10071', '10280']);
  });

  it('matches uniquely by ref from the invoice file, bypassing name ambiguity', () => {
    const m = matchCustomer('محمد أحمد', index, {}, '10071');
    expect(m.status).toBe('matched');
    expect(m.ref).toBe('10071');
    expect(m.via).toBe('ref');
  });

  it('matches a unique name with no ambiguity', () => {
    const m = matchCustomer('سارة علي', index, {});
    expect(m.status).toBe('matched');
    expect(m.ref).toBe('20000');
  });

  it('honors a prior manual decision over everything else', () => {
    const m = matchCustomer('محمد أحمد', index, { 'محمد أحمد': '10280' }, '10071');
    expect(m.status).toBe('matched');
    expect(m.ref).toBe('10280');
    expect(m.manual).toBe(true);
  });
});

describe('buildProductIndex — sellable exclusion', () => {
  const products = [
    { code: 'P1', barcode: '', name: 'قلم', sellable: true, stock: 10, stockKnown: true, tracked: true },
    { code: 'P2', barcode: '', name: 'كرسي معطوب', sellable: false, stock: 5, stockKnown: true, tracked: true },
  ];
  const index = buildProductIndex(products);

  it('excludes non-sellable products from the match index entirely', () => {
    expect(index.byCode.has('P2')).toBe(false);
    expect(index.all.some(p => p.code === 'P2')).toBe(false);
  });

  it('matchProduct explains a non-sellable code clearly instead of "does not exist"', () => {
    const m = matchProduct('P2', '', index, {});
    expect(m.status).toBe('unmatched');
    expect(m.reason).toMatch(/غير مسموح ببيعه/);
  });

  it('still matches a sellable product normally', () => {
    const m = matchProduct('P1', '', index, {});
    expect(m.status).toBe('matched');
  });
});

describe('checkStock — per-location quantities', () => {
  const productIndex = buildProductIndex([
    { code: 'P1', barcode: '', name: 'قلم', sellable: true, stock: null, stockKnown: false, tracked: true },
  ]);
  const locationStock = buildLocationStockIndex({
    locationColumns: ['الرياض', 'جدة'],
    rows: [{ code: 'P1', name: 'قلم', quantities: { 'الرياض': 5, 'جدة': 100 } }],
  });

  it('flags insufficient stock in one location while another location is fine', () => {
    const results = checkStock(
      [
        { code: 'P1', quantity: 8, invoiceRef: 'INV-1', sourceRow: 2, location: 'الرياض' },
        { code: 'P1', quantity: 8, invoiceRef: 'INV-2', sourceRow: 3, location: 'جدة' },
      ],
      productIndex,
      locationStock
    );
    const riyadh = results.find(r => r.location === 'الرياض');
    const jeddah = results.find(r => r.location === 'جدة');
    expect(riyadh.status).toBe('insufficient');
    expect(riyadh.available).toBe(5);
    expect(jeddah.status).toBe('ok');
  });

  it('without a location-stock index, behaves exactly as the original global-stock check', () => {
    const globalIndex = buildProductIndex([
      { code: 'P1', barcode: '', name: 'قلم', sellable: true, stock: 3, stockKnown: true, tracked: true },
    ]);
    const results = checkStock(
      [{ code: 'P1', quantity: 5, invoiceRef: 'INV-1', sourceRow: 2 }],
      globalIndex
    );
    expect(results[0].status).toBe('insufficient');
    expect(results[0].available).toBe(3);
  });
});

describe('checkStock — sequential balance across invoices (no reused original quantity)', () => {
  const productIndex = buildProductIndex([
    { code: 'P1', barcode: '', name: 'قلم', sellable: true, stock: null, stockKnown: false, tracked: true },
  ]);
  const locationStock = buildLocationStockIndex({
    locationColumns: ['الرياض'],
    rows: [{ code: 'P1', name: 'قلم', quantities: { 'الرياض': 30 } }],
  });

  it('Test 1 — sequential deduction: 30 stock, invoice1=20 then invoice2=5, both accepted, remaining=5', () => {
    const results = checkStock(
      [
        { code: 'P1', quantity: 20, invoiceRef: 'INV-1', sourceRow: 2, location: 'الرياض' },
        { code: 'P1', quantity: 5, invoiceRef: 'INV-2', sourceRow: 3, location: 'الرياض' },
      ],
      productIndex,
      locationStock
    );
    const r = results[0];
    expect(r.status).toBe('ok');
    expect(r.remaining).toBe(5);
    expect(r.insufficientInvoices).toEqual([]);
    expect(r.breakdown.find(b => b.invoiceRef === 'INV-1')).toMatchObject({ availableBefore: 30, status: 'ok' });
    expect(r.breakdown.find(b => b.invoiceRef === 'INV-2')).toMatchObject({ availableBefore: 10, status: 'ok' });
  });

  it('Test 2 — overshoot: 30 stock, invoice1=20 accepted (remaining 10) then invoice2=15 rejected specifically', () => {
    const results = checkStock(
      [
        { code: 'P1', quantity: 20, invoiceRef: 'INV-1', sourceRow: 2, location: 'الرياض' },
        { code: 'P1', quantity: 15, invoiceRef: 'INV-2', sourceRow: 3, location: 'الرياض' },
      ],
      productIndex,
      locationStock
    );
    const r = results[0];
    expect(r.status).toBe('insufficient');
    // الفاتورة الأولى مقبولة تماماً ولا تظهر ضمن الفواتير الناقصة
    expect(r.insufficientInvoices).toEqual(['INV-2']);
    const first = r.breakdown.find(b => b.invoiceRef === 'INV-1');
    const second = r.breakdown.find(b => b.invoiceRef === 'INV-2');
    expect(first.status).toBe('ok');
    // الكمية المعروضة عند فحص الفاتورة الثانية هي الرصيد الفعلي وقتها (10)، لا الأصلي (30)
    expect(second.status).toBe('insufficient');
    expect(second.availableBefore).toBe(10);
    expect(second.shortage).toBe(5);
  });

  it('Test 4 — a product absent from the location-stock file is non-stock: unlimited sales, no error', () => {
    const results = checkStock(
      [{ code: 'P-UNKNOWN-TO-LOCATIONS', quantity: 9999, invoiceRef: 'INV-1', sourceRow: 2, location: 'الرياض' }],
      buildProductIndex([{ code: 'P-UNKNOWN-TO-LOCATIONS', barcode: '', name: 'خدمة شحن', sellable: true, stock: null, stockKnown: false, tracked: true }]),
      locationStock
    );
    expect(results[0].status).toBe('not_tracked');
    expect(results[0].insufficientInvoices).toEqual([]);
  });

  it('Test 9 — two lines of the same product within the same invoice are combined before checking', () => {
    const results = checkStock(
      [
        { code: 'P1', quantity: 5, invoiceRef: 'INV-1', sourceRow: 2, location: 'الرياض' },
        { code: 'P1', quantity: 8, invoiceRef: 'INV-1', sourceRow: 3, location: 'الرياض' },
      ],
      productIndex,
      buildLocationStockIndex({ locationColumns: ['الرياض'], rows: [{ code: 'P1', name: 'قلم', quantities: { 'الرياض': 10 } }] })
    );
    const r = results[0];
    expect(r.required).toBe(13);
    expect(r.status).toBe('insufficient');
    expect(r.insufficientInvoices).toEqual(['INV-1']);
  });
});

describe('matchListValueSmart — location/payment synonym matching', () => {
  it('maps "مخزن رئيسي" to the template\'s actual main-location label via the concept group', () => {
    const m = matchListValueSmart('مخزن رئيسي', ['المركز الرئيسي', 'فرع جدة'], LOCATION_SYNONYM_GROUPS);
    expect(m.status).toBe('matched');
    expect(m.value).toBe('المركز الرئيسي');
    expect(m.via).toBe('synonym');
  });

  it('maps English "Riyadh" to the Arabic template label for the same city', () => {
    const m = matchListValueSmart('Riyadh', ['موقع الرياض', 'موقع جدة'], LOCATION_SYNONYM_GROUPS);
    expect(m.status).toBe('matched');
    expect(m.value).toBe('موقع الرياض');
  });

  it('maps a cash-payment synonym to the exact template wording without inventing a new option', () => {
    const m = matchListValueSmart('Cash', ['نقدي', 'آجل', 'دفعة لحساب بنك', 'بطاقة بنك', 'غير محدد'], PAYMENT_METHOD_SYNONYM_GROUPS);
    expect(m.status).toBe('matched');
    expect(m.value).toBe('نقدي');
  });

  it('leaves genuinely unrelated values unmatched rather than guessing', () => {
    const m = matchListValueSmart('شيء غريب تماماً', ['نقدي', 'آجل'], PAYMENT_METHOD_SYNONYM_GROUPS);
    expect(m.status).toBe('unmatched');
  });
});
