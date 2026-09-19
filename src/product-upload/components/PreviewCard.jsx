import React from "react";
import { useLanguage } from "../../language.jsx";
import { useTableVirtualization } from "../../lib/useTableVirtualization.js";
import { parseSellingPriceNumber, parseQuantityNumber } from "../engine/parsing.js";

const BASE_COL_COUNT = 9;
const DEFAULT_REVENUE_CODE = "4101";
const DEFAULT_EXPENSE_CODE = "5101";

/**
 * بطاقة معاينة البيانات — منقولة من showPreview() الأصلية (سطر 370-406).
 * "Show all rows, no cap" بالأصل محفوظ حرفياً (كل الصفوف تُعرض)، فقط طريقة
 * العرض تستخدم نافذة تمرير (useTableVirtualization) بدل بناء 2000+ عنصر DOM
 * دفعة واحدة — نفس أسلوب الجداول الكبيرة الأخرى بالمشروع (لا تغيير بالمحتوى).
 *
 * [إضافة 2026-09-07] أعمدة اختيارية جديدة (اسم إنجليزي/وصف/سعر بيع/باركود/كمية/
 * موقع) تظهر فقط لو وُجدت قيمة واحدة على الأقل بالملف الحالي — ملف لا يستخدم
 * هذه الأعمدة يبقى بنفس الجدول الأصلي حرفياً (9 أعمدة، بلا أي تغيير).
 */
function accountLabel(a) {
  return `${a.name_ar || a.name_en || a.code} (${a.code})`;
}

// [إضافة 2026-09-19] نص الخيار الافتراضي (بلا تجاوز) بقائمة اختيار الحساب لكل
// صف: يعرض قيمة الملف الخام لهذا المنتج لو وُجدت (شفافية — يوضح ما سيُطابَق
// فعلياً بـresolveAccountId وقت الرفع الحقيقي)، وإلا الحساب الافتراضي الفعلي
// المطابَق (لو أُتيحت previewAccounts)، وإلا الكود المُعدّ بإعدادات الأداة فقط.
function defaultAccountLabel(rawFileValue, resolvedDefaultAccount, defaultCode, t) {
  if (rawFileValue) return t({ ar: `كما في الملف: ${rawFileValue}`, en: `As in file: ${rawFileValue}` });
  if (resolvedDefaultAccount) return t({ ar: `افتراضي: ${accountLabel(resolvedDefaultAccount)}`, en: `Default: ${accountLabel(resolvedDefaultAccount)}` });
  return t({ ar: `افتراضي ${defaultCode}`, en: `Default ${defaultCode}` });
}

