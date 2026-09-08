// أدوات تشفير مشتركة لنظام كلمات المرور الفردية (تسجيل دخول / تعيين أول مرة /
// إعادة تعيين / تغيير ذاتي) — تعمل على بيئة Cloudflare Workers (Web Crypto API
// المدعومة أصلًا فيها) وأيضًا على Node 19+ (نفس الواجهة عالميًا)، لذا يمكن
// اختبارها مباشرة بـ vitest بلا أي محاكاة (mock).
//
// معاملات PBKDF2 مطابقة حرفيًا لما هو مستخدم أصلًا لكلمة مرور المالك في
// src/auth.jsx (hashPassword/generateSalt) — نفس القوة، نفس الخوارزمية، حتى
// يبقى النظامان متسقين أمنيًا. الفرق الجوهري: هذه النسخة تعمل على السيرفر فقط
// (داخل Cloudflare Pages Functions) — الهاش والملح لا يُحسبان ولا يُقارَنان في
// المتصفح إطلاقًا لكلمات مرور المستخدمين العاديين، خلافًا لثغرة كلمة مرور
// المالك الحالية (مُسجَّلة، لم تُعالَج بعد ضمن هذا التحديث).

// [تحديث 2026-09-07] Cloudflare Workers (بيئة تشغيل هذا الملف فعليًا) تفرض حدًا
// أقصى صارمًا 100,000 تكرار على PBKDF2 عبر Web Crypto — أي رقم أعلى يفشل وقت
// التشغيل الفعلي (رسالة الخطأ: "iteration counts above 100000 are not
// supported"). هذا الحد غير موجود بمتصفحات العادية ولا بـ Node، لذا لم تكتشفه
// اختبارات vitest المحلية إطلاقًا — وصل الاكتشاف فقط بعد نشر حقيقي وتجربة فعلية
// على فرع test. القيمة هنا مقصورة على 100,000 (الحد الأقصى المسموح فعليًا)، وهي
// منفصلة تمامًا عن قيمة التكرار المستخدمة بكلمة مرور المالك (src/auth.jsx، تعمل
// بالمتصفح فقط ولا تخضع لحد Workers هذا) — لا داعي لتغييرها هي.
const PBKDF2_ITERATIONS = 100000;

export function generateSalt(length = 16) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password, saltHex) {
  const bytes = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBytes = new Uint8Array(saltHex.match(/.{2}/g).map((part) => parseInt(part, 16)));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, bytes, 256);
  return Array.from(new Uint8Array(bits), (value) => value.toString(16).padStart(2, "0")).join("");
}

// رمز إعادة التعيين: 32 بايت (256 بت) عشوائية — عشوائيته العالية هي ما يجعل
// تخزين هاشه البسيط (SHA-256، بلا تمليح ولا PBKDF2) كافيًا وآمنًا، خلافًا لكلمة
// المرور نفسها (منخفضة الإنتروبيا نسبيًا، تحتاج PBKDF2 لمقاومة القاموس/القوة الغاشمة).
export function generateToken(length = 32) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// قاعدة كلمة المرور الجديدة: 8 رموز على الأقل، بلا أي شرط تنويع (حرف/رقم/رمز) —
// حسب طلب صريح. دالة نقية مُصدَّرة لتُختبر مباشرة ولتُستخدم من الواجهة أيضًا
// (رسالة الخطأ الفورية قبل إرسال أي طلب للسيرفر).
export function isValidNewPassword(pw) {
  return typeof pw === "string" && pw.length >= 8;
}
