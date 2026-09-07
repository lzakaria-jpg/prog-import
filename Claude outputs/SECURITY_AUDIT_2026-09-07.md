# تقرير فحص أمني شامل — مشروع أدوات قيود (prog-import-master)

تاريخ الفحص: 2026-09-07
نطاق الفحص: كامل المستودع (الواجهة React، دوال الخادم بـCloudflare/Netlify، تطبيق Electron، الاعتماديات)
المنهجية: مراجعة كود يدوية كاملة (Static Review) لكل ملفات `src/`، `functions/`، `netlify/`، `electron/`، ملفات الإعداد، وتشغيل `npm audit` على الاعتماديات. لا يوجد بالمستودع أي وصول مباشر لقاعدة بيانات Supabase الفعلية (RLS policies) — أي ملاحظة تعتمد عليها مذكورة صراحة كـ"يتطلب تحقق يدوي".

---

## ملخص تنفيذي

| الخطورة | العدد |
|---|---|
| حرج (Critical) | 3 |
| عالٍ (High) | 3 |
| متوسط (Medium) | 3 |
| منخفض (Low) | 2 |

أهم ٣ نقاط تستحق أولوية فورية:

1. دوال الوكيل (`claude-proxy`, `send-mention-email`) مكشوفة للعامة بلا أي تحقق هوية — أي شخص بالإنترنت يقدر يستهلك رصيد Anthropic/Resend الخاص بقيود.
2. كلمة مرور المدير الافتراضية (هاش + ملح) مكتوبة بكود الواجهة نفسه، وتُستخدم كـ"باب خلفي" fallback حتى لو Supabase شغّال ولحقت أي خطأ عابر.
3. كل صلاحيات RBAC (owner/full_user_manager/user) منطقها بالكامل بالمتصفح، وخط الدفاع الحقيقي الوحيد هو RLS بقاعدة Supabase — وغير موجود بالمستودع ما يثبت تفعيله ومطابقته.

---

## 1) الثغرات المكتشفة (مرتّبة حسب الخطورة)

### 🔴 حرج (Critical)

#### C-1 — دالة وكيل Anthropic مكشوفة بلا مصادقة (Denial-of-Wallet / إساءة استخدام مفتوح)

**الملفات:**
`functions/api/claude-proxy.js` (كامل الملف، الأساسي بالنشر الفعلي على Cloudflare)
`netlify/functions/claude-proxy.js` (نسخة قديمة غير مُستخدَمة بالنشر الحالي حسب تعليقات الكود، لكنها موجودة بالمستودع)

**التفصيل:**
`onRequestPost` بسطر 24 يتحقق فقط من وجود `ANTHROPIC_API_KEY` على الخادم (سطر 25-31)، ولا يتحقق إطلاقًا من هوية المستخدم المُرسِل للطلب. `CORS_HEADERS` بسطر 14-18 يسمح بـ`Access-Control-Allow-Origin: "*"`.

النتيجة: أي شخص بالإنترنت يعرف رابط `https://<دومين النشر>/api/claude-proxy` (رابط عام غير سري) يقدر يرسل POST مباشرة بأي `payload` يريده لواجهة Claude، ويُصرف من رصيد مفتاح Anthropic الخاص بقيود بلا أي حد أو تتبع لهوية المُستهلك — لا rate limiting، لا session check، لا حتى تحقق Referer/Origin بسيط.

**سيناريو الاستغلال:** سكربت بسيط يستدعي هذا الرابط آلاف المرات في الدقيقة = استنزاف مالي مباشر لحساب Anthropic (Denial-of-Wallet)، أو استخدام الرابط كبروكسي مجاني لخدمة Claude من طرف ثالث بالكامل دون علم قيود.

**الإصلاح المقترح:**

