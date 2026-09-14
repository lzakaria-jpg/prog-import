import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildBillIndexes, buildBillPayload, pushBillsToQoyod } from '../billsPush.js';
import { norm } from '../text.js';

afterEach(() => { vi.restoreAllMocks(); });

function isoDate(y, m, d) { return new Date(Date.UTC(y, m - 1, d)); }

/** صف واحد بكل الحقول (رأس + بند) — نفس شكل row الحقيقي من clientFile.js buildRows */
function makeRow(overrides) {
  return {
    vendorRef: 'V1', desc: '', notes: '', terms: '',
    issueDate: isoDate(2023, 12, 1), dueDate: isoDate(2023, 12, 30),
    location: 'الرئيسي', docDiscVal: null, docDiscAcc: '', docDiscTax: '',
    prodSku: 'SKU1', prodDesc: '', qty: 5, price: 170, taxIncl: false,
    discPct: null, discVal: null, taxName: 'ضريبة 15%', taxPct: 15,
    ...overrides,
  };
}
function makeGroup(ref, rows) { return { ref, rows, bad: false }; }

const catalog = {
  vendors: [{ id: 1, ref: 'V1', name: 'مورد تجريبي', phone: '' }],
  products: [{ id: 2, sku: 'SKU1', name: 'منتج تجريبي', unit: '', unitTypeId: 9, taxPercent: 15, purchasable: true, active: true, conversions: [] }],
  taxes: [{ id: 1, name: 'ضريبة 15%', percent: 15 }, { id: 2, name: 'خصم ضريبي', percent: 0 }],
  inventoriesFull: [{ id: 5, name: 'الرئيسي' }],
  accounts: [{ id: 17, code: '5101', name: 'حساب الخصم' }],
};

describe('buildBillIndexes', () => {
  it('يبني الفهارس الأربعة من catalog', () => {
    const idx = buildBillIndexes(catalog);
    expect(idx.vendorRefMap.get('v1').id).toBe(1);
    expect(idx.productSkuMap.get('sku1').id).toBe(2);
    expect(idx.inventoryIdByName.get(norm('الرئيسي'))).toBe(5);
    expect(idx.accountIdByName.get(norm('5101'))).toBe(17);
  });
});

