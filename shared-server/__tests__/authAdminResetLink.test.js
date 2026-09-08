// اختبار تكاملي لمسار "توليد رابط إعادة تعيين يدوي من الأدمن"
// (auth-admin-generate-reset-link.js) — البديل الجديد لمسار البريد المعطَّل
// حاليًا من الواجهة. يغطي: تحقق كلمة مرور Full User Manager فعليًا على
// الخادم، رفض المستخدم العادي فورًا، تجاوز التحقق التشفيري لحالة المالك (قيد
// معروف وموثَّق — راجع تعليق الملف نفسه)، ورفض الأهداف غير الصالحة (مالك/
// معطَّل/غير موجود). الرابط الناتج يُختبر أيضًا فعليًا عبر auth-reset-password.js
// للتأكد أنه صالح للاستخدام الحقيقي لا مجرد شكل نص.
import { describe, it, expect, beforeEach, vi } from "vitest";

let db;
function resetDb() {
  db = {
    users: [
      { email: "owner@qoyod.com", role: "owner", active: true },
      { email: "manager@qoyod.com", role: "full_user_manager", active: true },
      { email: "sara@qoyod.com", role: "user", active: true },
      { email: "disabled@qoyod.com", role: "user", active: false },
    ],
    user_credentials: [],
    audit_log: [],
  };
}

function parseFilters(search) {
  const params = new URLSearchParams(search);
  const filters = {};
  for (const [key, val] of params.entries()) {
    if (key === "select" || key === "limit" || key === "on_conflict") continue;
    const m = /^eq\.(.*)$/.exec(val);
    filters[key] = m ? decodeURIComponent(m[1]) : val;
  }
  return filters;
}

function installFakeFetch() {
  global.fetch = vi.fn(async (url, options = {}) => {
    const u = new URL(url);
    if (u.hostname.includes("supabase.co")) {
      const table = u.pathname.replace("/rest/v1/", "");
      const filters = parseFilters(u.search);
      if (!options.method || options.method === "GET") {
        const rows = (db[table] || []).filter((r) => Object.entries(filters).every(([k, v]) => String(r[k]) === String(v)));
        return new Response(JSON.stringify(rows), { status: 200 });
      }
      if (options.method === "POST" && table.startsWith("user_credentials")) {
        const body = JSON.parse(options.body);
        const idx = db.user_credentials.findIndex((r) => r.email === body.email);
        if (idx >= 0) db.user_credentials[idx] = { ...db.user_credentials[idx], ...body };
        else db.user_credentials.push({ ...body });
        return new Response(JSON.stringify([body]), { status: 201 });
      }
      if (options.method === "POST" && table.startsWith("audit_log")) {
        db.audit_log.push(JSON.parse(options.body));
        return new Response(JSON.stringify([{}]), { status: 201 });
      }
    }
    throw new Error("مسار غير متوقع بالمحاكاة: " + url);
  });
}

const ENV = { SUPABASE_SERVICE_ROLE_KEY: "test-service-key" };

