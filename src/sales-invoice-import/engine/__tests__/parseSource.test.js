import { describe, it, expect } from 'vitest';
import { parseSource, detectMapping, findSourceHeaderRow } from '../parseSource.js';

describe('parseSource — structured (lineType) files keep working exactly as before', () => {
  const headers = ['Invoice Number', 'Line Type', 'Date', 'Customer Name', 'Location', 'SKU', 'Details',
    'Quantity', 'Subtotal (Tax Exclusive)', 'Discount', 'Total Tax', 'Total (Tax Inclusive)'];
  const mapping = detectMapping(headers);

  it('detects the lineType column and groups by invoice number into header+line', () => {
    expect(mapping.lineType).toBe('Line Type');
    const records = [
      { 'Invoice Number': 'INV-1', 'Line Type': 'Sale', 'Date': '2026-01-01', 'Customer Name': 'أحمد', 'Location': 'الرياض',
        'Total Tax': 15, 'Total (Tax Inclusive)': 115, 'Subtotal (Tax Exclusive)': 100 },
      { 'Invoice Number': 'INV-1', 'Line Type': 'Sale Line', 'SKU': 'P1', 'Details': 'قلم', 'Quantity': 1,
        'Subtotal (Tax Exclusive)': 100, 'Discount': 0, 'Total Tax': 15, 'Total (Tax Inclusive)': 115 },
    ];
    const result = parseSource(records, mapping);
    expect(result.sales).toHaveLength(1);
    expect(result.sales[0].sourceCustomerName).toBe('أحمد');
    expect(result.sales[0].lines).toHaveLength(1);
  });

  it('Test 8 — invoice total is always the sum of its line items, never the header row\'s own total', () => {
    const records = [
      // صف الرأس يحمل قيمة إجمالي مختلفة عمداً عن مجموع البنود الفعلي
      { 'Invoice Number': 'INV-2', 'Line Type': 'Sale', 'Date': '2026-01-02', 'Customer Name': 'سارة',
        'Total (Tax Inclusive)': 100 },
      { 'Invoice Number': 'INV-2', 'Line Type': 'Sale Line', 'SKU': 'P1', 'Quantity': 1, 'Total (Tax Inclusive)': 100 },
      { 'Invoice Number': 'INV-2', 'Line Type': 'Sale Line', 'SKU': 'P2', 'Quantity': 1, 'Total (Tax Inclusive)': 200 },
      { 'Invoice Number': 'INV-2', 'Line Type': 'Sale Line', 'SKU': 'P3', 'Quantity': 1, 'Total (Tax Inclusive)': 50 },
    ];
    const result = parseSource(records, mapping);
    expect(result.sales).toHaveLength(1);
    expect(result.sales[0].lines).toHaveLength(3);
    expect(result.sales[0].sourceTotalInclusive).toBe(350);
    // التضارب بين رأس الفاتورة ومجموع بنودها تنبيه فقط، لا يمنع الاستيراد
    const mismatch = result.issues.find(i => i.code === 'HEADER_LINES_MISMATCH' && i.invoiceRef === 'INV-2');
    expect(mismatch?.severity).toBe('warn');
  });
});

describe('parseSource — flat mode (no lineType column, one row per product line)', () => {
  const headers = ['Invoice Number', 'Date', 'Customer Name', 'Customer ID', 'Location', 'Payment Method',
    'SKU', 'Details', 'Quantity', 'Subtotal (Tax Exclusive)', 'Discount', 'Total Tax', 'Total (Tax Inclusive)'];
  const mapping = detectMapping(headers);

  it('has no lineType mapped, confirming this file routes to flat mode', () => {
    expect(mapping.lineType).toBeUndefined();
  });

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
    // لا رأس منفصل في هذا النمط: الإجمالي هو مجموع البنود
    expect(inv.sourceTotalInclusive).toBe(345);
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
