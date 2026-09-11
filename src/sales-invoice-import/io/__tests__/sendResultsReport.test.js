import { describe, it, expect } from "vitest";
import { buildSendResultsReportRows } from "../sendResultsReport.js";
import { COLUMNS } from "../../engine/constants.js";
import { createRow } from "../../engine/rows.js";

const t = ({ ar }) => ar;

function makeRow(overrides) {
  return createRow(overrides.id ?? 1, { A: 'INV-1', N: 'SKU-1', ...overrides });
}

describe("buildSendResultsReportRows", () => {
  it("الترويسة = أسماء أعمدة COLUMNS بترتيبها + حالة الإرسال + سبب الفشل", () => {
    const { header } = buildSendResultsReportRows([], [], t);
    expect(header).toEqual([...COLUMNS.map((c) => c.name), 'حالة الإرسال', 'سبب الفشل']);
  });

  it("فاتورة ناجحة: حالة نجح، سبب فشل فارغ، isFailed=false", () => {
    const rows = [makeRow({ id: 1, A: 'INV-OK' })];
    const { dataRows } = buildSendResultsReportRows(rows, [{ ref: 'INV-OK', status: 'success', id: 1 }], t);
    expect(dataRows.length).toBe(1);
    expect(dataRows[0].isFailed).toBe(false);
    const statusIdx = COLUMNS.length;
    expect(dataRows[0].values[statusIdx]).toBe('نجح');
    expect(dataRows[0].values[statusIdx + 1]).toBe('');
  });

  it("فاتورة فاشلة: حالة فشل، سبب الفشل مكتوب، isFailed=true على كل أسطرها", () => {
    const rows = [makeRow({ id: 1, A: 'INV-BAD' }), makeRow({ id: 2, A: 'INV-BAD', N: 'SKU-2' })];
    const { dataRows } = buildSendResultsReportRows(rows, [{ ref: 'INV-BAD', status: 'error', reason: 'رصيد العميل غير كافٍ' }], t);
    expect(dataRows.length).toBe(2);
    dataRows.forEach((r) => {
      expect(r.isFailed).toBe(true);
      expect(r.values[COLUMNS.length]).toBe('فشل');
      expect(r.values[COLUMNS.length + 1]).toBe('رصيد العميل غير كافٍ');
    });
  });

  it("فاتورة ناجحة مع response من قيود: سبب الفشل يعرض تفاصيل الرد (رقم الفاتورة والبنود) بدل الفراغ", () => {
    const rows = [makeRow({ id: 1, A: 'INV-RESP' })];
    const response = {
      id: 555,
      status: 'Approved',
      total: 115,
      line_items: [{ product_id: 10, quantity: 2, unit_price: 50, tax_percent: 15, total: 115 }],
    };
    const { dataRows } = buildSendResultsReportRows(rows, [{ ref: 'INV-RESP', status: 'success', id: 555, response }], t);
    const detail = dataRows[0].values[COLUMNS.length + 1];
    expect(detail).toContain('555');
    expect(detail).toContain('Approved');
    expect(detail).toContain('product_id 10');
    expect(detail).toContain('tax% 15');
  });

  it("فاتورة بلا نتيجة إطلاقًا (لم تُرسَل — مُستبعدة أو أُوقف الإرسال قبلها): حالة 'لم تُرسَل' بلا حدود", () => {
    const rows = [makeRow({ id: 1, A: 'INV-SKIPPED' })];
    const { dataRows } = buildSendResultsReportRows(rows, [], t);
    expect(dataRows[0].isFailed).toBe(false);
    expect(dataRows[0].values[COLUMNS.length]).toBe('لم تُرسَل');
  });

  it("فواتير بلا مرجع (__blank__) لم تُرسَل أصلًا فتُستبعَد كليًا من التقرير", () => {
    const rows = [makeRow({ id: 1, A: '' })];
    const { dataRows } = buildSendResultsReportRows(rows, [], t);
    expect(dataRows.length).toBe(0);
  });
});
