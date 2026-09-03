/* كتابة الملف النهائي (تلاعب بـ XML خام عبر regex، وليس عبر SheetJS) — نسخ حرفي من
   qoyod_validator_core.js (أسطر 1982-2044). ممنوع استبدال هذا بمكتبة كتابة أخرى؛
   الحفاظ الحرفي على تنسيق قالب قيود (الأنماط، dataValidation، الأبعاد) يعتمد على
   هذا التلاعب النصي بالذات. تبديل معماري: state.template تصبح وسيط template. */

import { COL_KEYS } from '../engine/constants.js';
import { norm, escapeXml } from '../engine/text.js';
import { indexToColLetter } from '../engine/columnMatching.js';
import { compressHeaderFields } from '../engine/rows.js';
import { reformatAllDates } from '../engine/dates.js';

// يكتب كل قيمة تحت عمودها الفعلي في القالب (حسب الخريطة المستخرجة من صف العناوين نفسه)،
// ويمرّ على كل أعمدة القالب بالترتيب حتى تبقى الأعمدة الأخرى فارغة بتنسيقها الأصلي دون أي إزاحة.
export function buildRowXml(rowNum, values, template){
  const tpl = template || {};
  const colMap = tpl.colMap || {};
  const physToLogical = {};
  COL_KEYS.forEach(k=>{ if(colMap[k]) physToLogical[colMap[k]] = k; });
  const maxIdx = tpl.maxColIndex || COL_KEYS.length;
  let cells = '';
  for(let i=1; i<=maxIdx; i++){
    const letter = indexToColLetter(i);
    const style = (tpl.colStyles && tpl.colStyles[letter]) || '0';
    const logical = physToLogical[letter];
    const v = logical!==undefined && values[logical]!==undefined ? values[logical] : '';
    if(norm(v)===''){ cells += `<c r="${letter}${rowNum}" s="${style}"/>`; }
    else { cells += `<c r="${letter}${rowNum}" s="${style}" t="inlineStr"><is><t>${escapeXml(v)}</t></is></c>`; }
  }
  return `<row r="${rowNum}" >${cells}</row>`;
}

export async function generateFinalXlsx(rowsOverride, template){
  // [إصلاح] كانت قيم التواريخ تُكتَب حرفيًا كما هي بالحالة، فأي تاريخ غير مقيَّس
  // (ISO من زر "فاتورة جديدة"، أو M/D/YYYY ملصوق من إكسل) يصل الملف النهائي بصيغة
  // لا يقبلها قيود، رغم أن التحقق وعد المستخدم بأنه "سيُكتب كـdd/mm/yyyy".
  // reformatAllDates هي نفس دالة التقييس المستخدمة أصلًا عند تغيير فاصل التاريخ،
  // وتترك أي قيمة غير قابلة للتحليل كما هي (التحقق الحاجب يمسكها أصلًا).
  const rows = compressHeaderFields(reformatAllDates(rowsOverride));
  const headerRow = template.headerRow || 2;
  // نحتفظ بكل صفوف القالب حتى صف العناوين كما هي حرفيًا (لا نمسّ القالب ولا تنسيقه)،
  // ثم نكتب أسطر البيانات بعده مباشرة.
  let keptRowsXml = '';
  for(let rn=1; rn<=headerRow; rn++){
    const m = new RegExp(`<row[^>]*\\br="${rn}"[^>]*>.*?</row>`, 's').exec(template.sheet2Xml);
    if(m) keptRowsXml += m[0];
    else {
      const selfClosing = new RegExp(`<row[^>]*\\br="${rn}"[^>]*/>`).exec(template.sheet2Xml);
      if(selfClosing) keptRowsXml += selfClosing[0];
    }
  }
  let dataRowsXml = '';
  rows.forEach((r,i)=>{ dataRowsXml += buildRowXml(headerRow+1+i, r, template); });
  const newSheetData = `<sheetData>${keptRowsXml}${dataRowsXml}</sheetData>`;
  let newSheet2 = template.sheet2Xml.replace(/<sheetData>.*?<\/sheetData>/s, newSheetData);
  const lastRow = rows.length + headerRow;
  const lastCol = indexToColLetter(template.maxColIndex || COL_KEYS.length);
  newSheet2 = newSheet2.replace(/<dimension ref="[^"]*"\s*\/>/, `<dimension ref="A1:${lastCol}${lastRow}"/>`);

  const zip = template.zip;
  // نستخدم مسار الورقة الظاهرة الفعلي الذي استُخرج عند تحليل ملف القالب (وليس تخمينًا باسم الملف)
  const visiblePath = template.visiblePath
    || Object.keys(zip.files).find(p=>p.endsWith('sheet2.xml'))
    || 'xl/worksheets/sheet2.xml';
  zip.file(visiblePath, newSheet2);
  const blob = await zip.generateAsync({type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  return blob;
}

// دالة مساعدة جديدة (الأصل كان صفحة واحدة فاستخدم URL.createObjectURL مباشرة بلا تنظيف؛
// هنا نُعيد {url, filename} ليعرضه المكوّن كرابط تحميل، مع تذكير باستدعاء URL.revokeObjectURL
// عند تفريغ المكوّن أو توليد رابط جديد لتفادي تسريب الذاكرة).
export function triggerXlsxDownload(blob, fnameSuffix){
  const url = URL.createObjectURL(blob);
  const filename = `qoyod_import_ready${fnameSuffix||''}_${new Date().toISOString().slice(0,10)}.xlsx`;
  return {url, filename};
}
