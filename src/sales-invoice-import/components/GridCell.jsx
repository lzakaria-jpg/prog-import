import React from 'react';
import { fromDMY } from '../engine/dates.js';
import { SafeInput } from '../../lib/SafeInput.jsx';

const YES_NO_LOWER = ['نعم', 'لا', 'yes', 'no'];

// نسخ حرفي لمنطق inputCellHtml الأصلي (سطر 1541-1583) — كل شرط ونوع خلية كما هو،
// فقط استبدال بناء نص HTML بعناصر React مقابلة.
export default function GridCell({ row, col, template, customersRef, productsRef, issueList, onChange }) {
  const val = row[col.key] === undefined ? '' : row[col.key];
  const cls = issueList ? (issueList.some((i) => i.sev === 'err') ? 'qsv-cell-err' : 'qsv-cell-warn') : '';
  const title = issueList ? issueList.map((i) => i.msg).join(' | ') : '';

  const dataAttrs = { 'data-row-id': row.id, 'data-col-key': col.key };

  if (col.type === 'date') {
    return (
      <input
        {...dataAttrs}
        type="date" className={cls} title={title}
        value={fromDMY(val) || val}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (col.type === 'number') {
    return (
      <SafeInput
        {...dataAttrs}
        inputMode="decimal" className={cls} title={title}
        value={val} onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (col.type === 'dropdown') {
    let options = (template.loaded ? template.dropdowns[col.dd] : []) || [];
    if (col.key === 'S') {
      const yn = options.filter((o) => YES_NO_LOWER.includes(String(o).trim().toLowerCase()));
      options = yn.length ? yn : ['نعم', 'لا'];
    } else if (col.dd === 'V') {
      options = options.filter((o) => !YES_NO_LOWER.includes(String(o).trim().toLowerCase()));
    }
    if (col.key === 'S') {
      return (
        <select {...dataAttrs} className={cls} title={title} value={val} onChange={(e) => onChange(e.target.value)}>
          <option value="">— اختر —</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (!template.loaded || options.length === 0) {
      return (
        <SafeInput
          {...dataAttrs}
          className={cls} title={title} value={val} placeholder="ارفع القالب لتفعيل القائمة"
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    return (
      <select {...dataAttrs} className={cls} title={title} value={val} onChange={(e) => onChange(e.target.value)}>
        <option value="">— اختر —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (col.key === 'C' && customersRef.loaded && customersRef.byRef.size > 0) {
    return (
      <SafeInput
        {...dataAttrs}
        list="dl-customers" className={cls} title={title} value={val}
        placeholder="ابحث بالاسم أو الرقم المرجعي..." onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (col.key === 'N' && productsRef.loaded && productsRef.bySku.size > 0) {
    return (
      <SafeInput
        {...dataAttrs}
        list="dl-products" className={cls} title={title} value={val}
        placeholder="ابحث بالاسم أو الكود..." onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return <SafeInput {...dataAttrs} className={cls} title={title} value={val} onChange={(e) => onChange(e.target.value)} />;
}
