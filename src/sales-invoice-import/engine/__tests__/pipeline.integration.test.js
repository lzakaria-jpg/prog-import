import { describe, it, expect } from 'vitest';
import { parseSource, detectMapping } from '../parseSource.js';
import { collectDecisions, runPipeline } from '../pipeline.js';
import { detectReferenceMapping, mapReferenceRecords } from '../../io/readWorkbook.js';

/**
 * اختبار تكاملي: ملف عملاء برأس فيه مسافة إضافية (نفس عطل الإنتاج المُبلَّغ)،
 * ملف منتجات فيه منتج غير مسموح ببيعه، وملف فواتير مسطَّح بلا عمود «نوع سطر» —
 * يمرّ المسار كاملاً من القراءة إلى صفوف القالب دون طلب تدخل غير ضروري ودون
 * السماح للمنتج المستبعد بالظهور.
 */
describe('full pipeline — messy customer header + non-sellable product + flat invoice file', () => {
  const customerHeaders = ['اسم  العميل', 'الرقم المرجعي']; // مسافة مضاعفة — عطل الإنتاج المُبلَّغ
  const customerMapping = detectReferenceMapping(customerHeaders, 'customers');
  const customers = mapReferenceRecords(
    [{ 'اسم  العميل': 'شركة الاختبار', 'الرقم المرجعي': 'C-100' }],
    customerMapping,
    'customers'
  );

  const productHeaders = ['رمز المنتج', 'اسم المنتج', 'هل المنتج يباع'];
  const productMapping = detectReferenceMapping(productHeaders, 'products');
  const products = mapReferenceRecords(
    [
      { 'رمز المنتج': 'P1', 'اسم المنتج': 'قلم', 'هل المنتج يباع': 'نعم' },
      { 'رمز المنتج': 'P2', 'اسم المنتج': 'منتج موقوف', 'هل المنتج يباع': 'لا' },
    ],
    productMapping,
    'products'
  );

  const sourceHeaders = ['Invoice Number', 'Date', 'Customer Name', 'Customer ID', 'Location',
    'SKU', 'Details', 'Quantity', 'Subtotal (Tax Exclusive)', 'Discount', 'Total Tax', 'Total (Tax Inclusive)'];
  const sourceMapping = detectMapping(sourceHeaders);
  const parsed = parseSource(
    [
      { 'Invoice Number': 'INV-1', 'Date': '2026-03-01', 'Customer Name': 'شركة الاختبار', 'Customer ID': 'C-100',
        'Location': 'الرياض', 'SKU': 'P1', 'Details': 'قلم', 'Quantity': 2,
        'Subtotal (Tax Exclusive)': 100, 'Discount': 0, 'Total Tax': 15, 'Total (Tax Inclusive)': 115 },
    ],
    sourceMapping
  );

  const template = {
    columns: { customerRef: 1, invoiceRef: 2, issueDate: 3, dueDate: 4, location: 5, productCode: 6,
      quantity: 7, unitPrice: 8, taxInclusive: 9, taxRate: 10 },
    lists: {
      location: ['الرياض', 'جدة'], paymentMethod: ['نقدي', 'آجل'],
      taxRate: ['ضريبة القيمة المضافة - 15.0%'], unitOfConv: [], taxInclusive: ['نعم', 'لا'],
    },
    missing: [], unmapped: [], hasDocDiscount: false,
  };

  it('resolves the customer despite the header-space bug, via the centralized detection fix', () => {
    expect(customerMapping.name).toBe('اسم  العميل');
    expect(customers[0].ref).toBe('C-100');
  });

  it('parses the invoice file (every row a line item) into one invoice with the right totals', () => {
    expect(parsed.sales).toHaveLength(1);
    expect(parsed.sales[0].sourceTotalInclusive).toBe(115);
  });

  it('collectDecisions needs no manual customer/location decision — everything resolves automatically', () => {
    const pending = collectDecisions({
      sales: parsed.sales, references: { customers, products }, decisions: {}, template,
    });
    expect(pending.customers).toHaveLength(0);
    expect(pending.locations).toHaveLength(0);
  });

  it('runPipeline produces one exportable row referencing the sellable product only', () => {
    const result = runPipeline({
      sales: parsed.sales, references: { customers, products }, decisions: {}, template, options: {},
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].customerRef).toBe('C-100');
    expect(result.rows[0].productCode).toBe('P1');
    expect(result.validation.fatal).toHaveLength(0);
  });
});
