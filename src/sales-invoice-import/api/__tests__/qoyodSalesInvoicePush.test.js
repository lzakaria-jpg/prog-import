import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildSalesInvoicePayload, pushSalesInvoicesToQoyod } from '../qoyodSalesInvoicePush.js';

afterEach(() => { vi.restoreAllMocks(); });

function makeRow(overrides) {
  return {
    id: 'r1', A: 'INV-1', B: '', C: '205', D: '11/09/2026', E: '', F: '',
    G: 'المركز الرئيسي', H: '', I: '', J: '', K: '', L: '', M: '',
    N: '358719364730', O: '', P: '2', Q: '', R: '100', S: 'لا', T: '', U: '', V: '15%',
    ...overrides,
  };
}

const productsIndex = { bySku: new Map([['358719364730', { sku: '358719364730', name: 'اسوارة', sellable: true, stocked: true, id: 1 }]]) };
const locationIdByName = new Map([['المركز الرئيسي', 1]]);

describe('buildSalesInvoicePayload', () => {
  it('يبني حمولة صحيحة كاملة من مجموعة صفوف فاتورة واحدة', () => {
    const built = buildSalesInvoicePayload([makeRow()], { productsIndex, locationIdByName, status: 'Draft' });
    expect(built.ok).toBe(true);
    expect(built.payload).toEqual({
      invoice: {
        contact_id: 205,
        issue_date: '2026-09-11',
        due_date: '2026-09-11',
        status: 'Draft',
        inventory_id: 1,
        draft_if_out_of_stock: true,
        line_items: [{ product_id: 1, quantity: 2, unit_price: 100, is_inclusive: false }],
        reference: 'INV-1',
      },
    });
  });

  it('لا يرسل tax_percent إطلاقًا (Qoyod يطبّقها تلقائيًا من المنتج)', () => {
    const built = buildSalesInvoicePayload([makeRow()], { productsIndex, locationIdByName });
    expect(built.payload.invoice.line_items[0]).not.toHaveProperty('tax_percent');
  });

  describe('[إضافة] مطابقة عمود الضريبة% (V) بفئة ضريبية حقيقية (tax_id)', () => {
    const taxesIndex = { byLabel: new Map([['15%', { id: 7, rate: 15, label: '15%' }]]) };

    it('V مطابقة لفئة حقيقية ⇒ tax_id تُرسَل بالبند', () => {
      const built = buildSalesInvoicePayload([makeRow({ V: '15%' })], { productsIndex, locationIdByName, taxesIndex });
      expect(built.ok).toBe(true);
      expect(built.payload.invoice.line_items[0].tax_id).toBe(7);
    });

    it('بلا taxesIndex أصلًا: V تُتجاهَل بصمت، بلا tax_id، بلا خطأ (نفس السلوك الافتراضي الأصلي)', () => {
      const built = buildSalesInvoicePayload([makeRow({ V: '15%' })], { productsIndex, locationIdByName });
      expect(built.ok).toBe(true);
      expect(built.payload.invoice.line_items[0]).not.toHaveProperty('tax_id');
    });

    // [إصلاح 2026-09-11، بلاغ اختبار حي] كانت تُتجاهَل بصمت (فتُنشأ الفاتورة بضريبة
    // صفرية تلقائيًا بدل احترام الضريبة الحقيقية المطلوبة) — الآن خطأ حاجب صريح متى
    // كان taxesIndex يحمل فئات حقيقية فعلًا (نفس فلسفة الموقع/المشروع).
    it('V غير مطابقة لأي فئة حقيقية رغم وجود فئات فعلية بالفهرس ⇒ خطأ صريح', () => {
      const built = buildSalesInvoicePayload([makeRow({ V: '99%' })], { productsIndex, locationIdByName, taxesIndex });
      expect(built.ok).toBe(false);
      expect(built.error).toMatch(/تعذّر مطابقة فئة الضريبة/);
    });

    it('[إضافة] مطابقة رقمية متسامحة (فرق تنسيق طفيف لم يمر عبر snapTaxCategory) ⇒ tax_id تُرسَل رغم عدم تطابق نصي حرفي', () => {
      const built = buildSalesInvoicePayload([makeRow({ V: '15.0%' })], { productsIndex, locationIdByName, taxesIndex });
      expect(built.ok).toBe(true);
      expect(built.payload.invoice.line_items[0].tax_id).toBe(7);
    });
  });

  describe('[إضافة، غير مؤكَّد ميدانيًا] مطابقة عمود المشروع (projectRef)', () => {
    const projectsIndex = {
      loaded: true,
      byId: new Map([['9', { id: 9, name: 'مشروع الرياض' }]]),
      byName: new Map([['مشروعالرياض', [{ id: 9, name: 'مشروع الرياض' }]]]),
    };

    it('بلا projectRef إطلاقًا: لا project_id بأي بند، بلا خطأ', () => {
      const built = buildSalesInvoicePayload([makeRow()], { productsIndex, locationIdByName, projectsIndex });
      expect(built.ok).toBe(true);
      expect(built.payload.invoice).not.toHaveProperty('project_id');
      expect(built.payload.invoice.line_items[0]).not.toHaveProperty('project_id');
    });

    it('projectRef موجود لكن بلا projectsIndex أصلًا: يُتجاهَل بصمت، لا خطأ', () => {
      const built = buildSalesInvoicePayload([makeRow({ projectRef: '9' })], { productsIndex, locationIdByName });
      expect(built.ok).toBe(true);
      expect(built.payload.invoice.line_items[0]).not.toHaveProperty('project_id');
    });

    // [إضافة — إصلاح خطأ حقيقي 2026-09-11] projectsIndex.loaded===false (مثل
    // EMPTY_REF قبل أي جلب فعلي) كان يُعامَل كـ"مشاريع محمَّلة فعليًا" لأن الفحص
    // كان على وجود الكائن نفسه فقط — فيفشل بناء أي فاتورة فيها projectRef بخطأ
    // "تعذّر مطابقة المشروع" رغم عدم جلب أي مشاريع أصلًا (sendInvoicesViaApi يمرّر
    // projectsIndex دومًا، محمَّلًا أو لا).
    it('projectsIndex.loaded===false (لم تُجلَب مشاريع فعليًا): يُتجاهَل بصمت، لا خطأ حتى لو الكائن موجود', () => {
      const built = buildSalesInvoicePayload([makeRow({ projectRef: '9' })], {
        productsIndex, locationIdByName, projectsIndex: { loaded: false },
      });
      expect(built.ok).toBe(true);
      expect(built.payload.invoice.line_items[0]).not.toHaveProperty('project_id');
    });

    // [إصلاح 2026-09-11، بلاغ اختبار حي + مثال طلب حقيقي] project_id على كل
    // line_item لا على الفاتورة نفسها — الإصدار الأول كان يضعه بمستوى الفاتورة
    // فتُنشأ الفاتورة بنجاح بلا أي خطأ لكن بلا مشروع مرفق فعليًا (قيود لا يقرأ
    // project_id بهذا المستوى إطلاقًا).
    it('يطابق بالرقم (byId) أولًا، ويُرسَل على البند لا على الفاتورة', () => {
      const built = buildSalesInvoicePayload([makeRow({ projectRef: '9' })], { productsIndex, locationIdByName, projectsIndex });
      expect(built.ok).toBe(true);
      expect(built.payload.invoice).not.toHaveProperty('project_id');
      expect(built.payload.invoice.line_items[0].project_id).toBe(9);
    });

    it('يطابق بالاسم عند عدم مطابقة الرقم', () => {
      const built = buildSalesInvoicePayload([makeRow({ projectRef: 'مشروع الرياض' })], { productsIndex, locationIdByName, projectsIndex });
      expect(built.ok).toBe(true);
      expect(built.payload.invoice.line_items[0].project_id).toBe(9);
    });

    it('نفس project_id يُطبَّق على كل بنود نفس الفاتورة (أكثر من سطر)', () => {
      const rows = [makeRow({ projectRef: '9' }), makeRow({ id: 'r2', projectRef: '9' })];
      const built = buildSalesInvoicePayload(rows, { productsIndex, locationIdByName, projectsIndex });
      expect(built.ok).toBe(true);
      expect(built.payload.invoice.line_items[0].project_id).toBe(9);
      expect(built.payload.invoice.line_items[1].project_id).toBe(9);
    });

    it('اسم غير مطابق لأي مشروع ⇒ خطأ صريح', () => {
      const built = buildSalesInvoicePayload([makeRow({ projectRef: 'مشروع غير موجود' })], { productsIndex, locationIdByName, projectsIndex });
      expect(built.ok).toBe(false);
      expect(built.error).toMatch(/تعذّر مطابقة المشروع/);
    });

    it('اسم مطابق لأكثر من مشروع ⇒ خطأ يطلب استخدام الرقم', () => {
      const ambiguousIndex = {
        loaded: true,
        byId: new Map(),
        byName: new Map([['مشروعمشترك', [{ id: 1, name: 'مشروع مشترك' }, { id: 2, name: 'مشروع مشترك' }]]]),
      };
      const built = buildSalesInvoicePayload([makeRow({ projectRef: 'مشروع مشترك' })], { productsIndex, locationIdByName, projectsIndex: ambiguousIndex });
      expect(built.ok).toBe(false);
      expect(built.error).toMatch(/مطابق لأكثر من مشروع/);
    });
  });

  it('due_date يرث issue_date عند فراغ E', () => {
    const built = buildSalesInvoicePayload([makeRow({ E: '' })], { productsIndex, locationIdByName });
    expect(built.payload.invoice.due_date).toBe(built.payload.invoice.issue_date);
  });

  it('يستخدم E كتاريخ استحقاق منفصل عند تعبئته', () => {
    const built = buildSalesInvoicePayload([makeRow({ E: '15/09/2026' })], { productsIndex, locationIdByName });
    expect(built.payload.invoice.due_date).toBe('2026-09-15');
  });

  it('نسبة الخصم (T) تُرسَل كـdiscount/discount_type=percentage', () => {
    const built = buildSalesInvoicePayload([makeRow({ T: '10' })], { productsIndex, locationIdByName });
    expect(built.payload.invoice.line_items[0]).toMatchObject({ discount: 10, discount_type: 'percentage' });
  });

  it('قيمة الخصم (U) تُرسَل كـdiscount/discount_type=amount', () => {
    const built = buildSalesInvoicePayload([makeRow({ U: '5' })], { productsIndex, locationIdByName });
    expect(built.payload.invoice.line_items[0]).toMatchObject({ discount: 5, discount_type: 'amount' });
  });

  it('يفشل بوضوح لو تعذّر تحديد رقم العميل الحقيقي', () => {
    const built = buildSalesInvoicePayload([makeRow({ C: 'CUS-XYZ' })], { productsIndex, locationIdByName });
    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/رقم العميل/);
  });

  it('يفشل بوضوح لو تعذّر مطابقة الموقع بمعرّف مخزون', () => {
    const built = buildSalesInvoicePayload([makeRow({ G: 'موقع غير معروف' })], { productsIndex, locationIdByName });
    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/الموقع/);
  });

  it('يفشل بوضوح لو تعذّر تحديد معرّف المنتج الحقيقي', () => {
    const built = buildSalesInvoicePayload([makeRow({ N: 'SKU-غير-موجود' })], { productsIndex, locationIdByName });
    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/المنتج/);
  });

  it('يجمع أكثر من بند لنفس الفاتورة بمصفوفة line_items واحدة', () => {
    const rows = [makeRow(), makeRow({ id: 'r2', N: '358719364730', P: '1' })];
    const built = buildSalesInvoicePayload(rows, { productsIndex, locationIdByName });
    expect(built.payload.invoice.line_items).toHaveLength(2);
  });
});

