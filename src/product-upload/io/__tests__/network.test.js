// اختبار انحدار لإصلاح المستخدم: Qoyod API يُرجع 404 ("We found nothing") عند
// قائمة فارغة (منشأة بلا منتجات/فئات/وحدات مسبقاً) — كانت تُرمى كخطأ فيوقف
// الرفع بالكامل قبل إنشاء أي شيء (الخلل المُصلَح: "لا يمكنها رفع منتجات على
// منشأة لا يوجد فيها منتجات مسبقاً").
import { describe, it, expect, vi, afterEach } from "vitest";
import { api, fetchAll } from "../network.js";

function mockFetchOnce(status, body) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
}

afterEach(() => { vi.restoreAllMocks(); });

describe("api()", () => {
  it("يرمي خطأ بصيغة 'API <status>: <أول 200 حرف>' عند فشل الطلب", async () => {
    mockFetchOnce(422, { errors: ["Buying price must be a number"] });
    await expect(api("POST", "/products", { product: {} }, "KEY")).rejects.toThrow(/^API 422:/);
  });

  it("يُرجع {} للرد الفارغ الناجح", async () => {
    mockFetchOnce(200, "");
    expect(await api("GET", "/accounts", null, "KEY")).toEqual({});
  });

  // [بلاغ حقيقي من المستخدم] "API 500: {status:500,error:Internal Server Error}"
  // بكل الأدوات — بلا ذكر المسار، ومع أربع عمليات جلب متوازية عند إدخال المفتاح
  // كان يستحيل معرفة أيّها فشل.
  it("يذكر المسار والطريقة بنهاية رسالة الخطأ (مع إبقاء البادئة 'API <رمز>:' كما هي)", async () => {
    mockFetchOnce(422, { errors: ["bad"] });
    await expect(api("POST", "/products", { product: {} }, "KEY"))
      .rejects.toThrow(/^API 422:.*POST \/products/s);
  });

  it("خطأ 5xx يُوضِّح أنه من خوادم قيود لا من الأداة", async () => {
    mockFetchOnce(500, { status: 500, error: "Internal Server Error" });
    await expect(api("POST", "/products", {}, "KEY")).rejects.toThrow(/خوادم قيود/);
  });

  it("GET على 5xx: محاولة إضافية واحدة تلقائيًا (انقطاع لحظي يُتجاوَز)", async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call++;
      if (call === 1) return { ok: false, status: 500, text: async () => '{"status":500,"error":"Internal Server Error"}' };
      return { ok: true, status: 200, text: async () => JSON.stringify({ taxes: [] }) };
    });
    expect(await api("GET", "/taxes", null, "KEY")).toEqual({ taxes: [] });
    expect(call).toBe(2);
  });

  it("GET على 5xx مستمر: يفشل بعد المحاولة الإضافية (لا إخفاء انقطاع حقيقي)", async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call++;
      return { ok: false, status: 500, text: async () => "boom" };
    });
    await expect(api("GET", "/taxes", null, "KEY")).rejects.toThrow(/^API 500:/);
    expect(call).toBe(2);
  });

  it("POST على 5xx لا يُعاد إطلاقًا (تكراره قد يُنشئ الكيان مرتين)", async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call++;
      return { ok: false, status: 500, text: async () => "boom" };
    });
    await expect(api("POST", "/products", { product: {} }, "KEY")).rejects.toThrow(/^API 500:/);
    expect(call).toBe(1);
  });
});

