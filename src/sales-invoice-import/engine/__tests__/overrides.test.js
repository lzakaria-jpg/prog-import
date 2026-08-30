import { describe, it, expect } from 'vitest';
import { taxLabelToPct, computeRowTotal, applyRowOverrides, recomputeReconciliation, overridesIsEmpty } from '../overrides.js';
import { YES, NO } from '../constants.js';

function row(over = {}) {
  return {
    invoiceRef: 'INV-1', customerRef: 'C-1', location: 'الرياض',
    productCode: 'P1', productDesc: '', quantity: 2, unitOfConv: '',
    unitPrice: 50, taxInclusive: NO, discountPct: null, discountVal: null,
    taxRate: 'ضريبة القيمة المضافة - 15.0%',
    _meta: { sourceRow: 3, invoiceRef: 'INV-1', expectedTotal: 115, sourceTotal: 115, drift: 0 },
    ...over,
  };
}

describe('taxLabelToPct', () => {
  it('يستخرج النسبة من تسمية القالب', () => {
    expect(taxLabelToPct('ضريبة القيمة المضافة - 15.0%')).toBe(0.15);
  });
  it('صفر لتسمية بلا نسبة', () => {
    expect(taxLabelToPct('')).toBe(0);
    expect(taxLabelToPct(null)).toBe(0);
  });
});

describe('computeRowTotal', () => {
  it('غير شامل الضريبة: الإجمالي = الكمية × السعر × (1 + النسبة)', () => {
    expect(computeRowTotal(row())).toBe(115); // 2*50=100 * 1.15 = 115
  });
  it('شامل الضريبة: لا إضافة نسبة فوق الصافي', () => {
    expect(computeRowTotal(row({ taxInclusive: YES }))).toBe(100);
  });
  it('خصم بالنسبة يقلّل الوعاء قبل الضريبة', () => {
    expect(computeRowTotal(row({ discountPct: 10 }))).toBe(103.5); // 100*0.9=90 *1.15=103.5
  });
  it('خصم بالقيمة يقلّل الوعاء قبل الضريبة', () => {
    expect(computeRowTotal(row({ discountVal: 20 }))).toBe(92); // (100-20)*1.15=92
  });
  it('null عند غياب الكمية أو السعر', () => {
    expect(computeRowTotal(row({ quantity: null }))).toBeNull();
    expect(computeRowTotal(row({ unitPrice: '' }))).toBeNull();
  });
});

describe('overridesIsEmpty', () => {
  it('true لعدم وجود تعديلات، أو تعديلات فارغة', () => {
    expect(overridesIsEmpty(null)).toBe(true);
    expect(overridesIsEmpty({ header: {}, lines: {} })).toBe(true);
    expect(overridesIsEmpty({ header: { 'INV-1': {} }, lines: {} })).toBe(true);
  });
  it('false عند وجود تعديل فعلي', () => {
    expect(overridesIsEmpty({ header: { 'INV-1': { location: 'جدة' } }, lines: {} })).toBe(false);
    expect(overridesIsEmpty({ header: {}, lines: { 'INV-1': { 3: { quantity: 5 } } } })).toBe(false);
  });
});

describe('applyRowOverrides — تعديلات صفحة المطابقة والمراجعة', () => {
  it('لا يغيّر شيئاً بلا تعديلات', () => {
    const rows = [row()];
    expect(applyRowOverrides(rows, null)).toBe(rows);
  });

  it('تعديل رأس الفاتورة يُطبَّق على كل صفوفها دفعة واحدة', () => {
    const rows = [
      row({ _meta: { ...row()._meta, sourceRow: 3 } }),
      row({ productCode: 'P2', _meta: { ...row()._meta, sourceRow: 4 } }),
    ];
    const out = applyRowOverrides(rows, { header: { 'INV-1': { location: 'جدة' } } });
    expect(out[0].location).toBe('جدة');
    expect(out[1].location).toBe('جدة');
    expect(out[1].productCode).toBe('P2'); // حقول أخرى غير متأثرة
  });

  it('تعديل بند واحد لا يمسّ بند آخر بنفس الفاتورة', () => {
    const rows = [
      row({ _meta: { ...row()._meta, sourceRow: 3 } }),
      row({ productCode: 'P2', _meta: { ...row()._meta, sourceRow: 4 } }),
    ];
    const out = applyRowOverrides(rows, { lines: { 'INV-1': { 3: { quantity: 9 } } } });
    expect(out[0].quantity).toBe(9);
    expect(out[1].quantity).toBe(2); // لم يتغيّر
  });

  it('اختيار منتج من القائمة يمسح وصف المنتج الحر', () => {
    const rows = [row({ productCode: '', productDesc: 'قلم أزرق' })];
    const out = applyRowOverrides(rows, { lines: { 'INV-1': { 3: { productCode: 'P9' } } } });
    expect(out[0].productCode).toBe('P9');
    expect(out[0].productDesc).toBe('');
  });

  it('يعيد احتساب الإجمالي تلقائياً عند تعديل الكمية أو السعر — لا يُطلب من المستخدم إدخاله', () => {
    const rows = [row()];
    const out = applyRowOverrides(rows, { lines: { 'INV-1': { 3: { quantity: 4 } } } });
    expect(out[0]._meta.expectedTotal).toBe(230); // 4*50=200 *1.15=230
  });

  it('تغيير رقم الفاتورة نفسه (رأس) يُحدَّث في الصف المعروض دون كسر مفتاح البحث الثابت', () => {
    const rows = [row()];
    const out = applyRowOverrides(rows, { header: { 'INV-1': { invoiceRef: 'INV-1-FIXED' } } });
    expect(out[0].invoiceRef).toBe('INV-1-FIXED');
    expect(out[0]._meta.invoiceRef).toBe('INV-1'); // المفتاح الأصلي يبقى كما هو
    // تعديل لاحق على نفس الفاتورة يظل يُطابَق بالمفتاح الأصلي
    const out2 = applyRowOverrides(out, { header: { 'INV-1': { invoiceRef: 'INV-1-FIXED', notes: 'ملاحظة' } } });
    expect(out2[0].notes).toBe('ملاحظة');
  });

  it('خصم بالنسبة وبالقيمة معاً على نفس البند بعد التعديل — القيمتان تصلان كما هما، والتحقق هو من يمنعه لا هذه الطبقة', () => {
    const rows = [row()];
    const out = applyRowOverrides(rows, { lines: { 'INV-1': { 3: { discountPct: 10, discountVal: 5 } } } });
    expect(out[0].discountPct).toBe(10);
    expect(out[0].discountVal).toBe(5);
  });
});

describe('recomputeReconciliation', () => {
  it('يجمع الإجمالي المتوقَّع لكل فاتورة على حدة', () => {
    const rows = [
      row({ _meta: { ...row()._meta, sourceRow: 3, expectedTotal: 100 } }),
      row({ _meta: { ...row()._meta, sourceRow: 4, expectedTotal: 50 } }),
      row({ invoiceRef: 'INV-2', _meta: { invoiceRef: 'INV-2', sourceRow: 3, expectedTotal: 30 } }),
    ];
    const rec = recomputeReconciliation(rows);
    expect(rec.find(r => r.invoiceRef === 'INV-1').expectedTotal).toBe(150);
    expect(rec.find(r => r.invoiceRef === 'INV-2').expectedTotal).toBe(30);
  });
});
