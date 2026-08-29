/**
 * قراءة الملفات المرفوعة — إكسل أو CSV — إلى سجلات موحّدة.
 */

import ExcelJS from 'exceljs';
import { toStr } from '../engine/num.js';
import { findHeaderRow, detectColumns } from '../../lib/columnDetect.js';

/** أول 10 صفوف تُفحص بحثاً عن صف العناوين — يكفي لأي مقدمة وصفية واقعية */
const HEADER_SCAN_ROWS = 10;

/** يستخرج القيمة الفعلية من خلية ExcelJS مهما كان نوعها */
function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if ('result' in v) return v.result;          // خلية معادلة
    if ('text' in v) return v.text;              // نص غني أو رابط
    if ('richText' in v) return v.richText.map(r => r.text).join('');
    if ('error' in v) return null;
  }
  return v;
}

/**
 * يختار ورقة البيانات الفعلية في المصنّف.
 *
 * قوالب قيود تضع ورقة `do_not_edit` المخفية أولاً وتحمل قوائم مساعدة، فاختيار
 * «أول ورقة فيها بيانات» يلتقط القوائم بدل البيانات. الأوراق المخفية تُستبعد
 * دائماً، وتُفضَّل الورقة الأوسع بعدد الأعمدة لأنها ورقة البيانات لا القوائم.
 */
function pickDataSheet(wb) {
  const visible = wb.worksheets.filter(w => w.state !== 'hidden' && w.state !== 'veryHidden');
  const pool = visible.length ? visible : wb.worksheets;
  const withData = pool.filter(w => w.rowCount > 1 && w.columnCount > 0);
  const candidates = withData.length ? withData : pool;
  return [...candidates].sort((a, b) =>
    (b.columnCount - a.columnCount) || (b.rowCount - a.rowCount)
  )[0];
}

/**
 * @param {File} file
 * @param {object} [opts]
 * @param {Function} [opts.findHeader] `(rows: string[][]) => {rowIndex, confidence}` — يفحص
 *        أول صفوف الملف ليحدد أيها صف العناوين الفعلي. بدونه يُفترض الصف الأول كما كان دائماً،
 *        فلا يتغيّر سلوك أي استدعاء قائم لم يُحدَّث بعد.
 * @returns {{headers, records, sheetName, fileName, buffer, headerRowIndex, headerConfidence}}
 */
export async function readWorkbook(file, opts = {}) {
  const { findHeader } = opts;
  const name = file.name || '';
  const buffer = await file.arrayBuffer();

  if (/\.csv$/i.test(name)) return readCsv(new TextDecoder('utf-8').decode(buffer), name, findHeader);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = pickDataSheet(wb);
  if (!ws) throw new Error('الملف لا يحتوي على أي ورقة بيانات ظاهرة');

  // صف العناوين الفعلي — قد لا يكون الأول إن سبقته مقدمة وصفية أو صفوف فارغة
  let headerRowNum = 1;
  let headerConfidence = null;
  if (findHeader) {
    const scanLimit = Math.min(HEADER_SCAN_ROWS, ws.rowCount);
    const scanRows = [];
    for (let r = 1; r <= scanLimit; r++) {
      const row = ws.getRow(r);
      const arr = [];
      for (let c = 1; c <= ws.columnCount; c++) arr.push(toStr(cellValue(row.getCell(c).value)));
      scanRows.push(arr);
    }
    const found = findHeader(scanRows);
    if (found && found.confidence > 0) {
      headerRowNum = found.rowIndex + 1; // 1-based لأرقام صفوف ExcelJS
      headerConfidence = found.confidence;
    }
  }

  const headers = [];
  ws.getRow(headerRowNum).eachCell({ includeEmpty: true }, (c, i) => {
    headers[i - 1] = toStr(cellValue(c.value));
  });
  for (let i = 0; i < headers.length; i++) if (!headers[i]) headers[i] = `عمود ${i + 1}`;

  const records = [];
  for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rec = {};
    let any = false;
    headers.forEach((h, i) => {
      const v = cellValue(row.getCell(i + 1).value);
      rec[h] = v;
      if (v !== null && v !== undefined && v !== '') any = true;
    });
    if (any) records.push(rec);
  }

  return {
    headers, records, sheetName: ws.name, fileName: name, buffer,
    headerRowIndex: headerRowNum - 1, headerConfidence,
  };
}

