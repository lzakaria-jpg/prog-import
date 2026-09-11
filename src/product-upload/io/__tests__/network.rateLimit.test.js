// اختبار المُنظِّم المركزي لطلبات API (300 طلب/60 ثانية، حد Qoyod الرسمي —
// راجع تعليق رأس waitForRateLimitSlot بـnetwork.js). ملف منفصل عن
// network.test.js عمدًا: النافذة الانزلاقية حالة مشتركة على مستوى الوحدة،
// وvitest يعزل كل ملف اختبار بوحدة مستقلة، فتبدأ هنا من صفر مضمون.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// [مهم] rateLimitCallTimestamps حالة مشتركة على مستوى الوحدة داخل network.js —
// لو استوردنا api() مرة واحدة أعلى الملف، تتراكم الطلبات بين الاختبارين (300
// بالأول + 300 بالثاني = يتجاوز الحد فورًا بالثاني ويعلَّق). vi.resetModules()
// + استيراد ديناميكي طازج بكل اختبار يضمن نافذة انزلاقية فارغة من الصفر دومًا.
async function freshApi() {
  vi.resetModules();
  const mod = await import("../network.js");
  return mod.api;
}

function mockFetchInstant() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => "{}",
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockFetchInstant();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("api() — المُنظِّم المركزي لحد 300 طلب/60 ثانية", () => {
  it("لا يضيف أي تأخير طالما دون الحد (300 نداء متتالٍ يُنجَز بلا setTimeout)", async () => {
    const api = await freshApi();
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    const calls = Array.from({ length: 300 }, () => api("GET", "/accounts", null, "KEY"));
    await Promise.all(calls);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it("النداء رقم 301 خلال نفس النافذة ينتظر حتى يتقادم أقدم نداء قبل إرساله فعليًا", async () => {
    const api = await freshApi();
    await Promise.all(Array.from({ length: 300 }, () => api("GET", "/accounts", null, "KEY")));
    expect(global.fetch).toHaveBeenCalledTimes(300);

    let resolved = false;
    const p = api("GET", "/accounts", null, "KEY").then(() => { resolved = true; });

    // ما زال بانتظار الفتحة — الطلب الفعلي (fetch) لم يُرسَل بعد رقم 301
    await vi.advanceTimersByTimeAsync(100);
    expect(global.fetch).toHaveBeenCalledTimes(300);
    expect(resolved).toBe(false);

    // بعد تقادم أول نداء بالنافذة (٦٠ ثانية) يُسمح بالنداء 301
    await vi.advanceTimersByTimeAsync(60000);
    await p;
    expect(resolved).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(301);
  });
});
