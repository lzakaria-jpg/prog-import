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
// [إصلاح] فاصل الآلاف لم يكن مُعالَجًا في أي مسار رقمي بالأداة: parseFloat("1,200.00")
// يعيد 1 بصمت (يتوقف عند الفاصلة)، فتُحسَب قيم البنود والخصومات والمخزون على أرقام
// مقتطعة، ويُصدَّر النص "1,200.00" حرفيًا لعمود رقمي. هذه الدالة تحوّل النص لصيغة
// رقمية قياسية: تحذف فاصل الآلاف (فاصلة تفصل مجموعات ثلاثية) وتعامل الفاصلة المفردة
// كفاصلة عشرية (صيغة أوروبية)، وتترك أي نص آخر كما هو ليمسكه التحقق كخطأ صريح.
export function normalizeNumericText(raw){
  let t = String(raw === null || raw === undefined ? '' : raw).trim();
  if(t === '') return '';
  t = t.replace(/[\u066C\s\u00A0]/g, '');
  const hadPercent = /%$/.test(t);
  if(hadPercent) t = t.slice(0, -1);
  if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else if(/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
  return hadPercent ? t + '%' : t;
}

export function isBlank(s){ return norm(s)===''; }
export function round2(n){ return Math.round((Number(n)+Number.EPSILON)*100)/100; }
