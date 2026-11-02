// [2026-11-02، طلب صريح من المستخدم] دخول بلا قاعدة بيانات: أي إيميل
// ‎@qoyod.com يطلب الدخول، يوصله رمز من 6 أرقام على إيميله، ينسخه ويدخل.
// كل شي هنا عديم الحالة (stateless): التحدّي وجلسة الدخول رموز موقَّعة
// (HMAC-SHA256 بمفتاح سري AUTH_SECRET على Cloudflare) — لا جدول ولا تخزين.
// تعمل على Cloudflare Workers وعلى Node 19+ (Web Crypto عالمي) فتُختبر مباشرة.

export const ALLOWED_DOMAIN = "qoyod.com";
export const CODE_TTL_MS = 10 * 60 * 1000; // صلاحية رمز الدخول
export const CODE_LENGTH = 6;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // صلاحية جلسة الدخول

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// إيميل قيود فقط: جزء محلي صالح + الدومين حرفياً qoyod.com (لا نطاق فرعي ولا شبيه)
export function isQoyodEmail(email) {
  const e = normalizeEmail(email);
  const m = /^([a-z0-9._%+-]+)@([a-z0-9.-]+)$/.exec(e);
  return !!m && m[2] === ALLOWED_DOMAIN && !m[1].startsWith(".") && !m[1].endsWith(".") && !m[1].includes("..");
}

const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(str) {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// رمز موقَّع: base64url(JSON).base64url(HMAC) — الغرض (purpose) جزء من التوقيع
// فلا يصلح رابط التأكيد كجلسة ولا العكس.
export async function signToken(payload, secret) {
  if (!secret) throw new Error("AUTH_SECRET missing");
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await hmac(secret, body));
  return `${body}.${sig}`;
}

export async function verifyToken(token, secret, purpose, now = Date.now()) {
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  let expected;
  try { expected = await hmac(secret, parts[0]); } catch { return null; }
  let given;
  try { given = fromB64url(parts[1]); } catch { return null; }
  if (!timingSafeEqual(expected, given)) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[0]))); } catch { return null; }
  if (!payload || payload.p !== purpose || typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (!isQoyodEmail(payload.e)) return null;
  return payload;
}

function nonce() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return b64url(a);
}

// رمز رقمي عشوائي منتظم التوزيع (رفض العيّنات الزائدة لتفادي انحياز الباقي)
export function generateCode(length = CODE_LENGTH) {
  const max = 10 ** length;
  const limit = Math.floor(0xffffffff / max) * max;
  const a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while (a[0] >= limit);
  return String(a[0] % max).padStart(length, "0");
}

async function codeDigest(secret, email, code, exp) {
  return b64url(await hmac(secret, `code|${normalizeEmail(email)}|${code}|${exp}`));
}

// التحدّي يرجع للمتصفح ولا يحوي الرمز نفسه — فقط بصمته الموقَّعة بالمفتاح السري،
// فلا يُستخرج الرمز منه ولا يُخمَّن بلا السيرفر.
export async function createCodeChallenge(email, code, secret, now = Date.now()) {
  const exp = now + CODE_TTL_MS;
  return signToken({ p: "login-code", e: normalizeEmail(email), exp, h: await codeDigest(secret, email, code, exp) }, secret);
}

export async function verifyCodeChallenge(challenge, code, secret, now = Date.now()) {
  const clean = String(code || "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\s+/g, "");
  if (!/^\d+$/.test(clean) || clean.length !== CODE_LENGTH) return null;
  const payload = await verifyToken(challenge, secret, "login-code", now);
  if (!payload || typeof payload.h !== "string") return null;
  const expected = await codeDigest(secret, payload.e, clean, payload.exp);
  return timingSafeEqual(enc.encode(expected), enc.encode(payload.h)) ? payload : null;
}

export function createSessionToken(email, secret, now = Date.now()) {
  return signToken({ p: "session", e: normalizeEmail(email), exp: now + SESSION_TTL_MS, n: nonce() }, secret);
}

export const verifySessionToken = (token, secret, now) => verifyToken(token, secret, "session", now);
