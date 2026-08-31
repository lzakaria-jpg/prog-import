import React from 'react';
import GridCell from './GridCell.jsx';
import { COLUMNS } from '../engine/constants.js';

/**
 * جدول إدخال/تحقق الفواتير — نسخ لتصميم buildGridHeaderHtml + renderGrid الأصليين.
 * revalidate=true يطابق سلوك data-grid-2 (يعيد التحقق مع كل تعديل/حذف/لصق)، و false يطابق
 * data-grid (بلا إعادة تحقق آلية) — القاعدة #3 بالخطة. اللصق الذكي معلَّق على الجدول ذاته
 * (event delegation)، تمامًا كما كان في handleGridPaste الأصلية.
 */
export default function InvoiceGrid({ tableId, rows, template, customersRef, productsRef, issues, revalidate, onUpdateCell, onDeleteRow, onPasteGrid }) {
  const handlePaste = (e) => {
    const target = e.target;
    if (!(target && target.dataset && target.dataset.rowId)) return;
    const text = e.clipboardData.getData('text');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return; // اترك اللصق العادي لخلية واحدة يعمل بشكل طبيعي
    e.preventDefault();
    onPasteGrid(target.dataset.rowId, target.dataset.colKey, text, { revalidate });
  };

  return (
    <div className="qsv-grid-scroll">
      <table className="qsv-grid" id={tableId} onPaste={handlePaste}>
        <thead>
          <tr>
            <th className="qsv-row-num-col">#</th>
            {COLUMNS.map((c) => (
              <th key={c.key} className={c.level === 'header' ? 'qsv-col-group-header' : 'qsv-col-group-item'}>
                {c.name}{c.required && <span className="qsv-req-star"> *</span>}
              </th>
            ))}
            <th>حذف</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id} data-rowid={row.id}>
              <td className="qsv-row-num-col">{idx + 1}</td>
              {COLUMNS.map((col) => (
                <td key={col.key}>
                  <GridCell
                    row={row} col={col} template={template} customersRef={customersRef} productsRef={productsRef}
                    issueList={(issues.byRow[row.id] || {})[col.key]}
                    onChange={(value) => onUpdateCell(row.id, col.key, value, { revalidate })}
                  />
                </td>
              ))}
              <td className="qsv-del-col">
                <button type="button" className="qsv-btn danger" onClick={() => onDeleteRow(row.id, { revalidate })}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
