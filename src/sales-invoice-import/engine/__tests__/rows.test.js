import { describe, it, expect } from "vitest";
import { createRow, fillDownHeaderFields, compressHeaderFields, forwardFillInvoiceRef } from "../rows.js";
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

describe("forwardFillInvoiceRef — [إصلاح 2026-09-05] نشر مرجع الفاتورة على صفوف بنودها التي تركها ملف العميل فارغة (أسلوب الخلايا المدمجة)", () => {
  it("ينشر آخر مرجع فاتورة غير فارغ على الصفوف التالية بمرجع فارغ، حتى ظهور مرجع جديد", () => {
    const rows = [
      createRow(1, { A: 'INV-1', N: 'SKU-1' }),
      createRow(2, { A: '', N: 'SKU-2' }),
      createRow(3, { A: '', N: 'SKU-3' }),
      createRow(4, { A: 'INV-2', N: 'SKU-4' }),
      createRow(5, { A: '', N: 'SKU-5' }),
    ];
    const next = forwardFillInvoiceRef(rows);
    expect(next.map(r => r.A)).toEqual(['INV-1', 'INV-1', 'INV-1', 'INV-2', 'INV-2']);
  });

  it("لا يلمس صفًا مرجعه غير فارغ أصلًا (لا يُعيد كتابته حتى لو تطابق آخر مرجع محفوظ)", () => {
    const rows = [
      createRow(1, { A: 'INV-1' }),
      createRow(2, { A: 'INV-1' }), // مرجع صريح مكرر - يبقى كما هو، لا "نشر"
    ];
    const next = forwardFillInvoiceRef(rows);
    expect(next[1].A).toBe('INV-1');
  });

  it("صف بمرجع فارغ يسبق أي مرجع فعلي بالملف يبقى فارغًا (لا مرجع سابق لنشره)", () => {
    const rows = [
      createRow(1, { A: '', N: 'SKU-orphan' }),
      createRow(2, { A: 'INV-1', N: 'SKU-1' }),
    ];
    const next = forwardFillInvoiceRef(rows);
    expect(next[0].A).toBe('');
    expect(next[1].A).toBe('INV-1');
  });

  it("لا تُعدَّل الصفوف الأصلية (immutable)", () => {
    const rows = [
      createRow(1, { A: 'INV-1' }),
      createRow(2, { A: '' }),
    ];
    const before = JSON.stringify(rows);
    forwardFillInvoiceRef(rows);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("مخرجاته تُغذّي fillDownHeaderFields بنجاح - الصف الذي كان سيبقى بلا مجموعة الآن يُملأ بحقول الرأس أيضًا", () => {
    const rows = [
      createRow(1, { A: 'INV-1', C: 'CUST-1', D: '01/01/2026' }),
      createRow(2, { A: '', C: '', D: '' }), // مرجع فارغ - كان يبقى بلا مجموعة قبل الإصلاح
    ];
    const refFilled = forwardFillInvoiceRef(rows);
    const next = fillDownHeaderFields(refFilled);
    expect(next[1].A).toBe('INV-1');
    expect(next[1].C).toBe('CUST-1');
    expect(next[1].D).toBe('01/01/2026');
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

  it("[إضافة] projectRef (خارج COL_KEYS تمامًا) يُعامَل كحقل رأس فاتورة عادي ويُعبَّأ لبقية صفوف نفس المرجع", () => {
    const rows = [
      createRow(1, { A: 'INV-1', projectRef: 'مشروع الرياض' }),
      createRow(2, { A: 'INV-1' }), // بلا projectRef إطلاقًا
    ];
    const next = fillDownHeaderFields(rows);
    expect(next[1].projectRef).toBe('مشروع الرياض');
  });

  // [إضافة، إصلاح خطأ حقيقي 2026-09-17، بلاغ اختبار حي] راجع تعليق رأس
  // DATE_KEYS_PER_ROW_TYPE أعلاه: D (تاريخ الإصدار) يُعبَّأ بمعزل تام بين صفوف
  // "فاتورة" وصفوف "سند قبض" لنفس المرجع — لا يصح أن يفوز تاريخ أحدهما لسطور
  // فارغة من النوع الآخر لمجرد ظهوره أولًا بترتيب الملف.
  describe("[إضافة] D (تاريخ الإصدار) يُعبَّأ بمعزل بين صفوف فاتورة/سند قبض لنفس المرجع", () => {
    it("سند قبض ظاهر بالملف قبل سطور فاتورته وله تاريخ مختلف ⇒ لا يُنشَر خطأً على سطر الفاتورة الفارغ", () => {
      const rows = [
        createRow(1, { A: 'INV-1', docType: 'سند قبض', D: '15/01/2026' }), // السند أولًا بترتيب الملف
        createRow(2, { A: 'INV-1', D: '01/01/2026' }), // أول سطر فاتورة فعلي — D مُعبَّأ صراحةً
        createRow(3, { A: 'INV-1', D: '' }), // سطر فاتورة ثانٍ يعتمد على التعبئة
      ];
      const next = fillDownHeaderFields(rows);
      expect(next[2].D).toBe('01/01/2026'); // من أول سطر فاتورة، لا من السند
      expect(next[0].D).toBe('15/01/2026'); // السند يحتفظ بتاريخه الخاص، بلا تغيير
    });

    it("سطر فاتورة فارغ D يعتمد على أول سطر فاتورة فعلي حتى لو كل سندات المرجع لها تواريخ مختلفة", () => {
      const rows = [
        createRow(1, { A: 'INV-2', docType: 'سند قبض', D: '01/02/2026' }),
        createRow(2, { A: 'INV-2', docType: 'سند قبض', D: '15/02/2026' }), // دفعة جزئية ثانية بتاريخ آخر
        createRow(3, { A: 'INV-2', D: '10/01/2026' }),
        createRow(4, { A: 'INV-2', D: '' }),
      ];
      const next = fillDownHeaderFields(rows);
      expect(next[3].D).toBe('10/01/2026');
      expect(next[0].D).toBe('01/02/2026');
      expect(next[1].D).toBe('15/02/2026'); // كل سند يحتفظ بتاريخه الخاص، بلا تدخل
    });

    it("سند قبض بلا تاريخه الخاص (فارغ) ⇒ يُعبَّأ من أول سند آخر لنفس المرجع، لا من الفاتورة", () => {
      const rows = [
        createRow(1, { A: 'INV-3', D: '01/01/2026' }), // الفاتورة
        createRow(2, { A: 'INV-3', docType: 'سند قبض', D: '20/01/2026' }),
        createRow(3, { A: 'INV-3', docType: 'سند قبض', D: '' }), // سند ثانٍ بلا تاريخ صريح
      ];
      const next = fillDownHeaderFields(rows);
      expect(next[2].D).toBe('20/01/2026'); // من أول سند، لا من تاريخ الفاتورة (01/01/2026)
    });
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
