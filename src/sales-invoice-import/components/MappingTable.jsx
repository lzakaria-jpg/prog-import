import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../language.jsx';
import { guessColumnsBatch } from '../engine/columnMatching.js';
import { sampleValuesFor, refineReferenceGuesses } from '../engine/columnShape.js';

/**
 * جدول مطابقة أعمدة الملفات المرجعية (منتجات/مخزون-صيغة طويلة/عملاء) — نسخ لتصميم
 * renderMappingUI الأصلي. التخمين الأولي (guessColumnsBatch ثم refineReferenceGuesses)
 * حرفي ونفس الترتيب، ويُحسَب مرة واحدة فقط عند تغيّر الملف المرفوع.
 */
export default function MappingTable({ title, kind, defs, headers, rows, onConfirm }) {
  const { t } = useLanguage();
  const initialGuesses = useMemo(
    () => refineReferenceGuesses(kind, headers, rows, guessColumnsBatch(defs.map((d) => ({ key: d.field, kw: d.kw })), headers)),
    [kind, headers, rows, defs],
  );
  const [mapping, setMapping] = useState(initialGuesses);

  return (
    <div className="qsv-panel" style={{ background: 'var(--qsv-panel-tint)' }}>
      <h3>{title}</h3>
      <table className="qsv-mapping-table">
        <tbody>
          {defs.map((d) => {
            const guess = mapping[d.field];
            const samples = guess ? sampleValuesFor(headers, rows, guess, 3) : [];
            return (
              <tr key={d.field}>
                <td>{d.label}{d.required && <span className="qsv-req-star"> *</span>}</td>
                <td>
                  <select value={guess || ''} onChange={(e) => setMapping((m) => ({ ...m, [d.field]: e.target.value }))}>
                    <option value="">— {t({ ar: 'لا يوجد / تجاهل', en: 'None / ignore' })} —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <div className="qsv-hint">{samples.length ? t({ ar: 'أمثلة: ', en: 'Examples: ' }) + samples.join(' • ') : ''}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="qsv-btn" style={{ marginTop: 10 }} onClick={() => onConfirm({ mode: 'long', ...mapping })}>
        {t({ ar: 'تأكيد المطابقة وبناء الفهرس', en: 'Confirm matching & build the index' })}
      </button>
    </div>
  );
}
