import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../language.jsx';
import { buildSendResultsReportBlob } from '../io/sendResultsReport.js'; // [إضافة] تقرير Excel لنتائج الإرسال — راجع تعليق رأسه
import { downloadBlob } from '../../lib/downloadBlob.js';

/**
 * [إضافة] شاشة نتائج الإرسال المباشر لفواتير المبيعات عبر Qoyod API — تُفتح من
 * Step4Export.jsx فقط، بعد ضغط "إرسال عبر API". نفس فكرة شاشة نتائج الإرسال
 * الموجودة فعليًا بأداة MergeTool.jsx (تقدّم حيّ + تبويبات الكل/ناجح/فشل)، بهوية
 * بصرية qsv-* الخاصة بهذي الأداة بدل Tailwind. لا تُعدِّل أي حالة تخص المطابقة
 * أو التصدير اليدوي — تقرأ فقط ما يوفّره useSalesInvoiceImportEngine الإضافي.
 */
export default function ApiSendResultsModal({ engine, onClose }) {
  const { t } = useLanguage();
  const { apiSendBusy, apiSendResult, apiSendEntries, apiSendProgress, stopApiSend, rows } = engine;
  const [tab, setTab] = useState('all');
  const [reportBusy, setReportBusy] = useState(false);

  // [إضافة] تنزيل تقرير Excel كامل بنتائج الإرسال — نفس أعمدة الملف الجاهز
  // للرفع + عمودي حالة الإرسال/سبب الفشل، وحدود حمراء بارزة على صفوف الفواتير
  // الفاشلة. متاح بعد اكتمال الإرسال (ولو بدون أي فشل — تقرير شامل مفيد دومًا).
  const downloadReport = async () => {
    setReportBusy(true);
    try {
      const blob = await buildSendResultsReportBlob(rows, apiSendEntries, t);
      downloadBlob(blob, t({ ar: 'تقرير-نتائج-الإرسال.xlsx', en: 'send-results-report.xlsx' }));
    } finally {
      setReportBusy(false);
    }
  };

  const sentCount = apiSendResult ? apiSendResult.sent : apiSendEntries.filter((e) => e.status === 'success').length;
  const failedCount = apiSendResult ? apiSendResult.failed : apiSendEntries.filter((e) => e.status === 'error').length;
  const totalCount = apiSendResult ? apiSendResult.total : apiSendProgress.total;

  const visibleEntries = useMemo(() => {
    if (tab === 'all') return apiSendEntries;
    return apiSendEntries.filter((e) => e.status === tab);
  }, [apiSendEntries, tab]);

  return (
    <div className="qsv-modal-overlay" role="dialog" aria-modal="true" onClick={() => { if (!apiSendBusy) onClose(); }}>
      <div className="qsv-modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>
          {apiSendBusy ? '⏳ ' : apiSendResult?.fatalError ? '⛔ ' : (failedCount > 0 ? '⚠️ ' : '✅ ')}
          {t({ ar: 'الإرسال المباشر لفواتير المبيعات عبر API', en: 'Direct sales invoice send via API' })}
        </h3>

        {apiSendBusy && (
          <div className="qsv-send-progress">
            <span>{t({ ar: `جارٍ الإرسال: ${apiSendProgress.current} من ${apiSendProgress.total}`, en: `Sending: ${apiSendProgress.current} of ${apiSendProgress.total}` })}</span>
            <button type="button" className="qsv-btn danger" onClick={stopApiSend}>{t({ ar: 'إيقاف', en: 'Stop' })}</button>
          </div>
        )}

        {!apiSendBusy && apiSendResult?.fatalError && (
          <div className="qsv-note-box err" style={{ marginBottom: 12 }}>⛔ {apiSendResult.fatalError}</div>
        )}

        {!apiSendBusy && !apiSendResult?.fatalError && apiSendResult?.stoppedEarly && (
          <div className="qsv-note-box warn" style={{ marginBottom: 12 }}>
            {t({ ar: 'تم إيقاف الإرسال قبل إكمال كل الفواتير. الفواتير المتبقية لم تُرسَل — اضغط "إرسال عبر API" مرة أخرى لإرسال الباقي.', en: 'Sending was stopped before all invoices completed. Remaining invoices were not sent — press "Send via API" again to send the rest.' })}
          </div>
        )}

        <div className="qsv-modal-scroll">
          {(apiSendEntries.length > 0) && (
            <div className="qsv-send-tabs">
              <button type="button" className={`qsv-send-tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>
                <span className="qsv-n">{totalCount || apiSendEntries.length}</span>
                <span className="qsv-l">{t({ ar: 'الكل', en: 'All' })}</span>
              </button>
              <button type="button" className={`qsv-send-tab${tab === 'success' ? ' active' : ''}`} onClick={() => setTab('success')}>
                <span className="qsv-n" style={{ color: 'var(--qsv-ok)' }}>{sentCount}</span>
                <span className="qsv-l">{t({ ar: 'نجح', en: 'Success' })}</span>
              </button>
              <button type="button" className={`qsv-send-tab${tab === 'error' ? ' active' : ''}`} onClick={() => setTab('error')}>
                <span className="qsv-n" style={{ color: 'var(--qsv-err)' }}>{failedCount}</span>
                <span className="qsv-l">{t({ ar: 'فشل', en: 'Failed' })}</span>
              </button>
            </div>
          )}

          {visibleEntries.length > 0 && (
            <table className="qsv-send-table">
              <thead>
                <tr>
                  <th>{t({ ar: 'مرجع الفاتورة', en: 'Invoice ref' })}</th>
                  <th>{t({ ar: 'الحالة', en: 'Status' })}</th>
                  <th>{t({ ar: 'التفاصيل', en: 'Details' })}</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'monospace' }}>{e.ref}</td>
                    <td>
                      {e.status === 'success' && <span className="qsv-badge ok">✓ {t({ ar: 'نجح', en: 'Success' })}</span>}
                      {e.status === 'error' && <span className="qsv-badge err">✕ {t({ ar: 'فشل', en: 'Failed' })}</span>}
                    </td>
                    <td>{e.status === 'success' ? `#${e.id}${e.total ? ` — ${e.total}` : ''}` : (e.reason || '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!apiSendBusy && apiSendEntries.length === 0 && !apiSendResult?.fatalError && (
            <div className="qsv-note-box">{t({ ar: 'لا توجد نتائج بعد.', en: 'No results yet.' })}</div>
          )}
        </div>

        <div className="qsv-modal-actions" style={{ marginTop: 14 }}>
          {!apiSendBusy && apiSendResult && !apiSendResult.fatalError && (
            <button type="button" className="qsv-btn secondary" disabled={reportBusy} onClick={downloadReport}>
              ⬇️ {reportBusy ? t({ ar: 'جارٍ التجهيز...', en: 'Preparing...' }) : t({ ar: 'تحميل تقرير النتائج (Excel)', en: 'Download results report (Excel)' })}
            </button>
          )}
          <button type="button" className="qsv-btn ghost" disabled={apiSendBusy} onClick={onClose}>{t({ ar: 'إغلاق', en: 'Close' })}</button>
        </div>
      </div>
    </div>
  );
}
