import { useMemo } from 'react';
import Note from './Note.jsx';
import { fmtDate, norm } from '../lib/text.js';
import { buildVendorIndex } from '../lib/matching.js';
import { useTableVirtualization } from '../../lib/useTableVirtualization.js';

/** الخطوة ٤: إخراج ملف الاستيراد */
export default function Step4Export({ eng }) {
  const gs = eng.groups;
  const good = gs.filter((g) => !g.bad);
  const bad = gs.filter((g) => g.bad);
  const vendorIdx = useMemo(() => buildVendorIndex(eng.catalog.vendors), [eng.catalog.vendors]);
  const v = useTableVirtualization(gs.length);
  const visibleGroups = v.shouldVirtualize ? gs.slice(v.startIndex, v.endIndex) : gs;

  return (
    <section>
      <div className="qbi-card">
        <h2>إخراج ملف الاستيراد</h2>
        <p className="hint">
          تُكتب البيانات داخل القالب المرفوع نفسه ابتداءً من الصف الثالث. مرجع الفاتورة يتكرر في كل بند،
          وبقية بيانات الرأس تُكتب في الصف الأول من كل فاتورة فقط.
        </p>

        <div className={`qbi-msg ${bad.length ? 'warn' : 'ok'}`}>
          <b>{gs.length}</b> فاتورة — جاهزة للاستيراد: <b>{good.length}</b> · بها أخطاء مانعة: <b>{bad.length}</b>.
        </div>

        <div className="qbi-actions">
          <button className="qbi-btn dark" disabled={!gs.length} onClick={() => eng.doExport('all')}>تحميل الملف كاملاً</button>
          <button className="qbi-btn" disabled={!good.length} onClick={() => eng.doExport('valid')}>تحميل الفواتير الصحيحة فقط</button>
          <button className="qbi-btn ghost" disabled={!bad.length} onClick={() => eng.doExport('errors')}>تحميل تقرير الأخطاء</button>
        </div>
        <Note note={eng.notes.export} />

        <div className={`qbi-msg ${eng.templateName ? 'info' : 'warn'}`}>
          {eng.templateName
            ? <>ستُكتب البيانات داخل القالب المرفوع «<b>{eng.templateName}</b>» مع بقاء التنسيقات والقوائم المنسدلة والورقة المخفية كما هي.</>
            : <>لم يُرفع قالب معتمد، فسيُبنى ملف جديد بنفس بنية الأعمدة. للحصول على القالب الأصلي بقوائمه، ارفعه في الخطوة الأولى.</>}
        </div>

        <div className="qbi-msg warn">
          قيود يرفض ملف الاستيراد كاملاً إذا احتوى صفاً واحداً خاطئاً. لذلك «الفواتير الصحيحة فقط» يستبعد الفاتورة
          بأكملها إذا كان أي بند فيها خاطئاً، لا الصف وحده.
        </div>

        <div className="qbi-scroll" ref={v.scrollRef}>
          <table className="qbi-rows">
            <thead>
              <tr>{['مرجع الفاتورة', 'المورد', 'التاريخ', 'عدد البنود', 'الإجمالي قبل الضريبة', 'الحالة']
                .map((c) => <th key={c}>{c}</th>)}</tr>
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
                    <td><span className={`badge ${g.bad ? 'b-err' : 'b-ok'}`}>{g.bad ? 'مستبعدة' : 'جاهزة'}</span></td>
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
