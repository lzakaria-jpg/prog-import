import React from "react";
import { SafeInput } from "../../lib/SafeInput.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";

/**
 * بطاقة مفتاح API — منقولة من قسم "API Key" الأصلي (سطر 139-161 بالملف
 * الأصلي): حقل المفتاح (Show/Save)، حقل اسم العميل، ورقاقات العملاء المحفوظين.
 */
export default function ApiKeyCard({ eng }) {
  const {
    apiKey, setApiKey, customerName, setCustomerName, keyVisible, toggleKeyVisibility,
    savedKeys, saveKey, loadKey, requestRemoveKey, removeKeyTarget, cancelRemoveKey, confirmRemoveKey,
    uploadAlert, dismissAlert,
  } = eng;

  const names = Object.keys(savedKeys);

  return (
    <div className="qpu-panel">
      <div className="qpu-panel-title">مفتاح API</div>

      {uploadAlert && (
        <div className="qpu-note-box err" style={{ marginBottom: 12 }}>
          ⛔ {uploadAlert}
          <button type="button" className="qpu-btn ghost" style={{ marginRight: 10 }} onClick={dismissAlert}>حسناً</button>
        </div>
      )}

      <div className="qpu-form-group full">
        <label>أدخل مفتاح Qoyod API</label>
        <div className="qpu-key-row">
          <SafeInput
            type={keyVisible ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API-KEY-XXXX-XXXX"
            style={{ flex: 1 }}
          />
          <button type="button" className="qpu-btn secondary" onClick={toggleKeyVisibility}>
            {keyVisible ? "إخفاء" : "عرض"}
          </button>
          <button type="button" className="qpu-btn" onClick={saveKey}>حفظ</button>
        </div>
      </div>

      <div className="qpu-form-group" style={{ maxWidth: 320 }}>
        <label>اسم العميل (للحفظ)</label>
        <SafeInput
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="اسم العميل"
        />
      </div>

      {names.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <label className="qpu-hint">العملاء المحفوظون</label>
          <div className="qpu-saved-keys">
            {names.map((name) => (
              <div key={name} className={"qpu-key-chip" + (savedKeys[name] === apiKey.trim() ? " active" : "")}>
                <span onClick={() => loadKey(name)}>{name}</span>
                <span className="remove" onClick={() => requestRemoveKey(name)}>×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!removeKeyTarget}
        title="حذف مفتاح محفوظ"
        message={`حذف مفتاح "${removeKeyTarget}"؟`}
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        onConfirm={confirmRemoveKey}
        onCancel={cancelRemoveKey}
      />
    </div>
  );
}
