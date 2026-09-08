// اختبار تكاملي كامل لدوال المصادقة الخمس الجديدة، بمحاكاة طبقة PostgREST
// (Supabase) عبر fetch وهمي في الذاكرة — يغطي التدفقات الحقيقية فعليًا (لا
// افتراضًا): تعيين أول مرة، دخول صحيح/خاطئ، القفل بعد محاولات فاشلة، طلب/إتمام
// إعادة التعيين عبر رمز، وتغيير كلمة المرور الذاتي. هذا أقصى تحقق ممكن بلا
// اتصال فعلي بقاعدة بيانات Supabase حقيقية — الاتصال الحي نفسه يُختبر لاحقًا
// بفرع test بعد إعداد المتغيرات على Cloudflare Pages.
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── قاعدة بيانات وهمية في الذاكرة ──────────────────────────────────────
let db;
function resetDb() {
  db = {
    users: [
      { email: "owner@qoyod.com", role: "owner", active: true },
      { email: "sara@qoyod.com", role: "user", active: true },
      { email: "ahmed@qoyod.com", role: "user", active: true },
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

const sentEmails = [];

function installFakeFetch() {
  global.fetch = vi.fn(async (url, options = {}) => {
    const u = new URL(url);
    if (u.hostname === "api.resend.com") {
      sentEmails.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ id: "fake" }), { status: 200 });
    }
    if (u.hostname.includes("supabase.co")) {
      const table = u.pathname.replace("/rest/v1/", "");
      const filters = parseFilters(u.search);
      if ((!options.method || options.method === "GET")) {
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

const ENV = { SUPABASE_SERVICE_ROLE_KEY: "test-service-key", RESEND_API_KEY: "test-resend-key", RESEND_FROM: "noreply@test.com" };

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
  sentEmails.length = 0;
  installFakeFetch();
  vi.resetModules();
});

describe("auth-set-initial-password", () => {
  it("ينجح لمستخدم بلا كلمة مرور محفوظة، ويرفض إعادة المحاولة بعدها", async () => {
    const r1 = await callFn("../../functions/api/auth-set-initial-password.js", { email: "sara@qoyod.com", newPassword: "12345678" });
    expect(r1.json).toEqual({ ok: true });
    expect(db.user_credentials.find((c) => c.email === "sara@qoyod.com").password_hash).toBeTruthy();
    expect(db.audit_log.some((a) => a.action === "initial_password_set" && a.actor_email === "sara@qoyod.com")).toBe(true);

    const r2 = await callFn("../../functions/api/auth-set-initial-password.js", { email: "sara@qoyod.com", newPassword: "another1" });
    expect(r2.json).toEqual({ ok: false, reason: "already_set" });
  });

  it("يرفض كلمة مرور أقل من 8 رموز", async () => {
    const r = await callFn("../../functions/api/auth-set-initial-password.js", { email: "ahmed@qoyod.com", newPassword: "short" });
    expect(r.status).toBe(400);
    expect(r.json.ok).toBe(false);
  });

  it("يرفض المالك والمستخدم المعطَّل", async () => {
    const rOwner = await callFn("../../functions/api/auth-set-initial-password.js", { email: "owner@qoyod.com", newPassword: "12345678" });
    expect(rOwner.json).toEqual({ ok: false, reason: "invalid" });
    const rDisabled = await callFn("../../functions/api/auth-set-initial-password.js", { email: "disabled@qoyod.com", newPassword: "12345678" });
    expect(rDisabled.json).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("auth-login", () => {
  it("يرجّع no_password_set لمستخدم لم يعيّن كلمة مرور بعد", async () => {
    const r = await callFn("../../functions/api/auth-login.js", { email: "sara@qoyod.com", password: "anything1" });
    expect(r.json).toEqual({ ok: false, reason: "no_password_set" });
  });

  it("دخول صحيح بعد تعيين كلمة المرور", async () => {
    await callFn("../../functions/api/auth-set-initial-password.js", { email: "sara@qoyod.com", newPassword: "correctPW1" });
    const r = await callFn("../../functions/api/auth-login.js", { email: "sara@qoyod.com", password: "correctPW1" });
    expect(r.json).toEqual({ ok: true });
  });

  it("يقفل الحساب بعد 5 محاولات فاشلة، ويرفض حتى لو كانت كلمة المرور صحيحة أثناء القفل", async () => {
    await callFn("../../functions/api/auth-set-initial-password.js", { email: "sara@qoyod.com", newPassword: "correctPW1" });
    for (let i = 0; i < 4; i++) {
      const r = await callFn("../../functions/api/auth-login.js", { email: "sara@qoyod.com", password: "wrong" });
      expect(r.json.reason).toBe("invalid");
    }
    const r5 = await callFn("../../functions/api/auth-login.js", { email: "sara@qoyod.com", password: "wrong" });
    expect(r5.json.reason).toBe("locked");
    expect(db.audit_log.some((a) => a.action === "login_locked")).toBe(true);

    const rCorrectButLocked = await callFn("../../functions/api/auth-login.js", { email: "sara@qoyod.com", password: "correctPW1" });
    expect(rCorrectButLocked.json.reason).toBe("locked");
  });

  it("نجاح تسجيل الدخول يصفّر عدّاد المحاولات الفاشلة السابقة", async () => {
    await callFn("../../functions/api/auth-set-initial-password.js", { email: "sara@qoyod.com", newPassword: "correctPW1" });
    await callFn("../../functions/api/auth-login.js", { email: "sara@qoyod.com", password: "wrong" });
    await callFn("../../functions/api/auth-login.js", { email: "sara@qoyod.com", password: "wrong" });
    await callFn("../../functions/api/auth-login.js", { email: "sara@qoyod.com", password: "correctPW1" });
    const creds = db.user_credentials.find((c) => c.email === "sara@qoyod.com");
    expect(creds.failed_login_attempts).toBe(0);
  });

  it("يرفض المالك دائمًا (له مسار منفصل تمامًا) والمستخدم المعطَّل", async () => {
    const rOwner = await callFn("../../functions/api/auth-login.js", { email: "owner@qoyod.com", password: "whatever1" });
    expect(rOwner.json).toEqual({ ok: false, reason: "invalid" });
    await callFn("../../functions/api/auth-set-initial-password.js", { email: "disabled@qoyod.com", newPassword: "x" }).catch(() => {});
    const rDisabled = await callFn("../../functions/api/auth-login.js", { email: "disabled@qoyod.com", password: "whatever1" });
    expect(rDisabled.json).toEqual({ ok: false, reason: "deactivated" });
  });
});

describe("auth-request-reset + auth-reset-password", () => {
  it("يرسل رابط إعادة تعيين لمستخدم موجود، ورسالة عامة مطابقة لمستخدم غير موجود (بلا تسريب)", async () => {
    const rExisting = await callFn("../../functions/api/auth-request-reset.js", { email: "ahmed@qoyod.com" });
    const rMissing = await callFn("../../functions/api/auth-request-reset.js", { email: "nobody@qoyod.com" });
    expect(rExisting.json).toEqual(rMissing.json); // نفس الرسالة تمامًا بلا أي فرق
    expect(sentEmails.length).toBe(1); // بريد وحد فقط أُرسل فعليًا (للمستخدم الموجود)
    expect(sentEmails[0].to).toEqual(["ahmed@qoyod.com"]);
  });

  it("رابط إعادة التعيين يعمل مرة واحدة فقط، ويفشل عند إعادة الاستخدام", async () => {
    await callFn("../../functions/api/auth-request-reset.js", { email: "ahmed@qoyod.com" });
    const emailHtml = sentEmails[0].html;
    const token = /reset=([0-9a-f]+)/.exec(emailHtml)[1];

    const rReset1 = await callFn("../../functions/api/auth-reset-password.js", { token, newPassword: "brandNew1" });
    expect(rReset1.json).toEqual({ ok: true });
    expect(db.audit_log.some((a) => a.action === "password_reset_completed" && a.actor_email === "ahmed@qoyod.com")).toBe(true);

    const rReset2 = await callFn("../../functions/api/auth-reset-password.js", { token, newPassword: "anotherOne1" });
    expect(rReset2.json).toEqual({ ok: false, reason: "invalid_or_expired" });

    // كلمة المرور الجديدة فعليًا تعمل بتسجيل الدخول
    const rLogin = await callFn("../../functions/api/auth-login.js", { email: "ahmed@qoyod.com", password: "brandNew1" });
    expect(rLogin.json).toEqual({ ok: true });
  });

  it("رمز منتهي الصلاحية يُرفض", async () => {
    await callFn("../../functions/api/auth-request-reset.js", { email: "ahmed@qoyod.com" });
    const token = /reset=([0-9a-f]+)/.exec(sentEmails[0].html)[1];
    // نحاكي انتهاء الصلاحية يدويًا بتعديل الوقت المخزَّن مباشرة بالقاعدة الوهمية
    const rec = db.user_credentials.find((c) => c.email === "ahmed@qoyod.com");
    rec.reset_token_expires_at = new Date(Date.now() - 1000).toISOString();
    const r = await callFn("../../functions/api/auth-reset-password.js", { token, newPassword: "brandNew1" });
    expect(r.json).toEqual({ ok: false, reason: "invalid_or_expired" });
  });

  it("طلب إعادة تعيين متكرر خلال أقل من دقيقة لا يرسل بريدًا ثانيًا (حماية من الإغراق)", async () => {
    await callFn("../../functions/api/auth-request-reset.js", { email: "ahmed@qoyod.com" });
    await callFn("../../functions/api/auth-request-reset.js", { email: "ahmed@qoyod.com" });
    expect(sentEmails.length).toBe(1);
  });
});

describe("auth-change-password", () => {
  it("ينجح بكلمة المرور الحالية الصحيحة، ويرفض بكلمة مرور حالية خاطئة", async () => {
    await callFn("../../functions/api/auth-set-initial-password.js", { email: "sara@qoyod.com", newPassword: "originalPW1" });

    const rWrong = await callFn("../../functions/api/auth-change-password.js", { email: "sara@qoyod.com", currentPassword: "wrongOne", newPassword: "newOne123" });
    expect(rWrong.json).toEqual({ ok: false, reason: "wrong_current_password" });

    const rOk = await callFn("../../functions/api/auth-change-password.js", { email: "sara@qoyod.com", currentPassword: "originalPW1", newPassword: "newOne123" });
    expect(rOk.json).toEqual({ ok: true });
    expect(db.audit_log.some((a) => a.action === "password_changed")).toBe(true);

    const rLoginOld = await callFn("../../functions/api/auth-login.js", { email: "sara@qoyod.com", password: "originalPW1" });
    expect(rLoginOld.json.reason).toBe("invalid");
    const rLoginNew = await callFn("../../functions/api/auth-login.js", { email: "sara@qoyod.com", password: "newOne123" });
    expect(rLoginNew.json).toEqual({ ok: true });
  });
});
