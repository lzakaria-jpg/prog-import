/**
 * exporter.js — بناء ملف الاستيراد النهائي.
 * التخطيط يأتي من القالب المرفوع إن وُجد، وإلا الترتيب القياسي A→U.
 */
import * as XLSX from 'xlsx';
import { DEFAULT_KEYS, DEFAULT_HEADERS } from './fields.js';
import { groupsOf, rowErr } from './validation.js';
import { writeIntoTemplate } from './template.js';

/** قيم الصف بالمفتاح: المرجع يتكرر في كل بند، وبقية بيانات الرأس في الصف الأول فقط */
export function rowMap(r, head) {
  return {
    ref: r.ref,
    desc: head ? r.desc : '',
    vendorRef: head ? r.vendorRef : '',
    issueDate: head ? r.issueDate || '' : '',
    dueDate: head ? r.dueDate || '' : '',
    supplyDate: head ? r.supplyDate || '' : '',
    location: head ? r.location : '',
    terms: head ? r.terms : '',
    notes: head ? r.notes : '',
    docDiscVal: head ? r.docDiscVal ?? '' : '',
    docDiscAcc: head ? r.docDiscAcc : '',
    docDiscTax: head ? r.docDiscTax : '',
    prodRef: r.prodSku,
    prodDesc: r.prodDesc,
    qty: r.qty ?? '',
    unit: r.unit,
    price: r.price ?? '',
    taxIncl: r.taxIncl ? 'نعم' : 'لا',
    discPct: r.discPct ?? '',
    discVal: r.discVal ?? '',
    tax: r.taxName
  };
}

/** تخطيط الأعمدة: من القالب المرفوع إن وُجد، وإلا القياسي */
export function layout(tpl) {
  if (tpl && tpl.columns && tpl.columns.length) {
    return tpl.columns.map((c) => ({ index: c.index, key: c.key, label: c.label }));
  }
  return DEFAULT_KEYS.map((k, i) => ({ index: i, key: k, label: DEFAULT_HEADERS[i] }));
}

export function rowArray(r, head, tpl) {
  const m = rowMap(r, head);
  const L = layout(tpl);
  const out = new Array(L.length).fill('');
  L.forEach((c) => { if (c.key) out[c.index] = m[c.key] ?? ''; });
  return out;
}

/** الفواتير مرتبة بترتيب ظهورها، مع علامة صحة لكل فاتورة */
export function invoiceGroups(rows) {
  const order = [];
  const map = groupsOf(rows);
  map.forEach((g, ref) => order.push({ ref, rows: g, bad: g.some(rowErr) }));
  return order;
}

/** مصفوفة الصفوف الجاهزة للكتابة */
export function toMatrix(gs, tpl) {
  const out = [];
  gs.forEach((g) => g.rows.forEach((r, idx) => out.push(rowArray(r, idx === 0, tpl))));
  return out;
}

/** بناء ورقة جديدة بنفس البنية (يُستخدم عند غياب القالب المرفوع) */
export function buildSheet(gs, tpl) {
  const L = layout(tpl);
  const at = (k) => {
    const c = L.find((x) => x.key === k);
    return c ? c.index : -1;
  };
  const data = [[], []];
  data[0][0] = 'تفاصيل فاتورة المشتريات';
  if (at('docDiscVal') >= 0) data[0][at('docDiscVal')] = 'خصم المستند';
  if (at('prodRef') >= 0) data[0][at('prodRef')] = 'تفاصيل البنود';
  data[1] = L.map((c) => c.label || '');
  toMatrix(gs, tpl).forEach((r) => data.push(r));

  const ws = XLSX.utils.aoa_to_sheet(data, { cellDates: true });
  ws['!cols'] = L.map((c) => ({ wch: Math.max(12, Math.min(26, String(c.label || '').length + 4)) }));
  const dCols = ['issueDate', 'dueDate', 'supplyDate'].map(at).filter((i) => i >= 0);
  for (let R = 2; R < data.length; R++) {
    for (const C of dCols) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C });
      if (ws[ref] && ws[ref].t === 'd') ws[ref].z = 'dd/mm/yyyy';
    }
  }
  return ws;
}

function sheetToBlob(ws, sheetName = 'sheet2') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** حفظ Blob في جهاز المستخدم */
export function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * إخراج ملف الاستيراد: يكتب داخل القالب المرفوع إن وُجد، وإلا يبني ملفاً بنفس البنية.
 * @returns {Promise<{blob: Blob, usedTemplate: boolean}>}
 */
export async function exportInvoices(gs, { tpl, templateFile }) {
  if (templateFile && tpl) {
    try {
      const blob = await writeIntoTemplate(templateFile, tpl, toMatrix(gs, tpl));
      return { blob, usedTemplate: true };
    } catch (e) {
      // احتياط: البناء من جديد بنفس ترتيب الأعمدة
      return { blob: sheetToBlob(buildSheet(gs, tpl)), usedTemplate: false, error: e.message };
    }
  }
  return { blob: sheetToBlob(buildSheet(gs, tpl)), usedTemplate: false };
}

/** تقرير الأخطاء كملف مستقل */
export function errorReportBlob(rows) {
  const data = [['صف الملف', 'مرجع الفاتورة', 'المورد كما ورد', 'المنتج كما ورد', 'نوع الملاحظة', 'الرسالة']];
  rows.forEach((r) =>
    r.issues.forEach((x) =>
      data.push([r.i, r.ref, r.vendorNameRaw || r.vendorRefRaw, r.prodNameRaw || r.prodRefRaw,
        x.l === 'e' ? 'خطأ مانع' : 'تنبيه', x.m])
    )
  );
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 9 }, { wch: 18 }, { wch: 24 }, { wch: 24 }, { wch: 12 }, { wch: 60 }];
  return sheetToBlob(ws, 'issues');
}

export const stamp = () => new Date().toISOString().slice(0, 10);
