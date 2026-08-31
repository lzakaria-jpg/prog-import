/* اللصق الذكي متعدد الخلايا في الجدول — نسخ حرفي للجزء غير-DOM من handleGridPaste
   (qoyod_validator_core.js أسطر 1638-1665؛ قراءة clipboardData وتحديد الخطوة الفعّالة
   ينتقلان للمكوّن/الهوك، أسطر 1666-1668).
   تبديل معماري: state.rows تصبح وسيط rows مُعاد كمصفوفة جديدة، وnewRow() المباشرة
   تصبح createRowFn() يمرّرها المستدعي (نفس مصنع الصفوف المستمر في الهوك). */

import { COLUMNS, COL_KEYS } from './constants.js';
import { norm } from './text.js';
import { toDMY } from './dates.js';

// startRowId/startColKey: موضع الخلية التي بدأ اللصق منها (dataset.row/col في الأصل).
// clipboardText: نص اللصق الخام (من clipboardData.getData('text') في الأصل).
// createRowFn: () => صف جديد بـ id فريد، تُستدعى فقط عند الحاجة لتمديد الجدول (نفس شرط الأصل بالضبط).
export function applyPastedGrid(rows, startRowId, startColKey, clipboardText, createRowFn){
  const nextRows = rows.map(r=>({...r}));
  const startRowIdx = nextRows.findIndex(r=>r.id===startRowId);
  const startColIdx = COL_KEYS.indexOf(startColKey);
  const lines = clipboardText.replace(/\r/g,'').split('\n').filter((l,i,arr)=> !(i===arr.length-1 && l===''));
  lines.forEach((line, li)=>{
    const cells = line.split('\t');
    let rowIdx = startRowIdx + li;
    if(rowIdx >= nextRows.length){ nextRows.push(createRowFn()); rowIdx = nextRows.length-1; }
    const row = nextRows[rowIdx];
    cells.forEach((val, ci)=>{
      const colIdx = startColIdx + ci;
      if(colIdx >= COL_KEYS.length) return;
      const colDef = COLUMNS[colIdx];
      let v = norm(val);
      if(colDef.type==='date'){
        // اقبل D/M/Y أو Y-M-D من إكسل
        if(/^\d{4}-\d{2}-\d{2}$/.test(v)) v = toDMY(v);
      }
      row[colDef.key] = v;
    });
  });
  return nextRows;
}

// يحدد هل اللصق المُلتقَط يستدعي المعالجة متعددة الخلايا أصلًا (نفس الشرط في سطر 1642 حرفيًا:
// لصق خلية واحدة عادية يُترك للمتصفح كما هو).
export function isMultiCellPaste(clipboardText){
  return !!clipboardText && (clipboardText.includes('\t') || clipboardText.includes('\n'));
}
