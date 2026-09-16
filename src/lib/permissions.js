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
  { key: "tool.products", label: { ar: "رفع المنتجات إلى قيود", en: "Product Upload to Qoyod" } },
  { key: "tool.customers", label: { ar: "استيراد العملاء", en: "Customer Import" } },
  { key: "tool.vendors", label: { ar: "استيراد الموردين", en: "Vendor Import" } },
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

/**
 * [إضافة] صلاحيات إدارية دقيقة — منفصلة تمامًا عن دور "مدير مستخدمين كامل"
 * (الذي يملك كل شيء: تعديل/حذف/تعطيل/صلاحيات الآخرين + الإحصائيات + سجل
 * التدقيق). طلب صريح من المستخدم: مستخدم عادي (role='user') يُمنَح هذه
 * الصلاحية وحدها يقدر يضيف مستخدمًا جديدًا فقط — بلا أي وصول لأي شيء آخر
 * بلوحة الإدارة (لا قائمة المستخدمين، لا تعديل صلاحياتهم، لا الإحصائيات).
 */
export const MANAGEMENT_PERMISSIONS = [
  { key: "manage.add_users", label: { ar: "إضافة مستخدم جديد فقط (بلا أي صلاحية إدارة أخرى)", en: "Add new users only (no other management access)" } },
];

export const ALL_PERMISSION_KEYS = [...TOOL_PERMISSIONS, ...CHAT_PERMISSIONS, ...MANAGEMENT_PERMISSIONS].map((p) => p.key);

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
 * [إضافة] هل يقدر هذا المستخدم يضيف مستخدمًا جديدًا؟ إمّا عبر الدور الكامل
 * (owner/full_user_manager — يملك كل صلاحيات الإدارة أصلاً)، أو عبر الصلاحية
 * الدقيقة manage.add_users وحدها (مستخدم عادي بلا أي صلاحية إدارة أخرى).
 * ملاحظة: أوسع من canManageUsers عمدًا — استخدمها فقط لبوابة "إضافة مستخدم"
 * تحديدًا، لا لأي إجراء إداري آخر (تعديل/حذف/تعطيل/صلاحيات/إحصائيات تبقى
 * حصرًا لـcanManageUsers).
 */
export function canAddUsers(user) {
  return canManageUsers(user) || can(user, "manage.add_users");
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
    // [إضافة] manage.add_users حالة خاصة: full_user_manager يملك صلاحية إدارة
    // المستخدمين كاملة أصلاً (canManageUsers)، وهذا يشمل ضمنيًا هذه الصلاحية
    // الأضيق — بخلاف can() العام الذي يفحص فقط الخريطة المسطَّحة permissions،
    // فيعتبره بلا هذه الصلاحية تحديدًا (لم تُضَف لصلاحياته الفردية أصلاً) ويمنع
    // منحها لغيره خطأً رغم أنه يملك ما هو أوسع منها بكثير.
    const granterHasIt = key === "manage.add_users" ? canAddUsers(actingUser) : can(actingUser, key);
    if (value && !granterHasIt) continue; // لا يملكها هو، فلا يمنحها
    clamped[key] = value;
  }
  return clamped;
}

/** تُستخدم لعرض/إخفاء أعمدة أدوات NAV_ITEMS في App.jsx */
export function visibleTools(user) {
  return TOOL_PERMISSIONS.filter((t) => can(user, t.key)).map((t) => t.key);
}

const ADD_USER_GRANTABLE_KEYS = new Set([...TOOL_PERMISSIONS, ...CHAT_PERMISSIONS].map((p) => p.key));

/**
 * [إضافة] طلب صريح من المستخدم: من يملك manage.add_users فقط (لا صلاحية
 * إدارة مستخدمين كاملة) يقدر يمنح المستخدم الجديد الذي ينشئه أي صلاحية أداة
 * محاسبية أو شات (TOOL_PERMISSIONS/CHAT_PERMISSIONS) — بصرف النظر عمّا يملكه
 * هو نفسه؛ قيد "لا تمنح ما لا تملك" الخاص بـclampGrantablePermissions لا
 * ينطبق هنا عمدًا (هذا الشخص غالبًا بلا أي صلاحية أداة/شات شخصية أصلًا، ودوره
 * فقط تجهيز حسابات موظفين جدد). لكن أي مفتاح إداري (MANAGEMENT_PERMISSIONS —
 * أهمها manage.add_users نفسها) أو أي مفتاح غير معروف كليًا يُستبعَد دومًا
 * بصرف النظر عمّا طُلب — يمنع تصعيد امتيازات خطير (إنشاء مستخدم يقدر بدوره
 * يضيف مستخدمين آخرين أو يحصل على أي صلاحية إدارية). تُستخدَم حصرًا بمسار
 * createUser عندما يكون المُنشئ ليس full_user_manager/owner — راجع auth.jsx.
 */
export function clampPermissionsForAddUsersOnly(requestedPermissions) {
  const clamped = {};
  for (const [key, value] of Object.entries(requestedPermissions || {})) {
    if (!ADD_USER_GRANTABLE_KEYS.has(key)) continue; // يستبعد MANAGEMENT_PERMISSIONS وأي مفتاح غير معروف
    clamped[key] = value;
  }
  return clamped;
}
