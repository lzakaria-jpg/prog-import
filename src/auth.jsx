import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useLanguage } from "./language";
import { supabase } from "./supabase";
import { trackLogin, trackLogout, getUserStats, getRecentActivity } from "./activityTracker";
import {
  ROLES, ROLE_LABELS, TOOL_PERMISSIONS, CHAT_PERMISSIONS, DEFAULT_NEW_USER_PERMISSIONS, LEGACY_FULL_ACCESS_PERMISSIONS,
  can, canManageUsers, isOwner, canModifyUser, clampGrantablePermissions,
} from "./lib/permissions";
import { Shield, Mail, UserPlus, UserX, Users, LogOut, Settings, AlertCircle, CheckCircle2, Trash2, Wifi, WifiOff, RefreshCw, Bot, BarChart3, Clock, Activity, Lock, Eye, EyeOff, Key, ScrollText, Ban, Play, ChevronDown, ChevronUp } from "lucide-react";

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
  const [users, setUsers] = useState([]); // كامل سجلات users (role + permissions) — [] إن لم يُرفع الجدول بعد
  const [usersTableReady, setUsersTableReady] = useState(false);
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

  // جدول users (الأدوار والصلاحيات) — قد لا يكون موجوداً بعد إذا لم تُشغَّل
  // migration الـ RBAC؛ عندها تعمل الأداة تماماً كما كانت (بلا صلاحيات دقيقة)
  const loadUsers = useCallback(async () => {
    if (!isConfigured()) return;
    try {
      const { data, error } = await supabase.from("users").select("*");
      if (error) { setUsersTableReady(false); return; }
      setUsers(data || []);
      setUsersTableReady(true);
    } catch (e) {
      setUsersTableReady(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    loadAdminEmail();
    loadWhitelist();
    loadUsers();
  }, [loadAdminEmail, loadWhitelist, loadUsers]);

  useEffect(() => {
    const stored = loadSession();
    if (!stored || loading) return;
    const normalized = stored.toLowerCase();
    if (normalized === adminEmail?.toLowerCase()) {
      setCurrentUser(normalized);
      return;
    }
    // مستخدم مُعطَّل عبر جدول users لا يستعيد جلسته حتى لو بقي بريده في
    // allowed_users القديم — التعطيل الفعلي (active=false) يُحسم منه فوراً
    if (usersTableReady) {
      const row = users.find(u => u.email.toLowerCase() === normalized);
      if (row && row.active === false) { setCurrentUser(null); clearSession(); return; }
    }
    const allowed = whitelist.includes(normalized);
    if (allowed) setCurrentUser(normalized);
    else clearSession();
  }, [adminEmail, loading, whitelist, users, usersTableReady]);

  // خروج فوري إن عُطِّل الحساب أثناء جلسة نشطة (لا ينتظر إعادة تحميل الصفحة)
  useEffect(() => {
    if (!currentUser || !usersTableReady) return;
    const row = users.find(u => u.email.toLowerCase() === currentUser.toLowerCase());
    if (row && row.active === false) { setCurrentUser(null); clearSession(); }
  }, [currentUser, users, usersTableReady]);

  useEffect(() => {
    if (!isConfigured()) { setDbReady(false); return; }
    supabase.from("allowed_users").select("email").limit(1).then(({ error }) => {
      setDbReady(!error);
    }).catch(() => setDbReady(false));
  }, [isConfigured]);

  // realtime: أي تغيير على users (صلاحيات/دور/تعطيل) ينعكس فوراً بلا إعادة تحميل
  useEffect(() => {
    if (!isConfigured()) return;
    const channel = supabase
      .channel("users-table")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => { loadUsers(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isConfigured, loadUsers]);

  const isAdmin = currentUser && adminEmail && currentUser.toLowerCase() === adminEmail.toLowerCase();

  // سجل المستخدم الحالي الكامل (دور + صلاحيات) من جدول users. سقوط آمن قبل
  // تشغيل الـ migration (أو لأي مستخدم قديم لم يُنقَل بعد): "owner" لبريد
  // المدير، و"user" بكل صلاحيات الأدوات القديمة لأي بريد آخر في allowed_users —
  // حتى لا يفقد أي مستخدم قائم وصوله لأداة كان يستخدمها بالأمس بمجرد تفعيل RBAC.
  const currentUserRecord = useMemo(() => {
    if (!currentUser) return null;
    const fromTable = users.find(u => u.email.toLowerCase() === currentUser.toLowerCase());
    if (fromTable) return fromTable;
    if (isAdmin) return { email: currentUser, role: ROLES.OWNER, permissions: {}, active: true };
    if (whitelist.includes(currentUser.toLowerCase())) {
      return { email: currentUser, role: ROLES.USER, permissions: LEGACY_FULL_ACCESS_PERMISSIONS, active: true };
    }
    return null;
  }, [currentUser, users, isAdmin, whitelist]);

  const isUserManager = canManageUsers(currentUserRecord);
  const hasPermission = useCallback((key) => can(currentUserRecord, key), [currentUserRecord]);

  const logAudit = useCallback(async (action, targetEmail, details) => {
    if (!isConfigured() || !currentUser) return;
    try {
      await supabase.from("audit_log").insert({
        actor_email: currentUser, action, target_type: "user", target_email: targetEmail || null,
        details: details || null,
      });
    } catch (e) { /* audit_log قد لا يكون موجوداً بعد — لا يُفشل العملية بسببه */ }
  }, [isConfigured, currentUser]);

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

      try {
        await supabase.from("users").upsert({ email: trimmed, role: ROLES.OWNER, permissions: {}, active: true }, { onConflict: "email" });
      } catch (e) { /* users قد لا يكون موجوداً بعد */ }

      setAdminEmail(trimmed);
      setWhitelist(prev => {
        const lower = prev.map(e => e.toLowerCase());
        if (!lower.includes(trimmed)) return [...prev, trimmed];
        return prev;
      });
      setCurrentUser(trimmed);
      saveSession(trimmed);
      await loadUsers();
      return { ok: true };
    } catch (e) {
      console.error("Setup admin failed:", e);
      return { ok: false };
    }
  }, [isConfigured, loadUsers]);

  const login = useCallback(async (email, password) => {
    const trimmed = (email || "").trim().toLowerCase();
    if (!trimmed) return { ok: false, msg: { ar: "الرجاء كتابة الإيميل", en: "Please enter your email" } };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { ok: false, msg: { ar: "الرجاء كتابة إيميل صحيح", en: "Please enter a valid email" } };

    if (!isConfigured()) {
      return { ok: false, msg: { ar: "التطبيق غير مربوط بقاعدة البيانات. تواصل مع المدير.", en: "App not connected to database. Contact the admin." } };
    }

    await loadWhitelist();
    await loadUsers();
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

    // جدول users هو المرجع إن كان موجوداً — يحمل حالة active وأدوار/صلاحيات دقيقة
    try {
      const { data: userRow, error } = await supabase.from("users").select("*").eq("email", trimmed).maybeSingle();
      if (!error && userRow) {
        if (userRow.active === false) {
          return { ok: false, msg: { ar: "تم تعطيل هذا الحساب. تواصل مع مدير النظام", en: "This account has been deactivated. Contact your admin" } };
        }
        setCurrentUser(trimmed);
        saveSession(trimmed);
        trackLogin(trimmed);
        return { ok: true, admin: false };
      }
    } catch (e) { /* جدول users غير موجود بعد — سقوط آمن على allowed_users أدناه */ }

    try {
      const { data } = await supabase.from("allowed_users").select("email").eq("email", trimmed).single();
      if (data) {
        setCurrentUser(trimmed);
        saveSession(trimmed);
        trackLogin(trimmed);
        return { ok: true, admin: false };
      }
    } catch (e) { /* not found */ }

    return { ok: false, msg: { ar: "هذا الإيميل غير مسموح. تواصل مع المدير للحصول على صلاحية", en: "This email is not authorized. Contact the admin for access" } };
  }, [adminEmail, isConfigured, loadWhitelist, loadAdminEmail, loadUsers]);

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
    await loadUsers();
  }, [loadWhitelist, loadUsers]);

  // ── إدارة المستخدمين (RBAC) — كل عملية تتحقق من canModifyUser قبل التنفيذ،
  // وتُسجَّل في audit_log. الحماية الحقيقية من العبث بالمالك قائمة في الداتابيس
  // (trigger)، وهذه طبقة إضافية تمنع حتى محاولة الإرسال من الواجهة.
  const createUser = useCallback(async (email, { role = ROLES.USER, permissions = DEFAULT_NEW_USER_PERMISSIONS } = {}) => {
    if (!isUserManager) return { ok: false, msg: { ar: "لا تملك صلاحية إدارة المستخدمين", en: "You do not have user-management permission" } };
    const trimmed = (email || "").trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { ok: false, msg: { ar: "إيميل غير صحيح", en: "Invalid email" } };
    if (role === ROLES.OWNER) return { ok: false, msg: { ar: "لا يمكن إنشاء أكثر من مالك واحد", en: "Only one owner can exist" } };
    // Full User Manager لا يمنح صلاحية لا يملكها هو نفسه — سقف يمنع التصعيد غير المباشر
    const grantedPermissions = clampGrantablePermissions(currentUserRecord, permissions);
    try {
      const { error } = await supabase.from("users").insert({ email: trimmed, role, permissions: grantedPermissions, active: true, created_by: currentUser });
      if (error) throw error;
      await supabase.from("allowed_users").upsert({ email: trimmed }, { onConflict: "email" });
      await logAudit("create_user", trimmed, { role, permissions: grantedPermissions });
      await loadUsers();
      await loadWhitelist();
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: { ar: "فشل الإنشاء — قد يكون البريد مستخدماً مسبقاً", en: "Failed to create — email may already exist" } };
    }
  }, [isUserManager, currentUser, currentUserRecord, logAudit, loadUsers, loadWhitelist]);

  const updateUserPermissions = useCallback(async (targetEmail, newPermissions) => {
    const target = users.find(u => u.email.toLowerCase() === targetEmail.toLowerCase());
    if (!canModifyUser(currentUserRecord, target)) return { ok: false, msg: { ar: "غير مسموح", en: "Not allowed" } };
    const grantedPermissions = clampGrantablePermissions(currentUserRecord, newPermissions);
    try {
      const before = target.permissions;
      const { error } = await supabase.from("users").update({ permissions: grantedPermissions }).eq("email", targetEmail);
      if (error) throw error;
      await logAudit("update_permissions", targetEmail, { before, after: grantedPermissions });
      await loadUsers();
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: { ar: "فشل التحديث", en: "Update failed" } };
    }
  }, [users, currentUserRecord, logAudit, loadUsers]);

  const updateUserRole = useCallback(async (targetEmail, newRole) => {
    const target = users.find(u => u.email.toLowerCase() === targetEmail.toLowerCase());
    if (!canModifyUser(currentUserRecord, target)) return { ok: false, msg: { ar: "غير مسموح", en: "Not allowed" } };
    if (newRole === ROLES.OWNER) return { ok: false, msg: { ar: "لا يمكن منح صلاحية المالك", en: "Cannot grant owner role" } };
    try {
      const before = target.role;
      const { error } = await supabase.from("users").update({ role: newRole }).eq("email", targetEmail);
      if (error) throw error;
      await logAudit("update_role", targetEmail, { before, after: newRole });
      await loadUsers();
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: { ar: "فشل التحديث", en: "Update failed" } };
    }
  }, [users, currentUserRecord, logAudit, loadUsers]);

  const setUserActive = useCallback(async (targetEmail, active) => {
    const target = users.find(u => u.email.toLowerCase() === targetEmail.toLowerCase());
    if (!canModifyUser(currentUserRecord, target)) return { ok: false, msg: { ar: "غير مسموح", en: "Not allowed" } };
    try {
      const { error } = await supabase.from("users").update({ active }).eq("email", targetEmail);
      if (error) throw error;
      await logAudit(active ? "activate_user" : "deactivate_user", targetEmail, null);
      await loadUsers();
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: { ar: "فشل التحديث", en: "Update failed" } };
    }
  }, [users, currentUserRecord, logAudit, loadUsers]);

  const deleteUser = useCallback(async (targetEmail) => {
    const target = users.find(u => u.email.toLowerCase() === targetEmail.toLowerCase());
    if (!canModifyUser(currentUserRecord, target)) return { ok: false, msg: { ar: "غير مسموح", en: "Not allowed" } };
    try {
      const { error } = await supabase.from("users").delete().eq("email", targetEmail);
      if (error) throw error;
      await supabase.from("allowed_users").delete().eq("email", targetEmail);
      await logAudit("delete_user", targetEmail, null);
      await loadUsers();
      await loadWhitelist();
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: { ar: "فشل الحذف", en: "Delete failed" } };
    }
  }, [users, currentUserRecord, logAudit, loadUsers, loadWhitelist]);

  // تغيير بريد المالك — يملكه المالك نفسه حصراً (مُتحقَّق هنا من جلسة currentUser،
  // لا من الدور المخزَّن فقط، حتى لا يستدعيه أي مستخدم آخر ولو امتلك الدالة برمجياً)
  const changeOwnerEmail = useCallback(async (newEmail) => {
    if (!isOwner(currentUserRecord) || !currentUser) return { ok: false, msg: { ar: "المالك فقط يمكنه تغيير بريده", en: "Only the owner can change their own email" } };
    const trimmed = (newEmail || "").trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { ok: false, msg: { ar: "إيميل غير صحيح", en: "Invalid email" } };
    try {
      await supabase.from("app_settings").upsert({ key: "admin_email", value: trimmed }, { onConflict: "key" });
      await supabase.from("users").update({ email: trimmed }).eq("email", currentUser);
      await supabase.from("allowed_users").upsert({ email: trimmed }, { onConflict: "email" });
      await logAudit("change_owner_email", trimmed, { before: currentUser });
      setAdminEmail(trimmed);
      setCurrentUser(trimmed);
      saveSession(trimmed);
      await loadUsers();
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: { ar: "فشل التحديث", en: "Update failed" } };
    }
  }, [currentUserRecord, currentUser, logAudit, loadUsers]);

  const getAuditLog = useCallback(async (limit = 300) => {
    if (!isOwner(currentUserRecord)) return [];
    try {
      const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) return [];
      return data || [];
    } catch (e) { return []; }
  }, [currentUserRecord]);

  const value = {
    currentUser, adminEmail, whitelist, isAdmin, isAuthenticated: !!currentUser,
    loading, online, dbReady, showAdmin, setShowAdmin, isConfigured: isConfigured(),
    login, setupAdmin, logout, addEmail, removeEmail, refreshWhitelist,
    // RBAC
    users, usersTableReady, currentUserRecord, isUserManager, isOwnerUser: isOwner(currentUserRecord),
    hasPermission, createUser, updateUserPermissions, updateUserRole, setUserActive, deleteUser,
    changeOwnerEmail, getAuditLog,
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
  const needsPassword = needsSetup || email.trim().toLowerCase() === adminEmail?.toLowerCase();

  // نفَّذ عبر onSubmit للفورم — يعمل بضغط Enter من أي حقل داخله (البريد أو كلمة
  // المرور)، لأن الحقلين الآن داخل نفس <form> بدل أن تكون كلمة المرور خارجه.
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
        <div style={{ textAlign: "center", color: "#0F172A" }}>
          <RefreshCw size={32} className="animate-spin" />
          <p style={{ marginTop: 12, fontSize: 14 }}>{t({ ar: "جاري التحميل...", en: "Loading..." })}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #162560 0%, #0F1A47 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Cairo, Segoe UI, sans-serif" }}>
      <div style={{ width: 440, maxWidth: "95vw", background: "#FFFFFF", borderRadius: 20, padding: "40px 36px", boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, background: online ? "#DCFCE7" : "#FEE2E2", fontSize: 11, fontWeight: 600, color: online ? "#16A34A" : "#DC2626" }}>
            {online ? <Wifi size={12} /> : <WifiOff size={12} />}
            {online ? t({ ar: "متصل", en: "Online" }) : t({ ar: "غير متصل", en: "Offline" })}
          </div>
          {isConfigured && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, background: dbReady ? "#DCFCE7" : "#FEE2E2", fontSize: 11, fontWeight: 600, color: dbReady ? "#16A34A" : "#DC2626" }}>
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
          <p style={{ fontSize: 13, color: "#64748B", marginTop: 6 }}>
            {needsSetup
              ? t({ ar: "أدخل إيميلك لتصبح مدير النظام", en: "Enter your email to become the admin" })
              : t({ ar: "أدخل إيميلك المصرح به للدخول", en: "Enter your authorized email to sign in" })}
          </p>
        </div>

        {!isConfigured && (
          <div style={{ padding: "12px 16px", borderRadius: 12, background: "#FEF3C7", border: "1px solid #FDE68A", marginBottom: 20, fontSize: 13, color: "#FBBF24" }}>
            <strong>{t({ ar: "تنبيه:", en: "Notice:" })}</strong> {t({ ar: "التطبيق غير مربوط بقاعدة البيانات بعد. راجع ملف supabase.js وأدخل معلومات المشروع.", en: "App not connected to database yet. Edit supabase.js with your project credentials." })}
          </div>
        )}

        {/* كل حقول الدخول — بما فيها كلمة مرور المدير — داخل نفس الفورم، فيعمل
            الإرسال بضغط Enter من أي منها بدل الحاجة للنقر على الزر يدوياً */}
        <form onSubmit={handleSubmit}>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <Mail size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); setSuccess(false); }}
              placeholder={t({ ar: "أدخل إيميلك هنا...", en: "Enter your email..." })}
              autoFocus
              disabled={submitting}
              style={{ width: "100%", padding: "14px 14px 14px 44px", borderRadius: 12, border: `2px solid ${error ? "#DC2626" : "#E2E8F0"}`, fontSize: 15, outline: "none", direction: "ltr", boxSizing: "border-box", transition: "border-color 0.2s", background: "#F1F5F9", color: "#0F172A", opacity: submitting ? 0.6 : 1 }}
              onFocus={(e) => { if (!error) e.target.style.borderColor = "#12B886"; }}
              onBlur={(e) => { if (!error) e.target.style.borderColor = "#E2E8F0"; }}
            />
          </div>

          {needsPassword && (
            <div style={{ position: "relative", marginBottom: 16 }}>
              <Shield size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => { setAdminPassword(e.target.value); setError(null); setSuccess(false); }}
                placeholder={t({ ar: "كلمة مرور المدير", en: "Administrator password" })}
                autoComplete="current-password"
                disabled={submitting}
                style={{ width: "100%", padding: "14px 14px 14px 44px", borderRadius: 12, border: `2px solid ${error ? "#DC2626" : "#E2E8F0"}`, fontSize: 15, outline: "none", direction: "ltr", boxSizing: "border-box", background: "#F1F5F9", color: "#0F172A" }}
              />
            </div>
          )}

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#FEE2E2", color: "#DC2626", fontSize: 13, marginBottom: 16 }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {success && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#DCFCE7", color: "#16A34A", fontSize: 13, marginBottom: 16 }}>
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