```js
// functions/api/claude-proxy.js
export async function onRequestPost(context) {
  const apiKey = context.env && context.env.ANTHROPIC_API_KEY;
  if (!apiKey) { /* كما هو */ }

  // [إضافة] تحقق هوية المستخدم قبل أي اتصال بـAnthropic
  const sessionToken = context.request.headers.get("X-App-Session");
  const isValid = await verifyAppSession(sessionToken, context.env); // تحقق ضد Supabase أو JWT موقّع
  if (!isValid) {
    return new Response(JSON.stringify({ error: "غير مصرح" }), {
      status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  // ... باقي الكود كما هو
}
```

كحد أدنى فوري (بدون بناء نظام جلسات كامل): فعّل Cloudflare Rate Limiting على المسار `/api/claude-proxy` من لوحة تحكم Cloudflare (Security > WAF > Rate limiting rules)، وقيّد `Access-Control-Allow-Origin` لدومين التطبيق فقط بدل `*`. هذا لا يمنع الاستغلال المباشر (curl لا يهتم بـCORS) لكنه يمنع الاستغلال من متصفحات طرف ثالث ويقلل الأثر.

---

#### C-2 — كلمة مرور/هاش المدير الافتراضي مكشوفة بكود الواجهة، وتُستخدم كباب خلفي عند أي خطأ

**الملف:** `src/auth.jsx` سطر 13-14 و49-70

```js
const DEFAULT_ADMIN_SALT = "1d8ad81d942f86fac5b7b368ee149314";
const DEFAULT_ADMIN_HASH = "41b8952f2790c6419afdd5e6d7e9d5666fd2d4bc001d1d5ab58b44d0b709fb52"; // 2244470599
```

**التفصيل:**
هذا كود React يُحزَم ويُشحَن كاملًا لكل زائر بالمتصفح (`dist/assets/index-*.js`) — أي شخص يفتح Dev Tools أو يقرأ الحزمة المنشورة يرى هذا الهاش والملح مباشرة. الأخطر: التعليق المجاور للهاش (`// 2244470599`) يبدو أنه القيمة الأصلية التي أُنشئ منها الهاش — أي أن كلمة مرور المدير الفعلية (أو ما كانت عليه) موثّقة كتعليق بجانب الهاش نفسه بكود مصدري يُشحَن للمتصفح. لم أقم بمحاولة فك/التحقق من هذا الهاش (خارج نطاق الفحص الآمن)، لكن مجرّد وجود القيمة الافتراضية بالكود يكفي وحده ليكون ثغرة حرجة، بصرف النظر عمّا إذا كان التعليق يطابقها فعليًا أم لا.

الأخطر من ذلك: دالة `verifyAdminPassword` (سطر 49-71) تستخدم هذا الهاش/الملح الافتراضي **كـfallback** في حالتين:
1. لو Supabase غير معدّ إطلاقًا (متوقع ومقبول كسلوك أولي).
2. **لو حصل أي استثناء بالـ`try` أثناء التحقق الطبيعي** (سطر 66-69) — حتى لو Supabase شغّال 100% وكلمة المرور الحقيقية مضبوطة بقاعدة البيانات، أي خطأ عابر بالشبكة أثناء طلب `app_settings` يُسقِط النظام تلقائيًا للتحقق ضد الهاش الافتراضي الثابت بالكود.

**سيناريو الاستغلال:** مهاجم يعرف كلمة المرور المقابلة لهذا الهاش (سواءً من التعليق أو بكسر PBKDF2 offline بما أن الهاش والملح معلنان) يقدر يدخل كمدير كامل الصلاحيات على أي نسخة من هذا التطبيق — إما مباشرة (لو Supabase لم يُهيَّأ بعد بمنشأة جديدة)، أو بإجبار خطأ شبكي مؤقت (مثلاً بقطع الاتصال لحظيًا أو استغلال أي بطء بالشبكة) لإسقاط النظام على الفولباك الثابت.

**الإصلاح المقترح:**

