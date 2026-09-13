// ─── User Activity Tracker ──────────────────────────────────────────
// Tracks login, logout, import, export, errors per user

import { supabase } from "./supabase";

export async function trackActivity(userEmail, action, details = {}) {
  try {
    await supabase.from("user_activity").insert({
      user_email: userEmail,
      action,
      details,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[Activity] Track failed:", e);
  }
}

// ── Convenience functions ──────────────────────────────────────────

export function trackLogin(email) {
  return trackActivity(email, "login");
}

export function trackLogout(email) {
  return trackActivity(email, "logout");
}

// [إضافة] نبض دوري أثناء بقاء المستخدم مسجّلاً دخوله والتبويب مفتوحاً (راجع
// useEffect بـauth.jsx) — يعطي حدًّا زمنيًا أدق لآخر لحظة نشاط فعلي بجلسة تنتهي
// بإغلاق المتصفح مباشرة (بلا ضغط "تسجيل خروج" صريح) بدل ما تبقى مدتها مجهولة
// تمامًا. يُستخدَم فقط بحساب مدة الجلسات (getUserSessions أدناه).
export function trackHeartbeat(email) {
  return trackActivity(email, "heartbeat");
}

export function trackJournalImport(email, details = {}) {
  return trackActivity(email, "journal_import", details);
}

export function trackJournalExport(email, details = {}) {
  return trackActivity(email, "journal_export", details);
}

export function trackJournalError(email, details = {}) {
  return trackActivity(email, "journal_error", details);
}

export function trackMergeImport(email, details = {}) {
  return trackActivity(email, "merge_import", details);
}

export function trackMergeExport(email, details = {}) {
  return trackActivity(email, "merge_export", details);
}

export function trackMergeError(email, details = {}) {
  return trackActivity(email, "merge_error", details);
}

// ── Analytics queries ─────────────────────────────────────────────

export async function getUserStats() {
  try {
    // Get all activity
    const { data, error } = await supabase
      .from("user_activity")
      .select("user_email, action, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error || !data) return [];

    // Group by user
    const users = {};
    for (const row of data) {
      const email = row.user_email;
      if (!users[email]) {
        users[email] = {
          email,
          logins: 0,
          logouts: 0,
          journalImports: 0,
          journalExports: 0,
          journalErrors: 0,
          mergeImports: 0,
          mergeExports: 0,
          mergeErrors: 0,
          lastActivity: row.created_at,
          firstActivity: row.created_at,
        };
      }
      const u = users[email];

      switch (row.action) {
        case "login": u.logins++; break;
        case "logout": u.logouts++; break;
        case "journal_import": u.journalImports++; break;
        case "journal_export": u.journalExports++; break;
        case "journal_error": u.journalErrors++; break;
        case "merge_import": u.mergeImports++; break;
        case "merge_export": u.mergeExports++; break;
        case "merge_error": u.mergeErrors++; break;
      }

      // Track first/last activity
      if (row.created_at > u.lastActivity) u.lastActivity = row.created_at;
      if (row.created_at < u.firstActivity) u.firstActivity = row.created_at;
    }

    return Object.values(users).sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
  } catch (e) {
    console.warn("[Activity] GetStats failed:", e);
    return [];
  }
}

export async function getRecentActivity(limit = 50) {
  try {
    const { data, error } = await supabase
      .from("user_activity")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data;
  } catch (e) {
    return [];
  }
}

// ── جلسات مستخدم واحد (مدة كل جلسة دخول) ──────────────────────────────

// [إضافة] يبني قائمة جلسات مستخدم من user_activity: كل 'login' يبدأ جلسة
// جديدة، وأي نشاط لاحق (heartbeat/logout/journal_import/...) قبل 'login'
// التالي يمدّد نهايتها المعروفة. 'logout' الصريح = نهاية دقيقة مؤكَّدة؛ أي
// نشاط آخر (غالبًا heartbeat — راجع trackHeartbeat) = "آخر نشاط معروف"، حد
// أدنى موثوق لمدة الجلسة لا وقت إغلاق فعلي مؤكَّد (لا طريقة مؤكَّدة 100% لمعرفة
// لحظة إغلاق المتصفح فعليًا بلا خروج صريح). آخر جلسة بلا 'login' تالٍ بعدها
// تُعتبر "لا تزال مفتوحة" (ongoing) إن كان آخر نشاط ضِمن ~ضِعف فترة النبض.
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // مطابق للفاصل الفعلي بـauth.jsx

// [إضافة] المنطق النقي (بلا أي استدعاء شبكة) — مُستخرَج من getUserSessions
// عمداً ليكون قابلاً للاختبار مباشرة بصفوف مُلفَّقة، بلا الحاجة لمحاكاة
// عميل supabase. rows: [{action, created_at}] لمستخدم واحد، مُرتَّبة تصاعدياً
// بالوقت (نفس ما يرجعه استعلام getUserSessions أدناه بالضبط).
export function buildSessionsFromActivityRows(rows, { now = Date.now() } = {}) {
  if (!rows || !rows.length) return [];

  const sessions = [];
  let current = null;
  for (const row of rows) {
    if (row.action === "login") {
      if (current) sessions.push(current);
      current = { loginAt: row.created_at, endAt: row.created_at, endReason: "login_only" };
    } else if (current) {
      current.endAt = row.created_at;
      current.endReason = row.action === "logout" ? "logout" : "activity";
    }
  }
  if (current) sessions.push(current);

  return sessions.reverse().map((s, i) => ({
    ...s,
    durationMinutes: Math.max(0, Math.round((new Date(s.endAt).getTime() - new Date(s.loginAt).getTime()) / 60000)),
    ongoing: i === 0 && s.endReason !== "logout" && (now - new Date(s.endAt).getTime()) < HEARTBEAT_INTERVAL_MS * 2,
  }));
}

export async function getUserSessions(email, limit = 500) {
  try {
    const { data, error } = await supabase
      .from("user_activity")
      .select("action, created_at")
      .eq("user_email", email)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error || !data || !data.length) return [];
    return buildSessionsFromActivityRows(data);
  } catch (e) {
    return [];
  }
}
