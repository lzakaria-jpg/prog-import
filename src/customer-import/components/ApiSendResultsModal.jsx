import { useMemo, useState } from 'react';
import { useLanguage } from '../../language.jsx';

/** شاشة نتائج الإرسال المباشر للعملاء عبر Qoyod API — تُفتح من Step4Export.jsx فقط */
export default function ApiSendResultsModal({ eng, onClose }) {
  const { t } = useLanguage();
  const { apiSending, apiSendResult, apiSendProgress, stopApiSend, downloadApiSendResults } = eng;
  const [tab, setTab] = useState('all');

  const entries = apiSendResult?.entries || [];
  const sentCount = apiSendResult ? apiSendResult.sent : entries.filter((e) => e.status === 'success').length;
  const failedCount = apiSendResult ? apiSendResult.failed : entries.filter((e) => e.status === 'error').length;
  const totalCount = apiSendResult ? apiSendResult.total : apiSendProgress.total;

  const visibleEntries = useMemo(() => {
    if (tab === 'all') return entries;
    return entries.filter((e) => e.status === tab);
  }, [entries, tab]);

  return (
    <div className="qci-modal-overlay" role="dialog" aria-modal="true" onClick={() => { if (!apiSending) onClose(); }}>
      <div className="qci-modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>
          {apiSending ? '⏳ ' : apiSendResult?.fatalError ? '⛔ ' : (failedCount > 0 ? '⚠️ ' : '✅ ')}
          {t({ ar: 'الإرسال المباشر للعملاء عبر API', en: 'Direct customer send via API' })}
        </h3>

        {apiSending && (
          <div className="qci-send-progress">
            <span>{t({ ar: `جارٍ الإرسال: ${apiSendProgress.current} من ${apiSendProgress.total}`, en: `Sending: ${apiSendProgress.current} of ${apiSendProgress.total}` })}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="qci-btn ghost" onClick={onClose} title={t({ ar: 'تصغير — الإرسال يستمر بالخلفية', en: 'Minimize — sending continues in the background' })}>
                − {t({ ar: 'تصغير', en: 'Minimize' })}
              </button>
              <button type="button" className="qci-btn danger" onClick={stopApiSend}>{t({ ar: 'إيقاف', en: 'Stop' })}</button>
            </div>
          </div>
        )}

        {!apiSending && apiSendResult?.fatalError && (
          <div className="qci-msg err" style={{ marginBottom: 12 }}>⛔ {apiSendResult.fatalError}</div>
        )}

        {!apiSending && !apiSendResult?.fatalError && apiSendResult?.stoppedEarly && (
          <div className="qci-msg warn" style={{ marginBottom: 12 }}>
            {t({ ar: 'تم إيقاف الإرسال قبل إكمال كل الصفوف. الصفوف المتبقية لم تُرسَل — اضغط "إرسال عبر API" مرة أخرى لإرسال الباقي.', en: 'Sending was stopped before all rows completed. Remaining rows were not sent — press "Send via API" again to send the rest.' })}
          </div>
        )}

        <div className="qci-modal-scroll">
          {entries.length > 0 && (
            <div className="qci-send-tabs">
              <button type="button" className={`qci-send-tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>
                <span className="n">{totalCount || entries.length}</span>
                <span className="l">{t({ ar: 'الكل', en: 'All' })}</span>
              </button>
              <button type="button" className={`qci-send-tab${tab === 'success' ? ' active' : ''}`} onClick={() => setTab('success')}>
                <span className="n" style={{ color: 'var(--qci-ok)' }}>{sentCount}</span>
                <span className="l">{t({ ar: 'نجح', en: 'Success' })}</span>
              </button>
              <button type="button" className={`qci-send-tab${tab === 'error' ? ' active' : ''}`} onClick={() => setTab('error')}>
                <span className="n" style={{ color: 'var(--qci-err)' }}>{failedCount}</span>
                <span className="l">{t({ ar: 'فشل', en: 'Failed' })}</span>
              </button>
            </div>
          )}

          {visibleEntries.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>{t({ ar: 'الاسم', en: 'Name' })}</th>
                  <th>{t({ ar: 'الحالة', en: 'Status' })}</th>
                  <th>{t({ ar: 'التفاصيل', en: 'Details' })}</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((e, i) => (
                  <tr key={i}>
                    <td className="mono">{e.ref}</td>
                    <td>
                      {e.status === 'success' && <span className="badge b-ok">✓ {t({ ar: 'نجح', en: 'Success' })}</span>}
                      {e.status === 'error' && <span className="badge b-err">✕ {t({ ar: 'فشل', en: 'Failed' })}</span>}
                    </td>
                    <td>{e.status === 'success' ? `#${e.id}${e.action === 'update' ? ` (${t({ ar: 'تحديث', en: 'update' })})` : ''}` : (e.reason || '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!apiSending && entries.length === 0 && !apiSendResult?.fatalError && (
            <div className="qci-msg">{t({ ar: 'لا توجد نتائج بعد.', en: 'No results yet.' })}</div>
          )}
        </div>

        <div className="qci-modal-actions">
          {!apiSending && apiSendResult && !apiSendResult.fatalError && (
            <button type="button" className="qci-btn ghost" onClick={downloadApiSendResults}>
              ⬇️ {t({ ar: 'تحميل تقرير النتائج (Excel)', en: 'Download results report (Excel)' })}
            </button>
          )}
          <button type="button" className="qci-btn ghost" disabled={apiSending} onClick={onClose}>{t({ ar: 'إغلاق', en: 'Close' })}</button>
        </div>
      </div>
    </div>
  );
}
