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
 * يرجّع { email } لو التوكن صالح ولإيميل ‎@qoyod.com، وإلا null.
 */
export async function verifyAccessJwt(token, { teamDomain, aud, fetchImpl = fetch, now = Date.now() } = {}) {
  const team = normalizeTeamDomain(teamDomain);
  if (!token || !team || !aud) return null;
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try { header = decodeJson(parts[0]); payload = decodeJson(parts[1]); } catch { return null; }
  if (!header || header.alg !== "RS256" || !header.kid) return null;

  let keys;
  try { keys = await getKeys(team, fetchImpl, now); } catch { return null; }
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // تدوير المفاتيح: نجرب جلب جديد مرة وحدة
    try { keys = await getKeys(team, fetchImpl, now, true); } catch { return null; }
    jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
  }

  let ok = false;
  try {
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch { return null; }
  if (!ok) return null;

  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return null;
  if (payload.iss !== `https://${team}`) return null;
  const nowSec = Math.floor(now / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) return null;
  if (typeof payload.nbf === "number" && payload.nbf > nowSec + 60) return null;

  const email = normalizeEmail(payload.email);
  if (!isQoyodEmail(email)) return null;
  return { email, exp: payload.exp * 1000 };
}

// قراءة توكن Access من الطلب: الهيدر أولاً، ثم كوكي CF_Authorization
export function accessTokenFromRequest(request) {
  const h = request.headers.get("Cf-Access-Jwt-Assertion");
  if (h) return h;
  const cookie = request.headers.get("Cookie") || "";
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return m ? decodeURIComponent(m[1]) : null;
}
