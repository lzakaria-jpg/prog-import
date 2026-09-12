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

// [تحديث 2026-09-07] مسار "نسيت كلمة المرور" الذاتي عبر البريد (Resend) معطَّل
// مؤقتاً من الواجهة — بلا تحقق دومين مخصص بـResend، Sandbox mode ما يرسل إلا
// لإيميل حساب Resend نفسه، فما ينفع لمستخدمين حقيقيين. البديل الحالي: الأدمن
// يولّد الرابط يدوياً من لوحة إدارة المستخدمين ويوصّله بنفسه (سلاك/واتساب) —
// راجع generateResetLinkForUser و auth-admin-generate-reset-link.js. الكود
// القديم (requestPasswordReset، شاشة mode==='forgot'، auth-request-reset.js)
// باقٍ بالكامل بلا حذف — رجّع هذا الثابت لـtrue لإعادة تفعيله بعد التحقق من
// دومين Resend مستقبلاً.
const SELF_SERVICE_RESET_ENABLED = false;

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
    // [إصلاح أمني 2026-09-07] كان أي استثناء هنا (حتى قطع شبكة عابر أثناء
    // التحقق) يُسقِط النظام على هاش/ملح ثابتين بالكود كـfallback — أي أن أي
    // خطأ عابر، حتى لو Supabase شغّال وكلمة مرور حقيقية مضبوطة، كان يفتح باباً
    // خلفياً للدخول بكلمة المرور الافتراضية الثابتة. الفشل الآمن هنا رفض
    // الدخول، لا قبوله بقيمة ثابتة.
    console.error("Error verifying admin password:", err);
    return false;
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
      // [تحديث 2026-09-07] تحديد الأعمدة صراحة بدل select("*") — عمدًا، حتى لو
      // أُضيفت أعمدة حساسة مستقبلاً لجدول users نفسه، لا تصل تلقائياً هنا للمتصفح.
      // بيانات الاعتماد الفعلية (كلمات المرور/رموز إعادة التعيين) أصلاً غير
      // موجودة بهذا الجدول إطلاقاً — محفوظة بجدول user_credentials منفصل تماماً،
      // لا يُقرأ إلا من الدوال السيرفرلس بمفتاح service_role (انظر functions/api/auth-*.js).
      const { data, error } = await supabase.from("users").select("email, role, permissions, active, created_by");
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

    // [تحديث 2026-09-07] كل مستخدم غير المالك له الآن كلمة مرور فردية حقيقية،
    // يُتحقَّق منها بالكامل على السيرفر (Cloudflare Function) — الهاش والملح لا
    // يصلان للمتصفح إطلاقاً. قبل هذا التحديث كان وجود الإيميل بجدول
    // users/allowed_users كافياً وحده لمنح الدخول بلا أي تحقق هوية ثانٍ (أي
    // شخص يعرف إيميل مُصرَّحاً له يدخل باسمه بلا كلمة مرور) — هذي كانت الثغرة
    // الأساسية التي عولجت هنا. reason:'no_password_set' تعني أن الإيميل مُصرَّح
    // له لكنه لم يعيّن كلمة مرور بعد؛ الواجهة تحوّله تلقائياً لشاشة التعيين.
    try {
      const res = await fetch("/api/auth-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, password }),
      });
      const data = await res.json();
      if (data.ok) {
        setCurrentUser(trimmed);
        saveSession(trimmed);
        // [إصلاح 2026-09-12] trackLogin هنا كانت تُسجَّل مرتين لكل دخول فعلي: مرة هنا
        // بالمتصفح، ومرة بالسيرفر (auth-login.js يسجّلها الآن بنفسه — insertUserActivity
        // — ليحسب عدد مرات الدخول لإشعار المالك بدقة). أُزيلت من هنا فقط (لا تلمس مسار
        // المالك أدناه، الذي لا يمر بـ/api/auth-login إطلاقًا فلا ازدواج فيه).
        return { ok: true, admin: false };
      }
      if (data.reason === "no_password_set") return { ok: false, reason: "no_password_set" };
      if (data.reason === "deactivated") {
        return { ok: false, msg: { ar: "تم تعطيل هذا الحساب. تواصل مع مدير النظام", en: "This account has been deactivated. Contact your admin" } };
      }
      if (data.reason === "locked") {
        const mins = data.lockedUntil ? Math.max(1, Math.ceil((new Date(data.lockedUntil).getTime() - Date.now()) / 60000)) : 15;
        return { ok: false, msg: { ar: `تم قفل الدخول مؤقتاً لكثرة المحاولات الفاشلة — حاول بعد ${mins} دقيقة، أو أعد تعيين كلمة المرور`, en: `Login temporarily locked due to failed attempts — try again in ${mins} min, or reset your password` } };
      }
      return { ok: false, msg: { ar: "هذا الإيميل غير مسموح، أو كلمة المرور غير صحيحة", en: "This email is not authorized, or the password is incorrect" } };
    } catch (e) {
      return { ok: false, msg: { ar: "تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى", en: "Could not reach the server. Check your connection and try again" } };
    }
  }, [adminEmail, isConfigured, loadWhitelist, loadAdminEmail, loadUsers]);

  // تعيين كلمة مرور أول مرة (لا كلمة مرور حالية بعد)
  const setInitialPassword = useCallback(async (email, newPassword) => {
    try {
      const res = await fetch("/api/auth-set-initial-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: (email || "").trim().toLowerCase(), newPassword }),
      });
      return await res.json();
    } catch (e) { return { ok: false, reason: "network_error" }; }
  }, []);

  // طلب رابط إعادة تعيين عبر البريد — يرجّع دائماً نفس الرسالة العامة من السيرفر
  const requestPasswordReset = useCallback(async (email) => {
    try {
      const res = await fetch("/api/auth-request-reset", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: (email || "").trim().toLowerCase() }),
      });
      return await res.json();
    } catch (e) { return { ok: false, reason: "network_error" }; }
  }, []);

  // إتمام إعادة التعيين عبر الرمز الموجود برابط البريد
  const resetPassword = useCallback(async (token, newPassword) => {
    try {
      const res = await fetch("/api/auth-reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      return await res.json();
    } catch (e) { return { ok: false, reason: "network_error" }; }
  }, []);

  // تغيير كلمة المرور الذاتي وهو مسجّل دخول — يتطلب كلمة المرور الحالية
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    if (!currentUser) return { ok: false, reason: "not_logged_in" };
    try {
      const res = await fetch("/api/auth-change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentUser, currentPassword, newPassword }),
      });
      return await res.json();
    } catch (e) { return { ok: false, reason: "network_error" }; }
  }, [currentUser]);

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

  // توليد رابط إعادة تعيين لمستخدم آخر — يديره الأدمن يدوياً (بديل مسار البريد
  // المعطَّل مؤقتاً، راجع SELF_SERVICE_RESET_ENABLED). يتطلب كلمة مرور الأدمن
  // الحالي نفسه (actorPassword) لأن السيرفر يتحقق منها فعلياً قبل إصدار رابط
  // يفتح حساب شخص آخر — راجع تعليق auth-admin-generate-reset-link.js لتفاصيل
  // حدود التحقق (Full User Manager: تحقق كامل · Owner: بلا تحقق تشفيري بعد).
  const generateResetLinkForUser = useCallback(async (targetEmail, actorPassword) => {
    const trimmedTarget = (targetEmail || "").trim().toLowerCase();
    const target = users.find(u => u.email.toLowerCase() === trimmedTarget);
    if (!canModifyUser(currentUserRecord, target)) return { ok: false, msg: { ar: "غير مسموح", en: "Not allowed" } };
    if (!actorPassword) return { ok: false, msg: { ar: "أدخل كلمة مرورك للتأكيد", en: "Enter your password to confirm" } };
    try {
      const res = await fetch("/api/auth-admin-generate-reset-link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorEmail: currentUser, actorPassword, targetEmail: trimmedTarget }),
      });
      const data = await res.json();
      if (data.ok) await logAudit("password_reset_link_generated", trimmedTarget, { expiresAt: data.expiresAt });
      return data;
    } catch (e) { return { ok: false, reason: "network_error" }; }
  }, [users, currentUserRecord, currentUser, logAudit]);

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
    setInitialPassword, requestPasswordReset, resetPassword, changePassword,
    // RBAC
    users, usersTableReady, currentUserRecord, isUserManager, isOwnerUser: isOwner(currentUserRecord),
    hasPermission, createUser, updateUserPermissions, updateUserRole, setUserActive, deleteUser,
    changeOwnerEmail, getAuditLog, generateResetLinkForUser,
    selfServiceResetEnabled: SELF_SERVICE_RESET_ENABLED,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// طول 8 رموز فأكثر بلا أي شرط تنويع — نفس القاعدة حرفياً المطبَّقة على السيرفر
