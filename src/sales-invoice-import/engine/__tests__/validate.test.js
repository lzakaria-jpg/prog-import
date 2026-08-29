import { describe, it, expect } from 'vitest';
import * as validateModule from '../validate.js';
import { validateAll } from '../validate.js';

const template = {
  columns: { customerRef: 1, invoiceRef: 2, issueDate: 3, dueDate: 4, location: 5, productCode: 6,
    quantity: 7, unitPrice: 8, taxInclusive: 9, taxRate: 10 },
  lists: {
    location: ['الرياض'], paymentMethod: ['نقدي'],
    taxRate: ['ضريبة القيمة المضافة - 15.0%'], unitOfConv: [], taxInclusive: ['نعم', 'لا'],
  },
  missing: [], unmapped: [], hasDocDiscount: false,
};

const opts = { repeatInvoiceData: true };

function makeRow(overrides = {}) {
  return {
    invoiceRef: 'INV-1', customerRef: 'C-1', issueDate: { y: 2026, m: 1, d: 1 }, dueDate: { y: 2026, m: 1, d: 1 },
    location: 'الرياض', productCode: 'P1', productDesc: '', quantity: 1, unitPrice: 10,
    taxInclusive: 'نعم', taxRate: 'ضريبة القيمة المضافة - 15.0%', discountPct: null, discountVal: null,
    unitOfConv: '', _meta: { sourceRow: 2 },
    ...overrides,
  };
}

describe('validateAll — source-total comparison is completely gone', () => {
  it('does not export validateReconciliation anymore, and TOTAL_DRIFT never appears regardless of any drift-like input', () => {
    expect(validateModule.validateReconciliation).toBeUndefined();

    // حتى لو مُرِّر جسم يحاكي بنية "reconciliation" القديمة، لا مفتاح لها في التوقيع الجديد
    const result = validateAll({ rows: [makeRow()], template, opts, reconciliation: [{ invoiceRef: 'INV-1', sourceTotal: 9.81, expectedTotal: 7.9, drift: 1.91 }] });
    expect(result.issues.some(i => i.code === 'TOTAL_DRIFT')).toBe(false);
    expect(result.warn.some(i => i.code === 'TOTAL_DRIFT')).toBe(false);
  });

  it('Test 1 — a large source-vs-lines discrepancy never blocks or flags the invoice', () => {
    // الصف نفسه سليم من زاوية طبقات التحقق الأخرى؛ لا علاقة لصحته هنا بأي "إجمالي مصدر"
    const result = validateAll({ rows: [makeRow()], template, opts });
    expect(result.canExport).toBe(true);
    expect(result.issues.some(i => i.code === 'TOTAL_DRIFT')).toBe(false);
  });
});
