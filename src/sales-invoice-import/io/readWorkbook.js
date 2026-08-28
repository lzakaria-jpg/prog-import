/**
 * قراءة الملفات المرفوعة — إكسل أو CSV — إلى سجلات موحّدة.
 */

import ExcelJS from 'exceljs';
import { toStr } from '../engine/num.js';

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

export async function readWorkbook(file) {
  const name = file.name || '';
  const buffer = await file.arrayBuffer();

  if (/\.csv$/i.test(name)) return readCsv(new TextDecoder('utf-8').decode(buffer), name);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = pickDataSheet(wb);
  if (!ws) throw new Error('الملف لا يحتوي على أي ورقة بيانات ظاهرة');

  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => {
    headers[i - 1] = toStr(cellValue(c.value));
  });
  for (let i = 0; i < headers.length; i++) if (!headers[i]) headers[i] = `عمود ${i + 1}`;

  const records = [];
  for (let r = 2; r <= ws.rowCount; r++) {
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

  return { headers, records, sheetName: ws.name, fileName: name, buffer };
}

/** محلل CSV يحترم علامات الاقتباس والفواصل داخلها */
function readCsv(text, fileName) {
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

  const headers = clean[0].map((h, i) => toStr(h).replace(/^\uFEFF/, '') || `عمود ${i + 1}`);
  const records = clean.slice(1).map(r => {
    const rec = {};
    headers.forEach((h, i) => { rec[h] = r[i] ?? ''; });
    return rec;
  });

  return { headers, records, sheetName: 'CSV', fileName };
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

  const yes = v => /^(نعم|yes|true|1)$/i.test(toStr(v));

  return records.map(r => {
    const stockRaw = mapping.stock ? r[mapping.stock] : null;
    const hasStockValue = stockRaw !== null && stockRaw !== undefined && toStr(stockRaw) !== '';
    const stock = hasStockValue ? Number(stockRaw) : null;

    // «هل المنتج مخزون؟» يحدد ما إذا كان المنتج يخضع للرصيد أصلاً
    const trackedFlag = mapping.tracked ? yes(r[mapping.tracked]) : null;

    return {
      code: toStr(r[mapping.code]),
      barcode: mapping.barcode ? toStr(r[mapping.barcode]) : '',
      name: toStr(r[mapping.name]),
      stock: Number.isFinite(stock) ? stock : null,
      // يُعتبر مخزَّناً فقط عند وجود رصيد معلوم ولم يُستثنَ صراحةً
      tracked: trackedFlag === false ? false : (Number.isFinite(stock) ? true : false),
      stockKnown: Number.isFinite(stock),
    };
  }).filter(p => p.code || p.barcode || p.name);
}

/** كشف تلقائي لأعمدة الملفات المرجعية */
export function detectReferenceMapping(headers, kind) {
  const norm = headers.map(h => toStr(h).toLowerCase());
  const find = aliases => {
    const i = norm.findIndex(h => aliases.some(a => h === a));
    if (i >= 0) return headers[i];
    const j = norm.findIndex(h => h && aliases.some(a => h.includes(a)));
    return j >= 0 ? headers[j] : '';
  };

  if (kind === 'customers') {
    return {
      ref: find(['الرقم المرجعي', 'reference', 'ref', 'customer reference', 'رقم مرجعي', 'كود العميل']),
      name: find(['اسم العميل', 'customer name', 'الاسم العربي', 'name', 'الاسم', 'العميل']),
    };
  }

  const code = find(['الرقم التسلسلي', 'sku', 'رمز المنتج', 'كود المنتج', 'item code', 'code']);
  const barcode = find(['الباركود', 'barcode', 'باركود']);

  return {
    code: code || barcode,
    barcode: barcode && barcode !== code ? barcode : '',
    name: find(['الاسم العربي', 'اسم المنتج', 'product name', 'الاسم', 'name', 'المنتج']),
    stock: find(['الكمية المتاحة', 'الكمية', 'المخزون', 'الرصيد', 'stock', 'available', 'quantity on hand', 'qty']),
    tracked: find(['هل المنتج مخزون', 'مخزون', 'is stock', 'tracked', 'inventory']),
  };
}
