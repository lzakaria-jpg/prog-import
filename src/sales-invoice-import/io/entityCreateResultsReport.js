/*
 ============================================================================
  entityCreateResultsReport — يبني ملف Excel بنتائج إنشاء الكيانات الناقصة
  (عملاء/فئات منتج/وحدات منتج/منتجات/مواقع، عبر pushMissingEntitiesToQoyod)
  وتغذية المخزون (عبر pushInventoryAdjustments) — تقرير شقيق لـsendResultsReport.js
  بنفس اتفاقياته تمامًا (ExcelJS، حدود حمراء بارزة FAILED_ROW_BORDER لصفوف
  الفشل)، لكن بعمود "النوع" إضافي (عميل/فئة/وحدة/منتج/موقع/تعديل مخزون) بدل
  الاعتماد على أعمدة صفوف فاتورة — شكل الإدخال هنا (entries من entityCreateResult/
  stockTopUpResult بالهوك) مختلف تمامًا عن entries فواتير المبيعات (لا rows
  مطابقة لها بالملف الأصلي، فلا معنى لإعادة استخدام buildSendResultsReportRows).
  ============================================================================
*/
import ExcelJS from 'exceljs';

const RED_ARGB = 'FFFF0000';
const THICK_RED = { style: 'thick', color: { argb: RED_ARGB } };
const FAILED_ROW_BORDER = { top: THICK_RED, bottom: THICK_RED, left: THICK_RED, right: THICK_RED };

const KIND_LABELS = {
  customer: { ar: 'عميل', en: 'Customer' },
  category: { ar: 'فئة منتج', en: 'Product category' },
  unit: { ar: 'وحدة منتج', en: 'Product unit' },
  product: { ar: 'منتج', en: 'Product' },
  location: { ar: 'موقع', en: 'Location' },
};

/**
 * entries: [{kind?, ref, status:'success'|'error', reason?, id?}] — entries من
 * entityCreateResult.entries (كل الأنواع الخمسة، gruppierte)؛ entries من
 * stockTopUpResult.entries لا تحمل kind (كلها تعديلات مخزون) فتُعرَض بنوع ثابت
 * "تعديل مخزون" عبر defaultKind.
 */
export function buildEntityCreateResultsReportRows(entries, t, defaultKind = 'stock_adjustment') {
  const successLabel = t({ ar: 'نجح', en: 'Success' });
  const failedLabel = t({ ar: 'فشل', en: 'Failed' });
  const stockAdjLabel = t({ ar: 'تعديل مخزون', en: 'Stock adjustment' });

  const header = [
    t({ ar: 'النوع', en: 'Type' }),
    t({ ar: 'الاسم/المرجع', en: 'Name/Ref' }),
    t({ ar: 'الحالة', en: 'Status' }),
    t({ ar: 'المعرّف بقيود', en: 'Qoyod ID' }),
    t({ ar: 'سبب الفشل', en: 'Failure reason' }),
  ];

  const dataRows = (entries || []).map((e) => {
    const kindLabel = e.kind && KIND_LABELS[e.kind] ? t(KIND_LABELS[e.kind]) : (defaultKind === 'stock_adjustment' ? stockAdjLabel : (e.kind || ''));
    const isFailed = e.status === 'error';
    return {
      values: [kindLabel, e.ref || '', isFailed ? failedLabel : successLabel, e.id ?? '', isFailed ? (e.reason || '') : ''],
      isFailed,
    };
  });

  return { header, dataRows };
}

export async function buildEntityCreateResultsReportBlob(entries, t, defaultKind = 'stock_adjustment') {
  const { header, dataRows } = buildEntityCreateResultsReportRows(entries, t, defaultKind);
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
