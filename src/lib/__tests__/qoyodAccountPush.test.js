import { describe, it, expect, vi, beforeEach } from "vitest";
import { pushAccountsToQoyod, isDuplicateApiError } from "../qoyodAccountPush.js";

vi.mock("../../product-upload/io/network.js", () => ({
  api: vi.fn(),
  fetchAll: vi.fn(),
  fetchAllByCursor: vi.fn(),
}));
import { api, fetchAll, fetchAllByCursor } from "../../product-upload/io/network.js";

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
    expect(fetchAllByCursor).not.toHaveBeenCalled();
  });

  it("يجلب الحسابات الحالية أولاً، ثم يرسل كل صف غير مكرر بنجاح (بلا تخطي)", async () => {
    fetchAllByCursor.mockResolvedValue([]); // لا حسابات موجودة مسبقًا
    api.mockImplementation(async (method, path, body) => {
      expect(method).toBe("POST");
      expect(path).toBe("/accounts");
      return { account: { id: 500 + Math.floor(Math.random() * 100), ...body.account } };
    });

    const rows = [row("4101", "Sales A", "مبيعات أ"), row("4102", "Sales B", "مبيعات ب")];
    const result = await pushAccountsToQoyod(rows, "fake-key");

    expect(fetchAllByCursor).toHaveBeenCalledWith("/accounts", "fake-key");
    expect(api).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.stoppedEarly).toBe(false);
    expect(result.entries.every((e) => e.status === "success")).toBe(true);
  });

  it("يتخطى صف مكرر (بالرمز أو الاسم) بلا إرسال POST له، ويكمل الباقي", async () => {
    fetchAllByCursor.mockResolvedValue([{ id: 1, code: "4101", name_en: "Existing", name_ar: "موجود" }]);
    api.mockResolvedValue({ account: { id: 999 } });

    const rows = [row("4101", "Sales A", "مبيعات أ"), row("4102", "Sales B", "مبيعات ب")];
    const result = await pushAccountsToQoyod(rows, "fake-key");

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(1);
    expect(api).toHaveBeenCalledTimes(1); // الصف المكرر ما استدعى POST إطلاقًا
    expect(result.entries[0].status).toBe("skip");
    expect(result.entries[1].status).toBe("success");
  });

  it("يتوقف بالكامل فورًا عند أول فشل POST حقيقي (غير تكرار) — قرار المستخدم الصريح — ما يكمل لباقي الصفوف", async () => {
    fetchAllByCursor.mockResolvedValue([]);
    api
      .mockResolvedValueOnce({ account: { id: 1 } })
      .mockRejectedValueOnce(new Error('API 422: {"error":"Invalid resource","messages":{"type":["is not included in the list"]}}'));

    const rows = [row("4101", "A", "أ"), row("4102", "B", "ب"), row("4103", "C", "ج")];
    const result = await pushAccountsToQoyod(rows, "fake-key");

    expect(api).toHaveBeenCalledTimes(2); // الصف الثالث ما وصل له الإرسال إطلاقًا
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.stoppedEarly).toBe(true);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1].status).toBe("error");
    expect(result.entries[1].reason).toContain("422");
  });

  // [تصحيح 2026-09-09] بلاغ اختبار حي: حساب "المدينون" (1102) كان موجودًا
  // فعليًا بمنشأة العميل لكن الفحص المسبق لم يلتقطه، فوصل POST فعلي ورفضه
  // Qoyod بـ422 "already taken" — وأوقف هذا كل العملية رغم أن الباقي فريد.
  // التصحيح: هذا تكرار حقيقي، يُعامَل كتخطٍّ ويُكمَل الباقي، لا كفشل يوقف كل شي.
  it("رفض 422 من Qoyod بسبب تكرار فعلي (already taken) يُعامَل كتخطٍّ، لا كفشل — ويُكمَل لباقي الصفوف", async () => {
    fetchAllByCursor.mockResolvedValue([]); // الفحص المسبق لم يلتقط التكرار (محاكاة فجوة الفهرسة الفعلية)
    api
      .mockResolvedValueOnce({ account: { id: 1 } })
      .mockRejectedValueOnce(new Error('API 422: {"error":"Invalid resource","messages":{"code":["code is already taken by id 52"]}}'))
      .mockResolvedValueOnce({ account: { id: 3 } });

    const rows = [row("1101", "Cash", "نقدية"), row("1102", "Accounts receivable", "المدينون"), row("1103", "Bank", "بنك")];
    const result = await pushAccountsToQoyod(rows, "fake-key");

    expect(api).toHaveBeenCalledTimes(3); // الصف الثالث وصله الإرسال فعلاً (لم تتوقف العملية)
    expect(result.sent).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.stoppedEarly).toBe(false);
    expect(result.entries).toHaveLength(3);
    expect(result.entries[1].status).toBe("skip");
    expect(result.entries[1].reason).toContain("موجود مسبقًا");
    expect(result.entries[2].status).toBe("success");
  });

  it("رفض 422 بسبب تكرار الاسم (name_en/name_ar already taken) يُعامَل أيضًا كتخطٍّ", async () => {
    fetchAllByCursor.mockResolvedValue([]);
    api.mockRejectedValueOnce(new Error('API 422: {"error":"Invalid resource","messages":{"name_ar":["name_ar is already taken"]}}'));

    const result = await pushAccountsToQoyod([row("9999", "Whatever", "أيًا كان")], "fake-key");

    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.stoppedEarly).toBe(false);
    expect(result.entries[0].status).toBe("skip");
  });

  it("يتوقف بالكامل فورًا لو صف واحد بلا نوع قابل للتحويل (فشل بناء الحمولة نفسه، بلا أي طلب POST له)", async () => {
    fetchAllByCursor.mockResolvedValue([]);
    api.mockResolvedValue({ account: { id: 1 } });

    const rows = [row("4101", "A", "أ"), row("4102", "B", "ب", { type: "غير معروف", level2Category: "غير معروف" }), row("4103", "C", "ج")];
    const result = await pushAccountsToQoyod(rows, "fake-key");

    expect(api).toHaveBeenCalledTimes(1); // فقط الصف الأول نجح، الثاني فشل بناء الحمولة فأوقف كل شي
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.stoppedEarly).toBe(true);
    expect(result.entries[1].status).toBe("error");
  });

  // [إضافة 2026-09-15] طلب المستخدم الصريح: حساب مقفل نظاميًا (مثال: المدينون/
  // accounts_receivable) يُستبعَد من الإرسال (تخطٍّ + تنبيه)، لا يُعامَل كفشل
  // يوقف الدفعة كاملة — خلافًا لأي فشل بناء حمولة آخر (الاختبار السابق أعلاه).
  it("حساب مقفل نظاميًا (مثال: المدينون) يُتخطى مع رسالة تنبيه، ويُكمَل لباقي الصفوف بلا توقف", async () => {
    fetchAllByCursor.mockResolvedValue([]);
    api.mockResolvedValue({ account: { id: 1 } });

    const rows = [
      row("4101", "A", "أ"),
      row("1102", "Accounts receivable", "المدينون", { type: "المدينون", level2Category: "الأصول المتداولة" }),
      row("4103", "C", "ج"),
    ];
    const result = await pushAccountsToQoyod(rows, "fake-key");

    expect(api).toHaveBeenCalledTimes(2); // الصف المقفل ما استدعى POST إطلاقًا، لكن الثالث وصله الإرسال
    expect(result.sent).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.stoppedEarly).toBe(false);
    expect(result.entries[1].status).toBe("skip");
    expect(result.entries[1].reason).toContain("المدينون");
  });

  it("يتوقف فورًا لو stoppedRef.current صار true بين صفين (إيقاف يدوي من المستخدم)", async () => {
    fetchAllByCursor.mockResolvedValue([]);
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
    fetchAllByCursor.mockRejectedValue(new Error("network down"));
    const result = await pushAccountsToQoyod([row("1", "A", "أ")], "fake-key");
    expect(result.fatalError).toContain("network down");
    expect(api).not.toHaveBeenCalled();
  });
});

