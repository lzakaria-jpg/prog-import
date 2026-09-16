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

  // [إضافة، إصلاح خطأ حقيقي] اكتُشِف ميدانيًا مع /categories لمنشأة عميل حقيقية:
  // API يُرجع نفس المئة عنصر (نفس id) بلا تقدّم فعلي مهما زاد رقم page — بلا هذا
  // الإصلاح كانت الحلقة تستمر "بنجاح ظاهري" حتى MAX_FETCH_ALL_PAGES (500 طلب،
  // دقائق طويلة) قبل أن تتوقف. الآن تتوقف فورًا عند أول صفحة تالية بلا id جديد.
  it("[إضافة] الصفحة الثانية بنفس معرّفات (id) الصفحة الأولى بلا أي جديد ⇒ خطأ فوري بدل الانتظار حتى الحد الأقصى", async () => {
    const sameItems = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true, status: 200, text: async () => JSON.stringify({ categories: sameItems }),
    }));
    await expect(fetchAll("/categories", "KEY")).rejects.toThrow(/لا تحمل أي عنصر جديد/);
    expect(global.fetch).toHaveBeenCalledTimes(2); // صفحة 1 (كل شيء جديد) + صفحة 2 (لا جديد) فقط، لا 500
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
});
