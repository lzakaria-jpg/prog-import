import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../language.jsx';
import { norm } from '../engine/text.js';
import ApiSendResultsModal from './ApiSendResultsModal.jsx'; // [إضافة] إرسال مباشر عبر API — راجع تعليق رأس qoyodSalesInvoicePush.js

// [إضافة] استُخرج قسم "إرسال مباشر عبر API" لمكوّن مستقل لأنه صار يُعرض بمكانين:
// بعد نجاح توليد الملف اليدوي (كخيار إضافي)، أو وحده مباشرة لو لا يوجد قالب
// أصلًا (لا ملف يدوي ممكن بلا قالب — راجع تعليق useEffect بالأسفل). بلا أي
// تغيير على منطق الإرسال نفسه (sendInvoicesViaApi بالهوك يبقى كما هو).
function ApiSendSection({ engine, invoiceCount, standalone }) {
  const { t } = useLanguage();
  const { apiKey } = engine;
  const [apiKeyInput, setApiKeyInput] = useState(apiKey || '');
  const [sendStatus, setSendStatus] = useState('Draft');
  const [showSendModal, setShowSendModal] = useState(false);

  return (
    <div style={standalone ? undefined : { marginTop: 26, paddingTop: 20, borderTop: '1px dashed var(--qsv-border)', textAlign: 'right' }}>
      <h3 style={{ marginTop: 0 }}>🔌 {standalone
        ? t({ ar: 'أرسل الفواتير مباشرة عبر API', en: 'Send the invoices directly via API' })
        : t({ ar: 'أو أرسل الفواتير مباشرة عبر API', en: 'Or send the invoices directly via API' })}</h3>
      <p className="qsv-hint">
        {t({
          ar: `سيتم إنشاء ${invoiceCount} فاتورة مباشرة بمنشأة العميل الحقيقية بقيود. طريقة الدفع (عمود H) لا تُرسَل (غير مدعومة بإنشاء الفاتورة عبر API). الفواتير مستقلة عن بعضها — فشل فاتورة واحدة لا يوقف إرسال الباقي.`,
          en: `${invoiceCount} invoice(s) will be created directly on the client's real Qoyod company. Payment method (column H) is not sent (unsupported by invoice creation via API). Invoices are independent — one failing does not stop the rest.`,
        })}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="password"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder="API-KEY"
          style={{ flex: '1 1 220px', minWidth: 200 }}
        />
        <select value={sendStatus} onChange={(e) => setSendStatus(e.target.value)} style={{ width: 140 }}>
          <option value="Draft">{t({ ar: 'مسودة (Draft)', en: 'Draft' })}</option>
          <option value="Approved">{t({ ar: 'معتمدة (Approved)', en: 'Approved' })}</option>
        </select>
        <button
          type="button"
          className="qsv-btn"
          disabled={!apiKeyInput.trim()}
          onClick={() => { setShowSendModal(true); engine.sendInvoicesViaApi(apiKeyInput.trim(), { status: sendStatus }); }}
        >
          📤 {t({ ar: 'إرسال عبر API', en: 'Send via API' })}
        </button>
      </div>
      {showSendModal && <ApiSendResultsModal engine={engine} onClose={() => setShowSendModal(false)} />}
    </div>
  );
}

// نسخ لتصميم renderFinalStep/downloadRowsAsXlsx الأصليين — عند الدخول للخطوة بلا أي خطأ حاجب
// يُولَّد الملف الكامل تلقائيًا فورًا (كما كان يحدث في الأصل عبر goStep(4) مباشرة)، وإلا تُعرض
// رسالة الأخطاء المتبقية مع خيار تحميل الفواتير الصحيحة فقط.
export default function Step4Export({ engine }) {
  const { t } = useLanguage();
  const { rows, issues, validOnlyRows, exportBusy, exportResult, exportError, exportFinal, goToStep, template } = engine;
  const errCount = issues.list.filter((i) => i.sev === 'err').length;
  const autoTriggered = useRef(false);
  const invoiceCount = new Set(rows.map((r) => norm(r.A))).size;

  // [إضافة] توليد الملف اليدوي (exportFinal) يحتاج قالب قيود فعليًا مرفوعًا —
  // generateFinalXlsx يتلاعب ببنية XML الحقيقية لملف القالب نفسه (zip/sheet2Xml)،
  // فبلا قالب لا يوجد ما يُبنى عليه إطلاقًا. لو المستخدم تابع بلا قالب (المرجعيات
  // مجلوبة عبر API — راجع readyForStep2 بالهوك)، لا نحاول توليد ملف يدوي هنا
  // إطلاقًا؛ الإرسال المباشر عبر API فقط هو المسار المتاح.
  useEffect(() => {
    if (errCount === 0 && template.loaded && !autoTriggered.current && !exportResult && !exportBusy) {
      autoTriggered.current = true;
      exportFinal('all');
    }
  }, [errCount, template.loaded, exportResult, exportBusy, exportFinal]);

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

  // [إضافة] بلا قالب (المرجعيات مجلوبة عبر API فقط)، لا ملف يدوي يُبنى إطلاقًا —
  // الإرسال المباشر عبر API هو المسار الوحيد المتاح، فنعرضه مباشرة بلا انتظار
  // exportFinal (الذي لن يُستدعى أصلًا هنا — راجع useEffect أعلاه).
  if (!template.loaded) {
    return (
      <div className="qsv-panel">
        <div className="qsv-final-box">
          <div className="qsv-big-icon">🔌</div>
          <h3>{t({ ar: 'لا يوجد قالب قيود مرفوع — الإرسال المباشر عبر API فقط', en: 'No Qoyod template uploaded — direct API send only' })}</h3>
          <p className="qsv-hint">{t({ ar: 'بما إنك جلبت المرجعيات عبر API بلا رفع قالب، تنزيل الملف اليدوي غير متاح (يحتاج قالبًا حقيقيًا مرفوعًا). أرسل الفواتير مباشرة بالأسفل.', en: "Since you fetched the references via API without uploading a template, the manual file download isn't available (it needs a real uploaded template). Send the invoices directly below." })}</p>
          <ApiSendSection engine={engine} invoiceCount={invoiceCount} standalone />
          <button type="button" className="qsv-btn ghost" style={{ marginTop: 18 }} onClick={() => goToStep(3)}>→ {t({ ar: 'رجوع للتحقق مرة أخرى', en: 'Back to validation again' })}</button>
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

            {/* [إضافة] خيار إرسال مباشر عبر API — بديل إضافي لتنزيل الملف أعلاه، لا يستبدله */}
            <ApiSendSection engine={engine} invoiceCount={invoiceCount} />

            <button type="button" className="qsv-btn ghost" style={{ marginTop: 18 }} onClick={() => goToStep(3)}>→ {t({ ar: 'رجوع للتحقق مرة أخرى', en: 'Back to validation again' })}</button>
          </>
        )}
      </div>
    </div>
  );
}
