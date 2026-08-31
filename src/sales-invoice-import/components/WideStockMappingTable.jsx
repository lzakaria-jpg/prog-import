import React, { useMemo, useState } from 'react';
import { guessColumnsBatch } from '../engine/columnMatching.js';
import { sampleValuesFor, refineReferenceGuesses, bestTemplateLocationFor, TOTAL_COL_RE } from '../engine/columnShape.js';

/**
 * جدول مطابقة تقرير مواقع المنتجات بالصيغة العريضة (عمود لكل موقع) — نسخ لتصميم
 * renderWideStockMappingUI الأصلي حرفيًا، بما فيه اكتشاف/تجاهل عمود المجموع تلقائيًا.
 */
export default function WideStockMappingTable({ headers, rows, templateLocations, onConfirm }) {
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
      <h3>مطابقة أعمدة تقرير مواقع المنتجات</h3>
      <div className="qsv-note-box">
        📊 تم اكتشاف أن الملف بصيغة «عمود لكل موقع» (كل عمود اسمه موقع وتحته كمية المنتج فيه) — وهي
        صيغة تقرير مواقع المنتجات في قيود. اربط كل عمود بالموقع المقابل له في القالب، وسيتم تجاهل
        عمود المجموع تلقائيًا.
      </div>
      <table className="qsv-mapping-table">
        <tbody>
          <tr>
            <td>كود/باركود المنتج <span className="qsv-req-star">*</span></td>
            <td>
              <select value={sku} onChange={(e) => setSku(e.target.value)}>
                <option value="">— لا يوجد / تجاهل —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <div className="qsv-hint">{sku ? 'أمثلة: ' + sampleValuesFor(headers, rows, sku, 3).join(' • ') : ''}</div>
            </td>
          </tr>
          <tr>
            <td>اسم المنتج</td>
            <td>
              <select value={name} onChange={(e) => setName(e.target.value)}>
                <option value="">— لا يوجد / تجاهل —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <div className="qsv-hint">{name ? 'أمثلة: ' + sampleValuesFor(headers, rows, name, 3).join(' • ') : ''}</div>
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ paddingTop: 14, color: 'var(--qsv-muted)', fontSize: 12 }}>
              — أعمدة الكميات: اربط كل عمود بالموقع المقابل في القالب —
            </td>
          </tr>
          {locCandidates.map((h) => {
            const isTotal = TOTAL_COL_RE.test(h.trim());
            const samples = sampleValuesFor(headers, rows, h, 3);
            return (
              <tr key={h} style={isTotal ? { opacity: 0.6 } : undefined}>
                <td>
                  {h}{isTotal && <span className="qsv-hint"> (عمود مجموع — يُتجاهل)</span>}
                  <div className="qsv-hint">{samples.length ? 'أمثلة: ' + samples.join(' • ') : ''}</div>
                </td>
                <td>
                  {isTotal ? (
                    <select disabled value=""><option value="">— تجاهل هذا العمود —</option></select>
                  ) : templateLocations.length ? (
                    <select value={locCols[h] || ''} onChange={(e) => setLocCols((m) => ({ ...m, [h]: e.target.value }))}>
                      <option value="">— تجاهل هذا العمود —</option>
                      {templateLocations.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  ) : (
                    <select value={h} disabled><option value={h}>{h} (اسم العمود)</option></select>
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
        تأكيد المطابقة وبناء الفهرس
      </button>
    </div>
  );
}
