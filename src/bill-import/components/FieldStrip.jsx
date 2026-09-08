import { useLanguage } from '../../language.jsx';
import { SECTIONS, fieldOf, FIELDS } from '../lib/fields.js';

/** شريط الحقول: انقر حقلاً ثم انقر عموده في الشبكة */
export default function FieldStrip({ headers, map, armed, setArmed, onIgnoreField }) {
  const { t } = useLanguage();
  const missing = FIELDS.filter((f) => f[2] && map[f[0]] == null).map((f) => t({ ar: f[1], en: f[4] }));

  return (
    <>
      <div className="qbi-pick">
        {SECTIONS.map(([title, keys], si) => (
          <div key={si} className="pick-sec">
            <span className="count">{t(title)}:</span>
            {keys.map((key) => {
              const [, label, req, , labelEn] = fieldOf(key);
              const col = map[key];
              return (
                <span
                  key={key}
                  className={`fld${col != null ? ' mapped' : ''}${req ? ' req' : ''}${armed === key ? ' armed' : ''}`}
                  title={col != null ? t({ ar: 'انقر لإعادة الربط', en: 'Click to re-link' }) : t({ ar: 'انقر ثم اختر العمود', en: 'Click, then choose the column' })}
                  onClick={() => setArmed(armed === key ? null : key)}
                >
                  {t({ ar: label, en: labelEn }) + (req ? ' *' : '')}
                  {col != null && <span className="col">{headers[col]}</span>}
                  {col != null && (
                    <span className="x" title={t({ ar: 'إلغاء الربط', en: 'Unlink' })}
                      onClick={(e) => { e.stopPropagation(); onIgnoreField(key); }}>×</span>
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="qbi-pick-help">
        {armed
          ? <>{t({ ar: 'اختر الآن العمود الذي يحتوي', en: 'Now choose the column that holds' })} <b>{t({ ar: fieldOf(armed)[1], en: fieldOf(armed)[4] })}</b> {t({ ar: 'من رؤوس الجدول أدناه.', en: 'from the table headers below.' })}</>
          : missing.length
            ? <span className="err-text">{t({ ar: 'حقول إلزامية بلا ربط:', en: 'Required fields not linked:' })} <b>{missing.join(t({ ar: '، ', en: ', ' }))}</b> {t({ ar: '— انقر الحقل ثم عموده، أو استخدم القائمة أعلى كل عمود.', en: '— click the field then its column, or use the dropdown above each column.' })}</span>
            : t({ ar: 'كل الحقول الإلزامية مربوطة. راجع البيانات ثم اضغط «تحليل ومطابقة».', en: 'All required fields are linked. Review the data, then click "Analyze & Match".' })}
      </div>
    </>
  );
}