```js
// احذف DEFAULT_ADMIN_SALT/DEFAULT_ADMIN_HASH نهائيًا. لا فولباك ثابت إطلاقًا.
async function verifyAdminPassword(password) {
  if (!password || !isConfiguredGlobally()) return false;
  try {
    const { data: hashData } = await supabase.from("app_settings").select("value").eq("key", "admin_password_hash").maybeSingle();
    const { data: saltData } = await supabase.from("app_settings").select("value").eq("key", "admin_password_salt").maybeSingle();
    if (!hashData?.value || !saltData?.value) return false; // لا يوجد مدير معدّ بعد = رفض، لا فولباك
    const calculated = await hashPassword(password, saltData.value);
    return calculated === hashData.value;
  } catch (err) {
    console.error("Error verifying admin password:", err);
    return false; // فشل الاتصال = رفض الدخول، لا سقوط لقيمة ثابتة
  }
}
```

وبشكل أعمق (موصى به بقوة): انقل تحقق كلمة مرور المدير بالكامل للخادم (Cloudflare Function جديدة `/api/verify-admin`) بدل تنفيذه بجافاسكربت بالمتصفح — أي منطق تحقق يعمل بالكامل بالمتصفح قابل للتجاوز الكلي (نداء `verifyAdminPassword` مباشرة من console، أو التلاعب بـReact state عبر React DevTools لتعيين `currentUser` بدون المرور بالتحقق أصلًا).

---

#### C-3 — الاعتماد الكامل على تحقق صلاحيات من جهة العميل بلا تأكيد وجود RLS مطابق بقاعدة البيانات

**الملفات:** `src/auth.jsx` (كامل منطق RBAC، أسطر 340-444 خصوصًا) + `src/lib/permissions.js` (كامل الملف) + `src/supabase.js`

**التفصيل:**
`src/supabase.js` سطر 3-4 يحمل `SUPABASE_URL` و`SUPABASE_ANON_KEY` ثابتين بالكود — هذا **متوقّع وسليم** بتصميم Supabase (المفتاح "publishable" مخصص للعرض العام)، لكنه يعني أن **خط الدفاع الحقيقي الوحيد** ضد أي عبث بالبيانات هو Row Level Security (RLS) المفعّل على جداول `users`, `allowed_users`, `app_settings`, `audit_log` بقاعدة Supabase نفسها.

كل القواعد التالية منطقها الوحيد الموجود بالمستودع هو جافاسكربت بالمتصفح، وهو بطبيعته **قابل للتجاوز الكامل** من أي مستخدم يفتح console المتصفح ويستدعي `supabase.from(...)` مباشرة بنفس المفتاح العام:

- `canModifyUser` (`permissions.js` سطر 110-116): لا أحد يعدّل المالك، لا أحد يعدّل نفسه.
- `isOwner`/`can` (`permissions.js` سطر 89-103): المالك يملك كل شيء دائمًا.
- تعطيل `active === false` (`auth.jsx` سطر 144-160): خروج فوري لحساب معطَّل.
- `clampGrantablePermissions` (`permissions.js` سطر 122-130): منع full_user_manager من منح صلاحية لا يملكها.

تعليق `permissions.js` سطر 8-9 يذكر "trigger بقاعدة البيانات" لحماية المالك — لكن لا يوجد أي ملف SQL/migration بالمستودع يثبت وجوده فعليًا أو يوثّق باقي سياسات RLS المطلوبة لباقي الجداول.

**سيناريو الاستغلال (لو RLS غير مفعّل أو غير مطابق):** أي مستخدم عادي مسجّل دخول (حتى لو دوره `user` بصلاحيات محدودة) يفتح console المتصفح وينفّذ:
```js
await window.supabase.from("users").update({ role: "owner" }).eq("email", "attacker@example.com")
```
ويصبح مالكًا كامل الصلاحيات — بتجاوز كامل لكل الكود بـ`auth.jsx`، لأن الطلب يذهب مباشرة لـSupabase REST API بنفس المفتاح العام المستخدم أصلًا بالتطبيق.

