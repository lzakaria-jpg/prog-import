import { describe, it, expect } from "vitest";
import { checkStockSequential } from "../stockSimulation.js";
import { createRow } from "../rows.js";

function stockIndex(map) {
  return { byKey: new Map(Object.entries(map)) };
}
function productsIndex(map) {
  return { bySku: new Map(Object.entries(map)) };
}

describe("checkStockSequential — §6.15 (محاكاة استهلاك تسلسلية تعتمد ترتيب الصفوف)", () => {
  it("مثال 1: فاتورتان متتاليتان لنفس المنتج/الموقع تستهلكان من نفس المخزون تراكميًا — الثانية تكفي", () => {
    const rows = [
      createRow(1, { N: 'SKU-1', G: 'الرياض', P: '6' }),
      createRow(2, { N: 'SKU-1', G: 'الرياض', P: '4' }),
    ];
    const issues = checkStockSequential(rows, { stockIndex: stockIndex({ 'SKU-1||الرياض': 10 }) });
    expect(issues.length).toBe(0);
  });

  it("مثال 2: الصف الثاني يتجاوز المتبقي بعد استهلاك الأول ⇒ خطأ حاجب على الثاني فقط", () => {
    const rows = [
      createRow(1, { N: 'SKU-1', G: 'الرياض', P: '8' }),
      createRow(2, { N: 'SKU-1', G: 'الرياض', P: '5' }),
    ];
    const issues = checkStockSequential(rows, { stockIndex: stockIndex({ 'SKU-1||الرياض': 10 }) });
    expect(issues.length).toBe(1);
    expect(issues[0].rowId).toBe(2);
    expect(issues[0].sev).toBe('err');
    expect(issues[0].msg).toContain('المتبقي المتوقع بعد الفواتير السابقة في هذا الملف: 2');
  });

  it("عكس ترتيب الصفوف يغيّر النتيجة (الاعتماد الحقيقي على ترتيب rows، ممنوع الفرز)", () => {
    const rowsAsc = [
      createRow(1, { N: 'SKU-1', G: 'الرياض', P: '8' }),
      createRow(2, { N: 'SKU-1', G: 'الرياض', P: '5' }),
    ];
    const rowsDesc = [
      createRow(2, { N: 'SKU-1', G: 'الرياض', P: '5' }),
      createRow(1, { N: 'SKU-1', G: 'الرياض', P: '8' }),
    ];
    const idx = () => stockIndex({ 'SKU-1||الرياض': 10 });
    const issuesAsc = checkStockSequential(rowsAsc, { stockIndex: idx() });
    const issuesDesc = checkStockSequential(rowsDesc, { stockIndex: idx() });
    expect(issuesAsc[0].rowId).toBe(2);
    expect(issuesDesc.length).toBe(1);
    expect(issuesDesc[0].rowId).toBe(1); // نفس الكمية الكبيرة لكن الآن هي الثانية في الترتيب
  });

  it("منتج/موقع غير موجود في تقرير المخزون ⇒ تحذير 'لا تتوفر بيانات كمية' لا خطأ حاجب", () => {
    const rows = [createRow(1, { N: 'SKU-9', G: 'جدة', P: '1' })];
    const issues = checkStockSequential(rows, { stockIndex: stockIndex({}) });
    expect(issues.length).toBe(1);
    expect(issues[0].sev).toBe('warn');
  });

  it("منتج 'غير مخزَّن' (stocked===false) لا يُفحص له مخزون مطلقًا", () => {
    const rows = [createRow(1, { N: 'SKU-SVC', G: 'الرياض', P: '999' })];
    const issues = checkStockSequential(rows, {
      productsIndex: productsIndex({ 'SKU-SVC': { stocked: false } }),
      stockIndex: stockIndex({}),
    });
    expect(issues.length).toBe(0);
  });

  it("بلا stockIndex أصلاً ⇒ لا فحص ولا أخطاء", () => {
    const rows = [createRow(1, { N: 'SKU-1', G: 'الرياض', P: '5' })];
    expect(checkStockSequential(rows, {})).toEqual([]);
  });

  it("صف بلا منتج أو موقع أو كمية غير صالحة يُتجاهَل بلا فحص", () => {
    const rows = [
      createRow(1, { N: '', G: 'الرياض', P: '5' }),
      createRow(2, { N: 'SKU-1', G: '', P: '5' }),
      createRow(3, { N: 'SKU-1', G: 'الرياض', P: '0' }),
    ];
    const issues = checkStockSequential(rows, { stockIndex: stockIndex({ 'SKU-1||الرياض': 1 }) });
    expect(issues.length).toBe(0);
  });
});
