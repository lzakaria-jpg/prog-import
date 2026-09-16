import { describe, it, expect } from 'vitest';
import { isReceiptRow, computeReceiptsPlan } from '../receipts.js';
import { createRow } from '../rows.js';

describe('isReceiptRow', () => {
  it('docType فارغ ⇒ ليس سند قبض (توافق تام مع الملفات القديمة بلا عمود النوع)', () => {
    expect(isReceiptRow(createRow('r1'))).toBe(false);
  });
  it('docType "فاتورة" ⇒ ليس سند قبض', () => {
    expect(isReceiptRow(createRow('r1', { docType: 'فاتورة' }))).toBe(false);
  });
  it('docType "سند قبض" ⇒ سند قبض', () => {
    expect(isReceiptRow(createRow('r1', { docType: 'سند قبض' }))).toBe(true);
  });
  it('docType "Receipt" (إنجليزي) ⇒ سند قبض أيضًا', () => {
    expect(isReceiptRow(createRow('r1', { docType: 'Receipt' }))).toBe(true);
  });
});

describe('computeReceiptsPlan', () => {
  it('يلتقط صفوف سند القبض فقط، بقيمها الأربع (rowId/ref/date/amount/accountCode)', () => {
    const invoiceRow = createRow('r1', { A: 'H001', docType: 'فاتورة', N: 'SKU-X' });
    const receiptRow = createRow('r2', { A: 'H001', docType: 'سند قبض', D: '07/01/2026', paymentAmount: '500', paymentAccountCode: '1102' });
    const plan = computeReceiptsPlan([invoiceRow, receiptRow]);
    expect(plan).toEqual([{ rowId: 'r2', ref: 'H001', date: '07/01/2026', amount: 500, accountCode: '1102' }]);
  });

  it('عدة سندات لنفس مرجع الفاتورة (دفعات جزئية) ⇒ كلها تظهر كعناصر مستقلة', () => {
    const r1 = createRow('r1', { A: 'H002', docType: 'سند قبض', D: '01/01/2026', paymentAmount: '100', paymentAccountCode: '1102' });
    const r2 = createRow('r2', { A: 'H002', docType: 'سند قبض', D: '15/01/2026', paymentAmount: '200', paymentAccountCode: '1103' });
    const plan = computeReceiptsPlan([r1, r2]);
    expect(plan).toHaveLength(2);
    expect(plan.map((p) => p.amount)).toEqual([100, 200]);
  });

  it('بلا أي صف سند قبض بالملف ⇒ مصفوفة فارغة', () => {
    const rows = [createRow('r1', { A: 'H001', docType: 'فاتورة' })];
    expect(computeReceiptsPlan(rows)).toEqual([]);
  });

  it('سند قبض بمرجع فارغ ⇒ يُستبعَد (لا مرجع فاتورة لربطه به)', () => {
    const rows = [createRow('r1', { A: '', docType: 'سند قبض', paymentAmount: '500', paymentAccountCode: '1102' })];
    expect(computeReceiptsPlan(rows)).toEqual([]);
  });
});