// ─────────────────────────────────────────────────────────────────────────
// لوحة إدارة المستخدمين — تبويبات: المستخدمون (RBAC) · الإحصائيات · سجل
// التدقيق (Audit Log — يظهر للمالك فقط).
// ─────────────────────────────────────────────────────────────────────────
export function AdminPanel() {
  const { t } = useLanguage();
  const {
    adminEmail, whitelist, setShowAdmin, online, dbReady,
    users, usersTableReady, currentUserRecord, isOwnerUser,
    createUser, updateUserPermissions, updateUserRole, setUserActive, deleteUser, changeOwnerEmail, getAuditLog,
  } = useAuth();
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
  const [selectedUser, setSelectedUser] = useState(null); // email المفتوح للتحرير
  const [newUserEmail, setNewUserEmail] = useState("");
  const [auditRows, setAuditRows] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  useEffect(() => {
    import("./aiAgent").then(({ getGeminiKey }) => {
      getGeminiKey().then((key) => { if (key) setGeminiKey(key); });
    });
    loadStats();
  }, []);

  useEffect(() => {
    if (activeTab === "audit" && isOwnerUser) loadAudit();
  }, [activeTab, isOwnerUser]);

  const loadStats = async () => {
    setLoadingStats(true);
    const [stats, activity] = await Promise.all([getUserStats(), getRecentActivity(30)]);
    setUserStats(stats);
    setRecentActivity(activity);
    setLoadingStats(false);
  };

  const loadAudit = async () => {
    setLoadingAudit(true);
    setAuditRows(await getAuditLog());
    setLoadingAudit(false);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!newUserEmail.trim()) return;
    const res = await createUser(newUserEmail);
    if (!res.ok) setError(t(res.msg));
    else { setSuccess(t({ ar: "تمت إضافة المستخدم بنجاح", en: "User added successfully" })); setNewUserEmail(""); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  // قائمة العرض: من جدول users إن كان جاهزاً، وإلا من whitelist القديمة (بلا صلاحيات دقيقة)
  const displayUsers = usersTableReady
    ? users.filter(u => u.role !== ROLES.OWNER)
    : whitelist.filter(e => e.toLowerCase() !== (adminEmail || "").toLowerCase()).map(email => ({ email, role: ROLES.USER, permissions: {}, active: true }));

  const ownerRow = usersTableReady ? users.find(u => u.role === ROLES.OWNER) : null;

  return (
      <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ width: 620, maxWidth: "95vw", maxHeight: "88vh", background: "#FFFFFF", borderRadius: 20, overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #162560, #0F1A47)", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
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
        <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
          {!usersTableReady && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FEF3C7", border: "1px solid #FDE68A", marginBottom: 16, fontSize: 12, color: "#FBBF24" }}>
              {t({
                ar: "لم يُشغَّل جدول الأدوار والصلاحيات (users) بعد في قاعدة البيانات — شغّل database-schema-rbac-chat.sql في محرر SQL بسوبابيس لتفعيل الأدوار والصلاحيات الدقيقة. حتى ذلك الحين، كل المستخدمين المضافين هنا مستخدمون عاديون بصلاحيات الشات الأساسية فقط.",
                en: "The roles/permissions table (users) hasn't been run yet — run database-schema-rbac-chat.sql in the Supabase SQL editor to enable fine-grained roles and permissions. Until then, every user added here is a plain user with basic chat permissions only.",
              })}
            </div>
          )}

          {/* Status */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: online && dbReady ? "#DCFCE7" : "#FEE2E2", display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: online && dbReady ? "#16A34A" : "#DC2626" }}>
              {online && dbReady ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {t({ ar: "متصل بقاعدة البيانات", en: "Connected to database" })}
            </div>
          </div>

          {/* Tab navigation */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#F1F5F9", borderRadius: 10, padding: 3 }}>
            <TabBtn active={activeTab === "users"} onClick={() => setActiveTab("users")} icon={Users} label={{ ar: "المستخدمون", en: "Users" }} />
            <TabBtn active={activeTab === "analytics"} onClick={() => setActiveTab("analytics")} icon={BarChart3} label={{ ar: "الإحصائيات", en: "Analytics" }} />
            {isOwnerUser && <TabBtn active={activeTab === "audit"} onClick={() => setActiveTab("audit")} icon={ScrollText} label={{ ar: "سجل التدقيق", en: "Audit Log" }} />}
            {isOwnerUser && <TabBtn active={activeTab === "owner"} onClick={() => setActiveTab("owner")} icon={Lock} label={{ ar: "بيانات المالك", en: "Owner Settings" }} />}
          </div>

          {activeTab === "users" && (
            <UsersTab
              t={t} ownerRow={ownerRow} displayUsers={displayUsers} usersTableReady={usersTableReady}
              currentUserRecord={currentUserRecord}
              newUserEmail={newUserEmail} setNewUserEmail={setNewUserEmail} handleCreateUser={handleCreateUser}
              error={error} success={success} online={online} dbReady={dbReady}
              selectedUser={selectedUser} setSelectedUser={setSelectedUser}
              updateUserPermissions={updateUserPermissions} updateUserRole={updateUserRole}
              setUserActive={setUserActive} deleteUser={deleteUser}
              setError={setError} setSuccess={setSuccess}
              geminiKey={geminiKey} setGeminiKey={setGeminiKey} geminiSaving={geminiSaving} setGeminiSaving={setGeminiSaving}
              geminiStatus={geminiStatus} setGeminiStatus={setGeminiStatus}
            />
          )}

          {activeTab === "analytics" && (
            <AnalyticsTab t={t} loadingStats={loadingStats} userStats={userStats} loadStats={loadStats} />
          )}

          {activeTab === "audit" && isOwnerUser && (
            <AuditTab t={t} loadingAudit={loadingAudit} auditRows={auditRows} loadAudit={loadAudit} />
          )}

          {activeTab === "owner" && isOwnerUser && (
            <OwnerSettingsTab t={t} adminEmail={adminEmail} changeOwnerEmail={changeOwnerEmail} generateSalt={generateSalt} hashPassword={hashPassword} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }) {
  const { t } = useLanguage();
  return (
    <button onClick={onClick} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.2s", background: active ? "#F8FAFC" : "transparent", color: active ? "#12B886" : "#64748B", boxShadow: active ? "0 1px 3px rgba(0,0,0,0.2)" : "none" }}>
      <Icon size={14} /> {t(label)}
    </button>
  );
}

function RoleBadge({ role }) {
  const { t } = useLanguage();
  const colors = { [ROLES.OWNER]: "#FBBF24", [ROLES.FULL_USER_MANAGER]: "#0284C7", [ROLES.USER]: "#64748B" };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: `${colors[role]}22`, color: colors[role] }}>
      {t(ROLE_LABELS[role] || { ar: role, en: role })}
    </span>
  );
}

