import { useState } from 'react';
import { useLanguage } from '../../language.jsx';
import ReviewTable from './ReviewTable.jsx';

/** الخطوة ٣: نتيجة الربط والتحقق، مع كشف التكرار بالاسم والتعديل التفاعلي */
export default function Step3Review({ eng }) {
  const { t } = useLanguage();
  const [filter, setFilter] = useState('all');
  const s = eng.stats;

  return (
    <section>
      <div className="qvi-card">
        <h2>{t({ ar: 'المراجعة والتعديل', en: 'Review & edit' })}</h2>
        <p className="hint">
          {t({
            ar: 'عدّل أي خانة مباشرة في الجدول. لو ظهر تكرار بالاسم (تام أو مشابه جداً) مقابل عميل/مورد موجود فعلاً، اختر صراحةً: إنشاء جديد، أو تحديث الموجود، أو تجاوز الصف.',
            en: 'Edit any cell directly in the table. If a name duplicate appears (exact or very similar) against an existing contact, explicitly choose: create new, update the existing one, or skip the row.',
          })}
        </p>

        <div className={`qvi-msg ${s.bad ? 'err' : s.warn ? 'warn' : 'ok'}`}>
          <b>{s.total}</b> {t({ ar: 'صف — سليم:', en: 'row(s) — clean:' })} <b>{s.ok}</b> ·
          {' '}{t({ ar: 'ملاحظات:', en: 'notes:' })} <b>{s.warn}</b> · {t({ ar: 'أخطاء مانعة:', en: 'blocking errors:' })} <b>{s.bad}</b>
          {s.pendingDecision > 0 && <> · {t({ ar: 'بانتظار قرار التكرار:', en: 'awaiting duplicate decision:' })} <b>{s.pendingDecision}</b></>}
        </div>

        {!eng.connected && (
          <div className="qvi-msg warn">
            {t({
              ar: 'لم يتم الاتصال بواجهة قيود بالخطوة الأولى — لا يمكن كشف التكرار بالاسم حالياً. يمكنك المتابعة، أو الرجوع للخطوة الأولى والاتصال أولاً لتفعيل هذا الكشف.',
              en: "You didn't connect to Qoyod's API in step 1 — name-duplicate detection is unavailable right now. You can continue, or go back to step 1 and connect first to enable it.",
            })}
          </div>
        )}

        <div className="qvi-toolbar">
          <label className="f">
            <span>{t({ ar: 'عرض', en: 'View' })}</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">{t({ ar: 'كل الصفوف', en: 'All rows' })}</option>
              <option value="bad">{t({ ar: 'الصفوف ذات الملاحظات فقط', en: 'Rows with notes only' })}</option>
              <option value="err">{t({ ar: 'الأخطاء المانعة فقط', en: 'Blocking errors only' })}</option>
            </select>
          </label>
          <div className="sp" />
          <button className="qvi-btn ghost" onClick={() => eng.revalidate()}>{t({ ar: 'إعادة الفحص', en: 'Re-check' })}</button>
          <button className="qvi-btn" onClick={() => eng.setStep(4)}>{t({ ar: 'المتابعة للتصدير/الإرسال', en: 'Continue to export/send' })}</button>
        </div>

        <ReviewTable eng={eng} filter={filter} />
      </div>
    </section>
  );
}