/** محلل CSV يحترم علامات الاقتباس والفواصل داخلها */
function readCsv(text, fileName, findHeader) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const clean = rows.filter(r => r.some(c => toStr(c) !== ''));
  if (!clean.length) throw new Error('ملف CSV فارغ');

  let headerRowIdx = 0;
  let headerConfidence = null;
  if (findHeader) {
    const found = findHeader(clean.slice(0, HEADER_SCAN_ROWS).map(r => r.map(toStr)));
    if (found && found.confidence > 0) {
      headerRowIdx = found.rowIndex;
      headerConfidence = found.confidence;
    }
  }

  const headers = clean[headerRowIdx].map((h, i) => toStr(h).replace(/^﻿/, '') || `عمود ${i + 1}`);
  const records = clean.slice(headerRowIdx + 1).map(r => {
    const rec = {};
    headers.forEach((h, i) => { rec[h] = r[i] ?? ''; });
    return rec;
  });

  return { headers, records, sheetName: 'CSV', fileName, headerRowIndex: headerRowIdx, headerConfidence };
}

/**
 * يحوّل سجلات ملف مرجعي إلى قائمة عملاء/منتجات حسب تعيين الأعمدة.
 *
 * المنتجات قد تصل بعمودَي تعريف: الرقم التسلسلي والباركود. قيود يقبل أياً منهما
 * في عمود المنتج بقالب الفواتير، فيُفهرس الاثنان.
 *
 * الكمية المتاحة غير موجودة في قالب رفع المنتجات، فتبقى اختيارية: عند غيابها
 * يتعطّل فحص الكميات بدل أن يمنع العمل.
 */
export function mapReferenceRecords(records, mapping, kind) {
  if (kind === 'customers') {
    return records.map(r => ({
      ref: toStr(r[mapping.ref]),
      name: toStr(r[mapping.name]),
    })).filter(c => c.ref || c.name);
  }

  const yes = v => /^(نعم|yes|true|1|active|sold)$/i.test(toStr(v).trim());
  const no = v => /^(لا|no|false|0|inactive|not sold|notsold)$/i.test(toStr(v).trim());

  return records.map(r => {
    const stockRaw = mapping.stock ? r[mapping.stock] : null;
    const hasStockValue = stockRaw !== null && stockRaw !== undefined && toStr(stockRaw) !== '';
    const stock = hasStockValue ? Number(stockRaw) : null;

    // «هل المنتج مخزون؟» يحدد ما إذا كان المنتج يخضع للرصيد أصلاً
    const trackedFlag = mapping.tracked ? yes(r[mapping.tracked]) : null;

    /*
     * «هل المنتج يباع؟» — غياب العمود أو قيمة غير مفهومة تُعتبر «يباع» افتراضياً
     * (لا يُستبعد منتج بالشك)، أما قيمة صريحة تعني «لا» فتستبعده نهائياً من كل
     * مطابقة أو اقتراح بديل.
     */
    const sellableRaw = mapping.sellable ? r[mapping.sellable] : null;
    const sellable = mapping.sellable ? !no(sellableRaw) : true;

    return {
      code: toStr(r[mapping.code]),
      barcode: mapping.barcode ? toStr(r[mapping.barcode]) : '',
      name: toStr(r[mapping.name]),
      stock: Number.isFinite(stock) ? stock : null,
      // يُعتبر مخزَّناً فقط عند وجود رصيد معلوم ولم يُستثنَ صراحةً
      tracked: trackedFlag === false ? false : (Number.isFinite(stock) ? true : false),
      // «كمية معروفة» تعني رصيداً موجباً فعلياً — لا رصيداً بلا قيمة ولا صفراً.
      // صفر ليس رصيداً معروفاً صالحاً؛ منتج بلا رصيد صفري حقيقي يُعامَل كغير معروف
      // الكمية لا كمنتج مخزَّن كميته صفر (القاعدة لا تُطبَّق هنا على منع البيع،
      // بل على تصنيف «لها كمية معروفة» في الواجهة والقوائم المبنية عليه فقط).
      stockKnown: Number.isFinite(stock) && stock > 0,
      sellable,
    };
  }).filter(p => p.code || p.barcode || p.name);
}

/**
 * كشف تلقائي لأعمدة الملفات المرجعية — يمر عبر وحدة الاكتشاف المركزية
 * (src/lib/columnDetect.js) بدل مطابقة نصية خام، فيستفيد من تطبيع النصوص
 * العربية (توحيد الهمزات والتاء المربوطة وإزالة التشكيل) والمطابقة التقريبية،
 * بدل .toLowerCase() الخام الذي كان يفشل أمام أي فارق تشكيل أو مسافة إضافية.
 */
