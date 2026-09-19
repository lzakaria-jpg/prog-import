import React from "react";
import { useLanguage } from "../../language.jsx";

/**
 * [إضافة 2026-09-19، طلب صريح من المستخدم] شريط مطابقة أعمدة ملف العميل —
 * سطر قوائم منسدلة فوق عيّنة من صفوف الملف الخام، تتيح للمستخدم إعادة تعيين
 * أي عمود لحقل منطقي (الاسم/الرمز/حالة التخزين/حساب الإيراد...) أو تجاهله،
 * بدل الاعتماد كلياً على الاكتشاف التلقائي (detectColumns) الذي قد يفوت عمود
 * بعنوان غير متوقَّع (مثال حقيقي أدّى لبلاغ: عمود "مخزون" لم يكن يُطابَق).
 * تغيير أي قائمة يُعيد بناء excelData فوراً (baseExcelData بالهوك) — بلا أي
 * حاجة لإعادة رفع الملف.
 */
export default function ColumnMappingCard({ eng }) {
  const { t } = useLanguage();
  const { mappingHeaders, mappingPreviewRows, colsMap, assignColumn, ignoreColumn, mappableFields } = eng;

  if (!mappingHeaders.length || !colsMap) return null;

  // فهرس عمود خام -> مفتاح الحقل المُعيَّن له حالياً (لعرضه بالقائمة المنسدلة)
  const assignedField = {};
  Object.keys(colsMap).forEach((k) => { if (colsMap[k] >= 0) assignedField[colsMap[k]] = k; });

  return (
    <div className="qpu-panel">
      <div className="qpu-panel-title">{t({ ar: "مطابقة أعمدة الملف", en: "Column mapping" })}</div>
      <div className="qpu-hint" style={{ marginBottom: 10 }}>
        {t({
          ar: "اختر من كل قائمة نوع العمود المقابل بملف العميل، أو اتركه \"تجاهل\" — يظهر أسفل كل قائمة عنوان العمود كما ورد بالملف وعيّنة من قيمه.",
          en: "For each column, choose its matching field type, or leave it \"Ignore\" — the original header and a sample of its values appear below each dropdown.",
        })}
      </div>
      <div className="qpu-table-wrap qpu-map-wrap">
        <table>
          <thead>
            <tr>
              {mappingHeaders.map((h, i) => {
                const fieldKey = assignedField[i] || "";
                return (
                  <th key={i} className={fieldKey ? "qpu-map-assigned" : ""}>
                    <select
                      className="qpu-map-select"
                      value={fieldKey}
                      onChange={(e) => (e.target.value === "" ? ignoreColumn(i) : assignColumn(e.target.value, i))}
                    >
                      <option value="">— {t({ ar: "تجاهل", en: "Ignore" })} —</option>
                      {mappableFields.map(([key, label, required, labelEn]) => {
                        const elsewhere = colsMap[key] >= 0 && colsMap[key] !== i;
                        return (
                          <option key={key} value={key}>
                            {t({ ar: label, en: labelEn })}{required ? " *" : ""}{elsewhere ? " ↩" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <div className="qpu-map-orig" title={String(h ?? "")}>{String(h ?? "") || "—"}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {mappingPreviewRows.map((r, ri) => (
              <tr key={ri}>
                {mappingHeaders.map((_, i) => (
                  <td key={i} className={assignedField[i] ? "c-assigned" : ""}>{String((r || [])[i] ?? "").slice(0, 40)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
