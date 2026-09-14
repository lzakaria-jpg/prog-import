import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAll, DEFAULT_BASE, normTax, normProduct, normInventoryFull, normAccount, normVendor } from '../api.js';

afterEach(() => { vi.restoreAllMocks(); });

function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'Error',
    json: async () => body,
  };
}

describe('getAll', () => {
  it('[الخطأ الحقيقي] 404 على أول صفحة (مورد فارغ فعلياً بالمنشأة) ⇒ قائمة فارغة بلا خطأ', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse(404, { error: 'We found nothing' }));
    const result = await getAll('products', { apiKey: 'KEY' });
    expect(result).toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('يجمع كل الصفحات حتى صفحة أقصر من الحد فتتوقف', async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call++;
      if (call === 1) return mockResponse(200, { vendors: Array.from({ length: 15 }, (_, i) => ({ id: i })) });
      return mockResponse(200, { vendors: [{ id: 100 }] });
    });
    const result = await getAll('vendors', { apiKey: 'KEY' });
    expect(result).toHaveLength(16);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('خطأ حقيقي (401 مثلاً) لا يُعامَل كقائمة فارغة — يُرمى كما هو', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse(401, { error: 'Unauthorized' }));
    await expect(getAll('products', { apiKey: 'BAD' })).rejects.toThrow(/401/);
  });

  it('DEFAULT_BASE يشير للوكيل النسبي المشترك بالمشروع (لا رابط خارجي مباشر — يتجنب CORS)', () => {
    expect(DEFAULT_BASE).toBe('/api/qoyod-proxy');
  });
});

// [الخطأ الحقيقي] الحقول أدناه مأخوذة حرفياً من مواصفة OpenAPI الرسمية لقيود
// (TaxResponse/ProductResponse/AccountResponse/inventories) — تؤكّد أن normTax
// كانت تفشل بصمت (percent=null دوماً) والوحدات endpoint كان اسمه خاطئاً تماماً.
describe('normTax — الحقل الرسمي "percentage" لا "percent"', () => {
  it('[الخطأ الحقيقي] يقرأ percentage الحقيقي بدل إرجاع null دوماً', () => {
    const t = normTax({ id: 1, name_en: '15% VAT', name_ar: 'ضريبة القيمة المضافة', percentage: 15, code: 'S' });
    expect(t.percent).toBe(15);
    expect(t.name).toBe('ضريبة القيمة المضافة');
  });
});

describe('normProduct — unitTypeId من حقل unit_type الرسمي', () => {
  it('يقرأ unit_type الرقمي (معرّف وحدة المنتج الأساسية) بدل تجاهله', () => {
    const p = normProduct({ id: 123, name_ar: 'لوازم مكتبية', sku: 'OFF-001', unit_type: 1, unit: 'Piece', is_bought: true });
    expect(p.unitTypeId).toBe(1);
  });

  it('بلا unit_type بالرد (رفع يدوي مثلاً): unitTypeId تبقى undefined بلا خطأ', () => {
    const p = normProduct({ id: null, name: 'منتج يدوي', sku: 'X1' });
    expect(p.unitTypeId).toBeUndefined();
  });
});

describe('normInventoryFull — الحقل العربي الحقيقي "ar_name" لا "name_ar"', () => {
  it('يقرأ ar_name عند غياب name الإنجليزي', () => {
    const i = normInventoryFull({ id: 1, ar_name: 'المستودع الرئيسي' });
    expect(i.name).toBe('المستودع الرئيسي');
  });
  it('name الإنجليزي يبقى الأولوية عند توفره', () => {
    const i = normInventoryFull({ id: 1, name: 'Main Warehouse', ar_name: 'المستودع الرئيسي' });
    expect(i.name).toBe('Main Warehouse');
  });
});

describe('normAccount — الحقول الرسمية name_ar/code كانت صحيحة أصلاً', () => {
  it('يقرأ name_ar وcode كما هو موثَّق رسمياً', () => {
    const a = normAccount({ id: 17, code: '1001', name_ar: 'النقد في البنك', name_en: 'Cash in Bank' });
    expect(a.name).toBe('النقد في البنك');
    expect(a.code).toBe('1001');
  });
});

describe('normVendor — حقل name الرسمي (لا reference حقيقي بـContactResponse)', () => {
  it('يقرأ name كما هو موثَّق رسمياً؛ ref تبقى فارغة (لا حقل مرجعي حقيقي بواجهة قيود)', () => {
    const v = normVendor({ id: 5, name: 'مورد تجريبي', phone_number: '0501234567' });
    expect(v.name).toBe('مورد تجريبي');
    expect(v.ref).toBe('');
  });
});
