/* قراءة ملف مرجعي عام (منتجات/مخزون/عملاء/فواتير غير منظمة) — نسخ حرفي من
   qoyod_validator_core.js (أسطر 445-480). التبديل المعماري الوحيد: XLSX عبر
   import صريح من حزمة npm بدل window.XLSX العام عبر CDN. */

import * as XLSX from 'xlsx';
import { parseCsvText } from './csvParser.js';
import { norm } from '../engine/text.js';

export function readGenericSpreadsheet(file){
  // ملفات CSV نقرأها كنص UTF-8 صريح (وليس كمصفوفة بايتات) لتفادي تلف الحروف العربية
  // الذي يحدث مع بعض قارئات XLSX عند قراءة CSV كبيانات ثنائية بدون تحديد الترميز،
  // ونحلّلها يدويًا (وليس عبر XLSX.read) لتفادي تخمين الأنواع الذي يفسد النسب المئوية والتواريخ.
  const isCsv = /\.csv$/i.test(file.name || '');
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      try{
        let rows;
        if(isCsv){
          let text = String(e.target.result || '');
          if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // إزالة BOM إن وجد
          rows = parseCsvText(text).map(r=>r.map(c=>norm(c)));
        } else {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, {type:'array'});
          // [إصلاح 2026-09-07] كان يقرأ دائمًا أول ورقة بالملف (wb.SheetNames[0])
          // بلا اعتبار لحالة الإخفاء. لو رفع المستخدم قالب قيود الرسمي نفسه بعد
          // تعبئته ببيانات حقيقية (سيناريو شائع)، ورقته الأولى فعليًا هي
          // "do_not_edit" المخفية (state="veryHidden" — قوائم القيم الداخلية)
          // وليست ورقة الفواتير الظاهرة، فتُقرأ قيم القائمة المخفية كأنها صف
          // عناوين/بيانات الفاتورة، ويفشل كل اكتشاف الأعمدة بصمت بلا أي خطأ ظاهر.
          // نفضّل أول ورقة "ظاهرة" (Hidden ليست 1 ولا 2) حين تتوفر بيانات الحالة
          // من مكتبة xlsx، ونسقط تلقائيًا على الورقة الأولى كالسابق لو تعذّرت
          // قراءة الحالة — توافق كامل مع كل الملفات العادية بلا أي أثر عليها.
          const sheetMeta = wb.Workbook && Array.isArray(wb.Workbook.Sheets) ? wb.Workbook.Sheets : null;
          let sheetName = wb.SheetNames[0];
          if (sheetMeta) {
            const visibleName = wb.SheetNames.find((name, idx) => !sheetMeta[idx] || !sheetMeta[idx].Hidden);
            if (visibleName) sheetName = visibleName;
          }
          const ws = wb.Sheets[sheetName];
          rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
        }
        // ابحث عن أول صف يبدو كصف عناوين (أكثر من خلية نصية غير فارغة)
        let headerRowIdx = 0;
        for(let i=0;i<Math.min(rows.length,5);i++){
          const nonEmpty = rows[i].filter(c=>norm(c)!=='').length;
          if(nonEmpty>=2){ headerRowIdx=i; break; }
        }
        const headers = rows[headerRowIdx].map(h=>norm(h));
        const dataRows = rows.slice(headerRowIdx+1).filter(r=>r.some(c=>norm(c)!==''));
        resolve({headers, rows:dataRows});
      }catch(err){ reject(err); }
    };
    reader.onerror = reject;
    if(isCsv) reader.readAsText(file, 'UTF-8');
    else reader.readAsArrayBuffer(file);
  });
}
