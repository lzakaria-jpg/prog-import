// طلب إعادة تعيين كلمة المرور — يرسل رابطًا صالحًا 30 دقيقة على الإيميل
// المسجَّل عبر Resend (نفس الحساب المستخدم أصلًا لإشعارات المنشن بالشات،
// RESEND_API_KEY/RESEND_FROM). يرجّع نفس الرسالة العامة دائمًا بصرف النظر عن
// كون الإيميل مسجَّلًا أو لا — يمنع اكتشاف أي إيميلات مسجَّلة بالنظام بالتجربة.
import { corsHeaders } from "../../shared-server/cors.js";
import { generateToken, hashToken } from "../../shared-server/authCrypto.js";
import { getUserRow, getCredentials, upsertCredentials } from "../../shared-server/supabaseAdmin.js";

const TOKEN_VALID_MINUTES = 30;
const RESEND_COOLDOWN_SECONDS = 60; // لا يُعاد إرسال بريد جديد لنفس الإيميل قبل مرور هذي المدة

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const GENERIC_RESPONSE = { ok: true, msg: "إن كان هذا الإيميل مسجَّلًا لدينا، وصلته رسالة تحتوي رابط إعادة التعيين" };

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
  if (!email) {
    return new Response(JSON.stringify(GENERIC_RESPONSE), { status: 200, headers: CORS_HEADERS });
  }

  // أي خطأ من هنا فصاعدًا لا يُسرَّب للمستخدم — نرجّع الرسالة العامة دومًا،
  // ونكتفي بتسجيل الخطأ الفعلي بالسجلات (لا نملك وصولًا لها هنا، فقط لا نفشل الاستجابة)
  try {
    const env = context.env;
    const apiKey = env && env.RESEND_API_KEY;
    const from = env && env.RESEND_FROM;
    const user = await getUserRow(env, email);
    if (user && user.role !== "owner" && user.active !== false && apiKey && from) {
      const creds = await getCredentials(env, email);
      const now = Date.now();
      const lastReq = creds?.reset_last_requested_at ? new Date(creds.reset_last_requested_at).getTime() : 0;
      if (now - lastReq >= RESEND_COOLDOWN_SECONDS * 1000) {
        const token = generateToken();
        const tokenHash = await hashToken(token);
        const expiresAt = new Date(now + TOKEN_VALID_MINUTES * 60 * 1000).toISOString();
        await upsertCredentials(env, email, {
          reset_token_hash: tokenHash, reset_token_expires_at: expiresAt, reset_last_requested_at: new Date(now).toISOString(),
        });

        const origin = context.request.headers.get("Origin") || "https://iqoyod.pages.dev";
        const resetLink = `${origin}/?reset=${token}`;
        const html = `
          <div style="font-family: Tahoma, Arial, sans-serif; direction: rtl; text-align: right;">
            <p>وصلنا طلب إعادة تعيين كلمة المرور لحسابك في أدوات قيود المحاسبية.</p>
            <p><a href="${escapeHtml(resetLink)}" style="background:#12B886;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;">تعيين كلمة مرور جديدة</a></p>
            <p style="color:#888; font-size:12px;">هذا الرابط صالح لمدة ${TOKEN_VALID_MINUTES} دقيقة فقط، ويعمل مرة واحدة. إن لم تطلب هذا، تجاهل الرسالة.</p>
          </div>`;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ from, to: [email], subject: "إعادة تعيين كلمة المرور — أدوات قيود المحاسبية", html }),
        });
      }
    }
  } catch (err) {
    // نتعمّد عدم تسريب أي تفاصيل خطأ هنا — الاستجابة تبقى عامة دائمًا
  }

  return new Response(JSON.stringify(GENERIC_RESPONSE), { status: 200, headers: CORS_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return onRequestOptions(context);
  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: { ...corsHeaders(context.request), "Content-Type": "application/json" },
  });
}
