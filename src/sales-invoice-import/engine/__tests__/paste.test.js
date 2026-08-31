import { describe, it, expect } from "vitest";
import { applyPastedGrid, isMultiCellPaste } from "../paste.js";
import { createRow } from "../rows.js";

describe("isMultiCellPaste", () => {
  it("نص يحوي تبويب أو سطر جديد ⇒ true", () => {
    expect(isMultiCellPaste('a\tb')).toBe(true);
    expect(isMultiCellPaste('a\nb')).toBe(true);
  });
  it("خلية مفردة أو نص فارغ ⇒ false", () => {
    expect(isMultiCellPaste('a')).toBe(false);
    expect(isMultiCellPaste('')).toBe(false);
  });
});

describe("applyPastedGrid", () => {
  it("يلصق شبكة 2×2 بدءًا من صف/عمود محددين", () => {
    const rows = [createRow(1), createRow(2)];
    const next = applyPastedGrid(rows, 1, 'A', 'INV-1\tINV-2\nINV-3\tINV-4', () => createRow(99));
    expect(next[0].A).toBe('INV-1');
    expect(next[0].B).toBe('INV-2');
    expect(next[1].A).toBe('INV-3');
    expect(next[1].B).toBe('INV-4');
  });

  it("يمدد الجدول عبر createRowFn عند تجاوز اللصق عدد الصفوف الحالي", () => {
    const rows = [createRow(1)];
    const next = applyPastedGrid(rows, 1, 'A', 'INV-1\nINV-2', () => createRow(2));
    expect(next.length).toBe(2);
    expect(next[1].A).toBe('INV-2');
  });

  it("يحوّل تاريخ بصيغة Y-M-D من إكسل إلى D/M/Y عند اللصق في عمود تاريخ", () => {
    const rows = [createRow(1)];
    const next = applyPastedGrid(rows, 1, 'D', '2026-08-31', () => createRow(2));
    expect(next[0].D).toBe('31/08/2026');
  });

  it("عمود يتجاوز آخر مفتاح (COL_KEYS) يُتجاهَل بلا خطأ", () => {
    const rows = [createRow(1)];
    const next = applyPastedGrid(rows, 1, 'V', 'x\ty', () => createRow(2));
    expect(next[0].V).toBe('x');
  });

  it("سطر فارغ أخير ناتج عن \\n لاحقة يُستثنى (لا يضيف صفًا زائدًا)", () => {
    const rows = [createRow(1), createRow(2)];
    const next = applyPastedGrid(rows, 1, 'A', 'INV-1\n', () => createRow(3));
    expect(next.length).toBe(2);
  });

  it("لا تُعدَّل الصفوف الأصلية (immutable)", () => {
    const rows = [createRow(1)];
    const before = JSON.stringify(rows);
    applyPastedGrid(rows, 1, 'A', 'x', () => createRow(2));
    expect(JSON.stringify(rows)).toBe(before);
  });
});
