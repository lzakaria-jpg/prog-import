// وسيط إرسال بريد "تمت الإشارة إليك" عند منشن @ بالشات — بصيغة Cloudflare Pages
// Functions (ملف تحت functions/ يُخدَّم تلقائياً كمسار API؛ هذا الملف = /api/send-mention-email).
//
// [إصلاح 2026-09] كان هذا المسار موجوداً بصيغة Netlify فقط
// (netlify/functions/send-mention-email.js — لا تُلمَس، مُصمَّمة لنشر Netlify)،
// وsrc/chat.jsx يستدعي "/.netlify/functions/send-mention-email" الذي لا وجود له
// إطلاقاً على نشر Cloudflare Pages الحالي: فالطلب يسقط على index.html (أو 405)،
// والاستدعاء مُغلَّف بـ.catch(()=>{}) فيفشل بصمت تام — أي أن بريد الإشارة لم يكن
// يُرسَل أبداً منذ الانتقال لـCloudflare، بلا أي رسالة خطأ (الإشعار داخل التطبيق
// وحده هو ما كان يعمل). هذه النسخة تعيد تشغيل الميزة على النشر الفعلي.
//
// إعداد المفتاحين على Cloudflare Pages: لوحة Cloudflare > Pages > المشروع (iqoyod)
// > Settings > Variables and Secrets، أضِف:
//   RESEND_API_KEY — مفتاح Resend
//   RESEND_FROM    — مُرسِل موثَّق، مثال: "Qoyod Tools <notify@yourdomain.com>"
// وحتى تُضبَط الاثنان، تُعيد الدالة 200 مع { skipped: true } بدل الفشل — الإشعار
// داخل التطبيق يبقى القناة الموثوقة دائماً، وهذا إضافة أفضل-جهد فوقه لا شرط له.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = { ...CORS_HEADERS, "Content-Type": "application/json" };

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const apiKey = context.env && context.env.RESEND_API_KEY;
  const from = context.env && context.env.RESEND_FROM;
  if (!apiKey || !from) {
    return new Response(JSON.stringify({ skipped: true, reason: "RESEND_API_KEY/RESEND_FROM not configured" }), { status: 200, headers: JSON_HEADERS });
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "طلب غير صالح" }), { status: 400, headers: JSON_HEADERS });
  }

  const { to, actor, preview, channelLabel } = payload || {};
  if (!to || !actor) {
    return new Response(JSON.stringify({ error: "to/actor مطلوبان" }), { status: 400, headers: JSON_HEADERS });
  }

  const subject = `${actor} أشار إليك في ${channelLabel || "الشات"}`;
  const html = `
    <div style="font-family: Tahoma, Arial, sans-serif; direction: rtl; text-align: right;">
      <p><strong>${escapeHtml(actor)}</strong> أشار إليك في <strong>${escapeHtml(channelLabel || "الشات")}</strong>:</p>
      <blockquote style="border-right: 3px solid #4A90D9; margin: 8px 0; padding: 8px 12px; background: #F1F5F9; color: #333;">
        ${escapeHtml(preview || "")}
      </blockquote>
      <p style="color:#888; font-size:12px;">افتح تطبيق أدوات قيود لقراءة الرسالة كاملة.</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    const data = await res.text();
    return new Response(data, { status: res.status, headers: JSON_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: "تعذر إرسال البريد: " + err.message }), { status: 502, headers: JSON_HEADERS });
  }
}

// أي طريقة غير POST/OPTIONS
export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: JSON_HEADERS });
}
