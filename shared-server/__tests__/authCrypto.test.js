import { describe, it, expect } from "vitest";
import { generateSalt, hashPassword, generateToken, hashToken, isValidNewPassword } from "../authCrypto.js";

describe("authCrypto — تشفير كلمات المرور ورموز إعادة التعيين", () => {
  it("generateSalt يولّد سلسلة hex بالطول المتوقع وغير متكررة بين استدعاءين", () => {
    const a = generateSalt(16);
    const b = generateSalt(16);
    expect(a).toMatch(/^[0-9a-f]{32}$/); // 16 بايت = 32 خانة hex
    expect(a).not.toBe(b);
  });

  it("hashPassword يعطي نفس الهاش لنفس كلمة المرور والملح (قابل للتحقق لاحقًا)", async () => {
    const salt = generateSalt();
    const h1 = await hashPassword("MyP@ssw0rd", salt);
    const h2 = await hashPassword("MyP@ssw0rd", salt);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/); // SHA-256 = 32 بايت = 64 خانة hex
  });

  it("hashPassword يعطي هاشًا مختلفًا لكلمة مرور مختلفة (بنفس الملح) أو لملح مختلف (بنفس كلمة المرور)", async () => {
    const salt = generateSalt();
    const h1 = await hashPassword("MyP@ssw0rd", salt);
    const h2 = await hashPassword("DifferentPass1", salt);
    const h3 = await hashPassword("MyP@ssw0rd", generateSalt());
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it("generateToken يولّد رمزًا عالي الإنتروبيا وغير متكرر", () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).toMatch(/^[0-9a-f]{64}$/); // 32 بايت = 64 خانة hex
    expect(t1).not.toBe(t2);
  });

  it("hashToken حتمي (نفس الرمز يعطي نفس الهاش دائمًا) — ضروري للبحث عنه لاحقًا بقاعدة البيانات", async () => {
    const token = generateToken();
    const h1 = await hashToken(token);
    const h2 = await hashToken(token);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashToken يعطي هاشًا مختلفًا لرمزين مختلفين", async () => {
    const h1 = await hashToken(generateToken());
    const h2 = await hashToken(generateToken());
    expect(h1).not.toBe(h2);
  });

  it("isValidNewPassword: يقبل أي 8 رموز فأكثر بلا شرط تنويع، ويرفض أقل من ذلك", () => {
    expect(isValidNewPassword("12345678")).toBe(true); // أرقام فقط
    expect(isValidNewPassword("abcdefgh")).toBe(true); // أحرف فقط
    expect(isValidNewPassword("Ab1!Ab1!")).toBe(true); // منوّعة (مقبولة أيضًا، بس مو شرط)
    expect(isValidNewPassword("1234567")).toBe(false); // 7 رموز فقط
    expect(isValidNewPassword("")).toBe(false);
    expect(isValidNewPassword(null)).toBe(false);
    expect(isValidNewPassword(undefined)).toBe(false);
  });
});