describe('pushSalesInvoicesToQoyod', () => {
  it('يرسل فاتورة واحدة بنجاح', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 201, text: async () => JSON.stringify({ invoice: { id: 229, total: '115.0' } }),
    });
    const entries = [];
    const result = await pushSalesInvoicesToQoyod([makeRow()], 'KEY', {
      productsIndex, locationIdByName, onEntry: (e) => entries.push(e),
    });
    expect(result).toMatchObject({ total: 1, sent: 1, failed: 0, stoppedEarly: false });
    expect(entries).toEqual([{ ref: 'INV-1', status: 'success', id: 229, total: '115.0', response: { id: 229, total: '115.0' } }]);
  });

  it('فشل فاتورة واحدة (رفض API) لا يوقف باقي الفواتير المستقلة', async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call++;
      if (call === 1) return { ok: false, status: 422, text: async () => 'Validation failed' };
      return { ok: true, status: 201, text: async () => JSON.stringify({ invoice: { id: 300, total: '50.0' } }) };
    });
    const rows = [makeRow(), makeRow({ id: 'r2', A: 'INV-2' })];
    const result = await pushSalesInvoicesToQoyod(rows, 'KEY', { productsIndex, locationIdByName });
    expect(result.total).toBe(2);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.entries[0].status).toBe('error');
    expect(result.entries[1].status).toBe('success');
  });

  it('صفوف بلا مرجع فاتورة (__blank__) تُستبعَد من الإرسال', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => JSON.stringify({ invoice: { id: 1 } }) });
    const result = await pushSalesInvoicesToQoyod([makeRow({ A: '' })], 'KEY', { productsIndex, locationIdByName });
    expect(result.total).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('يرجّع fatalError واضح بلا مفتاح API، بلا أي استدعاء شبكة', async () => {
    global.fetch = vi.fn();
    const result = await pushSalesInvoicesToQoyod([makeRow()], '', { productsIndex, locationIdByName });
    expect(result.fatalError).toMatch(/مفتاح API/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('[إضافة] forceDraftRefs يجبر Draft على فواتير محددة فقط، والباقي يتبع status العام', async () => {
    const sentBodies = [];
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      sentBodies.push(JSON.parse(opts.body));
      return { ok: true, status: 201, text: async () => JSON.stringify({ invoice: { id: 1 } }) };
    });
    const rows = [makeRow({ A: 'INV-RISKY' }), makeRow({ id: 'r2', A: 'INV-CLEAN' })];
    await pushSalesInvoicesToQoyod(rows, 'KEY', {
      productsIndex, locationIdByName, status: 'Approved', forceDraftRefs: new Set(['INV-RISKY']),
    });
    expect(sentBodies[0].invoice.status).toBe('Draft'); // INV-RISKY مُجبَرة
    expect(sentBodies[1].invoice.status).toBe('Approved'); // INV-CLEAN تتبع status العام
  });

  it('فشل بناء الحمولة (لا معرّف عميل مثلاً) يُسجَّل كخطأ ويكمل الباقي بلا استدعاء API لتلك الفاتورة', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => JSON.stringify({ invoice: { id: 5 } }) });
    const rows = [makeRow({ C: 'CUS-XYZ' }), makeRow({ id: 'r2', A: 'INV-2' })];
    const result = await pushSalesInvoicesToQoyod(rows, 'KEY', { productsIndex, locationIdByName });
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
