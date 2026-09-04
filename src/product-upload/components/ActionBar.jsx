import React from "react";

/**
 * شريط بدء/إيقاف الرفع — منقول من قسم "actionCard" الأصلي (سطر 212-223).
 * القرار الصريح من المستخدم: يبقى بلا أي خطوة تأكيد إضافية — بمجرد ضغط "بدء
 * الرفع" تبدأ الكتابة الفعلية فوراً على حساب Qoyod، تماماً كالأصل.
 */
export default function ActionBar({ eng }) {
  const { excelData, previewSummary, uploading, startUpload, stopUpload } = eng;

  if (!excelData.length) return null;

  return (
    <div className="qpu-panel">
      <div className="qpu-action-row">
        <div>
          <div className="qpu-action-label">جاهز للرفع</div>
          <div className="qpu-hint">
            {previewSummary.count} منتج جاهز للرفع ({previewSummary.categories} فئة سيتم إنشاؤها إن كانت مفقودة)
          </div>
        </div>
        <div className="qpu-action-buttons">
          {!uploading && (
            <button type="button" className="qpu-btn" onClick={startUpload}>▶ بدء الرفع</button>
          )}
          {uploading && (
            <button type="button" className="qpu-btn danger" onClick={stopUpload}>■ إيقاف</button>
          )}
        </div>
      </div>
    </div>
  );
}