**التوصية (يتطلب تحقق يدوي بلوحة Supabase وليس بالكود فقط):**
1. تأكد أن RLS **مفعّل** (`ENABLE ROW LEVEL SECURITY`) على الجداول الأربعة.
2. لكل جدول، أضف policies تطابق حرفيًا كل شرط بـ`permissions.js`، مثال لجدول `users`:

```sql
-- منع أي تحديث لصف الدور owner من أي أحد غير trigger النظام
CREATE POLICY "no_update_owner_role" ON users
  FOR UPDATE USING (role <> 'owner')
  WITH CHECK (role <> 'owner' OR auth.jwt() ->> 'role' = 'service_role');

-- منع full_user_manager من تعديل صف نفسه
CREATE POLICY "no_self_permission_edit" ON users
  FOR UPDATE USING (email <> auth.jwt() ->> 'email');
```
(هذا مثال توضيحي — يحتاج تفصيل حسب آلية الجلسات الفعلية المستخدمة، لأن هذا التطبيق لا يستخدم Supabase Auth القياسي بل نظام بريد أبيض مخصص، فـ`auth.jwt()` غير متاح مباشرة وسيحتاج تصميم مختلف، مثلًا عبر Postgres function موقّعة أو الانتقال لـSupabase Auth الفعلي).
3. الأهم عمليًا نظرًا لتعقيد نقطة (2) مع نظام الجلسات المخصص الحالي: **انقل كل عمليات RBAC الحساسة (إنشاء/تعديل/حذف مستخدم، تغيير دور) لدالة خادم (Cloudflare Function) تستخدم `service_role` key** بدل تنفيذها مباشرة من المتصفح بالـanon key، وتحقق بها من صلاحية الطالب بنفسك على الخادم قبل التنفيذ.

---

### 🟠 عالٍ (High)

#### H-1 — مفاتيح Qoyod API الخاصة بالعملاء تُخزَّن نصًا صريحًا غير مشفَّر بـlocalStorage

**الملف:** `src/product-upload/io/keyStorage.js` (كامل الملف)

```js
const STORAGE_KEY = "qoyod_keys";
export function getSavedKeys() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
export function saveKeysToStorage(keys) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}
```

**التفصيل:**
مفتاح API لكل عميل (يمنح صلاحية كاملة إنشاء/تعديل/حذف منتجات بمنشأته الحقيقية على قيود) يُخزَّن بـ`localStorage` بصيغة JSON نص صريح بلا أي تشفير. التعليق بأعلى الملف (سطر 6-8) يوثّق أن هذا قرار سابق مقصود ("راجع 05_Security_Audit.md ... القرار الحالي إبقاؤه كما هو بلا تعديل") — لكن بصفتي مراجع أمني مستقل، أعيد رفع هذه النقطة لأن الأثر حقيقي: أي ثغرة XSS مستقبلية بأي مكان بالتطبيق (أو امتداد متصفح خبيث مثبَّت بجهاز الموظف، أو وصول فعلي لجهاز مشترك) يكشف فورًا **كل** مفاتيح **كل** العملاء المحفوظة بهذا المتصفح دفعة واحدة.

**الإصلاح المقترح (تدرّجي):**

الحد الأدنى — تشفير بسيط بمفتاح مشتق من الجلسة:
```js
// keyStorage.js — تشفير بسيط عبر WebCrypto قبل التخزين
async function deriveKey(passphrase) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("qoyod-tools-key-store"), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}
export async function saveKeysToStorage(keys, sessionPassphrase) {
  const key = await deriveKey(sessionPassphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(keys));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) }));
}
```

الأفضل معماريًا: لا تخزّن مفتاح Qoyod بالمتصفح إطلاقًا — اربطه بحساب الموظف بالخادم (سرّ مرتبط بسجل العميل بقاعدة بيانات الخادم)، ومرّره فقط عبر `qoyod-proxy` بعد تحقق جلسة الموظف، بحيث لا يصل نص المفتاح للمتصفح إطلاقًا.

