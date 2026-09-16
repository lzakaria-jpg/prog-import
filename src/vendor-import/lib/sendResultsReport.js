/*
 ============================================================================
  sendResultsReport — يبني ملف Excel بنتائج إرسال العملاء/الموردين عبر API
  (بعد pushContactsToQoyod): الاسم + المرجع (بالملف فقط) + حالة الإرسال +
  الإجراء (إنشاء/تحديث) + التفاصيل. نفس فلسفة bill-import/lib/billsSendResultsReport.js.
 ============================================================================
*/
import ExcelJS from 'exceljs';

const RED_ARGB = 'FFFF0000';
const THICK_RED = { style: 'thick', color: { argb: RED_ARGB } };
const FAILED_ROW_BORDER = { top: THICK_RED, bottom: THICK_RED, left: THICK_RED, right: THICK_RED };

function formatSuccessResponseForReport(entry, t) {
  const lines = [];
  if (entry.id !== undefined) lines.push(t({ ar: `المعرّف بقيود: ${entry.id}`, en: `Qoyod ID: ${entry.id}` }));
  if (entry.action) lines.push(t({ ar: `الإجراء: ${entry.action === 'update' ? 'تحديث' : 'إنشاء'}`, en: `Action: ${entry.action === 'update' ? 'Update' : 'Create'}` }));
  return lines.join('\n');
}

/**
 * rows: صفوف buildRows (بعد validateAll). entries: [{ref, status:'success'|
 * 'error', reason?, id?, action?}] كما تُنتجها pushContactsToQoyod.
 * صف بلا نتيجة (لم يُحاول) يظهر بحالة "لم يُرسَل".
 */
export function buildSendResultsReportRows(rows, entries, t) {
  const entryByRef = new Map((entries || []).map((e) => [e.ref, e]));
  const successLabel = t({ ar: 'نجح', en: 'Success' });
  const failedLabel = t({ ar: 'فشل', en: 'Failed' });
  const notSentLabel = t({ ar: 'لم يُرسَل', en: 'Not sent' });

  const header = [
    t({ ar: 'الاسم', en: 'Name' }),
    t({ ar: 'الرقم المرجعي (بالملف)', en: 'Ref. No. (file-local)' }),
    t({ ar: 'حالة الإرسال', en: 'Send status' }),
    t({ ar: 'التفاصيل', en: 'Details' }),
  ];
  const dataRows = (rows || []).map((r) => {
    const label = r.name || r.ref || `#${r.i}`;
    const result = entryByRef.get(label);
    const isFailed = !!result && result.status === 'error';
    const statusLabel = !result ? notSentLabel : (result.status === 'success' ? successLabel : failedLabel);
    const detail = isFailed ? (result.reason || '') : (result && result.status === 'success' ? formatSuccessResponseForReport(result, t) : '');
    return { values: [r.name || '', r.ref || '', statusLabel, detail], isFailed };
  });
  return { header, dataRows };
}

export async function buildSendResultsReportBlob(rows, entries, t) {
  const { header, dataRows } = buildSendResultsReportRows(rows, entries, t);
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
