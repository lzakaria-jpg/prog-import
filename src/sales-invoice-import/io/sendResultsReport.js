/*
 ============================================================================
  sendResultsReport — يبني ملف Excel بنتائج الإرسال عبر API (بعد
  pushSalesInvoicesToQoyod): نفس أعمدة الملف الجاهز للرفع (A-V بترتيبها
  وأسمائها من COLUMNS) + عمودين إضافيين (حالة الإرسال، سبب الفشل)، مع حدود
  حمراء بارزة على كل خلايا صفوف الفواتير الفاشلة — يُستخدَم من
  ApiSendResultsModal.jsx فقط، بعد اكتمال الإرسال.
  ============================================================================
  [إضافة] ميزة تصدير بحتة — لا تُعدِّل rows ولا apiSendEntries ولا أي منطق
  إرسال/تحقق. لا تعتمد على قالب قيود الحقيقي (بخلاف generateFinalXlsx بـ
  io/xmlExport.js) — تُبنى من الصفر عبر ExcelJS، فتعمل سواء استُخدم قالب أصلاً
  أو لا (مسار API بلا قالب — راجع Step4Export.jsx).
 ============================================================================
*/
import ExcelJS from 'exceljs';
import { COLUMNS, COL_KEYS } from '../engine/constants.js';
import { groupRowsByInvoiceRef } from '../engine/grouping.js';

const RED_ARGB = 'FFFF0000';
const THICK_RED = { style: 'thick', color: { argb: RED_ARGB } };
const FAILED_ROW_BORDER = { top: THICK_RED, bottom: THICK_RED, left: THICK_RED, right: THICK_RED };

/**
 * entries: [{ref, status:'success'|'error', reason?, id?, total?}] كما تُنتجها
 * pushSalesInvoicesToQoyod (ref = مرجع الفاتورة row.A بعد التطبيع). فواتير بلا
 * مرجع (__blank__) لم تُرسَل أصلًا فتُستبعَد من التقرير بالكامل؛ فواتير لها
 * مرجع لكن بلا نتيجة (لم تُحاول — استُبعدت من دفعة الإرسال أو أُوقف الإرسال
 * قبلها) تظهر بحالة "لم تُرسَل" بلا حدود حمراء (ليست فشلاً، فقط لم تُجرَّب).
 */
export function buildSendResultsReportRows(rows, entries, t) {
  const entryByRef = new Map((entries || []).map((e) => [e.ref, e]));
  const groups = groupRowsByInvoiceRef(rows);

  const successLabel = t({ ar: 'نجح', en: 'Success' });
  const failedLabel = t({ ar: 'فشل', en: 'Failed' });
  const notSentLabel = t({ ar: 'لم تُرسَل', en: 'Not sent' });

  const header = [...COLUMNS.map((c) => c.name), t({ ar: 'حالة الإرسال', en: 'Send status' }), t({ ar: 'سبب الفشل', en: 'Failure reason' })];
  const dataRows = []; // {values, isFailed}

  groups.forEach((rowsInGroup, ref) => {
    if (ref.startsWith('__blank__')) return;
    const entry = entryByRef.get(ref);
    const isFailed = !!entry && entry.status === 'error';
    const statusLabel = !entry ? notSentLabel : (entry.status === 'success' ? successLabel : failedLabel);
    const reason = isFailed ? (entry.reason || '') : '';
    rowsInGroup.forEach((row) => {
      dataRows.push({
        values: [...COL_KEYS.map((k) => row[k] ?? ''), statusLabel, reason],
        isFailed,
      });
    });
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