---

#### H-2 — وكيل Qoyod API مفتوح CORS بلا تحقق من مصدر الطلب (Open Relay)

**الملف:** `functions/api/qoyod-proxy/[[path]].js` سطر 21-25

```js
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, API-KEY",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};
```

**التفصيل:**
`Access-Control-Allow-Origin: "*"` يسمح لأي موقع بالإنترنت (لو زُوِّد المهاجم بمفتاح Qoyod API صالح من أي مصدر) يستخدم دومين قيود كـرِلاي مفتوح لأي مسار GET/POST/PUT/PATCH/DELETE على `api.qoyod.com/2.0/*`. هذا يخلق نقطتين:
1. يصعّب على Qoyod نفسها تتبّع مصدر إساءة استخدام محتملة (تظهر الطلبات قادمة من دومين قيود بدل المصدر الحقيقي).
2. يفتح الباب لاستخدام هذا الوكيل لتجاوز قيود CORS الأصلية بـQoyod من متصفح أي طرف ثالث (حتى لو المفتاح المستخدم مسروق من مكان آخر تمامًا، لا علاقة له بهذا التطبيق).

**الإصلاح المقترح:**
```js
const ALLOWED_ORIGIN = "https://iqoyod.pages.dev"; // أو دومينك المخصص الفعلي
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type, API-KEY",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Vary": "Origin",
};
```

---

#### H-3 — بريد "تمت الإشارة إليك" عبر Resend مكشوف بلا مصادقة (إساءة استخدام دومين موثَّق)

**الملفات:** `functions/api/send-mention-email.js` + `netlify/functions/send-mention-email.js`

**التفصيل:** نفس بنية C-1 (لا تحقق هوية، CORS مفتوح `*`) لكن التأثير هنا إرسال بريد إلكتروني باسم دومين قيود المُوثَّق بحساب Resend — يفتح الباب لاستخدام السيرفر كأداة إرسال سبام/تصيّد (spam/phishing relay) باسم قيود، ما يعرّض سمعة الدومين بمزوّدي البريد (deliverability reputation) للخطر، بالإضافة لاستهلاك رصيد Resend المدفوع.

**الإصلاح المقترح:** نفس توصية C-1 — تحقق جلسة صالحة قبل السماح بالإرسال، بالإضافة لتحديد rate limit صارم (مثلًا 5 طلبات/دقيقة لكل جلسة) لأن هذه ميزة ثانوية (إشعار) لا تحتاج معدل إرسال مرتفع أصلًا.

---

### 🟡 متوسط (Medium)

#### M-1 — إمكانية تنفيذ رابط `javascript:` عبر حقل `file_url` بالشات

**الملف:** `src/chat.jsx` سطر 997

```js
const handleDownload = (msg) => {
  if (msg.file_url) window.open(msg.file_url, "_blank");
};
```

**التفصيل:** لا تحقق من مخطط الرابط (scheme) قبل تمريره لـ`window.open`. بالمسار الطبيعي بالتطبيق `file_url` يأتي دائمًا من رفع فعلي لـSupabase Storage (آمن)، لكن لو تمكّن أي طرف من إدراج صف رسالة مباشرة بجدول الشات بقاعدة Supabase (سيناريو مرتبط بـC-3 أعلاه — لو RLS ضعيف بجدول الرسائل)، بقيمة `file_url` تبدأ بـ`javascript:...`، فسينفَّذ الكود بجلسة أي مستخدم يضغط على المرفق — تحول من ثغرة صلاحيات (C-3) لتنفيذ كود فعلي بمتصفح ضحية أخرى.

**الإصلاح المقترح:**
```js
const isSafeUrl = (url) => /^https:\/\//i.test(url || "");
const handleDownload = (msg) => {
  if (isSafeUrl(msg.file_url)) window.open(msg.file_url, "_blank", "noopener,noreferrer");
};
```

