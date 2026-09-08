// تسجيل الدخول لأي مستخدم غير المالك — يتحقق من كلمة المرور على السيرفر حصرًا
// (الهاش والملح لا يصلان للمتصفح إطلاقًا)، ويطبّق قفلًا مؤقتًا بعد محاولات
// فاشلة متكررة. مسار المالك (كلمة مرور مشتركة عبر app_settings) غير متأثر
// بهذا الملف إطلاقًا — يبقى كما هو بـsrc/auth.jsx.
import { corsHeaders } from "../../shared-server/cors.js";
import { hashPassword } from "../../shared-server/authCrypto.js";
import { getUserRow, getCredentials, upsertCredentials, insertAuditLog } from "../../shared-server/supabaseAdmin.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
  const CORS_HEADERS = { ...corsHeaders(context.request), "Content-Type": "application/json" };
  let payload;
  try {
    payload = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: "invalid_request" }), { status: 400, headers: CORS_HEADERS });
  }

  const email = String(payload?.email || "").trim().toLowerCase();
  const password = String(payload?.password || "");
  if (!email || !password) {
    return new Response(JSON.stringify({ ok: false, reason: "invalid" }), { status: 400, headers: CORS_HEADERS });
  }

  try {
    const user = await getUserRow(context.env, email);
    // مسار المالك له آلية منفصلة تمامًا (app_settings) — لا يُستخدم هذا المسار له إطلاقًا
    if (!user || user.role === "owner") {
      return new Response(JSON.stringify({ ok: false, reason: "invalid" }), { status: 200, headers: CORS_HEADERS });
    }
    if (user.active === false) {
      return new Response(JSON.stringify({ ok: false, reason: "deactivated" }), { status: 200, headers: CORS_HEADERS });
    }

    const creds = await getCredentials(context.env, email);
    if (!creds || !creds.password_hash) {
      // ما عيّن كلمة مرور بعد — الواجهة تحوّله تلقائيًا لشاشة "عيّن كلمة مرورك"
      return new Response(JSON.stringify({ ok: false, reason: "no_password_set" }), { status: 200, headers: CORS_HEADERS });
    }

    if (creds.locked_until && new Date(creds.locked_until).getTime() > Date.now()) {
      return new Response(JSON.stringify({ ok: false, reason: "locked", lockedUntil: creds.locked_until }), { status: 200, headers: CORS_HEADERS });
    }

    const calculated = await hashPassword(password, creds.password_salt);
    if (calculated === creds.password_hash) {
      await upsertCredentials(context.env, email, { failed_login_attempts: 0, locked_until: null });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS_HEADERS });
    }

    const attempts = (creds.failed_login_attempts || 0) + 1;
    const patch = { failed_login_attempts: attempts };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
    }
    await upsertCredentials(context.env, email, patch);
    if (patch.locked_until) {
      await insertAuditLog(context.env, email, "login_locked", email, { attempts });
      return new Response(JSON.stringify({ ok: false, reason: "locked", lockedUntil: patch.locked_until }), { status: 200, headers: CORS_HEADERS });
    }
    return new Response(JSON.stringify({ ok: false, reason: "invalid" }), { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, reason: "server_error", message: err.message }), { status: 500, headers: CORS_HEADERS });
  }
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return onRequestOptions(context);
  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: { ...corsHeaders(context.request), "Content-Type": "application/json" },
  });
}
