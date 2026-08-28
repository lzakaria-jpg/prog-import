import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLanguage } from "./language";
import { supabase } from "./supabase";
import { trackLogin, trackLogout, getUserStats, getRecentActivity } from "./activityTracker";
import { Shield, Mail, UserPlus, UserX, Users, LogOut, Settings, AlertCircle, CheckCircle2, Trash2, Wifi, WifiOff, RefreshCw, Bot, BarChart3, Clock, Activity, Lock, Eye, EyeOff, Key } from "lucide-react";

const AuthContext = createContext(null);
const SESSION_KEY = "qoyod_session";
const DEFAULT_ADMIN_SALT = "1d8ad81d942f86fac5b7b368ee149314";
const DEFAULT_ADMIN_HASH = "41b8952f2790c6419afdd5e6d7e9d5666fd2d4bc001d1d5ab58b44d0b709fb52"; // 2244470599

function loadSession() {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}
function saveSession(data) {
  localStorage.setItem(SESSION_KEY, data);
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function generateSalt(length = 16) {
  const arr = new Uint8Array(length);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, saltHex = DEFAULT_ADMIN_SALT) {
  if (!password || !window.crypto?.subtle) return null;
  try {
    const bytes = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const saltBytes = new Uint8Array(saltHex.match(/.{2}/g).map((part) => parseInt(part, 16)));
    const bits = await window.crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: 210000, hash: "SHA-256" }, bytes, 256);
    return Array.from(new Uint8Array(bits), (value) => value.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    console.error("Hash calculation failed:", e);
    return null;
  }
}

