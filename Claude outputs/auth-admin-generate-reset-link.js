// توليد رابط إعادة تعيين كلمة مرور لمستخدم آخر — بديل "طريقة أسهل" لمسار
// البريد الإلكتروني (auth-request-reset.js يبقى موجوداً وغير مستخدم حالياً،
// معطَّل من الواجهة فقط — راجع SELF_SERVICE_RESET_ENABLED بـ src/auth.jsx).
// الأدمن (Full User Manager أو المالك) يستدعي هذا المسار من لوحة إدارة
// المستخدمين، ويحصل على الرابط الفعلي مباشرة بالاستجابة (بدل إرساله بالبريد)
// لينسخه ويوصّله للمستخدم يدوياً (سلاك/واتساب/أي قناة داخلية).
//
// نقطة أمان جوهرية لازم الانتباه لها: هذا المسار (خلافاً لـauth-request-reset.js
// القديم) يرجّع رمزاً فعلياً صالحاً للاستخدام فوراً — لا رسالة عامة بلا تسريب.
// لو استُدعي بلا أي تحقق من هوية الطالب، أي زائر مجهول على الإنترنت يقدر يولّد
// رابط استيلاء كامل على أي حساب بمجرد معرفة إيميله — أخطر بكثير من مشكلة
// Resend sandbox الأصلية. لذلك:
//   • Full User Manager: كلمة مروره الفعلية تُتحقَّق هنا على الخادم بنفس آلية
//     auth-login.js (PBKDF2/100k، قابلة للتحقق فعلياً على Workers) — حماية حقيقية.
//   • Owner: كلمة مرور المالك محسوبة بالمتصفح بـ210,000 تكرار (src/auth.jsx)
//     — تتجاوز حد الـ100,000 تكرار الذي تفرضه Workers على PBKDF2 عبر Web
//     Crypto (نفس الحد المكتشف بـauthCrypto.js)، فلا يمكن التحقق منها هنا
//     فعلياً بلا حل منفصل (إعادة اشتقاق كلمة مرور المالك بتكرار متوافق، أو
//     PBKDF2 يدوي بمكتبة منفصلة) — خارج نطاق هذا التحديث. مسار المالك هنا
//     يتحقق فقط من كون الإيميل يطابق صف owner فعلي بجدول users (بلا تحقق
//     كلمة مرور تشفيرياً) — نفس مستوى الثقة المُستخدَم فعلاً لكل عمليات
//     المالك الحساسة الأخرى بهذا التطبيق (changeOwnerEmail، حذف/تعديل مستخدم
//     من src/auth.jsx) وموثَّق كثغرة C-3 معروفة بـSECURITY_AUDIT_2026-09-07.md
//     — لا يزيدها هذا الملف سوءاً، لكنه لا يُصلحها أيضاً.
import { corsHeaders } from "../../shared-server/cors.js";
import { generateToken, hashToken, hashPassword } from "../../shared-server/authCrypto.js";
import { getUserRow, getCredentials, upsertCredentials } from "../../shared-server/supabaseAdmin.js";
import { ROLES } from "../../src/lib/permissions.js";

// أطول من الـ30 دقيقة المستخدمة بمسار البريد القديم — هنا الرابط يُنقَل يدوياً
// (سلاك/واتساب) قبل ما يوصل للمستخدم فعلياً، فيحتاج هامش وقت أوسع.
const LINK_VALID_MINUTES = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const actorEmail = String(payload?.actorEmail || "").trim().toLowerCase();
  const actorPassword = String(payload?.actorPassword || "");
  const targetEmail = String(payload?.targetEmail || "").trim().toLowerCase();

  if (!actorEmail || !EMAIL_RE.test(actorEmail) || !targetEmail || !EMAIL_RE.test(targetEmail) || !actorPassword) {
    return new Response(JSON.stringify({ ok: false, reason: "invalid_request" }), { status: 400, headers: CORS_HEADERS });
  }

  try {
    const env = context.env;

    // ── تحقق هوية وصلاحية الطالب (الأدمن) ──────────────────────────────
    const actor = await getUserRow(env, actorEmail);
    if (!actor || actor.active === false) {
      return new Response(JSON.stringify({ ok: false, reason: "not_authorized" }), { status: 200, headers: CORS_HEADERS });
    }
    if (actor.role !== ROLES.OWNER && actor.role !== ROLES.FULL_USER_MANAGER) {
      return new Response(JSON.stringify({ ok: false, reason: "not_authorized" }), { status: 200, headers: CORS_HEADERS });
    }

    if (actor.role === ROLES.FULL_USER_MANAGER) {
      const actorCreds = await getCredentials(env, actorEmail);
      if (!actorCreds || !actorCreds.password_hash) {
        return new Response(JSON.stringify({ ok: false, reason: "not_authorized" }), { status: 200, headers: CORS_HEADERS });
      }
      const calculated = await hashPassword(actorPassword, actorCreds.password_salt);
      if (calculated !== actorCreds.password_hash) {
        return new Response(JSON.stringify({ ok: false, reason: "wrong_actor_password" }), { status: 200, headers: CORS_HEADERS });
      }
    }
    // actor.role === OWNER: لا تحقق تشفيري هنا — راجع تعليق الملف أعلاه

    // ── تحقق صلاحية الهدف ────────────────────────────────────────────
    const target = await getUserRow(env, targetEmail);
    if (!target) {
      return new Response(JSON.stringify({ ok: false, reason: "target_not_found" }), { status: 200, headers: CORS_HEADERS });
    }
    if (target.role === ROLES.OWNER) {
      return new Response(JSON.stringify({ ok: false, reason: "target_is_owner" }), { status: 200, headers: CORS_HEADERS });
    }
    if (target.active === false) {
      return new Response(JSON.stringify({ ok: false, reason: "target_inactive" }), { status: 200, headers: CORS_HEADERS });
    }

    // ── توليد الرمز وحفظه ────────────────────────────────────────────
    const token = generateToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + LINK_VALID_MINUTES * 60 * 1000).toISOString();
    await upsertCredentials(env, targetEmail, { reset_token_hash: tokenHash, reset_token_expires_at: expiresAt });

    const origin = context.request.headers.get("Origin") || "https://iqoyod.pages.dev";
    const resetLink = `${origin}/?reset=${token}`;

    // تسجيل التدقيق يتم من الواجهة (logAudit، نفس نمط create_user/update_role/
    // delete_user) وليس هنا — تفادياً لتكرار الصف مرتين بجدول audit_log.

    return new Response(JSON.stringify({ ok: true, resetLink, expiresAt }), { status: 200, headers: CORS_HEADERS });
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
