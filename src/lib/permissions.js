// ─────────────────────────────────────────────────────────────────────────
// Central permission model — roles, tool grants, and chat action grants.
//
// Three roles, exactly as specified:
//   OWNER              — full access to everything, always. Immutable: no other
//                         user can ever edit/delete/disable/reassign the owner,
//                         and the owner can only ever change their own email
//                         (enforced client-side here + a DB trigger for real
//                         backend protection — see database-schema-rbac.sql).
//   FULL_USER_MANAGER   — can manage all users except the owner (create, edit,
//                         delete, activate/deactivate, grant/revoke permissions,
//                         change role). Does NOT automatically get every tool —
//                         their own tool/chat access is governed by the same
//                         `permissions` grants as a regular user.
//   USER                — only the tools/actions explicitly granted to them.
//
// `permissions` is a flat JSONB map of permission-key -> true stored per user
// row. A missing key means "not granted" — there is no implicit default
// beyond the small starter set applied at creation time (still explicit,
// just pre-checked for convenience).
// ─────────────────────────────────────────────────────────────────────────

export const ROLES = {
  OWNER: "owner",
  FULL_USER_MANAGER: "full_user_manager",
  USER: "user",
};

export const ROLE_LABELS = {
  [ROLES.OWNER]: { ar: "المالك", en: "Owner" },
  [ROLES.FULL_USER_MANAGER]: { ar: "مدير مستخدمين كامل", en: "Full User Manager" },
  [ROLES.USER]: { ar: "مستخدم", en: "User" },
};

/** أدوات التطبيق — تُطابق tab ids في App.jsx بالضبط */
export const TOOL_PERMISSIONS = [
  { key: "tool.journal", label: { ar: "تحليل القيود واستيرادها", en: "Journal Entries Import" } },
  { key: "tool.merge", label: { ar: "تحليل الشجرة واستيرادها", en: "Chart of Accounts Import" } },
  { key: "tool.bills", label: { ar: "استيراد فواتير المشتريات", en: "Purchase Invoice Import" } },
  { key: "tool.sales", label: { ar: "استيراد فواتير المبيعات", en: "Sales Invoice Import" } },
  { key: "tool.chat", label: { ar: "الشات", en: "Chat" } },
  { key: "tool.ai", label: { ar: "الذكاء الاصطناعي", en: "AI Assistant" } },
];

/** صلاحيات الشات التفصيلية */
export const CHAT_PERMISSIONS = [
  { key: "chat.view_public", label: { ar: "عرض الشات العام", en: "View public chat" } },
  { key: "chat.send", label: { ar: "إرسال رسائل", en: "Send messages" } },
  { key: "chat.delete_own", label: { ar: "حذف رسائلي الخاصة", en: "Delete own messages" } },
  { key: "chat.delete_others", label: { ar: "حذف رسائل الآخرين", en: "Delete others' messages" } },
  { key: "chat.edit_own", label: { ar: "تعديل رسائلي الخاصة", en: "Edit own messages" } },
  { key: "chat.pin", label: { ar: "تثبيت الرسائل", en: "Pin messages" } },
  { key: "chat.manage_groups", label: { ar: "إنشاء وإدارة المجموعات", en: "Create/manage groups" } },
  { key: "chat.manage_group_members", label: { ar: "إضافة وإزالة أعضاء المجموعة", en: "Add/remove group members" } },
  { key: "chat.clear_chat", label: { ar: "تفريغ الشات بالكامل", en: "Clear entire chat" } },
];

export const ALL_PERMISSION_KEYS = [...TOOL_PERMISSIONS, ...CHAT_PERMISSIONS].map((p) => p.key);

/** الصلاحيات الافتراضية المقترحة عند إنشاء مستخدم جديد — تبقى قابلة لإلغاء التحديد قبل الحفظ */
export const DEFAULT_NEW_USER_PERMISSIONS = {
  "tool.chat": true,
  "chat.view_public": true,
  "chat.send": true,
  "chat.delete_own": true,
  "chat.edit_own": true,
};

/**
 * صلاحيات كاملة بكل الأدوات + الشات الأساسي — تُستخدم فقط كسقوط آمن بديل
 * لمستخدم كان مسموحاً له بكل شيء (allowed_users) قبل نظام الأدوار الدقيقة،
 * حتى لا يفقد أي مستخدم قائم وصوله لأي أداة كان يستخدمها بالأمس بمجرد
 * تفعيل RBAC — لا تُستخدم لمستخدم جديد يُنشأ بعد اليوم (ذاك DEFAULT_NEW_USER_PERMISSIONS).
 */
export const LEGACY_FULL_ACCESS_PERMISSIONS = {
  "tool.journal": true, "tool.merge": true, "tool.bills": true, "tool.sales": true,
  "tool.chat": true, "tool.ai": true,
  "chat.view_public": true, "chat.send": true, "chat.delete_own": true, "chat.edit_own": true,
};

/**
 * هل يملك هذا المستخدم صلاحية معيّنة؟
 * المالك يملك كل شيء دائماً بلا استثناء، بصرف النظر عن كائن permissions المخزَّن.
 *
 * @param {{role?:string, permissions?:object, active?:boolean}|null} user
 * @param {string} key
 */
export function can(user, key) {
  if (!user || user.active === false) return false;
  if (user.role === ROLES.OWNER) return true;
  return !!user.permissions?.[key];
}

/** هل يملك صلاحية إدارة المستخدمين (owner أو full_user_manager) */
export function canManageUsers(user) {
  if (!user || user.active === false) return false;
  return user.role === ROLES.OWNER || user.role === ROLES.FULL_USER_MANAGER;
}

export function isOwner(user) {
  return !!user && user.role === ROLES.OWNER;
}

/**
 * هل يملك actingUser الحق في تعديل/حذف/تعطيل targetUser؟
 * القاعدة المطلقة: لا أحد — ولا حتى Full User Manager آخر — يمكنه المساس بالمالك إطلاقاً.
 * ولا يمكن لأي مستخدم ترقية نفسه أو تعديل صلاحياته عبر مسار الإدارة هذا (لا self-targeting).
 */
export function canModifyUser(actingUser, targetUser) {
  if (!actingUser || !targetUser) return false;
  if (isOwner(targetUser)) return false; // لا استثناء إطلاقاً
  if (actingUser.email?.toLowerCase() === targetUser.email?.toLowerCase()) return false; // لا تعديل الذات
  if (!canManageUsers(actingUser)) return false;
  return true;
}

/**
 * Full User Manager لا يمنح صلاحية لا يملكها هو نفسه — سقف واقعي لمنع التصعيد
 * غير المباشر (يمنح غيره ما لم يُمنَحه هو). المالك مستثنى دائماً لأنه يملك كل شيء أصلاً.
 */
export function clampGrantablePermissions(actingUser, requestedPermissions) {
  if (isOwner(actingUser)) return requestedPermissions;
  const clamped = {};
  for (const [key, value] of Object.entries(requestedPermissions || {})) {
    if (value && !can(actingUser, key)) continue; // لا يملكها هو، فلا يمنحها
    clamped[key] = value;
  }
  return clamped;
}

/** تُستخدم لعرض/إخفاء أعمدة أدوات NAV_ITEMS في App.jsx */
export function visibleTools(user) {
  return TOOL_PERMISSIONS.filter((t) => can(user, t.key)).map((t) => t.key);
}
