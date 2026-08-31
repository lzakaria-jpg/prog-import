import { describe, it, expect } from "vitest";
import { runValidation, findInvoicesMissingLocation, getValidOnlyRows } from "../validation.js";
import { createRow } from "../rows.js";

function validRow(overrides) {
  return createRow(overrides.id ?? 1, {
    A: 'INV-1', C: 'C-1', D: '01/01/2026', G: 'الرياض',
    N: 'SKU-1', P: '2', R: '50', S: 'نعم', V: '15%',
    ...overrides,
  });
}

describe("runValidation — الحقول الإلزامية على مستوى البند", () => {
  it("صف كامل صالح لا يولّد أي خطأ حاجب", () => {
    const { list } = runValidation([validRow({})]);
    expect(list.filter(i => i.sev === 'err')).toEqual([]);
  });
  it("N/P/R/S/V فارغة كل واحدة تولّد خطأ مستقل على نفس الحقل", () => {
    const row = validRow({ N: '', P: '', R: '', S: '', V: '' });
    const { byRow } = runValidation([row]);
    ['N', 'P', 'R', 'S', 'V'].forEach(k => {
      expect(byRow[row.id][k].some(i => i.sev === 'err')).toBe(true);
    });
  });
  it("مرجع الفاتورة (A) فارغ ⇒ خطأ حاجب مستقل", () => {
    const row = validRow({ A: '' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].A.some(i => i.sev === 'err')).toBe(true);
  });
});

describe("runValidation — قواعد الأرقام", () => {
  it("الكمية صفر أو سالبة ⇒ خطأ", () => {
    const row = validRow({ P: '0' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].P[0].sev).toBe('err');
  });
  it("سعر الوحدة سالب ⇒ خطأ", () => {
    const row = validRow({ R: '-5' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].R[0].sev).toBe('err');
  });
  it("نسبة الخصم خارج 0-100 ⇒ خطأ", () => {
    const row = validRow({ T: '150' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].T.some(i => i.sev === 'err')).toBe(true);
  });
  it("تعبئة T وU معًا لنفس البند ⇒ خطآن على T وU", () => {
    const row = validRow({ T: '10', U: '5' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].T.some(i => i.sev === 'err')).toBe(true);
    expect(byRow[row.id].U.some(i => i.sev === 'err')).toBe(true);
  });
  it("S خارج نعم/لا ⇒ خطأ", () => {
    const row = validRow({ S: 'maybe' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].S.some(i => i.sev === 'err')).toBe(true);
  });
});

describe("runValidation — التواريخ", () => {
  it("تاريخ غير قابل للقراءة ⇒ خطأ حاجب", () => {
    const row = validRow({ D: 'مرحبا' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].D.some(i => i.sev === 'err')).toBe(true);
  });
  it("تاريخ صحيح لكنه سيُعاد تنسيقه ⇒ تحذير فقط لا خطأ", () => {
    const row = validRow({ D: '2026-01-01' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].D.every(i => i.sev === 'warn')).toBe(true);
  });
});

describe("runValidation — القوائم المنسدلة مقابل القالب", () => {
  const template = { loaded: true, dropdowns: { G: ['الرياض'], V: ['15%'], H: ['نقدي'] } };
  it("موقع غير موجود بالقالب ⇒ خطأ", () => {
    const row = validRow({ G: 'مدينة غير معروفة' });
    const { byRow } = runValidation([row], { template });
    expect(byRow[row.id].G[0].sev).toBe('err');
  });
  it("فئة ضريبية غير مطابقة ⇒ خطأ", () => {
    const row = validRow({ V: '20%' });
    const { byRow } = runValidation([row], { template });
    expect(byRow[row.id].V[0].sev).toBe('err');
  });
  it("طريقة دفع غير مطابقة ⇒ تحذير فقط", () => {
    const row = validRow({ H: 'شيك' });
    const { byRow } = runValidation([row], { template });
    expect(byRow[row.id].H[0].sev).toBe('warn');
  });
});