describe('buildBillPayload', () => {
  it('يبني حمولة صحيحة كاملة (تاريخ ISO، quantity/unit_price نصاً، unit_id من product.unitTypeId، بلا project_id بلا حاجة له)', () => {
    const built = buildBillPayload(makeGroup('BILL-1', [makeRow()]), buildBillIndexes(catalog));
    expect(built.ok).toBe(true);
    expect(built.payload).toEqual({
      bill: {
        contact_id: 1,
        reference: 'BILL-1',
        issue_date: '2023-12-01',
        due_date: '2023-12-30',
        status: 'Draft',
        inventory_id: 5,
        line_items: [{
          product_id: 2, quantity: '5', unit_price: '170', is_inclusive: false,
          inventory_id: 5, tax_id: 1, tax_percentage: '15', unit_id: 9,
        }],
      },
    });
  });

  it('منتج بلا unitTypeId معروف (رفع يدوي مثلاً): unit_id لا يُرسَل إطلاقاً', () => {
    const noUnitCatalog = { ...catalog, products: [{ ...catalog.products[0], unitTypeId: undefined }] };
    const built = buildBillPayload(makeGroup('BILL-1b', [makeRow()]), buildBillIndexes(noUnitCatalog));
    expect(built.ok).toBe(true);
    expect(built.payload.bill.line_items[0]).not.toHaveProperty('unit_id');
  });

  it('بلا تاريخ استحقاق: يُستخدَم تاريخ الإصدار', () => {
    const built = buildBillPayload(makeGroup('BILL-2', [makeRow({ dueDate: null })]), buildBillIndexes(catalog));
    expect(built.ok).toBe(true);
    expect(built.payload.bill.due_date).toBe('2023-12-01');
  });

  it('يفشل بوضوح لو تعذّر تحديد معرّف المورد الحقيقي', () => {
    const built = buildBillPayload(makeGroup('BILL-3', [makeRow({ vendorRef: 'UNKNOWN' })]), buildBillIndexes(catalog));
    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/معرّف المورد/);
  });

  it('يفشل بوضوح لو تعذّر قراءة تاريخ الإصدار', () => {
    const built = buildBillPayload(makeGroup('BILL-4', [makeRow({ issueDate: null })]), buildBillIndexes(catalog));
    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/تاريخ إصدار/);
  });

  it('يفشل بوضوح لو الموقع غير مطابَق لمخزون حقيقي', () => {
    const built = buildBillPayload(makeGroup('BILL-5', [makeRow({ location: 'موقع غير موجود' })]), buildBillIndexes(catalog));
    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/الموقع\/المخزون/);
  });

  it('يفشل بوضوح لو تعذّر تحديد معرّف المنتج الحقيقي', () => {
    const built = buildBillPayload(makeGroup('BILL-6', [makeRow({ prodSku: 'UNKNOWN' })]), buildBillIndexes(catalog));
    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/معرّف المنتج/);
  });

  it('يفشل بوضوح لو تعذّر تحديد معرّف الضريبة الحقيقي', () => {
    const built = buildBillPayload(makeGroup('BILL-7', [makeRow({ taxName: 'ضريبة غير معرَّفة' })]), buildBillIndexes(catalog));
    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/معرّف الضريبة/);
  });

  it('خصم نسبة مئوية على بند: discount_percent + discount_type="0" حرفياً', () => {
    const built = buildBillPayload(makeGroup('BILL-8', [makeRow({ discPct: 5 })]), buildBillIndexes(catalog));
    expect(built.ok).toBe(true);
    expect(built.payload.bill.line_items[0].discount_percent).toBe('5');
    expect(built.payload.bill.line_items[0].discount_type).toBe('0');
  });

  it('[تصحيح حسب المواصفة الرسمية] خصم بالقيمة على بند: نفس discount_percent + discount_type="1"', () => {
    const built = buildBillPayload(makeGroup('BILL-9', [makeRow({ discVal: 20 })]), buildBillIndexes(catalog));
    expect(built.ok).toBe(true);
    expect(built.payload.bill.line_items[0].discount_percent).toBe('20');
    expect(built.payload.bill.line_items[0].discount_type).toBe('1');
  });

  it('وصف البند (prodDesc) يُحمَل لو غير فارغ', () => {
    const built = buildBillPayload(makeGroup('BILL-10', [makeRow({ prodDesc: 'وصف تجريبي' })]), buildBillIndexes(catalog));
    expect(built.payload.bill.line_items[0].description).toBe('وصف تجريبي');
  });

  describe('خصم المستند (مستوى الفاتورة)', () => {
    it('docDiscVal>0 مع حساب وفئة ضريبية مطابَقين: تُرسَل الحقول الأربعة', () => {
      const built = buildBillPayload(
        makeGroup('BILL-11', [makeRow({ docDiscVal: 10, docDiscAcc: 'حساب الخصم', docDiscTax: 'خصم ضريبي' })]),
        buildBillIndexes(catalog)
      );
      expect(built.ok).toBe(true);
      expect(built.payload.bill.inclusive_cd_discount).toBe(10);
      expect(built.payload.bill.discount_account_id).toBe(17);
      expect(built.payload.bill.discount_tax_id).toBe(2);
      expect(built.payload.bill.discount_type).toBe('amount');
      expect(built.payload.bill.discount_timing).toBe('before_vat');
    });

    it('docDiscVal>0 بلا حساب مطابَق: خطأ حاجب صريح', () => {
      const built = buildBillPayload(
        makeGroup('BILL-12', [makeRow({ docDiscVal: 10, docDiscAcc: 'حساب غير موجود', docDiscTax: 'خصم ضريبي' })]),
        buildBillIndexes(catalog)
      );
      expect(built.ok).toBe(false);
      expect(built.error).toMatch(/حساب خصم المستند/);
    });

    it('docDiscVal>0 بلا فئة ضريبية مطابَقة: خطأ حاجب صريح', () => {
      const built = buildBillPayload(
        makeGroup('BILL-13', [makeRow({ docDiscVal: 10, docDiscAcc: 'حساب الخصم', docDiscTax: 'فئة غير موجودة' })]),
        buildBillIndexes(catalog)
      );
      expect(built.ok).toBe(false);
      expect(built.error).toMatch(/الفئة الضريبية لخصم المستند/);
    });

    it('بلا docDiscVal إطلاقاً: لا تُرسَل أي حقول خصم مستند', () => {
      const built = buildBillPayload(makeGroup('BILL-14', [makeRow()]), buildBillIndexes(catalog));
      expect(built.payload.bill).not.toHaveProperty('discount_account_id');
      expect(built.payload.bill).not.toHaveProperty('discount_tax_id');
      expect(built.payload.bill).not.toHaveProperty('inclusive_cd_discount');
    });
  });

  it('يجمع أكثر من بند بنفس الفاتورة', () => {
    const built = buildBillPayload(makeGroup('BILL-15', [makeRow(), makeRow({ qty: 2, price: 50 })]), buildBillIndexes(catalog));
    expect(built.ok).toBe(true);
    expect(built.payload.bill.line_items).toHaveLength(2);
  });
});

