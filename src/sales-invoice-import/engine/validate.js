/**
 * طبقات التحقق — تُطبَّق على صفوف القالب النهائية قبل التصدير.
 *
 *   fatal → يمنع التصدير: قيود سيرفض الصف أو سينشئ فاتورة خاطئة.
 *   warn  → لا يمنع التصدير لكنه يحتاج قرار المستخدم.
 */

import {
  TEMPLATE_FIELDS, FIELD_BY_KEY, REQUIRED_FIELDS, DOC_DISCOUNT_FIELDS,
  MAX_DATA_ROWS, YES, NO,
} from './constants.js';
import { toStr, toNum, dateKey } from './num.js';

/**
 * الطبقة 0 — سلامة القالب المرفوع.
 *
 * لا تُقارَن مواقع الأعمدة، لأن القالب يختلف بين الحسابات. يُتحقق فقط من أن
 * كل حقل إلزامي عُثر عليه، وأن القوائم المعتمدة ليست فارغة.
 */
export function validateTemplate(template) {
  const issues = [];

  if (!template || !template.columns) {
    issues.push({ severity: 'fatal', code: 'TEMPLATE_UNREADABLE', message: 'تعذّر قراءة قالب قيود' });
    return issues;
  }

  for (const key of template.missing || []) {
    issues.push({
      severity: 'fatal', code: 'TEMPLATE_FIELD_MISSING',
      message: `عمود «${FIELD_BY_KEY[key]?.label || key}» غير موجود في القالب المرفوع — تأكد أنه قالب استيراد فواتير المبيعات`,
    });
  }

  for (const u of template.unmapped || []) {
    issues.push({
      severity: 'warn', code: 'TEMPLATE_COLUMN_UNKNOWN',
      message: `العمود «${u.header}» غير معروف للأداة وسيُترك فارغاً — قد يكون عموداً جديداً أضافه قيود`,
    });
  }

  for (const field of TEMPLATE_FIELDS) {
    if (!field.list || !template.columns[field.key]) continue;
    // حساب خصم المستند حقل نصي حر في القالب ولا قائمة له، فغيابها ليس خطأً
    if (field.key === 'docDiscountAccount') continue;
    if (!(template.lists?.[field.key] || []).length) {
      issues.push({
        severity: 'warn', code: 'TEMPLATE_EMPTY_LIST',
        message: `قائمة «${field.label}» فارغة في القالب — تأكد أنك نزّلته من حساب العميل نفسه`,
      });
    }
  }

  return issues;
}