// (functions/_shared/authCrypto.js isValidNewPassword). دالة صغيرة منفصلة عمداً
// (بلا استيراد عبر حدود مجلد functions/ من src/) لتبقى واجهة العميل مستقلة
// تماماً عن حزمة الدوال السيرفرلس؛ أي تعديل بأحدهما لا يفرض تعديل الآخر.
function isValidNewPasswordClient(pw) {
  return typeof pw === "string" && pw.length >= 8;
}

const authFieldStyle = (hasError) => ({ width: "100%", padding: "14px 14px 14px 44px", borderRadius: 12, border: `2px solid ${hasError ? "#DC2626" : "#E2E8F0"}`, fontSize: 15, outline: "none", direction: "ltr", boxSizing: "border-box", background: "#F1F5F9", color: "#0F172A" });

// حقلا "كلمة مرور جديدة" و"تأكيد كلمة المرور" — كانا مكررين حرفياً بين وضعي
// set_initial وreset_token أدناه (نفس التصميم والسلوك تماماً، فقط سياق مختلف
// يعرضهما).
function NewPasswordFields({ t, newPassword, setNewPassword, confirmPassword, setConfirmPassword, resetMessages, submitting, error }) {
  return (
    <>
      <div style={{ position: "relative", marginBottom: 16 }}>
        <Key size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
        <input type="password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); resetMessages(); }}
          placeholder={t({ ar: "كلمة مرور جديدة (8 رموز على الأقل)", en: "New password (min. 8 characters)" })}
          autoComplete="new-password" autoFocus disabled={submitting} style={authFieldStyle(!!error)} />
      </div>
      <div style={{ position: "relative", marginBottom: 16 }}>
        <Key size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
        <input type="password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); resetMessages(); }}
          placeholder={t({ ar: "تأكيد كلمة المرور", en: "Confirm password" })}
          autoComplete="new-password" disabled={submitting} style={authFieldStyle(!!error)} />
      </div>
    </>
  );
}

