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
});
