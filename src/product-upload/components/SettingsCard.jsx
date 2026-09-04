import React from "react";
import { SafeInput } from "../../lib/SafeInput.jsx";

/**
 * بطاقة الإعدادات — منقولة من قسم "Settings" الأصلي (سطر 175-195): حساب
 * الإيراد/المصروف الافتراضيان، وتبديلا "شامل الضريبة" و"تخطي المكررات".
 */
export default function SettingsCard({ eng }) {
  const { revenueAcct, setRevenueAcct, expenseAcct, setExpenseAcct, taxInclusive, toggleTaxInclusive, skipDups, toggleSkipDups } = eng;

  return (
    <div className="qpu-panel">
      <div className="qpu-panel-title">الإعدادات</div>

      <div className="qpu-form-row">
        <div className="qpu-form-group">
          <label>حساب الإيراد (افتراضي: 4101)</label>
          <SafeInput type="text" value={revenueAcct} onChange={(e) => setRevenueAcct(e.target.value)} placeholder="4101" />
        </div>
        <div className="qpu-form-group">
          <label>حساب المصروف (افتراضي: 5101)</label>
          <SafeInput type="text" value={expenseAcct} onChange={(e) => setExpenseAcct(e.target.value)} placeholder="5101" />
        </div>
      </div>

      <div className="qpu-toggle-row">
        <div className={"qpu-toggle" + (taxInclusive ? " active" : "")} onClick={toggleTaxInclusive} />
        <span className="qpu-toggle-label">الأسعار شاملة الضريبة (ضريبة القيمة المضافة 15% مشمولة)</span>
      </div>
      <div className="qpu-toggle-row">
        <div className={"qpu-toggle" + (skipDups ? " active" : "")} onClick={toggleSkipDups} />
        <span className="qpu-toggle-label">تخطي المنتجات الموجودة مسبقاً (بالاسم أو الرمز)</span>
      </div>
    </div>
  );
}
