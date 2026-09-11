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

// [إضافة] يبني نص "سبب الفشل" للفواتير الناجحة أيضًا (لا الفاشلة فقط) — رد قيود
// الكامل على الفاتورة (entry.response، من pushSalesInvoicesToQoyod) بصيغة
// مقروءة: رقم الفاتورة/الإجمالي/الحالة، ثم كل بند بمنتجه وكميته وسعره وضريبته
// كما ردّها قيود فعليًا. لا افتراض جامد لشكل الحقول — أي حقل غير موجود يُتجاهَل
// بصمت، وبلا أي حقول معروفة على الإطلاق نعرض نص JSON الخام بدل تفريغ الخلية.
function formatSuccessResponseForReport(response, t) {
  if (!response || typeof response !== 'object') return '';
  const lines = [];
  if (response.id !== undefined) lines.push(t({ ar: `رقم الفاتورة بقيود: ${response.id}`, en: `Qoyod invoice #: ${response.id}` }));
  if (response.status !== undefined) lines.push(t({ ar: `الحالة: ${response.status}`, en: `Status: ${response.status}` }));
  if (response.total !== undefined) lines.push(t({ ar: `الإجمالي: ${response.total}`, en: `Total: ${response.total}` }));
  if (response.project_id !== undefined) lines.push(t({ ar: `المشروع (id): ${response.project_id}`, en: `Project (id): ${response.project_id}` }));
  if (Array.isArray(response.line_items)) {
    response.line_items.forEach((li, i) => {
      const bits = [];
      if (li?.product_id !== undefined) bits.push(`product_id ${li.product_id}`);
      if (li?.quantity !== undefined) bits.push(`qty ${li.quantity}`);
      if (li?.unit_price !== undefined) bits.push(`price ${li.unit_price}`);
      if (li?.tax_percent !== undefined) bits.push(`tax% ${li.tax_percent}`);
      if (li?.tax_id !== undefined) bits.push(`tax_id ${li.tax_id}`);
      if (li?.total !== undefined) bits.push(`total ${li.total}`);
      if (bits.length) lines.push(`  ${t({ ar: `بند ${i + 1}`, en: `item ${i + 1}` })}: ${bits.join(', ')}`);
    });
  }
  if (!lines.length) { try { return JSON.stringify(response); } catch { return ''; } }
  return lines.join('\n');
}

/**
 * entries: [{ref, status:'success'|'error', reason?, id?, total?, response?}] كما
 * تُنتجها pushSalesInvoicesToQoyod (ref = مرجع الفاتورة row.A بعد التطبيع).
 * فواتير بلا مرجع (__blank__) لم تُرسَل أصلًا فتُستبعَد من التقرير بالكامل؛
 * فواتير لها مرجع لكن بلا نتيجة (لم تُحاول — استُبعدت من دفعة الإرسال أو أُوقف
 * الإرسال قبلها) تظهر بحالة "لم تُرسَل" بلا حدود حمراء (ليست فشلاً، فقط لم تُجرَّب).
 * [إضافة] عمود "سبب الفشل" يعرض الآن رد قيود الكامل للفواتير الناجحة أيضًا (لا
 * فقط سبب الفشل للفاشلة) — راجع formatSuccessResponseForReport أعلاه.
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
    const detail = isFailed ? (entry.reason || '') : (entry && entry.status === 'success' ? formatSuccessResponseForReport(entry.response, t) : '');
    rowsInGroup.forEach((row) => {
      dataRows.push({
        values: [...COL_KEYS.map((k) => row[k] ?? ''), statusLabel, detail],
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