/** الطبقة 1 — التحقق على مستوى الصف الواحد */
export function validateRow(row, ctx) {
  const issues = [];
  const { lists, opts, template } = ctx;
  const has = key => !!template.columns[key];
  const at = { severity: 'fatal', scope: 'row', sourceRow: row._meta?.sourceRow, invoiceRef: row.invoiceRef };

  const isEmpty = v => v === null || v === undefined || toStr(v) === '';

  const req = key => {
    if (!has(key)) return;
    if (isEmpty(row[key])) {
      issues.push({ ...at, code: 'REQUIRED_EMPTY', field: key,
        message: `${FIELD_BY_KEY[key].label} مطلوب وفارغ` });
    }
  };

  // ── حقول الفاتورة ──
  for (const key of ['invoiceRef', 'customerRef', 'issueDate', 'dueDate', 'location']) req(key);

  if (opts.phase2Einvoicing && has('paymentMethod') && isEmpty(row.paymentMethod)) {
    issues.push({ ...at, code: 'REQUIRED_EMPTY', field: 'paymentMethod',
      message: 'طريقة الدفع إلزامية في المرحلة الثانية من الفوترة الإلكترونية' });
  }

  for (const key of ['invoiceRef', 'customerRef']) {
    if (!has(key)) continue;
    const v = toStr(row[key]);
    if (v.length > 191) {
      issues.push({ ...at, code: 'TOO_LONG', field: key,
        message: `${FIELD_BY_KEY[key].label} يتجاوز 191 حرفاً (${v.length})` });
    }
  }

  const d = row.issueDate ? dateKey(row.issueDate) : null;
  const e = row.dueDate ? dateKey(row.dueDate) : null;
  if (d && e && e < d) {
    issues.push({ ...at, code: 'DUE_BEFORE_ISSUE', message: 'تاريخ الاستحقاق قبل تاريخ الإصدار' });
  }

  // ── المنتج: الرمز أو الوصف، أحدهما على الأقل ──
  const code = has('productCode') ? toStr(row.productCode) : '';
  const desc = has('productDesc') ? toStr(row.productDesc) : '';
  if (!code && !desc) {
    issues.push({ ...at, code: 'NO_PRODUCT',
      message: 'رمز المنتج ووصف المنتج فارغان معاً — يجب توفر أحدهما' });
  }

  // ── الكمية والسعر ──
  if (has('quantity')) {
    const qty = toNum(row.quantity);
    if (qty === null) issues.push({ ...at, code: 'REQUIRED_EMPTY', field: 'quantity', message: 'الكمية مطلوبة' });
    else if (qty <= 0) issues.push({ ...at, code: 'QTY_NOT_POSITIVE', message: `الكمية يجب أن تكون أكبر من صفر (${qty})` });
  }
  if (has('unitPrice')) {
    const price = toNum(row.unitPrice);
    if (price === null) issues.push({ ...at, code: 'REQUIRED_EMPTY', field: 'unitPrice', message: 'سعر الوحدة مطلوب' });
    else if (price < 0) issues.push({ ...at, code: 'PRICE_NEGATIVE', message: `سعر الوحدة سالب (${price})` });
  }

  // ── وحدة التحويل: تُفشل الصف إذا مُلئت بلا رمز منتج ──
  if (has('unitOfConv')) {
    const unit = toStr(row.unitOfConv);
    if (unit) {
      if (!code) {
        issues.push({ ...at, code: 'UNIT_WITHOUT_PRODUCT',
          message: 'وحدة التحويل مملوءة على صف بلا رمز منتج أو باركود — قيود لا يستطيع تحديد معامل التحويل' });
      }
      if (!(lists.unitOfConv || []).includes(unit)) {
        issues.push({ ...at, code: 'NOT_IN_LIST', field: 'unitOfConv',
          message: `وحدة التحويل «${unit}» غير موجودة في القائمة المعتمدة بالقالب` });
      }
    }
  }

  // ── القوائم المعتمدة ──
  for (const key of ['location', 'paymentMethod', 'taxInclusive', 'taxRate']) {
    if (!has(key)) continue;
    const v = toStr(row[key]);
    if (!v) continue;
    if (!(lists[key] || []).includes(v)) {
      issues.push({ ...at, code: 'NOT_IN_LIST', field: key,
        message: `${FIELD_BY_KEY[key].label} «${v}» غير موجود في القائمة المعتمدة بالقالب` });
    }
  }
  if (has('taxInclusive') && isEmpty(row.taxInclusive)) {
    issues.push({ ...at, code: 'REQUIRED_EMPTY', field: 'taxInclusive', message: '«شامل الضريبة؟» مطلوب' });
  }
  if (has('taxRate') && isEmpty(row.taxRate)) {
    issues.push({ ...at, code: 'REQUIRED_EMPTY', field: 'taxRate', message: 'الضريبة مطلوبة' });
  }

  // ── الخصم: قاعدة قيود الصريحة، لا يُقبل بالنسبة والقيمة معاً ──
  const pct = has('discountPct') ? toNum(row.discountPct) : null;
  const val = has('discountVal') ? toNum(row.discountVal) : null;

  if (pct && val) {
    issues.push({ ...at, code: 'DOUBLE_DISCOUNT',
      message: 'لا يمكن استخدام قيمة الخصم ونسبة الخصم في نفس البند. اختر إحدى الطريقتين فقط.' });
  }
  if (pct !== null && (pct < 0 || pct > 100)) {
    issues.push({ ...at, code: 'DISCOUNT_PCT_RANGE', message: `نسبة الخصم يجب أن تكون بين 0 و 100 (${pct})` });
  }
  if (val !== null && val < 0) {
    issues.push({ ...at, code: 'DISCOUNT_VAL_NEGATIVE', message: `قيمة الخصم سالبة (${val})` });
  }

  return issues;
}

/**
 * الطبقة 2 — التحقق على مستوى الفاتورة.
 * تشمل تطابق بيانات الفاتورة بين صفوفها، وقاعدة خصم المستند «الثلاثة معاً أو لا شيء».
 */
