// [2026-11-02، طلب صريح من المستخدم] الدخول بلا قاعدة بيانات (أُلغي Supabase
// بالكامل): أي إيميل ‎@qoyod.com يطلب رمزاً، يوصله على إيميله (6 أرقام)،
// ينسخه هنا ويدخل. التحقق كله على السيرفر (functions/api/auth-email-*.js)
// برموز موقَّعة — المتصفح يحفظ فقط "جلسة" موقَّعة صالحة 12 ساعة، ويتحقق منها
// السيرفر عند كل فتح للصفحة. لا مستخدمين ولا صلاحيات ولا مدير: كل موظفي قيود
// يوصلون لكل الأدوات.
// [إضافة] لو الموقع محمي بـCloudflare Access (Cloudflare يرسل الرمز للإيميل
// بنفسه، بلا Resend ولا DNS)، /api/auth-session يتعرّف على المستخدم مباشرة من
// توكن Access فيدخل بلا شاشة دخول ثانية.
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLanguage } from "./language";
import { Shield, Mail, KeyRound, AlertCircle, CheckCircle2, RefreshCw, ArrowRight } from "lucide-react";

const AuthContext = createContext(null);
const SESSION_KEY = "qoyod_session_token";
const EMAIL_DOMAIN = "@qoyod.com";

// sessionStorage عمداً (نفس سلوك الأداة السابق): إغلاق المتصفح = تسجيل دخول من جديد
function loadSession() {
  try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
}
function saveSession(token) {
  try { sessionStorage.setItem(SESSION_KEY, token); } catch { /* وضع خاص */ }
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* لا شيء */ }
}

export function isQoyodEmailClient(email) {
  const e = String(email || "").trim().toLowerCase();
  return /^[a-z0-9._%+-]+@qoyod\.com$/.test(e) && !e.startsWith(".") && !e.includes("..");
}

