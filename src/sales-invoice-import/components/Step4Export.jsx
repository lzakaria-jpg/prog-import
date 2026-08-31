import React, { useEffect, useRef } from 'react';
import { norm } from '../engine/text.js';

// نسخ لتصميم renderFinalStep/downloadRowsAsXlsx الأصليين — عند الدخول للخطوة بلا أي خطأ حاجب
// يُولَّد الملف الكامل تلقائيًا فورًا (كما كان يحدث في الأصل عبر goStep(4) مباشرة)، وإلا تُعرض
// رسالة الأخطاء المتبقية مع خيار تحميل الفواتير الصحيحة فقط.
export default function Step4Export({ engine }) {
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
          <h3>لا يزال هناك {errCount} خطأ حاجب</h3>
          <p className="qsv-hint">رجاءً ارجع لخطوة التحقق وصحّح كل الأخطاء الحاجبة أولاً قبل توليد الملف كاملًا.</p>
          <button type="button" className="qsv-btn secondary" onClick={() => goToStep(3)}>→ رجوع للتحقق</button>
          {validInvoiceCount > 0 && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px dashed var(--qsv-border)' }}>
              <p className="qsv-hint">بدلًا من ذلك، يمكنك تحميل الفواتير <b>السليمة فقط</b> ({validInvoiceCount} فاتورة) وترك بقية الفواتير للتصحيح لاحقًا:</p>
              <button type="button" className="qsv-btn" onClick={() => exportFinal('validOnly')}>⬇️ تحميل الفواتير الصحيحة فقط ({validInvoiceCount})</button>
              {exportResult && (
                <p><a className="qsv-btn" href={exportResult.url} download={exportResult.filename}>⬇️ تحميل الملف ({exportResult.filename})</a></p>
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
        {exportBusy && (<><div className="qsv-big-icon">⏳</div><p>جارٍ توليد الملف...</p></>)}
        {!exportBusy && exportError && (<><div className="qsv-big-icon">❌</div><p>حدث خطأ أثناء توليد الملف: {exportError}</p></>)}
        {!exportBusy && !exportError && exportResult && (
          <>
            <div className="qsv-big-icon">✅</div>
            <h3>الملف جاهز تمامًا للرفع إلى قيود</h3>
            <p className="qsv-kv">عدد الفواتير: {new Set(rows.map((r) => norm(r.A))).size} — عدد الأسطر: {rows.length}</p>
            <p><a className="qsv-btn" href={exportResult.url} download={exportResult.filename}>⬇️ تحميل الملف ({exportResult.filename})</a></p>
            <p className="qsv-hint">افتح المبيعات ‹ فواتير المبيعات ‹ استيراد الفواتير في قيود، واختر هذا الملف مباشرة، ثم اضغط "استيراد الفواتير".</p>
            <button type="button" className="qsv-btn ghost" onClick={() => goToStep(3)}>→ رجوع للتحقق مرة أخرى</button>
          </>
        )}
      </div>
    </div>
  );
}
