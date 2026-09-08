// نفس منطق CORS المستخدم حرفيًا في functions/api/claude-proxy.js و
// functions/api/send-mention-email.js و functions/api/qoyod-proxy/[[path]].js —
// هنا كملف مشترك واحد لدوال المصادقة الجديدة فقط (auth-*.js) حصرًا، بلا أي
// تعديل على تلك الملفات الثلاثة القائمة (عزل تام، بلا أي أثر عليها).
export const ALLOWED_ORIGINS = [
  "https://iqoyod.pages.dev",
  "https://test.iqoyod.pages.dev",
  "http://localhost:5173",
];

export function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
