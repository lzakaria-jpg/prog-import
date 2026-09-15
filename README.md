# أدوات قيود المحاسبية

تطبيق ويب (+ نسخة سطح مكتب Electron) فيه 5 أدوات لفرق التأسيس ونقل البيانات بقيود، مبني بـ React 19 + Vite، منشور
عبر Cloudflare Pages، وموثّق مستخدمين/صلاحيات عبر Supabase.

## الأدوات (5)

**أدوات خدمات التأسيس:**
- **تحليل الشجرة واستيرادها** (`merge` — `src/MergeTool.jsx`) — مقارنة/دمج شجرة حسابات العميل مع قيود، تدقيق
  هيكلي وذكاء اصطناعي، إرسال مباشر عبر API
- **رفع المنتجات إلى قيود** (`products` — `src/product-upload/`) — رفع منتجات العميل مباشرة عبر API

**أدوات خدمات نقل البيانات:**
- **تحليل القيود واستيرادها** (`journal` — `src/JournalTool.jsx`) — فحص وتجهيز واستيراد القيود المحاسبية
- **استيراد فواتير المبيعات** (`sales` — `src/sales-invoice-import/`)
- **استيراد فواتير المشتريات** (`bills` — `src/bill-import/`)

كل الأدوات مبنية فوق منصة موحّدة: مصادقة/صلاحيات (`src/auth.jsx`)، شات ذكاء اصطناعي (`src/chat.jsx`)، تبويبات
متعددة لكل أداة (`src/lib/TabbedTool.jsx`).

## المعمارية

- **الواجهة:** React 19 + Vite، Tailwind. `npm run build` ينتج `dist/` (SPA ثابت).
- **الاستضافة/النشر:** Cloudflare Pages (مشروع `qoyodai`، إعداده بـ `wrangler.jsonc`) — **يبني وينشر تلقائيًا عند
  أي push لفرع `master`**، بلا أي خطوة يدوية أو GitHub Action إضافية.
- **الخادم (server-side):** Cloudflare Pages Functions تحت `functions/api/` — مصادقة (`auth-*.js`)، بروكسي CORS
  لـQoyod API (`qoyod-proxy/`)، بروكسي Claude API للمزايا الذكية (`claude-proxy.js`)، إرسال إيميلات
  (`send-mention-email.js`).
- **قاعدة البيانات/المصادقة:** Supabase — رابط المشروع ومفتاح anon العام مضمّنان مباشرة بـ `src/supabase.js` (آمن
  بتصميمه: مفتاح anon عام محمي بسياسات RLS من جهة Supabase، لا يحتاج متغير بيئة منفصل).
- **نسخة سطح المكتب:** Electron (`electron/main.cjs`) — تُبنى محليًا وتعمل بلا إنترنت بالكامل (كل الأصول مُجمَّعة
  بداخلها)، وتتحدّث تلقائيًا عبر GitHub Releases (`electron-updater`، إعداد `build.publish` بـ`package.json`).

## التشغيل محليًا (تطوير)

```bash
npm install
npm run dev
```

## البناء اليدوي (نفس ما ينفّذه Cloudflare تلقائيًا)

```bash
npm install
npm run build      # ينتج dist/ - جاهز للنشر بأي استضافة ثابتة
```

## نسخة سطح المكتب (Electron)

```bash
npm run electron:dev      # تشغيل تجريبي محلي
npm run electron:build    # بناء مثبّت Windows (nsis) بمجلد release/
```

## الاختبارات

```bash
npm test          # vitest run - مرة واحدة
npm run test:watch
```

## متغيرات البيئة (سرّية — لا تُحفَظ بالـrepo إطلاقًا)

مطلوبة فقط لدوال `functions/api/*` (مزايا اختيارية)، وتُضاف من **لوحة Cloudflare Pages → Settings →
Environment variables** (مشروع `qoyodai`) — **ليست بأي ملف بالكود**:

| المتغير | يُستخدم في | الغرض |
|---|---|---|
| `ANTHROPIC_API_KEY` | `claude-proxy.js` | مزايا الذكاء الاصطناعي (الشات، المراجعة الذكية) |
| `RESEND_API_KEY`, `RESEND_FROM` | `auth-login.js`, `auth-request-reset.js`, `send-mention-email.js` | إيميلات (تنبيه دخول، استرجاع كلمة مرور، إشعار إشارة) |

⚠️ **مهم لاستعادة الموقع كارثيًا (backup):** نسخة الكود (git clone) وحدها **لا تكفي** لاسترجاع هذه المزايا —
لازم تحتفظ بنسخة من قيم هذي المتغيرات بمكان آمن منفصل (مدير كلمات مرور)، لأنها موجودة فقط بلوحة Cloudflare ولا أثر
لها بالكود بتاتًا (بالتصميم، لأسباب أمنية).

## استعادة كاملة من نسخة محلية (git clone)

نسخة `git clone` كاملة (بتاريخها) هي النسخة الاحتياطية الفعلية القادرة على إعادة بناء الموقع بالكامل:
1. `npm install && npm run build` → نفس ملفات الموقع الحيّة بالضبط، تُرفع لأي استضافة ثابتة (Cloudflare Pages/
   Netlify/Vercel/أي CDN).
2. لإعادة تفعيل مزايا الذكاء الاصطناعي/الإيميل: أضف متغيرات البيئة أعلاه بلوحة الاستضافة الجديدة.
3. لإعادة ربط المصادقة/البيانات: مشروع Supabase (الرابط والمفتاح مضمّنان بالكود فعلًا) — يحتاج فقط وصول لوحة
   Supabase نفسها لو احتجت إدارته (منفصل تمامًا عن استضافة الكود).

حدّث النسخة المحلية دوريًا بـ`git pull` (يدويًا أو بجدولة تلقائية على جهازك) حتى تبقى مطابقة لآخر تحديث.
