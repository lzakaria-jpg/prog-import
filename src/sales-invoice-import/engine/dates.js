/* منظومة التواريخ الذكية — نسخ حرفي من qoyod_validator_core.js (أسطر 64-166)
   تقرأ التاريخ من أي شكل شائع (رقم إكسل التسلسلي، ISO، فواصل / أو . أو -، سنة من رقمين،
   أسماء شهور عربية/إنجليزية، أرقام هندية) وتخرجه بالصيغة المختارة في DATE_SEP.
   ملاحظة موثّقة: الصيغة المؤكَّدة عمليًا مع قيود هي DD/MM/YYYY، ولذلك هي الافتراضية.

   تبديل معماري وحيد عن الأصل: DATE_SEP كانت متغيرًا عامًا (let) يُغيَّر مباشرة من مستمع DOM.
   هنا تبقى متغير وحدة (module-level) مع setDateSep() يستدعيها الهوك بدل مستمع DOM — جسم كل
   دالة لم يتغيّر حرفًا واحدًا. */

import { COLUMNS } from './constants.js';
import { norm, isBlank } from './text.js';

let DATE_SEP = '/';
export function getDateSep(){ return DATE_SEP; }
export function setDateSep(sep){ DATE_SEP = sep; }

import { MONTH_NAMES } from './constants.js';

export function toWesternDigits(s){
  return String(s).replace(/[٠-٩]/g, c=>String(c.charCodeAt(0)-0x0660))
                  .replace(/[۰-۹]/g, c=>String(c.charCodeAt(0)-0x06F0));
}
export function expandYear(y){
  const n = parseInt(y,10);
  if(y.length<=2) return n<=69 ? 2000+n : 1900+n;
  return n;
}
export function validDMY(d,m,y){ return d>=1 && d<=31 && m>=1 && m<=12 && y>=1900 && y<=2200; }
// يعيد {d,m,y} أو null إن تعذّر التعرف على القيمة كتاريخ.
export function parseDateParts(raw){
  if(raw instanceof Date && !isNaN(raw.getTime())) return {d:raw.getDate(), m:raw.getMonth()+1, y:raw.getFullYear()};
  let s = toWesternDigits(norm(raw));
  if(!s) return null;
  // نزيل جزء الوقت إن وُجد ("December 30, 2025 05:16 PM" أو "2026-08-31 14:05:00")
  s = s.replace(/\b\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\b/g, ' ')
       .replace(/\b(am|pm)\b/gi, ' ')
       .replace(/(^|\s)(ص|م|صباحًا|مساءً|مساء)(\s|$)/g, ' ')
       .replace(/\s*,\s*$/,'')
       .replace(/\s+/g,' ')
       .trim();
  if(!s) return null;
  // الرقم التسلسلي لإكسل، أو yyyymmdd
  if(/^\d+(\.\d+)?$/.test(s)){
    if(/^\d{8}$/.test(s)){
      const y=parseInt(s.slice(0,4),10), m=parseInt(s.slice(4,6),10), d=parseInt(s.slice(6,8),10);
      if(validDMY(d,m,y)) return {d,m,y};
    }
    const n = Number(s);
    if(n>=20000 && n<=90000){
      const dt = new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000);
      if(!isNaN(dt.getTime())) return {d:dt.getUTCDate(), m:dt.getUTCMonth()+1, y:dt.getUTCFullYear()};
    }
    return null;
  }
  // ISO كامل مع وقت
  let m0 = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if(m0){
    const y=parseInt(m0[1],10), m=parseInt(m0[2],10), d=parseInt(m0[3],10);
    if(validDMY(d,m,y)) return {d,m,y};
    return null;
  }
  // dd/mm/yyyy أو mm/dd/yyyy أو بفواصل . و - وسنة من رقمين
  m0 = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})(?:[T\s].*)?$/.exec(s);
  if(m0){
    let a=parseInt(m0[1],10), b=parseInt(m0[2],10);
    const y = expandYear(m0[3]);
    let d, m;
    if(a>12 && b<=12){ d=a; m=b; }
    else if(b>12 && a<=12){ m=a; d=b; }
    else { d=a; m=b; } // الافتراض الأساسي: اليوم أولًا (صيغة قيود)
    if(validDMY(d,m,y)) return {d,m,y};
    return null;
  }
  // 31 أغسطس 2026 / 31 Aug 2026
  m0 = /^(\d{1,2})\s+([A-Za-z؀-ۿ]+)\.?,?\s+(\d{2,4})$/.exec(s);
  if(m0){
    const m = MONTH_NAMES[m0[2].toLowerCase()];
    if(m){ const d=parseInt(m0[1],10), y=expandYear(m0[3]); if(validDMY(d,m,y)) return {d,m,y}; }
    return null;
  }
  // Aug 31, 2026 / أغسطس 31 2026
  m0 = /^([A-Za-z؀-ۿ]+)\.?\s+(\d{1,2})\.?,?\s+(\d{2,4})$/.exec(s);
  if(m0){
    const m = MONTH_NAMES[m0[1].toLowerCase()];
    if(m){ const d=parseInt(m0[2],10), y=expandYear(m0[3]); if(validDMY(d,m,y)) return {d,m,y}; }
    return null;
  }
  return null;
}
export function formatDateParts(p){
  return `${String(p.d).padStart(2,'0')}${DATE_SEP}${String(p.m).padStart(2,'0')}${DATE_SEP}${p.y}`;
}
export function toDMY(iso){ // من أي صيغة إلى صيغة القالب المختارة
  if(!iso) return '';
  const p = parseDateParts(iso);
  return p ? formatDateParts(p) : String(iso);
}
export function fromDMY(dmy){ // من أي صيغة إلى yyyy-mm-dd المطلوبة لحقل <input type="date">
  const p = parseDateParts(dmy);
  if(!p) return '';
  return `${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`;
}
// يعيد ملء التواريخ الحالية في كل الأسطر لصيغة الفاصل المختارة (عند تغيير الإعداد).
// تبديل معماري: الأصل يُعدِّل state.rows بالإشارة المباشرة (r[c.key]=...)؛ هنا تُعاد مصفوفة
// جديدة بنفس الشرط والاستدعاءات حرفيًا (map مُعيد بدل forEach مُعدِّل).
export function reformatAllDates(rows){
  return rows.map(r=>{
    const next = {...r};
    COLUMNS.filter(c=>c.type==='date').forEach(c=>{
      if(!isBlank(next[c.key])){ const p = parseDateParts(next[c.key]); if(p) next[c.key] = formatDateParts(p); }
    });
    return next;
  });
}
