// [2026-11-02] إرسال رمز دخول (6 أرقام) لإيميل ‎@qoyod.com — بلا قاعدة بيانات.
// يرجّع للمتصفح "تحدّياً" موقَّعاً لا يحوي الرمز؛ المستخدم ينسخ الرمز من إيميله.
// يحتاج على Cloudflare Pages (Settings > Variables and Secrets):
//   AUTH_SECRET    — نص عشوائي طويل (32 حرف فأكثر) لتوقيع الرموز والجلسات
//   RESEND_API_KEY — مفتاح Resend
//   RESEND_FROM    — مُرسِل من دومين موثَّق بـResend، مثال: "Qoyod Tools <login@qoyod.com>"
import { corsHeaders } from "../../shared-server/cors.js";
import { isQoyodEmail, normalizeEmail, generateCode, createCodeChallenge, CODE_TTL_MS } from "../../shared-server/emailAuth.js";

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const H = { ...corsHeaders(request), "Content-Type": "application/json" };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: H });

  let body;
  try { body = await request.json(); } catch { return reply(400, { ok: false, reason: "bad_request" }); }
  const email = normalizeEmail(body && body.email);
  if (!isQoyodEmail(email)) return reply(400, { ok: false, reason: "not_qoyod" });

  const secret = env && env.AUTH_SECRET;
  const apiKey = env && env.RESEND_API_KEY;
  const from = env && env.RESEND_FROM;
  if (!secret || !apiKey || !from) return reply(500, { ok: false, reason: "not_configured" });

  const code = generateCode();
  const challenge = await createCodeChallenge(email, code, secret);
  const minutes = Math.round(CODE_TTL_MS / 60000);

  const html = `
    <div style="font-family: Tahoma, Arial, sans-serif; direction: rtl; text-align: right;">
      <p>رمز الدخول لأدوات قيود (<span dir="ltr">${email}</span>):</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#162560;direction:ltr;text-align:right">${code}</p>
      <p style="color:#888;font-size:12px">الرمز صالح ${minutes} دقائق. إذا ما طلبت الدخول تجاهل هذي الرسالة.</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject: `رمز الدخول لأدوات قيود: ${code}`, html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return reply(502, { ok: false, reason: "email_failed", detail: detail.slice(0, 300) });
    }
  } catch (e) {
    return reply(502, { ok: false, reason: "email_failed", detail: String(e && e.message || e).slice(0, 300) });
  }
  return reply(200, { ok: true, challenge });
}
