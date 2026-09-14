import { useMemo, useState } from 'react';
import { useLanguage } from '../../language.jsx';
import Note from './Note.jsx';
import { fmtDate, norm } from '../lib/text.js';
import { buildVendorIndex } from '../lib/matching.js';
import { useTableVirtualization } from '../../lib/useTableVirtualization.js';
import ApiSendResultsModal from './ApiSendResultsModal.jsx';

/** الخطوة ٤: إخراج ملف الاستيراد */
export default function Step4Export({ eng }) {
  const { t } = useLanguage();
  const gs = eng.groups;
  const good = gs.filter((g) => !g.bad);
  const bad = gs.filter((g) => g.bad);
  // [إضافة] إرسال مباشر عبر API — راجع تعليق رأس lib/billsPush.js للحمولة
  // الكاملة وأسباب كل قرار. متاح فقط لو catalogSource==='api' (eng.canSendViaApi)
  // — معرّفات المورد/المنتج/الضريبة/الموقع الحقيقية غير متوفرة إطلاقاً حين
  // catalog مصدرها رفع قوائم يدوية.
  const [showSendModal, setShowSendModal] = useState(false);
  const handleSendViaApi = () => { setShowSendModal(true); eng.pushViaApi(); };
  const vendorIdx = useMemo(() => buildVendorIndex(eng.catalog.vendors), [eng.catalog.vendors]);
  const v = useTableVirtualization(gs.length);
  const visibleGroups = v.shouldVirtualize ? gs.slice(v.startIndex, v.endIndex) : gs;

  return (
    <section>
      <div className="qbi-card">
        <h2>{t({ ar: 'إخراج ملف الاستيراد', en: 'Export the import file' })}</h2>
        <p className="hint">
          {t({
            ar: 'تُكتب البيانات داخل القالب المرفوع نفسه ابتداءً من الصف الثالث. مرجع الفاتورة يتكرر في كل بند، وبقية بيانات الرأس تُكتب في الصف الأول من كل فاتورة فقط.',
            en: 'The data is written into the uploaded template itself starting from the third row. The invoice reference repeats on every item, while the rest of the header data is written only on the first row of each invoice.',
          })}
        </p>

        <div className={`qbi-msg ${bad.length ? 'warn' : 'ok'}`}>
          <b>{gs.length}</b> {t({ ar: 'فاتورة — جاهزة للاستيراد:', en: 'invoice(s) — ready for import:' })} <b>{good.length}</b> · {t({ ar: 'بها أخطاء مانعة:', en: 'with blocking errors:' })} <b>{bad.length}</b>.
        </div>

        <div className="qbi-actions">
          <button className="qbi-btn dark" disabled={!gs.length} onClick={() => eng.doExport('all')}>{t({ ar: 'تحميل الملف كاملاً', en: 'Download the full file' })}</button>
          <button className="qbi-btn" disabled={!good.length} onClick={() => eng.doExport('valid')}>{t({ ar: 'تحميل الفواتير الصحيحة فقط', en: 'Download valid invoices only' })}</button>
          <button className="qbi-btn ghost" disabled={!bad.length} onClick={() => eng.doExport('errors')}>{t({ ar: 'تحميل تقرير الأخطاء', en: 'Download the error report' })}</button>
          {eng.canSendViaApi && (
            <button className="qbi-btn" style={{ background: 'var(--qbi-ok)', borderColor: 'var(--qbi-ok)' }}
              disabled={!eng.sendableGroups.length || eng.apiSending} onClick={handleSendViaApi}>
              🚀 {eng.apiSending
                ? t({ ar: `جارٍ الإرسال (${eng.apiSendProgress.current}/${eng.apiSendProgress.total})...`, en: `Sending (${eng.apiSendProgress.current}/${eng.apiSendProgress.total})...` })
                : t({ ar: `إرسال ${eng.sendableGroups.length} فاتورة سليمة عبر API`, en: `Send ${eng.sendableGroups.length} valid bill(s) via API` })}
            </button>
          )}
        </div>
        {!eng.canSendViaApi && (
          <p className="hint" style={{ marginTop: 6 }}>
            {t({
              ar: 'الإرسال المباشر عبر API يتطلب جلب بيانات المنشأة عبر الاتصال المباشر بالخطوة ١ (لا رفع قوائم يدوية) — معرّفات المورد/المنتج/الضريبة/الموقع الحقيقية غير متوفرة إلا بهذا المسار.',
              en: 'Direct API sending requires fetching the account data via the live connection in step 1 (not manual list uploads) — real vendor/product/tax/location IDs are only available through that path.',
            })}
          </p>
        )}
        <Note note={eng.notes.export} />
        {showSendModal && <ApiSendResultsModal eng={eng} onClose={() => setShowSendModal(false)} />}
        {/* [إضافة 2026-09-14] راجع نفس الإصلاح بباقي الأدوات — أيقونة عائمة
            للرجوع للنافذة (أو مراقبة التقدّم) بعد تصغيرها بلا إبقاء الصفحة مفتوحة. */}
        {!showSendModal && (eng.apiSending || eng.apiSendResult) && (
          <div className="qbi-btn" style={{ position: 'fixed', bottom: 20, insetInlineStart: 20, zIndex: 1001, borderRadius: 999, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 12px 32px rgba(15,23,42,.25)' }}>
            <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowSendModal(true)}>
              🚀 {eng.apiSending
                ? t({ ar: `جارٍ الإرسال: ${eng.apiSendProgress.current}/${eng.apiSendProgress.total}`, en: `Sending: ${eng.apiSendProgress.current}/${eng.apiSendProgress.total}` })
                : t({ ar: 'نتائج الإرسال', en: 'Send results' })}
              {!eng.apiSending && eng.apiSendResult?.failed > 0 && (
                <span style={{ background: 'var(--qbi-err)', color: '#fff', borderRadius: 999, minWidth: 18, height: 18, fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{eng.apiSendResult.failed}</span>
              )}
            </span>
            {eng.apiSending && (
              <button type="button" onClick={eng.stopApiSend} title={t({ ar: 'إيقاف الإرسال', en: 'Stop sending' })} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.85 }}>✕</button>
            )}
          </div>
        )}

        <div className={`qbi-msg ${eng.templateName ? 'info' : 'warn'}`}>
          {eng.templateName
            ? <>{t({ ar: 'ستُكتب البيانات داخل القالب المرفوع «', en: 'The data will be written into the uploaded template "' })}<b>{eng.templateName}</b>{t({ ar: '» مع بقاء التنسيقات والقوائم المنسدلة والورقة المخفية كما هي.', en: '" while its formatting, dropdown lists, and hidden sheet stay as they are.' })}</>
            : <>{t({ ar: 'لم يُرفع قالب معتمد، فسيُبنى ملف جديد بنفس بنية الأعمدة. للحصول على القالب الأصلي بقوائمه، ارفعه في الخطوة الأولى.', en: 'No approved template was uploaded, so a new file will be built with the same column structure. To get the original template with its lists, upload it in the first step.' })}</>}
        </div>

        <div className="qbi-msg warn">
          {t({
            ar: 'قيود يرفض ملف الاستيراد كاملاً إذا احتوى صفاً واحداً خاطئاً. لذلك «الفواتير الصحيحة فقط» يستبعد الفاتورة بأكملها إذا كان أي بند فيها خاطئاً، لا الصف وحده.',
            en: 'Qoyod rejects the entire import file if it contains even one faulty row. So "valid invoices only" excludes the whole invoice if any of its items is faulty, not just the row.',
          })}
        </div>

        <div className="qbi-scroll" ref={v.scrollRef}>
          <table className="qbi-rows">
            <thead>
              <tr>{[
                { ar: 'مرجع الفاتورة', en: 'Invoice ref' }, { ar: 'المورد', en: 'Vendor' }, { ar: 'التاريخ', en: 'Date' },
                { ar: 'عدد البنود', en: 'Item count' }, { ar: 'الإجمالي قبل الضريبة', en: 'Total before tax' }, { ar: 'الحالة', en: 'Status' }
              ].map((c, ci) => <th key={ci}>{t(c)}</th>)}</tr>
            </thead>
            <tbody>
              {v.shouldVirtualize && v.topSpacerHeight > 0 && (
                <tr aria-hidden="true"><td colSpan={6} style={{ height: v.topSpacerHeight, padding: 0, border: 'none' }} /></tr>
              )}
              {visibleGroups.map((g, i) => {
                const h = g.rows[0];
                const vend = vendorIdx.refMap.get(norm(h.vendorRef));
                const total = g.rows.reduce((s, r) => s + (r.qty || 0) * (r.price || 0), 0);
                return (
                  <tr key={g.ref} ref={i === 0 ? v.measuredRowRef : undefined} className={g.bad ? 'r-err' : ''}>
                    <td>{g.ref}</td>
                    <td>{vend ? `${vend.name} (${vend.ref})` : h.vendorRef || '—'}</td>
                    <td>{fmtDate(h.issueDate)}</td>
                    <td>{g.rows.length}</td>
                    <td className="mono">{total.toFixed(2)}</td>
                    <td><span className={`badge ${g.bad ? 'b-err' : 'b-ok'}`}>{g.bad ? t({ ar: 'مستبعدة', en: 'Excluded' }) : t({ ar: 'جاهزة', en: 'Ready' })}</span></td>
                  </tr>
                );
              })}
              {v.shouldVirtualize && v.bottomSpacerHeight > 0 && (
                <tr aria-hidden="true"><td colSpan={6} style={{ height: v.bottomSpacerHeight, padding: 0, border: 'none' }} /></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
