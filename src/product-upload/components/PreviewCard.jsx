import React from "react";
import { useTableVirtualization } from "../../lib/useTableVirtualization.js";

const COL_COUNT = 9;

/**
 * بطاقة معاينة البيانات — منقولة من showPreview() الأصلية (سطر 370-406).
 * "Show all rows, no cap" بالأصل محفوظ حرفياً (كل الصفوف تُعرض)، فقط طريقة
 * العرض تستخدم نافذة تمرير (useTableVirtualization) بدل بناء 2000+ عنصر DOM
 * دفعة واحدة — نفس أسلوب الجداول الكبيرة الأخرى بالمشروع (لا تغيير بالمحتوى).
 */
export default function PreviewCard({ eng }) {
  const { excelData, previewSummary } = eng;
  const v = useTableVirtualization(excelData.length);

  if (!excelData.length) return null;

  const rowsToRender = v.shouldVirtualize ? excelData.slice(v.startIndex, v.endIndex) : excelData;
  const offset = v.shouldVirtualize ? v.startIndex : 0;

  return (
    <div className="qpu-panel">
      <div className="qpu-panel-title">معاينة البيانات</div>
      <div className="qpu-hint" style={{ marginBottom: 10 }}>
        {previewSummary.count} منتج | {previewSummary.categories} فئة | {previewSummary.units} وحدة
      </div>
      <div className="qpu-table-wrap" ref={v.scrollRef}>
        <table>
          <thead>
            <tr>
              <th>#</th><th>الرمز</th><th>الاسم</th><th>الفئة</th><th>الوحدة</th>
              <th>مخزون</th><th>التكلفة</th><th>حساب الإيراد</th><th>حساب المصروف</th>
            </tr>
          </thead>
          <tbody>
            {v.shouldVirtualize && v.topSpacerHeight > 0 && (
              <tr><td colSpan={COL_COUNT} style={{ height: v.topSpacerHeight, padding: 0, border: "none" }} /></tr>
            )}
            {rowsToRender.map((p, idx) => {
              const i = offset + idx;
              return (
                <tr key={i} ref={idx === 0 ? v.measuredRowRef : undefined}>
                  <td>{i + 1}</td>
                  <td>{p.sku || "-"}</td>
                  <td>{p.name}</td>
                  <td>{p.category ? <span className="qpu-badge blue">{p.category}</span> : <span className="qpu-muted">-</span>}</td>
                  <td>{p.unit || "-"}</td>
                  <td>{p.is_inventory ? <span className="qpu-badge green">نعم</span> : <span className="qpu-badge yellow">لا</span>}</td>
                  <td>{p.cost || "-"}</td>
                  <td>{p.revenue_account_name || <span className="qpu-muted">افتراضي 4101</span>}</td>
                  <td>{p.expense_account_name || <span className="qpu-muted">افتراضي 5101</span>}</td>
                </tr>
              );
            })}
            {v.shouldVirtualize && v.bottomSpacerHeight > 0 && (
              <tr><td colSpan={COL_COUNT} style={{ height: v.bottomSpacerHeight, padding: 0, border: "none" }} /></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
