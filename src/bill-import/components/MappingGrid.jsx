import { useLanguage } from '../../language.jsx';
import { SECTIONS, fieldOf } from '../lib/fields.js';

/**
 * شبكة الربط: قائمة منسدلة أعلى كل عمود فوق بيانات العميل نفسها،
 * مع خيار «تجاهل هذا العمود» ورابط تجاهل سريع.
 */
export default function MappingGrid({ headers, aoa, headerRow, map, armed, onArmedAssign, onAssign, onIgnore }) {
  const { t } = useLanguage();
  const assigned = {};
  Object.keys(map).forEach((k) => { if (map[k] != null) assigned[map[k]] = k; });

  return (
    <div className={`qbi-scroll${armed ? ' arming' : ''}`} style={{ maxHeight: 420 }}>
      <table className="qbi-grid">
        <thead>
          <tr>
            {headers.map((h, i) => {
              const key = assigned[i];
              return (
                <th key={i} className={`h-col${key ? ' assigned' : ''}`}
                  onClick={(e) => { if (armed && e.target.tagName !== 'SELECT') onArmedAssign(i); }}>
                  <select
                    value={key || ''}
                    onChange={(e) => (e.target.value === '' ? onIgnore(i) : onAssign(e.target.value, i))}
                  >
                    <option value="">— {t({ ar: 'تجاهل هذا العمود', en: 'Ignore this column' })} —</option>
                    {SECTIONS.map(([title, keys], si) => (
                      <optgroup key={si} label={t(title)}>
                        {keys.map((k) => {
                          const [, label, req, , labelEn] = fieldOf(k);
                          const elsewhere = map[k] != null && map[k] !== i ? ' ↩' : '';
                          return <option key={k} value={k}>{t({ ar: label, en: labelEn }) + (req ? ' *' : '') + elsewhere}</option>;
                        })}
                      </optgroup>
                    ))}
                  </select>
                  <div className="orig" title={h}>
                    <span>{h}</span>
                    {key && (
                      <span className="unmap" title={t({ ar: 'تجاهل هذا العمود', en: 'Ignore this column' })}
                        onClick={(e) => { e.stopPropagation(); onIgnore(i); }}>× {t({ ar: 'تجاهل', en: 'Ignore' })}</span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {aoa.slice(headerRow + 1, headerRow + 9).map((r, ri) => (
            <tr key={ri}>
              {headers.map((_, i) => (
                <td key={i} className={assigned[i] ? 'c-assigned' : ''}>{String(r[i] ?? '').slice(0, 40)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
