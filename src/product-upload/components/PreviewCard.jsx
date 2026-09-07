import React from "react";
import { useTableVirtualization } from "../../lib/useTableVirtualization.js";
import { parseSellingPriceNumber, parseQuantityNumber } from "../engine/parsing.js";

const BASE_COL_COUNT = 9;

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
export default function PreviewCard({ eng }) {
  const { excelData, previewSummary } = eng;
  const v = useTableVirtualization(excelData.length);

  if (!excelData.length) return null;

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
      <div className="qpu-panel-title">معاينة البيانات</div>
      <div className="qpu-hint" style={{ marginBottom: 10 }}>
        {previewSummary.count} منتج | {previewSummary.categories} فئة | {previewSummary.units} وحدة
        {showQuantity && ` | ${previewSummary.withQuantity} منتج فيه كمية افتتاحية`}
      </div>
      <div className="qpu-table-wrap" ref={v.scrollRef}>
        <table>
          <thead>
            <tr>
              <th>#</th><th>الرمز</th><th>الاسم</th>
              {showNameEn && <th>الاسم (إنجليزي)</th>}
              {showDescription && <th>الوصف</th>}
              <th>الفئة</th><th>الوحدة</th>
              <th>مخزون</th><th>التكلفة</th>
              {showSellingPrice && <th>سعر البيع</th>}
              {showBarcode && <th>الباركود</th>}
              {showQuantity && <th>الكمية</th>}
              {showLocation && <th>الموقع</th>}
              <th>حساب الإيراد</th><th>حساب المصروف</th>
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
                  <td>{p.is_inventory ? <span className="qpu-badge green">نعم</span> : <span className="qpu-badge yellow">لا</span>}</td>
                  <td>{p.cost || "-"}</td>
                  {showSellingPrice && <td>{sellingPriceNum !== null ? sellingPriceNum : <span className="qpu-muted">-</span>}</td>}
                  {showBarcode && <td>{p.barcode || <span className="qpu-muted">-</span>}</td>}
                  {showQuantity && <td>{qtyNum !== null ? qtyNum : <span className="qpu-muted">-</span>}</td>}
                  {showLocation && <td>{p.location || <span className="qpu-muted">-</span>}</td>}
                  <td>{p.revenue_account_name || <span className="qpu-muted">افتراضي 4101</span>}</td>
                  <td>{p.expense_account_name || <span className="qpu-muted">افتراضي 5101</span>}</td>
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
