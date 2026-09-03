// Calls the Anthropic API through our own Cloudflare Pages Function proxy
// (functions/api/claude-proxy.js) instead of api.anthropic.com directly — the API
// key lives only on the server (Cloudflare env var), never in this bundle.
// [تاريخياً] كانت هذه الدالة تستدعي مسار Netlify (/.netlify/functions/claude-proxy)،
// لكن نشر الموقع الفعلي الحالي هو Cloudflare Pages الذي لا يُشغّل دوال Netlify
// إطلاقاً — تم نقل الوسيط لصيغة Cloudflare Pages Functions (انظر functions/api/claude-proxy.js).
export async function callClaude(messagesPayload) {
  const response = await fetch("/api/claude-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messagesPayload),
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    // لو رجع مسار /api/claude-proxy نفس صفحة index.html (بدل JSON فعلي) فهذا يعني
    // أن Cloudflare Pages لم يكتشف مجلد functions/ إطلاقاً بهذا النشر - عادة لأن
    // مجلد الدوال غير مفعّل بإعدادات المشروع، أو المفتاح غير مضبوط كمتغير بيئة.
    throw new Error(
      "الميزة الذكية غير متاحة على هذا النشر. تأكد من أن مجلد functions/api/claude-proxy.js موجود بالمستودع وأن Cloudflare Pages يكتشف Pages Functions لهذا المشروع، وأن متغير البيئة ANTHROPIC_API_KEY مضبوط من Settings > Environment variables في لوحة Cloudflare Pages، ثم أعد النشر."
    );
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || "تعذر الاتصال بخدمة الذكاء الاصطناعي");
  }
  return data;
}

export function extractText(data) {
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export function parseJsonResponse(data) {
  const text = extractText(data);
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

export function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
