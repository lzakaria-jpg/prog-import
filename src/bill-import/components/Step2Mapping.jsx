import { useState } from 'react';
import DropZone from './DropZone.jsx';
import Note from './Note.jsx';
import FieldStrip from './FieldStrip.jsx';
import MappingGrid from './MappingGrid.jsx';

/** الخطوة ٢: رفع ملف العميل وربط أعمدته */
export default function Step2Mapping({ eng }) {
  const [armed, setArmed] = useState(null);

  const assign = (key, col) => { eng.assign(key, col); setArmed(null); };

  return (
    <section>
      <div className="qbi-card">
        <h2>ملف العميل غير المنظم</h2>
        <p className="hint">
          أي ملف إكسل أو CSV بأي ترتيب أعمدة. تُقرأ كل الأوراق، ويُكتشف صف العناوين، وتُربط الأعمدة تلقائياً
          باسم العمود وطبيعة قيمه معاً — ثم تراجع الربط بنفسك.
        </p>
        <DropZone accept=".xlsx,.xls,.csv" label="اسحب الملف هنا أو انقر للاختيار" onFile={eng.loadClientFile} />
        <Note note={eng.notes.client} />
      </div>

      {eng.headers.length > 0 && (
        <div className="qbi-card">
          <h2>ربط الأعمدة</h2>
          <div className="qbi-toolbar">
            <label className="f">
              <span>الورقة</span>
              <select value={eng.sheetName} onChange={(e) => eng.changeSheet(e.target.value)}>
                {eng.wb.SheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="f">
              <span>صف العناوين</span>
              <select value={eng.headerRow} onChange={(e) => eng.changeHeaderRow(+e.target.value)}>
                {eng.aoa.slice(0, 20).map((r, i) => (
                  <option key={i} value={i}>{`الصف ${i + 1}: ${String(r.slice(0, 5).join(' | ')).slice(0, 60)}`}</option>
                ))}
              </select>
            </label>
            <label className="f">
              <span>إجمالي البند يُعتبر</span>
              <select value={eng.totalBasis} onChange={(e) => eng.setTotalBasis(e.target.value)}>
                <option value="excl">قبل الضريبة</option>
                <option value="incl">شاملاً الضريبة</option>
              </select>
            </label>
            <div className="sp" />
            <button className="qbi-btn" onClick={eng.runMatch}>تحليل ومطابقة</button>
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
