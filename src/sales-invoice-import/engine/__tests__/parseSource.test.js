import { describe, it, expect } from 'vitest';
import { parseSource, detectMapping, findSourceHeaderRow } from '../parseSource.js';

describe('parseSource — every row is a real invoice line item, grouped by invoice number only', () => {
  const headers = ['Invoice Number', 'Date', 'Customer Name', 'Customer ID', 'Location', 'Payment Method',
    'SKU', 'Details', 'Quantity', 'Subtotal (Tax Exclusive)', 'Discount', 'Total Tax', 'Total (Tax Inclusive)'];
  const mapping = detectMapping(headers);

  it('groups rows sharing the same invoice reference into one invoice, reading header fields from the rows', () => {
    const records = [
      { 'Invoice Number': 'INV-9', 'Date': '2026-02-01', 'Customer Name': 'شركة الاختبار', 'Customer ID': 'C-100',
        'Location': 'الرياض', 'Payment Method': 'Cash',
        'SKU': 'P1', 'Details': 'قلم', 'Quantity': 2, 'Subtotal (Tax Exclusive)': 100, 'Discount': 0,
        'Total Tax': 15, 'Total (Tax Inclusive)': 115 },
      { 'Invoice Number': 'INV-9', 'Date': '2026-02-01', 'Customer Name': 'شركة الاختبار', 'Customer ID': 'C-100',
        'Location': 'الرياض', 'Payment Method': 'Cash',
        'SKU': 'P2', 'Details': 'كرسي', 'Quantity': 1, 'Subtotal (Tax Exclusive)': 200, 'Discount': 0,
        'Total Tax': 30, 'Total (Tax Inclusive)': 230 },
    ];
    const result = parseSource(records, mapping);
    expect(result.sales).toHaveLength(1);
    const inv = result.sales[0];
    expect(inv.lines).toHaveLength(2);
    expect(inv.sourceCustomerName).toBe('شركة الاختبار');
    expect(inv.sourceCustomerRef).toBe('C-100');
    expect(inv.sourceLocation).toBe('الرياض');
    // إجمالي الفاتورة = مجموع كل بنودها دائماً
    expect(inv.sourceTotalInclusive).toBe(345);
  });

  it('Test 8 — invoice total is always the sum of its line items', () => {
    const records = [
      { 'Invoice Number': 'INV-2', 'Date': '2026-01-02', 'Customer Name': 'سارة', 'SKU': 'P1', 'Quantity': 1, 'Total (Tax Inclusive)': 100 },
      { 'Invoice Number': 'INV-2', 'Date': '2026-01-02', 'Customer Name': 'سارة', 'SKU': 'P2', 'Quantity': 1, 'Total (Tax Inclusive)': 200 },
      { 'Invoice Number': 'INV-2', 'Date': '2026-01-02', 'Customer Name': 'سارة', 'SKU': 'P3', 'Quantity': 1, 'Total (Tax Inclusive)': 50 },
    ];
    const result = parseSource(records, mapping);
    expect(result.sales).toHaveLength(1);
    expect(result.sales[0].lines).toHaveLength(3);
    expect(result.sales[0].sourceTotalInclusive).toBe(350);
  });

  it('fatally flags an invoice whose rows disagree on location instead of picking one silently', () => {
    const records = [
      { 'Invoice Number': 'INV-8', 'Date': '2026-02-01', 'Customer Name': 'عميل', 'Location': 'الرياض',
        'SKU': 'P1', 'Quantity': 1, 'Subtotal (Tax Exclusive)': 100, 'Total Tax': 15, 'Total (Tax Inclusive)': 115 },
      { 'Invoice Number': 'INV-8', 'Date': '2026-02-01', 'Customer Name': 'عميل', 'Location': 'جدة',
        'SKU': 'P2', 'Quantity': 1, 'Subtotal (Tax Exclusive)': 100, 'Total Tax': 15, 'Total (Tax Inclusive)': 115 },
    ];
    const result = parseSource(records, mapping);
    expect(result.issues.some(i => i.code === 'INVOICE_LOCATION_CONFLICT' && i.severity === 'fatal')).toBe(true);
  });

  it('never treats any row as a non-item "header" row — a row marked "Sale" in an arbitrary column is still a real line', () => {
    // إعادة إنتاج بيانات الفاتورة الحقيقية S20260819-211: عمود عشوائي («Row Kind»)
    // بقيم Sale/Sale Line لم يعد له أي أثر إطلاقاً — لا يُبحث عنه ولا يُطابَق ولا
    // يُخمَّن، وكل الصفوف الأربعة — بما فيها صف «Sale» — بنود حقيقية تُجمَع كلها
    const rowKindHeaders = [...headers, 'Row Kind'];
    const rowKindMapping = detectMapping(rowKindHeaders);
    expect(rowKindMapping.lineType).toBeUndefined(); // لا وجود لهذا الحقل إطلاقاً بعد الآن

    const records = [
      { 'Invoice Number': 'S-211', 'Row Kind': 'Sale', 'Customer Name': 'Haytham', 'SKU': 'لؤي',
        'Quantity': 1, 'Subtotal (Tax Exclusive)': 1.5, 'Total Tax': 0.225, 'Total (Tax Inclusive)': 1.725 },
      { 'Invoice Number': 'S-211', 'Row Kind': 'Sale Line', 'SKU': 'P2',
        'Quantity': 1.2, 'Subtotal (Tax Exclusive)': 1.92, 'Total Tax': 0.288, 'Total (Tax Inclusive)': 1.888 },
      { 'Invoice Number': 'S-211', 'Row Kind': 'Sale Line', 'SKU': 'P3',
        'Quantity': 1.4, 'Subtotal (Tax Exclusive)': 2.38, 'Total Tax': 0.357, 'Total (Tax Inclusive)': 2.057 },
      { 'Invoice Number': 'S-211', 'Row Kind': 'Sale Line', 'SKU': 'P4',
        'Quantity': 1.6, 'Subtotal (Tax Exclusive)': 2.88, 'Total Tax': 0.432, 'Total (Tax Inclusive)': 2.232 },
    ];
    const result = parseSource(records, rowKindMapping);
    expect(result.sales).toHaveLength(1);
    expect(result.sales[0].lines).toHaveLength(4); // كل الصفوف الأربعة، بلا استثناء
    expect(result.sales[0].sourceTotalInclusive).toBe(7.9); // 1.725+1.888+2.057+2.232
  });
});

describe('detectMapping — no "line type" field exists', () => {
  it('never maps a lineType key, whatever the column is named or contains', () => {
    const headers = ['Invoice Number', 'Line Type', 'Sale Type', 'Date', 'Customer Name', 'Quantity', 'Total (Tax Inclusive)'];
    const mapping = detectMapping(headers);
    expect(mapping.lineType).toBeUndefined();
  });
});

describe('findSourceHeaderRow', () => {
  it('locates the invoice file header row past an unrelated title row', () => {
    const rows = [
      ['كشف فواتير شهر يناير'],
      ['Invoice Number', 'Date', 'Customer Name', 'Quantity', 'Total (Tax Inclusive)'],
      ['INV-1', '2026-01-01', 'أحمد', '1', '115'],
    ];
    const found = findSourceHeaderRow(rows);
    expect(found.rowIndex).toBe(1);
  });
});
