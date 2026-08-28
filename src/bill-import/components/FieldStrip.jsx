import { SECTIONS, fieldOf, FIELDS } from '../lib/fields.js';

/** شريط الحقول: انقر حقلاً ثم انقر عموده في الشبكة */
export default function FieldStrip({ headers, map, armed, setArmed, onIgnoreField }) {
  const missing = FIELDS.filter((f) => f[2] && map[f[0]] == null).map((f) => f[1]);

  return (
    <>
      <div className="qbi-pick">
        {SECTIONS.map(([title, keys], si) => (
          <div key={title} className="pick-sec">
            <span className="count">{title}:</span>
            {keys.map((key) => {
              const [, label, req] = fieldOf(key);
              const col = map[key];
              return (
                <span
                  key={key}
                  className={`fld${col != null ? ' mapped' : ''}${req ? ' req' : ''}${armed === key ? ' armed' : ''}`}
                  title={col != null ? 'انقر لإعادة الربط' : 'انقر ثم اختر العمود'}
                  onClick={() => setArmed(armed === key ? null : key)}
                >
                  {label + (req ? ' *' : '')}
                  {col != null && <span className="col">{headers[col]}</span>}
                  {col != null && (
                    <span className="x" title="إلغاء الربط"
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
          ? <>اختر الآن العمود الذي يحتوي <b>{fieldOf(armed)[1]}</b> من رؤوس الجدول أدناه.</>
          : missing.length
            ? <span className="err-text">حقول إلزامية بلا ربط: <b>{missing.join('، ')}</b> — انقر الحقل ثم عموده، أو استخدم القائمة أعلى كل عمود.</span>
            : 'كل الحقول الإلزامية مربوطة. راجع البيانات ثم اضغط «تحليل ومطابقة».'}
      </div>
    </>
  );
}
