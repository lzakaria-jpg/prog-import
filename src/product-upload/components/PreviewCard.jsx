import React, { useMemo, useState } from "react";
import { useLanguage } from "../../language.jsx";
import { parseSellingPriceNumber, parseQuantityNumber } from "../engine/parsing.js";

const BASE_COL_COUNT = 9;
const DEFAULT_REVENUE_CODE = "4101";
const DEFAULT_EXPENSE_CODE = "5101";
// [إضافة 2026-09-20، طلب صريح من المستخدم: "قسم لصفحات كل صفحة 20 منتج"]
// عرض 4000+ منتج دفعة واحدة (حتى مع نافذة تمرير) كان يُنتج بطئاً شديداً
// بالتفاعل — كل صف مرئي يحمل قائمتي اختيار حساب (616 حساباً بمثال حقيقي)،
// وإعادة تركيب صفوف جديدة بكل تمرير (useTableVirtualization سابقاً) كانت
// تُعيد تركيب عشرات عناصر <option> باستمرار. الصفحات (بدل التمرير اللانهائي)
// تُثبِّت عدد الصفوف بالـDOM على 20 فقط، يتغيّر فقط عند تنقّل صريح.
const PAGE_SIZE = 20;

/**
 * بطاقة معاينة البيانات — منقولة من showPreview() الأصلية (سطر 370-406).
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
    previewAccounts, referenceDataLoading, referenceDataError, fetchReferenceData,
    revenueAccountOptions, expenseAccountOptions, defaultRevenueAccount, defaultExpenseAccount,
    rowOverrides, setRowAccountOverride, revenueAcct, expenseAcct,
  } = eng;
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(0);

  // [إضافة 2026-09-20] الفهرس الأصلي (i) لازم يبقى مرفَقًا مع كل منتج حتى بعد
  // الفلترة بالبحث — هو ما يُستخدَم بـrowOverrides/setRowAccountOverride (مفتاحه
  // موقع المنتج بـexcelData الكاملة، لا موقعه بنتائج البحث أو الصفحة الحالية).
  const indexed = useMemo(() => excelData.map((p, i) => ({ p, i })), [excelData]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return indexed;
    return indexed.filter(({ p }) => (
      (p.name || "").toLowerCase().includes(q) ||
      (p.name_en || "").toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q)
    ));
  }, [indexed, searchQuery]);

  if (!excelData.length) return null;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const goToPage = (p) => setCurrentPage(Math.max(0, Math.min(totalPages - 1, p)));

  // [إضافة 2026-09-19] قوائم اختيار الحساب لكل صف تظهر فقط لو أُتيحت بيانات
  // المنشأة المرجعية فعلاً (مفتاح API مُدخَل + جُلبت بنجاح) — قبل ذلك يبقى
  // العرض النصي الأصلي كما كان تماماً (بلا أي تغيير على الحالة الحالية بلا مفتاح).
  const accountsReady = previewAccounts.length > 0;

  const showNameEn = previewSummary.withNameEn > 0;
  const showDescription = previewSummary.withDescription > 0;
  const showSellingPrice = previewSummary.withSellingPrice > 0;
  const showBarcode = previewSummary.withBarcode > 0;
  const showQuantity = previewSummary.withQuantity > 0;
  const showLocation = previewSummary.withLocation > 0;
  const colCount = BASE_COL_COUNT + [showNameEn, showDescription, showSellingPrice, showBarcode, showQuantity, showLocation].filter(Boolean).length;

  return (
    <div className="qpu-panel">
      <div className="qpu-panel-title">{t({ ar: "معاينة البيانات", en: "Data preview" })}</div>
      <div className="qpu-hint" style={{ marginBottom: 10 }}>
        {previewSummary.count} {t({ ar: "منتج", en: "products" })} | {previewSummary.categories} {t({ ar: "فئة", en: "categories" })} | {previewSummary.units} {t({ ar: "وحدة", en: "units" })}
        {showQuantity && ` | ${previewSummary.withQuantity} ${t({ ar: "منتج فيه كمية افتتاحية", en: "product(s) with an opening quantity" })}`}
      </div>

      {/* [إضافة 2026-09-19، وسِّعت 2026-09-20] جلب بيانات المنشأة المرجعية يدوياً
          (حسابات/ضرائب/وحدات/فئات معًا) — تُستخدَم بقوائم اختيار الحساب أدناه،
          ولعرض الحساب الافتراضي الفعلي، **وتُعاد استخدامها حرفيًا عند بدء الرفع
          الفعلي بلا إعادة جلب** (راجع تعليق startUpload بالهوك). */}
      <div className="qpu-toggle-row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        <button type="button" className="qpu-btn secondary" onClick={() => fetchReferenceData()} disabled={referenceDataLoading}>
          🔄 {referenceDataLoading
            ? t({ ar: "جارٍ جلب بيانات المنشأة...", en: "Fetching company data..." })
            : t({ ar: "تحديث بيانات المنشأة (حسابات/ضرائب/وحدات/فئات)", en: "Refresh company data (accounts/taxes/units/categories)" })}
        </button>
        {accountsReady && (
          <span className="qpu-hint">
            {t({ ar: `جاهزة — ${previewAccounts.length} حساب متاح للاختيار لكل منتج، وستُستخدَم مباشرة عند بدء الرفع بلا إعادة جلب`, en: `Ready — ${previewAccounts.length} account(s) available per product, reused as-is at upload start (no re-fetch)` })}
          </span>
        )}
        {!accountsReady && !referenceDataLoading && (
          <span className="qpu-hint">
            {t({ ar: "أدخل مفتاح API ثم اضغط هنا لتجهيز بيانات المنشأة مسبقاً — يسرّع بدء الرفع الفعلي ويتيح اختيار حساب مخصَّص لكل منتج", en: "Enter the API key then click here to pre-fetch company data — speeds up the actual upload start and enables a custom account choice per product" })}
          </span>
        )}
        {referenceDataError && <span className="qpu-note-box err" style={{ padding: "4px 10px", fontSize: 12 }}>⛔ {referenceDataError}</span>}
      </div>

      {/* [إضافة 2026-09-20، طلب صريح من المستخدم] بحث بالاسم (عربي/إنجليزي) أو
          الرمز أو الفئة — يُطبَّق قبل التقسيم لصفحات، ويعيد الصفحة الحالية لأولها. */}
      <div className="qpu-form-group" style={{ maxWidth: 360, marginBottom: 10 }}>
        <input
          type="text"
          placeholder={t({ ar: "🔍 بحث بالاسم أو الرمز أو الفئة...", en: "🔍 Search by name, SKU, or category..." })}
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(0); }}
        />
      </div>

      <div className="qpu-table-wrap" style={{ maxHeight: "none", overflow: "visible" }}>
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
            {pageRows.map(({ p, i }) => {
              const sellingPriceNum = parseSellingPriceNumber(p.selling_price_raw);
              const qtyNum = parseQuantityNumber(p.quantity_raw);
              return (
                <tr key={i}>
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
            {pageRows.length === 0 && (
              <tr><td colSpan={colCount} style={{ textAlign: "center", padding: 20 }} className="qpu-muted">{t({ ar: "لا توجد نتائج مطابقة للبحث", en: "No results match your search" })}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* [إضافة 2026-09-20، طلب صريح من المستخدم] تنقّل بين الصفحات (20 منتج/صفحة) */}
      <div className="qpu-action-row" style={{ marginTop: 12 }}>
        <span className="qpu-hint">
          {t({
            ar: `عرض ${filtered.length ? pageStart + 1 : 0}–${Math.min(pageStart + PAGE_SIZE, filtered.length)} من ${filtered.length}${searchQuery ? ` (من أصل ${excelData.length})` : ""}`,
            en: `Showing ${filtered.length ? pageStart + 1 : 0}–${Math.min(pageStart + PAGE_SIZE, filtered.length)} of ${filtered.length}${searchQuery ? ` (out of ${excelData.length})` : ""}`,
          })}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="qpu-btn ghost" onClick={() => goToPage(0)} disabled={safePage === 0}>{t({ ar: "الأولى", en: "First" })}</button>
          <button type="button" className="qpu-btn ghost" onClick={() => goToPage(safePage - 1)} disabled={safePage === 0}>{t({ ar: "السابقة", en: "Prev" })}</button>
          <span className="qpu-hint">{t({ ar: `صفحة ${safePage + 1} من ${totalPages}`, en: `Page ${safePage + 1} of ${totalPages}` })}</span>
          <button type="button" className="qpu-btn ghost" onClick={() => goToPage(safePage + 1)} disabled={safePage >= totalPages - 1}>{t({ ar: "التالية", en: "Next" })}</button>
          <button type="button" className="qpu-btn ghost" onClick={() => goToPage(totalPages - 1)} disabled={safePage >= totalPages - 1}>{t({ ar: "الأخيرة", en: "Last" })}</button>
        </div>
      </div>
    </div>
  );
}
