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

/**
 * إلغاء مقارنة إجمالي المصدر بمجموع البنود — لا فرق بينهما يُنتج تحذيراً أو
 * خطأً أو يمنع الاستيراد أو يُخفِّض حالة الفاتورة، مهما بلغت قيمته.
 */
describe('source total vs. computed lines total — the comparison is gone entirely', () => {
  const customers = mapReferenceRecords(
    [{ ref: 'C-1', name: 'أحمد' }], { ref: 'ref', name: 'name' }, 'customers'
  );
  const products = mapReferenceRecords(
    [{ code: 'P1', name: 'قلم' }, { code: 'P2', name: 'كرسي' }], { code: 'code', name: 'name' }, 'products'
  );
  const sourceHeaders = ['Invoice Number', 'Date', 'Customer Name', 'Customer ID', 'Location',
    'SKU', 'Details', 'Quantity', 'Subtotal (Tax Exclusive)', 'Discount', 'Total Tax', 'Total (Tax Inclusive)'];
  const sourceMapping = detectMapping(sourceHeaders);
  const template = {
    columns: { customerRef: 1, invoiceRef: 2, issueDate: 3, dueDate: 4, location: 5, productCode: 6,
      quantity: 7, unitPrice: 8, taxInclusive: 9, taxRate: 10 },
    lists: {
      location: ['الرياض'], paymentMethod: ['نقدي'],
      taxRate: ['ضريبة القيمة المضافة - 15.0%'], unitOfConv: [], taxInclusive: ['نعم', 'لا'],
    },
    missing: [], unmapped: [], hasDocDiscount: false,
  };

  const run = records => {
    const parsed = parseSource(records, sourceMapping);
    const result = runPipeline({
      sales: parsed.sales, references: { customers, products }, decisions: {}, template, options: {},
    });
    return { parsed, result };
  };

  it('Test 1 — a large mismatch between the source total column and the computed lines total is never a warning', () => {
    const { parsed, result } = run([
      // مجموع البنود الفعلي = 3.00 + 4.90 = 7.90، لكن عمود الإجمالي في الملف نفسه لكل بند لا يطابق ذلك
      { 'Invoice Number': 'INV-1', 'Date': '2026-01-01', 'Customer Name': 'أحمد', 'Customer ID': 'C-1',
        'Location': 'الرياض', 'SKU': 'P1', 'Quantity': 1, 'Subtotal (Tax Exclusive)': 2.61,
        'Discount': 0, 'Total Tax': 0.39, 'Total (Tax Inclusive)': 5.81 }, // إجمالي مصدر مضخَّم عمداً
      { 'Invoice Number': 'INV-1', 'Date': '2026-01-01', 'Customer Name': 'أحمد', 'Customer ID': 'C-1',
        'Location': 'الرياض', 'SKU': 'P2', 'Quantity': 1, 'Subtotal (Tax Exclusive)': 4.26,
        'Discount': 0, 'Total Tax': 0.64, 'Total (Tax Inclusive)': 4.90 },
    ]);
    // إجمالي المصدر (كما يقرأه parseSource) = مجموع البنود كما وردت = 5.81+4.90 = 10.71
    expect(parsed.sales[0].sourceTotalInclusive).toBe(10.71);
    expect(result.validation.issues.some(i => i.code === 'TOTAL_DRIFT')).toBe(false);
    expect(result.validation.canExport).toBe(true);
  });

  it('Test 2 — a source total that matches the computed total works normally too', () => {
    const { result } = run([
      { 'Invoice Number': 'INV-2', 'Date': '2026-01-01', 'Customer Name': 'أحمد', 'Customer ID': 'C-1',
        'Location': 'الرياض', 'SKU': 'P1', 'Quantity': 1, 'Subtotal (Tax Exclusive)': 100,
        'Discount': 0, 'Total Tax': 15, 'Total (Tax Inclusive)': 115 },
    ]);
    expect(result.validation.issues.some(i => i.code === 'TOTAL_DRIFT')).toBe(false);
    expect(result.validation.canExport).toBe(true);
  });

  it('Test 3 — no source total column at all still works, relying only on the lines sum', () => {
    const noTotalHeaders = ['Invoice Number', 'Date', 'Customer Name', 'Customer ID', 'Location',
      'SKU', 'Quantity', 'Subtotal (Tax Exclusive)', 'Discount', 'Total Tax']; // بلا عمود Total (Tax Inclusive)
    const noTotalMapping = detectMapping(noTotalHeaders);
    expect(noTotalMapping.totalInc).toBeUndefined();
    const parsed = parseSource([
      { 'Invoice Number': 'INV-3', 'Date': '2026-01-01', 'Customer Name': 'أحمد', 'Customer ID': 'C-1',
        'Location': 'الرياض', 'SKU': 'P1', 'Quantity': 1, 'Subtotal (Tax Exclusive)': 100, 'Discount': 0, 'Total Tax': 15 },
    ], noTotalMapping);
    // بلا عمود إجمالي مصدر، تعتمد الفاتورة على مجموع بنودها فقط: كل بند إجماليه صفر (لا عمود له) فمجموعها صفر
    expect(parsed.sales[0].sourceTotalInclusive).toBe(0);
    const result = runPipeline({
      sales: parsed.sales, references: { customers, products }, decisions: {}, template, options: {},
    });
    expect(result.validation.issues.some(i => i.code === 'TOTAL_DRIFT')).toBe(false);
  });
});