async function postJson(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch { data = { ok: false, reason: `http_${res.status}` }; }
  return data;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [via, setVia] = useState(null); // access | code

  // استعادة الجلسة (تحديث الصفحة) أو هوية Cloudflare Access — يتحقق السيرفر
  useEffect(() => {
    const token = loadSession();
    postJson("/api/auth-session", { session: token || null })
      .then((d) => {
        if (d.ok && d.email) { setCurrentUser(d.email); setVia(d.via || "code"); }
        else if (token) clearSession();
      })
      .catch(() => { /* انقطاع شبكة: نطلب الدخول */ })
      .finally(() => setLoading(false));
  }, []);

  // خروج تلقائي عند انتهاء مدة الجلسة أثناء فتح الصفحة
  useEffect(() => {
    if (!currentUser) return undefined;
    const id = setInterval(() => {
      if (via === "access") return; // Cloudflare Access يدير مدة جلسته بنفسه
      const token = loadSession();
      if (!token) { setCurrentUser(null); return; }
      postJson("/api/auth-session", { session: token })
        .then((d) => { if (!d.ok && d.reason === "invalid_or_expired") { clearSession(); setCurrentUser(null); } })
        .catch(() => {});
    }, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [currentUser, via]);

  const requestCode = useCallback(async (email) => {
    const e = String(email || "").trim().toLowerCase();
    if (!isQoyodEmailClient(e)) return { ok: false, reason: "not_qoyod" };
    try { return await postJson("/api/auth-email-send", { email: e }); }
    catch { return { ok: false, reason: "network_error" }; }
  }, []);

  const verifyCode = useCallback(async (challenge, code) => {
    try {
      const d = await postJson("/api/auth-email-verify", { challenge, code });
      if (d.ok && d.session && d.email) {
        saveSession(d.session);
        setCurrentUser(d.email);
        setVia("code");
      }
      return d;
    } catch { return { ok: false, reason: "network_error" }; }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setCurrentUser(null);
    // خروج من Cloudflare Access نفسه، وإلا يرجع يدخل تلقائياً
    if (via === "access") { try { window.location.assign("/cdn-cgi/access/logout"); } catch { /* اختبارات */ } }
  }, [via]);

  const value = { currentUser, isAuthenticated: !!currentUser, loading, requestCode, verifyCode, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

const fieldStyle = (hasError, extra = {}) => ({
  width: "100%", padding: "14px 14px 14px 44px", borderRadius: 12, border: `2px solid ${hasError ? "#DC2626" : "#E2E8F0"}`,
  fontSize: 15, outline: "none", direction: "ltr", boxSizing: "border-box", background: "#F1F5F9", color: "#0F172A", ...extra,
});

const toLatinDigits = (s) => String(s || "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

function errorText(reason, t) {
  switch (reason) {
    case "not_qoyod": return t({ ar: `الدخول متاح لإيميلات قيود فقط (${EMAIL_DOMAIN})`, en: `Only Qoyod emails (${EMAIL_DOMAIN}) can sign in` });
    case "not_configured": return t({ ar: "إرسال رمز الدخول غير مُعَد على السيرفر بعد (AUTH_SECRET / RESEND_API_KEY / RESEND_FROM). تواصل مع المسؤول.", en: "Login email isn't configured on the server yet (AUTH_SECRET / RESEND_API_KEY / RESEND_FROM). Contact the maintainer." });
    case "email_failed": return t({ ar: "تعذّر إرسال الإيميل. حاول مرة ثانية بعد قليل.", en: "Couldn't send the email. Try again shortly." });
    case "wrong_or_expired_code": return t({ ar: "الرمز غير صحيح أو انتهت صلاحيته (10 دقائق). تأكد منه أو اطلب رمزاً جديداً.", en: "Wrong or expired code (valid 10 minutes). Check it or request a new one." });
    case "network_error": return t({ ar: "تعذّر الاتصال. تحقق من الإنترنت.", en: "Connection failed. Check your internet." });
    default: return t({ ar: "حدث خطأ غير متوقع. حاول مرة ثانية.", en: "Unexpected error. Please try again." });
  }
}

export function LoginScreen() {
  const { t } = useLanguage();
  const { loading, requestCode, verifyCode } = useAuth();
  const [step, setStep] = useState("email"); // email | code
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const sendCode = async (e) => {
    if (e) e.preventDefault();
    setError(""); setInfo("");
    const trimmed = email.trim().toLowerCase();
    if (!isQoyodEmailClient(trimmed)) { setError(errorText("not_qoyod", t)); return; }
    setSubmitting(true);
    const d = await requestCode(trimmed);
    setSubmitting(false);
    if (!d.ok || !d.challenge) { setError(errorText(d.reason, t)); return; }
    setChallenge(d.challenge);
    setCode("");
    setStep("code");
    setInfo(t({ ar: `أرسلنا رمز دخول من 6 أرقام إلى ${trimmed} — انسخه هنا (صالح 10 دقائق).`, en: `We sent a 6-digit code to ${trimmed} — paste it here (valid 10 minutes).` }));
  };

  const submitCode = async (e) => {
    if (e) e.preventDefault();
    setError("");
    const clean = toLatinDigits(code).replace(/\D/g, "");
    if (clean.length !== 6) { setError(t({ ar: "الرمز 6 أرقام", en: "The code is 6 digits" })); return; }
    setSubmitting(true);
    const d = await verifyCode(challenge, clean);
    setSubmitting(false);
    if (!d.ok) setError(errorText(d.reason, t));
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #162560 0%, #0F1A47 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "#FFFFFF" }}>
          <RefreshCw size={32} className="animate-spin" />
          <p style={{ marginTop: 12, fontSize: 14 }}>{t({ ar: "جاري التحميل...", en: "Loading..." })}</p>
        </div>
      </div>
    );
  }

  const btnStyle = { width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #162560, #0F1A47)", color: "#FFFFFF", fontSize: 16, fontWeight: 700, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #162560 0%, #0F1A47 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Cairo, Segoe UI, sans-serif" }}>
      <div style={{ width: 440, maxWidth: "95vw", background: "#FFFFFF", borderRadius: 20, padding: "40px 36px", boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #162560, #0F1A47)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Shield size={32} color="#FFFFFF" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#12B886", margin: 0 }}>{t({ ar: "أدوات قيود المحاسبية", en: "Qoyod Accounting Tools" })}</h1>
          <p style={{ fontSize: 13, color: "#64748B", marginTop: 6 }}>
            {step === "email"
              ? t({ ar: "أدخل إيميل قيود وبنرسل لك رمز الدخول", en: "Enter your Qoyod email and we'll send you a login code" })
              : t({ ar: "انسخ رمز الدخول من إيميلك", en: "Paste the login code from your email" })}
          </p>
        </div>

        {step === "email" ? (
          <form onSubmit={sendCode}>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <Mail size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder={`name${EMAIL_DOMAIN}`} autoFocus autoComplete="email" disabled={submitting} style={fieldStyle(!!error)} />
            </div>
            {error && <Msg kind="error">{error}</Msg>}
            <button type="submit" disabled={submitting} style={btnStyle}>
              {submitting && <RefreshCw size={16} className="animate-spin" />}
              {t({ ar: "أرسل رمز الدخول", en: "Send login code" })}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            {info && <Msg kind="info">{info}</Msg>}
            <div style={{ position: "relative", marginBottom: 16 }}>
              <KeyRound size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
              <input inputMode="numeric" value={code} onChange={(e) => { setCode(e.target.value); setError(""); }}
                placeholder="••••••" autoFocus autoComplete="one-time-code" maxLength={12} disabled={submitting}
                style={fieldStyle(!!error, { fontSize: 22, letterSpacing: 8, textAlign: "center", padding: "12px 14px 12px 44px" })} />
            </div>
            {error && <Msg kind="error">{error}</Msg>}
            <button type="submit" disabled={submitting} style={btnStyle}>
              {submitting && <RefreshCw size={16} className="animate-spin" />}
              {t({ ar: "دخول", en: "Sign in" })}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 12 }}>
              <button type="button" onClick={() => { setStep("email"); setError(""); setInfo(""); }} disabled={submitting}
                style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
                <ArrowRight size={12} /> {t({ ar: "تغيير الإيميل", en: "Change email" })}
              </button>
              <button type="button" onClick={() => sendCode()} disabled={submitting}
                style={{ background: "none", border: "none", color: "#0284C7", cursor: "pointer", padding: 0 }}>
                {t({ ar: "إرسال رمز جديد", en: "Send a new code" })}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Msg({ kind, children }) {
  const err = kind === "error";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 10, marginBottom: 16, fontSize: 13,
      background: err ? "#FEE2E2" : "#E0F2FE", color: err ? "#DC2626" : "#0369A1" }}>
      {err ? <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} /> : <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />}
      <span>{children}</span>
    </div>
  );
}