// [إضافة — طلب صريح من المستخدم بأداة استيراد القيود: "المفترض الحساب الي ما
// ارسل يرسل غيره مباشر"] الحسابات الناقصة بتلك الأداة مستقلة عن بعضها تمامًا،
// فرفض واحد منها لا يبرّر تعطيل الباقي. أداة مطابقة شجرة الحسابات تبقى على
// قاعدتها الأصلية (توقف عند أول فشل) — الخيار اختياري وافتراضه false.
describe("pushAccountsToQoyod — continueOnError", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("الافتراضي (بلا الخيار): يتوقف عند أول فشل حقيقي كما كان تمامًا", async () => {
    fetchAllByCursor.mockResolvedValue([]);
    api.mockImplementation(async (m, p, body) => {
      if (body.account.code === "4102") throw new Error('API 422: {"messages":{"account_kind":["Invalid branch"]}}');
      return { account: { id: 1, ...body.account } };
    });
    const rows = [row("4101", "A", "أ"), row("4102", "B", "ب"), row("4103", "C", "ج")];
    const result = await pushAccountsToQoyod(rows, "fake-key");
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.stoppedEarly).toBe(true);
    expect(api).toHaveBeenCalledTimes(2); // الثالث لم يُرسَل إطلاقًا
  });

  it("مع continueOnError: يُبلِّغ عن الفاشل ويُكمل بقية الحسابات", async () => {
    fetchAllByCursor.mockResolvedValue([]);
    api.mockImplementation(async (m, p, body) => {
      if (body.account.code === "4102") throw new Error('API 422: {"messages":{"account_kind":["Invalid branch"]}}');
      return { account: { id: 1, ...body.account } };
    });
    const rows = [row("4101", "A", "أ"), row("4102", "B", "ب"), row("4103", "C", "ج")];
    const result = await pushAccountsToQoyod(rows, "fake-key", { continueOnError: true });
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.stoppedEarly).toBe(false);
    expect(api).toHaveBeenCalledTimes(3);
    expect(result.entries.map((e) => e.status)).toEqual(["success", "error", "success"]);
  });

  it("مع continueOnError: فشل بناء الحمولة (نوع غير معروف) لا يوقف الباقي أيضًا", async () => {
    fetchAllByCursor.mockResolvedValue([]);
    api.mockImplementation(async (m, p, body) => ({ account: { id: 1, ...body.account } }));
    const rows = [
      row("4101", "A", "أ"),
      row("4102", "B", "ب", { level2Category: "فئة غير موجودة إطلاقًا", type: "نوع مجهول" }),
      row("4103", "C", "ج"),
    ];
    const result = await pushAccountsToQoyod(rows, "fake-key", { continueOnError: true });
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.stoppedEarly).toBe(false);
  });
});

