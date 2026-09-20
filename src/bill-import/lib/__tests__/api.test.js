import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAll, DEFAULT_BASE, normTax, normProduct, normInventoryFull, normAccount, normVendor, fetchCatalog } from '../api.js';

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

  // [إصلاح خطأ حقيقي 2026-09-14] العتبة صارت مرتبطة بـPER_PAGE الفعلي (100،
  // المُرسَل صراحة بالطلب الآن) لا رقم 15 اعتباطي — صفحة أولى ممتلئة (100 عنصر)
  // ثم صفحة أقصر تعني فعليًا "توقفت الصفحات". راجع أيضًا اختبار "[الخطأ
  // الحقيقي] مورد لا يُرقِّم إطلاقًا" تحت لسيناريو البلاغ الميداني الفعلي.
  it('يجمع كل الصفحات حتى صفحة أقصر من PER_PAGE فتتوقف', async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call++;
      if (call === 1) return mockResponse(200, { vendors: Array.from({ length: 100 }, (_, i) => ({ id: i })) });
      return mockResponse(200, { vendors: [{ id: 100 }] });
    });
    const result = await getAll('vendors', { apiKey: 'KEY' });
    expect(result).toHaveLength(101);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  // [إصلاح خطأ حقيقي مبلَّغ ميدانياً 2026-09-14] بلاغ مستخدم: "الاداة لا تجلب
  // البيانات نهائي" — زر "جلب بيانات المنشأة" يعلّق للأبد. السبب المؤكَّد من
  // مواصفة Qoyod الرسمية: GET /vendors (وغيرها: accounts بلا per_page، inventories،
  // product_unit_types، taxes) لا تُرقِّم إطلاقاً — ترجع نفس القائمة الكاملة
  // كل مرة بصرف النظر عن رقم الصفحة المطلوبة. بدون الإصلاح، كانت الحلقة تُعيد
  // جلب نفس القائمة (قد تكون كبيرة) 60 مرة متتالية (arr.length لا يقل أبداً عن
  // العتبة) — تعليق طويل يبدو "لا يجلب شيئًا". يجب التوقف من أول تكرار (page=2
  // يُرجع نفس أول عنصر بالضبط) بلا أي تكرار بالنتيجة.
  // [إصلاح أداء 2026-09-14] بلاغ: "المشكلة بالوقت الطويل المستغرق، أريده
  // سريعاً" — مورد ضخم بلا ترقيم (20100 مورّد بمثال حقيقي) كان يُطلَب مرتين
  // كاملتين (صفحة 1 ثم 2 لاكتشاف التطابق) قبل هذا التحسين. الآن: صفحة أطول
  // من PER_PAGE المطلوب صراحةً = دليل قاطع فوري بلا حاجة لصفحة ثانية إطلاقاً.
  it('[إصلاح أداء] مورد لا يُرقِّم إطلاقًا وقائمته الكاملة أطول من PER_PAGE — طلب واحد فقط بلا أي تكرار بالنتيجة', async () => {
    // 150 عنصر: أطول من PER_PAGE(100) — بالضبط الحالة الحقيقية المبلَّغة
    // (منشأة عميل فيها أكثر من 100 مورّد/حساب، مثال حي: 20100 مورّد).
    const fullList = Array.from({ length: 150 }, (_, i) => ({ id: i, name: `Vendor ${i}` }));
    global.fetch = vi.fn().mockResolvedValue(mockResponse(200, { vendors: fullList }));
    const result = await getAll('vendors', { apiKey: 'KEY' });
    expect(result).toHaveLength(150); // لا تكرار — لا 300 أو أكثر
    expect(global.fetch).toHaveBeenCalledTimes(1); // طلب واحد فقط — لا حاجة لصفحة ثانية للتأكد
  });

  it('[الخطأ الحقيقي] مورد لا يُرقِّم وقائمته أقصر من PER_PAGE — يتوقف من أول طلب فقط (بلا حاجة لكشف التكرار)', async () => {
    const fullList = Array.from({ length: 40 }, (_, i) => ({ id: i, name: `Vendor ${i}` }));
    global.fetch = vi.fn().mockResolvedValue(mockResponse(200, { vendors: fullList }));
    const result = await getAll('vendors', { apiKey: 'KEY' });
    expect(result).toHaveLength(40);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('يرسل per_page صراحة دومًا — يُفعِّل ترقيم /accounts الفعلي (Qoyod: "only applied when both page and per_page are provided")', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse(200, { accounts: [] }));
    await getAll('accounts', { apiKey: 'KEY' });
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('per_page=100');
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

// [إصلاح أداء حقيقي مبلَّغ ميدانياً 2026-09-14] بلاغ: "وجدت البيانات مقروءة
// تمام بعد فترة طويلة... المشكلة بالوقت الطويل المستغرق، أريده سريعاً" —
// الموارد الخمسة كانت تُجلَب بالتتابع (كل مورد ينتظر اللي قبله)، صارت تُجلَب
// بالتوازي. الاختبارات هنا تتحقق أن التوازي لم يُخِلّ بعزل الأخطاء (فشل مورد
// واحد لا يمنع أو يؤخر باقي الموارد) ولا بأي منطق بديل موجود أصلاً.
describe('fetchCatalog — الجلب المتوازي (5 موارد معاً) لا التتابعي', () => {
  function mockByResource(handlers) {
    return vi.fn(async (u) => {
      const url = String(u);
      for (const [resource, handler] of Object.entries(handlers)) {
        if (url.includes(`/${resource}?`)) return handler();
      }
      return mockResponse(404, { error: 'unhandled in test mock: ' + url });
    });
  }

  it('كل الموارد الخمسة تُنادى (بالتوازي) وتُملأ بشكل صحيح حين تنجح جميعها', async () => {
    let concurrentCalls = 0;
    let maxConcurrent = 0;
    const track = (body) => async () => {
      concurrentCalls++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      await Promise.resolve(); // نقطة تعليق قصيرة تسمح بتداخل النداءات الأخرى فعلاً
      concurrentCalls--;
      return mockResponse(200, body);
    };
    global.fetch = mockByResource({
      products: track({ products: [{ id: 1, name_ar: 'منتج', sku: 'P1' }] }),
      vendors: track({ vendors: [{ id: 2, name: 'مورد' }] }),
      product_unit_types: track({ product_unit_types: [{ id: 3, unit_name: 'قطعة' }] }),
      inventories: track({ inventories: [{ id: 4, name: 'المستودع الرئيسي' }] }),
      accounts: track({ accounts: [{ id: 5, code: '4001', name_ar: 'حساب خصم' }] }),
      taxes: track({ taxes: [{ id: 6, name_ar: 'ضريبة 15%', percentage: 15 }] }),
    });

    const catalog = await fetchCatalog({ apiKey: 'KEY' }, null);

    expect(maxConcurrent).toBeGreaterThan(1); // دليل تنفيذ متزامن فعلي، لا متتابع
    expect(catalog.products).toHaveLength(1);
    expect(catalog.vendors).toHaveLength(1);
    expect(catalog.units).toEqual(['قطعة']);
    expect(catalog.locations).toEqual(['المستودع الرئيسي']);
    expect(catalog.accounts).toHaveLength(1);
    expect(catalog.taxes).toEqual([{ id: 6, name: 'ضريبة 15%', percent: 15 }]);
    expect(catalog.warnings).toEqual([]);
  });

  it('فشل مورد واحد (وحدات القياس مثلاً) لا يمنع أو يؤخر باقي الموارد — كل واحد معزول بخطئه', async () => {
    global.fetch = mockByResource({
      products: async () => mockResponse(200, { products: [] }),
      vendors: async () => mockResponse(200, { vendors: [{ id: 1, name: 'مورد' }] }),
      product_unit_types: async () => mockResponse(500, { error: 'server error' }),
      inventories: async () => mockResponse(200, { inventories: [{ id: 2, name: 'الرئيسي' }] }),
      accounts: async () => mockResponse(200, { accounts: [{ id: 3, code: '1', name_ar: 'حساب' }] }),
      taxes: async () => mockResponse(200, { taxes: [{ id: 4, name_ar: 'ضريبة', percentage: 15 }] }),
    });

    const catalog = await fetchCatalog({ apiKey: 'KEY' }, null);

    expect(catalog.vendors).toHaveLength(1); // لم يتأثر بفشل مورد آخر
    expect(catalog.locations).toEqual(['الرئيسي']);
    expect(catalog.accounts).toHaveLength(1);
    expect(catalog.taxes).toEqual([{ id: 4, name: 'ضريبة', percent: 15 }]);
    expect(catalog.units).toEqual([]);
    expect(catalog.warnings).toEqual(['تعذّر جلب وحدات القياس من المنشأة.']);
  });
});