export function validateInvoiceGroups(rows, opts, template) {
  const issues = [];
  const groups = new Map();

  rows.forEach((r, i) => {
    const ref = toStr(r.invoiceRef) || `__row${i}`;
    if (!groups.has(ref)) groups.set(ref, []);
    groups.get(ref).push(r);
  });

  const scopeKeys = ['customerRef', 'location', 'paymentMethod', 'description', 'terms', 'notes']
    .filter(k => template.columns[k]);

  const hasDocDiscount = DOC_DISCOUNT_FIELDS.some(k => template.columns[k]);

  for (const [ref, grp] of groups) {
    const first = grp[0];

    if (opts.repeatInvoiceData) {
      for (const r of grp.slice(1)) {
        for (const k of scopeKeys) {
          if (toStr(r[k]) !== toStr(first[k])) {
            issues.push({
              severity: 'fatal', scope: 'invoice', invoiceRef: ref, sourceRow: r._meta?.sourceRow,
              code: 'INVOICE_SCOPE_INCONSISTENT',
              message: `الحقل «${FIELD_BY_KEY[k]?.label || k}» يختلف بين صفوف الفاتورة ${ref} — بيانات الفاتورة يجب أن تتطابق في كل صف`,
            });
          }
        }
        for (const k of ['issueDate', 'dueDate', 'supplyDate']) {
          if (!template.columns[k]) continue;
          if (dateKey(r[k]) !== dateKey(first[k])) {
            issues.push({
              severity: 'fatal', scope: 'invoice', invoiceRef: ref, sourceRow: r._meta?.sourceRow,
              code: 'INVOICE_DATE_INCONSISTENT',
              message: `التاريخ «${FIELD_BY_KEY[k]?.label || k}» يختلف بين صفوف الفاتورة ${ref}`,
            });
          }
        }
      }
    }

    // ── خصم المستند: الثلاثة معاً أو لا شيء ──
    if (hasDocDiscount) {
      const filled = DOC_DISCOUNT_FIELDS.filter(k => template.columns[k] && toStr(first[k]) !== '');
      if (filled.length > 0 && filled.length < DOC_DISCOUNT_FIELDS.filter(k => template.columns[k]).length) {
        const missing = DOC_DISCOUNT_FIELDS
          .filter(k => template.columns[k] && !filled.includes(k))
          .map(k => FIELD_BY_KEY[k].label);
        issues.push({
          severity: 'fatal', scope: 'invoice', invoiceRef: ref, sourceRow: first._meta?.sourceRow,
          code: 'DOC_DISCOUNT_PARTIAL',
          message: `أعمدة خصم المستند تُملأ معاً أو تُترك معاً — الناقص: ${missing.join(' و ')}`,
        });
      }

      const dv = toNum(first.docDiscountValue);
      if (dv !== null && dv <= 0) {
        issues.push({
          severity: 'fatal', scope: 'invoice', invoiceRef: ref, sourceRow: first._meta?.sourceRow,
          code: 'DOC_DISCOUNT_NOT_POSITIVE',
          message: `قيمة خصم المستند يجب أن تكون أكبر من صفر (${dv})`,
        });
      }

      // الفئة الضريبية للخصم يجب أن تطابق إحدى فئات بنود الفاتورة
      const cat = toStr(first.docDiscountTax);
      if (cat) {
        const lineCats = new Set(grp.map(r => toStr(r.taxRate)).filter(Boolean));
        if (lineCats.size && !lineCats.has(cat)) {
          issues.push({
            severity: 'fatal', scope: 'invoice', invoiceRef: ref, sourceRow: first._meta?.sourceRow,
            code: 'DOC_DISCOUNT_TAX_MISMATCH',
            message: `الفئة الضريبية لخصم المستند «${cat}» لا تطابق أي فئة ضريبية في بنود الفاتورة ${ref}`,
          });
        }
      } else if (dv !== null) {
        // تُركت فارغة: يملؤها قيود تلقائياً فقط إذا اتحدت فئات البنود
        const lineCats = new Set(grp.map(r => toStr(r.taxRate)).filter(Boolean));
        if (lineCats.size > 1) {
          issues.push({
            severity: 'fatal', scope: 'invoice', invoiceRef: ref, sourceRow: first._meta?.sourceRow,
            code: 'DOC_DISCOUNT_TAX_AMBIGUOUS',
            message: `بنود الفاتورة ${ref} تحمل أكثر من فئة ضريبية، فالفئة الضريبية لخصم المستند إلزامية`,
          });
        }
      }
    }
  }

  return issues;
}

/** الطبقة 3 — حدود الملف */
export function validateFileLimits(rows) {
  const issues = [];
  if (rows.length === 0) {
    issues.push({ severity: 'fatal', code: 'EMPTY_FILE', message: 'لا توجد صفوف للتصدير — قيود يرفض الملف الفارغ' });
  }
  if (rows.length > MAX_DATA_ROWS) {
    issues.push({
      severity: 'fatal', code: 'TOO_MANY_ROWS',
      message: `عدد الصفوف ${rows.length} يتجاوز الحد ${MAX_DATA_ROWS} — قسّم الملف على دفعات`,
    });
  }
  return issues;
}

/**
 * لا توجد طبقة تحقق تقارن إجمالي المصدر (عمود مجمَّع في الملف المرفوع) بمجموع
 * بنود الفاتورة المحسوب. إجمالي الفاتورة المعتمد الوحيد هو مجموع بنودها دائماً،
 * وقيمة المصدر — إن وُجدت — لا تُستخدم للتحقق ولا لإنتاج تحذير أو خطأ ولا للتأثير
 * على حالة الفاتورة أو نتيجة المراجعة، مهما كان الفرق بينهما كبيراً أو صغيراً.
 */

/** تشغيل كل الطبقات */
export function validateAll({ rows, template, opts }) {
  const lists = template?.lists || {};
  const issues = [];

  issues.push(...validateTemplate(template));

  if (template?.columns) {
    issues.push(...validateFileLimits(rows));
    for (const r of rows) issues.push(...validateRow(r, { lists, opts, template }));
    issues.push(...validateInvoiceGroups(rows, opts, template));
  }

  const fatal = issues.filter(i => i.severity === 'fatal');
  const warn = issues.filter(i => i.severity === 'warn');

  return { issues, fatal, warn, canExport: fatal.length === 0 };
}
