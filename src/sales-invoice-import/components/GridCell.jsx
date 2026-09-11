import React from 'react';
import { useLanguage } from '../../language.jsx';
import { fromDMY } from '../engine/dates.js';
import { SafeInput } from '../../lib/SafeInput.jsx';
import { norm, productDatalistIdForLocation } from '../engine/text.js';

const YES_NO_LOWER = ['نعم', 'لا', 'yes', 'no'];

// نسخ حرفي لمنطق inputCellHtml الأصلي (سطر 1541-1583) — كل شرط ونوع خلية كما هو،
// فقط استبدال بناء نص HTML بعناصر React مقابلة. خيارا نعم/لا الاحتياطيان (عند غياب
// قالب محمَّل) يبقيان كما يعرّفهما قالب قيود الرسمي (عربي) — طبقة عمل مؤجَّلة.
export default function GridCell({ row, col, template, customersRef, productsRef, taxesRef, locationOptions, stockRef, issueList, onChange }) {
  const { t } = useLanguage();
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
    // [إضافة] بلا قالب مرفوع، لو فيه بيانات حقيقية مجلوبة عبر API لهذا العمود
    // بالذات (مواقع لـG، فئات ضريبية حقيقية لـV — وM تشترك dd:'V' فتستفيد
    // تلقائيًا) نستخدمها كقائمة منسدلة بديلة، بدل النص الحر الافتراضي بلا قالب.
    if (!template.loaded) {
      if (col.dd === 'G' && locationOptions && locationOptions.length) options = locationOptions;
      else if (col.dd === 'V' && taxesRef && taxesRef.loaded && taxesRef.labels && taxesRef.labels.length) options = taxesRef.labels;
    }
    if (col.key === 'S') {
      const yn = options.filter((o) => YES_NO_LOWER.includes(String(o).trim().toLowerCase()));
      options = yn.length ? yn : ['نعم', 'لا'];
    } else if (col.dd === 'V') {
      options = options.filter((o) => !YES_NO_LOWER.includes(String(o).trim().toLowerCase()));
    }
    if (col.key === 'S') {
      return (
        <select {...dataAttrs} className={cls} title={title} value={val} onChange={(e) => onChange(e.target.value)}>
          <option value="">— {t({ ar: 'اختر', en: 'Choose' })} —</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (options.length === 0) {
      return (
        <SafeInput
          {...dataAttrs}
          className={cls} title={title} value={val} placeholder={t({ ar: 'ارفع القالب لتفعيل القائمة', en: 'Upload the template to enable the list' })}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    return (
      <select {...dataAttrs} className={cls} title={title} value={val} onChange={(e) => onChange(e.target.value)}>
        <option value="">— {t({ ar: 'اختر', en: 'Choose' })} —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (col.key === 'C' && customersRef.loaded && customersRef.byRef.size > 0) {
    return (
      <SafeInput
        {...dataAttrs}
        list="dl-customers" className={cls} title={title} value={val}
        placeholder={t({ ar: 'ابحث بالاسم أو الرقم المرجعي...', en: 'Search by name or reference number...' })} onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (col.key === 'N' && productsRef.loaded && productsRef.bySku.size > 0) {
    // [إضافة] لو الموقع (G) بنفس الصف مُحدَّد وفيه بيانات مخزون حقيقية (stockRef.byKey —
    // نفس الفهرس المستخدَم فعليًا بـstockSimulation.checkStockSequential بلا أي تعديل عليه)،
    // نستخدم قائمة منتجات مبنية خصيصًا لذلك الموقع (RefDatalists.jsx) تعرض الكمية المتوفرة
    // بجانب كل اسم منتج — تتحدّث تلقائيًا عند تغيير G لأن listId يُعاد حسابه بكل رسم. لا موقع
    // محدَّد بعد، أو لا بيانات مخزون إطلاقًا = نفس القائمة العامة القديمة (dl-products) بلا أي
    // تغيير على المطابقة الفعلية للمنتج نفسها (لا تزال بالكود N فقط).
    const locName = norm(row.G);
    const listId = locName && stockRef && stockRef.loaded && stockRef.byKey && stockRef.byKey.size > 0
      ? productDatalistIdForLocation(locName)
      : 'dl-products';
    return (
      <SafeInput
        {...dataAttrs}
        list={listId} className={cls} title={title} value={val}
        placeholder={t({ ar: 'ابحث بالاسم أو الكود...', en: 'Search by name or code...' })} onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return <SafeInput {...dataAttrs} className={cls} title={title} value={val} onChange={(e) => onChange(e.target.value)} />;
}
