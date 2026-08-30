/**
 * خط المعالجة — يجمع التفكيك والمطابقة والتحويل في مسار واحد.
 *
 * يفصل بين «ما نعرفه» و«ما نحتاج قرار المستخدم فيه»: كل قيمة تعذّرت مطابقتها
 * تُعاد في قائمة قرارات معلّقة بدل أن تُخمَّن أو تُسقط بصمت.
 */

import {
  buildCustomerIndex, buildProductIndex, matchCustomer, matchProduct, matchListValueSmart,
  resolveInvoiceTaxes, checkStock, buildLocationStockIndex,
} from './resolve.js';
import { transformAll } from './transform.js';
import { validateAll } from './validate.js';
import { ENGINE_DEFAULTS, LOCATION_SYNONYM_GROUPS, PAYMENT_METHOD_SYNONYM_GROUPS } from './constants.js';
import { toStr, round } from './num.js';
import { applyRowOverrides, recomputeReconciliation } from './overrides.js';

/**
 * يجمع كل القيم التي تحتاج قراراً من المستخدم.
 * تُستدعى قبل التحويل لعرض شاشات المطابقة.
 */
export function collectDecisions({ sales, references, decisions, template }) {
  const customerIndex = buildCustomerIndex(references.customers || []);
  const productIndex = buildProductIndex(references.products || []);
  const lists = template?.lists || {};

  const customers = new Map();
  const products = new Map();
  const payments = new Map();
  const locations = new Map();

  for (const inv of sales) {
    // العملاء — الرقم المرجعي من ملف الفواتير أولاً إن وُجد، ثم الاسم
    const name = toStr(inv.sourceCustomerName);
    const cm = matchCustomer(name, customerIndex, decisions.customers || {}, inv.sourceCustomerRef);
    if (cm.status !== 'matched') {
      const key = name;
      if (!customers.has(key)) {
        customers.set(key, {
          key, label: name || '(بلا اسم عميل)', status: cm.status,
          reason: cm.reason || (cm.status === 'empty' ? 'الفاتورة بلا عميل في المصدر' : 'الاسم غير موجود في ملف عملاء قيود'),
          candidates: cm.candidates || null,
          invoices: [], count: 0,
        });
      }
      const e = customers.get(key);
      e.count++;
      if (e.invoices.length < 20) e.invoices.push(inv.invoiceRef);
    }

    // الموقع — مطابقة تامة أولاً، فمرادفات مفاهيمية (رئيسي/الرياض...) قبل اعتباره غير مطابق.
    // فاتورة واحدة لموقع واحد فقط: مصدرها هنا قيمة رأس الفاتورة الموحَّدة أصلاً في parseSource
    const loc = toStr(inv.sourceLocation);
    const lm = matchListValueSmart(loc, lists.location || [], LOCATION_SYNONYM_GROUPS, decisions.locations || {}, decisions.defaultLocation);
    if (lm.status !== 'matched') {
      const key = loc;
      if (!locations.has(key)) {
        locations.set(key, {
          key, label: loc || '(بلا موقع)', status: lm.status,
          reason: lm.status === 'empty' ? 'الفاتورة بلا موقع في المصدر'
            : lm.status === 'ambiguous' ? lm.reason
            : 'القيمة غير موجودة في قائمة مواقع القالب',
          candidates: lm.candidates || null,
          invoices: [], count: 0,
        });
      }
      const e = locations.get(key);
      e.count++;
      if (e.invoices.length < 20) e.invoices.push(inv.invoiceRef);
    }

    // طريقة الدفع — نفس منطق المرادفات، ضمن الخيارات الخمسة الثابتة في قيود فقط
    const pm = toStr(inv.sourcePaymentMethods[0] || '');
    const mm = matchListValueSmart(pm, lists.paymentMethod || [], PAYMENT_METHOD_SYNONYM_GROUPS, decisions.payments || {}, decisions.defaultPayment);
    if (mm.status !== 'matched' && pm) {
      const key = pm;
      if (!payments.has(key)) {
        payments.set(key, {
          key, label: pm, status: mm.status,
          reason: mm.status === 'ambiguous' ? mm.reason : 'القيمة غير موجودة في قائمة طرق الدفع بالقالب',
          candidates: mm.candidates || null,
          invoices: [], count: 0,
        });
      }
      const e = payments.get(key);
      e.count++;
      if (e.invoices.length < 20) e.invoices.push(inv.invoiceRef);
    }

    // المنتجات
    for (const l of inv.lines) {
      const m = matchProduct(l.sourceSku, l.sourceName, productIndex, decisions.products || {});
      if (m.status !== 'matched') {
        const key = toStr(l.sourceSku) || toStr(l.sourceName);
        if (!products.has(key)) {
          products.set(key, {
            key,
            label: toStr(l.sourceName) || key,
            sku: toStr(l.sourceSku),
            status: m.status, reason: m.reason || 'لا يطابق أي منتج في قيود',
            invoices: [], count: 0,
          });
        }
        const e = products.get(key);
        e.count++;
        if (e.invoices.length < 20) e.invoices.push(inv.invoiceRef);
      }
    }
  }

  const sortByCount = (a, b) => b.count - a.count;
  return {
    customers: [...customers.values()].sort(sortByCount),
    products: [...products.values()].sort(sortByCount),
    payments: [...payments.values()].sort(sortByCount),
    locations: [...locations.values()].sort(sortByCount),
    indexes: { customerIndex, productIndex },
  };
}

