import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../language.jsx';
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
  const { t } = useLanguage();
  const [mapping, setMapping] = useState({ ...guesses.mainGuesses, ...guesses.auxGuesses });
  const [pendingConfirm, setPendingConfirm] = useState(null); // {names} | null
  // [إصلاح] useState يُهيَّأ مرة واحدة فقط، واللوحة لا تُفرَّغ عند رفع ملف فواتير
  // ثانٍ (شرط العرض يبقى صحيحًا)، فتبقى مطابقة أعمدة الملف الأول — وهي *أسماء*
  // عناوين لا تنتمي للملف الجديد. النتيجة: كل عمود يُقرَأ فارغًا فتُرشَّح كل
  // الصفوف وتظهر "تمت تعبئة 0 سطر"، أو أسوأ: مطابقة جزئية خاطئة عند تشابه بعض
  // العناوين بين الملفين (شائع بتصدير شهري). نُزامن الحالة مع تخمينات الملف الحالي.
  useEffect(() => { setMapping({ ...guesses.mainGuesses, ...guesses.auxGuesses }); }, [guesses]);

  const setField = (key, value) => setMapping((m) => ({ ...m, [key]: value }));

  const submit = () => {
    const missingRequired = getMissingRequiredAfterDerivation(mapping, refs);
    if (missingRequired.length) {
      setPendingConfirm({ names: missingRequired.map((c) => c.name).join(t({ ar: '، ', en: ', ' })) });
      return;
    }
    onConfirm(mapping);
  };

  return (
    <div className="qsv-panel" style={{ background: 'var(--qsv-panel-tint)' }}>
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
                    <option value="">— {t({ ar: 'لا يوجد / تجاهل', en: 'None / ignore' })} —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <div className="qsv-hint">{samples.length ? t({ ar: 'أمثلة: ', en: 'Examples: ' }) + samples.join(' • ') : ''}</div>
                </td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={2} style={{ paddingTop: 14, color: 'var(--qsv-muted)', fontSize: 12 }}>
              — {t({ ar: 'حقول اختيارية إضافية تساعد على استنتاج بعض القيم تلقائيًا', en: 'Additional optional fields that help infer some values automatically' })} —
            </td>
          </tr>
          {Object.keys(AUX_FIELD_KEYWORDS).map((key) => {
            const guess = mapping[key];
            const meta = AUX_FIELD_LABELS[key];
            return (
              <tr key={key} style={{ background: 'var(--qsv-brand-bg)' }}>
                <td>{meta.icon} {meta.label}<div className="qsv-hint">{meta.hint}</div></td>
                <td>
                  <select value={guess || ''} onChange={(e) => setField(key, e.target.value)}>
                    <option value="">— {t({ ar: 'لا يوجد / تجاهل', en: 'None / ignore' })} —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" className="qsv-btn" onClick={submit}>✅ {t({ ar: 'تأكيد المطابقة وتعبئة الجدول', en: 'Confirm matching & fill the table' })}</button>
        <button type="button" className="qsv-btn ghost" onClick={onCancel}>{t({ ar: 'إلغاء', en: 'Cancel' })}</button>
      </div>

      <ConfirmDialog
        open={!!pendingConfirm}
        title={t({ ar: 'حقول إلزامية غير مُطابَقة', en: 'Required fields not matched' })}
        message={pendingConfirm ? t({
          ar: `لم تُحدَّد مطابقة لبعض الحقول الإلزامية (${pendingConfirm.names}). المتابعة ستنتج أسطرًا بها أخطاء حاجبة يمكن تصحيحها لاحقًا في خطوة التحقق. هل تريد المتابعة؟`,
          en: `No matching was set for some required fields (${pendingConfirm.names}). Continuing will produce rows with blocking errors you can fix later in the validation step. Do you want to continue?`,
        }) : ''}
        confirmLabel={t({ ar: 'متابعة', en: 'Continue' })} cancelLabel={t({ ar: 'رجوع', en: 'Back' })}
        onConfirm={() => { setPendingConfirm(null); onConfirm(mapping); }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}
