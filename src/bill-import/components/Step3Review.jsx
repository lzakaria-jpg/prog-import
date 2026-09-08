import { useState } from 'react';
import { useLanguage } from '../../language.jsx';
import LocationPanel from './LocationPanel.jsx';
import DocDiscountPanel from './DocDiscountPanel.jsx';
import ReviewTable from './ReviewTable.jsx';

/** الخطوة ٣: نتيجة المطابقة والتعديل التفاعلي */
export default function Step3Review({ eng }) {
  const { t } = useLanguage();
  const [filter, setFilter] = useState('all');
  const [propagate, setPropagate] = useState(true);
  const [defaultLoc, setDefaultLoc] = useState(eng.catalog.locations[0] || '');
  const s = eng.stats;

  return (
    <section>
      <div className="qbi-card">
        <h2>{t({ ar: 'نتيجة المطابقة', en: 'Matching result' })}</h2>
        <p className="hint">
          {t({
            ar: 'عدّل أي خانة مباشرة في الجدول. حقول المورد والمنتج تقترح القيم من بيانات المنشأة، والضريبة تُطابَق بالنسبة لا بالاسم، والموقع خاصية للفاتورة كاملة.',
            en: "Edit any cell directly in the table. Vendor and product fields suggest values from the account's data, tax is matched by rate not by name, and location is a property of the whole invoice.",
          })}
        </p>

        <div className={`qbi-msg ${s.bad ? 'err' : s.warn ? 'warn' : 'ok'}`}>
          <b>{eng.rows.length}</b> {t({ ar: 'بند في', en: 'item(s) in' })} <b>{s.invoices}</b> {t({ ar: 'فاتورة — سليمة:', en: 'invoice(s) — clean:' })} <b>{s.ok}</b> ·
          {' '}{t({ ar: 'ملاحظات:', en: 'notes:' })} <b>{s.warn}</b> · {t({ ar: 'أخطاء مانعة:', en: 'blocking errors:' })} <b>{s.bad}</b>.
          {s.badInvoices > 0 && <><br />{t({ ar: 'عدد الفواتير التي ستُستبعد بسبب أخطاء:', en: 'Number of invoices that will be excluded due to errors:' })} <b>{s.badInvoices}</b> {t({ ar: 'من', en: 'of' })} {s.invoices}.</>}
        </div>

        <LocationPanel eng={eng} defaultLoc={defaultLoc} setDefaultLoc={setDefaultLoc} />
        <DocDiscountPanel eng={eng} />

        <div className="qbi-toolbar">
          <label className="f">
            <span>{t({ ar: 'عرض', en: 'View' })}</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">{t({ ar: 'كل الصفوف', en: 'All rows' })}</option>
              <option value="bad">{t({ ar: 'الصفوف ذات الملاحظات فقط', en: 'Rows with notes only' })}</option>
              <option value="err">{t({ ar: 'الأخطاء المانعة فقط', en: 'Blocking errors only' })}</option>
            </select>
          </label>
          <div className="sp" />
          <label className="inline">
            <input type="checkbox" checked={propagate} onChange={(e) => setPropagate(e.target.checked)} />
            {t({ ar: 'تطبيق تصحيح المورد/المنتج على كل الصفوف المشابهة', en: 'Apply the vendor/product correction to all similar rows' })}
          </label>
          <button className="qbi-btn ghost" onClick={() => eng.revalidate()}>{t({ ar: 'إعادة الفحص', en: 'Re-check' })}</button>
          <button className="qbi-btn" onClick={() => eng.setStep(4)}>{t({ ar: 'المتابعة للإخراج', en: 'Continue to export' })}</button>
        </div>

        <ReviewTable eng={eng} filter={filter} propagate={propagate} />
      </div>
    </section>
  );
}
