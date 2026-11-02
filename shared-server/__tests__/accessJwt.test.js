import { describe, it, expect, beforeEach } from "vitest";
import { verifyAccessJwt, accessTokenFromRequest, _clearAccessCertCache } from "../accessJwt.js";

const TEAM = "qoyod.cloudflareaccess.com";
const AUD = "aud-tag-123";
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function setup() {
  const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  const certs = { keys: [{ ...jwk, kid: "k1" }] };
  const fetchImpl = async (url) => ({ ok: url === `https://${TEAM}/cdn-cgi/access/certs`, status: 200, json: async () => certs });
  const sign = async (payload, header = { alg: "RS256", kid: "k1", typ: "JWT" }) => {
    const h = b64u(JSON.stringify(header)); const p = b64u(JSON.stringify(payload));
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(`${h}.${p}`));
    return `${h}.${p}.${b64u(sig)}`;
  };
  return { fetchImpl, sign };
}

const now = 1_800_000_000_000;
const good = (extra = {}) => ({ aud: [AUD], iss: `https://${TEAM}`, email: "L.Zakaria@qoyod.com", exp: Math.floor(now / 1000) + 3600, ...extra });

describe("verifyAccessJwt", () => {
  beforeEach(() => _clearAccessCertCache());
  it("توكن Access صالح لإيميل قيود => الإيميل", async () => {
    const { fetchImpl, sign } = await setup();
    const r = await verifyAccessJwt(await sign(good()), { teamDomain: TEAM, aud: AUD, fetchImpl, now });
    expect(r.email).toBe("l.zakaria@qoyod.com");
  });
  it("يرفض: aud غلط، iss غلط، منتهي، إيميل خارج قيود، توقيع معدَّل، بلا إعداد", async () => {
    const { fetchImpl, sign } = await setup();
    const o = { teamDomain: TEAM, aud: AUD, fetchImpl, now };
    expect(await verifyAccessJwt(await sign(good({ aud: ["other"] })), o)).toBeNull();
    expect(await verifyAccessJwt(await sign(good({ iss: "https://evil.cloudflareaccess.com" })), o)).toBeNull();
    expect(await verifyAccessJwt(await sign(good({ exp: Math.floor(now / 1000) - 1 })), o)).toBeNull();
    expect(await verifyAccessJwt(await sign(good({ email: "x@gmail.com" })), o)).toBeNull();
    const t = await sign(good());
    const [h, , s] = t.split(".");
    const forged = `${h}.${b64u(JSON.stringify(good({ email: "boss@qoyod.com" })))}.${s}`;
    expect(await verifyAccessJwt(forged, o)).toBeNull();
    expect(await verifyAccessJwt(t, { ...o, aud: "" })).toBeNull();
    expect(await verifyAccessJwt(await sign(good(), { alg: "none", kid: "k1" }), o)).toBeNull();
  });
  it("يقرأ التوكن من الهيدر أو الكوكي", () => {
    expect(accessTokenFromRequest(new Request("https://x", { headers: { "Cf-Access-Jwt-Assertion": "A" } }))).toBe("A");
    expect(accessTokenFromRequest(new Request("https://x", { headers: { Cookie: "a=1; CF_Authorization=B" } }))).toBe("B");
    expect(accessTokenFromRequest(new Request("https://x"))).toBeNull();
  });
});