describe('pushBillsToQoyod', () => {
  it('يرسل فاتورة واحدة بنجاح', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 201, text: async () => JSON.stringify({ bill: { id: 123, status: 'Draft', total: 977.5 } }),
    });
    const entries = [];
    const result = await pushBillsToQoyod([makeGroup('BILL-1', [makeRow()])], 'KEY', { catalog, onEntry: (e) => entries.push(e) });
    expect(result).toMatchObject({ total: 1, sent: 1, failed: 0, stoppedEarly: false });
    expect(entries).toEqual([{ ref: 'BILL-1', status: 'success', id: 123, total: 977.5, response: { id: 123, status: 'Draft', total: 977.5 } }]);
  });

  it('فشل فاتورة واحدة (رفض API) لا يوقف باقي الفواتير المستقلة', async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call++;
      if (call === 1) return { ok: false, status: 422, text: async () => JSON.stringify({ errors: { contact_id: ["can't be blank"] } }) };
      return { ok: true, status: 201, text: async () => JSON.stringify({ bill: { id: 5 } }) };
    });
    const groups = [makeGroup('BILL-1', [makeRow()]), makeGroup('BILL-2', [makeRow()])];
    const result = await pushBillsToQoyod(groups, 'KEY', { catalog });
    expect(result.total).toBe(2);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.entries[0].status).toBe('error');
    expect(result.entries[1].status).toBe('success');
  });

  it('يرجّع fatalError واضح بلا مفتاح API، بلا أي استدعاء شبكة', async () => {
    global.fetch = vi.fn();
    const result = await pushBillsToQoyod([makeGroup('BILL-1', [makeRow()])], '', { catalog });
    expect(result.fatalError).toMatch(/مفتاح API/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('يرجّع fatalError واضح بلا فواتير إطلاقاً', async () => {
    const result = await pushBillsToQoyod([], 'KEY', { catalog });
    expect(result.fatalError).toMatch(/لا توجد فواتير/);
  });

  it('فشل بناء الحمولة (مورد غير معروف مثلاً) يُسجَّل كخطأ ويكمل الباقي بلا استدعاء API لتلك الفاتورة', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => JSON.stringify({ bill: { id: 1 } }) });
    const groups = [makeGroup('BILL-1', [makeRow({ vendorRef: 'UNKNOWN' })]), makeGroup('BILL-2', [makeRow()])];
    const result = await pushBillsToQoyod(groups, 'KEY', { catalog });
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
