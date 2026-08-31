import React from 'react';

/**
 * نافذة تأكيد داخل هوية التطبيق — بديل لـ window.confirm/alert الأصليتين، حفاظًا على
 * التصميم البصري الموحّد للموقع (طلب المستخدم صريح بعدم الاعتماد على نوافذ المتصفح الافتراضية).
 * تُستخدم في: قرار "إضافة/استبدال" عند استيراد ملف فواتير غير منظم فوق جدول به بيانات،
 * وتأكيد "إفراغ كل الأسطر"، ورسالة "اختر موقعًا أولًا" في لوحة الفواتير بدون موقع.
 */
export default function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="qsv-modal-overlay" role="dialog" aria-modal="true">
      <div className="qsv-modal">
        {title && <h3>{title}</h3>}
        <p>{message}</p>
        <div className="qsv-modal-actions">
          {cancelLabel && (
            <button type="button" className="qsv-btn ghost" onClick={onCancel}>{cancelLabel}</button>
          )}
          <button type="button" className="qsv-btn" onClick={onConfirm}>{confirmLabel || 'موافق'}</button>
        </div>
      </div>
    </div>
  );
}
