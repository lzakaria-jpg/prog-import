/**
 * exporter.js — كتابة صفوف العملاء الجاهزة داخل نسخة من قالب Qoyod الرسمي
 * (customer_import_template.xlsx)، ابتداءً من الصف الثاني (الصف الأول عناوين
 * الأعمدة كما هي بالقالب الأصلي).
 *
 * [قرار تصميم] فُحص القالبان الرسميان فعلياً (unzip + فحص XML الورقة):
 * بلا أي dataValidation (قوائم منسدلة) وبلا خلايا مدمجة — عنوان أعمدة بصف
 * واحد فقط ثم صفوف بيانات فارغة. بخلاف قالب فواتير المشتريات (bill-import/lib/
 * template.js، JSZip + كتابة XML خام للحفاظ على قوائمه المنسدلة)، لا حاجة هنا
 * لأي معالجة XML يدوية — قراءة/كتابة SheetJS عادية كافية تمامًا وتحافظ على
 * عرض الأعمدة/التنسيق الأصلي للقالب دون أي خطر كسر قائمة منسدلة لأنه لا توجد
 * أصلاً.
 */
import * as XLSX from 'xlsx';
import { DEFAULT_KEYS } from './fields.js';
import { normalizePhone, normalizeTaxNumber, rowErr } from './validation.js';
import { fixDigits } from './text.js';

/** قيم صف واحد بترتيب أعمدة القالب الرسمي A→... حرفياً (DEFAULT_KEYS) */
export function rowArray(r) {
  return DEFAULT_KEYS.map((k) => {
    if (k === 'phone' || k === 'phone2') return r[k] ? `+${normalizePhone(r[k])}` : '';
    if (k === 'taxNumber') return r[k] ? normalizeTaxNumber(r[k]) : '';
    if (k === 'status') return r.statusNorm || 'Active';
    return r[k] ?? '';
  });
}

/**
 * يكتب صفوف العملاء داخل نسخة من القالب المرفق بالأداة (ArrayBuffer)، ويُعيد Blob جاهزاً للتنزيل.
 * @param {Array<object>} rows صفوف buildRows (بعد validateAll)
 * @param {ArrayBuffer} templateArrayBuffer محتوى customer_import_template.xlsx/vendor_import_template.xlsx كما هو مُرفَق بالأداة
 */
export function exportContacts(rows, templateArrayBuffer) {
  const wb = XLSX.read(templateArrayBuffer, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const matrix = rows.map(rowArray);

  XLSX.utils.sheet_add_aoa(ws, matrix, { origin: 'A2' });

  // [ملاحظة] القالب الأصلي يحمل نطاقاً ضخماً جداً (حتى العمود AMI تقريباً —
  // أثر شائع لجلسة حفظ إكسل سابقة، لا علاقة له بأعمدة القالب الفعلية) —
  // نطاق الإخراج هنا يُضبط صراحةً على عدد أعمدة الحقول الفعلي فقط
  // (DEFAULT_KEYS.length) بدل توريث ذاك الاتساع الفارغ، فيبقى الملف الناتج
  // نظيفاً ومطابقاً لعدد أعمدة القالب الموثَّق (20 لقالب العملاء، 15 للموردين).
  const lastRow = matrix.length; // الصف الأول (فهرس 0) عناوين + matrix.length صف بيانات
  const lastCol = DEFAULT_KEYS.length - 1;
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastCol } });

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * [إضافة 2026-10-08، طلب صريح من المستخدم] صفوف "قالب قيود جاهز للرفع" —
 * ملف يُرفع مباشرة من قيود (جهات الاتصال ← استيراد) فيحفظ قيود الرقم المرجعي
 * كما بملف العميل (بخلاف الإرسال عبر API الذي لا يقبل الرقم المرجعي إطلاقاً).
 * القواعد (حتى لا يرفض قيود أي صف):
 *  - صفوف الإنشاء الجديد فقط: يُستبعد الخطأ المانع، والمعلَّق بانتظار قرار
 *    تكرار، والتحديث (موجود فعلاً بقيود — الاستيراد ينشئ ولا يحدّث)، والتجاوز.
 *  - الرقم المرجعي: من ملف العميل (أو المعدَّل يدوياً) يُكتب كما هو؛ المقترَح
 *    تلقائياً من الأداة يُترك فارغاً فيرقّمه قيود بتسلسله (المقترَح لا ضمان
 *    لعدم تصادمه مع عميل موجود بالحساب).
 *  - رقم مرجعي أو اسم مكرر داخل الملف: يُعتمد أول ظهور ويُستبعد التالي مع سببه.
 * @returns {{ rows: Array<object>, excluded: Array<{ row: object, reason: {ar: string, en: string} }>, autoRefsBlanked: number }}
 */
export function qoyodTemplateRows(rows) {
  const out = [];
  const excluded = [];
  const seenRef = new Map();
  const seenName = new Map();
  let autoRefsBlanked = 0;
  const refKey = (v) => fixDigits(String(v ?? '')).trim().toUpperCase();
  const nameKey = (v) => fixDigits(String(v ?? '')).trim().replace(/\s+/g, ' ').toLowerCase();
  (rows || []).forEach((r) => {
    const skip = (ar, en) => excluded.push({ row: r, reason: { ar, en } });
    if (rowErr(r)) return skip('به خطأ مانع', 'Has a blocking error');
    if (r.action === null || r.action === undefined) return skip('بانتظار قرار التكرار (إنشاء/تحديث/تجاوز)', 'Awaiting a duplicate decision (create/update/skip)');
    if (r.action === 'update') return skip('موجود فعلاً بقيود (تحديث) — الاستيراد بالقالب ينشئ فقط', 'Already exists in Qoyod (update) — template import only creates');
    if (r.action === 'skip') return skip('تجاوز بقرار المستخدم', 'Skipped by user decision');
    const nk = nameKey(r.name);
    if (seenName.has(nk)) return skip(`اسم مكرر بالملف مع الصف ${seenName.get(nk)}`, `Duplicate name in the file with row ${seenName.get(nk)}`);
    const ownRef = !r.refAutoSuggested && refKey(r.ref) !== '';
    if (ownRef) {
      const rk = refKey(r.ref);
      if (seenRef.has(rk)) return skip(`رقم مرجعي مكرر بالملف (${String(r.ref).trim()}) مع الصف ${seenRef.get(rk)}`, `Duplicate reference number in the file (${String(r.ref).trim()}) with row ${seenRef.get(rk)}`);
      seenRef.set(rk, r.i);
    } else if (r.refAutoSuggested && refKey(r.ref) !== '') {
      autoRefsBlanked++;
    }
    seenName.set(nk, r.i);
    out.push({ ...r, ref: ownRef ? String(r.ref).trim() : '' });
  });
  return { rows: out, excluded, autoRefsBlanked };
}

/** حفظ Blob في جهاز المستخدم — منقولة حرفياً من bill-import/lib/exporter.js */
export function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** تقرير الأخطاء/الملاحظات كملف مستقل */
export function errorReportBlob(rows) {
  const data = [['صف الملف', 'الاسم كما ورد', 'نوع الملاحظة', 'الرسالة']];
  (rows || []).forEach((r) =>
    (r.issues || []).forEach((x) =>
      data.push([r.i, r.name || r.ref || '', x.l === 'e' ? 'خطأ مانع' : 'تنبيه', x.m])
    )
  );
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 9 }, { wch: 28 }, { wch: 12 }, { wch: 70 }];
  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, ws, 'issues');
  const buf = XLSX.write(wbOut, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export const stamp = () => new Date().toISOString().slice(0, 10);