---

#### M-2 — حقن صيغ Excel/CSV عند تصدير بيانات قد تكون من ملف عميل غير موثوق

**الملفات:** `src/lib/excelExport.js` سطر 52-55، وبنفس النمط: `src/product-upload/io/openingBalanceExport.js`، مصدّرات `sales-invoice-import`/`bill-import`

**التفصيل:** قيم الخلايا (اسم جهة، تعليق، إلخ) تُكتب مباشرة عبر `cell.value = val` بلا أي تحييد لبادئات الصيغ (`=`, `+`, `-`, `@`). بما أن مصدر بعض هذه القيم قد يكون ملف Excel رفعه العميل نفسه (وليس فقط إدخال يدوي من الموظف)، فلو احتوى اسم جهة أو تعليق بملف العميل الأصلي على بادئة صيغة (سواء متعمَّدة أو عرضية)، ستُنسَخ حرفيًا للملف المُصدَّر النهائي. فتح هذا الملف لاحقًا بإكسل قديم أو مع تفعيل الروابط الخارجية قد يُشغّل صيغة/رابط غير مقصود.

**الإصلاح المقترح:**
```js
function sanitizeExcelCell(v) {
  if (typeof v === "string" && /^[=+\-@]/.test(v.trim())) return "'" + v; // apostrophe تمنع تفسيرها كصيغة
  return v;
}
// عند الكتابة:
cell.value = val === "" || val === null || val === undefined ? null : sanitizeExcelCell(val);
```

---

#### M-3 — تعليق يحتمل أنه يكشف كلمة مرور المدير الفعلية بجانب الهاش (تكرار/تفصيل إضافي لـC-2)

**الملف:** `src/auth.jsx` سطر 14

```js
const DEFAULT_ADMIN_HASH = "41b8952f2790c6419afdd5e6d7e9d5666fd2d4bc001d1d5ab58b44d0b709fb52"; // 2244470599
```

مذكورة هنا بشكل منفصل للتأكيد: بصرف النظر عن إصلاح C-2 بالكامل، **احذف أي تعليق قريب من قيمة سرّية بالكود** — حتى لو لم يكن هو كلمة المرور الفعلية، وجوده وحده يشجّع محاولات التخمين وقد يكون معلومة حساسة (رقم هاتف/معرّف) بحد ذاته.

---

### 🟢 منخفض (Low)

#### L-1 — نسخ Netlify القديمة من دوال الوكيل ما زالت بالمستودع رغم عدم استخدامها

**الملفات:** `netlify/functions/claude-proxy.js`، `netlify/functions/send-mention-email.js`، `netlify.toml`

التعليقات بأعلى نسخ Cloudflare توضّح صراحة أن نسخ Netlify "لا تُلمَس... مُصمَّمة لنشر Netlify" وغير مُستخدَمة بالنشر الفعلي الحالي. إبقاؤها بالمستودع يوسّع سطح المراجعة الأمنية بلا داعٍ (نفس ثغرات C-1/H-3 موجودة بها حرفيًا، ولو أُعيد تفعيل نشر Netlify بالخطأ يومًا ما ستُشحَن بنفس الثغرات دون تنبيه). التوصية: احذفها لو Netlify فعليًا غير مستخدَم، أو انقلها لمجلد `backups/` مثل باقي النسخ القديمة الموجودة بالمشروع.

#### L-2 — `.env*` غير مدرَج بـ`.gitignore` وقائيًا

**الملف:** `.gitignore`

لا توجد حاليًا أي ملفات `.env` بالمستودع (المفاتيح تُضبَط فعليًا عبر متغيرات بيئة Cloudflare Pages من اللوحة مباشرة — ممارسة سليمة)، لكن `.gitignore` الحالي لا يستثني `.env*` صراحة. إضافة وقائية بسيطة تمنع أي التزام مستقبلي عرضي لملف أسرار محلي أثناء التطوير:

