// [2026-11-02، طلب صريح من المستخدم] الدخول عبر Cloudflare Access (Zero Trust):
// Cloudflare نفسه يرسل رمز الدخول (One-time PIN) لأي إيميل ‎@qoyod.com قبل ما
// يفتح الموقع — بلا Resend ولا أي سجلات DNS. هنا نتحقق من توكن Access
// (Cf-Access-Jwt-Assertion) اللي يضيفه Cloudflare لكل طلب، ونستخرج منه الإيميل،
// فتدخل الأداة مباشرة بلا شاشة دخول ثانية.
//
// التحقق كامل (لا نثق بالهيدر وحده): توقيع RS256 بمفاتيح الفريق العامة
// (https://<team>.cloudflareaccess.com/cdn-cgi/access/certs) + aud + iss + exp.
// يحتاج على Cloudflare Pages:
//   ACCESS_TEAM_DOMAIN — مثال: qoyod.cloudflareaccess.com
//   ACCESS_AUD         — "Application Audience (AUD) Tag" من إعدادات تطبيق Access

import { isQoyodEmail, normalizeEmail } from "./emailAuth.js";

const certCache = new Map(); // teamDomain -> { keys, at }
const CERT_TTL_MS = 60 * 60 * 1000;

function b64urlToBytes(str) {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decodeJson(part) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
}

export function normalizeTeamDomain(team) {
  return String(team || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

async function getKeys(teamDomain, fetchImpl, now, forceRefresh = false) {
  const hit = certCache.get(teamDomain);
  if (hit && !forceRefresh && now - hit.at < CERT_TTL_MS) return hit.keys;
  const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const data = await res.json();
  const keys = Array.isArray(data.keys) ? data.keys : [];
  certCache.set(teamDomain, { keys, at: now });
  return keys;
}

export function _clearAccessCertCache() { certCache.clear(); }

/**
 * فحص مفصّل لتوكن Access: { ok, reason, email?, exp?, claims? } — reason يوضح سبب
 * الرفض (للتشخيص فقط، بلا أي سر): no_config | no_token | malformed | bad_alg |
 * certs_failed | unknown_kid | bad_signature | bad_aud | bad_iss | expired |
 * not_yet_valid | not_qoyod.
 */
export async function inspectAccessJwt(token, { teamDomain, aud, fetchImpl = fetch, now = Date.now() } = {}) {
  const team = normalizeTeamDomain(teamDomain);
  aud = String(aud || "").trim();
  if (!team || !aud) return { ok: false, reason: "no_config" };
  if (!token) return { ok: false, reason: "no_token" };
  const parts = String(token).split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  let header, payload;
  try { header = decodeJson(parts[0]); payload = decodeJson(parts[1]); } catch { return { ok: false, reason: "malformed" }; }
  const claims = { iss: payload && payload.iss, aud: payload && payload.aud, email: payload && payload.email, exp: payload && payload.exp, kid: header && header.kid };
  if (!header || header.alg !== "RS256" || !header.kid) return { ok: false, reason: "bad_alg", claims };

  let keys;
  try { keys = await getKeys(team, fetchImpl, now); } catch { return { ok: false, reason: "certs_failed", claims }; }
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // تدوير المفاتيح: نجرب جلب جديد مرة وحدة
    try { keys = await getKeys(team, fetchImpl, now, true); } catch { return { ok: false, reason: "certs_failed", claims }; }
    jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return { ok: false, reason: "unknown_kid", claims };
  }

  let ok = false;
  try {
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch { return { ok: false, reason: "bad_signature", claims }; }
  if (!ok) return { ok: false, reason: "bad_signature", claims };

  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(String(aud).trim())) return { ok: false, reason: "bad_aud", claims };
  if (payload.iss !== `https://${team}`) return { ok: false, reason: "bad_iss", claims };
  const nowSec = Math.floor(now / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) return { ok: false, reason: "expired", claims };
  if (typeof payload.nbf === "number" && payload.nbf > nowSec + 60) return { ok: false, reason: "not_yet_valid", claims };

  const email = normalizeEmail(payload.email);
  if (!isQoyodEmail(email)) return { ok: false, reason: "not_qoyod", claims };
  return { ok: true, email, exp: payload.exp * 1000, claims };
}

/**
 * يرجّع { email, exp } لو التوكن صالح ولإيميل ‎@qoyod.com، وإلا null.
 */
export async function verifyAccessJwt(token, opts = {}) {
  const r = await inspectAccessJwt(token, opts);
  return r.ok ? { email: r.email, exp: r.exp } : null;
}

// قراءة توكن Access من الطلب: الهيدر أولاً، ثم كوكي CF_Authorization
export function accessTokenFromRequest(request) {
  const h = request.headers.get("Cf-Access-Jwt-Assertion");
  if (h) return h;
  // بعض الإعدادات تمرّر التوكن بهيدر بديل
  const h2 = request.headers.get("cf-access-token");
  if (h2) return h2;
  const cookie = request.headers.get("Cookie") || "";
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return m ? decodeURIComponent(m[1]) : null;
}
