import React, { useState } from 'react';

const FIELD_LABEL = { C: 'العميل', N: 'المنتج' };

// نسخ لتصميم renderAmbiguityResolutionUI الأصلي — قائمة تفاعلية لحسم أسماء عملاء/منتجات مكررة.
export default function AmbiguityPanel({ ambiguities, onApply }) {
  const [choices, setChoices] = useState({});
  if (!ambiguities.length) return null;

  return (
    <div className="qsv-panel qsv-ambiguity-box">
      <h3 style={{ marginTop: 0 }}>⚠️ يوجد أسماء مكررة تحتاج تحديدًا يدويًا ({ambiguities.length})</h3>
      <p className="qsv-hint">وُجد أكثر من تطابق بنفس الاسم — رجاءً اختر الصحيح لكل سطر:</p>
      <table className="qsv-mapping-table">
        <tbody>
          {ambiguities.map((a, i) => (
            <tr key={i}>
              <td>{FIELD_LABEL[a.field]}: "{a.typedName}"</td>
              <td>
                <select value={choices[i] || ''} onChange={(e) => setChoices((c) => ({ ...c, [i]: e.target.value }))}>
                  <option value="">— اختر —</option>
                  {a.candidates.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button" className="qsv-btn" style={{ marginTop: 10 }}
        onClick={() => onApply(ambiguities.map((a, i) => ({ rowId: a.rowId, field: a.field, value: choices[i] || '' })))}
      >
        ✅ تطبيق الاختيارات
      </button>
    </div>
  );
}
