import React from "react";
import { useLanguage } from "../../language.jsx";
import { SafeInput } from "../../lib/SafeInput.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";

/**
 * بطاقة مفتاح API — منقولة من قسم "API Key" الأصلي (سطر 139-161 بالملف
 * الأصلي): حقل المفتاح (Show/Save)، حقل اسم العميل، ورقاقات العملاء المحفوظين.
 */
export default function ApiKeyCard({ eng }) {
  const { t } = useLanguage();
  const {
    apiKey, setApiKey, customerName, setCustomerName, keyVisible, toggleKeyVisibility,
    savedKeys, saveKey, loadKey, requestRemoveKey, removeKeyTarget, cancelRemoveKey, confirmRemoveKey,
    uploadAlert, dismissAlert,
  } = eng;

  const names = Object.keys(savedKeys);

  return (
    <div className="qpu-panel">
      <div className="qpu-panel-title">{t({ ar: "مفتاح API", en: "API Key" })}</div>

      {uploadAlert && (
        <div className="qpu-note-box err" style={{ marginBottom: 12 }}>
          ⛔ {uploadAlert}
          <button type="button" className="qpu-btn ghost" style={{ marginRight: 10 }} onClick={dismissAlert}>{t({ ar: "حسناً", en: "OK" })}</button>
        </div>
      )}

      <div className="qpu-form-group full">
        <label>{t({ ar: "أدخل مفتاح Qoyod API", en: "Enter Qoyod API key" })}</label>
        <div className="qpu-key-row">
          <SafeInput
            type={keyVisible ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API-KEY-XXXX-XXXX"
            style={{ flex: 1 }}
          />
          <button type="button" className="qpu-btn secondary" onClick={toggleKeyVisibility}>
            {keyVisible ? t({ ar: "إخفاء", en: "Hide" }) : t({ ar: "عرض", en: "Show" })}
          </button>
          <button type="button" className="qpu-btn" onClick={saveKey}>{t({ ar: "حفظ", en: "Save" })}</button>
        </div>
      </div>

      <div className="qpu-form-group" style={{ maxWidth: 320 }}>
        <label>{t({ ar: "اسم العميل (للحفظ)", en: "Customer name (to save)" })}</label>
        <SafeInput
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder={t({ ar: "اسم العميل", en: "Customer name" })}
        />
      </div>

      {names.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <label className="qpu-hint">{t({ ar: "العملاء المحفوظون", en: "Saved customers" })}</label>
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
        title={t({ ar: "حذف مفتاح محفوظ", en: "Delete saved key" })}
        message={t({ ar: `حذف مفتاح "${removeKeyTarget}"؟`, en: `Delete key "${removeKeyTarget}"?` })}
        confirmLabel={t({ ar: "حذف", en: "Delete" })}
        cancelLabel={t({ ar: "إلغاء", en: "Cancel" })}
        onConfirm={confirmRemoveKey}
        onCancel={cancelRemoveKey}
      />
    </div>
  );
}
