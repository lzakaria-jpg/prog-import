import React, { useEffect, useRef } from 'react';
import { useLanguage } from '../../language.jsx';
import { norm } from '../engine/text.js';

// نسخ لتصميم renderFinalStep/downloadRowsAsXlsx الأصليين — عند الدخول للخطوة بلا أي خطأ حاجب
// يُولَّد الملف الكامل تلقائيًا فورًا (كما كان يحدث في الأصل عبر goStep(4) مباشرة)، وإلا تُعرض
// رسالة الأخطاء المتبقية مع خيار تحميل الفواتير الصحيحة فقط.
export default function Step4Export({ engine }) {
  const { t } = useLanguage();
  const { rows, issues, validOnlyRows, exportBusy, exportResult, exportError, exportFinal, goToStep } = engine;
  const errCount = issues.list.filter((i) => i.sev === 'err').length;
  const autoTriggered = useRef(false);

  useEffect(() => {
    if (errCount === 0 && !autoTriggered.current && !exportResult && !exportBusy) {
      autoTriggered.current = true;
      exportFinal('all');
    }
  }, [errCount, exportResult, exportBusy, exportFinal]);

  if (errCount > 0) {
    const validInvoiceCount = new Set(validOnlyRows.map((r) => norm(r.A))).size;
    return (
      <div className="qsv-panel">
        <div className="qsv-final-box">
          <div className="qsv-big-icon">🚫</div>
          <h3>{t({ ar: `لا يزال هناك ${errCount} خطأ حاجب`, en: `There ${errCount === 1 ? 'is' : 'are'} still ${errCount} blocking error(s)` })}</h3>
          <p className="qsv-hint">{t({ ar: 'رجاءً ارجع لخطوة التحقق وصحّح كل الأخطاء الحاجبة أولاً قبل توليد الملف كاملًا.', en: 'Please go back to the validation step and fix all blocking errors first before generating the full file.' })}</p>
          <button type="button" className="qsv-btn secondary" onClick={() => goToStep(3)}>→ {t({ ar: 'رجوع للتحقق', en: 'Back to validation' })}</button>
          {validInvoiceCount > 0 && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px dashed var(--qsv-border)' }}>
              <p className="qsv-hint">{t({ ar: 'بدلًا من ذلك، يمكنك تحميل الفواتير', en: 'Instead, you can download' })} <b>{t({ ar: 'السليمة فقط', en: 'only the valid' })}</b> {t({ ar: `(${validInvoiceCount} فاتورة) وترك بقية الفواتير للتصحيح لاحقًا:`, en: `invoices (${validInvoiceCount}) and leave the rest for correction later:` })}</p>
              <button type="button" className="qsv-btn" onClick={() => exportFinal('validOnly')}>⬇️ {t({ ar: `تحميل الفواتير الصحيحة فقط (${validInvoiceCount})`, en: `Download valid invoices only (${validInvoiceCount})` })}</button>
              {exportResult && (
                <p><a className="qsv-btn" href={exportResult.url} download={exportResult.filename}>⬇️ {t({ ar: `تحميل الملف (${exportResult.filename})`, en: `Download the file (${exportResult.filename})` })}</a></p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="qsv-panel">
      <div className="qsv-final-box">
        {exportBusy && (<><div className="qsv-big-icon">⏳</div><p>{t({ ar: 'جارٍ توليد الملف...', en: 'Generating the file...' })}</p></>)}
        {!exportBusy && exportError && (<><div className="qsv-big-icon">❌</div><p>{t({ ar: `حدث خطأ أثناء توليد الملف: ${exportError}`, en: `An error occurred while generating the file: ${exportError}` })}</p></>)}
        {!exportBusy && !exportError && exportResult && (
          <>
            <div className="qsv-big-icon">✅</div>
            <h3>{t({ ar: 'الملف جاهز تمامًا للرفع إلى قيود', en: 'The file is fully ready to upload to Qoyod' })}</h3>
            <p className="qsv-kv">{t({ ar: `عدد الفواتير: ${new Set(rows.map((r) => norm(r.A))).size} — عدد الأسطر: ${rows.length}`, en: `Invoice count: ${new Set(rows.map((r) => norm(r.A))).size} — Row count: ${rows.length}` })}</p>
            <p><a className="qsv-btn" href={exportResult.url} download={exportResult.filename}>⬇️ {t({ ar: `تحميل الملف (${exportResult.filename})`, en: `Download the file (${exportResult.filename})` })}</a></p>
            <p className="qsv-hint">{t({ ar: 'افتح المبيعات ‹ فواتير المبيعات ‹ استيراد الفواتير في قيود، واختر هذا الملف مباشرة، ثم اضغط "استيراد الفواتير".', en: 'Open Sales ‹ Sales Invoices ‹ Import Invoices in Qoyod, choose this file directly, then click "Import Invoices".' })}</p>
            <button type="button" className="qsv-btn ghost" onClick={() => goToStep(3)}>→ {t({ ar: 'رجوع للتحقق مرة أخرى', en: 'Back to validation again' })}</button>
          </>
        )}
      </div>
    </div>
  );
}