/**
 * ينفّذ التحويل الكامل بعد استقرار القرارات.
 * @param {object} [overrides] تعديلات يدوية من صفحة المطابقة والمراجعة — تُطبَّق
 *   بعد التحويل وقبل التحقق، فتُعاد كل التصنيفات (صحيح/تنبيه/خطأ) والإجماليات
 *   بناءً على القيم المعدَّلة مباشرة. راجع engine/overrides.js.
 * @returns {{rows, reconciliation, validation, stock, notes, unresolved}}
 */
export function runPipeline({ sales, references, decisions, template, options, overrides }) {
  const opts = { ...ENGINE_DEFAULTS, ...(options || {}) };
  const customerIndex = buildCustomerIndex(references.customers || []);
  const productIndex = buildProductIndex(references.products || []);
  const locationStockIndex = buildLocationStockIndex(references.locationStock);
  const lists = template?.lists || {};
  const taxLabels = lists.taxRate || [];
  const defaultTax = decisions.defaultTax || taxLabels.find(t => t.includes('15')) || taxLabels[0];

  const notes = [];
  const unresolved = [];
  const stockDemands = [];
  const invoices = [];

  for (const inv of sales) {
    const cm = matchCustomer(inv.sourceCustomerName, customerIndex, decisions.customers || {}, inv.sourceCustomerRef);
    const lm = matchListValueSmart(inv.sourceLocation, lists.location || [], LOCATION_SYNONYM_GROUPS, decisions.locations || {}, decisions.defaultLocation);
    const pmRaw = toStr(inv.sourcePaymentMethods[0] || '');
    const mm = matchListValueSmart(pmRaw, lists.paymentMethod || [], PAYMENT_METHOD_SYNONYM_GROUPS, decisions.payments || {}, decisions.defaultPayment);

    if (cm.status !== 'matched') {
      unresolved.push({ kind: 'customer', invoiceRef: inv.invoiceRef, value: toStr(inv.sourceCustomerName) });
    }
    if (lm.status !== 'matched') {
      unresolved.push({ kind: 'location', invoiceRef: inv.invoiceRef, value: toStr(inv.sourceLocation) });
    }

    const { resolved, notes: taxNotes } = resolveInvoiceTaxes(inv, taxLabels, defaultTax);
    notes.push(...taxNotes);

    const lines = inv.lines.map((l, i) => {
      const pmatch = matchProduct(l.sourceSku, l.sourceName, productIndex, decisions.products || {});
      if (pmatch.status !== 'matched') {
        unresolved.push({ kind: 'product', invoiceRef: inv.invoiceRef, sourceRow: l.sourceRow, value: toStr(l.sourceSku) || toStr(l.sourceName) });
      } else if (pmatch.warning) {
        // مطابقة احتياطية بالاسم: صحيحة على الأرجح لكنها ليست مؤكدة كالرمز،
        // فتُعرض للمراجعة بدل أن تمر صامتة
        notes.push({
          severity: 'warn', scope: 'line',
          invoiceRef: inv.invoiceRef, sourceRow: l.sourceRow,
          code: 'PRODUCT_MATCHED_BY_NAME',
          message: pmatch.warning,
        });
      }
      const code = pmatch.status === 'matched' ? pmatch.code : '';
      if (code) {
        stockDemands.push({
          code, quantity: l.quantity, invoiceRef: inv.invoiceRef, sourceRow: l.sourceRow,
          location: lm.status === 'matched' ? lm.value : toStr(inv.sourceLocation),
        });
      }

      // وحدة التحويل: تبقى فارغة (ENGINE_DEFAULTS.unitOfConvMode) إلا إذا ورد نص
      // وحدة صريح في ملف العميل وطابق إحدى الوحدات المعتمدة في القالب فعلياً —
      // لا يُكتب أبداً نص لم يُثبَت وجوده في قائمة القالب
      let unitOfConv = '';
      if (l.sourceUnit) {
        const um = matchListValueSmart(l.sourceUnit, lists.unitOfConv || [], null, {}, null);
        if (um.status === 'matched') unitOfConv = um.value;
        else {
          notes.push({
            severity: 'warn', scope: 'line', invoiceRef: inv.invoiceRef, sourceRow: l.sourceRow,
            code: 'UNIT_UNMATCHED',
            message: `الوحدة «${l.sourceUnit}» غير موجودة في قائمة وحدات التحويل بالقالب — تُركت فارغة (الوحدة الأساسية للمنتج)`,
          });
        }
      }

      return {
        sourceRow: l.sourceRow,
        productCode: code,
        // وصف المنتج يُكتب فقط عند غياب الرمز — قيود يقبل أحدهما
        productDesc: code ? '' : toStr(l.sourceName),
        quantity: l.quantity,
        unitOfConv,
        grossExclusive: l.grossExclusive,
        discountExclusive: l.discountExclusive,
        taxRate: resolved[i].pct,
        taxLabel: resolved[i].label,
        sourceTotalInclusive: l.sourceTotalInclusive,
        unitPriceExplicit: l.unitPriceExplicit,
        discountPctExplicit: l.discountPctExplicit,
        taxInclusiveExplicit: l.taxInclusiveExplicit,
      };
    });

    // خصم المستند: قيمة من ملف العميل + حساب مختار من المستخدم (لا يُخمَّن) +
    // فئة ضريبية مستنتجة فقط عند اتحاد فئة بنود الفاتورة كلها، وإلا تبقى فارغة
    // ويُبلَّغ عنها validate.js كخطأ فادح (DOC_DISCOUNT_TAX_AMBIGUOUS) بدل تخمينها
    const hasDocDiscount = Number.isFinite(inv.docDiscountValue) && inv.docDiscountValue > 0;
    const docDiscountAccount = hasDocDiscount ? toStr(decisions.docDiscountAccount) : '';
    if (hasDocDiscount && !docDiscountAccount) {
      unresolved.push({ kind: 'docDiscountAccount', invoiceRef: inv.invoiceRef, value: '' });
    }
    const lineTaxLabels = new Set(lines.map(l => l.taxLabel).filter(Boolean));
    const docDiscountTax = hasDocDiscount && lineTaxLabels.size === 1 ? [...lineTaxLabels][0] : '';

    invoices.push({
      invoiceRef: inv.invoiceRef,
      customerRef: cm.status === 'matched' ? cm.ref : '',
      issueDate: inv.issueDateParts,
      // تاريخ الاستحقاق: من ملف العميل إن وُجد، وإلا تاريخ الإصدار بديلاً
      dueDate: inv.dueDateParts || inv.issueDateParts,
      // تاريخ التوريد: من ملف العميل إن وُجد، وإلا تاريخ الإصدار بديلاً (فارغ إن غاب العمود من القالب أصلاً)
      supplyDate: inv.supplyDateParts || inv.issueDateParts,
      location: lm.status === 'matched' ? lm.value : '',
      paymentMethod: mm.status === 'matched' ? mm.value : '',
      description: '',
      docDiscountValue: hasDocDiscount ? inv.docDiscountValue : '',
      docDiscountAccount,
      docDiscountTax,
      // من ملف العميل إن وُجد، وإلا القيمة العامة المُدخَلة يدوياً إن وُجدت
      terms: inv.terms || decisions.terms || '',
      notes: inv.notes || decisions.notes || '',
      sourceTotalInclusive: inv.sourceTotalInclusive,
      channel: inv.channel,
      lines,
    });
  }

  const out = transformAll(invoices, opts);

  // تعديلات صفحة المطابقة والمراجعة تُطبَّق هنا: بعد التحويل، قبل أي فحص أو تحقق،
  // فكل ما يلي (التحقق، والإجمالي المعروض) يُبنى على القيم المعدَّلة مباشرة
  const rows = applyRowOverrides(out.rows, overrides);
  const reconciliation = rows === out.rows ? out.reconciliation : recomputeReconciliation(rows);
  const summary = rows === out.rows ? out.summary : {
    ...out.summary,
    rows: rows.length,
    invoices: reconciliation.length,
    expectedGrandTotal: round(reconciliation.reduce((s, t) => s + t.expectedTotal, 0), 2),
  };

  /*
   * فحص الكميات: بوجود ملف كميات حسب المواقع يُفحص رصيد كل منتج في موقع فاتورته
   * تحديداً؛ بدونه يبقى السلوك كما كان (رصيد عالمي واحد من ملف تعريف المنتجات).
   * قوالب رفع المنتجات وحدها لا تحمل الكمية المتاحة أصلاً، فيُعطَّل الفحص حينها
   * ويُبلَّغ عن تعطّله بدل أن يمر صامتاً أو يمنع العمل.
   */
  const canCheckStock = opts.enforceStock && (productIndex.hasStockData || !!locationStockIndex);
  const stock = canCheckStock ? checkStock(stockDemands, productIndex, locationStockIndex) : [];

  /*
   * reconciliation/summary (إجمالي المصدر ومقارنته بالمحسوب) لا يُمرَّران إلى
   * validateAll: إجمالي المصدر لا يُستخدم للتحقق إطلاقاً — تُبقى القيمتان متاحتين
   * في نتيجة runPipeline كبيانات خام فقط (لتقرير التصدير ونتيجة التحليل)، لا
   * كأساس لأي تحذير أو خطأ أو حالة فاتورة.
   */
  const validation = validateAll({ rows, template, opts });

  const extraIssues = [];

  /*
   * أخطاء حساب البند تُنتَج داخل transformAll (كمية صفرية، خصم على وعاء صفر).
   * تمريرها إلزامي: البند الفاشل يُسقَط من المخرج، فلو لم تُبلَّغ اختفى البند
   * من الملف بلا أي أثر.
   */
  extraIssues.push(...out.issues);

  /*
   * نقص الكمية يمنع قيود من إنشاء الفاتورة، فيُعامَل كخطأ فادح — خطأ واحد لكل
   * فاتورة تجاوز طلبها الرصيد المتبقي *وقت معالجتها* تحديداً (لا الرصيد الأصلي
   * للمنتج)، حتى تُحدَّد الفاتورة المسبِّبة فعلاً بدل تعليم كل الفواتير التي
   * لمست نفس المنتج بلا تمييز.
   */
  for (const s of stock) {
    for (const b of s.breakdown) {
      if (b.status !== 'insufficient') continue;
      extraIssues.push({
        severity: 'fatal', scope: 'stock', code: 'INSUFFICIENT_STOCK',
        invoiceRef: b.invoiceRef,
        message: `الكمية المطلوبة غير متوفرة في الموقع المحدد.\n`
          + `المنتج: ${s.name || s.code} (${s.code})\n`
          + `الموقع: ${s.location || '—'}\n`
          + `الكمية المطلوبة: ${b.requested}\n`
          + `الكمية المتاحة: ${b.availableBefore}`,
      });
    }
  }

  if (opts.enforceStock && !productIndex.hasStockData) {
    extraIssues.push({
      severity: 'warn', scope: 'stock', code: 'STOCK_DATA_MISSING',
      message: 'ملف المنتجات لا يحتوي على عمود كمية متاحة — فحص الكميات معطّل. قيود سيرفض أي فاتورة لا تكفي كمية أحد منتجاتها المخزَّنة.',
    });
  }

  const allFatal = [...validation.fatal, ...extraIssues.filter(x => x.severity === 'fatal')];

  return {
    rows,
    reconciliation,
    summary,
    stock,
    stockChecked: canCheckStock,
    notes,
    unresolved,
    validation: {
      ...validation,
      issues: [...validation.issues, ...extraIssues],
      fatal: allFatal,
      warn: [...validation.warn, ...extraIssues.filter(x => x.severity === 'warn')],
      canExport: allFatal.length === 0,
    },
  };
}
