import { describe, it, expect } from "vitest";
import {
  isQoyodEmail, generateCode, createCodeChallenge, verifyCodeChallenge,
  createSessionToken, verifySessionToken, CODE_TTL_MS, SESSION_TTL_MS,
} from "../emailAuth.js";

const SECRET = "test-secret-0123456789abcdef0123456789";

describe("isQoyodEmail", () => {
  it("يقبل ‎@qoyod.com فقط", () => {
    expect(isQoyodEmail("L.Zakaria@Qoyod.com ")).toBe(true);
    expect(isQoyodEmail("a@qoyod.com.evil.com")).toBe(false);
    expect(isQoyodEmail("a@sub.qoyod.com")).toBe(false);
    expect(isQoyodEmail("a@qoyodd.com")).toBe(false);
    expect(isQoyodEmail("a@gmail.com")).toBe(false);
    expect(isQoyodEmail("@qoyod.com")).toBe(false);
    expect(isQoyodEmail("a..b@qoyod.com")).toBe(false);
  });
});

describe("رمز الدخول", () => {
  it("6 أرقام", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
  it("الرمز الصحيح يمر (حتى بأرقام عربية ومسافات)، والخطأ/المنتهي/مفتاح آخر يُرفض", async () => {
    const now = 1_000_000;
    const ch = await createCodeChallenge("x@qoyod.com", "123456", SECRET, now);
    expect(ch).not.toContain("123456");
    expect((await verifyCodeChallenge(ch, "123456", SECRET, now + 1000)).e).toBe("x@qoyod.com");
    expect(await verifyCodeChallenge(ch, "١٢٣ ٤٥٦", SECRET, now)).not.toBeNull();
    expect(await verifyCodeChallenge(ch, "123457", SECRET, now)).toBeNull();
    expect(await verifyCodeChallenge(ch, "123456", SECRET, now + CODE_TTL_MS + 1)).toBeNull();
    expect(await verifyCodeChallenge(ch, "123456", "other-secret", now)).toBeNull();
  });
  it("تعديل الإيميل داخل التحدّي يكسر التوقيع", async () => {
    const ch = await createCodeChallenge("x@qoyod.com", "111111", SECRET);
    const [body, sig] = ch.split(".");
    const json = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    json.e = "boss@qoyod.com";
    const forged = Buffer.from(JSON.stringify(json)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") + "." + sig;
    expect(await verifyCodeChallenge(forged, "111111", SECRET)).toBeNull();
  });
});

describe("الجلسة", () => {
  it("صالحة حتى انتهاء المدة، ولا يصلح التحدّي كجلسة ولا العكس", async () => {
    const now = 5_000_000;
    const s = await createSessionToken("x@qoyod.com", SECRET, now);
    expect((await verifySessionToken(s, SECRET, now + 1)).e).toBe("x@qoyod.com");
    expect(await verifySessionToken(s, SECRET, now + SESSION_TTL_MS + 1)).toBeNull();
    const ch = await createCodeChallenge("x@qoyod.com", "123456", SECRET, now);
    expect(await verifySessionToken(ch, SECRET, now)).toBeNull();
    expect(await verifyCodeChallenge(s, "123456", SECRET, now)).toBeNull();
    expect(await verifySessionToken("garbage", SECRET)).toBeNull();
  });
});
