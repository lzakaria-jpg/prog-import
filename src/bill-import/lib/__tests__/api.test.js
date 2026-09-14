import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAll, DEFAULT_BASE } from '../api.js';

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
