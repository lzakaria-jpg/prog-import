/**
 * قراءة قالب قيود المرفوع والكتابة داخله.
 *
 * مبدآن يحكمان هذا الملف:
 *
 * ١. الأعمدة تُعرَّف بأسمائها لا بمواقعها. القالب يختلف بين حسابات العملاء
 *    (19 عموداً بلا خصم مستند، 22 معه) وأي إدراج يزحزح باقي الأعمدة.
 *
 * ٢. القالب لا يُعاد بناؤه بل يُنسخ ويُكتب داخله. الألوان والدمج وعروض الأعمدة
 *    وقيود التحقق وورقة do_not_edit تأتي كما هي من ملف العميل، فيستحيل أن
 *    ينتج «نموذج قديم» يرفضه قيود، وتصمد الأداة أمام تحديثات قيود المستقبلية.
 */

import ExcelJS from 'exceljs';
import {
  HEADER_ROW, FIRST_DATA_ROW, MAX_DATA_ROWS, TEMPLATE_FIELDS, REQUIRED_FIELDS, normalizeHeader,
} from './constants.js';
import { toStr, formatDate } from './num.js';

/** يختار ورقة القالب: أول ورقة ظاهرة، فورقة do_not_edit مخفية دائماً */
function pickTemplateSheet(wb) {
  const visible = wb.worksheets.filter(w => w.state !== 'hidden' && w.state !== 'veryHidden');
  const pool = visible.length ? visible : wb.worksheets;
  return [...pool].sort((a, b) => b.columnCount - a.columnCount)[0];
}

/**
 * يحلّل مرجع نطاق داخل صيغة قيد تحقق إلى اسم ورقة وحدود صفوف.
 * مثال: `do_not_edit!$A$4:$A$7` → { sheet:'do_not_edit', from:4, to:7 }
 */
function parseListRange(formula) {
  const f = toStr(formula).replace(/^=/, '');
  const m = f.match(/^(?:'([^']+)'|([^!]+))!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i);
  if (!m) return null;
  return {
    sheet: m[1] || m[2],
    col: m[3].toUpperCase(),
    from: Number(m[4]),
    to: Number(m[6]),
  };
}

/** يقرأ قيد التحقق المطبَّق على عمود، سواء كُتب على نطاق أو على خلية مفردة */
function findColumnValidation(ws, colLetter) {
  const model = ws.dataValidations?.model || {};
  for (const [range, dv] of Object.entries(model)) {
    // النطاق قد يكون `G3:G5002` أو `G3` أو عدة نطاقات مفصولة بمسافات
    const parts = range.split(/\s+/);
    for (const p of parts) {
      const start = p.split(':')[0];
      const letters = start.match(/^([A-Z]+)/i);
      if (letters && letters[1].toUpperCase() === colLetter) return dv;
    }
  }
  return null;
}

/**
 * يقرأ القالب المرفوع ويستخرج مواقع الأعمدة وقوائمها المعتمدة.
 *
 * @returns {{buffer, sheetName, headers, columns, lists, listIds, missing, unmapped}}
 */
