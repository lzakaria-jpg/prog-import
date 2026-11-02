// [2026-11-02] يتحقق من رمز الدخول (المنسوخ من الإيميل) مقابل التحدّي، ويرجّع جلسة دخول موقَّعة.
import { corsHeaders } from "../../shared-server/cors.js";
import { verifyCodeChallenge, createSessionToken } from "../../shared-server/emailAuth.js";

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const H = { ...corsHeaders(request), "Content-Type": "application/json" };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: H });
  const secret = env && env.AUTH_SECRET;
  if (!secret) return reply(500, { ok: false, reason: "not_configured" });
  let body;
  try { body = await request.json(); } catch { return reply(400, { ok: false, reason: "bad_request" }); }
  const payload = await verifyCodeChallenge(body && body.challenge, body && body.code, secret);
  if (!payload) return reply(401, { ok: false, reason: "wrong_or_expired_code" });
  const session = await createSessionToken(payload.e, secret);
  return reply(200, { ok: true, email: payload.e, session });
}