export function detectReferenceMapping(headers, kind) {
  if (kind === 'customers') {
    const { mapping } = detectColumns(headers, ['customerName', 'customerRef']);
    return {
      ref: mapping.customerRef || '',
      name: mapping.customerName || '',
    };
  }

  const { mapping } = detectColumns(headers, ['productCode', 'productName', 'stock', 'sellable'], {
    extraSynonyms: {
      productCode: { ar: ['الباركود', 'باركود'], en: ['barcode'] },
    },
  });

  // productCode قد يلتقط الباركود إذا كان أوضح رمزاً من الرقم التسلسلي؛ يُطلب
  // عمود باركود منفصل صراحة بمرادفات ضيّقة كي لا يُخصَّص نفس العمود مرتين
  const barcodeOnly = detectColumns(headers, ['barcodeOnly'], {
    extraSynonyms: { barcodeOnly: { ar: ['الباركود', 'باركود'], en: ['barcode'] } },
  }).mapping.barcodeOnly || '';

  const trackedCol = detectColumns(headers, ['tracked'], {
    extraSynonyms: { tracked: { ar: ['هل المنتج مخزون', 'مخزون'], en: ['is stock', 'tracked', 'inventory'] } },
  }).mapping.tracked || '';

  return {
    code: mapping.productCode || '',
    barcode: barcodeOnly && barcodeOnly !== mapping.productCode ? barcodeOnly : '',
    name: mapping.productName || '',
    stock: mapping.stock || '',
    tracked: trackedCol,
    sellable: mapping.sellable || '',
  };
}

/**
 * يبني دالة اكتشاف صف عناوين لملف عملاء/منتجات، جاهزة لتُمرَّر إلى readWorkbook
 * عبر `{ findHeader }` — تفحص أول صفوف الملف بدل افتراض أن الصف الأول هو العناوين.
 */
export function referenceHeaderFinder(kind) {
  const fieldKeys = kind === 'customers'
    ? ['customerName', 'customerRef']
    : ['productCode', 'productName', 'stock', 'sellable'];
  return rows => findHeaderRow(rows, fieldKeys, { minFieldsMatched: 1 });
}

/** دالة اكتشاف صف عناوين لملف كميات المنتجات حسب المواقع */
export function locationStockHeaderFinder() {
  return rows => findHeaderRow(rows, ['productCode', 'productName'], { minFieldsMatched: 1 });
}

/**
 * يقرأ ملف كميات المنتجات حسب المواقع.
 *
 * الشكل المتوقع: عمود أو أكثر لتعريف المنتج (رقم تسلسلي/SKU/باركود/اسم)، وبقية
 * الأعمدة كل واحد منها يمثّل موقعاً والقيمة أسفله كمية ذلك المنتج في ذلك الموقع.
 * أعمدة المواقع تُكتشف ديناميكياً: كل عمود لم يُخصَّص كمعرّف منتج يُعتبر موقعاً،
 * فلا يُفترض عددها ولا أسماؤها مسبقاً.
 *
 * @param {{headers:string[], records:object[]}} wbk نتيجة readWorkbook لهذا الملف
 * @returns {{idColumns:{code:string,name:string}, locationColumns:string[], rows:Array}}
 */
export function parseLocationStock(wbk) {
  const { headers, records } = wbk;
  const { mapping } = detectColumns(headers, ['productCode', 'productName'], {
    extraSynonyms: {
      productCode: { ar: ['الباركود', 'باركود', 'الرقم التسلسلي'], en: ['barcode', 'sku', 'serial'] },
    },
  });
  const idCols = new Set([mapping.productCode, mapping.productName].filter(Boolean));
  const locationColumns = headers.filter(h => !idCols.has(h) && toStr(h) !== '');

  const rows = records.map(r => {
    const quantities = {};
    for (const loc of locationColumns) {
      const raw = r[loc];
      const cleaned = raw === null || raw === undefined ? '' : String(raw).replace(/,/g, '').trim();
      const n = cleaned === '' ? null : Number(cleaned);
      quantities[loc] = Number.isFinite(n) ? n : null;
    }
    return {
      code: mapping.productCode ? toStr(r[mapping.productCode]) : '',
      name: mapping.productName ? toStr(r[mapping.productName]) : '',
      quantities,
    };
  }).filter(r => r.code || r.name);

  return {
    idColumns: { code: mapping.productCode || '', name: mapping.productName || '' },
    locationColumns,
    rows,
  };
}
