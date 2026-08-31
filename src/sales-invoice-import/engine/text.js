/* أدوات مساعدة نصية نقية — نسخ حرفي من qoyod_validator_core.js (أسطر 50-62) */

export function escapeXml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\r\n]+/g,' ');
}
export function norm(s){ return String(s==null?'':s).trim(); }
// التطبيع يزيل التشكيل والتطويل ويوحّد صور الألف والياء، حتى يتطابق مثلًا عنوان "يُباع" مع "يباع".
export function stripArabicMarks(s){
  return String(s==null?'':s)
    .replace(/[ً-ْٰـ]/g,'')
    .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي');
}
export function normKey(s){ return stripArabicMarks(norm(s)).toLowerCase().replace(/[\s_\-\/]+/g,''); }
export function isBlank(s){ return norm(s)===''; }
export function round2(n){ return Math.round((Number(n)+Number.EPSILON)*100)/100; }