export default function PreviewCard({ eng }) {
  const { t } = useLanguage();
  const {
    excelData, baseExcelData, previewSummary,
    previewAccounts, previewAccountsLoading, previewAccountsError, fetchPreviewAccounts,
    revenueAccountOptions, expenseAccountOptions, defaultRevenueAccount, defaultExpenseAccount,
    rowOverrides, setRowAccountOverride, revenueAcct, expenseAcct,
  } = eng;
  const v = useTableVirtualization(excelData.length);

  if (!excelData.length) return null;

  // [إضافة 2026-09-19] قوائم اختيار الحساب لكل صف تظهر فقط لو أُتيحت حسابات
  // المعاينة فعلاً (مفتاح API مُدخَل + جُلبت بنجاح) — قبل ذلك يبقى العرض
  // النصي الأصلي كما كان تماماً (بلا أي تغيير على الحالة الحالية بلا مفتاح).
  const accountsReady = previewAccounts.length > 0;

  const showNameEn = previewSummary.withNameEn > 0;
  const showDescription = previewSummary.withDescription > 0;
  const showSellingPrice = previewSummary.withSellingPrice > 0;
  const showBarcode = previewSummary.withBarcode > 0;
  const showQuantity = previewSummary.withQuantity > 0;
  const showLocation = previewSummary.withLocation > 0;
  const colCount = BASE_COL_COUNT + [showNameEn, showDescription, showSellingPrice, showBarcode, showQuantity, showLocation].filter(Boolean).length;

  const rowsToRender = v.shouldVirtualize ? excelData.slice(v.startIndex, v.endIndex) : excelData;
  const offset = v.shouldVirtualize ? v.startIndex : 0;

  return (
    <div className="qpu-panel">
      <div className="qpu-panel-title">{t({ ar: "معاينة البيانات", en: "Data preview" })}</div>
      <div className="qpu-hint" style={{ marginBottom: 10 }}>
        {previewSummary.count} {t({ ar: "منتج", en: "products" })} | {previewSummary.categories} {t({ ar: "فئة", en: "categories" })} | {previewSummary.units} {t({ ar: "وحدة", en: "units" })}
        {showQuantity && ` | ${previewSummary.withQuantity} ${t({ ar: "منتج فيه كمية افتتاحية", en: "product(s) with an opening quantity" })}`}
      </div>

      {/* [إضافة 2026-09-19] جلب حسابات المعاينة يدوياً — لعرضها بقوائم اختيار حساب
          الإيراد/المصروف أدناه (مصفّاة حسب نوع الحساب من دليل حسابات العميل
          الحقيقي)، ولعرض الحساب الافتراضي الفعلي المطابَق بدل نص ثابت. */}
      <div className="qpu-toggle-row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        <button type="button" className="qpu-btn secondary" onClick={() => fetchPreviewAccounts()} disabled={previewAccountsLoading}>
          🔄 {previewAccountsLoading
            ? t({ ar: "جارٍ جلب الحسابات...", en: "Fetching accounts..." })
            : t({ ar: "تحديث قائمة الحسابات", en: "Refresh accounts list" })}
        </button>
        {accountsReady && (
          <span className="qpu-hint">
            {t({ ar: `${previewAccounts.length} حساب متاح للاختيار لكل منتج`, en: `${previewAccounts.length} account(s) available to pick per product` })}
          </span>
        )}
        {!accountsReady && !previewAccountsLoading && (
          <span className="qpu-hint">
            {t({ ar: "أدخل مفتاح API ثم اضغط هنا لإتاحة اختيار حساب مخصَّص لكل منتج", en: "Enter the API key then click here to enable a custom account choice per product" })}
          </span>
        )}
        {previewAccountsError && <span className="qpu-note-box err" style={{ padding: "4px 10px", fontSize: 12 }}>⛔ {previewAccountsError}</span>}
      </div>
      <div className="qpu-table-wrap" ref={v.scrollRef}>
        <table>
          <thead>
            <tr>
              <th>#</th><th>{t({ ar: "الرمز", en: "SKU" })}</th><th>{t({ ar: "الاسم", en: "Name" })}</th>
              {showNameEn && <th>{t({ ar: "الاسم (إنجليزي)", en: "Name (English)" })}</th>}
              {showDescription && <th>{t({ ar: "الوصف", en: "Description" })}</th>}
              <th>{t({ ar: "الفئة", en: "Category" })}</th><th>{t({ ar: "الوحدة", en: "Unit" })}</th>
              <th>{t({ ar: "مخزون", en: "Inventory" })}</th><th>{t({ ar: "التكلفة", en: "Cost" })}</th>
              {showSellingPrice && <th>{t({ ar: "سعر البيع", en: "Selling price" })}</th>}
              {showBarcode && <th>{t({ ar: "الباركود", en: "Barcode" })}</th>}
              {showQuantity && <th>{t({ ar: "الكمية", en: "Quantity" })}</th>}
              {showLocation && <th>{t({ ar: "الموقع", en: "Location" })}</th>}
              <th>{t({ ar: "حساب الإيراد", en: "Revenue account" })}</th><th>{t({ ar: "حساب المصروف", en: "Expense account" })}</th>
            </tr>
          </thead>
          <tbody>
            {v.shouldVirtualize && v.topSpacerHeight > 0 && (
              <tr><td colSpan={colCount} style={{ height: v.topSpacerHeight, padding: 0, border: "none" }} /></tr>
            )}
            {rowsToRender.map((p, idx) => {
              const i = offset + idx;
              const sellingPriceNum = parseSellingPriceNumber(p.selling_price_raw);
              const qtyNum = parseQuantityNumber(p.quantity_raw);
              return (
                <tr key={i} ref={idx === 0 ? v.measuredRowRef : undefined}>
                  <td>{i + 1}</td>
                  <td>{p.sku || "-"}</td>
                  <td>{p.name}</td>
                  {showNameEn && <td>{p.name_en || <span className="qpu-muted">-</span>}</td>}
                  {showDescription && <td>{p.description || <span className="qpu-muted">-</span>}</td>}
                  <td>{p.category ? <span className="qpu-badge blue">{p.category}</span> : <span className="qpu-muted">-</span>}</td>
                  <td>{p.unit || "-"}</td>
                  <td>{p.is_inventory ? <span className="qpu-badge green">{t({ ar: "نعم", en: "Yes" })}</span> : <span className="qpu-badge yellow">{t({ ar: "لا", en: "No" })}</span>}</td>
                  <td>{p.cost || "-"}</td>
                  {showSellingPrice && <td>{sellingPriceNum !== null ? sellingPriceNum : <span className="qpu-muted">-</span>}</td>}
                  {showBarcode && <td>{p.barcode || <span className="qpu-muted">-</span>}</td>}
                  {showQuantity && <td>{qtyNum !== null ? qtyNum : <span className="qpu-muted">-</span>}</td>}
                  {showLocation && <td>{p.location || <span className="qpu-muted">-</span>}</td>}
                  <td>
                    {accountsReady ? (
                      <select
                        className="qpu-map-select"
                        value={rowOverrides[i]?.revenue_account_name || ""}
                        onChange={(e) => setRowAccountOverride(i, "revenue_account_name", e.target.value)}
                      >
                        <option value="">{defaultAccountLabel(baseExcelData[i]?.revenue_account_name, defaultRevenueAccount, (revenueAcct || "").trim() || DEFAULT_REVENUE_CODE, t)}</option>
                        {revenueAccountOptions.map((a) => <option key={a.id} value={a.code}>{accountLabel(a)}</option>)}
                      </select>
                    ) : (
                      p.revenue_account_name || <span className="qpu-muted">{t({ ar: "افتراضي 4101", en: "Default 4101" })}</span>
                    )}
                  </td>
                  <td>
                    {accountsReady ? (
                      <select
                        className="qpu-map-select"
                        value={rowOverrides[i]?.expense_account_name || ""}
                        onChange={(e) => setRowAccountOverride(i, "expense_account_name", e.target.value)}
                      >
                        <option value="">{defaultAccountLabel(baseExcelData[i]?.expense_account_name, defaultExpenseAccount, (expenseAcct || "").trim() || DEFAULT_EXPENSE_CODE, t)}</option>
                        {expenseAccountOptions.map((a) => <option key={a.id} value={a.code}>{accountLabel(a)}</option>)}
                      </select>
                    ) : (
                      p.expense_account_name || <span className="qpu-muted">{t({ ar: "افتراضي 5101", en: "Default 5101" })}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {v.shouldVirtualize && v.bottomSpacerHeight > 0 && (
              <tr><td colSpan={colCount} style={{ height: v.bottomSpacerHeight, padding: 0, border: "none" }} /></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