export async function readTemplate(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = pickTemplateSheet(wb);
  if (!ws) throw new Error('لم يتم العثور على ورقة بيانات في القالب');

  const headerRow = ws.getRow(HEADER_ROW);
  const headers = [];
  for (let c = 1; c <= ws.columnCount; c++) headers.push(toStr(headerRow.getCell(c).value));

  // ── مطابقة كل رأس عمود بحقل، أول تطابق يفوز وكل حقل يؤخذ مرة واحدة ──
  const columns = {};   // key → رقم العمود
  const taken = new Set();
  const unmapped = [];

  headers.forEach((raw, idx) => {
    const col = idx + 1;
    const h = normalizeHeader(raw);
    if (!h) return;
    const field = TEMPLATE_FIELDS.find(f => !taken.has(f.key) && f.match(h));
    if (field) {
      columns[field.key] = col;
      taken.add(field.key);
    } else {
      // عمود لم تتعرّف عليه الأداة: يُسجَّل ليُترك فارغاً بدل أن يُتجاهل بصمت
      unmapped.push({ col, header: raw });
    }
  });

  /*
   * حفظ قيد التحقق الأصلي لكل عمود.
   * السبب: ExcelJS يفكّ نطاق مثل A3:A5002 إلى خمسة آلاف خلية مفردة عند القراءة،
   * ثم يعيد دمجها عند الكتابة بشكل ناقص فينتج نطاقان متداخلان لكل عمود.
   * حفظ القيد هنا يسمح بإعادة بنائه نظيفاً عند التصدير.
   */
  const validations = {};
  for (let c = 1; c <= ws.columnCount; c++) {
    const dv = findColumnValidation(ws, colLetter(c));
    if (dv) validations[c] = dv;
  }

  // ── قراءة القوائم المعتمدة من قيود التحقق، لا من مواقع ثابتة ──
  const lists = {};
  const listIds = {};

  for (const field of TEMPLATE_FIELDS) {
    if (!field.list || !columns[field.key]) continue;
    const letter = colLetter(columns[field.key]);
    const dv = findColumnValidation(ws, letter);
    if (!dv || dv.type !== 'list') { lists[field.key] = []; continue; }

    const range = parseListRange(dv.formulae?.[0]);
    if (range) {
      const src = wb.getWorksheet(range.sheet);
      if (src) {
        const values = [];
        const ids = {};
        for (let r = range.from; r <= range.to; r++) {
          const label = toStr(src.getCell(`${range.col}${r}`).value);
          if (!label) continue;
          values.push(label);
          const id = src.getCell(r, colNumber(range.col) + 1).value;
          if (id !== null && id !== undefined) ids[label] = id;
        }
        lists[field.key] = values;
        listIds[field.key] = ids;
        continue;
      }
    }

    // قائمة مكتوبة مباشرة في الصيغة: "نعم,لا"
    const inline = toStr(dv.formulae?.[0]).replace(/^"|"$/g, '');
    lists[field.key] = inline ? inline.split(',').map(s => s.trim()).filter(Boolean) : [];
  }

  const missing = REQUIRED_FIELDS.filter(k => !columns[k]);

  return {
    buffer, sheetName: ws.name, headers, columns, lists, listIds, missing, unmapped, validations,
    columnCount: ws.columnCount,
    hasDocDiscount: !!columns.docDiscountValue,
  };
}

function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}

function colNumber(letters) {
  return letters.toUpperCase().split('').reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0);
}

/**
 * يبني ملف الرفع بنسخ القالب الأصلي وكتابة الصفوف داخله.
 *
 * لا يُعاد إنتاج أي تنسيق: الألوان والدمج وقيود التحقق وورقة القوائم المخفية
 * تبقى كما نزّلها العميل من حسابه.
 */
export async function buildTemplateFile(rows, template) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template.buffer);

  const ws = wb.getWorksheet(template.sheetName) || pickTemplateSheet(wb);

  /*
   * تُمسح قيم صفوف البيانات النموذجية بدل حذف الصفوف.
   * حذف الصفوف يزحزح نطاقات قيود التحقق فينتج عنها نطاق مكرر لكل عمود
   * (A3:A5002 إلى جانب A10:A5002)، وهو تلف صامت في القالب.
   */
  const lastExisting = Math.max(ws.rowCount, FIRST_DATA_ROW - 1);
  for (let r = FIRST_DATA_ROW; r <= lastExisting; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= template.columnCount; c++) row.getCell(c).value = null;
  }

  /*
   * إعادة بناء قيود التحقق: نطاق واحد لكل عمود يغطي صفوف البيانات كاملة،
   * بدل آلاف الخلايا المفردة التي ينتجها ExcelJS.
   */
  if (template.validations) {
    ws.dataValidations.model = {};
    const last = FIRST_DATA_ROW + MAX_DATA_ROWS - 1;
    for (const [col, dv] of Object.entries(template.validations)) {
      const L = colLetter(Number(col));
      ws.dataValidations.add(`${L}${FIRST_DATA_ROW}:${L}${last}`, dv);
    }
  }

  const headerFont = ws.getRow(HEADER_ROW).getCell(1).font || {};
  const dataFont = { name: headerFont.name || 'Arial', size: 11 };

  rows.forEach((row, i) => {
    const excelRow = ws.getRow(FIRST_DATA_ROW + i);

    for (const field of TEMPLATE_FIELDS) {
      const col = template.columns[field.key];
      if (!col) continue;                       // العمود غير موجود في هذا القالب

      const cell = excelRow.getCell(col);
      const raw = row[field.key];

      if (field.type === 'date') {
        cell.value = raw ? formatDate(raw) : null;
      } else if (field.type === 'number') {
        cell.value = raw === null || raw === undefined || raw === '' ? null : Number(raw);
      } else {
        cell.value = raw === null || raw === undefined || raw === '' ? null : raw;
      }

      cell.font = dataFont;
    }

    excelRow.commit?.();
  });

  return wb.xlsx.writeBuffer();
}
