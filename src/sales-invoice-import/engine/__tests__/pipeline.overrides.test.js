import { describe, it, expect } from 'vitest';
import { parseSource, detectMapping } from '../parseSource.js';
import { runPipeline } from '../pipeline.js';
import { mapReferenceRecords } from '../../io/readWorkbook.js';

/**
 * اختبار تكاملي لتعديلات صفحة «المطابقة والمراجعة»: يتحقق أن تعديل قيمة واحدة
 * يعيد تصنيف الفاتورة صحيحة/تنبيه/خطأ ويحدّث الإجمالي فوراً عبر runPipeline
 * نفسه — بلا أي زر «إعادة تحقق» منفصل، تماماً كما تستخدمه الواجهة.
 */
describe('runPipeline + overrides — إعادة التحقق والاحتساب فور التعديل', () => {
  const customers = mapReferenceRecords(
    [{ ref: 'C-1', name: 'أحمد' }, { ref: 'C-2', name: 'سارة' }], { ref: 'ref', name: 'name' }, 'customers'
  );
  const products = mapReferenceRecords(
    [{ code: 'P1', name: 'قلم' }, { code: 'P2', name: 'كرسي' }], { code: 'code', name: 'name' }, 'products'
  );
  const sourceHeaders = ['Invoice Number', 'Date', 'Customer Name', 'Customer ID', 'Location',
    'SKU', 'Details', 'Quantity', 'Subtotal (Tax Exclusive)', 'Discount', 'Total Tax', 'Total (Tax Inclusive)'];
  const sourceMapping = detectMapping(sourceHeaders);
  const template = {
    headers: [],
    columns: { customerRef: 1, invoiceRef: 2, issueDate: 3, dueDate: 4, location: 5, productCode: 6,
      quantity: 7, unitPrice: 8, taxInclusive: 9, taxRate: 10, discountPct: 11, discountVal: 12 },
    lists: {
      location: ['الرياض', 'جدة'], paymentMethod: ['نقدي', 'آجل'],
      taxRate: ['ضريبة القيمة المضافة - 15.0%'], unitOfConv: [], taxInclusive: ['نعم', 'لا'],
    },
    missing: [], unmapped: [], hasDocDiscount: false,
  };

  const run = (records, overrides) => {
    const parsed = parseSource(records, sourceMapping);
    return runPipeline({ sales: parsed.sales, references: { customers, products }, decisions: {}, template, options: {}, overrides });
  };

  const validRecords = [
    { 'Invoice Number': 'INV-1', 'Date': '2026-01-01', 'Customer Name': 'أحمد', 'Customer ID': 'C-1',
      'Location': 'الرياض', 'SKU': 'P1', 'Quantity': 2, 'Subtotal (Tax Exclusive)': 100,
      'Discount': 0, 'Total Tax': 15, 'Total (Tax Inclusive)': 115 },
  ];

  it('ملف صحيح بالكامل: بلا تعديلات، الفاتورة تُصنَّف صحيحة (بلا خطأ فادح، وقابلة للتصدير)', () => {
    const result = run(validRecords);
    expect(result.validation.fatal).toHaveLength(0);
    // التحذير الوحيد المتوقَّع هنا تقني بحت (ملف المنتجات في هذا الاختبار بلا
    // عمود كمية متاحة) ولا علاقة له بصحة الفاتورة نفسها أو بطبقة التعديلات
    expect(result.validation.warn.every(w => w.code === 'STOCK_DATA_MISSING')).toBe(true);
    expect(result.validation.canExport).toBe(true);
  });

  it('تعديل الكمية أو السعر يحدّث الإجمالي المحسوب تلقائياً دون أي إدخال من المستخدم لإجمالي الفاتورة', () => {
    const before = run(validRecords).rows[0]._meta.expectedTotal;
    expect(before).toBe(115);
    const after = run(validRecords, { header: {}, lines: { 'INV-1': { 2: { quantity: 4 } } } }).rows[0]._meta.expectedTotal;
    // صف المصدر رقم 2 (صف 1 بيانات بعد رأس الملف) — 4 * 50 = 200 * 1.15 = 230
    expect(after).toBe(230);
  });

  it('تعديل الموقع من قائمة المواقع يصحّح فاتورة كان موقعها غير موجود بالقالب', () => {
    // موقع غير مطابق لأي قيمة في قائمة القالب يُترك فارغاً (pipeline.js) لا يُكتب
    // كما ورد، فيظهر كحقل إلزامي فارغ — وهذا ما تعالجه شاشة المطابقة بالقائمة أصلاً
    const badLocation = [{ ...validRecords[0], Location: 'موقع غير موجود' }];
    const before = run(badLocation);
    expect(before.validation.fatal.some(x => x.code === 'REQUIRED_EMPTY' && x.field === 'location')).toBe(true);
    expect(before.rows[0].location).toBe('');

    const after = run(badLocation, { header: { 'INV-1': { location: 'جدة' } } });
    expect(after.validation.fatal.some(x => x.code === 'REQUIRED_EMPTY' && x.field === 'location')).toBe(false);
    expect(after.rows[0].location).toBe('جدة');
  });

  it('تعديل العميل من قائمة العملاء يصحّح فاتورة كان عميلها غير مطابق', () => {
    const unknownCustomer = [{ ...validRecords[0], 'Customer Name': 'عميل غير معروف', 'Customer ID': '' }];
    const before = run(unknownCustomer);
    expect(before.validation.fatal.some(x => x.code === 'REQUIRED_EMPTY' && x.field === 'customerRef')).toBe(true);

    const after = run(unknownCustomer, { header: { 'INV-1': { customerRef: 'C-2' } } });
    expect(after.validation.fatal.some(x => x.code === 'REQUIRED_EMPTY' && x.field === 'customerRef')).toBe(false);
    expect(after.rows[0].customerRef).toBe('C-2');
  });

  it('خصم كقيمة فقط — سليم بلا خطأ', () => {
    const result = run(validRecords, { lines: { 'INV-1': { 2: { discountVal: 10, discountPct: null } } } });
    expect(result.validation.fatal.some(x => x.code === 'DOUBLE_DISCOUNT')).toBe(false);
  });

  it('خصم كنسبة فقط — سليم بلا خطأ', () => {
    const result = run(validRecords, { lines: { 'INV-1': { 2: { discountPct: 10, discountVal: null } } } });
    expect(result.validation.fatal.some(x => x.code === 'DOUBLE_DISCOUNT')).toBe(false);
  });

  it('وجود قيمة خصم ونسبة خصم معاً على نفس البند → خطأ فادح برسالة واضحة يمنع التصدير', () => {
    const result = run(validRecords, { lines: { 'INV-1': { 2: { discountPct: 10, discountVal: 5 } } } });
    const err = result.validation.fatal.find(x => x.code === 'DOUBLE_DISCOUNT');
    expect(err).toBeTruthy();
    expect(err.message).toBe('لا يمكن استخدام قيمة الخصم ونسبة الخصم في نفس البند. اختر إحدى الطريقتين فقط.');
    expect(result.validation.canExport).toBe(false);
  });

  it('فاتورة متعددة البنود: تعديل بند واحد لا يغيّر إجمالي البند الآخر', () => {
    const twoLines = [
      validRecords[0],
      { 'Invoice Number': 'INV-1', 'Date': '2026-01-01', 'Customer Name': 'أحمد', 'Customer ID': 'C-1',
        'Location': 'الرياض', 'SKU': 'P2', 'Quantity': 1, 'Subtotal (Tax Exclusive)': 40,
        'Discount': 0, 'Total Tax': 6, 'Total (Tax Inclusive)': 46 },
    ];
    const result = run(twoLines, { lines: { 'INV-1': { 2: { quantity: 10 } } } });
    const rows = result.rows.filter(r => r._meta.invoiceRef === 'INV-1');
    expect(rows.find(r => r.productCode === 'P1')._meta.expectedTotal).toBe(575); // 10*50*1.15
    expect(rows.find(r => r.productCode === 'P2')._meta.expectedTotal).toBe(46); // لم يتغيّر
  });

  it('إجمالي المبيعات (summary.expectedGrandTotal) يعكس التعديلات تلقائياً', () => {
    const before = run(validRecords).summary.expectedGrandTotal;
    const after = run(validRecords, { lines: { 'INV-1': { 2: { quantity: 4 } } } }).summary.expectedGrandTotal;
    expect(before).toBe(115);
    expect(after).toBe(230);
  });
});