function makeContext(body) {
  return {
    request: new Request("https://test.iqoyod.pages.dev/api/x", {
      method: "POST",
      headers: { Origin: "https://test.iqoyod.pages.dev", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env: ENV,
  };
}

async function callFn(mod, body) {
  const { onRequestPost } = await import(mod);
  const res = await onRequestPost(makeContext(body));
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  resetDb();
  installFakeFetch();
  vi.resetModules();
});

const RESET_LINK_FN = "../../functions/api/auth-admin-generate-reset-link.js";
const RESET_PASSWORD_FN = "../../functions/api/auth-reset-password.js";
const SET_INITIAL_FN = "../../functions/api/auth-set-initial-password.js";
const LOGIN_FN = "../../functions/api/auth-login.js";

describe("auth-admin-generate-reset-link", () => {
  it("Full User Manager بكلمة مروره الصحيحة يولّد رابطًا صالحًا فعليًا لمستخدم عادي", async () => {
    await callFn(SET_INITIAL_FN, { email: "manager@qoyod.com", newPassword: "managerPW1" });

    const r = await callFn(RESET_LINK_FN, { actorEmail: "manager@qoyod.com", actorPassword: "managerPW1", targetEmail: "sara@qoyod.com" });
    expect(r.json.ok).toBe(true);
    expect(r.json.resetLink).toMatch(/reset=[0-9a-f]+$/);
    expect(r.json.expiresAt).toBeTruthy();

    // الرابط فعليًا صالح للاستخدام — إتمام إعادة التعيين به ينجح
    const token = /reset=([0-9a-f]+)$/.exec(r.json.resetLink)[1];
    const rComplete = await callFn(RESET_PASSWORD_FN, { token, newPassword: "brandNewSara1" });
    expect(rComplete.json).toEqual({ ok: true });
    const rLogin = await callFn(LOGIN_FN, { email: "sara@qoyod.com", password: "brandNewSara1" });
    expect(rLogin.json).toEqual({ ok: true });
  });

  it("صلاحية الرابط تقارب 60 دقيقة (أطول من مسار البريد القديم 30 دقيقة)", async () => {
    await callFn(SET_INITIAL_FN, { email: "manager@qoyod.com", newPassword: "managerPW1" });
    const before = Date.now();
    const r = await callFn(RESET_LINK_FN, { actorEmail: "manager@qoyod.com", actorPassword: "managerPW1", targetEmail: "sara@qoyod.com" });
    const minutesValid = (new Date(r.json.expiresAt).getTime() - before) / 60000;
    expect(minutesValid).toBeGreaterThan(55);
    expect(minutesValid).toBeLessThan(65);
  });

  it("يرفض Full User Manager بكلمة مرور خاطئة، ولا يولّد أي رمز للهدف", async () => {
    await callFn(SET_INITIAL_FN, { email: "manager@qoyod.com", newPassword: "managerPW1" });
    const r = await callFn(RESET_LINK_FN, { actorEmail: "manager@qoyod.com", actorPassword: "wrongPassword", targetEmail: "sara@qoyod.com" });
    expect(r.json).toEqual({ ok: false, reason: "wrong_actor_password" });
    expect(db.user_credentials.find((c) => c.email === "sara@qoyod.com")).toBeUndefined();
  });

  it("يرفض مستخدمًا عاديًا (لا صلاحية إدارة) فورًا بلا حاجة لتحقق كلمة مرور", async () => {
    const r = await callFn(RESET_LINK_FN, { actorEmail: "sara@qoyod.com", actorPassword: "anything123", targetEmail: "disabled@qoyod.com" });
    expect(r.json).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("المالك يقدر يولّد رابطًا (بلا تحقق تشفيري لكلمة مروره — قيد موثَّق)", async () => {
    const r = await callFn(RESET_LINK_FN, { actorEmail: "owner@qoyod.com", actorPassword: "whatever-non-empty", targetEmail: "sara@qoyod.com" });
    expect(r.json.ok).toBe(true);
    expect(r.json.resetLink).toMatch(/reset=[0-9a-f]+$/);
  });

  it("يرفض استهداف المالك نفسه", async () => {
    await callFn(SET_INITIAL_FN, { email: "manager@qoyod.com", newPassword: "managerPW1" });
    const r = await callFn(RESET_LINK_FN, { actorEmail: "manager@qoyod.com", actorPassword: "managerPW1", targetEmail: "owner@qoyod.com" });
    expect(r.json).toEqual({ ok: false, reason: "target_is_owner" });
  });

  it("يرفض مستخدمًا معطَّلًا كهدف", async () => {
    await callFn(SET_INITIAL_FN, { email: "manager@qoyod.com", newPassword: "managerPW1" });
    const r = await callFn(RESET_LINK_FN, { actorEmail: "manager@qoyod.com", actorPassword: "managerPW1", targetEmail: "disabled@qoyod.com" });
    expect(r.json).toEqual({ ok: false, reason: "target_inactive" });
  });

  it("يرفض هدفًا غير موجود", async () => {
    await callFn(SET_INITIAL_FN, { email: "manager@qoyod.com", newPassword: "managerPW1" });
    const r = await callFn(RESET_LINK_FN, { actorEmail: "manager@qoyod.com", actorPassword: "managerPW1", targetEmail: "nobody@qoyod.com" });
    expect(r.json).toEqual({ ok: false, reason: "target_not_found" });
  });

  it("يرفض طلبًا بلا كلمة مرور أدمن (حقل فارغ) بخطأ 400", async () => {
    const r = await callFn(RESET_LINK_FN, { actorEmail: "manager@qoyod.com", actorPassword: "", targetEmail: "sara@qoyod.com" });
    expect(r.status).toBe(400);
    expect(r.json.ok).toBe(false);
  });
});