export function LoginScreen() {
  const { t } = useLanguage();
  const { setupAdmin, login, setInitialPassword, requestPasswordReset, resetPassword, adminEmail, loading, online, dbReady, isConfigured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // 'login' · 'set_initial' (أول تعيين لكلمة مرور) · 'forgot' (طلب رابط إعادة
  // تعيين) · 'reset_token' (إتمام إعادة التعيين — يُفتح مباشرة من رابط البريد)
  const [mode, setMode] = useState("login");
  const [resetToken, setResetToken] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const needsSetup = !loading && !adminEmail;
  const isAdminEmailTyped = email.trim().toLowerCase() === adminEmail?.toLowerCase() && !!adminEmail;

  // فتح الشاشة عبر رابط إعادة التعيين المُرسَل بالبريد (?reset=<token>) — لا
  // يوجد نظام routing بالتطبيق (SPA بلا مسارات)، فنكتشف الرمز من الرابط
  // الرئيسي نفسه مباشرة عند التحميل.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("reset");
      if (token) { setResetToken(token); setMode("reset_token"); }
    } catch (e) { /* لا شيء */ }
  }, []);

  const resetMessages = () => { setError(null); setSuccess(null); };
  const backToLogin = () => { setMode("login"); setNewPassword(""); setConfirmPassword(""); resetMessages(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);

    try {
      if (needsSetup) {
        const result = await setupAdmin(email, password);
        if (!result.ok) setError(t({ ar: "فشل التعيين. تحقق من الإيميل واتصالك بالإنترنت", en: "Setup failed. Check your email and connection" }));
        else setSuccess(t({ ar: "تم التعيين بنجاح!", en: "Admin setup complete!" }));
      } else if (mode === "login") {
        const result = await login(email, password);
        if (!result.ok) {
          if (result.reason === "no_password_set") { setMode("set_initial"); }
          else setError(t(result.msg));
        } else {
          setSuccess(t({ ar: "تم الدخول!", en: "Signed in!" }));
        }
      } else if (mode === "set_initial") {
        if (!isValidNewPasswordClient(newPassword)) { setError(t({ ar: "كلمة المرور 8 رموز على الأقل (أرقام أو أحرف أو رموز، بأي تركيبة)", en: "Password must be at least 8 characters (any mix)" })); setSubmitting(false); return; }
        if (newPassword !== confirmPassword) { setError(t({ ar: "كلمتا المرور غير متطابقتين", en: "Passwords do not match" })); setSubmitting(false); return; }
        const result = await setInitialPassword(email, newPassword);
        if (!result.ok) {
          setError(result.reason === "already_set"
            ? t({ ar: "كلمة المرور معيّنة مسبقاً — استخدم تسجيل الدخول أو رابط نسيت كلمة المرور", en: "Password already set — use sign in or forgot password" })
            : t({ ar: "تعذّر تعيين كلمة المرور. تحقق من البيانات وحاول مرة أخرى", en: "Could not set the password. Check your details and try again" }));
        } else {
          const loginResult = await login(email, newPassword);
          if (loginResult.ok) setSuccess(t({ ar: "تم تعيين كلمة المرور والدخول بنجاح!", en: "Password set and signed in!" }));
          else { setMode("login"); setPassword(""); setSuccess(t({ ar: "تم تعيين كلمة المرور — سجّل دخولك الآن", en: "Password set — please sign in now" })); }
        }
      } else if (mode === "forgot") {
        if (!email.trim()) { setError(t({ ar: "الرجاء كتابة الإيميل", en: "Please enter your email" })); setSubmitting(false); return; }
        await requestPasswordReset(email);
        setSuccess(t({ ar: "إن كان هذا الإيميل مسجَّلاً لدينا، وصلته رسالة تحتوي رابط إعادة التعيين (صالح 30 دقيقة). تفقّد بريدك.", en: "If this email is registered, a reset link was sent (valid 30 min). Check your inbox." }));
      } else if (mode === "reset_token") {
        if (!isValidNewPasswordClient(newPassword)) { setError(t({ ar: "كلمة المرور 8 رموز على الأقل (أرقام أو أحرف أو رموز، بأي تركيبة)", en: "Password must be at least 8 characters (any mix)" })); setSubmitting(false); return; }
        if (newPassword !== confirmPassword) { setError(t({ ar: "كلمتا المرور غير متطابقتين", en: "Passwords do not match" })); setSubmitting(false); return; }
        const result = await resetPassword(resetToken, newPassword);
        if (!result.ok) {
          setError(t({ ar: "الرابط غير صالح أو منتهي الصلاحية (صالح 30 دقيقة فقط، ويعمل مرة واحدة). اطلب رابطاً جديداً", en: "Link is invalid or expired (valid 30 min, single use). Request a new one" }));
        } else {
          try { window.history.replaceState({}, "", window.location.pathname); } catch (e) { /* لا شيء */ }
          setMode("login");
          setNewPassword(""); setConfirmPassword(""); setEmail("");
          setSuccess(t({ ar: "تم تغيير كلمة المرور بنجاح — سجّل دخولك الآن", en: "Password changed successfully — please sign in now" }));
        }
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
            {needsSetup ? t({ ar: "تعيين مدير النظام", en: "Setup Admin" })
              : mode === "set_initial" ? t({ ar: "عيّن كلمة مرورك", en: "Set your password" })
              : mode === "forgot" ? t({ ar: "نسيت كلمة المرور؟", en: "Forgot password?" })
              : mode === "reset_token" ? t({ ar: "كلمة مرور جديدة", en: "New password" })
              : t({ ar: "أدوات قيود المحاسبية", en: "Qoyod Accounting Tools" })}
          </h1>
          <p style={{ fontSize: 13, color: "#64748B", marginTop: 6 }}>
            {needsSetup ? t({ ar: "أدخل إيميلك لتصبح مدير النظام", en: "Enter your email to become the admin" })
              : mode === "set_initial" ? t({ ar: "هذا أول دخول لك — عيّن كلمة مرور تستخدمها من الآن بكل دخول قادم، وتقدر تغيّرها لاحقاً من داخل النظام", en: "This is your first login — set a password you'll use for every future login. You can change it later from within the app" })
              : mode === "forgot" ? t({ ar: "اكتب إيميلك وبنرسل لك رابط تعيين كلمة مرور جديدة", en: "Enter your email and we'll send you a link to set a new password" })
              : mode === "reset_token" ? t({ ar: "اكتب كلمة المرور الجديدة مرتين للتأكيد", en: "Enter your new password twice to confirm" })
              : t({ ar: "أدخل إيميلك وكلمة المرور للدخول", en: "Enter your email and password to sign in" })}
          </p>
        </div>

        {!isConfigured && (
          <div style={{ padding: "12px 16px", borderRadius: 12, background: "#FEF3C7", border: "1px solid #FDE68A", marginBottom: 20, fontSize: 13, color: "#FBBF24" }}>
            <strong>{t({ ar: "تنبيه:", en: "Notice:" })}</strong> {t({ ar: "التطبيق غير مربوط بقاعدة البيانات بعد. راجع ملف supabase.js وأدخل معلومات المشروع.", en: "App not connected to database yet. Edit supabase.js with your project credentials." })}
          </div>
        )}

        {/* كل الحقول داخل نفس الفورم بكل الأوضاع، فيعمل الإرسال بضغط Enter من
            أي حقل بلا الحاجة للنقر على الزر يدوياً */}
        <form onSubmit={handleSubmit}>
          {(needsSetup || mode === "login" || mode === "forgot") && (
            <div style={{ position: "relative", marginBottom: 16 }}>
              <Mail size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); resetMessages(); }}
                placeholder={t({ ar: "أدخل إيميلك هنا...", en: "Enter your email..." })}
                autoFocus
                disabled={submitting}
                style={{ ...authFieldStyle(!!error), opacity: submitting ? 0.6 : 1 }}
              />
            </div>
          )}

          {(needsSetup || mode === "login") && (
            <div style={{ position: "relative", marginBottom: 8 }}>
              <Shield size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); resetMessages(); }}
                placeholder={needsSetup || isAdminEmailTyped ? t({ ar: "كلمة مرور المدير", en: "Administrator password" }) : t({ ar: "كلمة المرور", en: "Password" })}
                autoComplete="current-password"
                disabled={submitting}
                style={authFieldStyle(!!error)}
              />
            </div>
          )}

          {SELF_SERVICE_RESET_ENABLED && mode === "login" && !needsSetup && !isAdminEmailTyped && (
            <div style={{ textAlign: "left", marginBottom: 16 }}>
              <button type="button" onClick={() => { setMode("forgot"); resetMessages(); }} style={{ background: "none", border: "none", color: "#0284C7", fontSize: 12, cursor: "pointer", padding: 0 }}>
                {t({ ar: "نسيت كلمة المرور؟", en: "Forgot password?" })}
              </button>
            </div>
          )}
          {!SELF_SERVICE_RESET_ENABLED && mode === "login" && !needsSetup && !isAdminEmailTyped && (
            <div style={{ textAlign: "left", marginBottom: 16, fontSize: 12, color: "#94A3B8" }}>
              {t({ ar: "نسيت كلمة المرور؟ تواصل مع مدير النظام", en: "Forgot password? Contact your admin" })}
            </div>
          )}

          {mode === "set_initial" && !needsSetup && (
            <>
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "#F1F5F9", marginBottom: 16, fontSize: 13, color: "#64748B", direction: "ltr", textAlign: "left" }}>{email}</div>
              <NewPasswordFields t={t} newPassword={newPassword} setNewPassword={setNewPassword} confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword} resetMessages={resetMessages} submitting={submitting} error={error} />
            </>
          )}

          {mode === "reset_token" && (
            <>
              <NewPasswordFields t={t} newPassword={newPassword} setNewPassword={setNewPassword} confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword} resetMessages={resetMessages} submitting={submitting} error={error} />
            </>
          )}

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#FEE2E2", color: "#DC2626", fontSize: 13, marginBottom: 16 }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {success && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#DCFCE7", color: "#16A34A", fontSize: 13, marginBottom: 16 }}>
              <CheckCircle2 size={16} /> {success}
            </div>
          )}

          <button type="submit" disabled={submitting || (!online && isConfigured)} style={{ width: "100%", padding: "14px", borderRadius: 12, background: "linear-gradient(135deg, #162560, #0F1A47)", color: "#FFFFFF", fontSize: 16, fontWeight: 700, border: "none", cursor: submitting ? "wait" : "pointer", opacity: (submitting || (!online && isConfigured)) ? 0.6 : 1, transition: "opacity 0.2s" }}>
            {submitting
              ? t({ ar: "جاري المعالجة...", en: "Processing..." })
              : needsSetup ? t({ ar: "تعيين ودخول", en: "Setup & Enter" })
              : mode === "set_initial" ? t({ ar: "تعيين ودخول", en: "Set & Sign In" })
              : mode === "forgot" ? t({ ar: "إرسال رابط إعادة التعيين", en: "Send reset link" })
              : mode === "reset_token" ? t({ ar: "حفظ كلمة المرور الجديدة", en: "Save new password" })
              : t({ ar: "دخول", en: "Sign In" })}
          </button>
        </form>

        {!needsSetup && mode !== "login" && (
          <button type="button" onClick={backToLogin} style={{ width: "100%", marginTop: 14, background: "none", border: "none", color: "#64748B", fontSize: 12, cursor: "pointer" }}>
            {t({ ar: "← رجوع لتسجيل الدخول", en: "← Back to sign in" })}
          </button>
        )}

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
    generateResetLinkForUser,
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
              generateResetLinkForUser={generateResetLinkForUser}
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
  generateResetLinkForUser,
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
                  generateResetLinkForUser={generateResetLinkForUser}
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
function UserPermissionEditor({ t, user, updateUserPermissions, updateUserRole, generateResetLinkForUser }) {
  const [perms, setPerms] = useState(user.permissions || {});
  const [role, setRole] = useState(user.role);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // توليد رابط إعادة تعيين كلمة المرور يدوياً — بديل مسار البريد المعطَّل حالياً
  const [showResetForm, setShowResetForm] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [resetLink, setResetLink] = useState(null);
  const [resetExpiresAt, setResetExpiresAt] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    setPerms(user.permissions || {}); setRole(user.role); setSaved(false);
    setShowResetForm(false); setAdminPassword(""); setResetError(null); setResetLink(null); setResetExpiresAt(null); setLinkCopied(false);
  }, [user.email]);

  const RESET_ERROR_LABELS = {
    not_authorized: { ar: "لا تملك صلاحية توليد رابط لهذا المستخدم", en: "You're not allowed to generate a link for this user" },
    wrong_actor_password: { ar: "كلمة مرورك غير صحيحة", en: "Your password is incorrect" },
    target_not_found: { ar: "المستخدم غير موجود", en: "User not found" },
    target_is_owner: { ar: "لا يمكن لمالك النظام استخدام هذا المسار", en: "The owner cannot use this path" },
    target_inactive: { ar: "الحساب معطَّل", en: "Account is deactivated" },
    invalid_request: { ar: "بيانات غير صحيحة", en: "Invalid data" },
    network_error: { ar: "تعذر الاتصال بالخادم", en: "Could not reach the server" },
    server_error: { ar: "خطأ بالخادم", en: "Server error" },
  };

  const handleGenerateResetLink = async () => {
    setResetLoading(true);
    setResetError(null);
    const res = await generateResetLinkForUser(user.email, adminPassword);
    setResetLoading(false);
    if (res.ok) {
      setResetLink(res.resetLink);
      setResetExpiresAt(res.expiresAt);
      setAdminPassword("");
    } else {
      setResetError(t(res.msg || RESET_ERROR_LABELS[res.reason] || { ar: "تعذّر توليد الرابط", en: "Could not generate the link" }));
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(resetLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (e) { /* المتصفح رفض الوصول للحافظة — المستخدم ينسخ يدوياً من الحقل */ }
  };

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

      {/* توليد رابط إعادة تعيين كلمة المرور — يديره الأدمن يدوياً */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #E2E8F0" }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#0284C7", margin: "0 0 8px" }}>
          {t({ ar: "إعادة تعيين كلمة المرور", en: "Password reset" })}
        </p>

        {!showResetForm && !resetLink && (
          <button
            onClick={() => setShowResetForm(true)}
            style={{ width: "100%", padding: "10px", borderRadius: 8, background: "#FFFFFF", border: "1px solid #BAE6FD", color: "#0284C7", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            <Key size={14} /> {t({ ar: "توليد رابط إعادة تعيين", en: "Generate reset link" })}
          </button>
        )}

        {showResetForm && !resetLink && (
          <div>
            <p style={{ fontSize: 12, color: "#64748B", margin: "0 0 8px" }}>
              {t({ ar: "أدخل كلمة مرورك أنت (الأدمن) للتأكيد", en: "Enter your own (admin) password to confirm" })}
            </p>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => { setAdminPassword(e.target.value); setResetError(null); }}
              placeholder={t({ ar: "كلمة مرورك", en: "Your password" })}
              autoComplete="current-password"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
            />
            {resetError && (
              <p style={{ fontSize: 12, color: "#DC2626", margin: "0 0 8px" }}>{resetError}</p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleGenerateResetLink}
                disabled={resetLoading || !adminPassword}
                style={{ flex: 1, padding: "9px", borderRadius: 8, background: "#0284C7", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", opacity: (resetLoading || !adminPassword) ? 0.6 : 1 }}
              >
                {resetLoading ? t({ ar: "جاري التوليد...", en: "Generating..." }) : t({ ar: "تأكيد وتوليد", en: "Confirm & generate" })}
              </button>
              <button
                onClick={() => { setShowResetForm(false); setAdminPassword(""); setResetError(null); }}
                style={{ padding: "9px 14px", borderRadius: 8, background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B", fontSize: 13, cursor: "pointer" }}
              >
                {t({ ar: "إلغاء", en: "Cancel" })}
              </button>
            </div>
          </div>
        )}

        {resetLink && (
          <div>
            <p style={{ fontSize: 12, color: "#15803D", margin: "0 0 8px", fontWeight: 600 }}>
              {t({ ar: "انسخ الرابط ووصّله للمستخدم يدويًا (سلاك/واتساب)", en: "Copy the link and send it to the user manually (Slack/WhatsApp)" })}
            </p>
            <input
              readOnly
              value={resetLink}
              onFocus={(e) => e.target.select()}
              dir="ltr"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #BBF7D0", background: "#F0FDF4", color: "#0F172A", fontSize: 12, marginBottom: 8, boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                onClick={handleCopyLink}
                style={{ flex: 1, padding: "9px", borderRadius: 8, background: linkCopied ? "#0A9B72" : "#12B886", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}
              >
                {linkCopied ? t({ ar: "تم النسخ ✓", en: "Copied ✓" }) : t({ ar: "نسخ الرابط", en: "Copy link" })}
              </button>
              <button
                onClick={() => { setResetLink(null); setResetExpiresAt(null); setShowResetForm(false); }}
                style={{ padding: "9px 14px", borderRadius: 8, background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B", fontSize: 13, cursor: "pointer" }}
              >
                {t({ ar: "إغلاق", en: "Close" })}
              </button>
            </div>
            {resetExpiresAt && (
              <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>
                {t({ ar: "صالح حتى:", en: "Valid until:" })} {new Date(resetExpiresAt).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>
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
    // [تحديث 2026-09-07] أحداث نظام كلمات المرور الفردية الجديد
    initial_password_set: { ar: "تعيين كلمة مرور لأول مرة", en: "Initial password set" },
    password_changed: { ar: "تغيير كلمة المرور", en: "Password changed" },
    password_reset_completed: { ar: "إتمام إعادة تعيين كلمة المرور", en: "Password reset completed" },
    password_reset_link_generated: { ar: "توليد رابط إعادة تعيين (يدوي من الأدمن)", en: "Reset link generated (manual, by admin)" },
    login_locked: { ar: "قفل تسجيل الدخول (محاولات فاشلة متكررة)", en: "Login locked (repeated failed attempts)" },
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

// ─────────────────────────────────────────────────────────────────────────
// نافذة "تغيير كلمة المرور" — لأي مستخدم مسجّل دخول (غير المالك، الذي له
// آلية منفصلة بتبويب "بيانات المالك" أعلاه). تتطلب كلمة المرور الحالية قبل
// قبول الجديدة (منع الاستيلاء على الحساب من جلسة مفتوحة بجهاز مشترك).
// ─────────────────────────────────────────────────────────────────────────
export function ChangePasswordModal({ onClose }) {
  const { t } = useLanguage();
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!isValidNewPasswordClient(newPassword)) {
      setError(t({ ar: "كلمة المرور 8 رموز على الأقل (أرقام أو أحرف أو رموز، بأي تركيبة)", en: "Password must be at least 8 characters (any mix)" }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t({ ar: "كلمتا المرور غير متطابقتين", en: "Passwords do not match" }));
      return;
    }
    setSubmitting(true);
    const result = await changePassword(currentPassword, newPassword);
    setSubmitting(false);
    if (!result.ok) {
      setError(
        result.reason === "wrong_current_password" ? t({ ar: "كلمة المرور الحالية غير صحيحة", en: "Current password is incorrect" })
          : result.reason === "no_password_set" ? t({ ar: "لم تُعيّن كلمة مرور بعد — سجّل خروج وأعد الدخول لتعيينها أول مرة", en: "No password set yet — sign out and sign in again to set one" })
          : t({ ar: "تعذّر التغيير. حاول مرة أخرى", en: "Could not change password. Try again" })
      );
    } else {
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ width: 380, maxWidth: "92vw", background: "#FFFFFF", borderRadius: 20, overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ background: "linear-gradient(135deg, #162560, #0F1A47)", padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Key size={18} color="#FFFFFF" />
            <h2 style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 700, margin: 0 }}>{t({ ar: "تغيير كلمة المرور", en: "Change password" })}</h2>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#FFFFFF", width: 28, height: 28, borderRadius: 8, cursor: "pointer" }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 22 }}>
          <input
            type="password" value={currentPassword}
            onChange={(e) => { setCurrentPassword(e.target.value); setError(null); }}
            placeholder={t({ ar: "كلمة المرور الحالية", en: "Current password" })} autoComplete="current-password" disabled={submitting}
            style={{ ...authFieldStyle(!!error), padding: "12px 14px", marginBottom: 12 }}
          />
          <input
            type="password" value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
            placeholder={t({ ar: "كلمة مرور جديدة (8 رموز على الأقل)", en: "New password (min. 8 characters)" })} autoComplete="new-password" disabled={submitting}
            style={{ ...authFieldStyle(!!error), padding: "12px 14px", marginBottom: 12 }}
          />
          <input
            type="password" value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
            placeholder={t({ ar: "تأكيد كلمة المرور الجديدة", en: "Confirm new password" })} autoComplete="new-password" disabled={submitting}
            style={{ ...authFieldStyle(!!error), padding: "12px 14px", marginBottom: 14 }}
          />
          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "#FEE2E2", color: "#DC2626", fontSize: 12, marginBottom: 12 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
          {success && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "#DCFCE7", color: "#16A34A", fontSize: 12, marginBottom: 12 }}>
              <CheckCircle2 size={14} /> {t({ ar: "تم تغيير كلمة المرور بنجاح", en: "Password changed successfully" })}
            </div>
          )}
          <button type="submit" disabled={submitting} style={{ width: "100%", padding: 12, borderRadius: 10, background: "#12B886", color: "#FFF", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", opacity: submitting ? 0.6 : 1 }}>
            {submitting ? t({ ar: "جاري الحفظ...", en: "Saving..." }) : t({ ar: "حفظ", en: "Save" })}
          </button>
        </form>
      </div>
    </div>
  );
}