// ─── تبويب المستخدمين ───────────────────────────────────────────────────
function UsersTab({
  t, ownerRow, displayUsers, usersTableReady, currentUserRecord,
  newUserEmail, setNewUserEmail, handleCreateUser, error, success, online, dbReady,
  selectedUser, setSelectedUser, updateUserPermissions, updateUserRole, setUserActive, deleteUser,
  setError, setSuccess, geminiKey, setGeminiKey, geminiSaving, setGeminiSaving, geminiStatus, setGeminiStatus,
}) {
  const editing = selectedUser ? displayUsers.find(u => u.email === selectedUser) : null;

  return (
    <>
      {/* Owner info */}
      <div style={{ padding: "12px 16px", borderRadius: 12, background: "#F1F5F9", border: "1px solid #E2E8F0", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
        <Shield size={16} color="#12B886" />
        <span style={{ fontSize: 13, color: "#15803D" }}>
          {t({ ar: "المالك:", en: "Owner:" })} <strong>{ownerRow?.email || "—"}</strong>
        </span>
        <span style={{ marginInlineStart: "auto" }}><RoleBadge role={ROLES.OWNER} /></span>
      </div>

      {/* Add user form */}
      <form onSubmit={handleCreateUser} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <UserPlus size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
          <input
            type="email"
            value={newUserEmail}
            onChange={(e) => { setNewUserEmail(e.target.value); setError(null); setSuccess(null); }}
            placeholder={t({ ar: "أضف إيميل مستخدم جديد...", en: "Add new user email..." })}
            style={{ width: "100%", padding: "12px 12px 12px 38px", borderRadius: 10, border: "2px solid #E2E8F0", fontSize: 14, outline: "none", direction: "ltr", boxSizing: "border-box", background: "#F1F5F9", color: "#0F172A" }}
          />
        </div>
        <button type="submit" disabled={!online || !dbReady} style={{ padding: "12px 20px", borderRadius: 10, background: "#12B886", color: "#FFFFFF", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", whiteSpace: "nowrap", opacity: (!online || !dbReady) ? 0.5 : 1 }}>
          {t({ ar: "إضافة", en: "Add" })}
        </button>
      </form>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "#FEE2E2", color: "#DC2626", fontSize: 13, marginBottom: 12 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {success && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "#DCFCE7", color: "#16A34A", fontSize: 13, marginBottom: 12 }}>
          <CheckCircle2 size={14} /> {success}
        </div>
      )}

      {/* Users list */}
      <div style={{ marginTop: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 10 }}>
          {t({ ar: `المستخدمون (${displayUsers.length})`, en: `Users (${displayUsers.length})` })}
        </p>

        {displayUsers.length === 0 && (
          <p style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: 24 }}>
            {t({ ar: "لا يوجد مستخدمين بعد", en: "No users yet" })}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {displayUsers.map((u) => (
            <div key={u.email} style={{ borderRadius: 10, background: "#F8FAFC", border: "1px solid #E2E8F0", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", cursor: usersTableReady ? "pointer" : "default" }}
                onClick={() => usersTableReady && setSelectedUser(selectedUser === u.email ? null : u.email)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #162560, #0F1A47)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                    {u.email.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 14, color: u.active === false ? "#94A3B8" : "#0F172A", direction: "ltr", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: u.active === false ? "line-through" : "none" }}>{u.email}</span>
                  {usersTableReady && <RoleBadge role={u.role} />}
                  {u.active === false && <span style={{ fontSize: 10, color: "#DC2626", fontWeight: 700 }}>{t({ ar: "معطَّل", en: "Disabled" })}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {usersTableReady && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setUserActive(u.email, u.active === false); }}
                      disabled={!online || !dbReady}
                      title={u.active === false ? t({ ar: "تفعيل", en: "Activate" }) : t({ ar: "تعطيل", en: "Deactivate" })}
                      style={{ background: "none", border: `1px solid ${u.active === false ? "#1B4332" : "#FDE68A"}`, color: u.active === false ? "#15803D" : "#FBBF24", width: 30, height: 30, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      {u.active === false ? <Play size={13} /> : <Ban size={13} />}
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); if (window.confirm(t({ ar: `حذف ${u.email}؟ لا يمكن التراجع.`, en: `Delete ${u.email}? This cannot be undone.` }))) deleteUser(u.email); }}
                    disabled={!online || !dbReady}
                    style={{ background: "none", border: "1px solid #FCA5A5", color: "#DC2626", width: 30, height: 30, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    title={t({ ar: "حذف", en: "Remove" })}
                  >
                    <Trash2 size={13} />
                  </button>
                  {usersTableReady && (selectedUser === u.email ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />)}
                </div>
              </div>

              {usersTableReady && selectedUser === u.email && (
                <UserPermissionEditor
                  t={t} user={u}
                  updateUserPermissions={updateUserPermissions} updateUserRole={updateUserRole}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Gemini AI Key Section */}
      <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: "#F5F3FF", border: "1px solid #DDD6FE" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Bot size={16} color="#7C3AED" />
          <p style={{ fontSize: 13, fontWeight: 700, color: "#7C3AED", margin: 0 }}>
            {t({ ar: "إعداد المساعد الذكي (Gemini AI)", en: "AI Assistant Setup (Gemini AI)" })}
          </p>
        </div>
        <p style={{ fontSize: 11, color: "#64748B", marginBottom: 10 }}>
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
            style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD6FE", fontSize: 13, outline: "none", direction: "ltr", background: "#F1F5F9", color: "#0F172A" }}
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
          <p style={{ fontSize: 11, color: "#DC2626", marginTop: 6 }}>
            {t({ ar: "فشل الحفظ. تحقق من الاتصال", en: "Save failed. Check connection" })}
          </p>
        )}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#7C3AED", marginTop: 6, display: "inline-block" }}>
          {t({ ar: "← احصل على مفتاح مجاني من هنا", en: "← Get free key from here" })}
        </a>
      </div>
    </>
  );
}

// لوحة تشيك بوكس بكل الصلاحيات المتاحة، مصنّفة (أدوات / شات)، ومحدِّد دور
function UserPermissionEditor({ t, user, updateUserPermissions, updateUserRole }) {
  const [perms, setPerms] = useState(user.permissions || {});
  const [role, setRole] = useState(user.role);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setPerms(user.permissions || {}); setRole(user.role); setSaved(false); }, [user.email]);

  const toggle = (key) => setPerms((p) => ({ ...p, [key]: !p[key] }));

  const handleSave = async () => {
    setSaving(true);
    if (role !== user.role) await updateUserRole(user.email, role);
    await updateUserPermissions(user.email, perms);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: "14px 16px", borderTop: "1px solid #E2E8F0", background: "#F1F5F9" }} onClick={(e) => e.stopPropagation()}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 6 }}>
        {t({ ar: "الدور", en: "Role" })}
      </label>
      {/* استثناء التصميم الفاتح: القوائم المنسدلة تبقى داكنة كما كانت */}
      <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #233152", background: "#0E1830", color: "#E6EDF6", fontSize: 13, marginBottom: 14 }}>
        <option value={ROLES.USER}>{t(ROLE_LABELS[ROLES.USER])}</option>
        <option value={ROLES.FULL_USER_MANAGER}>{t(ROLE_LABELS[ROLES.FULL_USER_MANAGER])}</option>
      </select>

      <p style={{ fontSize: 12, fontWeight: 700, color: "#0284C7", margin: "0 0 8px" }}>{t({ ar: "صلاحيات الأدوات", en: "Tool Permissions" })}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
        {TOOL_PERMISSIONS.map((p) => (
          <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#0F172A", cursor: "pointer" }}>
            <input type="checkbox" checked={!!perms[p.key]} onChange={() => toggle(p.key)} /> {t(p.label)}
          </label>
        ))}
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, color: "#0284C7", margin: "0 0 8px" }}>{t({ ar: "صلاحيات الشات", en: "Chat Permissions" })}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
        {CHAT_PERMISSIONS.map((p) => (
          <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#0F172A", cursor: "pointer" }}>
            <input type="checkbox" checked={!!perms[p.key]} onChange={() => toggle(p.key)} /> {t(p.label)}
          </label>
        ))}
      </div>

      <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "10px", borderRadius: 8, background: saved ? "#0A9B72" : "#12B886", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}>
        {saving ? t({ ar: "جاري الحفظ...", en: "Saving..." }) : saved ? t({ ar: "تم الحفظ ✓", en: "Saved ✓" }) : t({ ar: "حفظ الصلاحيات", en: "Save Permissions" })}
      </button>
    </div>
  );
}

