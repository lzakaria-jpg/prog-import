// تسجيل الدخول لأي مستخدم غير المالك — يتحقق من كلمة المرور على السيرفر حصرًا
// (الهاش والملح لا يصلان للمتصفح إطلاقًا)، ويطبّق قفلًا مؤقتًا بعد محاولات
// فاشلة متكررة. مسار المالك (كلمة مرور مشتركة عبر app_settings) غير متأثر
// بهذا الملف إطلاقًا — يبقى كما هو بـsrc/auth.jsx.
import { corsHeaders } from "../../shared-server/cors.js";
import { hashPassword } from "../../shared-server/authCrypto.js";
import {
  getUserRow, getCredentials, upsertCredentials, insertAuditLog,
  insertUserActivity, countUserLogins, getOwnerEmail,
} from "../../shared-server/supabaseAdmin.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatRiyadhTime(date) {
  try {
    return date.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
  } catch (e) {
    return date.toISOString();
  }
}

// [إضافة] طلب صريح من المستخدم (المالك): إشعار بريدي له عند كل تسجيل دخول ناجح
// لأي مستخدم آخر — يوضح الإيميل ووقت الدخول وعدد مرات دخوله الإجمالي. يُسجَّل
// النشاط هنا بالسيرفر (بدل الاعتماد فقط على trackLogin بالمتصفح بـsrc/auth.jsx —
// أُزيل استدعاؤها لمسار غير المالك تحديدًا لمنع ازدواج العدّ بجدول user_activity
// نفسه)، فالعدّ هنا يطابق ما تعرضه لوحة "إدارة المستخدمين" حرفيًا. لا تأثير على
// نتيجة تسجيل الدخول نفسها مهما حصل هنا (كل شيء داخل try/catch صامت) — نفس فلسفة
// insertAuditLog: التتبّع/الإشعار لا يُفشل ولا يُبطئ العملية الأساسية بأي خطأ.
// بلا RESEND_API_KEY/RESEND_FROM مُعدَّين، أو بلا مالك موجود بجدول users بعد، يُتخطى
// إرسال البريد بصمت (نفس سلوك send-mention-email.js) — تسجيل النشاط بالجدول يبقى دومًا.
async function notifyOwnerOfLogin(env, email) {
  await insertUserActivity(env, email, "login");
  const [count, ownerEmail] = await Promise.all([countUserLogins(env, email), getOwnerEmail(env)]);

  const apiKey = env && env.RESEND_API_KEY;
  const from = env && env.RESEND_FROM;
  if (!ownerEmail || ownerEmail.toLowerCase() === email.toLowerCase() || !apiKey || !from) return;

  const when = formatRiyadhTime(new Date());
  const html = `
    <div style="font-family: Tahoma, Arial, sans-serif; direction: rtl; text-align: right;">
      <p>تسجيل دخول جديد إلى أدوات قيود المحاسبية:</p>
      <ul>
        <li><strong>المستخدم:</strong> ${escapeHtml(email)}</li>
        <li><strong>الوقت:</strong> ${escapeHtml(when)}</li>
        <li><strong>عدد مرات الدخول الإجمالي:</strong> ${count}</li>
      </ul>
    </div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [ownerEmail], subject: `تسجيل دخول: ${email}`, html }),
  });
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
  const CORS_HEADERS = { ...corsHeaders(context.request), "Content-Type": "application/json" };
  let payload;
  try {
    payload = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: "invalid_request" }), { status: 400, headers: CORS_HEADERS });
  }

  const email = String(payload?.email || "").trim().toLowerCase();
  const password = String(payload?.password || "");
  if (!email || !password) {
    return new Response(JSON.stringify({ ok: false, reason: "invalid" }), { status: 400, headers: CORS_HEADERS });
  }

  try {
    const user = await getUserRow(context.env, email);
    // مسار المالك له آلية منفصلة تمامًا (app_settings) — لا يُستخدم هذا المسار له إطلاقًا
    if (!user || user.role === "owner") {
      return new Response(JSON.stringify({ ok: false, reason: "invalid" }), { status: 200, headers: CORS_HEADERS });
    }
    if (user.active === false) {
      return new Response(JSON.stringify({ ok: false, reason: "deactivated" }), { status: 200, headers: CORS_HEADERS });
    }

    const creds = await getCredentials(context.env, email);
    if (!creds || !creds.password_hash) {
      // ما عيّن كلمة مرور بعد — الواجهة تحوّله تلقائيًا لشاشة "عيّن كلمة مرورك"
      return new Response(JSON.stringify({ ok: false, reason: "no_password_set" }), { status: 200, headers: CORS_HEADERS });
    }

    if (creds.locked_until && new Date(creds.locked_until).getTime() > Date.now()) {
      return new Response(JSON.stringify({ ok: false, reason: "locked", lockedUntil: creds.locked_until }), { status: 200, headers: CORS_HEADERS });
    }

    const calculated = await hashPassword(password, creds.password_salt);
    if (calculated === creds.password_hash) {
      await upsertCredentials(context.env, email, { failed_login_attempts: 0, locked_until: null });
      try { await notifyOwnerOfLogin(context.env, email); } catch (e) { /* لا يُفشل تسجيل الدخول أبدًا */ }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS_HEADERS });
    }

    const attempts = (creds.failed_login_attempts || 0) + 1;
    const patch = { failed_login_attempts: attempts };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
    }
    await upsertCredentials(context.env, email, patch);
    if (patch.locked_until) {
      await insertAuditLog(context.env, email, "login_locked", email, { attempts });
      return new Response(JSON.stringify({ ok: false, reason: "locked", lockedUntil: patch.locked_until }), { status: 200, headers: CORS_HEADERS });
    }
    return new Response(JSON.stringify({ ok: false, reason: "invalid" }), { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, reason: "server_error", message: err.message }), { status: 500, headers: CORS_HEADERS });
  }
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return onRequestOptions(context);
  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: { ...corsHeaders(context.request), "Content-Type": "application/json" },
  });
}
