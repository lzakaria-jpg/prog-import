import { useLanguage } from '../../language.jsx';
import { rowErr, rowWarn } from '../lib/validation.js';
import { useTableVirtualization } from '../../lib/useTableVirtualization.js';
import { SafeInput } from '../../lib/SafeInput.jsx';

const COLS = [
  { ar: '#', en: '#' }, { ar: 'الرقم المرجعي', en: 'Ref. No.' }, { ar: 'الاسم *', en: 'Name *' },
  { ar: 'اسم المنشأة', en: 'Organization' }, { ar: 'الهاتف الأساسي', en: 'Primary phone' },
  { ar: 'البريد الأساسي', en: 'Primary email' }, { ar: 'الحالة', en: 'Status' },
  { ar: 'الرقم الضريبي', en: 'Tax number' }, { ar: 'التكرار/الإجراء', en: 'Duplicate / action' },
  { ar: 'الملاحظات', en: 'Notes' }
];

/** قيمة select قرار التكرار: 'create' | 'skip' | 'update:<id>' */
function actionSelectValue(row) {
  if (row.action === 'update') return `update:${row.updateTargetId ?? (row.dupExact ? row.dupExact.id : '')}`;
  if (row.action === 'skip') return 'skip';
  if (row.action === 'create') return 'create';
  return '';
}

/** جدول المراجعة: كل خانة قابلة للتعديل، والملاحظات تُعاد حسابها فور أي تغيير — نافذة تمرير لملفات كبيرة (راجع bill-import/components/ReviewTable.jsx لنفس الأسلوب) */
export default function ReviewTable({ eng, visibleKeys }) {
  const { t } = useLanguage();
  // visibleKeys = لقطة مفاتيح الصفوف المختارة بالتصنيف (Step3Review)، أو null = الكل
  const list = visibleKeys ? eng.rows.filter((r) => visibleKeys.has(r.i)) : eng.rows;
  const vt = useTableVirtualization(list.length);
  const visibleList = vt.shouldVirtualize ? list.slice(vt.startIndex, vt.endIndex) : list;

  const txt = (row, key, placeholder) => (
    <SafeInput value={row[key] ?? ''} placeholder={placeholder} onChange={(e) => eng.updateRow(row, { [key]: e.target.value })} />
  );

  const onActionChange = (row, value) => {
    if (value === 'create' || value === 'skip') eng.setRowAction(row, value, null);
    else if (value.startsWith('update:')) eng.setRowAction(row, 'update', Number(value.slice(7)) || null);
    else eng.setRowAction(row, null, null);
  };

  return (
    <div className="qvi-scroll" ref={vt.scrollRef}>
      <table className="qvi-rows">
        <thead><tr>{COLS.map((c, ci) => <th key={ci}>{t(c)}</th>)}</tr></thead>
        <tbody>
          {vt.shouldVirtualize && vt.topSpacerHeight > 0 && (
            <tr aria-hidden="true"><td colSpan={COLS.length} style={{ height: vt.topSpacerHeight, padding: 0, border: 'none' }} /></tr>
          )}
          {visibleList.map((row, i) => {
            const needsDecision = (row.dupExact || (row.dupFuzzy && row.dupFuzzy.length)) && (row.action == null);
            return (
              <tr key={`${row.i}-${vt.startIndex + i}`} ref={i === 0 ? vt.measuredRowRef : undefined}
                className={rowErr(row) ? 'r-err' : rowWarn(row) ? 'r-warn' : ''}>
                <td>{row.i}</td>
                <td>
                  {txt(row, 'ref')}
                  {row.refAutoSuggested && <div className="count">{t({ ar: 'مقترَح تلقائياً — قابل للتعديل', en: 'Auto-suggested — editable' })}</div>}
                </td>
                <td>{txt(row, 'name')}</td>
                <td>{txt(row, 'organization')}</td>
                <td>{txt(row, 'phone', '+9665XXXXXXXX')}</td>
                <td>{txt(row, 'email')}</td>
                <td>
                  <select value={row.statusNorm || 'Active'} onChange={(e) => eng.updateRow(row, { status: e.target.value })}>
                    <option value="Active">{t({ ar: 'نشط', en: 'Active' })}</option>
                    <option value="Inactive">{t({ ar: 'غير نشط', en: 'Inactive' })}</option>
                  </select>
                </td>
                <td>{txt(row, 'taxNumber')}</td>
                <td>
                  {(row.dupExact || (row.dupFuzzy && row.dupFuzzy.length)) ? (
                    <select value={actionSelectValue(row)} onChange={(e) => onActionChange(row, e.target.value)}
                      className={needsDecision ? 'need-decision' : ''}>
                      <option value="">{t({ ar: '— اختر —', en: '— Choose —' })}</option>
                      <option value="create">{t({ ar: 'إنشاء جديد رغم التشابه', en: 'Create new anyway' })}</option>
                      {row.dupExact && (
                        <option value={`update:${row.dupExact.id}`}>
                          {t({ ar: `تحديث الموجود «${row.dupExact.name}» (#${row.dupExact.id})`, en: `Update existing "${row.dupExact.name}" (#${row.dupExact.id})` })}
                        </option>
                      )}
                      {(row.dupFuzzy || []).slice(0, 5).map((f) => (
                        <option key={f.contact.id} value={`update:${f.contact.id}`}>
                          {t({ ar: `تحديث «${f.contact.name}» (#${f.contact.id}) — تشابه ${(f.score * 100).toFixed(0)}%`, en: `Update "${f.contact.name}" (#${f.contact.id}) — ${(f.score * 100).toFixed(0)}% similar` })}
                        </option>
                      ))}
                      <option value="skip">{t({ ar: 'تجاوز هذا الصف', en: 'Skip this row' })}</option>
                    </select>
                  ) : <span className="count">{t({ ar: 'لا تكرار', en: 'No duplicate' })}</span>}
                </td>
                <td>
                  <div className="issue-list">
                    {row.issues.length
                      ? row.issues.map((x, k) => (
                        <span key={k} className={`badge ${x.l === 'e' ? 'b-err' : 'b-warn'}`}>{x.m}</span>
                      ))
                      : <span className="badge b-ok">{t({ ar: 'جاهز', en: 'Ready' })}</span>}
                  </div>
                </td>
              </tr>
            );
          })}
          {vt.shouldVirtualize && vt.bottomSpacerHeight > 0 && (
            <tr aria-hidden="true"><td colSpan={COLS.length} style={{ height: vt.bottomSpacerHeight, padding: 0, border: 'none' }} /></tr>
          )}
          {!list.length && <tr><td colSpan={COLS.length}>{t({ ar: 'لا توجد صفوف مطابقة لهذا العرض.', en: 'No rows match this view.' })}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
