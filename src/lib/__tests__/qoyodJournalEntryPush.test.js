import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildJournalEntryPayload, pushJournalEntriesToQoyod } from '../qoyodJournalEntryPush.js';

afterEach(() => { vi.restoreAllMocks(); });

function makeRow(overrides) {
  return { code: '11', contact: '', debit: null, credit: null, comment: '', project: '', _rowIndex: 0, ...overrides };
}
function makeEntry(overrides) {
  return {
    seq: '1', date: '15/09/2026', desc: 'قيد اختباري', project: '',
    rows: [makeRow({ _rowIndex: 0, code: '11', debit: '100.00' }), makeRow({ _rowIndex: 1, code: '21', credit: '100.00' })],
    ...overrides,
  };
}

const chartMap = { '11': { code: '11', id: 101 }, '21': { code: '21', id: 201 }, '30': { code: '30', id: 301 } };

describe('buildJournalEntryPayload', () => {
  it('يبني حمولة صحيحة كاملة (تاريخ ISO، مدين/دائن، بلا project_id/contact_id/status/inventory_id بلا حاجة لها)', () => {
    const built = buildJournalEntryPayload(makeEntry(), { chartMap });
    expect(built.ok).toBe(true);
    expect(built.payload).toEqual({
      journal_entry: {
        description: 'قيد اختباري',
        date: '2026-09-15',
        debit_amounts: [{ account_id: 101, amount: '100.00' }],
        credit_amounts: [{ account_id: 201, amount: '100.00' }],
      },
    });
  });

  it('يفشل بوضوح لو تعذّر قراءة تاريخ القيد', () => {
    const built = buildJournalEntryPayload(makeEntry({ date: '2026-09-15' }), { chartMap });
    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/تاريخ القيد/);
  });

  it('يفشل بوضوح لو الوصف فارغ', () => {
    const built = buildJournalEntryPayload(makeEntry({ desc: '' }), { chartMap });
    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/وصف القيد/);
  });

  it('يفشل بوضوح لو تعذّر تحديد معرّف الحساب الحقيقي بقيود', () => {
    const built = buildJournalEntryPayload(makeEntry({ rows: [makeRow({ code: '999', debit: '50' }), makeRow({ code: '21', credit: '50' })] }), { chartMap });
    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/معرّف الحساب/);
  });

  it('يحمل comment لكل بند لو غير فارغ', () => {
    const built = buildJournalEntryPayload(makeEntry({ rows: [makeRow({ code: '11', debit: '100', comment: 'تعليق' }), makeRow({ code: '21', credit: '100' })] }), { chartMap });
    expect(built.payload.journal_entry.debit_amounts[0].comment).toBe('تعليق');
  });

  describe('[إضافة] المشروع على مستوى القيد أو مستوى السطر', () => {
    const projectsIndex = { loaded: true, byId: new Map([['5', { id: 5, name: 'مشروع الرياض' }]]), byName: new Map() };

    it('project على مستوى القيد يُطبَّق على كل البنود افتراضيًا', () => {
      const built = buildJournalEntryPayload(makeEntry({ project: '5' }), { chartMap }, projectsIndex);
      expect(built.ok).toBe(true);
      expect(built.payload.journal_entry.debit_amounts[0].project_id).toBe(5);
      expect(built.payload.journal_entry.credit_amounts[0].project_id).toBe(5);
    });

    it('project على مستوى السطر يتجاوز مشروع القيد لذلك السطر فقط', () => {
      const entry = makeEntry({
        project: '5',
        rows: [makeRow({ code: '11', debit: '100', project: '' }), makeRow({ code: '30', debit: '50', project: '' }), makeRow({ code: '21', credit: '150' })],
      });
      const otherProjectsIndex = { loaded: true, byId: new Map([['5', { id: 5, name: 'أ' }], ['9', { id: 9, name: 'ب' }]]), byName: new Map() };
      entry.rows[1].project = '9'; // يتجاوز مشروع القيد (5) لهذا السطر فقط
      const built = buildJournalEntryPayload(entry, { chartMap }, otherProjectsIndex);
      expect(built.ok).toBe(true);
      expect(built.payload.journal_entry.debit_amounts.find((a) => a.account_id === 101).project_id).toBe(5);
      expect(built.payload.journal_entry.debit_amounts.find((a) => a.account_id === 301).project_id).toBe(9);
    });

    it('مشروع غير مطابَق لأي مشروع حقيقي (وفهرس المشاريع محمَّل فعلًا) ⇒ خطأ صريح', () => {
      const built = buildJournalEntryPayload(makeEntry({ project: '999' }), { chartMap }, projectsIndex);
      expect(built.ok).toBe(false);
      expect(built.error).toMatch(/تعذّر مطابقة المشروع/);
    });

    it('بلا فهرس مشاريع محمَّل: project تُتجاهَل بصمت (لا خطأ)', () => {
      const built = buildJournalEntryPayload(makeEntry({ project: '999' }), { chartMap });
      expect(built.ok).toBe(true);
      expect(built.payload.journal_entry.debit_amounts[0]).not.toHaveProperty('project_id');
    });
  });

  describe('[إضافة] contact_id فقط لبنود المدينين/الدائنين', () => {
    const debtorsCodes = new Set(['11']);
    const creditorsCodes = new Set(['21']);

    it('حساب مدينين برقم مرجعي صحيح ⇒ contact_id يُرسَل', () => {
      const built = buildJournalEntryPayload(
        makeEntry({ rows: [makeRow({ code: '11', debit: '100', contact: '42' }), makeRow({ code: '21', credit: '100' })] }),
        { chartMap, debtorsCodes, creditorsCodes }
      );
      expect(built.payload.journal_entry.debit_amounts[0].contact_id).toBe(42);
    });

    it('حساب غير مدينين/دائنين (مثلًا ضريبة القيمة المضافة) بـcontact="1" ⇒ لا يُرسَل contact_id إطلاقًا (رمز ضريبة لا معرّف عميل)', () => {
      const built = buildJournalEntryPayload(
        makeEntry({ rows: [makeRow({ code: '30', debit: '100', contact: '1' }), makeRow({ code: '21', credit: '100' })] }),
        { chartMap, debtorsCodes, creditorsCodes }
      );
      expect(built.payload.journal_entry.debit_amounts.find((a) => a.account_id === 301)).not.toHaveProperty('contact_id');
    });

    it('حساب مدينين بـcontact غير رقمي (اسم لم يُطابَق بعد) ⇒ لا يُرسَل contact_id، بلا خطأ', () => {
      const built = buildJournalEntryPayload(
        makeEntry({ rows: [makeRow({ code: '11', debit: '100', contact: 'اسم عميل' }), makeRow({ code: '21', credit: '100' })] }),
        { chartMap, debtorsCodes, creditorsCodes }
      );
      expect(built.ok).toBe(true);
      expect(built.payload.journal_entry.debit_amounts[0]).not.toHaveProperty('contact_id');
    });
  });

  it('يفشل بوضوح لو القيد بلا بنود مدينة أو دائنة صالحة (كل الأسطر صفر)', () => {
    const built = buildJournalEntryPayload(makeEntry({ rows: [makeRow({ code: '11', debit: '0' }), makeRow({ code: '21', credit: '0' })] }), { chartMap });
    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/بلا بنود/);
  });

  it('يجمع أكثر من بند بنفس الجانب (مدين) بمصفوفة debit_amounts واحدة', () => {
    const built = buildJournalEntryPayload(
      makeEntry({ rows: [makeRow({ code: '11', debit: '60' }), makeRow({ code: '30', debit: '40' }), makeRow({ code: '21', credit: '100' })] }),
      { chartMap }
    );
    expect(built.payload.journal_entry.debit_amounts).toHaveLength(2);
  });
});