describe("isDuplicateApiError — اكتشاف رفض Qoyod بسبب تكرار فعلي (دفاع ثانٍ بعد الفحص المسبق)", () => {
  it("يكتشف شكل 422 الحقيقي المؤكد ميدانيًا لتكرار الرمز", () => {
    expect(isDuplicateApiError('API 422: {"error":"Invalid resource","messages":{"code":["code is already taken by id 52"]}}')).toBe(true);
  });

  it("يكتشف تكرار الاسم الإنجليزي أو العربي بنفس الشكل", () => {
    expect(isDuplicateApiError('API 422: {"messages":{"name_en":["name_en is already taken"]}}')).toBe(true);
    expect(isDuplicateApiError('API 422: {"messages":{"name_ar":["name_ar is already taken"]}}')).toBe(true);
  });

  it("لا يعتبره تكرارًا لو 422 لسبب آخر تمامًا (لا يحتوي already taken)", () => {
    expect(isDuplicateApiError('API 422: {"messages":{"type":["is not included in the list"]}}')).toBe(false);
  });

  it("لا يعتبره تكرارًا لو حالة الخطأ غير 422 (401/500...) حتى لو ذكرت شيئًا شبيهًا بالصدفة", () => {
    expect(isDuplicateApiError('API 500: already taken down for maintenance')).toBe(false);
    expect(isDuplicateApiError('API 401: Unauthorized')).toBe(false);
  });

  it("يتعامل بأمان مع رسائل فارغة/غير متوقعة بلا رمي استثناء", () => {
    expect(isDuplicateApiError("")).toBe(false);
    expect(isDuplicateApiError(undefined)).toBe(false);
    expect(isDuplicateApiError(null)).toBe(false);
  });
});
