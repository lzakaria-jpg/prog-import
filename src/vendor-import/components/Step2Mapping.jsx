import { useState } from 'react';
import { useLanguage } from '../../language.jsx';
import DropZone from './DropZone.jsx';
import Note from './Note.jsx';
import FieldStrip from './FieldStrip.jsx';
import MappingGrid from './MappingGrid.jsx';

/** الخطوة ٢: رفع ملف الموردين وربط أعمدته — ربط قابل للتعديل يدوياً دائماً، ليس ثابتاً */
export default function Step2Mapping({ eng }) {
  const { t } = useLanguage();
  const [armed, setArmed] = useState(null);

  const assign = (key, col) => { eng.assign(key, col); setArmed(null); };

  return (
    <section>
      <div className="qvi-card">
        <h2>{t({ ar: 'ملف الموردين غير المنظم', en: "Vendor's unstructured file" })}</h2>
        <p className="hint">
          {t({
            ar: 'أي ملف إكسل أو CSV بأي ترتيب أعمدة — مورد واحد لكل صف. تُكتشف الأعمدة تلقائياً باسمها وطبيعة قيمها معاً، ثم تراجع الربط وتعدّله بنفسك قبل المتابعة.',
            en: 'Any Excel or CSV file with any column order — one vendor per row. Columns are auto-linked by both their name and the nature of their values, then you review and adjust the linking yourself before continuing.',
          })}
        </p>
        <DropZone accept=".xlsx,.xls,.csv" label={t({ ar: 'اسحب الملف هنا أو انقر للاختيار', en: 'Drag the file here or click to choose' })} onFile={eng.loadClientFile} />
        <Note note={eng.notes.client} />
      </div>

      {eng.headers.length > 0 && (
        <div className="qvi-card">
          <h2>{t({ ar: 'ربط الأعمدة', en: 'Column linking' })}</h2>
          <div className="qvi-toolbar">
            <label className="f">
              <span>{t({ ar: 'الورقة', en: 'Sheet' })}</span>
              <select value={eng.sheetName} onChange={(e) => eng.changeSheet(e.target.value)}>
                {eng.wb.SheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="f">
              <span>{t({ ar: 'صف العناوين', en: 'Header row' })}</span>
              <select value={eng.headerRow} onChange={(e) => eng.changeHeaderRow(+e.target.value)}>
                {eng.aoa.slice(0, 20).map((r, i) => (
                  <option key={i} value={i}>{t({ ar: `الصف ${i + 1}: ${String(r.slice(0, 5).join(' | ')).slice(0, 60)}`, en: `Row ${i + 1}: ${String(r.slice(0, 5).join(' | ')).slice(0, 60)}` })}</option>
                ))}
              </select>
            </label>
            <div className="sp" />
            <button className="qvi-btn" onClick={eng.runMatch}>{t({ ar: 'تحليل ومطابقة', en: 'Analyze & Match' })}</button>
          </div>

          <FieldStrip
            headers={eng.headers}
            map={eng.map}
            armed={armed}
            setArmed={setArmed}
            onIgnoreField={(key) => assign(key, null)}
          />
          <div className="qvi-msg info">
            {t({
              ar: 'الرقم المرجعي غير متاح حالياً عبر واجهة Qoyod البرمجية للموردين (لا قراءة من الحساب ولا إرسال عند الإنشاء المباشر) — يظهر هنا كمرجع داخل الأداة فقط، ويُقترح تلقائياً من تسلسل الملف نفسه عند غيابه، ويُكتب في ملف القالب عند التصدير.',
              en: "The reference number is not available via Qoyod's vendor API today (no reading from the account, no sending on direct create) — it appears here only as an in-tool reference, is auto-suggested from the file's own sequence when missing, and is written into the exported template file.",
            })}
          </div>
          <MappingGrid
            headers={eng.headers}
            aoa={eng.aoa}
            headerRow={eng.headerRow}
            map={eng.map}
            armed={armed}
            onArmedAssign={(col) => assign(armed, col)}
            onAssign={assign}
            onIgnore={(col) => { eng.ignoreColumn(col); setArmed(null); }}
          />
        </div>
      )}
    </section>
  );
}
