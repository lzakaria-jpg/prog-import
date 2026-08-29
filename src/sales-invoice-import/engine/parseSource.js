/**
 * تفكيك ملف مصدر نقاط البيع/سلة إلى فواتير مهيكلة.
 *
 * البنية المتوقعة: كل فاتورة = صف رأس (Sale) + صفوف بنود (Sale Line) + صفوف دفع (Payment)،
 * مربوطة بعمود رقم الفاتورة. المرتجعات تُفصل ولا تُستورد كفواتير مبيعات.
 */

import { toNum, toStr, round, parseDate, dateKey } from './num.js';
import { findHeaderRow } from '../../lib/columnDetect.js';

/**
 * مرادفات أعمدة المصدر.
 *
 * ملفات العملاء تصل بأسماء أعمدة مختلفة تماماً حسب النظام المصدَّر منه، فالكشف
 * يعتمد على مرادفات موسّعة بدل أسماء ثابتة. المرادفات مكتوبة مطبَّعة (بلا مسافات
 * ولا تشكيل، والتاء المربوطة هاءً) لأنها تُقارن بناتج normalizeSourceHeader.
 *
 * `exact` تُطابق الرأس كاملاً وتُرجَّح على `partial` التي تكفيها المطابقة الجزئية،
 * حتى لا يبتلع عمودٌ عامٌّ عموداً أدقّ منه.
 */
