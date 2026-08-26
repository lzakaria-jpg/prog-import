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