describe('pushJournalEntriesToQoyod', () => {
  it('يرسل قيدًا واحدًا بنجاح', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 201, text: async () => JSON.stringify({ journal_entry: { id: 123, total_debit: '100.00', total_credit: '100.00' } }),
    });
    const entries = [];
    const result = await pushJournalEntriesToQoyod([makeEntry()], 'KEY', { chartMap, onEntry: (e) => entries.push(e) });
    expect(result).toMatchObject({ total: 1, sent: 1, failed: 0, stoppedEarly: false });
    expect(entries).toEqual([{ seq: '1', status: 'success', id: 123, totalDebit: '100.00', totalCredit: '100.00', response: { id: 123, total_debit: '100.00', total_credit: '100.00' } }]);
  });

  // [إصلاح خطأ حقيقي مبلَّغ ميدانياً 2026-09-14] بلاغ مستخدم: دفعة 3707 قيد
  // ظهرت "فشل" بالكامل بالتقرير رغم إنشائها بنجاح تام بمنشأة العميل — الرد
  // الفوري لبعض دفعات القيود الكبيرة يصل 200 ناجحاً لكن بلا journal_entry.id
  // صريح (على الأرجح معالجة غير متزامنة/queued من قيود).
  it('[الخطأ الحقيقي] رد 200 ناجح بلا journal_entry.id صريح يُعتبر نجاحاً لا فشلاً', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({}) });
    const entries = [];
    const result = await pushJournalEntriesToQoyod([makeEntry()], 'KEY', { chartMap, onEntry: (e) => entries.push(e) });
    expect(result).toMatchObject({ total: 1, sent: 1, failed: 0, stoppedEarly: false });
    expect(entries[0]).toMatchObject({ seq: '1', status: 'success', id: null });
  });

  it('رد 200 ناجح بجسم فارغ تمامًا (بلا نص إطلاقًا) يُعتبر نجاحاً أيضًا', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    const result = await pushJournalEntriesToQoyod([makeEntry()], 'KEY', { chartMap });
    expect(result).toMatchObject({ sent: 1, failed: 0 });
    expect(result.entries[0].status).toBe('success');
  });

  it('فشل حقيقي (422 من Qoyod) يبقى يُسجَّل كخطأ كالمعتاد — لم يتحوّل لنجاح زائف', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => JSON.stringify({ errors: { base: ['x'] } }) });
    const result = await pushJournalEntriesToQoyod([makeEntry()], 'KEY', { chartMap });
    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(result.entries[0].status).toBe('error');
  });

  it('فشل قيد واحد (رفض API) لا يوقف باقي القيود المستقلة', async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call++;
      if (call === 1) return { ok: false, status: 422, text: async () => JSON.stringify({ errors: { base: ['Total debit and credit amounts must be equal'] } }) };
      return { ok: true, status: 201, text: async () => JSON.stringify({ journal_entry: { id: 5 } }) };
    });
    const entries = [makeEntry(), makeEntry({ seq: '2' })];
    const result = await pushJournalEntriesToQoyod(entries, 'KEY', { chartMap });
    expect(result.total).toBe(2);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.entries[0].status).toBe('error');
    expect(result.entries[1].status).toBe('success');
  });

  it('يرجّع fatalError واضح بلا مفتاح API، بلا أي استدعاء شبكة', async () => {
    global.fetch = vi.fn();
    const result = await pushJournalEntriesToQoyod([makeEntry()], '', { chartMap });
    expect(result.fatalError).toMatch(/مفتاح API/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('يرجّع fatalError واضح بلا قيود إطلاقًا', async () => {
    const result = await pushJournalEntriesToQoyod([], 'KEY', { chartMap });
    expect(result.fatalError).toMatch(/لا توجد قيود/);
  });

  it('فشل بناء الحمولة (تاريخ غير صالح مثلًا) يُسجَّل كخطأ ويكمل الباقي بلا استدعاء API لذلك القيد', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => JSON.stringify({ journal_entry: { id: 1 } }) });
    const entries = [makeEntry({ date: 'invalid' }), makeEntry({ seq: '2' })];
    const result = await pushJournalEntriesToQoyod(entries, 'KEY', { chartMap });
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