// ─── تبويب الإحصائيات ───────────────────────────────────────────────────
function AnalyticsTab({ t, loadingStats, userStats, loadStats }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: 0 }}>
          {t({ ar: "إحصائيات استخدام التطبيق", en: "App Usage Analytics" })}
        </p>
        <button onClick={loadStats} disabled={loadingStats} style={{ padding: "6px 12px", borderRadius: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "#64748B" }}>
          <RefreshCw size={12} className={loadingStats ? "animate-spin" : ""} /> {t({ ar: "تحديث", en: "Refresh" })}
        </button>
      </div>

      {loadingStats ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>{t({ ar: "جاري التحميل...", en: "Loading..." })}</div>
      ) : userStats.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
          <Activity size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: 13 }}>{t({ ar: "لا يوجد نشاط بعد", en: "No activity yet" })}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {userStats.map((u) => (
            <div key={u.email} style={{ padding: 14, borderRadius: 12, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #162560, #0F1A47)", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
                    {u.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#0F172A", margin: 0, direction: "ltr", textAlign: "left" }}>{u.email}</p>
                    <p style={{ fontSize: 10, color: "#94A3B8", margin: 0 }}>
                      <Clock size={10} style={{ display: "inline", verticalAlign: "middle" }} /> {t({ ar: "آخر نشاط:", en: "Last:" })} {new Date(u.lastActivity).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                <div style={{ padding: "6px 8px", borderRadius: 8, background: "#F1F5F9", textAlign: "center" }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "#0284C7", margin: 0 }}>{u.logins}</p>
                  <p style={{ fontSize: 9, color: "#64748B", margin: 0 }}>{t({ ar: "دخول", en: "Logins" })}</p>
                </div>
                <div style={{ padding: "6px 8px", borderRadius: 8, background: "#F1F5F9", textAlign: "center" }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "#15803D", margin: 0 }}>{u.journalImports + u.mergeImports}</p>
                  <p style={{ fontSize: 9, color: "#64748B", margin: 0 }}>{t({ ar: "استيراد", en: "Imports" })}</p>
                </div>
                <div style={{ padding: "6px 8px", borderRadius: 8, background: "#F1F5F9", textAlign: "center" }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "#FBBF24", margin: 0 }}>{u.journalExports + u.mergeExports}</p>
                  <p style={{ fontSize: 9, color: "#64748B", margin: 0 }}>{t({ ar: "تصدير", en: "Exports" })}</p>
                </div>
                <div style={{ padding: "6px 8px", borderRadius: 8, background: "#F1F5F9", textAlign: "center" }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "#15803D", margin: 0 }}>{u.journalImports}</p>
                  <p style={{ fontSize: 9, color: "#64748B", margin: 0 }}>{t({ ar: "قيود", en: "Journals" })}</p>
                </div>
                <div style={{ padding: "6px 8px", borderRadius: 8, background: "#F1F5F9", textAlign: "center" }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "#7C3AED", margin: 0 }}>{u.mergeImports}</p>
                  <p style={{ fontSize: 9, color: "#64748B", margin: 0 }}>{t({ ar: "شجرة", en: "Merges" })}</p>
                </div>
                <div style={{ padding: "6px 8px", borderRadius: 8, background: u.journalErrors + u.mergeErrors > 0 ? "#FEE2E2" : "#F8FAFC", textAlign: "center" }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: u.journalErrors + u.mergeErrors > 0 ? "#DC2626" : "#94A3B8", margin: 0 }}>{u.journalErrors + u.mergeErrors}</p>
                  <p style={{ fontSize: 9, color: "#64748B", margin: 0 }}>{t({ ar: "أخطاء", en: "Errors" })}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── تبويب سجل التدقيق (Owner فقط) ──────────────────────────────────────
function AuditTab({ t, loadingAudit, auditRows, loadAudit }) {
  const actionLabels = {
    create_user: { ar: "إنشاء مستخدم", en: "Create user" },
    delete_user: { ar: "حذف مستخدم", en: "Delete user" },
    update_permissions: { ar: "تعديل صلاحيات", en: "Update permissions" },
    update_role: { ar: "تعديل دور", en: "Update role" },
    activate_user: { ar: "تفعيل مستخدم", en: "Activate user" },
    deactivate_user: { ar: "تعطيل مستخدم", en: "Deactivate user" },
    change_owner_email: { ar: "تغيير بريد المالك", en: "Change owner email" },
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>
          {t({ ar: "يظهر هذا السجل للمالك فقط، ولا يمكن لأي مستخدم تعديله أو حذفه.", en: "Only visible to the owner. No one can edit or delete these records." })}
        </p>
        <button onClick={loadAudit} disabled={loadingAudit} style={{ padding: "6px 12px", borderRadius: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "#64748B", flexShrink: 0 }}>
          <RefreshCw size={12} className={loadingAudit ? "animate-spin" : ""} /> {t({ ar: "تحديث", en: "Refresh" })}
        </button>
      </div>
      {loadingAudit ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>{t({ ar: "جاري التحميل...", en: "Loading..." })}</div>
      ) : auditRows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
          <ScrollText size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: 13 }}>{t({ ar: "لا توجد سجلات بعد", en: "No records yet" })}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflow: "auto" }}>
          {auditRows.map((row) => (
            <div key={row.id} style={{ padding: "10px 12px", borderRadius: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: "#0284C7" }}>{t(actionLabels[row.action] || { ar: row.action, en: row.action })}</span>
                <span style={{ color: "#94A3B8", fontSize: 10 }}>{new Date(row.created_at).toLocaleString()}</span>
              </div>
              <p style={{ margin: "0 0 2px", color: "#0F172A", direction: "ltr", textAlign: "left" }}>
                <strong>{row.actor_email}</strong> {row.target_email ? <>→ {row.target_email}</> : null}
              </p>
              {row.details && (
                <pre style={{ margin: "6px 0 0", fontSize: 10, color: "#64748B", whiteSpace: "pre-wrap", wordBreak: "break-word", direction: "ltr", textAlign: "left" }}>
                  {JSON.stringify(row.details)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── تبويب بيانات المالك (Owner فقط: بريده وكلمة مروره) ─────────────────
function OwnerSettingsTab({ t, adminEmail, changeOwnerEmail, generateSalt, hashPassword }) {
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPass, setNewAdminPass] = useState("");
  const [msg, setMsg] = useState(null);

  const handleUpdate = async () => {
    let updated = false;
    if (newAdminEmail.trim()) {
      const res = await changeOwnerEmail(newAdminEmail.trim());
      if (res.ok) updated = true;
      else { setMsg(t(res.msg)); return; }
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
      setMsg(t({ ar: "تم تحديث بيانات الحماية بنجاح!", en: "Security settings updated!" }));
      setNewAdminEmail("");
      setNewAdminPass("");
    }
  };

  return (
    <div style={{ padding: 16, borderRadius: 12, background: "#F1F5F9", border: "1px solid #E2E8F0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Lock size={16} color="#12B886" />
        <p style={{ fontSize: 13, fontWeight: 700, color: "#12B886", margin: 0 }}>
          {t({ ar: "حماية وتعديل بيانات المالك — أنت وحدك من يمكنه تغيير بريدك", en: "Owner security settings — only you can change your own email" })}
        </p>
      </div>
      <p style={{ fontSize: 11, color: "#64748B", marginBottom: 10, direction: "ltr", textAlign: "left" }}>{t({ar:"البريد الحالي:",en:"Current email:"})} {adminEmail}</p>
      {msg && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "#DCFCE7", color: "#16A34A", fontSize: 12, marginBottom: 10 }}>
          {msg}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="email"
          placeholder={t({ ar: "تغيير بريد المالك الإلكتروني...", en: "Change owner email..." })}
          value={newAdminEmail}
          onChange={(e) => setNewAdminEmail(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", direction: "ltr", background: "#F8FAFC", color: "#0F172A" }}
        />
        <input
          type="password"
          placeholder={t({ ar: "تغيير كلمة مرور المالك...", en: "Change owner password..." })}
          value={newAdminPass}
          onChange={(e) => setNewAdminPass(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", direction: "ltr", background: "#F8FAFC", color: "#0F172A" }}
        />
        <button
          onClick={handleUpdate}
          disabled={!newAdminEmail.trim() && !newAdminPass.trim()}
          style={{ padding: "10px", borderRadius: 8, background: "#12B886", color: "#FFF", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", opacity: (!newAdminEmail.trim() && !newAdminPass.trim()) ? 0.5 : 1 }}
        >
          {t({ ar: "تحديث البيانات", en: "Update Credentials" })}
        </button>
      </div>
    </div>
  );
}
