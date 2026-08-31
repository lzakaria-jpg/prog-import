import React, { useState } from 'react';
import { COLUMNS, AUX_FIELD_KEYWORDS, AUX_FIELD_LABELS } from '../engine/constants.js';
import { sampleValuesFor } from '../engine/columnShape.js';
import { getMissingRequiredAfterDerivation } from '../engine/invoiceImportMapping.js';
import ConfirmDialog from './ConfirmDialog.jsx';

/**
 * لوحة مطابقة أعمدة ملف الفواتير غير المنظم (خطوة 2) — نسخ لتصميم renderInvoiceImportMappingUI
 * الأصلي: أعمدة القالب A-V + حقول مساعدة اختيارية (_lineTotal إلخ)، مع نفس منطق التنبيه على
 * الحقول الإلزامية القابلة للاستنتاج تلقائيًا قبل التأكيد.
 */
export default function InvoiceImportMappingPanel({ headers, rawRows, guesses, refs, onConfirm, onCancel }) {
  const [mapping, setMapping] = useState({ ...guesses.mainGuesses, ...guesses.auxGuesses });
  const [pendingConfirm, setPendingConfirm] = useState(null); // {names} | null

  const setField = (key, value) => setMapping((m) => ({ ...m, [key]: value }));

  const submit = () => {
    const missingRequired = getMissingRequiredAfterDerivation(mapping, refs);
    if (missingRequired.length) {
      setPendingConfirm({ names: missingRequired.map((c) => c.name).join('، ') });
      return;
    }
    onConfirm(mapping);
  };

  return (
    <div className="qsv-panel" style={{ background: '#fbfcfd' }}>
      <table className="qsv-mapping-table">
        <tbody>
          {COLUMNS.map((col) => {
            const guess = mapping[col.key];
            const samples = guess ? sampleValuesFor(headers, rawRows, guess, 3) : [];
            return (
              <tr key={col.key}>
                <td>{col.name}{col.required && <span className="qsv-req-star"> *</span>}</td>
                <td>
                  <select value={guess || ''} onChange={(e) => setField(col.key, e.target.value)}>
                    <option value="">— لا يوجد / تجاهل —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <div className="qsv-hint">{samples.length ? 'أمثلة: ' + samples.join(' • ') : ''}</div>
                </td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={2} style={{ paddingTop: 14, color: 'var(--qsv-muted)', fontSize: 12 }}>
              — حقول اختيارية إضافية تساعد على استنتاج بعض القيم تلقائيًا —
            </td>
          </tr>
          {Object.keys(AUX_FIELD_KEYWORDS).map((key) => {
            const guess = mapping[key];
            const meta = AUX_FIELD_LABELS[key];
            return (
              <tr key={key} style={{ background: '#f8fbff' }}>
                <td>{meta.icon} {meta.label}<div className="qsv-hint">{meta.hint}</div></td>
                <td>
                  <select value={guess || ''} onChange={(e) => setField(key, e.target.value)}>
                    <option value="">— لا يوجد / تجاهل —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" className="qsv-btn" onClick={submit}>✅ تأكيد المطابقة وتعبئة الجدول</button>
        <button type="button" className="qsv-btn ghost" onClick={onCancel}>إلغاء</button>
      </div>

      <ConfirmDialog
        open={!!pendingConfirm}
        title="حقول إلزامية غير مُطابَقة"
        message={pendingConfirm ? `لم تُحدَّد مطابقة لبعض الحقول الإلزامية (${pendingConfirm.names}). المتابعة ستنتج أسطرًا بها أخطاء حاجبة يمكن تصحيحها لاحقًا في خطوة التحقق. هل تريد المتابعة؟` : ''}
        confirmLabel="متابعة" cancelLabel="رجوع"
        onConfirm={() => { setPendingConfirm(null); onConfirm(mapping); }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}
