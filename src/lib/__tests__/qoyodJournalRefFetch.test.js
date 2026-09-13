import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildChartAccountsFromApi, buildNameRefListFromApi, buildProjectsIndexFromApi, fetchJournalReferencesFromApi,
} from '../qoyodJournalRefFetch.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('buildChartAccountsFromApi', () => {
  it('يبني نفس شكل مصفوفة parseChartFile (code/name/type/description/parentCode/canPay) + id إضافي', () => {
    const accounts = buildChartAccountsFromApi([
      { id: 1, code: '1', name_ar: 'الأصول', name_en: 'Assets', description: '', recieve_payments: 'false', type: 'CurrentAsset' },
      { id: 2, code: '11', name_ar: 'النقدية', name_en: 'Cash', description: 'وصف', recieve_payments: 'true', type: 'Cash' },
    ]);
    expect(accounts).toEqual([
      { code: '1', name: 'الأصول', type: '', description: '', parentCode: '', canPay: '', id: 1 },
      { code: '11', name: 'النقدية', type: '', description: 'وصف', parentCode: '1', canPay: '', id: 2 },
    ]);
  });

  it('name_ar فارغ يستخدم name_en بديلاً', () => {
    const [acc] = buildChartAccountsFromApi([{ id: 5, code: '2', name_ar: '', name_en: 'Liabilities' }]);
    expect(acc.name).toBe('Liabilities');
  });

  it('يتجاهل صفوفًا بلا code إطلاقًا', () => {
    const accounts = buildChartAccountsFromApi([{ id: 1, code: '', name_ar: 'x' }, { id: 2, code: null, name_ar: 'y' }]);
    expect(accounts).toHaveLength(0);
  });

  it('يستنتج parentCode بالاقتطاع من اليمين حرفًا فحرفًا (نفس guessParentByCodeTruncation بـqoyodAccountSync.js)', () => {
    const accounts = buildChartAccountsFromApi([
      { id: 1, code: '1', name_ar: 'الأصول' },
      { id: 2, code: '11', name_ar: 'أصول متداولة' },
      { id: 3, code: '110', name_ar: 'نقدية' },
      { id: 4, code: '1101', name_ar: 'الصندوق' },
    ]);
    expect(accounts.find((a) => a.code === '1101').parentCode).toBe('110');
    expect(accounts.find((a) => a.code === '110').parentCode).toBe('11');
    expect(accounts.find((a) => a.code === '11').parentCode).toBe('1');
    expect(accounts.find((a) => a.code === '1').parentCode).toBe('');
  });
});

describe('buildNameRefListFromApi', () => {
  it('يبني نفس شكل parseNameRefFile ([{name, ref}])، ref = String(id) الحقيقي', () => {
    const list = buildNameRefListFromApi([{ id: 42, name: 'شركة الاختبار' }, { id: 7, name: 'عميل آخر' }]);
    expect(list).toEqual([{ name: 'شركة الاختبار', ref: '42' }, { name: 'عميل آخر', ref: '7' }]);
  });

  it('يتجاهل عناصر بلا id أو بلا اسم', () => {
    const list = buildNameRefListFromApi([{ id: undefined, name: 'x' }, { id: 1, name: '' }, { id: 2, name: '  ' }]);
    expect(list).toHaveLength(0);
  });
});

describe('buildProjectsIndexFromApi', () => {
  it('byId مفتاحه String(id)، byName يجمع تكرارات بنفس الاسم', () => {
    const idx = buildProjectsIndexFromApi([{ id: 1, name: 'مشروع أ' }, { id: 2, name: 'مشروع أ' }]);
    expect(idx.byId.get('1')).toEqual({ id: 1, name: 'مشروع أ' });
    expect(idx.byName.get('مشروع أ')).toHaveLength(2);
  });
});

describe('fetchJournalReferencesFromApi', () => {
  function mockFetchAll(map) {
    return vi.fn(async (path) => {
      const key = path.replace(/^\//, '');
      if (map[key] === 'error') throw new Error('network fail');
      return map[key] || [];
    });
  }

  it('يجمع الأربعة (حسابات/عملاء/موردين/مشاريع) وتُبنى الفهارس بشكل صحيح', async () => {
    vi.doMock('../../product-upload/io/network.js', () => ({
      fetchAll: mockFetchAll({
        accounts: [{ id: 1, code: '1', name_ar: 'حساب' }],
        customers: [{ id: 10, name: 'عميل' }],
        vendors: [{ id: 20, name: 'مورد' }],
        projects: [{ id: 30, name: 'مشروع' }],
      }),
    }));
    vi.resetModules();
    const { fetchJournalReferencesFromApi: freshFetch } = await import('../qoyodJournalRefFetch.js');
    const result = await freshFetch('KEY');
    expect(result.chartAccounts).toEqual([{ code: '1', name: 'حساب', type: '', description: '', parentCode: '', canPay: '', id: 1 }]);
    expect(result.customersRefList).toEqual([{ name: 'عميل', ref: '10' }]);
    expect(result.suppliersRefList).toEqual([{ name: 'مورد', ref: '20' }]);
    expect(result.projectsRef.loaded).toBe(true);
    expect(result.projectsRef.byId.get('30')).toEqual({ id: 30, name: 'مشروع' });
    expect(result.counts).toEqual({ accounts: 1, customers: 1, vendors: 1, projects: 1 });
  });

  it('فشل جلب /accounts يرمي خطأً واضحًا (لا بديل يدوي لهذا المورد بمسار API)', async () => {
    vi.doMock('../../product-upload/io/network.js', () => ({
      fetchAll: mockFetchAll({ accounts: 'error' }),
    }));
    vi.resetModules();
    const { fetchJournalReferencesFromApi: freshFetch } = await import('../qoyodJournalRefFetch.js');
    await expect(freshFetch('KEY')).rejects.toThrow(/تعذّر جلب شجرة الحسابات/);
  });

  it('فشل جلب /vendors أو /projects لا يوقف الجلب — يُعامَل كقائمة فارغة فقط', async () => {
    vi.doMock('../../product-upload/io/network.js', () => ({
      fetchAll: mockFetchAll({
        accounts: [{ id: 1, code: '1', name_ar: 'حساب' }],
        customers: [],
        vendors: 'error',
        projects: 'error',
      }),
    }));
    vi.resetModules();
    const { fetchJournalReferencesFromApi: freshFetch } = await import('../qoyodJournalRefFetch.js');
    const result = await freshFetch('KEY');
    expect(result.suppliersRefList).toEqual([]);
    expect(result.projectsRef.byId.size).toBe(0);
    expect(result.chartAccounts).toHaveLength(1);
  });

  it('بلا مفتاح API: يرمي خطأً واضحًا بلا أي استدعاء شبكة', async () => {
    await expect(fetchJournalReferencesFromApi('')).rejects.toThrow(/مفتاح API/);
  });
});
