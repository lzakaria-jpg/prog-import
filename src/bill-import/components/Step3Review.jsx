import { useState } from 'react';
import LocationPanel from './LocationPanel.jsx';
import DocDiscountPanel from './DocDiscountPanel.jsx';
import ReviewTable from './ReviewTable.jsx';

/** الخطوة ٣: نتيجة المطابقة والتعديل التفاعلي */
export default function Step3Review({ eng }) {
  const [filter, setFilter] = useState('all');
  const [propagate, setPropagate] = useState(true);
  const [defaultLoc, setDefaultLoc] = useState(eng.catalog.locations[0] || '');
  const s = eng.stats;

  return (
    <section>
      <div className="qbi-card">
        <h2>نتيجة المطابقة</h2>
        <p className="hint">
          عدّل أي خانة مباشرة في الجدول. حقول المورد والمنتج تقترح القيم من بيانات المنشأة،
          والضريبة تُطابَق بالنسبة لا بالاسم، والموقع خاصية للفاتورة كاملة.
        </p>

        <div className={`qbi-msg ${s.bad ? 'err' : s.warn ? 'warn' : 'ok'}`}>
          <b>{eng.rows.length}</b> بند في <b>{s.invoices}</b> فاتورة — سليمة: <b>{s.ok}</b> ·
          ملاحظات: <b>{s.warn}</b> · أخطاء مانعة: <b>{s.bad}</b>.
          {s.badInvoices > 0 && <><br />عدد الفواتير التي ستُستبعد بسبب أخطاء: <b>{s.badInvoices}</b> من {s.invoices}.</>}
        </div>

        <LocationPanel eng={eng} defaultLoc={defaultLoc} setDefaultLoc={setDefaultLoc} />
        <DocDiscountPanel eng={eng} />

        <div className="qbi-toolbar">
          <label className="f">
            <span>عرض</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">كل الصفوف</option>
              <option value="bad">الصفوف ذات الملاحظات فقط</option>
              <option value="err">الأخطاء المانعة فقط</option>
            </select>
          </label>
          <div className="sp" />
          <label className="inline">
            <input type="checkbox" checked={propagate} onChange={(e) => setPropagate(e.target.checked)} />
            تطبيق تصحيح المورد/المنتج على كل الصفوف المشابهة
          </label>
          <button className="qbi-btn ghost" onClick={() => eng.revalidate()}>إعادة الفحص</button>
          <button className="qbi-btn" onClick={() => eng.setStep(4)}>المتابعة للإخراج</button>
        </div>

        <ReviewTable eng={eng} filter={filter} propagate={propagate} />
      </div>
    </section>
  );
}
