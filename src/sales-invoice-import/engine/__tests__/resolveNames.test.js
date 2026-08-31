import { describe, it, expect } from "vitest";
import { resolveNamesToRefs } from "../resolveNames.js";
import { createRow } from "../rows.js";

function customersIndex() {
  const byRef = new Map([['C-1', { ref: 'C-1', name: 'عميل واحد' }]]);
  const byName = new Map([
    ['عميلواحد', [{ ref: 'C-1', name: 'عميل واحد' }]],
    ['عميلمكرر', [{ ref: 'C-2', name: 'عميل مكرر' }, { ref: 'C-3', name: 'عميل مكرر' }]],
  ]);
  return { byRef, byName };
}
function productsIndex() {
  const bySku = new Map([['SKU-1', { sku: 'SKU-1', name: 'منتج واحد' }]]);
  const byName = new Map([['منتجواحد', [{ sku: 'SKU-1', name: 'منتج واحد' }]]]);
  return { bySku, byName };
}

describe("resolveNamesToRefs — §6.12/§8.6", () => {
  it("اسم عميل مطابق لعميل واحد فقط ⇒ يُستبدل بالرقم المرجعي", () => {
    const rows = [createRow(1, { C: 'عميل واحد' })];
    const { rows: next, ambiguities } = resolveNamesToRefs(rows, true, customersIndex(), null);
    expect(next[0].C).toBe('C-1');
    expect(ambiguities.length).toBe(0);
  });

  it("اسم عميل مطابق لأكثر من عميل ⇒ يُسجَّل تعارض ولا يُستبدل", () => {
    const rows = [createRow(1, { C: 'عميل مكرر' })];
    const { rows: next, ambiguities } = resolveNamesToRefs(rows, true, customersIndex(), null);
    expect(next[0].C).toBe('عميل مكرر');
    expect(ambiguities.length).toBe(1);
    expect(ambiguities[0].field).toBe('C');
    expect(ambiguities[0].candidates.length).toBe(2);
  });

  it("رقم مرجعي موجود مسبقًا في byRef لا يُمس", () => {
    const rows = [createRow(1, { C: 'C-1' })];
    const { rows: next } = resolveNamesToRefs(rows, true, customersIndex(), null);
    expect(next[0].C).toBe('C-1');
  });

  it("اسم منتج مطابق لمنتج واحد ⇒ يُستبدل بالكود، ويُعبَّأ O من الاسم المكتوب إن كان فارغًا", () => {
    const rows = [createRow(1, { N: 'منتج واحد', O: '' })];
    const { rows: next } = resolveNamesToRefs(rows, true, null, productsIndex());
    expect(next[0].N).toBe('SKU-1');
    expect(next[0].O).toBe('منتج واحد');
  });

  it("collectAmbiguities=false لا يُسجّل تعارضات حتى مع تعدد المطابقات", () => {
    const rows = [createRow(1, { C: 'عميل مكرر' })];
    const { ambiguities } = resolveNamesToRefs(rows, false, customersIndex(), null);
    expect(ambiguities.length).toBe(0);
  });

  it("لا تُعدَّل الصفوف الأصلية (immutable)", () => {
    const rows = [createRow(1, { C: 'عميل واحد' })];
    const before = JSON.stringify(rows);
    resolveNamesToRefs(rows, true, customersIndex(), null);
    expect(JSON.stringify(rows)).toBe(before);
  });
});
