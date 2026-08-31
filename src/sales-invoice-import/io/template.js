/* قراءة قالب قيود (.xlsx) كأرشيف ZIP خام — نسخ حرفي كامل من qoyod_validator_core.js
   (أسطر 249-418) بلا أي تصرف. التبديل المعماري الوحيد: JSZip عبر import صريح من
   حزمة npm بدل window.JSZip العام عبر CDN. DOMParser متاح افتراضيًا في المتصفح
   وفي بيئة اختبار jsdom (انظر __tests__/template.test.js). */

import JSZip from 'jszip';
import { COL_KEYS } from '../engine/constants.js';
import { norm } from '../engine/text.js';
import { colLetterToIndex, detectTemplateLayout } from '../engine/columnMatching.js';

export async function parseTemplateFile(file){
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const workbookXml = await zip.file('xl/workbook.xml').async('string');
  const relsPath = 'xl/_rels/workbook.xml.rels';
  const relsXml = zip.file(relsPath) ? await zip.file(relsPath).async('string') : '';
  const dom = new DOMParser().parseFromString(workbookXml, 'application/xml');
  const relsDom = relsXml ? new DOMParser().parseFromString(relsXml, 'application/xml') : null;

  const relMap = {};
  if(relsDom){
    relsDom.getElementsByTagName('Relationship').forEach ? null : Array.from(relsDom.getElementsByTagName('Relationship')).forEach(r=>{
      relMap[r.getAttribute('Id')] = r.getAttribute('Target');
    });
  }
  const sheets = Array.from(dom.getElementsByTagName('sheet'));
  let hiddenSheet=null, visibleSheet=null;
  sheets.forEach(s=>{
    const state_ = s.getAttribute('state');
    const rid = s.getAttribute('r:id') || s.getAttributeNS && s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const target = relMap[rid];
    let cleanTarget = (target||'').replace(/^\/+/, '');
    if(cleanTarget.startsWith('xl/')) cleanTarget = cleanTarget.slice(3);
    const info = {name:s.getAttribute('name'), rid, target, path: target ? ('xl/'+cleanTarget) : null};
    if(state_==='hidden' || state_==='veryHidden' || /do_not_edit/i.test(info.name||'')) hiddenSheet = info;
    else visibleSheet = info;
  });
  // fallback: guess by known file names if rels parsing failed
  if(!hiddenSheet) hiddenSheet = {path:'xl/worksheets/sheet1.xml'};
  if(!visibleSheet) visibleSheet = {path:'xl/worksheets/sheet2.xml'};

  const hiddenXml = await zip.file(hiddenSheet.path).async('string');
  const visibleXml = await zip.file(visibleSheet.path).async('string');

  // --- جدول النصوص المشتركة (تُخزَّن فيه عناوين الأعمدة في معظم ملفات إكسل) ---
  let sharedStrings = [];
  if(zip.file('xl/sharedStrings.xml')){
    const ssXml = await zip.file('xl/sharedStrings.xml').async('string');
    const ssDom = new DOMParser().parseFromString(ssXml, 'application/xml');
    sharedStrings = Array.from(ssDom.getElementsByTagName('si')).map(si=>
      Array.from(si.getElementsByTagName('t')).map(n=>n.textContent).join(''));
  }
  function cellText(cellEl){
    const t = cellEl.getAttribute('t');
    if(t==='inlineStr'){
      const is = cellEl.getElementsByTagName('is')[0];
      return is ? Array.from(is.getElementsByTagName('t')).map(n=>n.textContent).join('') : '';
    }
    const v = cellEl.getElementsByTagName('v')[0];
    if(!v) return '';
    if(t==='s'){ const i = parseInt(v.textContent,10); return sharedStrings[i]!==undefined ? sharedStrings[i] : ''; }
    return v.textContent;
  }

  const vDom = new DOMParser().parseFromString(visibleXml, 'application/xml');

  // --- قراءة صفوف الورقة الظاهرة لتحديد صف العناوين وموضع كل حقل فعليًا ---
  const rowsByNum = {};
  let maxColIndex = 0;
  Array.from(vDom.getElementsByTagName('row')).forEach(rEl=>{
    const rn = parseInt(rEl.getAttribute('r'),10);
    if(isNaN(rn)) return;
    const cells = {};
    Array.from(rEl.getElementsByTagName('c')).forEach(c=>{
      const mm = /^([A-Z]+)\d+$/.exec(c.getAttribute('r')||'');
      if(!mm) return;
      cells[mm[1]] = cellText(c);
      maxColIndex = Math.max(maxColIndex, colLetterToIndex(mm[1]));
    });
    rowsByNum[rn] = cells;
  });
  const layout = detectTemplateLayout(rowsByNum);
  // خريطة الحقل -> حرف العمود الفعلي في القالب (وإن تعذّر التعرف نعود للترتيب الافتراضي A..V)
  const colMap = {};
  COL_KEYS.forEach(k=>{ colMap[k] = layout && layout.colMap[k] ? layout.colMap[k] : (layout ? null : k); });
  const headerRow = layout ? layout.headerRow : 2;
  const physToLogical = {};
  Object.keys(colMap).forEach(k=>{ if(colMap[k]) physToLogical[colMap[k]] = k; });
  const missingFields = COL_KEYS.filter(k=>!colMap[k]);

  // --- استخراج قوائم القوائم المنسدلة عبر dataValidation + formula1 ---
  const dvNodes = Array.from(vDom.getElementsByTagName('dataValidation'));
  const dropdowns = {G:[],H:[],L:[],V:[],S:['نعم','لا']};
  // خريطة اسم الورقة -> نص XML (لحل مرجع formula1 بشكل عام)
  const sheetXmlByName = {};
  if(hiddenSheet.name) sheetXmlByName[hiddenSheet.name] = hiddenXml;
  sheetXmlByName['do_not_edit'] = hiddenXml;

  function readRangeFromXml(xmlStr, colLetter, rowStart, rowEnd){
    const dom2 = new DOMParser().parseFromString(xmlStr,'application/xml');
    const out = [];
    for(let r=rowStart; r<=rowEnd; r++){
      const cell = dom2.querySelector(`c[r="${colLetter}${r}"]`);
      if(!cell) continue;
      let val = '';
      const isEl = cell.getElementsByTagName('is')[0];
      if(isEl){ const t = isEl.getElementsByTagName('t')[0]; val = t ? t.textContent : ''; }
      else { const v = cell.getElementsByTagName('v')[0]; val = v ? v.textContent : ''; }
      if(norm(val)!=='') out.push(val);
    }
    return out;
  }

  // تصنيف قائمة بحسب محتواها الفعلي (لا بحسب موقع العمود فقط) — يمنع اختلاط قائمة "نعم/لا"
  // بقائمة الفئات الضريبية عندما يكون نطاق sqref في القالب ممتدًا على أكثر من عمود.
  function isYesNoList(vals){
    return vals.length>0 && vals.length<=4 && vals.every(v=>['نعم','لا','yes','no'].includes(norm(v).toLowerCase()));
  }
  function isTaxList(vals){
    if(!vals.length) return false;
    const hits = vals.filter(v=>/%|معف|exempt|zero|صفر/i.test(norm(v))).length;
    return hits/vals.length >= 0.5;
  }

  const byCol = {};        // حرف العمود -> القائمة المستخرجة له
  let yesNoList = null, taxList = null;
  dvNodes.forEach(dv=>{
    const sqref = dv.getAttribute('sqref') || '';
    // نجمع كل أحرف الأعمدة الواردة في كل نطاقات sqref (قد يشمل نطاقًا ممتدًا مثل S3:V500)
    const cols = new Set();
    sqref.split(/\s+/).filter(Boolean).forEach(ref=>{
      const mm = /^([A-Z]+)\d+(?::([A-Z]+)\d+)?$/.exec(ref.trim());
      if(!mm) return;
      const c1 = mm[1], c2 = mm[2] || mm[1];
      if(c1.length===1 && c2.length===1){
        for(let code=c1.charCodeAt(0); code<=c2.charCodeAt(0); code++) cols.add(String.fromCharCode(code));
      } else { cols.add(c1); cols.add(c2); }
    });
    if(!cols.size) return;
    const f1 = dv.getElementsByTagName('formula1')[0];
    if(!f1) return;
    const formula = f1.textContent || '';
    const m = /^(?:'?([^'!]+)'?!)?\$?([A-Z]+)\$(\d+):\$?([A-Z]+)\$(\d+)$/.exec(formula.trim());
    if(!m){ return; }
    const sheetName = m[1] || hiddenSheet.name;
    const xmlToUse = sheetXmlByName[sheetName] || hiddenXml;
    const values = readRangeFromXml(xmlToUse, m[2], parseInt(m[3],10), parseInt(m[5],10));
    if(!values.length) return;
    if(isYesNoList(values)) yesNoList = values;
    if(isTaxList(values)) taxList = values;
    // نترجم حرف العمود الفعلي إلى مفتاح الحقل المنطقي حسب خريطة القالب المكتشفة
    cols.forEach(c=>{
      const logical = physToLogical[c] || c;
      if(byCol[logical]===undefined) byCol[logical] = values;
    });
  });

  // الإسناد النهائي: المحتوى يحكم على العمود عند التعارض
  ['G','H','L'].forEach(c=>{
    const vals = byCol[c];
    if(vals && !isYesNoList(vals) && !isTaxList(vals)) dropdowns[c] = vals;
  });
  dropdowns.V = taxList || ((byCol.V && !isYesNoList(byCol.V)) ? byCol.V : (byCol.M || []));
  dropdowns.S = yesNoList || (isYesNoList(byCol.S||[]) ? byCol.S : ['نعم','لا']);

  // --- استخراج نمط كل عمود فعلي من أول صف بيانات بعد صف العناوين (للحفاظ على تنسيق القالب كما هو) ---
  const colStyles = {};
  const firstDataRow = headerRow + 1;
  const dataRowMatch = new RegExp(`<row[^>]*\\br="${firstDataRow}"[^>]*>(.*?)</row>`, 's').exec(visibleXml);
  if(dataRowMatch){
    const re = new RegExp(`<c r="([A-Z]+)${firstDataRow}"\\s+s="(\\d+)"`, 'g');
    let mm;
    while((mm = re.exec(dataRowMatch[1])) !== null){ colStyles[mm[1]] = mm[2]; }
  }

  return {
    zip, sheet2Xml: visibleXml, colStyles, dropdowns, visiblePath: visibleSheet.path,
    colMap, headerRow, maxColIndex: Math.max(maxColIndex, 1), missingFields,
  };
}