describe("fetchAll() — إصلاح 404 كقائمة فارغة", () => {
  it("يُعامل 404 كقائمة فارغة بدل رمي خطأ (منشأة جديدة بلا منتجات)", async () => {
    mockFetchOnce(404, "We found nothing");
    const result = await fetchAll("/products", "KEY");
    expect(result).toEqual([]);
  });

  it("يرمي أي خطأ آخر (401/500) كالمعتاد", async () => {
    mockFetchOnce(401, "Unauthorized");
    await expect(fetchAll("/products", "KEY")).rejects.toThrow(/^API 401:/);
  });

  it("يجمع كل الصفحات حتى صفحة أصغر من 100 عنصر", async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call++;
      const items = call === 1 ? Array.from({ length: 100 }, (_, i) => ({ id: i })) : [{ id: 999 }];
      return { ok: true, status: 200, text: async () => JSON.stringify({ accounts: items }) };
    });
    const result = await fetchAll("/accounts", "KEY");
    expect(result).toHaveLength(101);
    expect(call).toBe(2);
  });

  // [الخطأ الحقيقي] GET /projects يرجع مصفوفة خام بلا مفتاح جذر (مؤكَّد من
  // توثيق Qoyod الرسمي) — الاستخراج القديم res[Object.keys(res)[0]] كان يأخذ
  // العنصر الأول فقط (Object.keys(array)[0] === "0")، فتظل المشاريع فارغة دوماً
  // بصمت رغم وجودها فعلياً — يؤثر على أداتي استيراد القيود وفواتير المبيعات معاً.
  it("[الخطأ الحقيقي] مصفوفة خام بلا مفتاح جذر (GET /projects) تُقرأ كاملة لا كعنصر أول فقط", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => JSON.stringify([{ id: 1, name: 'مشروع أ' }, { id: 2, name: 'مشروع ب' }]),
    });
    const result = await fetchAll("/projects", "KEY");
    expect(result).toEqual([{ id: 1, name: 'مشروع أ' }, { id: 2, name: 'مشروع ب' }]);
  });

  // [إضافة، تصحيح بعد اختبار حي ثانٍ] اكتُشِف ميدانيًا مع /categories لمنشأة
  // عميل حقيقية: صفحة تالية بنفس id الصفحة الأولى بالضبط تعني "البيانات اكتملت
  // فعليًا" (سيناريو حقيقي: صفحة أولى أرجعت أكثر من per_page المطلوب، فالشرط
  // الأصلي items.length<100 لم يوقف الحلقة رغم اكتمال البيانات) — توقف طبيعي
  // بلا خطأ، لا رمي استثناء. حد الصفحات الدفاعي (500) يبقى الحارس الوحيد لتكرار
  // لا نهائي حقيقي (بيانات تنمو بلا توقف أبدًا، لا تتكرر فقط).
  it("[إضافة] الصفحة الثانية بنفس معرّفات (id) الصفحة الأولى بلا أي جديد ⇒ توقف طبيعي ناجح بلا خطأ (لا صفحة 500)", async () => {
    const sameItems = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true, status: 200, text: async () => JSON.stringify({ categories: sameItems }),
    }));
    const result = await fetchAll("/categories", "KEY");
    expect(result).toHaveLength(100);
    expect(global.fetch).toHaveBeenCalledTimes(2); // صفحة 1 (كل شيء جديد) + صفحة 2 (لا جديد ⇒ توقف) فقط، لا 500
  });

  // [إضافة] السيناريو الحي بالضبط الذي كشف الإصلاح أعلاه: صفحة أولى تُرجع 101
  // عنصر (أكثر من per_page=100 المطلوب) فلا ينطبق شرط "آخر صفحة" (101 ليست
  // أقل من 100)، صفحة ثانية تكرار تام لنفس الـ101 ⇒ يجب أن تُرجَع الـ101 كاملة
  // بلا خطأ ولا نقص ولا تكرار.
  it("[إضافة] صفحة أولى تتجاوز per_page المطلوب (101>100) ثم صفحة ثانية مكرّرة بالكامل ⇒ 101 عنصر فريد بلا خطأ", async () => {
    const items = Array.from({ length: 101 }, (_, i) => ({ id: i }));
    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true, status: 200, text: async () => JSON.stringify({ categories: items }),
    }));
    const result = await fetchAll("/categories", "KEY");
    expect(result).toHaveLength(101);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("[إضافة] عناصر جديدة فعليًا بكل صفحة (id مختلفة) لا تُطلِق كاشف التكرار مطلقًا", async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call++;
      const items = call === 1
        ? Array.from({ length: 100 }, (_, i) => ({ id: i }))
        : Array.from({ length: 50 }, (_, i) => ({ id: 100 + i })); // صفحة ثانية بمعرّفات جديدة كليًا، أقل من 100 فتنهي الحلقة طبيعيًا
      return { ok: true, status: 200, text: async () => JSON.stringify({ categories: items }) };
    });
    const result = await fetchAll("/categories", "KEY");
    expect(result).toHaveLength(150);
  });

  it("[إضافة] عناصر بلا حقل id أصلًا ⇒ كاشف التكرار يُعطَّل بلا أي تأثير على السلوك السابق", async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call++;
      const items = call === 1 ? Array.from({ length: 100 }, () => ({ name: 'x' })) : [{ name: 'y' }];
      return { ok: true, status: 200, text: async () => JSON.stringify({ categories: items }) };
    });
    const result = await fetchAll("/categories", "KEY");
    expect(result).toHaveLength(101);
  });

  it("[إضافة] onPage يُستدعى بعد كل صفحة بإجمالي العناصر المُجمَّعة ورقم الصفحة", async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call++;
      const items = call === 1 ? Array.from({ length: 100 }, (_, i) => ({ id: i })) : [{ id: 999 }];
      return { ok: true, status: 200, text: async () => JSON.stringify({ accounts: items }) };
    });
    const pages = [];
    await fetchAll("/accounts", "KEY", { onPage: (total, page) => pages.push([total, page]) });
    expect(pages).toEqual([[100, 1], [101, 2]]);
  });

  // [إضافة — بلاغ حقيقي من المستخدم] خطأ 500 مؤكَّد من خوادم قيود نفسها (أُعيد
  // إنتاجه مباشرة بـfetch خام من console المتصفح، بلا أي كود من هذا المشروع)
  // لبعض المنشآت التي تملك أكثر من 100 حساب: page=1&per_page=100 ينجح دومًا،
  // لكن أي طلب آخر (صفحة تالية، حجم أكبر، أو الجلب الكامل) يفشل بنفس 500. كان
  // هذا يُسقِط fetchAll بالكامل فتتوقف كل الأداة رغم توفر 100 حساب حقيقي فعلاً.
  describe("خطأ 5xx متكرر بعد صفحة أولى ناجحة: توقف بما تجمَّع بدل إسقاط كل شيء", () => {
    it("يُرجع أول 100 عنصر (لا يرمي خطأ) ويُعلِّم الناتج بخاصية غير قابلة للتعداد", async () => {
      let call = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        call++;
        if (call === 1) {
          const items = Array.from({ length: 100 }, (_, i) => ({ id: i, code: String(i) }));
          return { ok: true, status: 200, text: async () => JSON.stringify({ accounts: items }) };
        }
        return { ok: false, status: 500, text: async () => '{"status":500,"error":"Internal Server Error"}' };
      });
      const result = await fetchAll("/accounts", "KEY");
      expect(result).toHaveLength(100);
      expect(result.qoyodFetchTruncatedError).toMatch(/^API 500:/);
      // غير قابلة للتعداد: لا تظهر بـJSON.stringify ولا Object.keys ولا تُحسَب بـ.length
      expect(JSON.stringify(result)).not.toContain("qoyodFetchTruncatedError");
      expect(Object.keys(result)).toHaveLength(100);
    }, 10000);

    it("فشل الصفحة الأولى نفسها (لا بيانات إطلاقًا) يبقى يرمي خطأ كالمعتاد — لا يُعامَل كنجاح جزئي", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
      await expect(fetchAll("/accounts", "KEY")).rejects.toThrow(/^API 500:/);
    }, 10000);
  });
});
