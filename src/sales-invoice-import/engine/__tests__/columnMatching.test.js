import { describe, it, expect } from "vitest";
import { guessColumnsBatch, detectTemplateLayout, similarity } from "../columnMatching.js";

describe("detectTemplateLayout — مثال §6.1 (تخطيط 19 عمودًا)", () => {
  it("يكتشف موضع كل حقل ويترك K/L/M فارغة (غير موجودة بهذا القالب)", () => {
    const rowsByNum = {
      2: {
        A:'مرجع الفاتورة', B:'الوصف', C:'الرقم المرجعي للعميل', D:'تاريخ الإصدار',
        E:'تاريخ الاستحقاق', F:'تاريخ التوريد', G:'الموقع', H:'طريقة الدفع',
        I:'الشروط والأحكام', J:'الملاحظات',
        K:'الرقم التسلسلي/الباركود للمنتج *', L:'وصف المنتج',
        M:'الكمية (بالوحدة الأساسية) *', N:'وحدة التحويل', O:'سعر الوحدة *',
        P:'شامل الضريبية؟ *', Q:'نسبة الخصم', R:'قيمة الخصم', S:'الضريبة% *',
      },
    };
    const layout = detectTemplateLayout(rowsByNum);
    expect(layout).not.toBeNull();
    expect(layout.headerRow).toBe(2);
    expect(layout.colMap.N).toBe('K'); // كود المنتج يُكتب بالعمود K لا N
    expect(layout.colMap.O).toBe('L');
    expect(layout.colMap.P).toBe('M');
    expect(layout.colMap.V).toBe('S');
    expect(layout.colMap.A).toBe('A');
  });

  it("يعيد null إذا قلّت المطابقات عن 8", () => {
    const rowsByNum = { 2: { A:'شيء عشوائي', B:'آخر' } };
    expect(detectTemplateLayout(rowsByNum)).toBeNull();
  });
});

describe("guessColumnsBatch — 4 مراحل §6.2", () => {
  it("المرحلة 1: تطابق تام", () => {
    const r = guessColumnsBatch([{key:'A', kw:['مرجع الفاتورة']}], ['مرجع الفاتورة','شيء آخر']);
    expect(r.A).toBe('مرجع الفاتورة');
  });

  it("المرحلة 3: تداخل الكلمات — 'باركود المنتج' يطابق 'الرقم التسلسلي/الباركود للمنتج'", () => {
    const r = guessColumnsBatch([{key:'N', kw:['باركود المنتج']}], ['الرقم التسلسلي/الباركود للمنتج']);
    expect(r.N).toBe('الرقم التسلسلي/الباركود للمنتج');
  });

  it("المرحلة 4: تحمّل الأخطاء الإملائية — 'Ptoducts' يطابق 'products' (تشابه 0.875 ≥ 0.82)", () => {
    expect(similarity('ptoducts','products')).toBeCloseTo(0.875, 3);
    const r = guessColumnsBatch([{key:'O', kw:['products']}], ['Ptoducts']);
    expect(r.O).toBe('Ptoducts');
  });

  it("reject يمنع 'Total tax' من مطابقة حقل إجمالي البند رغم احتواء كلمة total", () => {
    const r = guessColumnsBatch([{key:'_lineTotal', kw:['total'], reject: h=>/tax/i.test(h)}], ['Total tax']);
    expect(r._lineTotal).toBe('');
  });

  it("لا تطابق كلمة مفردة من عبارة متعددة (discount وحدها من document discount)", () => {
    const r = guessColumnsBatch([{key:'U', kw:['document discount']}], ['discount']);
    expect(r.U).toBe('');
  });
});
