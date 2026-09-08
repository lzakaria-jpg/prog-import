// تعيين كلمة مرور أول مرة — يعمل فقط لو المستخدم موجود بجدول users، مفعَّل،
// وليس له كلمة مرور محفوظة بعد (وإلا يُرفض ويُطلب استخدام "تغيير كلمة المرور"
// أو "نسيت كلمة المرور" بدلًا منه).
import { corsHeaders } from "../../shared-server/cors.js";
import { generateSalt, hashPassword, isValidNewPassword } from "../../shared-server/authCrypto.js";
import { getUserRow, getCredentials, upsertCredentials, insertAuditLog } from "../../shared-server/supabaseAdmin.js";

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
  const newPassword = String(payload?.newPassword || "");
  if (!email || !isValidNewPassword(newPassword)) {
    return new Response(JSON.stringify({ ok: false, reason: "invalid" }), { status: 400, headers: CORS_HEADERS });
  }

  try {
    const user = await getUserRow(context.env, email);
    if (!user || user.role === "owner" || user.active === false) {
      return new Response(JSON.stringify({ ok: false, reason: "invalid" }), { status: 200, headers: CORS_HEADERS });
    }

    const existing = await getCredentials(context.env, email);
    if (existing && existing.password_hash) {
      return new Response(JSON.stringify({ ok: false, reason: "already_set" }), { status: 200, headers: CORS_HEADERS });
    }

    const salt = generateSalt();
    const hash = await hashPassword(newPassword, salt);
    await upsertCredentials(context.env, email, {
      password_hash: hash, password_salt: salt, failed_login_attempts: 0, locked_until: null,
      reset_token_hash: null, reset_token_expires_at: null,
    });
    await insertAuditLog(context.env, email, "initial_password_set", email, null);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS_HEADERS });
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
