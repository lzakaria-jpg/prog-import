// [2026-11-02] من هو المستخدم الحالي؟ بالترتيب:
//  1) Cloudflare Access (لو مفعّل على الموقع ومضبوط ACCESS_TEAM_DOMAIN/ACCESS_AUD):
//     Cloudflare أرسل الرمز للإيميل وتحقق منه قبل فتح الموقع — ندخل مباشرة.
//  2) جلسة الأداة الموقَّعة (مسار الرمز عبر Resend) — AUTH_SECRET.
// GET على نفس المسار = صفحة تشخيص (بلا أي سر) لمعرفة سبب عدم التعرف على Access.
import { corsHeaders } from "../../shared-server/cors.js";
import { verifySessionToken } from "../../shared-server/emailAuth.js";
import { inspectAccessJwt, accessTokenFromRequest, normalizeTeamDomain } from "../../shared-server/accessJwt.js";

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

async function checkAccess(request, env) {
  const teamDomain = env && env.ACCESS_TEAM_DOMAIN;
  const aud = env && env.ACCESS_AUD;
  const configured = !!(teamDomain && aud);
  const token = accessTokenFromRequest(request);
  const result = configured ? await inspectAccessJwt(token, { teamDomain, aud }) : { ok: false, reason: "no_config" };
  return { configured, tokenPresent: !!token, result, teamDomain: normalizeTeamDomain(teamDomain) };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const a = await checkAccess(request, env);
  const audEnv = String((env && env.ACCESS_AUD) || "").trim();
  const claimAud = a.result.claims && a.result.claims.aud;
  const body = {
    access_configured: a.configured,
    team_domain: a.teamDomain || null,
    expected_iss: a.teamDomain ? `https://${a.teamDomain}` : null,
    aud_env_prefix: audEnv ? `${audEnv.slice(0, 8)}…` : null,
    token_present: a.tokenPresent,
    ok: a.result.ok,
    reason: a.result.ok ? null : a.result.reason,
    email: a.result.ok ? a.result.email : (a.result.claims && a.result.claims.email) || null,
    token_iss: (a.result.claims && a.result.claims.iss) || null,
    token_aud_prefixes: claimAud ? (Array.isArray(claimAud) ? claimAud : [claimAud]).map((x) => `${String(x).slice(0, 8)}…`) : null,
  };
  return new Response(JSON.stringify(body, null, 2), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const H = { ...corsHeaders(request), "Content-Type": "application/json" };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: H });

  const a = await checkAccess(request, env);
  if (a.result.ok) return reply(200, { ok: true, email: a.result.email, exp: a.result.exp, via: "access" });

  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const secret = env && env.AUTH_SECRET;
  if (body.session && secret) {
    const payload = await verifySessionToken(body.session, secret);
    if (payload) return reply(200, { ok: true, email: payload.e, exp: payload.exp, via: "code" });
  }
  return reply(401, {
    ok: false,
    reason: body.session ? "invalid_or_expired" : "no_session",
    access: a.configured,
    access_reason: a.configured ? a.result.reason : null,
  });
}
