/* محلل CSV يدوي — نسخ حرفي من qoyod_validator_core.js (أسطر 420-443).
   نستخدمه بدل الاعتماد على تخمين الأنواع في XLSX.read لأن ذلك التخمين يحوّل نصوصًا مثل
   "15%" إلى رقم عشري 0.15 ويعيد تهيئة التواريخ بصيغة أمريكية غير متوقعة — وكلاهما يُفسد البيانات هنا.
   ممنوع استبدال هذا المحلل بأي مكتبة CSV تقوم بتخمين الأنواع. */

export function parseCsvText(text){
  // اكتشاف الفاصل: بعض تصديرات إكسل بلغة عربية تستخدم الفاصلة المنقوطة ";" بدل ","
  const firstLine = (text.split(/\r\n|\n/, 5).find(l=>l.length>0) || '');
  const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
  const rows = []; let row = []; let field = ''; let inQuotes = false;
  for(let i=0;i<text.length;i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){ if(text[i+1] === '"'){ field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === delim){ row.push(field); field=''; }
      else if(c === '\r'){ /* تُعالج مع \n التالية */ }
      else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else field += c;
    }
  }
  if(field.length>0 || row.length>0){ row.push(field); rows.push(row); }
  return rows;
}
