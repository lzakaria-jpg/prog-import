import React, { forwardRef, useEffect, useImperativeHandle } from "react";
import { useLanguage } from "../language.jsx";
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
 * [تحديث 2026-09-08] كانت مستقلة تماماً بلا Context أو i18n — الاندماج
 * بالموقع كان فقط عبر التسجيل كأداة خامسة بـApp.jsx (NAV_ITEMS + شرط can() +
 * Watermark). الآن مربوطة بنظام اللغة المشترك (useLanguage/t) بعد ملاحظة
 * المستخدم إن تبديل اللغة للإنجليزية ما كان يشمل هذه الأداة إطلاقاً — حتى
 * اتجاه dir="rtl" كان ثابتاً هنا بصرف النظر عن لغة التطبيق.
 *
 * فرق جوهري عن الأدوات الأربعة الأخرى: هذه الأداة **تكتب فعلياً** على حساب
 * Qoyod الحقيقي للعميل (فئات/وحدات/منتجات عبر API بمفتاحه) بمجرد ضغط "بدء
 * الرفع" — الأدوات الأخرى تُجهّز ملفاً فقط يرفعه المستخدم يدوياً من قيود.
 * هذا سلوك أصلي مقصود من الأداة ولم يُغيَّر (قرار صريح من المستخدم).
 *
 * @param {boolean} [showHeader] إظهار الشريط العلوي الداخلي؛ مرّر false عند
 *                                الدمج داخل تطبيق له شريطه الخاص (هذا ما
 *                                يستخدمه App.jsx فعلياً).
 *
 * [إضافة 2026-09-14] forwardRef + onNameChange/onBusyChange — دعم "التبويبات
 * المتعددة داخل الأداة" (TabbedTool.jsx)، نفس نمط MergeTool/JournalTool —
 * إضافتان اختياريتان بحتتان بلا قيمة افتراضية تُغيّر أي سلوك لو تُجوهلتا.
 */
const ProductUploadTool = forwardRef(function ProductUploadTool({ showHeader = true, onNameChange, onBusyChange } = {}, ref) {
  const { t, dir } = useLanguage();
  const eng = useProductUploadEngine();

  useEffect(() => { onNameChange && onNameChange(eng.customerName); }, [eng.customerName, onNameChange]);
  useEffect(() => { onBusyChange && onBusyChange(eng.uploading); }, [eng.uploading, onBusyChange]);
  useImperativeHandle(ref, () => ({ requestStop: eng.stopUpload }), [eng.stopUpload]);

  return (
    <div className="qpu-app" dir={dir}>
      {showHeader && (
        // [إعادة تصميم] رأس بنفس تكوين رأس أداتي الشجرة والقيود (أيقونة كحلية + عنوان/عنوان فرعي)
        // بدل الشريط المتدرّج السابق — بلا أي تأثير على منطق الأداة.
        <header className="qpu-header">
          <div className="qpu-header-left">
            <div className="qpu-header-icon" aria-hidden="true">📦</div>
            <div className="qpu-header-title">
              <h1>{t({ ar: "أداة رفع المنتجات إلى قيود", en: "Product Upload to Qoyod" })}</h1>
              <p>{t({ ar: "ترفع منتجات العميل مباشرة إلى حساب Qoyod الخاص به عبر مفتاح API — الفئات والوحدات المفقودة تُنشأ تلقائياً.", en: "Uploads the customer's products directly to their Qoyod account via API key — missing categories and units are created automatically." })}</p>
            </div>
          </div>
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
});

export default ProductUploadTool;
