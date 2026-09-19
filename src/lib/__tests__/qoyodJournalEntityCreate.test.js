import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildContactCreatePayload, buildLocationCreatePayload, pushMissingJournalEntitiesToQoyod } from '../qoyodJournalEntityCreate.js';

vi.mock('../../product-upload/io/network.js', () => ({ api: vi.fn(), fetchAll: vi.fn() }));
import { api, fetchAll } from '../../product-upload/io/network.js';

describe('buildContactCreatePayload', () => {
  it('يبني {contact:{name,status:Active}} من اسم صالح', () => {
    expect(buildContactCreatePayload('شركة الأمل')).toEqual({ ok: true, payload: { contact: { name: 'شركة الأمل', status: 'Active' } } });
  });
  it('يرفض اسماً فارغاً', () => {
    expect(buildContactCreatePayload('').ok).toBe(false);
    expect(buildContactCreatePayload('   ').ok).toBe(false);
  });
});

describe('buildLocationCreatePayload', () => {
  it('يبني {name, ar_name, account_id} حين يُمرَّر accountId', () => {
    expect(buildLocationCreatePayload({ name: 'فرع جدة', accountId: 77 })).toEqual({
      ok: true, payload: { name: 'فرع جدة', ar_name: 'فرع جدة', account_id: 77 },
    });
  });
  it('يرفض اسماً فارغاً', () => {
    expect(buildLocationCreatePayload({ name: '', accountId: 5 }).ok).toBe(false);
  });
});

describe('pushMissingJournalEntitiesToQoyod', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('يرفض بلا مفتاح API', async () => {
    const res = await pushMissingJournalEntitiesToQoyod({ accounts: [{ key: 'a', code: '1' }] }, '');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('ينشئ العملاء والموردين بنجاح ويسجّلهم بـcreated', async () => {
    fetchAll.mockResolvedValue([]); // لا حسابات موجودة (لفحص تكرار الحسابات لو استُخدم)
    api.mockImplementation(async (method, path, body) => {
      if (path === '/customers') return { contact: { id: 501, name: body.contact.name } };
      if (path === '/vendors') return { contact: { id: 601, name: body.contact.name } };
      throw new Error(`unexpected path ${path}`);
    });

    const res = await pushMissingJournalEntitiesToQoyod({
      customers: [{ key: 'c1', name: 'شركة الأمل' }],
      vendors: [{ key: 'v1', name: 'مؤسسة النور' }],
    }, 'fake-key');

    expect(res.ok).toBe(true);
    expect(res.created.customers.get('c1')).toEqual({ id: 501, name: 'شركة الأمل' });
    expect(res.created.vendors.get('v1')).toEqual({ id: 601, name: 'مؤسسة النور' });
    expect(res.report.customers[0].status).toBe('success');
    expect(res.report.vendors[0].status).toBe('success');
  });

  it('ينشئ حساباً جديداً (عبر pushAccountsToQoyod الفعلية) ويسجّله بـcreated.accounts', async () => {
    fetchAll.mockResolvedValue([]); // GET /accounts لفحص التكرار — لا شيء موجود
    api.mockImplementation(async (method, path, body) => {
      expect(path).toBe('/accounts');
      return { account: { id: 900, ...body.account } };
    });

    const res = await pushMissingJournalEntitiesToQoyod({
      accounts: [{ key: 'acc1', code: '5199', nameAr: 'مصروف متنوع', nameEn: '', level2Category: 'تكاليف تشغيلية', type: 'تكاليف تشغيلية أخرى' }],
    }, 'fake-key');

    expect(res.created.accounts.get('acc1')).toMatchObject({ id: 900, code: '5199' });
    expect(res.report.accounts[0]).toMatchObject({ key: 'acc1', status: 'success', id: 900 });
  });

  it('ينشئ موقعاً مع حساب مخزون مخصَّص له (خطوتان: حساب ثم موقع)', async () => {
    const calls = [];
    api.mockImplementation(async (method, path, body) => {
      calls.push(path);
      if (path === '/accounts') return { account: { id: 950, ...body.account } };
      if (path === '/inventories') {
        expect(body.account_id).toBe(950);
        return { inventory: { id: 42, name: body.name } };
      }
      throw new Error(`unexpected path ${path}`);
    });

    const res = await pushMissingJournalEntitiesToQoyod({
      locations: [{ key: 'loc1', name: 'فرع جدة', accountCode: '1105', accountNameAr: 'مخزون - فرع جدة' }],
    }, 'fake-key');

    expect(calls).toEqual(['/accounts', '/inventories']);
    expect(res.created.locations.get('loc1')).toEqual({
      id: 42, name: 'فرع جدة', accountId: 950, accountCode: '1105', accountName: 'مخزون - فرع جدة',
    });
    expect(res.report.locations[0]).toMatchObject({ key: 'loc1', status: 'success', locationId: 42, accountId: 950 });
  });

  it('فشل إنشاء حساب الموقع يمنع محاولة إنشاء الموقع نفسه، ويُبلَّغ بوضوح', async () => {
    api.mockImplementation(async (method, path) => {
      if (path === '/accounts') throw new Error('422: code taken');
      throw new Error(`unexpected path ${path}`);
    });

    const res = await pushMissingJournalEntitiesToQoyod({
      locations: [{ key: 'loc1', name: 'فرع جدة', accountCode: '1105', accountNameAr: 'مخزون - فرع جدة' }],
    }, 'fake-key');

    expect(res.created.locations.has('loc1')).toBe(false);
    expect(res.report.locations[0].status).toBe('error');
    expect(res.report.locations[0].reason).toContain('حساب المخزون');
  });

  it('يوقف الإرسال فورًا لو stoppedRef.current صار true بين الدفعات', async () => {
    api.mockResolvedValue({ contact: { id: 1, name: 'x' } });
    const stoppedRef = { current: false };
    const promise = pushMissingJournalEntitiesToQoyod({
      customers: [{ key: 'c1', name: 'أ' }, { key: 'c2', name: 'ب' }],
    }, 'fake-key', { stoppedRef, onProgress: () => { stoppedRef.current = true; } });
    const res = await promise;
    expect(res.created.customers.size).toBeLessThanOrEqual(1);
  });
});
