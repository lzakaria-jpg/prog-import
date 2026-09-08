import React from "react";
import { useLanguage } from "../../language.jsx";

/**
 * شريط بدء/إيقاف الرفع — منقول من قسم "actionCard" الأصلي (سطر 212-223).
 * القرار الصريح من المستخدم: يبقى بلا أي خطوة تأكيد إضافية — بمجرد ضغط "بدء
 * الرفع" تبدأ الكتابة الفعلية فوراً على حساب Qoyod، تماماً كالأصل.
 */
export default function ActionBar({ eng }) {
  const { t } = useLanguage();
  const { excelData, previewSummary, uploading, startUpload, stopUpload } = eng;

  if (!excelData.length) return null;

  return (
    <div className="qpu-panel">
      <div className="qpu-action-row">
        <div>
          <div className="qpu-action-label">{t({ ar: "جاهز للرفع", en: "Ready to upload" })}</div>
          <div className="qpu-hint">
            {previewSummary.count} {t({ ar: "منتج جاهز للرفع", en: "product(s) ready to upload" })} ({previewSummary.categories} {t({ ar: "فئة سيتم إنشاؤها إن كانت مفقودة", en: "categor(y/ies) will be created if missing" })})
          </div>
        </div>
        <div className="qpu-action-buttons">
          {!uploading && (
            <button type="button" className="qpu-btn" onClick={startUpload}>▶ {t({ ar: "بدء الرفع", en: "Start upload" })}</button>
          )}
          {uploading && (
            <button type="button" className="qpu-btn danger" onClick={stopUpload}>■ {t({ ar: "إيقاف", en: "Stop" })}</button>
          )}
        </div>
      </div>
    </div>
  );
}
