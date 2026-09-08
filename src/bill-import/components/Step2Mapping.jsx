import { useState } from 'react';
import { useLanguage } from '../../language.jsx';
import DropZone from './DropZone.jsx';
import Note from './Note.jsx';
import FieldStrip from './FieldStrip.jsx';
import MappingGrid from './MappingGrid.jsx';

/** الخطوة ٢: رفع ملف العميل وربط أعمدته */
export default function Step2Mapping({ eng }) {
  const { t } = useLanguage();
  const [armed, setArmed] = useState(null);

  const assign = (key, col) => { eng.assign(key, col); setArmed(null); };

  return (
    <section>
      <div className="qbi-card">
        <h2>{t({ ar: 'ملف العميل غير المنظم', en: "Customer's unstructured file" })}</h2>
        <p className="hint">
          {t({
            ar: 'أي ملف إكسل أو CSV بأي ترتيب أعمدة. تُقرأ كل الأوراق، ويُكتشف صف العناوين، وتُربط الأعمدة تلقائياً باسم العمود وطبيعة قيمه معاً — ثم تراجع الربط بنفسك.',
            en: 'Any Excel or CSV file with any column order. Every sheet is read, the header row is detected, and columns are auto-linked by both column name and the nature of its values — then you review the linking yourself.',
          })}
        </p>
        <DropZone accept=".xlsx,.xls,.csv" label={t({ ar: 'اسحب الملف هنا أو انقر للاختيار', en: 'Drag the file here or click to choose' })} onFile={eng.loadClientFile} />
        <Note note={eng.notes.client} />
      </div>

      {eng.headers.length > 0 && (
        <div className="qbi-card">
          <h2>{t({ ar: 'ربط الأعمدة', en: 'Column linking' })}</h2>
          <div className="qbi-toolbar">
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
            <label className="f">
              <span>{t({ ar: 'إجمالي البند يُعتبر', en: 'Line total is considered' })}</span>
              <select value={eng.totalBasis} onChange={(e) => eng.setTotalBasis(e.target.value)}>
                <option value="excl">{t({ ar: 'قبل الضريبة', en: 'Before tax' })}</option>
                <option value="incl">{t({ ar: 'شاملاً الضريبة', en: 'Tax-inclusive' })}</option>
              </select>
            </label>
            <div className="sp" />
            <button className="qbi-btn" onClick={eng.runMatch}>{t({ ar: 'تحليل ومطابقة', en: 'Analyze & Match' })}</button>
          </div>

          <FieldStrip
            headers={eng.headers}
            map={eng.map}
            armed={armed}
            setArmed={setArmed}
            onIgnoreField={(key) => assign(key, null)}
          />
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
