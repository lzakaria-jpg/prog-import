// إتمام إعادة تعيين كلمة المرور عبر الرمز المُرسَل بالبريد — يتحقق أن الرمز
// صالح وغير منتهٍ ولم يُستخدم من قبل، ثم يحفظ كلمة المرور الجديدة ويُبطل
// الرمز فورًا (استخدام واحد فقط).
import { corsHeaders } from "../../shared-server/cors.js";
import { generateSalt, hashPassword, hashToken, isValidNewPassword } from "../../shared-server/authCrypto.js";
import { getCredentialsByResetTokenHash, upsertCredentials, insertAuditLog } from "../../shared-server/supabaseAdmin.js";

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

  const token = String(payload?.token || "").trim();
  const newPassword = String(payload?.newPassword || "");
  if (!token || !isValidNewPassword(newPassword)) {
    return new Response(JSON.stringify({ ok: false, reason: "invalid" }), { status: 400, headers: CORS_HEADERS });
  }

  try {
    const tokenHash = await hashToken(token);
    const creds = await getCredentialsByResetTokenHash(context.env, tokenHash);
    if (!creds || !creds.reset_token_expires_at || new Date(creds.reset_token_expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ ok: false, reason: "invalid_or_expired" }), { status: 200, headers: CORS_HEADERS });
    }

    const salt = generateSalt();
    const hash = await hashPassword(newPassword, salt);
    await upsertCredentials(context.env, creds.email, {
      password_hash: hash, password_salt: salt, failed_login_attempts: 0, locked_until: null,
      reset_token_hash: null, reset_token_expires_at: null,
    });
    await insertAuditLog(context.env, creds.email, "password_reset_completed", creds.email, null);
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
