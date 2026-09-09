import { describe, it, expect, vi, beforeEach } from "vitest";
import { pushAccountsToQoyod } from "../qoyodAccountPush.js";

vi.mock("../../product-upload/io/network.js", () => ({
  api: vi.fn(),
  fetchAll: vi.fn(),
}));
import { api, fetchAll } from "../../product-upload/io/network.js";

function row(code, nameEn, nameAr, extra = {}) {
  return { code, nameEn, nameAr, level2Category: "المبيعات", type: "المبيعات", desc: "", payCollect: "No", ...extra };
}

describe("pushAccountsToQoyod", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("يرفض بلا مفتاح API قبل أي طلب شبكة", async () => {
    const result = await pushAccountsToQoyod([row("1", "A", "أ")], "");
    expect(result.fatalError).toBeTruthy();
    expect(fetchAll).not.toHaveBeenCalled();
  });

  it("يجلب الحسابات الحالية أولاً، ثم يرسل كل صف غير مكرر بنجاح (بلا تخطي)", async () => {
    fetchAll.mockResolvedValue([]); // لا حسابات موجودة مسبقًا
    api.mockImplementation(async (method, path, body) => {
      expect(method).toBe("POST");
      expect(path).toBe("/accounts");
      return { account: { id: 500 + Math.floor(Math.random() * 100), ...body.account } };
    });

    const rows = [row("4101", "Sales A", "مبيعات أ"), row("4102", "Sales B", "مبيعات ب")];
    const result = await pushAccountsToQoyod(rows, "fake-key");

    expect(fetchAll).toHaveBeenCalledWith("/accounts", "fake-key");
    expect(api).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.stoppedEarly).toBe(false);
    expect(result.entries.every((e) => e.status === "success")).toBe(true);
  });

  it("يتخطى صف مكرر (بالرمز أو الاسم) بلا إرسال POST له، ويكمل الباقي", async () => {
    fetchAll.mockResolvedValue([{ id: 1, code: "4101", name_en: "Existing", name_ar: "موجود" }]);
    api.mockResolvedValue({ account: { id: 999 } });

    const rows = [row("4101", "Sales A", "مبيعات أ"), row("4102", "Sales B", "مبيعات ب")];
    const result = await pushAccountsToQoyod(rows, "fake-key");

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(1);
    expect(api).toHaveBeenCalledTimes(1); // الصف المكرر ما استدعى POST إطلاقًا
    expect(result.entries[0].status).toBe("skip");
    expect(result.entries[1].status).toBe("success");
  });

  it("يتوقف بالكامل فورًا عند أول فشل POST (قرار المستخدم الصريح) — ما يكمل لباقي الصفوف", async () => {
    fetchAll.mockResolvedValue([]);
    api
      .mockResolvedValueOnce({ account: { id: 1 } })
      .mockRejectedValueOnce(new Error("API 422: name already taken"));

    const rows = [row("4101", "A", "أ"), row("4102", "B", "ب"), row("4103", "C", "ج")];
    const result = await pushAccountsToQoyod(rows, "fake-key");

    expect(api).toHaveBeenCalledTimes(2); // الصف الثالث ما وصل له الإرسال إطلاقًا
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.stoppedEarly).toBe(true);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1].status).toBe("error");
    expect(result.entries[1].reason).toContain("422");
  });

  it("يتوقف بالكامل فورًا لو صف واحد بلا نوع قابل للتحويل (فشل بناء الحمولة نفسه، بلا أي طلب POST له)", async () => {
    fetchAll.mockResolvedValue([]);
    api.mockResolvedValue({ account: { id: 1 } });

    const rows = [row("4101", "A", "أ"), row("4102", "B", "ب", { type: "غير معروف", level2Category: "غير معروف" }), row("4103", "C", "ج")];
    const result = await pushAccountsToQoyod(rows, "fake-key");

    expect(api).toHaveBeenCalledTimes(1); // فقط الصف الأول نجح، الثاني فشل بناء الحمولة فأوقف كل شي
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.stoppedEarly).toBe(true);
    expect(result.entries[1].status).toBe("error");
  });

  it("يتوقف فورًا لو stoppedRef.current صار true بين صفين (إيقاف يدوي من المستخدم)", async () => {
    fetchAll.mockResolvedValue([]);
    const stoppedRef = { current: false };
    api.mockImplementation(async () => {
      stoppedRef.current = true; // يحاكي ضغط المستخدم "إيقاف" أثناء إرسال الصف الأول
      return { account: { id: 1 } };
    });

    const rows = [row("4101", "A", "أ"), row("4102", "B", "ب")];
    const result = await pushAccountsToQoyod(rows, "fake-key", { stoppedRef });

    expect(api).toHaveBeenCalledTimes(1);
    expect(result.stoppedEarly).toBe(true);
    expect(result.sent).toBe(1);
  });

  it("فشل جلب حسابات العميل الحالية (فحص التكرار) يوقف كل شي قبل أي POST — بلا فحص تكرار، لا إرسال آمن", async () => {
    fetchAll.mockRejectedValue(new Error("network down"));
    const result = await pushAccountsToQoyod([row("1", "A", "أ")], "fake-key");
    expect(result.fatalError).toContain("network down");
    expect(api).not.toHaveBeenCalled();
  });
});
