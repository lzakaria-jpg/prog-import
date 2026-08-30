// Sends the "you were mentioned" email for @mentions in chat, via Resend
// (https://resend.com — generous free tier, simplest transactional-email API).
//
// Requires two environment variables set in Netlify (Site settings ->
// Environment variables), same pattern as ANTHROPIC_API_KEY in claude-proxy.js:
//   RESEND_API_KEY   — your Resend API key
//   RESEND_FROM      — a verified sender address, e.g. "Qoyod Tools <notify@yourdomain.com>"
//
// Until both are set, this function responds 200 with `{ skipped: true }`
// instead of failing loudly — the in-app notification (chat.jsx's
// notifications table insert) is the reliable channel regardless; this is a
// best-effort addition on top of it, never a blocker.
exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ skipped: true, reason: "RESEND_API_KEY/RESEND_FROM not configured" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "طلب غير صالح" }) };
  }

  const { to, actor, preview, channelLabel } = payload;
  if (!to || !actor) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "to/actor مطلوبان" }) };
  }

  const subject = `${actor} أشار إليك في ${channelLabel || "الشات"}`;
  const html = `
    <div style="font-family: Tahoma, Arial, sans-serif; direction: rtl; text-align: right;">
      <p><strong>${escapeHtml(actor)}</strong> أشار إليك في <strong>${escapeHtml(channelLabel || "الشات")}</strong>:</p>
      <blockquote style="border-right: 3px solid #4A90D9; margin: 8px 0; padding: 8px 12px; background: #F1F5F9; color: #333;">
        ${escapeHtml(preview || "")}
      </blockquote>
      <p style="color:#888; font-size:12px;">فتح تطبيق أدوات قيود لقراءة الرسالة كاملة.</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    const data = await res.json();
    return { statusCode: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: "تعذر إرسال البريد: " + err.message }) };
  }
};

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