export const SOURCE_FIELD_ALIASES = {
  invoiceNumber: {
    exact: ['invoicenumber', 'invoiceno', 'invoice', 'invoiceid', 'orderno', 'ordernumber', 'ordreid',
            'رقمالفاتوره', 'الفاتوره', 'رقمالطلب', 'رقمالمستند', 'مرجعالفاتوره', 'no', 'num', '#'],
    partial: ['invoicenumber', 'invoiceno', 'ordernumber', 'رقمالفاتوره', 'رقمالطلب', 'مرجعالفاتوره', 'مرجع'],
  },
  lineType: {
    exact: ['linetype', 'rowtype', 'type', 'recordtype', 'نوعالسطر', 'نوعالصف', 'النوع', 'نوعالسجل'],
    partial: ['linetype', 'rowtype', 'نوعالسطر', 'نوعالصف'],
  },
  sellType: {
    exact: ['selltype', 'transactiontype', 'doctype', 'documenttype', 'نوعالبيع', 'نوعالعمليه',
            'نوعالحركه', 'نوعالمستند'],
    partial: ['selltype', 'transactiontype', 'نوعالعمليه', 'نوعالحركه'],
  },
  date: {
    exact: ['date', 'invoicedate', 'orderdate', 'createdat', 'transactiondate', 'issuedate',
            'التاريخ', 'تاريخالفاتوره', 'تاريخالاصدار', 'تاريخالطلب'],
    partial: ['invoicedate', 'orderdate', 'issuedate', 'تاريخالفاتوره', 'تاريخالاصدار', 'تاريخ'],
  },
  customerName: {
    exact: ['customername', 'customer', 'client', 'clientname', 'buyer', 'account', 'accountname',
            'اسمالعميل', 'العميل', 'اسمالزبون', 'الزبون', 'اسمالمشتري'],
    partial: ['customername', 'clientname', 'اسمالعميل', 'اسمالزبون', 'عميل', 'زبون'],
  },
  customerRef: {
    exact: ['customerref', 'customerreference', 'customercode', 'customerid', 'clientcode', 'accountcode',
            'الرقمالمرجعيللعميل', 'الرقمالمرجعي', 'كودالعميل', 'رقمالعميل'],
    partial: ['customerref', 'customercode', 'الرقمالمرجعي', 'كودالعميل', 'رقمالعميل'],
  },
  location: {
    exact: ['location', 'branch', 'warehouse', 'store', 'site', 'outlet',
            'الموقع', 'الفرع', 'المستودع', 'المخزن', 'المركز'],
    partial: ['location', 'branch', 'warehouse', 'الموقع', 'الفرع', 'المستودع', 'المخزن'],
  },
  channel: {
    exact: ['channel', 'channelname', 'source', 'saleschannel', 'platform', 'القناه', 'المصدر', 'المنصه'],
    partial: ['channel', 'saleschannel', 'القناه'],
  },
  sku: {
    exact: ['sku', 'barcode', 'productcode', 'itemcode', 'productnum', 'productnumber', 'productid',
            'itemid', 'itemno', 'code', 'ref', 'reference', 'serial', 'serialnumber', 'upc', 'ean', 'gtin',
            'الرقمالتسلسلي', 'الباركود', 'باركود', 'رمزالمنتج', 'كودالمنتج', 'رقمالمنتج', 'رقمالصنف',
            'كودالصنف', 'رمزالصنف', 'التسلسلي'],
    partial: ['sku', 'barcode', 'productcode', 'itemcode', 'productnum', 'serialnumber',
              'الرقمالتسلسلي', 'الباركود', 'رمزالمنتج', 'كودالمنتج', 'رقمالصنف', 'كودالصنف'],
  },
  details: {
    exact: ['details', 'description', 'product', 'productname', 'item', 'itemname', 'name', 'title',
            'الوصف', 'التفاصيل', 'المنتج', 'اسمالمنتج', 'الصنف', 'اسمالصنف', 'البيان'],
    partial: ['productname', 'itemname', 'description', 'اسمالمنتج', 'اسمالصنف', 'وصفالمنتج', 'البيان'],
  },
  quantity: {
    exact: ['quantity', 'qty', 'count', 'units', 'الكميه', 'العدد', 'عدد'],
    partial: ['quantity', 'qty', 'الكميه'],
  },
  subtotalEx: {
    exact: ['subtotaltaxexclusive', 'subtotal', 'nettotal', 'amountexcludingtax', 'amountexcltax',
            'lineamount', 'net', 'amount', 'price',
            'المجموعقبلالضريبه', 'الاجماليقبلالضريبه', 'المبلغقبلالضريبه', 'الصافي', 'المبلغ'],
    partial: ['subtotal', 'taxexclusive', 'excludingtax', 'excltax', 'قبلالضريبه', 'غيرشاملالضريبه'],
  },
  discount: {
    exact: ['discount', 'discountamount', 'discountvalue', 'الخصم', 'قيمهالخصم', 'مبلغالخصم'],
    partial: ['discount', 'الخصم'],
  },
  vat: {
    exact: ['vat', 'vatamount', 'ضريبهالقيمهالمضافه', 'القيمهالمضافه'],
    partial: ['vatamount', 'القيمهالمضافه'],
  },
  otherTaxes: {
    exact: ['othertaxes', 'othertax', 'ضرائباخري', 'ضريبهاخري'],
    partial: ['othertax', 'ضرائباخري'],
  },
  totalTax: {
    exact: ['totaltax', 'taxamount', 'taxtotal', 'tax', 'اجماليالضريبه', 'الضريبه', 'مبلغالضريبه'],
    partial: ['totaltax', 'taxamount', 'اجماليالضريبه', 'مبلغالضريبه'],
  },
  totalInc: {
    exact: ['totaltaxinclusive', 'total', 'grandtotal', 'amountincludingtax', 'amountincltax', 'totalamount',
            'الاجماليشاملالضريبه', 'الاجمالي', 'المجموع', 'الاجماليالنهائي', 'المبلغشاملالضريبه'],
    partial: ['taxinclusive', 'includingtax', 'incltax', 'grandtotal', 'شاملالضريبه', 'الاجمالي', 'المجموع'],
  },
  paymentMethod: {
    exact: ['paymentmethod', 'payment', 'paymenttype', 'paymentmode', 'tender',
            'طريقهالدفع', 'وسيلهالدفع', 'نوعالدفع', 'الدفع'],
    partial: ['paymentmethod', 'paymenttype', 'طريقهالدفع', 'وسيلهالدفع'],
  },
  paidAmount: {
    exact: ['paidamount', 'paid', 'amountpaid', 'payment', 'المبلغالمدفوع', 'المدفوع'],
    partial: ['paidamount', 'amountpaid', 'المبلغالمدفوع'],
  },

  // ── حقول ملفات الفواتير غير المنظّمة (بلا عمود «نوع السطر») ──
  dueDate: {
    exact: ['duedate', 'تاريخالاستحقاق', 'الاستحقاق'],
    partial: ['duedate', 'تاريخالاستحقاق'],
  },
  supplyDate: {
    exact: ['supplydate', 'deliverydate', 'تاريخالتوريد', 'تاريخالتسليم'],
    partial: ['supplydate', 'deliverydate', 'تاريخالتوريد', 'تاريخالتسليم'],
  },
  terms: {
    exact: ['terms', 'termsandconditions', 'الشروطوالاحكام', 'الشروط', 'الاحكام'],
    partial: ['termsandconditions', 'الشروطوالاحكام'],
  },
  notes: {
    exact: ['notes', 'remarks', 'comment', 'comments', 'الملاحظات', 'ملاحظات'],
    partial: ['remarks', 'الملاحظات'],
  },
  docDiscountValue: {
    exact: ['invoicediscount', 'documentdiscount', 'totaldiscount', 'خصماجمالي', 'خصمالفاتوره', 'خصمالمستند'],
    partial: ['invoicediscount', 'documentdiscount', 'totaldiscount', 'خصماجمالي', 'خصمالمستند'],
  },
  unit: {
    exact: ['unit', 'uom', 'unitofmeasure', 'الوحده', 'وحدهالقياس'],
    partial: ['unitofmeasure', 'وحدهالقياس'],
  },
  // أسماء ضيّقة عمداً كي لا تتنازع مع مرادفات subtotalEx العامة (price/سعر)
  unitPriceExplicit: {
    exact: ['unitprice', 'priceperunit', 'سعرالوحده'],
    partial: ['unitprice', 'priceperunit', 'سعرالوحده'],
  },
  discountPctExplicit: {
    exact: ['discountpercent', 'discountpercentage', 'discountrate', 'نسبهالخصم', 'خصمنسبه'],
    partial: ['discountpercent', 'discountrate', 'نسبهالخصم'],
  },
  // مرادفات ضيّقة أيضاً كي لا تتنازع مع «totalInc» — يُتحقق من محتواها (نعم/لا)
  // عند الاستهلاك في buildInvoiceFlat، فأي عمود مطابَق خطأً يُتجاهَل بأمان
  taxInclusiveFlag: {
    exact: ['taxinclusiveflag', 'priceincludestax', 'شاملالضريبه؟', 'شاملالضريبهامال'],
    partial: ['priceincludestax', 'isinclusive'],
  },
};