describe("runValidation — المنتج والعميل", () => {
  it("كود منتج غير موجود بتقرير المنتجات ⇒ خطأ", () => {
    const row = validRow({ N: 'SKU-X' });
    const products = { loaded: true, bySku: new Map() };
    const { byRow } = runValidation([row], { products });
    expect(byRow[row.id].N[0].sev).toBe('err');
  });
  it("منتج غير قابل للبيع ⇒ خطأ", () => {
    const row = validRow({ N: 'SKU-1' });
    const products = { loaded: true, bySku: new Map([['SKU-1', { sellable: false, name: 'منتج' }]]) };
    const { byRow } = runValidation([row], { products });
    expect(byRow[row.id].N[0].sev).toBe('err');
  });
  it("رقم مرجعي عميل غير موجود ⇒ خطأ 'غير موجود'", () => {
    const row = validRow({ C: 'C-X' });
    const customers = { loaded: true, byRef: new Map(), byName: new Map() };
    const { byRow } = runValidation([row], { customers });
    expect(byRow[row.id].C[0].msg).toContain('غير موجود');
  });
  it("اسم عميل مكرر (بلا رقم مرجعي مطابق) ⇒ رسالة تسرد المرشحين", () => {
    const row = validRow({ C: 'اسم مكرر' });
    const customers = {
      loaded: true, byRef: new Map(),
      byName: new Map([['اسممكرر', [{ ref: 'C-1' }, { ref: 'C-2' }]]]),
    };
    const { byRow } = runValidation([row], { customers });
    expect(byRow[row.id].C[0].msg).toContain('مكرر');
  });
  it("عميل غير نشط ⇒ تحذير فقط", () => {
    const row = validRow({ C: 'C-1' });
    const customers = { loaded: true, byRef: new Map([['C-1', { active: false, name: 'عميل' }]]), byName: new Map() };
    const { byRow } = runValidation([row], { customers });
    expect(byRow[row.id].C[0].sev).toBe('warn');
  });
});

describe("runValidation — تطابق/تفريغ بيانات الرأس داخل مجموعة المرجع", () => {
  it("قيمتان مختلفتان غير فارغتين لحقل رأس بنفس المرجع ⇒ خطأ على الصف الثاني", () => {
    const rows = [
      validRow({ id: 1, G: 'الرياض' }),
      validRow({ id: 2, G: 'جدة' }),
    ];
    const { byRow } = runValidation(rows);
    expect(byRow[2].G.some(i => i.sev === 'err')).toBe(true);
    expect(byRow[1]?.G).toBeUndefined();
  });
  it("الحقول الإلزامية على مستوى الفاتورة (C/D/G) تُفحص من أول قيمة غير فارغة بالمجموعة كاملة", () => {
    const rows = [
      validRow({ id: 1, C: '' }),
      validRow({ id: 2, C: 'C-9' }),
    ];
    const { byRow } = runValidation(rows);
    // الصف الأول C فارغة لكن مغطاة على مستوى البند (إلزامي) — لا خطأ إضافي على مستوى المجموعة لأن C موجودة بالمجموعة
    expect(byRow[1]?.C?.some(i => i.msg.includes('لم يُعبَّأ في أي سطر'))).toBeFalsy();
  });
  it("فاتورة مفردة (سطر واحد) بمرجع فارغ تحتاج فحص C/D/G مباشرة", () => {
    const row = validRow({ A: '', C: '', D: '', G: '' });
    const { byRow } = runValidation([row]);
    ['C', 'D', 'G'].forEach(k => expect(byRow[row.id][k].some(i => i.sev === 'err')).toBe(true));
  });
});

describe("runValidation — الخصم أكبر من قيمة البند/الفاتورة", () => {
  it("قيمة خصم البند (U) أعلى من الإجمالي (P×R) ⇒ خطأ", () => {
    const row = validRow({ P: '2', R: '50', U: '200' }); // gross=100
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].U[0].sev).toBe('err');
  });
  it("خصم مستند (K) أعلى من إجمالي الفاتورة بعد خصومات البنود ⇒ خطأ", () => {
    const row = validRow({ P: '2', R: '50', K: '500' }); // net=100
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].K[0].sev).toBe('err');
  });
  it("خصم مستند مساوٍ للإجمالي (±0.005) ⇒ لا خطأ", () => {
    const row = validRow({ P: '2', R: '50', K: '100' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id]?.K).toBeUndefined();
  });
});

describe("runValidation — عمود إلزامي غائب من القالب", () => {
  it("يمنع التصدير برسالة موحدة على الصف الأول فقط", () => {
    const row = validRow({});
    const template = { loaded: true, dropdowns: { G: ['الرياض'], V: ['15%'], H: [] }, missingFields: ['N'] };
    const { byRow } = runValidation([row], { template });
    expect(byRow[row.id].N.some(i => i.msg.includes('غير موجود في القالب المرفوع'))).toBe(true);
  });
});

describe("findInvoicesMissingLocation", () => {
  it("يرصد الفواتير التي كل صفوفها بلا موقع (G)", () => {
    const rows = [validRow({ id: 1, A: 'INV-A', G: '' }), validRow({ id: 2, A: 'INV-B', G: 'الرياض' })];
    const missing = findInvoicesMissingLocation(rows);
    expect(missing.length).toBe(1);
    expect(missing[0].key).toBe('INV-A');
  });
});

describe("getValidOnlyRows — معياره الفاتورة كاملة لا السطر المفرد", () => {
  it("فاتورة بها سطر واحد به خطأ حاجب تُستثنى كاملة", () => {
    const rows = [validRow({ id: 1, A: 'INV-OK' }), validRow({ id: 2, A: 'INV-BAD', N: '' })];
    const { byRow } = runValidation(rows);
    const validOnly = getValidOnlyRows(rows, byRow);
    expect(validOnly.map(r => r.id)).toEqual([1]);
  });
});
