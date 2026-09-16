/**
 * clientFile.js — قراءة ملف العميل غير المنظم وبناء صفوف جهات الاتصال
 * (عميل واحد = صف واحد، بلا أي تجميع بنود كما بأداة فواتير المشتريات — لا
 * وجود لمفهوم "فاتورة" هنا إطلاقاً). قراءة الملف نفسها (readWorkbook/
 * sheetToAoa/guessHeaderRow/buildHeaders) منقولة حرفياً من
 * bill-import/lib/clientFile.js؛ buildRows أُعيد بناؤها بالكامل لتلائم صفاً
 * مستقلاً واحداً لكل جهة اتصال بلا أي "مرجع سابق يُورَّث" أو مطابقة منتج/مورد.
 */
import * as XLSX from 'xlsx';
import { norm } from './text.js';
import { FIELDS } from './fields.js';

const isText = (file) => /\.(csv|txt|tsv)$/i.test(file.name || '') || /text\/(csv|plain)/.test(file.type || '');

/** قراءة المصنّف من ملف مرفوع — منقولة حرفياً من bill-import */
export async function readWorkbook(file) {
  const buf = await file.arrayBuffer();
  if (isText(file)) {
    const text = new TextDecoder('utf-8').decode(new Uint8Array(buf)).replace(/^﻿/, '');
    return XLSX.read(text, { type: 'string', cellDates: true, raw: false });
  }
  return XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true, dense: true });
}

/** تحويل ورقة إلى مصفوفة صفوف خام */
export function sheetToAoa(wb, name) {
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true, blankrows: false });
}

/** ترجيح صف العناوين: أكثر صف يحتوي كلمات معروفة من قاموس الحقول */
export function guessHeaderRow(aoa) {
  const limit = Math.min(aoa.length, 20);
  let best = 0, bestScore = -1;
  for (let i = 0; i < limit; i++) {
    const cells = (aoa[i] || []).map(norm).filter(Boolean);
    let score = cells.length * 0.4;
    FIELDS.forEach(([, , , syn]) => {
      if (cells.some((c) => syn.some((w) => c.includes(norm(w))))) score += 3;
    });
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** أسماء الأعمدة، مع تعويض الفارغ منها بـ«عمود N» */
export function buildHeaders(aoa, headerRow) {
  const h = aoa[headerRow] || [];
  const width = Math.max(...aoa.slice(0, 50).map((r) => r.length), h.length);
  return Array.from({ length: width }, (_, i) => String(h[i] ?? '').trim() || `عمود ${i + 1}`);
}

/**
 * بناء صفوف جهات الاتصال من المصفوفة الخام حسب خريطة الأعمدة.
 * كل صف مستقل تمامًا (بخلاف bill-import: لا "مرجع سابق يُورَّث" ولا تجميع) —
 * عميل/مورد واحد لكل صف ملف بالضبط، تمامًا كبنية قالب Qoyod الرسمي.
 */
export function buildRows(aoa, headerRow, map) {
  const g = (r, k) => (map[k] != null ? r[map[k]] : '');
  const body = aoa.slice(headerRow + 1).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));

  return body.map((r, i) => {
    const row = { i: i + 1, issues: [] };
    FIELDS.forEach(([key]) => { row[key] = String(g(r, key) ?? '').trim(); });
    // refRaw يحتفظ بقيمة الملف الأصلية كما هي (قبل أي اقتراح تلقائي لاحق) —
    // راجع lib/refSuggest.js لمنطق الاقتراح والتحرير.
    row.refRaw = row.ref;
    return row;
  });
}