/**
 * تطبيع رأس عمود مصدر قبل المطابقة: إزالة المسافات والرموز والتشكيل،
 * وتوحيد الهمزات والتاء المربوطة، حتى يطابق «Total (Tax inclusive)» و«الإجمالي شامل الضريبة».
 */
export function normalizeSourceHeader(v) {
  return String(v ?? '')
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/[\u064B-\u0652\u0670\u200B-\u200F\uFEFF]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىی]/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/ة/g, 'ه')
    .replace(/[_\-/\\.,،:;'"]/g, ' ')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** قيم عمود نوع السطر */
const LINE_TYPE = { HEADER: 'sale', LINE: 'sale line', PAYMENT: 'payment' };
const RETURN_MARKERS = ['return', 'refund', 'مرتجع', 'ارتجاع'];

/**
 * يكتشف تعيين الأعمدة تلقائياً من رؤوس الملف بنظام نقاط.
 *
 * لكل حقل تُحسب نقطة لكل عمود: 100 للمطابقة التامة، 60 للجزئية، مع خصم بسيط
 * لطول الرأس ليُفضَّل «SKU» على «SKU Description» عند تساوي النوع.
 * ثم يُخصَّص كل عمود لحقل واحد فقط، بدءاً من أعلى النقاط، فلا يتنازع حقلان
 * على نفس العمود ولا يُخصَّص عمودان لحقل واحد.
 */
/**
 * القيم الثلاث الوحيدة التي يفهمها parseSource لعمود «نوع السطر» (LINE_TYPE أعلاه).
 * تُستخدم أيضاً للكشف الاحتياطي بالمحتوى أدناه.
 */
const LINE_TYPE_KNOWN_VALUES = new Set(['sale', 'sale line', 'payment']);

/**
 * كشف احتياطي بمحتوى العمود لعمود «نوع السطر» — لا باسمه.
 *
 * إن فشلت مطابقة الاسم (تسمية العمود في ملف المصدر لا تشبه أي مرادف معروف، مثل
 * «Sale Type» بدل «Line Type»)، فمرور الملف كله إلى «النمط المسطَّط» بصمت يجعل
 * صف الرأس نفسه — الذي غالباً ما يحمل قيماً وهمية في أعمدة الكمية والسعر
 * والضريبة لأسباب تخص نظام المصدر — يُعامَل كبند منتج فعلي، فيُضاف إلى إجمالي
 * الفاتورة ويُفسد المطابقة الحسابية كلياً (فاتورة حقيقية شوهدت: صف رأس بكمية 1
 * وسعر وهميين رفع الإجمالي المحسوب من 8.26 إلى 9.84 مقابل مصدر 7.9 بدل 6.18).
 *
 * القيم الثلاث التي يفهمها المحرك لهذا العمود (Sale / Sale Line / Payment) قاموس
 * صغير ومغلق، فالتحقق آمن: عمود غير مخصَّص لأي حقل آخر، وكل قيمه المعبَّأة تقع
 * ضمن هذا القاموس تحديداً، وتتضمن Sale أو Sale Line فعلياً — لا تخمين عند التباس
 * عمودين مؤهَّلين معاً.
 */
function contentGuessLineType(headers, records, usedCols) {
  let foundIdx = -1;
  for (let i = 0; i < headers.length; i++) {
    if (usedCols.has(i)) continue;
    const h = headers[i];
    const sample = records.slice(0, 200).map(r => toStr(r[h]).toLowerCase()).filter(Boolean);
    if (!sample.length) continue;
    const distinct = new Set(sample);
    const allKnown = [...distinct].every(v => LINE_TYPE_KNOWN_VALUES.has(v));
    const hasHeaderOrLine = distinct.has('sale') || distinct.has('sale line');
    if (!allKnown || !hasHeaderOrLine) continue;
    if (foundIdx !== -1) return -1; // أكثر من عمود مرشّح: لا يُحسم شيء
    foundIdx = i;
  }
  return foundIdx;
}

export function detectMapping(headers, records = []) {
  const norm = headers.map(h => normalizeSourceHeader(h));
  const candidates = [];

  for (const [field, aliases] of Object.entries(SOURCE_FIELD_ALIASES)) {
    norm.forEach((h, i) => {
      if (!h) return;
      let score = 0;
      if ((aliases.exact || []).includes(h)) score = 100;
      else if ((aliases.partial || []).some(a => h.includes(a))) score = 60;
      else if ((aliases.exact || []).some(a => a.length >= 4 && h.includes(a))) score = 45;
      if (!score) return;
      candidates.push({ field, col: headers[i], idx: i, score: score - Math.min(h.length, 30) * 0.2 });
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const mapping = {};
  const usedCols = new Set();
  for (const c of candidates) {
    if (mapping[c.field] || usedCols.has(c.idx)) continue;
    mapping[c.field] = c.col;
    usedCols.add(c.idx);
  }

  if (!mapping.lineType && records.length) {
    const idx = contentGuessLineType(headers, records, usedCols);
    if (idx !== -1) mapping.lineType = headers[idx];
  }

  return mapping;
}

/**
 * يبحث عن صف العناوين الفعلي في أول صفوف ملف فواتير العميل، بدل افتراض الصف
 * الأول — يعيد استخدام محرك الاكتشاف المركزي بمرادفات هذا الملف نفسها.
 */
export function findSourceHeaderRow(rows) {
  const extraSynonyms = {};
  for (const [field, aliases] of Object.entries(SOURCE_FIELD_ALIASES)) {
    extraSynonyms[field] = { ar: [...(aliases.exact || []), ...(aliases.partial || [])], en: [] };
  }
  return findHeaderRow(rows, Object.keys(SOURCE_FIELD_ALIASES), { extraSynonyms, minFieldsMatched: 3 });
}

function isReturn(v) {
  const s = toStr(v).toLowerCase();
  return RETURN_MARKERS.some(m => s.includes(m));
}

/** يفهم قيمة «شامل الضريبة؟» الصريحة، أو null إن كانت غير مفهومة (تُهمَل بأمان بدل تخمينها) */
function parseYesNo(v) {
  const s = toStr(v).trim().toLowerCase();
  if (!s) return null;
  if (/^(نعم|yes|true|1|y)$/.test(s)) return true;
  if (/^(لا|no|false|0|n)$/.test(s)) return false;
  return null;
}

/** الحقول على مستوى الفاتورة — تُقرأ من صف الرأس (نمط نوع السطر) أو من أي صف (النمط المسطّح) */
function extractHeaderFields(rec, get) {
  return {
    date: parseDate(get(rec, 'date')),
    rawDate: toStr(get(rec, 'date')),
    dueDate: parseDate(get(rec, 'dueDate')),
    supplyDate: parseDate(get(rec, 'supplyDate')),
    customerName: toStr(get(rec, 'customerName')),
    customerRef: toStr(get(rec, 'customerRef')),
    location: toStr(get(rec, 'location')),
    channel: toStr(get(rec, 'channel')),
    paymentMethod: toStr(get(rec, 'paymentMethod')),
    terms: toStr(get(rec, 'terms')),
    notes: toStr(get(rec, 'notes')),
    docDiscountValue: toNum(get(rec, 'docDiscountValue')),
    totalInc: toNum(get(rec, 'totalInc')),
    subtotalEx: toNum(get(rec, 'subtotalEx')),
    totalTax: toNum(get(rec, 'totalTax')),
  };
}

/** الحقول على مستوى البند — منتج واحد وكميته وسعره */
function extractLineFields(rec, get, sourceRow) {
  const qty = toNum(get(rec, 'quantity'));
  const subtotalEx = toNum(get(rec, 'subtotalEx'));
  const discount = toNum(get(rec, 'discount')) || 0;
  // الضريبة الفعلية = إجمالي الضريبة، لأن VAT و Other taxes خانتان لنفس المبلغ
  const totalTax = toNum(get(rec, 'totalTax')) || 0;
  const totalInc = toNum(get(rec, 'totalInc'));

  return {
    sourceRow,
    sku: toStr(get(rec, 'sku')),
    details: toStr(get(rec, 'details')),
    quantity: qty,
    subtotalEx,
    discount,
    totalTax,
    totalInc,
    isReturn: isReturn(get(rec, 'sellType')),
    location: toStr(get(rec, 'location')),
    unit: toStr(get(rec, 'unit')),
    unitPriceExplicit: toNum(get(rec, 'unitPriceExplicit')),
    discountPctExplicit: toNum(get(rec, 'discountPctExplicit')),
    // لا يُقبل إلا قيمة صريحة مفهومة (نعم/لا وما يعادلها) — غير ذلك يُهمَل لا يُخمَّن
    taxInclusiveExplicit: parseYesNo(get(rec, 'taxInclusiveFlag')),
  };
}

/**
 * @param {object[]} records صفوف الملف ككائنات مفاتيحها رؤوس الأعمدة
 * @param {object} mapping تعيين الحقول → أسماء الأعمدة
 * @param {object} opts
 * @returns {{sales:object[], returns:object[], stats:object, issues:object[]}}
 */
export function parseSource(records, mapping, opts = {}) {
  const get = (rec, field) => (mapping[field] ? rec[mapping[field]] : undefined);
  const issues = [];
  const groups = new Map();

  /*
   * نمطان: ملفات نقاط البيع المنظَّمة تحمل عمود «نوع السطر» (رأس/بند/دفع) —
   * نمطها الأصلي المثبَت لا يتغيّر هنا حرفياً. ملفات العملاء غير المنظَّمة
   * (لا عمود نوع سطر) تصل بصف واحد لكل بند منتج، وبيانات الفاتورة (العميل
   * والتاريخ والموقع...) مكرَّرة أو موجودة في صفها الأول فقط؛ المرجع وحده هو
   * أساس التجميع، لا عدد الصفوف ولا ترتيبها.
   */
  const flatMode = !mapping.lineType;

  records.forEach((rec, i) => {
    const sourceRow = i + 2; // صف 1 رؤوس
    const invNo = toStr(get(rec, 'invoiceNumber'));
    if (!invNo) {
      issues.push({
        severity: 'fatal', scope: 'row', sourceRow,
        code: 'NO_INVOICE_NUMBER',
        message: 'صف بلا رقم فاتورة — لا يمكن ربطه بأي فاتورة',
      });
      return;
    }

    if (!groups.has(invNo)) {
      groups.set(invNo, { invoiceNumber: invNo, header: null, headerCandidates: [], lines: [], payments: [], rows: [] });
    }
    const g = groups.get(invNo);
    g.rows.push(sourceRow);

    if (flatMode) {
      // كل صف بند منتج، وبيانات الفاتورة تُقرأ من كل صف للتوفيق بينها لاحقاً
      g.headerCandidates.push({ sourceRow, ...extractHeaderFields(rec, get) });
      g.lines.push(extractLineFields(rec, get, sourceRow));
      return;
    }

    const lt = toStr(get(rec, 'lineType')).toLowerCase();

    if (lt === LINE_TYPE.HEADER) {
      if (g.header) {
        issues.push({
          severity: 'fatal', scope: 'invoice', invoiceRef: invNo, sourceRow,
          code: 'DUPLICATE_HEADER',
          message: `رقم الفاتورة ${invNo} له أكثر من صف رأس — تعارض في المصدر`,
        });
        return;
      }
      g.header = { sourceRow, isReturn: isReturn(get(rec, 'sellType')), ...extractHeaderFields(rec, get) };
    } else if (lt === LINE_TYPE.LINE) {
      g.lines.push(extractLineFields(rec, get, sourceRow));
    } else if (lt === LINE_TYPE.PAYMENT) {
      g.payments.push({
        sourceRow,
        method: toStr(get(rec, 'paymentMethod')),
        amount: toNum(get(rec, 'paidAmount')),
      });
    } else {
      issues.push({
        severity: 'warn', scope: 'row', sourceRow, invoiceRef: invNo,
        code: 'UNKNOWN_LINE_TYPE',
        message: `نوع سطر غير معروف: «${lt || 'فارغ'}» — تم تجاهل الصف`,
      });
    }
  });

  const sales = [];
  const returns = [];

  for (const g of groups.values()) {
    const built = flatMode ? buildInvoiceFlat(g, issues) : buildInvoice(g, issues);
    if (!built) continue;
    (built.isReturn ? returns : sales).push(built);
  }

  // ترتيب زمني تصاعدي — أنسب للاستيراد المتسلسل
  const byDate = (a, b) => (dateKey(a.issueDateParts) ?? 0) - (dateKey(b.issueDateParts) ?? 0);
  sales.sort(byDate);
  returns.sort(byDate);

  return {
    sales,
    returns,
    issues,
    stats: {
      totalRows: records.length,
      invoices: groups.size,
      salesInvoices: sales.length,
      returnInvoices: returns.length,
      salesLines: sales.reduce((s, i) => s + i.lines.length, 0),
      returnLines: returns.reduce((s, i) => s + i.lines.length, 0),
    },
  };
}

function buildInvoice(g, issues) {
  const invNo = g.invoiceNumber;

  if (!g.header) {
    issues.push({
      severity: 'fatal', scope: 'invoice', invoiceRef: invNo, sourceRow: g.rows[0],
      code: 'NO_HEADER_ROW',
      message: `الفاتورة ${invNo} بلا صف رأس — لا يمكن استخراج العميل والتاريخ والموقع`,
    });
    return null;
  }
  if (g.lines.length === 0) {
    issues.push({
      severity: 'fatal', scope: 'invoice', invoiceRef: invNo, sourceRow: g.header.sourceRow,
      code: 'NO_LINES',
      message: `الفاتورة ${invNo} بلا بنود`,
    });
    return null;
  }

  const isReturn = g.header.isReturn || g.lines.every(l => l.isReturn);

  // تناسق: هل جميع البنود من نفس النوع
  const mixed = g.lines.some(l => l.isReturn) && g.lines.some(l => !l.isReturn);
  if (mixed) {
    issues.push({
      severity: 'fatal', scope: 'invoice', invoiceRef: invNo, sourceRow: g.header.sourceRow,
      code: 'MIXED_SELL_RETURN',
      message: `الفاتورة ${invNo} تخلط بنود بيع وبنود مرتجع`,
    });
  }

  const lines = toOutputLines(g.lines);

  /*
   * إجمالي الفاتورة = مجموع كل بنودها الصالحة دائماً — لا يوجد مفهوم «إجمالي رأس
   * الفاتورة» يُعتمَد بدلاً منه. صف الرأس في الملفات المنظَّمة قد يحمل عمود إجمالي
   * خاصاً به (headerTotal)، لكنه لا يُستخدم أبداً كإجمالي الفاتورة الفعلي — فقط
   * كمرجع تشخيصي لمقارنته بمجموع البنود واكتشاف تضارب في بيانات المصدر نفسها.
   */
  const linesSum = round(lines.reduce((s, l) => s + l.sourceTotalInclusive, 0), 2);
  const headerTotal = round(g.header.totalInc ?? 0, 2);

  const headerDiff = round(headerTotal - linesSum, 2);
  if (Math.abs(headerDiff) > 0.011) {
    // تنبيه تشخيصي فقط: إجمالي الفاتورة المعتمد فعلياً هو linesSum دوماً، فهذا
    // التضارب لا يمنع الاستيراد، لكنه يستحق الإبلاغ لأنه يكشف عطباً في ملف المصدر
    const isRounding = Math.abs(headerDiff) <= 0.05;
    issues.push({
      severity: 'warn',
      scope: 'invoice', invoiceRef: invNo, sourceRow: g.header.sourceRow,
      code: isRounding ? 'HEADER_LINES_ROUNDING' : 'HEADER_LINES_MISMATCH',
      message: isRounding
        ? `فرق تقريب ${headerDiff} بين إجمالي رأس الفاتورة في المصدر ${headerTotal} ومجموع بنودها ${linesSum} — اعتُمد مجموع البنود ${linesSum} كإجمالي الفاتورة الفعلي`
        : `إجمالي رأس الفاتورة في المصدر ${headerTotal} يختلف عن مجموع بنودها ${linesSum} بفارق ${headerDiff} — اعتُمد مجموع البنود ${linesSum} كإجمالي الفاتورة الفعلي`,
    });
  }

  const paidSum = round(g.payments.reduce((s, p) => s + (p.amount ?? 0), 0), 2);
  const methods = [...new Set(g.payments.map(p => p.method).filter(Boolean))];

  if (g.payments.length > 1 && Math.abs(paidSum - headerTotal * g.payments.length) < 0.011) {
    issues.push({
      severity: 'warn', scope: 'invoice', invoiceRef: invNo, sourceRow: g.header.sourceRow,
      code: 'DUPLICATE_PAYMENT_ROWS',
      message: `صفوف الدفع مكررة (${g.payments.length} صفوف بنفس المبلغ) — لا يؤثر على الاستيراد`,
    });
  }

  return {
    invoiceRef: invNo,
    isReturn,
    issueDateParts: g.header.date,
    rawDate: g.header.rawDate,
    dueDateParts: g.header.dueDate,
    supplyDateParts: g.header.supplyDate,
    sourceCustomerName: g.header.customerName,
    sourceCustomerRef: g.header.customerRef,
    sourceLocation: g.header.location,
    channel: g.header.channel,
    sourcePaymentMethods: methods.length ? methods : [g.header.paymentMethod].filter(Boolean),
    terms: g.header.terms,
    notes: g.header.notes,
    docDiscountValue: g.header.docDiscountValue,
    paidAmount: paidSum,
    // الإجمالي الفعلي دوماً = مجموع البنود، لا قيمة رأس الفاتورة ولا صف بعينه
    sourceTotalInclusive: linesSum,
    lines,
    headerRow: g.header.sourceRow,
    rows: g.rows,
  };
}

/** يحوّل بنود خام (من extractLineFields) إلى الشكل الذي يعتمده باقي المحرك */
function toOutputLines(rawLines) {
  return rawLines.map(l => {
    const grossExclusive = l.subtotalEx ?? 0;
    const base = grossExclusive - (l.discount || 0);
    // اشتقاق نسبة الضريبة من البند نفسه بدل افتراضها
    const rate = base !== 0 ? (l.totalTax || 0) / base : null;
    return {
      sourceRow: l.sourceRow,
      sourceSku: l.sku,
      sourceName: l.details,
      quantity: l.quantity,
      grossExclusive,
      discountExclusive: l.discount || 0,
      taxAmount: l.totalTax || 0,
      taxRateRaw: rate,
      sourceTotalInclusive: l.totalInc ?? 0,
      sourceUnit: l.unit || '',
      unitPriceExplicit: l.unitPriceExplicit,
      discountPctExplicit: l.discountPctExplicit,
      taxInclusiveExplicit: l.taxInclusiveExplicit,
    };
  });
}

/**
 * يبني فاتورة من مجموعة صفوف بلا عمود «نوع سطر» — كل صف بند منتج، وبيانات
 * الفاتورة تُقرأ من كل صف وتُوفَّق بينها: قيمة الصف الأول تُعتمد، وأي اختلاف
 * لاحق يُبلَّغ عنه بدل أن يُختار عشوائياً أو يُسقَط بصمت.
 * الموقع وحده يُفشل الفاتورة عند الاختلاف — فاتورة واحدة لا يجوز أن تحمل أكثر
 * من موقع، ولا معنى لاختيار أحدهما عشوائياً.
 */
function buildInvoiceFlat(g, issues) {
  const invNo = g.invoiceNumber;

  if (g.lines.length === 0) {
    issues.push({
      severity: 'fatal', scope: 'invoice', invoiceRef: invNo, sourceRow: g.rows[0],
      code: 'NO_LINES',
      message: `الفاتورة ${invNo} بلا بنود`,
    });
    return null;
  }

  const first = g.headerCandidates[0];

  // توفيق الحقول متفقة النطاق بين كل صفوف الفاتورة: القيمة الأولى غير الفارغة تُعتمد
  const reconcile = (key, { fatal = false } = {}) => {
    let chosen = null;
    for (const c of g.headerCandidates) {
      const v = c[key];
      const isEmpty = v === null || v === undefined || v === '';
      if (isEmpty) continue;
      if (chosen === null) { chosen = v; continue; }
      const differs = v instanceof Object
        ? JSON.stringify(v) !== JSON.stringify(chosen)
        : v !== chosen;
      if (differs) {
        issues.push({
          severity: fatal ? 'fatal' : 'warn',
          scope: 'invoice', invoiceRef: invNo, sourceRow: c.sourceRow,
          code: fatal ? 'INVOICE_LOCATION_CONFLICT' : 'INVOICE_HEADER_FIELD_MISMATCH',
          message: fatal
            ? `الفاتورة ${invNo} تحمل أكثر من موقع بين صفوفها — فاتورة واحدة يجب أن تكون بموقع واحد`
            : `حقل «${key}» يختلف بين صفوف الفاتورة ${invNo} — اعتُمدت أول قيمة غير فارغة`,
        });
      }
    }
    return chosen;
  };

  const location = reconcile('location', { fatal: true });
  const customerName = reconcile('customerName');
  const customerRef = reconcile('customerRef');
  const paymentMethod = reconcile('paymentMethod');
  const date = reconcile('date');
  const rawDate = reconcile('rawDate');
  const dueDate = reconcile('dueDate');
  const supplyDate = reconcile('supplyDate');
  const terms = reconcile('terms');
  const notes = reconcile('notes');
  const docDiscountValue = reconcile('docDiscountValue');
  const channel = reconcile('channel');

  const isReturn = g.lines.every(l => l.isReturn) && g.lines.length > 0;
  const mixed = g.lines.some(l => l.isReturn) && g.lines.some(l => !l.isReturn);
  if (mixed) {
    issues.push({
      severity: 'fatal', scope: 'invoice', invoiceRef: invNo, sourceRow: first?.sourceRow,
      code: 'MIXED_SELL_RETURN',
      message: `الفاتورة ${invNo} تخلط بنود بيع وبنود مرتجع`,
    });
  }

  const lines = toOutputLines(g.lines);
  const linesSum = round(lines.reduce((s, l) => s + l.sourceTotalInclusive, 0), 2);

  return {
    invoiceRef: invNo,
    isReturn,
    issueDateParts: date,
    rawDate,
    dueDateParts: dueDate,
    supplyDateParts: supplyDate,
    sourceCustomerName: customerName || '',
    sourceCustomerRef: customerRef || '',
    sourceLocation: location || '',
    channel: channel || '',
    sourcePaymentMethods: [paymentMethod].filter(Boolean),
    terms: terms || '',
    notes: notes || '',
    docDiscountValue,
    paidAmount: null,
    // لا رأس منفصل في هذا النمط: إجمالي الفاتورة هو مجموع بنودها
    sourceTotalInclusive: linesSum,
    lines,
    headerRow: first?.sourceRow ?? g.rows[0],
    rows: g.rows,
  };
}
