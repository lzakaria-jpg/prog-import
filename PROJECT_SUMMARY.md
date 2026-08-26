# Qoyod PWA - ملخص المشروع jusqu'à Aug 26, 2025

## الهدف العام
تطبيق سطح مكتب (Electron) بيتabric لشيلين:
1. **أداة استيراد القيود** — فحص وتجهيز ملفات Excel للقيود المحاسبية
2. **أداة مطابقة شجرة الحسابات** — دمج شجرة حسابات جديدة مع شجرة موجودة بقيود

الشكل النهائي: هوية قيود، تبديل لغة عربي/إنجليزي مع قلب كامل RTL/LTR، علامات مائية، أيقونة مخصصة.

## مسار المشروع
```
C:\Users\الوليد للكمبيوتر\Desktop\qoyod-pwa\
```

## مسار ملف التنصيب
```
C:\Users\الوليد للكمبيوتر\Desktop\qoyod-pwa\release\مدقق استيراد القيود Setup 1.0.0.exe
```

## أوامر البناء
```bash
# بناء الواجهة
cd /d C:\Users\الوليد للكمبيوتر\Desktop\qoyod-pwa && npm run build

# بناء ملف التنصيب
cd /d C:\Users\الوليد للكمبيوتر\Desktop\qoyod-pwa && set CSC_IDENTITY_AUTO_DISCOVERY=false && npx electron-builder --win
```

## الملفات الرئيسية

### الملفات الجديدة
| الملف | الوصف |
|-------|-------|
| `src/language.jsx` | نظام الترجمة — `LanguageProvider`، `useLanguage()`، `t({ar, en})` |
| `src/QoyodLogo.jsx` | شعار قيود SVG (حرف ق + عملة + عدسة) |
| `src/Watermark.jsx` | علامات مائية (آلات حاسبة، عملات، 1234، %، Σ) |
| `build/app-icon.svg` | أيقونة البرنامج (حرف Q كحلي + AI) |
| `build/icon.ico` | أيقونة multi-size للـ electron-builder |
| `build/make-icon.cjs` | سكربت توليد PNG/ICO من SVG عبر Electron |

### الملفات المعدلة
| الملف | التعديلات |
|-------|----------|
| `src/App.jsx` | كامل — LanguageProvider، QoyodLogo، LanguageToggle، Watermark، dir flip |
| `src/JournalTool.jsx` | كامل — ترجمة t()، dir، خصائص منطقية |
| `src/MergeTool.jsx` | كامل — ترجمة t()، localiizeMergeError، إصلاح UploadCard |
| `src/index.css` | لوحة ألوان Qoyod، watermark utilities |
| `tailwind.config.js` | ألوان qoyod، fontFamily cairo |
| `package.json` | `"icon": "build/icon.ico"` في build config |
| `src/lib/excelCore.js` | إصلاح parseEntriesFile multi-schema، matchQoyodId |

## نظام الترجمة (i18n)
```jsx
// في أي مكوّن:
const { t, lang, dir } = useLanguage();

// استخدام:
t({ ar: "نص عربي", en: "English text" })
t("string passthrough") // يرجع النص كما هو
```

**مهم:** كل مكوّن يستخدم `t()` لازم يضيف `const { t } = useLanguage();` —如果不، يطلع ReferenceError وينهار المكوّن.

## الألوان
```css
--qoyod-primary: #0E9F95;
--qoyod-primary-dark: #0B7E76;
--qoyod-sidebar-grad-a: #103A38;
--qoyod-sidebar-grad-b: #0B2A2C;
--qoyod-bg: #F1F5F9;
--qoyod-green: #16A34A;
```

## الأيقونة
- تصميم: مربع بحواف دائرية بتدرج تيل + حرف Q أبيض + شارة AI
- الألوان: `#13B5A6` → `#0B2A2C` للخلفية، أبيض للحرف والشارة
- الأحجام: 16، 32، 48، 64، 128، 256 بكسل

## المشاكل اللي انحلت
1. **خطأ Parse في ملف Excel أحمر** — Schema A كان ي match زائف بصف 57,426 →Fix: parseEntriesFile يجرب كل الـ schemas
2. **خطا matchQoyodId** — السطر كان منقسم على أكثر من خلية →Fix: concatenation قبل regex
3. **صفحة بيضاء في MergeTool** — UploadCard كان يستخدم t() بدون useLanguage() →ReferenceError

## ملاحظات تقنية مهمة
- Electron main يgunakan `.cjs` (package.json فيه `"type": "module"`)
- `CSC_IDENTITY_AUTO_DISCOVERY=false` لازم قبل electron-builder
- PERFORMANCE: الأداة لازم تتعامل مع حتى 17,000 قيد
- Croatian/Arabic date format: `QOYOD_REPORT_DATE_RE = /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/`

## الـ EXE بدون توقيع
- ويندوز يطلع تحذير "تطبيق غير معروف" → يضغط Run Anyway
- لو حابب أعمل توقيع ذاتي (self-signed) — ممكن لاحقاً

## باقي ينعمل ( OPPORTUNITIES )
- ترجمة النصوص الداخلية (ملاحظات الأخطاء مثل "الأب غير موجود"، أسماء الفئات بالشجرة)
- توقيع ذاتي (self-signing) لشيل التحذير
- تحسين شكل الأيقونة لو حابب
