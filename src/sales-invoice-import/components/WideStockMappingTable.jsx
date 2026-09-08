import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../language.jsx';
import { guessColumnsBatch } from '../engine/columnMatching.js';
import { sampleValuesFor, refineReferenceGuesses, bestTemplateLocationFor, TOTAL_COL_RE } from '../engine/columnShape.js';

/**
 * جدول مطابقة تقرير مواقع المنتجات بالصيغة العريضة (عمود لكل موقع) — نسخ لتصميم
 * renderWideStockMappingUI الأصلي حرفيًا، بما فيه اكتشاف/تجاهل عمود المجموع تلقائيًا.
 */
export default function WideStockMappingTable({ headers, rows, templateLocations, onConfirm }) {
  const { t } = useLanguage();
  const guesses = useMemo(() => refineReferenceGuesses('stock', headers, rows, guessColumnsBatch([
    { key: 'sku', kw: ['sku', 'كود', 'باركود', 'تسلسلي', 'رقم المنتج', 'رقم صنف', 'item code', 'product code'] },
    { key: 'name', kw: ['اسم المنتج', 'اسم الصنف', 'الاسم', 'name', 'product name', 'item name', 'description'] },
  ], headers)), [headers, rows]);

  const [sku, setSku] = useState(guesses.sku || '');
  const [name, setName] = useState(guesses.name || '');
  const idCols = useMemo(() => [sku, name].filter(Boolean), [sku, name]);
  const locCandidates = useMemo(() => headers.filter((h) => !idCols.includes(h)), [headers, idCols]);

  const initialLocCols = useMemo(() => {
    const out = {};
    locCandidates.forEach((h) => {
      const isTotal = TOTAL_COL_RE.test(h.trim());
      if (!isTotal) out[h] = bestTemplateLocationFor(h, templateLocations);
    });
    return out;
  }, [locCandidates, templateLocations]);
  const [locCols, setLocCols] = useState(initialLocCols);

  return (
    <div className="qsv-panel" style={{ background: '#fbfcfd' }}>
      <h3>{t({ ar: 'مطابقة أعمدة تقرير مواقع المنتجات', en: 'Match the product locations report columns' })}</h3>
      <div className="qsv-note-box">
        📊 {t({
          ar: 'تم اكتشاف أن الملف بصيغة «عمود لكل موقع» (كل عمود اسمه موقع وتحته كمية المنتج فيه) — وهي صيغة تقرير مواقع المنتجات في قيود. اربط كل عمود بالموقع المقابل له في القالب، وسيتم تجاهل عمود المجموع تلقائيًا.',
          en: 'Detected that the file is in "one column per location" format (each column is named after a location, holding the product quantity there) — the format of the product locations report in Qoyod. Link each column to its matching location in the template; the total column will be ignored automatically.',
        })}
      </div>
      <table className="qsv-mapping-table">
        <tbody>
          <tr>
            <td>{t({ ar: 'كود/باركود المنتج', en: 'Product code/barcode' })} <span className="qsv-req-star">*</span></td>
            <td>
              <select value={sku} onChange={(e) => setSku(e.target.value)}>
                <option value="">— {t({ ar: 'لا يوجد / تجاهل', en: 'None / ignore' })} —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <div className="qsv-hint">{sku ? t({ ar: 'أمثلة: ', en: 'Examples: ' }) + sampleValuesFor(headers, rows, sku, 3).join(' • ') : ''}</div>
            </td>
          </tr>
          <tr>
            <td>{t({ ar: 'اسم المنتج', en: 'Product name' })}</td>
            <td>
              <select value={name} onChange={(e) => setName(e.target.value)}>
                <option value="">— {t({ ar: 'لا يوجد / تجاهل', en: 'None / ignore' })} —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <div className="qsv-hint">{name ? t({ ar: 'أمثلة: ', en: 'Examples: ' }) + sampleValuesFor(headers, rows, name, 3).join(' • ') : ''}</div>
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ paddingTop: 14, color: 'var(--qsv-muted)', fontSize: 12 }}>
              — {t({ ar: 'أعمدة الكميات: اربط كل عمود بالموقع المقابل في القالب', en: 'Quantity columns: link each column to its matching location in the template' })} —
            </td>
          </tr>
          {locCandidates.map((h) => {
            const isTotal = TOTAL_COL_RE.test(h.trim());
            const samples = sampleValuesFor(headers, rows, h, 3);
            return (
              <tr key={h} style={isTotal ? { opacity: 0.6 } : undefined}>
                <td>
                  {h}{isTotal && <span className="qsv-hint"> ({t({ ar: 'عمود مجموع — يُتجاهل', en: 'total column — ignored' })})</span>}
                  <div className="qsv-hint">{samples.length ? t({ ar: 'أمثلة: ', en: 'Examples: ' }) + samples.join(' • ') : ''}</div>
                </td>
                <td>
                  {isTotal ? (
                    <select disabled value=""><option value="">— {t({ ar: 'تجاهل هذا العمود', en: 'Ignore this column' })} —</option></select>
                  ) : templateLocations.length ? (
                    <select value={locCols[h] || ''} onChange={(e) => setLocCols((m) => ({ ...m, [h]: e.target.value }))}>
                      <option value="">— {t({ ar: 'تجاهل هذا العمود', en: 'Ignore this column' })} —</option>
                      {templateLocations.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  ) : (
                    <select value={h} disabled><option value={h}>{h} ({t({ ar: 'اسم العمود', en: 'column name' })})</option></select>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        className="qsv-btn"
        style={{ marginTop: 10 }}
        onClick={() => {
          const finalLocCols = {};
          Object.entries(locCols).forEach(([h, v]) => { if (v) finalLocCols[h] = v; });
          onConfirm({ mode: 'wide', sku, name, locCols: finalLocCols });
        }}
      >
        {t({ ar: 'تأكيد المطابقة وبناء الفهرس', en: 'Confirm matching & build the index' })}
      </button>
    </div>
  );
}