async function verifyAdminPassword(password) {
  if (!password) return false;
  try {
    let targetHash = DEFAULT_ADMIN_HASH;
    let targetSalt = DEFAULT_ADMIN_SALT;

    if (supabase && supabase.supabaseUrl && !supabase.supabaseUrl.includes("YOUR_")) {
      const { data: hashData } = await supabase.from("app_settings").select("value").eq("key", "admin_password_hash").maybeSingle();
      const { data: saltData } = await supabase.from("app_settings").select("value").eq("key", "admin_password_salt").maybeSingle();
      if (hashData?.value && saltData?.value) {
        targetHash = hashData.value;
        targetSalt = saltData.value;
      }
    }

    const calculated = await hashPassword(password, targetSalt);
    return calculated === targetHash;
  } catch (err) {
    console.error("Error verifying admin password:", err);
    const calculated = await hashPassword(password, DEFAULT_ADMIN_SALT);
    return calculated === DEFAULT_ADMIN_HASH;
  }
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [adminEmail, setAdminEmail] = useState(null);
  const [whitelist, setWhitelist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [showAdmin, setShowAdmin] = useState(false);
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const isConfigured = useCallback(() => {
    return supabase && supabase.supabaseUrl && !supabase.supabaseUrl.includes("YOUR_");
  }, []);

  const loadAdminEmail = useCallback(async () => {
    if (!isConfigured()) { setLoading(false); return; }
    try {
      const { data, error } = await supabase.from("app_settings").select("value").eq("key", "admin_email").maybeSingle();
      if (data && data.value) setAdminEmail(data.value);
    } catch (e) { console.warn("Failed to load admin email:", e); }
    setLoading(false);
  }, [isConfigured]);

  const loadWhitelist = useCallback(async () => {
    if (!isConfigured()) return;
    try {
      const { data, error } = await supabase.from("allowed_users").select("email");
      if (data) setWhitelist(data.map(r => r.email.toLowerCase()));
    } catch (e) { console.warn("Failed to load whitelist:", e); }
  }, [isConfigured]);

  useEffect(() => {
    loadAdminEmail();
    loadWhitelist();
  }, [loadAdminEmail, loadWhitelist]);

  useEffect(() => {
    const stored = loadSession();
    if (!stored || loading) return;
    const normalized = stored.toLowerCase();
    if (normalized === adminEmail?.toLowerCase()) {
      clearSession();
      return;
    }
    const allowed = normalized === adminEmail?.toLowerCase() || whitelist.includes(normalized);
    if (allowed) setCurrentUser(normalized);
    else clearSession();
  }, [adminEmail, loading, whitelist]);

  useEffect(() => {
    if (!isConfigured()) { setDbReady(false); return; }
    supabase.from("allowed_users").select("email").limit(1).then(({ error }) => {
      setDbReady(!error);
    }).catch(() => setDbReady(false));
  }, [isConfigured]);

  const isAdmin = currentUser && adminEmail && currentUser.toLowerCase() === adminEmail.toLowerCase();

  const setupAdmin = useCallback(async (email, password) => {
    const trimmed = (email || "").trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { ok: false };
    if (!(await verifyAdminPassword(password))) return { ok: false };

    if (!isConfigured()) {
      alert("Supabase not configured. Please set up your database first.");
      return { ok: false };
    }

    try {
      const { error: e1 } = await supabase.from("app_settings").upsert({ key: "admin_email", value: trimmed }, { onConflict: "key" });
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("allowed_users").upsert({ email: trimmed }, { onConflict: "email" });
      if (e2) throw e2;

      setAdminEmail(trimmed);
      setWhitelist(prev => {
        const lower = prev.map(e => e.toLowerCase());
        if (!lower.includes(trimmed)) return [...prev, trimmed];
        return prev;
      });
      setCurrentUser(trimmed);
      saveSession(trimmed);
      return { ok: true };
    } catch (e) {
      console.error("Setup admin failed:", e);
      return { ok: false };
    }
  }, [isConfigured]);

  const login = useCallback(async (email, password) => {
    const trimmed = (email || "").trim().toLowerCase();
    if (!trimmed) return { ok: false, msg: { ar: "الرجاء كتابة الإيميل", en: "Please enter your email" } };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { ok: false, msg: { ar: "الرجاء كتابة إيميل صحيح", en: "Please enter a valid email" } };

    if (!isConfigured()) {
      return { ok: false, msg: { ar: "التطبيق غير مربوط بقاعدة البيانات. تواصل مع المدير.", en: "App not connected to database. Contact the admin." } };
    }

    await loadWhitelist();
    if (!adminEmail) {
      await loadAdminEmail();
    }

    if (!adminEmail) return { ok: false, msg: { ar: "لم يتم تعيين مدير النظام بعد", en: "Admin not set up yet" } };

    if (trimmed === adminEmail.toLowerCase()) {
      if (!(await verifyAdminPassword(password))) return { ok: false, msg: { ar: "كلمة مرور المدير غير صحيحة", en: "Incorrect administrator password" } };
      setCurrentUser(trimmed);
      saveSession(trimmed);
      trackLogin(trimmed);
      return { ok: true, admin: true };
    }

    try {
      const { data, error } = await supabase.from("allowed_users").select("email").eq("email", trimmed).single();
      if (data) {
        setCurrentUser(trimmed);
        saveSession(trimmed);
        trackLogin(trimmed);
        return { ok: true, admin: false };
      }
    } catch (e) { /* not found */ }

    return { ok: false, msg: { ar: "هذا الإيميل غير مسموح. تواصل مع المدير للحصول على صلاحية", en: "This email is not authorized. Contact the admin for access" } };
  }, [adminEmail, isConfigured, loadWhitelist, loadAdminEmail]);

  const logout = useCallback(() => {
    if (currentUser) trackLogout(currentUser);
    setCurrentUser(null);
    clearSession();
  }, [currentUser]);

  const addEmail = useCallback(async (email) => {
    const trimmed = (email || "").trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return false;
    if (whitelist.includes(trimmed)) return false;

    if (!isConfigured()) return false;

    try {
      const { error } = await supabase.from("allowed_users").upsert({ email: trimmed }, { onConflict: "email" });
      if (error) throw error;
      setWhitelist(prev => [...prev, trimmed]);
      return true;
    } catch (e) {
      console.error("Add email failed:", e);
      return false;
    }
  }, [whitelist, isConfigured]);

  const removeEmail = useCallback(async (email) => {
    const trimmed = (email || "").trim().toLowerCase();
    if (!isConfigured()) return;

    try {
      const { error } = await supabase.from("allowed_users").delete().eq("email", trimmed);
      if (error) throw error;
      setWhitelist(prev => prev.filter(e => e.toLowerCase() !== trimmed));
    } catch (e) {
      console.error("Remove email failed:", e);
    }
  }, [isConfigured]);

  const refreshWhitelist = useCallback(async () => {
    await loadWhitelist();
  }, [loadWhitelist]);

  const value = {
    currentUser, adminEmail, whitelist, isAdmin, isAuthenticated: !!currentUser,
    loading, online, dbReady, showAdmin, setShowAdmin, isConfigured: isConfigured(),
    login, setupAdmin, logout, addEmail, removeEmail, refreshWhitelist,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function LoginScreen() {
  const { t } = useLanguage();
  const { setupAdmin, login, adminEmail, loading, online, dbReady, isConfigured } = useAuth();
  const [email, setEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const needsSetup = !loading && !adminEmail;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);

    try {
      if (needsSetup) {
        const result = await setupAdmin(email, adminPassword);
        if (!result.ok) setError(t({ ar: "فشل التعيين. تحقق من الإيميل واتصالك بالإنترنت", en: "Setup failed. Check your email and connection" }));
        else {
          setSuccess(true);
        }
      } else {
        const result = await login(email, adminPassword);
        if (!result.ok) setError(t(result.msg));
        else setSuccess(true);
      }
    } catch (e) {
      setError(t({ ar: "خطأ غير متوقع", en: "Unexpected error" }));
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #162560 0%, #0F1A47 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "#E6EDF6" }}>
          <RefreshCw size={32} className="animate-spin" />
          <p style={{ marginTop: 12, fontSize: 14 }}>{t({ ar: "جاري التحميل...", en: "Loading..." })}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #162560 0%, #0F1A47 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Cairo, Segoe UI, sans-serif" }}>
      <div style={{ width: 440, maxWidth: "95vw", background: "#111A2E", borderRadius: 20, padding: "40px 36px", boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, background: online ? "#0D2818" : "#2D1215", fontSize: 11, fontWeight: 600, color: online ? "#16A34A" : "#EF4444" }}>
            {online ? <Wifi size={12} /> : <WifiOff size={12} />}
            {online ? t({ ar: "متصل", en: "Online" }) : t({ ar: "غير متصل", en: "Offline" })}
          </div>

          {(needsSetup || email.trim().toLowerCase() === adminEmail?.toLowerCase()) && (
            <div style={{ position: "relative", marginBottom: 16 }}>
              <Shield size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#5C7196" }} />
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => { setAdminPassword(e.target.value); setError(null); setSuccess(false); }}
                placeholder={t({ ar: "كلمة مرور المدير", en: "Administrator password" })}
                autoComplete="current-password"
                disabled={submitting}
                style={{ width: "100%", padding: "14px 14px 14px 44px", borderRadius: 12, border: `2px solid ${error ? "#EF4444" : "#233152"}`, fontSize: 15, outline: "none", direction: "ltr", boxSizing: "border-box", background: "#0E1830", color: "#E6EDF6" }}
              />
            </div>
          )}
          {isConfigured && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, background: dbReady ? "#0D2818" : "#2D1215", fontSize: 11, fontWeight: 600, color: dbReady ? "#16A34A" : "#EF4444" }}>
              {dbReady ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {dbReady ? t({ ar: "قاعدة البيانات متصلة", en: "DB Connected" }) : t({ ar: "قاعدة البيانات غير متصلة", en: "DB Disconnected" })}
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #162560, #0F1A47)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Shield size={32} color="#FFFFFF" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#12B886", margin: 0 }}>
            {needsSetup
              ? t({ ar: "تعيين مدير النظام", en: "Setup Admin" })
              : t({ ar: "أدوات قيود المحاسبية", en: "Qoyod Accounting Tools" })}
          </h1>
          <p style={{ fontSize: 13, color: "#8CA3C1", marginTop: 6 }}>
            {needsSetup
              ? t({ ar: "أدخل إيميلك لتصبح مدير النظام", en: "Enter your email to become the admin" })
              : t({ ar: "أدخل إيميلك المصرح به للدخول", en: "Enter your authorized email to sign in" })}
          </p>
        </div>

        {!isConfigured && (
          <div style={{ padding: "12px 16px", borderRadius: 12, background: "#2D2410", border: "1px solid #7C6A20", marginBottom: 20, fontSize: 13, color: "#FBBF24" }}>
            <strong>{t({ ar: "تنبيه:", en: "Notice:" })}</strong> {t({ ar: "التطبيق غير مربوط بقاعدة البيانات بعد. راجع ملف supabase.js وأدخل معلومات المشروع.", en: "App not connected to database yet. Edit supabase.js with your project credentials." })}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <Mail size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#5C7196" }} />
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); setSuccess(false); }}
              placeholder={t({ ar: "أدخل إيميلك هنا...", en: "Enter your email..." })}
              autoFocus
              disabled={submitting}
              style={{ width: "100%", padding: "14px 14px 14px 44px", borderRadius: 12, border: `2px solid ${error ? "#EF4444" : "#233152"}`, fontSize: 15, outline: "none", direction: "ltr", boxSizing: "border-box", transition: "border-color 0.2s", background: "#0E1830", color: "#E6EDF6", opacity: submitting ? 0.6 : 1 }}
              onFocus={(e) => { if (!error) e.target.style.borderColor = "#12B886"; }}
              onBlur={(e) => { if (!error) e.target.style.borderColor = "#233152"; }}
            />
          </div>

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#2D1215", color: "#EF4444", fontSize: 13, marginBottom: 16 }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {success && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#0D2818", color: "#16A34A", fontSize: 13, marginBottom: 16 }}>
              <CheckCircle2 size={16} /> {t({ ar: "تم التعيين بنجاح!", en: "Admin setup complete!" })}
            </div>
          )}

          <button type="submit" disabled={submitting || (!online && isConfigured)} style={{ width: "100%", padding: "14px", borderRadius: 12, background: "linear-gradient(135deg, #162560, #0F1A47)", color: "#FFFFFF", fontSize: 16, fontWeight: 700, border: "none", cursor: submitting ? "wait" : "pointer", opacity: (submitting || (!online && isConfigured)) ? 0.6 : 1, transition: "opacity 0.2s" }}>
            {submitting
              ? t({ ar: "جاري المعالجة...", en: "Processing..." })
              : needsSetup
                ? t({ ar: "تعيين ودخول", en: "Setup & Enter" })
                  : t({ ar: "دخول", en: "Sign In" })}
          </button>
        </form>

      </div>
    </div>
  );
}

