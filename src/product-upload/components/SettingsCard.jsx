import React from "react";
import { useLanguage } from "../../language.jsx";
import { SafeInput } from "../../lib/SafeInput.jsx";

/**
 * بطاقة الإعدادات — منقولة من قسم "Settings" الأصلي (سطر 175-195): حساب
 * الإيراد/المصروف الافتراضيان، وتبديلا "شامل الضريبة" و"تخطي المكررات".
 */
export default function SettingsCard({ eng }) {
  const { t } = useLanguage();
  const {
    revenueAcct, setRevenueAcct, expenseAcct, setExpenseAcct, taxInclusive, toggleTaxInclusive, skipDups, toggleSkipDups,
    updateExisting, toggleUpdateExisting,
    openingBalanceDate, setOpeningBalanceDate, defaultLocation, setDefaultLocation,
  } = eng;

  return (
    <div className="qpu-panel">
      <div className="qpu-panel-title">{t({ ar: "الإعدادات", en: "Settings" })}</div>

      <div className="qpu-form-row">
        <div className="qpu-form-group">
          <label>{t({ ar: "حساب الإيراد (افتراضي: 4101)", en: "Revenue account (default: 4101)" })}</label>
          <SafeInput type="text" value={revenueAcct} onChange={(e) => setRevenueAcct(e.target.value)} placeholder="4101" />
        </div>
        <div className="qpu-form-group">
          <label>{t({ ar: "حساب المصروف (افتراضي: 5101)", en: "Expense account (default: 5101)" })}</label>
          <SafeInput type="text" value={expenseAcct} onChange={(e) => setExpenseAcct(e.target.value)} placeholder="5101" />
        </div>
      </div>

      <div className="qpu-toggle-row">
        <div className={"qpu-toggle" + (taxInclusive ? " active" : "")} onClick={toggleTaxInclusive} />
        <span className="qpu-toggle-label">{t({ ar: "الأسعار شاملة الضريبة (ضريبة القيمة المضافة 15% مشمولة)", en: "Prices are tax-inclusive (15% VAT included)" })}</span>
      </div>
      <div className="qpu-toggle-row">
        <div className={"qpu-toggle" + (skipDups ? " active" : "")} onClick={toggleSkipDups} />
        <span className="qpu-toggle-label">{t({ ar: "تخطي المنتجات الموجودة مسبقاً (بالاسم أو الرمز)", en: "Skip products that already exist (by name or SKU)" })}</span>
      </div>
      {/* [إضافة 2026-09-07] تحديث بدل تخطي — مؤكَّد عبر PUT /products/{id} حقيقي
          من المستخدم. مطابقة بالرمز (sku) فقط عمداً — منتج بلا رمز بالملف لا
          يمكن تحديثه أبداً (يستمر بمنطق التخطي/الإنشاء العادي). لو فعّلته
          يتفوّق على "تخطي" لأي منتج تطابق رمزه فقط؛ الباقي (تطابق بالاسم فقط،
          أو بلا تطابق إطلاقاً) يبقى بنفس السلوك الحالي. */}
      <div className="qpu-toggle-row">
        <div className={"qpu-toggle" + (updateExisting ? " active" : "")} onClick={toggleUpdateExisting} />
        <span className="qpu-toggle-label">{t({ ar: "تحديث المنتجات الموجودة (بدل تخطيها) — مطابقة بالرمز فقط، يتطلب عمود رمز/كود بالملف", en: "Update existing products (instead of skipping) — matched by SKU only, requires a SKU/code column in the file" })}</span>
      </div>

      {/* [إضافة 2026-09-07، محدَّث بعد مطابقة القالب الرسمي] إعدادا الرصيد
          الافتتاحي — يظهر أثرهما فقط لو وُجد عمود "الكمية المتوفرة" (أو
          مرادفاته) بملف العميل؛ بلا هذا العمود لا يتولّد أي ملف إطلاقاً بصرف
          النظر عن هذين الإعدادين. القالب الرسمي لا يحمل التاريخ داخل ملف
          Excel نفسه (تأكَّدنا من نسخة حقيقية منه) — التاريخ هنا للتذكير فقط
          (يظهر باسم الملف وبسجل الرفع)، وتُدخله يدوياً على شاشة قيود عند
          الاستيراد. */}
      <div className="qpu-form-row">
        <div className="qpu-form-group">
          <label>{t({ ar: "تاريخ الرصيد الافتتاحي (تذكير — يُدخَل يدوياً بشاشة قيود، القالب لا يحمله)", en: "Opening balance date (reminder only — entered manually in Qoyod, not carried in the template)" })}</label>
          <SafeInput type="date" value={openingBalanceDate} onChange={(e) => setOpeningBalanceDate(e.target.value)} />
        </div>
        <div className="qpu-form-group">
          <label>{t({ ar: 'الموقع الافتراضي (لو ما وُجد عمود "الموقع" بالملف)', en: 'Default location (used if the file has no "Location" column)' })}</label>
          <SafeInput type="text" value={defaultLocation} onChange={(e) => setDefaultLocation(e.target.value)} placeholder={t({ ar: "المركز الرئيسي", en: "Main branch" })} />
        </div>
      </div>
    </div>
  );
}
