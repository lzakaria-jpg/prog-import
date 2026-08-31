import { describe, it, expect } from "vitest";
import { groupRowsByInvoiceRef } from "../grouping.js";
import { createRow } from "../rows.js";

describe("groupRowsByInvoiceRef — §8.3 (مرجع فارغ = مجموعة مستقلة)", () => {
  it("يجمع الصفوف بنفس مرجع الفاتورة (A) معًا بالترتيب", () => {
    const rows = [
      createRow(1, { A: 'INV-1' }),
      createRow(2, { A: 'INV-2' }),
      createRow(3, { A: 'INV-1' }),
    ];
    const groups = groupRowsByInvoiceRef(rows);
    expect(groups.size).toBe(2);
    expect(groups.get('INV-1').map(r => r.id)).toEqual([1, 3]);
    expect(groups.get('INV-2').map(r => r.id)).toEqual([2]);
  });

  it("صف بمرجع فارغ يُعامَل كمجموعة مستقلة بمفتاح __blank__{rowId}", () => {
    const rows = [createRow(5, { A: '' }), createRow(6, { A: '' })];
    const groups = groupRowsByInvoiceRef(rows);
    expect(groups.size).toBe(2);
    expect(groups.has('__blank__5')).toBe(true);
    expect(groups.has('__blank__6')).toBe(true);
  });
});