export function AdminPanel() {
  const { t } = useLanguage();
  const { adminEmail, whitelist, addEmail, removeEmail, setShowAdmin, refreshWhitelist, online, dbReady } = useAuth();
  const [newEmail, setNewEmail] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPass, setNewAdminPass] = useState("");
  const [adminSecMsg, setAdminSecMsg] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiSaving, setGeminiSaving] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState(null);
  const [activeTab, setActiveTab] = useState("users");
  const [userStats, setUserStats] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    import("./aiAgent").then(({ getGeminiKey }) => {
      getGeminiKey().then((key) => { if (key) setGeminiKey(key); });
    });
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoadingStats(true);
    const [stats, activity] = await Promise.all([getUserStats(), getRecentActivity(30)]);
    setUserStats(stats);
    setRecentActivity(activity);
    setLoadingStats(false);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!newEmail.trim()) return;
    const ok = await addEmail(newEmail);
    if (!ok) {
      if (whitelist.map(e => e.toLowerCase()).includes(newEmail.trim().toLowerCase())) {
        setError(t({ ar: "هذا الإيميل موجود مسبقاً", en: "This email already exists" }));
      } else {
        setError(t({ ar: "فشل الإضافة. تحقق من اتصالك بالإنترنت", en: "Failed to add. Check your connection" }));
      }
    } else {
      setSuccess(t({ ar: "تمت الإضافة بنجاح", en: "Added successfully" }));
      setNewEmail("");
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshWhitelist();
    setRefreshing(false);
  };

  const users = whitelist.filter(e => e.toLowerCase() !== (adminEmail || "").toLowerCase());

  return (
      <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ width: 520, maxWidth: "95vw", maxHeight: "85vh", background: "#111A2E", borderRadius: 20, overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #162560, #0F1A47)", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Settings size={20} color="#FFFFFF" />
            <h2 style={{ color: "#FFFFFF", fontSize: 18, fontWeight: 700, margin: 0 }}>{t({ ar: "إدارة المستخدمين", en: "User Management" })}</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={handleRefresh} disabled={refreshing} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#FFFFFF", width: 32, height: 32, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button onClick={() => setShowAdmin(false)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#FFFFFF", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: "auto", maxHeight: "calc(85vh - 140px)" }}>
          {/* Status */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: online && dbReady ? "#0D2818" : "#2D1215", display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: online && dbReady ? "#16A34A" : "#EF4444" }}>
              {online && dbReady ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {t({ ar: "متصل بقاعدة البيانات", en: "Connected to database" })}
            </div>
          </div>

          {/* Tab navigation */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#0E1830", borderRadius: 10, padding: 3 }}>
            <button onClick={() => setActiveTab("users")} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.2s", background: activeTab === "users" ? "#16213A" : "transparent", color: activeTab === "users" ? "#12B886" : "#8CA3C1", boxShadow: activeTab === "users" ? "0 1px 3px rgba(0,0,0,0.2)" : "none" }}>
              <Users size={14} /> {t({ ar: "المستخدمين", en: "Users" })}
            </button>
            <button onClick={() => setActiveTab("analytics")} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.2s", background: activeTab === "analytics" ? "#16213A" : "transparent", color: activeTab === "analytics" ? "#12B886" : "#8CA3C1", boxShadow: activeTab === "analytics" ? "0 1px 3px rgba(0,0,0,0.2)" : "none" }}>
              <BarChart3 size={14} /> {t({ ar: "الإحصائيات", en: "Analytics" })}
            </button>
          </div>

          {activeTab === "users" ? (<>
          {/* Admin info */}
          <div style={{ padding: "12px 16px", borderRadius: 12, background: "#0E1830", border: "1px solid #233152", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <Shield size={16} color="#12B886" />
            <span style={{ fontSize: 13, color: "#20D9A0" }}>
              {t({ ar: "مدير النظام:", en: "Admin:" })} <strong>{adminEmail}</strong>
            </span>
          </div>

          {/* Add email form */}
          <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <UserPlus size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#5C7196" }} />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => { setNewEmail(e.target.value); setError(null); setSuccess(null); }}
                placeholder={t({ ar: "أضف إيميل مستخدم جديد...", en: "Add new user email..." })}
                style={{ width: "100%", padding: "12px 12px 12px 38px", borderRadius: 10, border: "2px solid #233152", fontSize: 14, outline: "none", direction: "ltr", boxSizing: "border-box", background: "#0E1830", color: "#E6EDF6" }}
              />
            </div>
            <button type="submit" disabled={!online || !dbReady} style={{ padding: "12px 20px", borderRadius: 10, background: "#12B886", color: "#FFFFFF", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", whiteSpace: "nowrap", opacity: (!online || !dbReady) ? 0.5 : 1 }}>
              {t({ ar: "إضافة", en: "Add" })}
            </button>
          </form>

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "#2D1215", color: "#EF4444", fontSize: 13, marginBottom: 12 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {success && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "#0D2818", color: "#16A34A", fontSize: 13, marginBottom: 12 }}>
              <CheckCircle2 size={14} /> {success}
            </div>
          )}

          {/* Users list */}
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#8CA3C1", marginBottom: 10 }}>
              {t({ ar: `المستخدمون المصرح لهم (${users.length})`, en: `Authorized Users (${users.length})` })}
            </p>

            {users.length === 0 && (
              <p style={{ textAlign: "center", color: "#5C7196", fontSize: 13, padding: 24 }}>
                {t({ ar: "لا يوجد مستخدمين بعد", en: "No users yet" })}
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {users.map((email) => (
                <div key={email} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: "#14213B", border: "1px solid #233152" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #162560, #0F1A47)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
                      {email.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 14, color: "#E6EDF6", direction: "ltr" }}>{email}</span>
                  </div>
                  <button
                    onClick={() => removeEmail(email)}
                    disabled={!online || !dbReady}
                    style={{ background: "none", border: "1px solid #5C2A30", color: "#FB7185", width: 32, height: 32, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s", opacity: (!online || !dbReady) ? 0.5 : 1 }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#2D1215"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                    title={t({ ar: "حذف", en: "Remove" })}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Gemini AI Key Section */}
          <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: "#1A1530", border: "1px solid #4C3A8A" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Bot size={16} color="#A78BFA" />
              <p style={{ fontSize: 13, fontWeight: 700, color: "#A78BFA", margin: 0 }}>
                {t({ ar: "إعداد المساعد الذكي (Gemini AI)", en: "AI Assistant Setup (Gemini AI)" })}
              </p>
            </div>
            <p style={{ fontSize: 11, color: "#8CA3C1", marginBottom: 10 }}>
              {t({
                ar: "مجاني: أدخل مفتاح Gemini من Google AI Studio لتفعيل المساعد الذكي في الشات",
                en: "Free: Enter Gemini key from Google AI Studio to enable AI assistant in chat",
              })}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => { setGeminiKey(e.target.value); setGeminiStatus(null); }}
                placeholder="AIza..."
                style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #4C3A8A", fontSize: 13, outline: "none", direction: "ltr", background: "#0E1830", color: "#E6EDF6" }}
              />
              <button
                onClick={async () => {
                  if (!geminiKey.trim()) return;
                  setGeminiSaving(true);
                  const { saveGeminiKey } = await import("./aiAgent");
                  const ok = await saveGeminiKey(geminiKey.trim());
                  setGeminiSaving(false);
                  setGeminiStatus(ok ? "saved" : "error");
                }}
                disabled={geminiSaving || !geminiKey.trim()}
                style={{ padding: "10px 16px", borderRadius: 8, background: "#7C3AED", color: "#FFF", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", opacity: geminiSaving || !geminiKey.trim() ? 0.5 : 1 }}
              >
                {geminiSaving ? "..." : t({ ar: "حفظ", en: "Save" })}
              </button>
            </div>
            {geminiStatus === "saved" && (
              <p style={{ fontSize: 11, color: "#16A34A", marginTop: 6 }}>
                {t({ ar: "تم حفظ المفتاح بنجاح! المساعد جاهز في الشات", en: "Key saved! Assistant is ready in chat" })}
              </p>
            )}
            {geminiStatus === "error" && (
              <p style={{ fontSize: 11, color: "#EF4444", marginTop: 6 }}>
                {t({ ar: "فشل الحفظ. تحقق من الاتصال", en: "Save failed. Check connection" })}
              </p>
            )}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#A78BFA", marginTop: 6, display: "inline-block" }}>
              {t({ ar: "← احصل على مفتاح مجاني من هنا", en: "← Get free key from here" })}
            </a>
          </div>

          {/* Admin Security Settings Section */}
          <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: "#0E1830", border: "1px solid #233152" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Lock size={16} color="#12B886" />
              <p style={{ fontSize: 13, fontWeight: 700, color: "#12B886", margin: 0 }}>
                {t({ ar: "حماية وتعديل بيانات المدير", en: "Admin Security Settings" })}
              </p>
            </div>
            {adminSecMsg && (
              <div style={{ padding: "8px 12px", borderRadius: 8, background: "#0D2818", color: "#16A34A", fontSize: 12, marginBottom: 10 }}>
                {adminSecMsg}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                type="email"
                placeholder={t({ ar: "تغيير بريد المدير الإلكتروني...", en: "Change Admin Email..." })}
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #233152", fontSize: 13, outline: "none", direction: "ltr", background: "#14213B", color: "#E6EDF6" }}
              />
              <input
                type="password"
                placeholder={t({ ar: "تغيير كلمة مرور المدير...", en: "Change Admin Password..." })}
                value={newAdminPass}
                onChange={(e) => setNewAdminPass(e.target.value)}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #233152", fontSize: 13, outline: "none", direction: "ltr", background: "#14213B", color: "#E6EDF6" }}
              />
              <button
                onClick={async () => {
                  let updated = false;
                  if (newAdminEmail.trim()) {
                    await supabase.from("app_settings").upsert({ key: "admin_email", value: newAdminEmail.trim() }, { onConflict: "key" });
                    updated = true;
                  }
                  if (newAdminPass.trim()) {
                    const salt = generateSalt();
                    const hash = await hashPassword(newAdminPass.trim(), salt);
                    if (hash) {
                      await supabase.from("app_settings").upsert({ key: "admin_password_hash", value: hash }, { onConflict: "key" });
                      await supabase.from("app_settings").upsert({ key: "admin_password_salt", value: salt }, { onConflict: "key" });
                      updated = true;
                    }
                  }
                  if (updated) {
                    setAdminSecMsg(t({ ar: "تم تحديث بيانات الحماية بنجاح!", en: "Security settings updated!" }));
                    setNewAdminEmail("");
                    setNewAdminPass("");
                  }
                }}
                disabled={!newAdminEmail.trim() && !newAdminPass.trim()}
                style={{ padding: "10px", borderRadius: 8, background: "#12B886", color: "#FFF", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", opacity: (!newAdminEmail.trim() && !newAdminPass.trim()) ? 0.5 : 1 }}
              >
                {t({ ar: "تحديث البيانات", en: "Update Credentials" })}
              </button>
            </div>
          </div>

          </>) : (
          /* ── Analytics Tab ──────────────────────────── */
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#E6EDF6", margin: 0 }}>
                {t({ ar: "إحصائيات استخدام التطبيق", en: "App Usage Analytics" })}
              </p>
              <button onClick={loadStats} disabled={loadingStats} style={{ padding: "6px 12px", borderRadius: 8, background: "#16213A", border: "1px solid #233152", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "#8CA3C1" }}>
                <RefreshCw size={12} className={loadingStats ? "animate-spin" : ""} /> {t({ ar: "تحديث", en: "Refresh" })}
              </button>
            </div>

            {loadingStats ? (
              <div style={{ textAlign: "center", padding: 40, color: "#5C7196" }}>{t({ ar: "جاري التحميل...", en: "Loading..." })}</div>
            ) : userStats.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#5C7196" }}>
                <Activity size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: 13 }}>{t({ ar: "لا يوجد نشاط بعد", en: "No activity yet" })}</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {userStats.map((u) => (
                  <div key={u.email} style={{ padding: 14, borderRadius: 12, background: "#14213B", border: "1px solid #233152" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #162560, #0F1A47)", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
                          {u.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: "#E6EDF6", margin: 0, direction: "ltr", textAlign: "left" }}>{u.email}</p>
                          <p style={{ fontSize: 10, color: "#5C7196", margin: 0 }}>
                            <Clock size={10} style={{ display: "inline", verticalAlign: "middle" }} /> {t({ ar: "آخر نشاط:", en: "Last:" })} {new Date(u.lastActivity).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Stats grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                      <div style={{ padding: "6px 8px", borderRadius: 8, background: "#0E1830", textAlign: "center" }}>
                        <p style={{ fontSize: 16, fontWeight: 700, color: "#7DD3FC", margin: 0 }}>{u.logins}</p>
                        <p style={{ fontSize: 9, color: "#8CA3C1", margin: 0 }}>{t({ ar: "دخول", en: "Logins" })}</p>
                      </div>
                      <div style={{ padding: "6px 8px", borderRadius: 8, background: "#0E1830", textAlign: "center" }}>
                        <p style={{ fontSize: 16, fontWeight: 700, color: "#34E0A0", margin: 0 }}>{u.journalImports + u.mergeImports}</p>
                        <p style={{ fontSize: 9, color: "#8CA3C1", margin: 0 }}>{t({ ar: "استيراد", en: "Imports" })}</p>
                      </div>
                      <div style={{ padding: "6px 8px", borderRadius: 8, background: "#0E1830", textAlign: "center" }}>
                        <p style={{ fontSize: 16, fontWeight: 700, color: "#FBBF24", margin: 0 }}>{u.journalExports + u.mergeExports}</p>
                        <p style={{ fontSize: 9, color: "#8CA3C1", margin: 0 }}>{t({ ar: "تصدير", en: "Exports" })}</p>
                      </div>
                      <div style={{ padding: "6px 8px", borderRadius: 8, background: "#0E1830", textAlign: "center" }}>
                        <p style={{ fontSize: 16, fontWeight: 700, color: "#34E0A0", margin: 0 }}>{u.journalImports}</p>
                        <p style={{ fontSize: 9, color: "#8CA3C1", margin: 0 }}>{t({ ar: "قيود", en: "Journals" })}</p>
                      </div>
                      <div style={{ padding: "6px 8px", borderRadius: 8, background: "#0E1830", textAlign: "center" }}>
                        <p style={{ fontSize: 16, fontWeight: 700, color: "#A78BFA", margin: 0 }}>{u.mergeImports}</p>
                        <p style={{ fontSize: 9, color: "#8CA3C1", margin: 0 }}>{t({ ar: "شجرة", en: "Merges" })}</p>
                      </div>
                      <div style={{ padding: "6px 8px", borderRadius: 8, background: u.journalErrors + u.mergeErrors > 0 ? "#2D1215" : "#14213B", textAlign: "center" }}>
                        <p style={{ fontSize: 16, fontWeight: 700, color: u.journalErrors + u.mergeErrors > 0 ? "#FB7185" : "#5C7196", margin: 0 }}>{u.journalErrors + u.mergeErrors}</p>
                        <p style={{ fontSize: 9, color: "#8CA3C1", margin: 0 }}>{t({ ar: "أخطاء", en: "Errors" })}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}