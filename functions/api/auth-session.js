// [2026-11-02] من هو المستخدم الحالي؟ بالترتيب:
//  1) Cloudflare Access (لو مفعّل على الموقع ومضبوط ACCESS_TEAM_DOMAIN/ACCESS_AUD):
//     Cloudflare أرسل الرمز للإيميل وتحقق منه قبل فتح الموقع — ندخل مباشرة.
//  2) جلسة الأداة الموقَّعة (مسار الرمز عبر Resend) — AUTH_SECRET.
import { corsHeaders } from "../../shared-server/cors.js";
import { verifySessionToken } from "../../shared-server/emailAuth.js";
import { verifyAccessJwt, accessTokenFromRequest } from "../../shared-server/accessJwt.js";

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const H = { ...corsHeaders(request), "Content-Type": "application/json" };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: H });

  const teamDomain = env && env.ACCESS_TEAM_DOMAIN;
  const aud = env && env.ACCESS_AUD;
  if (teamDomain && aud) {
    const who = await verifyAccessJwt(accessTokenFromRequest(request), { teamDomain, aud });
    if (who) return reply(200, { ok: true, email: who.email, exp: who.exp, via: "access" });
  }

  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const secret = env && env.AUTH_SECRET;
  if (!body.session) return reply(401, { ok: false, reason: "no_session", access: !!(teamDomain && aud) });
  if (!secret) return reply(500, { ok: false, reason: "not_configured" });
  const payload = await verifySessionToken(body.session, secret);
  if (!payload) return reply(401, { ok: false, reason: "invalid_or_expired" });
  return reply(200, { ok: true, email: payload.e, exp: payload.exp, via: "code" });
}
