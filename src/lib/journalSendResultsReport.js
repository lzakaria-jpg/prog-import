/*
 ============================================================================
  journalSendResultsReport — يبني ملف Excel بنتائج إرسال القيود عبر API (بعد
  pushJournalEntriesToQoyod): رقم القيد/التاريخ/الوصف + حالة الإرسال + التفاصيل
  (رد قيود الكامل للناجحة، سبب الفشل للفاشلة) — نفس فلسفة sendResultsReport.js
  بأداة فواتير المبيعات، مُبسَّطة لمستوى القيد (لا بنود مدين/دائن مفصَّلة).
  ============================================================================
  ميزة تصدير بحتة — لا تُعدِّل entries ولا apiSendEntries ولا أي منطق إرسال.
 ============================================================================
*/
import ExcelJS from 'exceljs';

const RED_ARGB = 'FFFF0000';
const THICK_RED = { style: 'thick', color: { argb: RED_ARGB } };
const FAILED_ROW_BORDER = { top: THICK_RED, bottom: THICK_RED, left: THICK_RED, right: THICK_RED };

function formatSuccessResponseForReport(response, t) {
  if (!response || typeof response !== 'object') return '';
  const lines = [];
  if (response.id !== undefined) lines.push(t({ ar: `رقم القيد بقيود: ${response.id}`, en: `Qoyod entry #: ${response.id}` }));
  if (response.total_debit !== undefined) lines.push(t({ ar: `إجمالي المدين: ${response.total_debit}`, en: `Total debit: ${response.total_debit}` }));
  if (response.total_credit !== undefined) lines.push(t({ ar: `إجمالي الدائن: ${response.total_credit}`, en: `Total credit: ${response.total_credit}` }));
  if (!lines.length) { try { return JSON.stringify(response); } catch { return ''; } }
  return lines.join('\n');
}

/**
 * entries: قيود الأداة الداخلية (seq, date, desc). resultEntries: [{seq,
 * status:'success'|'error', reason?, id?, response?}] كما تُنتجها
 * pushJournalEntriesToQoyod. قيد بلا نتيجة (لم يُحاول — استُبعِد أو أُوقف
 * الإرسال قبله) يظهر بحالة "لم يُرسَل".
 */
export function buildSendResultsReportRows(entries, resultEntries, t) {
  const entryByseq = new Map((resultEntries || []).map((e) => [String(e.seq), e]));
  const successLabel = t({ ar: 'نجح', en: 'Success' });
  const failedLabel = t({ ar: 'فشل', en: 'Failed' });
  const notSentLabel = t({ ar: 'لم يُرسَل', en: 'Not sent' });

  const header = [
    t({ ar: 'رقم القيد', en: 'Entry #' }),
    t({ ar: 'التاريخ', en: 'Date' }),
    t({ ar: 'الوصف', en: 'Description' }),
    t({ ar: 'حالة الإرسال', en: 'Send status' }),
    t({ ar: 'التفاصيل', en: 'Details' }),
  ];
  const dataRows = (entries || []).map((entry) => {
    const result = entryByseq.get(String(entry.seq));
    const isFailed = !!result && result.status === 'error';
    const statusLabel = !result ? notSentLabel : (result.status === 'success' ? successLabel : failedLabel);
    const detail = isFailed ? (result.reason || '') : (result && result.status === 'success' ? formatSuccessResponseForReport(result.response, t) : '');
    return { values: [entry.seq, entry.date, entry.desc, statusLabel, detail], isFailed };
  });
  return { header, dataRows };
}

export async function buildSendResultsReportBlob(entries, resultEntries, t) {
  const { header, dataRows } = buildSendResultsReportRows(entries, resultEntries, t);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(header);
  dataRows.forEach(({ values, isFailed }) => {
    const excelRow = ws.addRow(values);
    if (isFailed) {
      excelRow.eachCell({ includeEmpty: true }, (cell) => { cell.border = FAILED_ROW_BORDER; });
    }
  });
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
