import { useState } from 'react';
import { useLanguage } from '../../language.jsx';
import Note from './Note.jsx';
import ApiSendResultsModal from './ApiSendResultsModal.jsx';

/** الخطوة ٤: تصدير ملف القالب الرسمي، و/أو الإرسال المباشر عبر API */
export default function Step4Export({ eng }) {
  const { t } = useLanguage();
  const good = eng.goodRows;
  const bad = eng.badRows;
  const [showSendModal, setShowSendModal] = useState(false);
  const handleSendViaApi = () => { setShowSendModal(true); eng.pushViaApi(); };

  return (
    <section>
      <div className="qci-card">
        <h2>{t({ ar: 'تصدير ملف الاستيراد / الإرسال المباشر', en: 'Export import file / direct send' })}</h2>
        <p className="hint">
          {t({
            ar: 'التصدير يكتب داخل قالب Qoyod الرسمي (Import Customers) ابتداءً من الصف الثاني — ملف تعيد رفعه بنفسك لاحقاً بواجهة قيود. الإرسال المباشر ينشئ/يحدّث كل صف فوراً عبر API.',
            en: "Export writes into Qoyod's official template (Import Customers) starting from row 2 — a file you upload yourself later in Qoyod's UI. Direct send creates/updates each row immediately via the API.",
          })}
        </p>

        <div className={`qci-msg ${bad.length ? 'warn' : 'ok'}`}>
          <b>{eng.rows.length}</b> {t({ ar: 'صف — جاهز:', en: 'row(s) — ready:' })} <b>{good.length}</b> · {t({ ar: 'به أخطاء مانعة:', en: 'with blocking errors:' })} <b>{bad.length}</b>
          {eng.stats.pendingDecision > 0 && <> · {t({ ar: 'بانتظار قرار التكرار (لن يُرسَل عبر API حتى يُختار):', en: 'awaiting duplicate decision (will not be sent via API until chosen):' })} <b>{eng.stats.pendingDecision}</b></>}
        </div>

        <div className="qci-actions">
          <button className="qci-btn dark" disabled={!eng.rows.length} onClick={() => eng.doExport('all')}>{t({ ar: 'تحميل الملف كاملاً', en: 'Download the full file' })}</button>
          <button className="qci-btn" disabled={!good.length} onClick={() => eng.doExport('valid')}>{t({ ar: 'تحميل الصفوف السليمة فقط', en: 'Download valid rows only' })}</button>
          <button className="qci-btn ghost" disabled={!bad.length} onClick={() => eng.doExport('errors')}>{t({ ar: 'تحميل تقرير الأخطاء', en: 'Download the error report' })}</button>
          {eng.canSendViaApi && (
            <button className="qci-btn go"
              disabled={!eng.sendableRows.length || eng.apiSending} onClick={handleSendViaApi}>
              🚀 {eng.apiSending
                ? t({ ar: `جارٍ الإرسال (${eng.apiSendProgress.current}/${eng.apiSendProgress.total})...`, en: `Sending (${eng.apiSendProgress.current}/${eng.apiSendProgress.total})...` })
                : t({ ar: `إرسال ${eng.sendableRows.length} صف جاهز عبر API`, en: `Send ${eng.sendableRows.length} ready row(s) via API` })}
            </button>
          )}
        </div>
        {!eng.canSendViaApi && (
          <p className="hint" style={{ marginTop: 6 }}>
            {t({
              ar: 'الإرسال المباشر عبر API يتطلب الاتصال بحساب قيود بالخطوة الأولى أولاً.',
              en: "Direct API sending requires connecting to the Qoyod account in step 1 first.",
            })}
          </p>
        )}
        <Note note={eng.notes.export} />
        {showSendModal && <ApiSendResultsModal eng={eng} onClose={() => setShowSendModal(false)} />}
        {!showSendModal && (eng.apiSending || eng.apiSendResult) && (
          <div className="qci-btn" style={{ position: 'fixed', bottom: 20, insetInlineStart: 20, zIndex: 1001, borderRadius: 999, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 12px 32px rgba(15,23,42,.25)' }}>
            <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowSendModal(true)}>
              🚀 {eng.apiSending
                ? t({ ar: `جارٍ الإرسال: ${eng.apiSendProgress.current}/${eng.apiSendProgress.total}`, en: `Sending: ${eng.apiSendProgress.current}/${eng.apiSendProgress.total}` })
                : t({ ar: 'نتائج الإرسال', en: 'Send results' })}
              {!eng.apiSending && eng.apiSendResult?.failed > 0 && (
                <span style={{ background: 'var(--qci-err)', color: '#fff', borderRadius: 999, minWidth: 18, height: 18, fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{eng.apiSendResult.failed}</span>
              )}
            </span>
            {eng.apiSending && (
              <button type="button" onClick={eng.stopApiSend} title={t({ ar: 'إيقاف الإرسال', en: 'Stop sending' })} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.85 }}>✕</button>
            )}
          </div>
        )}

        <div className="qci-msg info">
          {t({
            ar: 'الرقم المرجعي (Ref. No.) يُكتب في ملف القالب المُصدَّر كالمعتاد، لكنه لا يُرسَل إطلاقاً عبر الإرسال المباشر — لا حقل موثَّق له بواجهة Qoyod البرمجية للعملاء/الموردين. راجع الملاحظة بخطوة الربط لتفاصيل أوسع.',
            en: "The Ref. No. is written into the exported template file as usual, but is never sent via direct send — there's no documented field for it in Qoyod's customer/vendor API. See the note on the mapping step for more.",
          })}
        </div>

        <div className="qci-scroll">
          <table className="qci-rows">
            <thead>
              <tr>{[
                { ar: 'الاسم', en: 'Name' }, { ar: 'الرقم المرجعي', en: 'Ref. No.' }, { ar: 'الحالة', en: 'Status' },
                { ar: 'الإجراء عند الإرسال', en: 'Action on send' }
              ].map((c, ci) => <th key={ci}>{t(c)}</th>)}</tr>
            </thead>
            <tbody>
              {eng.rows.map((r) => (
                <tr key={r.i} className={eng.helpers.rowErr(r) ? 'r-err' : eng.helpers.rowWarn(r) ? 'r-warn' : ''}>
                  <td>{r.name || '—'}</td>
                  <td>{r.ref || '—'}</td>
                  <td><span className={`badge ${eng.helpers.rowErr(r) ? 'b-err' : 'b-ok'}`}>{eng.helpers.rowErr(r) ? t({ ar: 'مستبعد', en: 'Excluded' }) : t({ ar: 'جاهز', en: 'Ready' })}</span></td>
                  <td>{r.action === 'update' ? t({ ar: 'تحديث', en: 'Update' }) : r.action === 'skip' ? t({ ar: 'تجاوز', en: 'Skip' }) : r.action === null || r.action === undefined ? t({ ar: 'بانتظار قرار', en: 'Awaiting decision' }) : t({ ar: 'إنشاء جديد', en: 'Create' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
