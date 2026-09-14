import { describe, it, expect } from 'vitest';
import { buildSendResultsReportRows } from '../billsSendResultsReport.js';

const t = ({ ar }) => ar;

function makeGroup(ref, overrides) {
  return { ref, rows: [{ vendorRef: 'V1', issueDate: new Date(Date.UTC(2023, 11, 1)), ...overrides }], bad: false };
}

describe('buildSendResultsReportRows (bills)', () => {
  it('الترويسة = مرجع الفاتورة/المورد/التاريخ/حالة الإرسال/التفاصيل', () => {
    const { header } = buildSendResultsReportRows([], [], t);
    expect(header).toEqual(['مرجع الفاتورة', 'المورد', 'التاريخ', 'حالة الإرسال', 'التفاصيل']);
  });

  it('فاتورة ناجحة: حالة نجح، التفاصيل فارغة بلا response، isFailed=false', () => {
    const { dataRows } = buildSendResultsReportRows([makeGroup('BILL-1')], [{ ref: 'BILL-1', status: 'success', id: 5 }], t);
    expect(dataRows).toHaveLength(1);
    expect(dataRows[0].isFailed).toBe(false);
    expect(dataRows[0].values[3]).toBe('نجح');
    expect(dataRows[0].values[4]).toBe('');
  });

  it('فاتورة ناجحة مع response من قيود: التفاصيل تعرض رقم الفاتورة والإجمالي', () => {
    const response = { id: 555, status: 'Draft', total: 977.5 };
    const { dataRows } = buildSendResultsReportRows([makeGroup('BILL-1')], [{ ref: 'BILL-1', status: 'success', id: 555, response }], t);
    expect(dataRows[0].values[4]).toContain('555');
    expect(dataRows[0].values[4]).toContain('977.5');
  });

  it('فاتورة فاشلة: حالة فشل، التفاصيل = سبب الفشل، isFailed=true', () => {
    const { dataRows } = buildSendResultsReportRows([makeGroup('BILL-2')], [{ ref: 'BILL-2', status: 'error', reason: 'تعذّر تحديد معرّف المورد' }], t);
    expect(dataRows[0].isFailed).toBe(true);
    expect(dataRows[0].values[3]).toBe('فشل');
    expect(dataRows[0].values[4]).toBe('تعذّر تحديد معرّف المورد');
  });

  it("فاتورة بلا نتيجة إطلاقًا (لم تُرسَل): حالة 'لم تُرسَل' بلا حدود", () => {
    const { dataRows } = buildSendResultsReportRows([makeGroup('BILL-3')], [], t);
    expect(dataRows[0].isFailed).toBe(false);
    expect(dataRows[0].values[3]).toBe('لم تُرسَل');
  });
});
