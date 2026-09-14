/*
 ============================================================================
  billsSendResultsReport — يبني ملف Excel بنتائج إرسال فواتير المشتريات عبر
  API (بعد pushBillsToQoyod): مرجع الفاتورة/المورد/التاريخ + حالة الإرسال +
  التفاصيل (رد قيود الكامل للناجحة، سبب الفشل للفاشلة) — نفس فلسفة
  journalSendResultsReport.js بأداة القيود، مُبسَّطة لمستوى الفاتورة (لا بنود
  مفصَّلة، مطابقةً لتصميم Step4Export.jsx الحالي بهذه الأداة).
 ============================================================================
  ميزة تصدير بحتة — لا تُعدِّل groups ولا أي منطق إرسال.
 ============================================================================
*/
import ExcelJS from 'exceljs';

const RED_ARGB = 'FFFF0000';
const THICK_RED = { style: 'thick', color: { argb: RED_ARGB } };
const FAILED_ROW_BORDER = { top: THICK_RED, bottom: THICK_RED, left: THICK_RED, right: THICK_RED };

function formatSuccessResponseForReport(response, t) {
  if (!response || typeof response !== 'object') return '';
  const lines = [];
  if (response.id !== undefined) lines.push(t({ ar: `رقم الفاتورة بقيود: ${response.id}`, en: `Qoyod bill #: ${response.id}` }));
  if (response.status !== undefined) lines.push(t({ ar: `الحالة: ${response.status}`, en: `Status: ${response.status}` }));
  if (response.total !== undefined) lines.push(t({ ar: `الإجمالي: ${response.total}`, en: `Total: ${response.total}` }));
  if (!lines.length) { try { return JSON.stringify(response); } catch { return ''; } }
  return lines.join('\n');
}

/**
 * groups: نفس invoiceGroups({ref, rows, bad}). entries: [{ref, status:'success'|
 * 'error', reason?, id?, total?, response?}] كما تُنتجها pushBillsToQoyod.
 * فاتورة بلا نتيجة (لم تُحاول — استُبعدت أو أُوقف الإرسال قبلها) تظهر بحالة "لم تُرسَل".
 */
export function buildSendResultsReportRows(groups, entries, t) {
  const entryByRef = new Map((entries || []).map((e) => [e.ref, e]));
  const successLabel = t({ ar: 'نجح', en: 'Success' });
  const failedLabel = t({ ar: 'فشل', en: 'Failed' });
  const notSentLabel = t({ ar: 'لم تُرسَل', en: 'Not sent' });

  const header = [
    t({ ar: 'مرجع الفاتورة', en: 'Bill reference' }),
    t({ ar: 'المورد', en: 'Vendor' }),
    t({ ar: 'التاريخ', en: 'Date' }),
    t({ ar: 'حالة الإرسال', en: 'Send status' }),
    t({ ar: 'التفاصيل', en: 'Details' }),
  ];
  const dataRows = (groups || []).map((g) => {
    const head = g.rows[0] || {};
    const result = entryByRef.get(g.ref);
    const isFailed = !!result && result.status === 'error';
    const statusLabel = !result ? notSentLabel : (result.status === 'success' ? successLabel : failedLabel);
    const detail = isFailed ? (result.reason || '') : (result && result.status === 'success' ? formatSuccessResponseForReport(result.response, t) : '');
    return { values: [g.ref, head.vendorRef || '', head.issueDate ? head.issueDate.toISOString().slice(0, 10) : '', statusLabel, detail], isFailed };
  });
  return { header, dataRows };
}

export async function buildSendResultsReportBlob(groups, entries, t) {
  const { header, dataRows } = buildSendResultsReportRows(groups, entries, t);
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
