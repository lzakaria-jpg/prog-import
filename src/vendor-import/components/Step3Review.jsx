import { useCallback, useMemo, useState } from 'react';
import { useLanguage } from '../../language.jsx';
import { rowErr, rowWarn } from '../lib/validation.js';
import ReviewTable from './ReviewTable.jsx';

/** هل ينطبق التصنيف المطلوب على هذا الصف؟ */
export function rowMatchesFilter(row, filter) {
  if (filter === 'err') return rowErr(row);
  if (filter === 'warn') return rowWarn(row);
  if (filter === 'ok') return !rowErr(row) && !rowWarn(row);
  if (filter === 'pending') return !rowErr(row) && (row.action === null || row.action === undefined);
  return true;
}

/** الخطوة ٣: نتيجة الربط والتحقق، مع كشف التكرار بالاسم والتعديل التفاعلي */
export default function Step3Review({ eng }) {
  const { t } = useLanguage();
  const [filter, setFilter] = useState('all');
  // [إضافة 2026-09-16] لقطة الصفوف لحظة اختيار التصنيف: بدونها كان الصف يختفي
  // من الجدول فور تصحيحه (لأنه لم يعد ضمن "الأخطاء")، وربما أثناء الكتابة داخل
  // خانته. اللقطة تُبقيه ظاهراً بحالته الجديدة (جاهز) حتى تحديث القائمة يدوياً.
  const [snapshot, setSnapshot] = useState(null);
  const s = eng.stats;

  const applyFilter = useCallback((f) => {
    setFilter(f);
    setSnapshot(f === 'all' ? null : new Set(eng.rows.filter((r) => rowMatchesFilter(r, f)).map((r) => r.i)));
  }, [eng.rows]);

  const fixedCount = useMemo(() => {
    if (!snapshot) return 0;
    return eng.rows.filter((r) => snapshot.has(r.i) && !rowMatchesFilter(r, filter)).length;
  }, [snapshot, filter, eng.rows, eng.stats]);

  const chip = (key, label, count, cls) => (
    <button type="button" className={cls} aria-pressed={filter === key} disabled={key !== 'all' && !count}
      onClick={() => applyFilter(key)}>
      <span>{label}</span><span className="n">{count}</span>
    </button>
  );

  return (
    <section>
      <div className="qvi-card">
        <h2>{t({ ar: 'المراجعة والتعديل', en: 'Review & edit' })}</h2>
        <p className="hint">
          {t({
            ar: 'عدّل أي خانة مباشرة في الجدول — يُعاد فحص صفها فوراً وحده. اضغط أي تصنيف بالأسفل لعرض صفوفه فقط. لو ظهر تكرار بالاسم (تام أو مشابه جداً) مقابل مورد موجود فعلاً، اختر صراحةً: إنشاء جديد، أو تحديث الموجود، أو تجاوز الصف.',
            en: 'Edit any cell directly in the table — only its own row is re-checked, instantly. Click any category below to show just those rows. If a name duplicate appears (exact or very similar) against an existing vendor, explicitly choose: create new, update the existing one, or skip the row.',
          })}
        </p>

        <div className="qvi-filters">
          {chip('all', t({ ar: 'كل الصفوف', en: 'All rows' }), s.total, '')}
          {chip('err', t({ ar: 'أخطاء مانعة', en: 'Blocking errors' }), s.bad, 'f-err')}
          {chip('warn', t({ ar: 'ملاحظات', en: 'Notes' }), s.warn, 'f-warn')}
          {chip('pending', t({ ar: 'بانتظار قرار التكرار', en: 'Awaiting duplicate decision' }), s.pendingDecision, '')}
          {chip('ok', t({ ar: 'سليم', en: 'Clean' }), s.ok, 'f-ok')}
        </div>

        {filter !== 'all' && (
          <div className="qvi-msg info">
            {t({
              ar: `عرض ${snapshot ? snapshot.size : 0} صفاً حسب التصنيف المختار`,
              en: `Showing ${snapshot ? snapshot.size : 0} row(s) for the selected category`,
            })}
            {fixedCount > 0 && (
              <>
                {' — '}
                <b>{t({ ar: `${fixedCount} منها تم إصلاحها`, en: `${fixedCount} of them are now fixed` })}</b>
                {' '}
                <button type="button" className="qvi-btn ghost" style={{ padding: '3px 10px', fontSize: 12.5, marginInlineStart: 6 }}
                  onClick={() => applyFilter(filter)}>
                  {t({ ar: 'إخفاء المُصلَّحة', en: 'Hide fixed rows' })}
                </button>
              </>
            )}
          </div>
        )}

        {!eng.connected && (
          <div className="qvi-msg warn">
            {t({
              ar: 'لم يتم الاتصال بواجهة قيود بالخطوة الأولى — لا يمكن كشف التكرار بالاسم حالياً. يمكنك المتابعة، أو الرجوع للخطوة الأولى والاتصال أولاً لتفعيل هذا الكشف.',
              en: "You didn't connect to Qoyod's API in step 1 — name-duplicate detection is unavailable right now. You can continue, or go back to step 1 and connect first to enable it.",
            })}
          </div>
        )}

        <div className="qvi-toolbar">
          <div className="sp" />
          <button className="qvi-btn ghost" onClick={() => eng.revalidate()}>{t({ ar: 'إعادة الفحص', en: 'Re-check' })}</button>
          <button className="qvi-btn" onClick={() => eng.setStep(4)}>{t({ ar: 'المتابعة للتصدير/الإرسال', en: 'Continue to export/send' })}</button>
        </div>

        <ReviewTable eng={eng} visibleKeys={snapshot} />
      </div>
    </section>
  );
}
