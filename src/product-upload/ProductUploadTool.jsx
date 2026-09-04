import React from "react";
import useProductUploadEngine from "./useProductUploadEngine.js";
import ApiKeyCard from "./components/ApiKeyCard.jsx";
import FileUploadCard from "./components/FileUploadCard.jsx";
import SettingsCard from "./components/SettingsCard.jsx";
import PreviewCard from "./components/PreviewCard.jsx";
import ActionBar from "./components/ActionBar.jsx";
import ProgressLog from "./components/ProgressLog.jsx";
import "./styles/qoyod-product-upload.css";

/**
 * أداة رفع المنتجات إلى قيود — المكوّن الرئيسي (الأداة الخامسة).
 *
 * مستقلة تماماً: بلا Context أو i18n أو أي اعتماد خارج حدود هذا المجلد (نفس
 * قاعدة bill-import وsales-invoice-import) — الاندماج بالموقع يتم فقط عبر
 * تسجيل هذا المكوّن كأداة خامسة طبيعية في App.jsx (NAV_ITEMS + شرط can() +
 * Watermark)، بلا أي تغيير على منطقه الداخلي.
 *
 * فرق جوهري عن الأدوات الأربعة الأخرى: هذه الأداة **تكتب فعلياً** على حساب
 * Qoyod الحقيقي للعميل (فئات/وحدات/منتجات عبر API بمفتاحه) بمجرد ضغط "بدء
 * الرفع" — الأدوات الأخرى تُجهّز ملفاً فقط يرفعه المستخدم يدوياً من قيود.
 * هذا سلوك أصلي مقصود من الأداة ولم يُغيَّر (قرار صريح من المستخدم).
 *
 * @param {boolean} [showHeader] إظهار الشريط العلوي الداخلي؛ مرّر false عند
 *                                الدمج داخل تطبيق له شريطه الخاص (هذا ما
 *                                يستخدمه App.jsx فعلياً).
 */
export default function ProductUploadTool({ showHeader = true } = {}) {
  const eng = useProductUploadEngine();

  return (
    <div className="qpu-app" dir="rtl">
      {showHeader && (
        <header className="qpu-topbar">
          <h1>📦 أداة رفع المنتجات إلى قيود</h1>
          <p>ترفع منتجات العميل مباشرة إلى حساب Qoyod الخاص به عبر مفتاح API — الفئات والوحدات المفقودة تُنشأ تلقائياً.</p>
        </header>
      )}

      <div className="qpu-wrap">
        <ApiKeyCard eng={eng} />
        <FileUploadCard eng={eng} />
        <SettingsCard eng={eng} />
        <PreviewCard eng={eng} />
        <ActionBar eng={eng} />
        <ProgressLog eng={eng} />
      </div>
    </div>
  );
}
