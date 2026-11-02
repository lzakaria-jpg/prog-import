// @vitest-environment jsdom
// [2026-11-02] الدخول برمز يوصل على إيميل قيود (بلا Supabase)
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import React from "react";
import { LanguageProvider } from "../language";
import { AuthProvider, useAuth, LoginScreen, isQoyodEmailClient } from "../auth";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, el;
beforeEach(() => { sessionStorage.clear(); el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); });
afterEach(() => { act(() => root.unmount()); el.remove(); vi.restoreAllMocks(); });

function Gate() {
  const { currentUser, loading } = useAuth();
  if (loading || !currentUser) return <LoginScreen />;
  return <div id="in">IN:{currentUser}</div>;
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const setVal = (input, v) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, v);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("دخول بإيميل قيود + رمز", () => {
  it("isQoyodEmailClient", () => {
    expect(isQoyodEmailClient("a.b@qoyod.com")).toBe(true);
    expect(isQoyodEmailClient("a@gmail.com")).toBe(false);
    expect(isQoyodEmailClient("a@qoyod.com.sa")).toBe(false);
  });

  it("يرفض إيميل غير قيود بلا أي طلب للسيرفر، ثم يرسل الرمز ويدخل بالرمز الصحيح", async () => {
    const calls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opts) => {
      const body = JSON.parse(opts.body); calls.push([url, body]);
      if (url === "/api/auth-email-send") return { status: 200, json: async () => ({ ok: true, challenge: "CH" }) };
      if (url === "/api/auth-email-verify") return { status: 200, json: async () => (body.code === "123456" ? { ok: true, email: "x@qoyod.com", session: "S" } : { ok: false, reason: "wrong_or_expired_code" }) };
      return { status: 404, json: async () => ({ ok: false }) };
    });
    act(() => root.render(<LanguageProvider><AuthProvider><Gate /></AuthProvider></LanguageProvider>));
    await flush();
    const email = el.querySelector('input[type="email"]');
    act(() => setVal(email, "x@gmail.com"));
    await act(async () => { el.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(calls.length).toBe(0);
    expect(el.textContent).toContain("@qoyod.com");

    act(() => setVal(el.querySelector('input[type="email"]'), "X@Qoyod.com"));
    await act(async () => { el.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();
    expect(calls[0]).toEqual(["/api/auth-email-send", { email: "x@qoyod.com" }]);

    const codeInput = el.querySelector('input[inputmode="numeric"]');
    act(() => setVal(codeInput, "111111"));
    await act(async () => { el.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();
    expect(el.querySelector("#in")).toBeNull();

    act(() => setVal(el.querySelector('input[inputmode="numeric"]'), "١٢٣٤٥٦"));
    await act(async () => { el.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();
    expect(calls.at(-1)).toEqual(["/api/auth-email-verify", { challenge: "CH", code: "123456" }]);
    expect(el.querySelector("#in").textContent).toBe("IN:x@qoyod.com");
    expect(sessionStorage.getItem("qoyod_session_token")).toBe("S");
  });

  it("جلسة محفوظة صالحة تُستعاد بالتحقق من السيرفر، وغير الصالحة تُمسح", async () => {
    sessionStorage.setItem("qoyod_session_token", "BAD");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ status: 401, json: async () => ({ ok: false, reason: "invalid_or_expired" }) });
    act(() => root.render(<LanguageProvider><AuthProvider><Gate /></AuthProvider></LanguageProvider>));
    await flush();
    expect(el.querySelector("#in")).toBeNull();
    expect(sessionStorage.getItem("qoyod_session_token")).toBeNull();
  });
});
