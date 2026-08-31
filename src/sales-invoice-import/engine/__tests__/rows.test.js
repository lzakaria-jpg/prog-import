import { describe, it, expect } from "vitest";
import { createRow, fillDownHeaderFields, compressHeaderFields } from "../rows.js";
import { COL_KEYS } from "../constants.js";

describe("createRow", () => {
  it("ينشئ صفًا بكل مفاتيح COL_KEYS فارغة، بالإضافة إلى id", () => {
    const r = createRow(7);
    expect(r.id).toBe(7);
    COL_KEYS.forEach(k => expect(r[k]).toBe(''));
  });
  it("prefill يُدمَج فوق الفارغ الافتراضي", () => {
    const r = createRow(1, { A: 'INV-1', P: '5' });
    expect(r.A).toBe('INV-1');
    expect(r.P).toBe('5');
    expect(r.B).toBe('');
  });
});

describe("fillDownHeaderFields — §6.13 (تعبئة الفارغ فقط من أول قيمة غير فارغة)", () => {
  it("يعبّئ حقول الرأس الفارغة في بقية صفوف نفس المرجع، ولا يلمس القيم غير الفارغة المختلفة", () => {
    const rows = [
      createRow(1, { A: 'INV-1', C: 'CUST-1', D: '01/01/2026', G: 'الرياض' }),
      createRow(2, { A: 'INV-1', C: '', D: '', G: 'جدة' }), // G مختلفة ومُعبّأة ⇒ تبقى كما هي
      createRow(3, { A: 'INV-1', C: '', D: '' }),
    ];
    const next = fillDownHeaderFields(rows);
    expect(next[1].C).toBe('CUST-1');
    expect(next[1].D).toBe('01/01/2026');
    expect(next[1].G).toBe('جدة'); // لم تُستبدل لأنها غير فارغة
    expect(next[2].C).toBe('CUST-1');
    expect(next[2].G).toBe('الرياض');
  });

  it("لا تُعدَّل الصفوف الأصلية (immutable)", () => {
    const rows = [
      createRow(1, { A: 'INV-2', C: 'CUST-9' }),
      createRow(2, { A: 'INV-2', C: '' }),
    ];
    const before = JSON.stringify(rows);
    fillDownHeaderFields(rows);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("صف بمرجع فاتورة فارغ (A) لا يُجمَّع مع أي مجموعة ولا يُعدَّل", () => {
    const rows = [createRow(1, { A: '', C: '' })];
    const next = fillDownHeaderFields(rows);
    expect(next[0].C).toBe('');
  });
});

describe("compressHeaderFields — §6.14 (تكرار متطابق من أول قيمة غير فارغة على كل الصفوف)", () => {
  it("يكتب نفس القيمة على كل صفوف المجموعة، بما فيها الصف المصدر نفسه", () => {
    const rows = [
      createRow(1, { A: 'INV-3', C: 'CUST-5', D: '01/01/2026' }),
      createRow(2, { A: 'INV-3', C: '', D: '' }),
      createRow(3, { A: 'INV-3', C: '', D: '' }),
    ];
    const out = compressHeaderFields(rows);
    out.forEach(r => {
      expect(r.C).toBe('CUST-5');
      expect(r.D).toBe('01/01/2026');
    });
  });

  it("تختلف عمدًا عن fillDownHeaderFields: تُعيد كتابة الصف الأول أيضًا من نفس المصدر (لا تأثير عملي هنا لأنه هو المصدر، لكن الآلية مختلفة)", () => {
    const rows = [
      createRow(1, { A: 'INV-4', C: 'CUST-1' }),
      createRow(2, { A: 'INV-4', C: '' }),
    ];
    const out = compressHeaderFields(rows);
    expect(out[0].C).toBe('CUST-1');
    expect(out[1].C).toBe('CUST-1');
  });

  it("لا تُعدَّل الصفوف الأصلية (immutable)", () => {
    const rows = [
      createRow(1, { A: 'INV-5', C: 'CUST-1' }),
      createRow(2, { A: 'INV-5', C: '' }),
    ];
    const before = JSON.stringify(rows);
    compressHeaderFields(rows);
    expect(JSON.stringify(rows)).toBe(before);
  });
});
