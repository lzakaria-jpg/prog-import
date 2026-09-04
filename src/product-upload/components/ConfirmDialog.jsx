import React from "react";

/**
 * نافذة تأكيد داخل هوية التطبيق — بديل لـwindow.confirm الأصلية (كانت تُستخدم في
 * removeKey: `confirm('Remove ${name}?')`)، بنفس النمط المعتمد في أداة استيراد
 * فواتير المبيعات (ConfirmDialog.jsx) حفاظاً على التصميم البصري الموحّد للموقع.
 */
export default function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="qpu-modal-overlay" role="dialog" aria-modal="true">
      <div className="qpu-modal">
        {title && <h3>{title}</h3>}
        <p>{message}</p>
        <div className="qpu-modal-actions">
          {cancelLabel && (
            <button type="button" className="qpu-btn ghost" onClick={onCancel}>{cancelLabel}</button>
          )}
          <button type="button" className="qpu-btn danger" onClick={onConfirm}>{confirmLabel || "موافق"}</button>
        </div>
      </div>
    </div>
  );
}
