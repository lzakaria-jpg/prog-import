import { describe, it, expect } from "vitest";
import { buildEntityCreateResultsReportRows } from "../entityCreateResultsReport.js";

const t = ({ ar }) => ar;

describe("buildEntityCreateResultsReportRows", () => {
  it("الترويسة = النوع/الاسم-المرجع/الحالة/المعرّف/سبب الفشل", () => {
    const { header } = buildEntityCreateResultsReportRows([], t);
    expect(header).toEqual(['النوع', 'الاسم/المرجع', 'الحالة', 'المعرّف بقيود', 'سبب الفشل']);
  });

  it("عنصر ناجح بـkind معروف ⇒ تُترجَم إلى تسمية عربية، سبب الفشل فارغ", () => {
    const { dataRows } = buildEntityCreateResultsReportRows([{ kind: 'customer', ref: 'عميل جديد', status: 'success', id: 55 }], t);
    expect(dataRows.length).toBe(1);
    expect(dataRows[0].isFailed).toBe(false);
    expect(dataRows[0].values).toEqual(['عميل', 'عميل جديد', 'نجح', 55, '']);
  });

  it("عنصر فاشل ⇒ isFailed=true، سبب الفشل مكتوب، بلا معرّف", () => {
    const { dataRows } = buildEntityCreateResultsReportRows([{ kind: 'product', ref: 'SKU-9', status: 'error', reason: 'اسم مفقود' }], t);
    expect(dataRows[0].isFailed).toBe(true);
    expect(dataRows[0].values).toEqual(['منتج', 'SKU-9', 'فشل', '', 'اسم مفقود']);
  });

  it("كل أنواع kind الخمسة تُترجَم بشكل صحيح", () => {
    const entries = ['customer', 'category', 'unit', 'product', 'location'].map((kind) => ({ kind, ref: 'x', status: 'success', id: 1 }));
    const { dataRows } = buildEntityCreateResultsReportRows(entries, t);
    expect(dataRows.map((r) => r.values[0])).toEqual(['عميل', 'فئة منتج', 'وحدة منتج', 'منتج', 'موقع']);
  });

  it("entries بلا kind (تعديلات مخزون) ⇒ النوع الافتراضي 'تعديل مخزون'", () => {
    const { dataRows } = buildEntityCreateResultsReportRows([{ ref: 'inventory 1', status: 'success', id: 9 }], t);
    expect(dataRows[0].values[0]).toBe('تعديل مخزون');
  });
});
