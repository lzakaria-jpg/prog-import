// وكيل قيود اتش ار (functions/api/qoyod-hr-proxy): بناء الطلب للواجهة، CORS المقيّد، ورفض الطلبات الناقصة.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequestGet, onRequestPost, onRequestOptions } from '../../../../functions/api/qoyod-hr-proxy/[[path]].js';

const BASE = 'https://hr-api.example.test/v1';
const ctx = (url, { method = 'GET', headers = {}, body, env = { QOYOD_HR_API_BASE: BASE }, path = [] } = {}) => ({
  request: new Request(url, { method, headers, body }),
  params: { path },
  env,
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('qoyod-hr-proxy', () => {
  it('بدون عنوان الواجهة على الخادم: 503 ولا يتصل بأي مكان', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await onRequestGet(ctx('https://iqoyod.pages.dev/api/qoyod-hr-proxy/employees', { env: {}, headers: { 'API-KEY': 'k' }, path: ['employees'] }));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('بدون مفتاح API: 400', async () => {
    const res = await onRequestGet(ctx('https://iqoyod.pages.dev/api/qoyod-hr-proxy/employees', { path: ['employees'] }));
    expect(res.status).toBe(400);
  });

  it('يوجّه المسار والاستعلام والجسم والمفتاح كما هي، ويرجع حالة الرد كما وردت', async () => {
    const fetchMock = vi.fn(async () => new Response('{"id":7}', { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const payload = JSON.stringify({ first_name: 'Sara' });
    const res = await onRequestPost(ctx('https://iqoyod.pages.dev/api/qoyod-hr-proxy/employees/bulk?dry=1', {
      method: 'POST', body: payload, path: ['employees', 'bulk'],
      headers: { 'API-KEY': 'client-key', Origin: 'https://iqoyod.pages.dev', 'Content-Type': 'application/json' },
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/employees/bulk?dry=1`);
    expect(init.method).toBe('POST');
    expect(init.headers['API-KEY']).toBe('client-key');
    expect(init.body).toBe(payload);
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('{"id":7}');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://iqoyod.pages.dev');
  });

  it('لا يسمح لمواقع خارجية (ليس relay مفتوح)', async () => {
    const res = await onRequestOptions(ctx('https://iqoyod.pages.dev/api/qoyod-hr-proxy/employees', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
