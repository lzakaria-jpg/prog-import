// قراءة القالب الرسمي (الترويسة، الإلزامي، القوائم المرجعية) وتعبئته وإنتاج تقرير الملاحظات.
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { FIELDS, FIELD_BY_KEY, TEXT_TYPES } from './fields.js';
import { isoToDate } from './engine.js';

const txt = (cell) => {
  const v = cell?.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v.richText) return v.richText.map((r) => r.text).join('').trim();
  if (typeof v === 'object' && v.result !== undefined) return String(v.result).trim();
  return String(cell.text ?? v).trim();
};

export async function readTemplate(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const emp = wb.getWorksheet('Employees') || wb.worksheets[0];
  const ref = wb.getWorksheet('Reference') || wb.worksheets[1];
  if (!emp) throw new Error('الملف لا يحوي شيت Employees');
  const headers = [];
  emp.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const t = txt(cell);
    const key = t.replace(/\*/g, '').trim();
    if (key) headers.push({ key, col, required: /\*/.test(t) });
  });
  const known = headers.filter((h) => FIELD_BY_KEY[h.key]);
  if (known.length < 30) throw new Error('هذا الملف لا يشبه قالب قيود HR الرسمي (الترويسة غير مطابقة)');
  const lists = {};
  if (ref) {
    ref.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      const key = txt(cell);
      if (!key) return;
      const vals = [];
      for (let r = 2; r <= ref.rowCount; r++) {
        const t = txt(ref.getCell(r, col));
        if (t) vals.push(t);
      }
      lists[key] = vals;
    });
  }
  const unknownHeaders = headers.filter((h) => !FIELD_BY_KEY[h.key]).map((h) => h.key);
  // القالب التجريبي (من ملفات الاختبار): يُعرف بعلامته في خصائص الملف، أو بقائمة الفروع المخترعة في نسخه القديمة.
  // لا نعتمد على أي قائمة قد تكون من شركة حقيقية.
  const isSample = /QHR_SAMPLE/i.test(wb.title || '') || (lists.location || []).join('|') === 'المقر الرئيسي - الرياض|فرع جدة|فرع الدمام';
  const missingHeaders = FIELDS.filter((f) => !headers.some((h) => h.key === f.key)).map((f) => f.key);
  return {
    headers, lists,
    required: new Set(headers.filter((h) => h.required).map((h) => h.key)),
    unknownHeaders, missingHeaders, isSample,
    maxRows: 999,
  };
}

// يعبّئ القالب الرسمي نفسه عبر تعديل XML مباشرة: تبقى الترويسة والقوائم وقيود الإدخال كما هي بالضبط.
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colLetters = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const isoToSerial = (iso) => { const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };

export async function fillTemplate(templateBuffer, tpl, rows) {
  const zip = await JSZip.loadAsync(templateBuffer, { createFolders: false });
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sheetTag = [...wbXml.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]);
  const pick = sheetTag.find((t) => /name="Employees"/.test(t)) || sheetTag[0];
  const rid = pick.match(/r:id="([^"]+)"/)[1];
  const relTag = [...relsXml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`Id="${rid}"`));
  let target = relTag.match(/Target="([^"]+)"/)[1].replace(/^\//, '');
  const path = target.startsWith('xl/') ? target : `xl/${target}`;
  let xml = await zip.file(path).async('string');

  // أنماط الخلايا من صف العيّنة (الصف 2) لكل عمود: تحفظ تنسيق التاريخ/النص كما في القالب
  const row2 = (xml.match(/<row\b[^>]*\br="2"[^>]*>[\s\S]*?<\/row>/) || [''])[0];
  const styleOf = {}, hasVal = {};
  for (const m of row2.matchAll(/<c\b[^>]*\br="([A-Z]+)2"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const sm = m[0].match(/\bs="(\d+)"/);
    if (sm) styleOf[m[1]] = sm[1];
    hasVal[m[1]] = /<v>|<is>/.test(m[2] || '');
  }
  const dateFields = FIELDS.filter((f) => f.type === 'date');
  const colOfKey = (k) => colLetters(tpl.headers.find((h) => h.key === k)?.col || 0);
  // نمط تاريخ مؤكد: من عمود تاريخ في صف العيّنة فيه قيمة فعلًا
  const dateStyle = dateFields.map((f) => colOfKey(f.key)).filter((L) => hasVal[L]).map((L) => styleOf[L]).find((x) => x !== undefined);
  const row1 = (xml.match(/<row\b[^>]*\br="1"[^>]*>[\s\S]*?<\/row>/) || [''])[0];
  const colOf = Object.fromEntries(tpl.headers.map((h) => [h.key, colLetters(h.col)]));
  const parts = [];
  rows.forEach((row, i) => {
    const r = i + 2;
    const cells = [];
    for (const f of FIELDS) {
      const L = colOf[f.key];
      if (!L) continue;
      const c = row.cells[f.key];
      if (c.value === '' || c.value === null || c.value === undefined) continue;
      // عمود تاريخ بدون قيمة عيّنة (مثل نهاية العقد): نمطه بالقالب عام فيظهر رقمًا، فنستخدم نمط التاريخ المؤكد
      const sid = f.type === 'date' && !hasVal[L] && dateStyle !== undefined ? dateStyle : (styleOf[L] !== undefined ? styleOf[L] : (f.type === 'date' ? dateStyle : undefined));
      const st = sid !== undefined ? ` s="${sid}"` : '';
      if (f.type === 'date') cells.push({ col: tpl.headers.find((h) => h.key === f.key).col, xml: `<c r="${L}${r}"${st}><v>${isoToSerial(c.value)}</v></c>` });
      else if (f.type === 'amount') cells.push({ col: tpl.headers.find((h) => h.key === f.key).col, xml: `<c r="${L}${r}"${st}><v>${Number(c.value)}</v></c>` });
      else cells.push({ col: tpl.headers.find((h) => h.key === f.key).col, xml: `<c r="${L}${r}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.value)}</t></is></c>` });
    }
    cells.sort((a, b) => a.col - b.col);
    parts.push(`<row r="${r}">${cells.map((x) => x.xml).join('')}</row>`);
  });
  const sheetData = `<sheetData>${row1}${parts.join('')}</sheetData>`;
  xml = xml.replace(/<sheetData\s*\/>|<sheetData>[\s\S]*<\/sheetData>/, sheetData);
  const lastCol = colLetters(Math.max(...tpl.headers.map((h) => h.col)));
  xml = xml.replace(/<dimension\b[^>]*\/>/, `<dimension ref="A1:${lastCol}${rows.length + 1}"/>`);
  zip.file(path, xml, { createFolders: false });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/* ============ ملف استكمال البيانات للعميل: فقط الخانات الناقصة/الخاطئة، ويُرفع بعد التعبئة ============ */
// هل الخانة تحتاج تدخل العميل؟ (الأخطاء دائمًا، والمراجعة فقط لما يقدر العميل يأكده)
export function needsClient(c, includeReview = true) {
  if (c.status === 'error') return true;
  if (c.status !== 'review' || !includeReview) return false;
  if (c.approx) return false; // مطابقة قائمة تقريبية: قرار داخلي
  if (/ناقص مع الراتب|بيانات راتب بدون مبلغ|بدء الراتب قبل|حُوّل لميلادي/.test(c.msg || '')) return false;
  return true;
}
export function followupRows(rows, includeReview = true) {
  return rows.filter((r) => !r.excluded && FIELDS.some((f) => needsClient(r.cells[f.key], includeReview)));
}

// [$-409] = تنسيق إنجليزي (أشهر وأرقام إنجليزية) حتى على ويندوز عربي
const DATE_FMT = '[$-409]dd-mmm-yyyy;@';
// تحقق "تاريخ": يمنع النص الخاطئ، ويُظهر تقويمًا عند فتح الملف في Google Sheets (نقرتين على الخانة)
const DATE_DV = {
  type: 'date', operator: 'between', allowBlank: true,
  formulae: [new Date(Date.UTC(1900, 0, 2)), new Date(Date.UTC(2100, 11, 31))],
  showInputMessage: true, promptTitle: 'تاريخ ميلادي', prompt: 'اكتب مثل 2030-12-31 أو 31-Dec-2030 أو 31/12/2030',
  showErrorMessage: true, errorStyle: 'stop', errorTitle: 'تاريخ غير صحيح', error: 'اكتب تاريخًا ميلاديًا صحيحًا مثل 2030-12-31',
};

export async function buildFollowup(rows, tpl, meta = {}) {
  const includeReview = meta.includeReview !== false;
  const target = followupRows(rows, includeReview);
  const fields = FIELDS.filter((f) => target.some((r) => needsClient(r.cells[f.key], includeReview)));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'مُجهّز بيانات الموظفين';

  const help = wb.addWorksheet('التعليمات', { views: [{ rightToLeft: true }] });
  help.getColumn(1).width = 110;
  [
    [`ملف استكمال بيانات الموظفين${meta.company ? ` — ${meta.company}` : ''}`, { bold: true, size: 15 }],
    [`تاريخ التجهيز: ${new Date().toISOString().slice(0, 10)} · عدد الموظفين: ${target.length}`, { color: { argb: 'FF64748B' } }],
    [''],
    ['المطلوب:', { bold: true }],
    ['١. افتح شيت "استكمال البيانات".'],
    ['٢. عبّئ أو صحّح الخانات الصفراء فقط. مرّر الماوس على الخانة لتشوف سبب الطلب.'],
    ['٣. الخانات اللي فيها قائمة منسدلة: اختر من القائمة فقط.'],
    ['٤. التواريخ بالميلادي، وتظهر بأرقام وأشهر إنجليزية مثل 15-Mar-1990. اكتبها بأي صيغة من هذي: 1990-03-15 أو 15/03/1990 أو 15-Mar-1990، والخانة تتحول للتنسيق تلقائيًا.'],
    ['   لو فتحت الملف في Google Sheets: نقرتين على خانة التاريخ يفتح تقويم تختار منه مباشرة.'],
    ['٥. الخانات الرمادية للمرجعية فقط، لا تغيّرها. لا تحذف أعمدة أو صفوف ولا تغيّر ترتيبها.'],
    ['٦. الأسماء المكتوبة بخط مائل مترجمة تلقائيًا: تأكد من تهجئتها وصحّحها إن لزم.'],
    ['٧. احفظ الملف وأرسله كما هو.'],
  ].forEach(([t, font], i) => { const c = help.getCell(i + 1, 1); c.value = t; if (font) c.font = font; c.alignment = { wrapText: true }; });

  const lists = wb.addWorksheet('القوائم', { state: 'veryHidden' });
  const listRef = {};
  fields.filter((f) => f.type === 'list' && tpl.lists[f.key]?.length).forEach((f, j) => {
    const col = j + 1;
    lists.getCell(1, col).value = f.key;
    tpl.lists[f.key].forEach((v, i) => { lists.getCell(i + 2, col).value = v; });
    const L = colLetters(col);
    listRef[f.key] = `'القوائم'!$${L}$2:$${L}$${tpl.lists[f.key].length + 1}`;
  });

  const ws = wb.addWorksheet('استكمال البيانات', { views: [{ rightToLeft: true, state: 'frozen', xSplit: 3, ySplit: 2 }] });
  const ident = [
    { key: '__src', label: 'مرجع الصف', width: 12, get: (r) => String(r.src) },
    { key: '__name_ar', label: 'الاسم', width: 26, get: (r) => `${r.cells.first_name_ar.value} ${r.cells.last_name_ar.value}`.trim() },
    { key: '__name_en', label: 'Name', width: 26, get: (r) => `${r.cells.first_name.value} ${r.cells.last_name.value}`.trim() },
    { key: '__id', label: 'رقم الهوية/الإقامة', width: 16, get: (r) => String(r.cells.national_id_number.value || r.cells.national_id_number.raw || '') },
    { key: '__empno', label: 'الرقم الوظيفي', width: 13, get: (r) => String(r.cells.employee_no.value || '') },
  ];
  const cols = [...ident, ...fields.map((f) => ({ key: f.key, label: f.label + (tpl.required.has(f.key) ? ' *' : '') + (f.type === 'date' ? '\n(31-Dec-2030)' : ''), width: f.type === 'list' ? 22 : f.type === 'date' ? 16 : 20, f })), { key: '__notes', label: 'ملاحظات', width: 60 }];
  const YELLOW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3C4' } };
  const GREY = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  const HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  cols.forEach((c, j) => {
    ws.getColumn(j + 1).width = c.width;
    const h = ws.getCell(1, j + 1);
    h.value = c.label; h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = HEAD; h.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    ws.getCell(2, j + 1).value = c.key;
  });
  ws.getRow(1).height = 46;
  ws.getRow(2).hidden = true;
  target.forEach((r, i) => {
    const rr = i + 3;
    const notes = [];
    cols.forEach((c, j) => {
      const cell = ws.getCell(rr, j + 1);
      if (!c.f) {
        if (c.key === '__notes') return;
        cell.value = c.get(r); cell.numFmt = '@'; cell.fill = GREY; cell.font = { color: { argb: 'FF475569' } };
        return;
      }
      const pc = r.cells[c.key];
      const need = needsClient(pc, includeReview);
      const v = pc.value !== '' && pc.value !== undefined ? pc.value : (pc.status === 'error' ? pc.raw : '');
      const isDate = c.f.type === 'date';
      if (isDate && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) cell.value = isoToDate(String(v));
      else if (isDate) cell.value = null; // تاريخ خاطئ/ناقص: الخانة فاضية بصيغة تاريخ، والقيمة الأصلية بالملاحظة
      else if (c.f.type === 'amount' && v !== '' && !isNaN(Number(v))) cell.value = Number(v);
      else { cell.value = v === '' || v === undefined ? null : String(v); cell.numFmt = '@'; }
      // تواريخ بأرقام وأشهر إنجليزية دائمًا (31-Dec-2030) مهما كانت لغة ويندوز عند العميل
      if (isDate) { cell.numFmt = DATE_FMT; cell.alignment = { horizontal: 'center' }; }
      if (need) {
        cell.fill = YELLOW;
        cell.note = (pc.msg || 'مطلوب') + (isDate && pc.raw && !cell.value ? `\nالقيمة الحالية: ${pc.raw}` : '') + (isDate ? '\nاكتب التاريخ مثل 2030-12-31 أو 31-Dec-2030' : '');
        if (pc.translit) cell.font = { italic: true };
        notes.push(`${c.f.label}: ${pc.msg || 'مطلوب'}`);
        if (listRef[c.key]) cell.dataValidation = { type: 'list', allowBlank: true, formulae: [listRef[c.key]], showErrorMessage: true, errorTitle: 'قيمة غير مسموحة', error: 'اختر من القائمة' };
        if (isDate) cell.dataValidation = DATE_DV;
      } else { cell.fill = GREY; cell.font = { color: { argb: 'FF94A3B8' } }; }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFCBD5E1' } } };
    });
    const nc = ws.getCell(rr, cols.length);
    nc.value = notes.join('\n'); nc.alignment = { wrapText: true, vertical: 'top' }; nc.font = { size: 10, color: { argb: 'FF64748B' } };
  });
  const out = await wb.xlsx.writeBuffer();
  return new Uint8Array(out);
}

const STATUS_AR = { ok: 'سليم', fixed: 'مُصحَّح تلقائيًا', review: 'للمراجعة', error: 'خطأ', empty: 'فاضي' };

// تقرير الملاحظات: كل الخلايا غير السليمة + صفوف مستبعدة
export async function buildReport(rows, meta) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'مُجهّز بيانات الموظفين';
  const mk = (name) => { const w = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] }); return w; };
  const sum = mk('الملخص');
  sum.columns = [{ header: 'البند', width: 34 }, { header: 'القيمة', width: 28 }];
  [
    ['ملف العميل', meta.clientFile],
    ['القالب', meta.templateFile],
    ['إجمالي الصفوف المقروءة', rows.length],
    ['جاهزة (سليمة)', rows.filter((r) => r.status === 'ok').length],
    ['للمراجعة', rows.filter((r) => r.status === 'review').length],
    ['فيها أخطاء', rows.filter((r) => r.status === 'error').length],
    ['مستبعدة يدويًا', rows.filter((r) => r.excluded).length],
    ['صفوف في ملف الرفع', meta.exported],
    ['تاريخ التجهيز', new Date().toISOString().slice(0, 16).replace('T', ' ')],
  ].forEach((r) => sum.addRow(r));
  const iss = mk('الملاحظات');
  iss.columns = [
    { header: 'صف العميل', width: 11 }, { header: 'الحقل', width: 26 }, { header: 'الحالة', width: 18 },
    { header: 'القيمة الأصلية', width: 30 }, { header: 'القيمة النهائية', width: 30 }, { header: 'الملاحظة', width: 60 },
  ];
  const ch = mk('سجل التغييرات');
  ch.columns = iss.columns.map((c) => ({ ...c }));
  for (const r of rows) {
    for (const f of FIELDS) {
      const c = r.cells[f.key];
      const target = c.status === 'review' || c.status === 'error' ? iss : c.status === 'fixed' ? ch : null;
      if (!target) continue;
      const row = target.addRow([r.src, f.label, STATUS_AR[c.status], c.raw, String(c.value ?? ''), c.msg || '']);
      if (c.status === 'error') row.getCell(3).font = { color: { argb: 'FFB42318' }, bold: true };
      if (c.status === 'review') row.getCell(3).font = { color: { argb: 'FFB54708' }, bold: true };
      for (const col of [4, 5]) row.getCell(col).numFmt = '@';
    }
  }
  const sk = mk('صفوف متجاهلة');
  sk.columns = [{ header: 'صف العميل', width: 14 }, { header: 'السبب', width: 22 }, { header: 'النص', width: 60 }];
  for (const s of meta.skipped || []) sk.addRow([s.src, s.reason, s.text || '']);
  for (const w of [sum, iss, ch, sk]) w.getRow(1).font = { bold: true };
  const out = await wb.xlsx.writeBuffer();
  return new Uint8Array(out);
}
