// [إضافة] اختبار المنطق النقي لتجميع جلسات المستخدم (buildSessionsFromActivityRows)
// — طلب صريح من المستخدم: مدة كل جلسة دخول لكل مستخدم بلوحة الإحصائيات. يغطي:
// جلسة بـlogout صريح (مدة دقيقة)، جلسة بلا logout (heartbeat فقط، تقديرية)،
// جلسة بلا أي نشاط بعد الدخول، أكثر من جلسة لنفس المستخدم، والجلسة "لا تزال
// مفتوحة" (ongoing) عند حداثة آخر نشاط.
import { describe, it, expect } from "vitest";
import { buildSessionsFromActivityRows, HEARTBEAT_INTERVAL_MS } from "../activityTracker.js";

describe("buildSessionsFromActivityRows", () => {
  it("بلا أي صفوف: قائمة فارغة", () => {
    expect(buildSessionsFromActivityRows([])).toEqual([]);
    expect(buildSessionsFromActivityRows(null)).toEqual([]);
  });

  it("جلسة بـlogout صريح: المدة دقيقة والسبب logout", () => {
    const rows = [
      { action: "login", created_at: "2026-09-13T10:00:00.000Z" },
      { action: "heartbeat", created_at: "2026-09-13T10:05:00.000Z" },
      { action: "logout", created_at: "2026-09-13T10:32:00.000Z" },
    ];
    const [s] = buildSessionsFromActivityRows(rows, { now: new Date("2026-09-13T11:00:00.000Z").getTime() });
    expect(s.endReason).toBe("logout");
    expect(s.durationMinutes).toBe(32);
    expect(s.ongoing).toBe(false);
  });

  it("جلسة بلا logout (heartbeat فقط): السبب activity (تقديرية)", () => {
    const rows = [
      { action: "login", created_at: "2026-09-13T10:00:00.000Z" },
      { action: "heartbeat", created_at: "2026-09-13T10:05:00.000Z" },
      { action: "heartbeat", created_at: "2026-09-13T10:10:00.000Z" },
    ];
    // "now" بعيد جداً عن آخر نشاط ⇒ الجلسة مغلقة فعلياً (المتصفح أُغلق على الأغلب)
    const farFuture = new Date("2026-09-13T10:10:00.000Z").getTime() + HEARTBEAT_INTERVAL_MS * 10;
    const [s] = buildSessionsFromActivityRows(rows, { now: farFuture });
    expect(s.endReason).toBe("activity");
    expect(s.durationMinutes).toBe(10);
    expect(s.ongoing).toBe(false);
  });

  it("دخول بلا أي نشاط لاحق: مدة صفر، السبب login_only", () => {
    const rows = [{ action: "login", created_at: "2026-09-13T10:00:00.000Z" }];
    const [s] = buildSessionsFromActivityRows(rows, { now: new Date("2026-09-13T12:00:00.000Z").getTime() });
    expect(s.endReason).toBe("login_only");
    expect(s.durationMinutes).toBe(0);
  });

  it("أكثر من جلسة لنفس المستخدم: كل login يقفل السابقة ويبدأ جديدة، الأحدث أولاً", () => {
    const rows = [
      { action: "login", created_at: "2026-09-13T09:00:00.000Z" },
      { action: "logout", created_at: "2026-09-13T09:20:00.000Z" },
      { action: "login", created_at: "2026-09-13T14:00:00.000Z" },
      { action: "heartbeat", created_at: "2026-09-13T14:15:00.000Z" },
    ];
    const sessions = buildSessionsFromActivityRows(rows, { now: new Date("2026-09-13T14:15:00.000Z").getTime() });
    expect(sessions).toHaveLength(2);
    expect(sessions[0].loginAt).toBe("2026-09-13T14:00:00.000Z"); // الأحدث أولاً
    expect(sessions[0].durationMinutes).toBe(15);
    expect(sessions[1].loginAt).toBe("2026-09-13T09:00:00.000Z");
    expect(sessions[1].durationMinutes).toBe(20);
  });

  it("الجلسة الأخيرة بلا logout وآخر نشاط حديث جداً ⇒ ongoing=true (متصل الآن)", () => {
    const loginAt = new Date("2026-09-13T10:00:00.000Z");
    const lastHeartbeat = new Date(loginAt.getTime() + 5 * 60000);
    const rows = [
      { action: "login", created_at: loginAt.toISOString() },
      { action: "heartbeat", created_at: lastHeartbeat.toISOString() },
    ];
    const now = lastHeartbeat.getTime() + 60000; // دقيقة بعد آخر نبض فقط
    const [s] = buildSessionsFromActivityRows(rows, { now });
    expect(s.ongoing).toBe(true);
  });

  it("جلسة قديمة (ليست الأحدث) لا تُعتبر ongoing أبداً حتى لو انتهت بلا logout", () => {
    const rows = [
      { action: "login", created_at: "2026-09-13T08:00:00.000Z" },
      { action: "heartbeat", created_at: "2026-09-13T08:05:00.000Z" },
      { action: "login", created_at: "2026-09-13T09:00:00.000Z" },
      { action: "logout", created_at: "2026-09-13T09:10:00.000Z" },
    ];
    const sessions = buildSessionsFromActivityRows(rows, { now: new Date("2026-09-13T09:10:05.000Z").getTime() });
    const oldSession = sessions.find((s) => s.loginAt === "2026-09-13T08:00:00.000Z");
    expect(oldSession.ongoing).toBe(false);
  });
});