```gitignore
# Environment secrets
.env
.env.local
.env.*.local
```

---

## 2) الاعتماديات (Dependencies) — نتائج `npm audit`

تشغيل `npm audit --omit=dev` أظهر **3 ثغرات** (2 متوسطة، 1 عالية):

| الحزمة | النسخة الحالية | الخطورة | الثغرة | إصلاح متاح؟ |
|---|---|---|---|---|
| `xlsx` | 0.18.5 (`package.json` سطر 27) | **عالٍ** | Prototype Pollution ([GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)) + ReDoS ([GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)) | ❌ لا يوجد إصلاح منشور على npm |
| `uuid` (تبعية `exceljs`) | 8.3.2 | متوسط | فحص حدود ذاكرة ناقص بـv3/v5/v6 ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)) | يتطلب ترقية `exceljs` لنسخة كبيرة (breaking change) |

**تفصيل مهم بخصوص `xlsx`:** هذه ثغرة معروفة جيدًا — فريق SheetJS توقف عن نشر نسخ npm جديدة لحزمة `xlsx` بعد 0.18.5 تحديدًا (نقلوا التوزيع لموقعهم الخاص https://cdn.sheetjs.com بدل npm)، فكل نسخة npm متاحة حاليًا لهذه الحزمة (بما فيها 0.18.5 المستخدَمة هنا) تحمل الثغرتين أعلاه بلا استثناء، و`npm audit fix` لن يحلّها لأن لا نسخة أحدث منشورة على npm إطلاقًا.

**التوصية:**
استبدل مصدر `xlsx` بالنسخة المُصحَّحة الرسمية من CDN الخاص بـSheetJS (0.20.x فأعلى) بدل سجل npm:
```bash
npm uninstall xlsx
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```
هذا التغيير لا يغيّر واجهة الاستخدام البرمجي (نفس `import * as XLSX from "xlsx"`)، فقط مصدر التثبيت.

بالنسبة لـ`uuid`/`exceljs`: قيّم لو التطبيق يستخدم فعليًا الأجزاء المتأثرة بثغرة `uuid` (v3/v5/v6 مع `buf` مُمرَّر يدويًا) — عادة `exceljs` يستخدم `uuid` داخليًا لتوليد معرّفات فقط، وهو استخدام منخفض الأثر عمليًا هنا، لكن للإصلاح الكامل استخدم حقل `overrides` بـ`package.json` لإجبار نسخة أحدث بلا الحاجة لترقية `exceljs` كسرية:
```json
{
  "overrides": {
    "uuid": "^11.1.1"
  }
}
```
ثم تحقق أن `npm test` و`npm run build` ما زالا يعملان بعد التحديث (توافق `exceljs` مع `uuid@11` غير مضمون 100% لأنه لم يُختبر رسميًا بواسطة `exceljs`، فهذا يحتاج فحص فعلي بعد التطبيق لا افتراض).

**بقية الاعتماديات الرئيسية** (`react@19.2.8`, `react-dom@19.2.8`, `@supabase/supabase-js@2.112.4`, `d3@7.9.0`, `electron@33.4.11`, `vite@5.4.21`, `pdfjs-dist@6.2.108`, `mammoth@1.12.1`, `jszip@3.10.1`, `lucide-react@1.31.0`): لا ثغرات معروفة ظهرت بـ`npm audit` بتاريخ الفحص. مع ذلك، `npm audit` يعتمد على قاعدة بيانات GitHub Advisory وقد لا تغطي كل الحزم — يُنصح بتكرار الفحص دوريًا (شهريًا مثلًا) وليس مرة واحدة فقط.

---

## 3) نقاط إيجابية لوحظت أثناء الفحص (تستحق الذكر)

- لا وجود لأي `dangerouslySetInnerHTML` فعّال بكامل `src/` — التعليق بـ`src/bill-import/components/Note.jsx` يوثّق أن ثغرة مشابهة سابقة أصلًا أُصلحت.
- تصدير XML بـ`src/sales-invoice-import/io/xmlExport.js` يستخدم `escapeXml()` صحيحًا على كل قيمة نصية قبل الكتابة (سطر 27) — يمنع حقن XML.
- تطبيق Electron (`electron/main.cjs`/`preload.cjs`) مضبوط بشكل سليم: `nodeIntegration: false`، `contextIsolation: true`، و`preload.cjs` يكشف فقط دوال محدودة عبر `contextBridge` بلا تمرير `ipcRenderer` كاملًا للنافذة — نمط سليم يمنع RCE من محتوى الويب المعروض.
- لا توجد مفاتيح API حساسة (Anthropic/Resend) مكتوبة مباشرة بالكود — تُقرأ حصرًا من `context.env` بـCloudflare (تعليقات الكود توثّق هذا بوضوح)، ولا يوجد ملف `.env` مسرَّب بالمستودع.
- روابط `target="_blank"` بـ`auth.jsx` مرفقة بـ`rel="noopener noreferrer"` بشكل صحيح.

---

## 4) توصيات عامة على مستوى السيرفر والإعدادات

1. **فعّل Cloudflare Rate Limiting** على كل مسارات `/api/*` (خصوصًا `claude-proxy` و`send-mention-email`) كطبقة حماية أولى وسريعة التطبيق ريثما يُبنى تحقق هوية كامل — أهم إجراء فوري ممكن تطبيقه اليوم بلا تعديل كود.
2. **قيّد CORS لكل دوال `functions/api/*`** لدومين النشر الفعلي بدل `Access-Control-Allow-Origin: "*"` بكل مكان تظهر فيه.
3. **راجع سياسات RLS فعليًا بلوحة Supabase** لجداول `users`, `allowed_users`, `app_settings`, `audit_log`، وتأكد من مطابقتها الكاملة لمنطق `permissions.js`/`auth.jsx` — هذا أهم بند بالتقرير لأنه يحدد إذا كانت كل ثغرات RBAC بالواجهة قابلة للاستغلال فعليًا أم محتواة أصلًا بالخادم.
4. **احذف كل قيمة افتراضية/fallback لكلمة مرور أو مفتاح بكود الواجهة** — أي سرّ افتراضي بكود يُشحَن للمتصفح هو باب خلفي بحكم التعريف، بصرف النظر عن نية الكاتب الأصلية (تسهيل الإعداد الأولي عادة).
5. **انقل كل عمليات RBAC الحساسة (تعديل دور، حذف مستخدم) لدالة خادم** تستخدم `service_role` key بدل التنفيذ المباشر من المتصفح — يزيل الاعتماد الكلي على RLS كخط دفاع وحيد.
6. **حدّث `xlsx` لمصدر SheetJS الرسمي (CDN)** بدل نسخة npm القديمة المتوقفة عن التحديث.
7. **أضف فحص أمني دوري آلي** (`npm audit` أو أداة مثل Dependabot/Snyk) يعمل تلقائيًا عند كل push، بدل الاعتماد على فحص يدوي لمرة واحدة.
8. **وثّق سياسة تدوير المفاتيح (Key Rotation)** لمفاتيح Qoyod API الخاصة بالعملاء المخزَّنة — خصوصًا لو مفتاح عميل تسرّب سابقًا، هل يوجد إجراء واضح لإبطاله وإصدار جديد من طرف قيود؟

---

*تم إعداد هذا التقرير بمراجعة كود يدوية شاملة + `npm audit`. البنود المتعلقة بـSupabase RLS (C-3) تتطلب تأكيدًا مباشرًا بلوحة تحكم Supabase لا يمكن التحقق منه من الكود وحده — أوصي بأن تكون أول خطوة عملية بعد هذا التقرير.*
