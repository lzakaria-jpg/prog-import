/**
 * تفكيك ملف مصدر نقاط البيع/سلة إلى فواتير مهيكلة.
 *
 * البنية المتوقعة: كل فاتورة = صف رأس (Sale) + صفوف بنود (Sale Line) + صفوف دفع (Payment)،
 * مربوطة بعمود رقم الفاتورة. المرتجعات تُفصل ولا تُستورد كفواتير مبيعات.
 */

import { toNum, toStr, round, parseDate, dateKey } from './num.js';

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
export function detectMapping(headers) {
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

  return mapping;
}

function isReturn(v) {
  const s = toStr(v).toLowerCase();
  return RETURN_MARKERS.some(m => s.includes(m));
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
      groups.set(invNo, { invoiceNumber: invNo, header: null, lines: [], payments: [], rows: [] });
    }
    const g = groups.get(invNo);
    g.rows.push(sourceRow);

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
      g.header = {
        sourceRow,
        date: parseDate(get(rec, 'date')),
        rawDate: toStr(get(rec, 'date')),
        customerName: toStr(get(rec, 'customerName')),
        location: toStr(get(rec, 'location')),
        channel: toStr(get(rec, 'channel')),
        isReturn: isReturn(get(rec, 'sellType')),
        totalInc: toNum(get(rec, 'totalInc')),
        subtotalEx: toNum(get(rec, 'subtotalEx')),
        totalTax: toNum(get(rec, 'totalTax')),
      };
    } else if (lt === LINE_TYPE.LINE) {
      const qty = toNum(get(rec, 'quantity'));
      const subtotalEx = toNum(get(rec, 'subtotalEx'));
      const discount = toNum(get(rec, 'discount')) || 0;
      // الضريبة الفعلية = إجمالي الضريبة، لأن VAT و Other taxes خانتان لنفس المبلغ
      const totalTax = toNum(get(rec, 'totalTax')) || 0;
      const totalInc = toNum(get(rec, 'totalInc'));

      g.lines.push({
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
      });
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
    const built = buildInvoice(g, issues);
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

  const lines = g.lines.map(l => {
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
    };
  });

  const linesSum = round(lines.reduce((s, l) => s + l.sourceTotalInclusive, 0), 2);
  const headerTotal = round(g.header.totalInc ?? 0, 2);

  const headerDiff = round(headerTotal - linesSum, 2);
  if (Math.abs(headerDiff) > 0.011) {
    // فرق بحدود القروش أصله تقريب داخلي في نظام المصدر، ولا يدل على خلل بيانات.
    // الفرق الأكبر يعني أن رأس الفاتورة لا يمثّل بنودها — بيانات معطوبة تُوقف الاستيراد.
    const isRounding = Math.abs(headerDiff) <= 0.05;
    issues.push({
      severity: isRounding ? 'warn' : 'fatal',
      scope: 'invoice', invoiceRef: invNo, sourceRow: g.header.sourceRow,
      code: isRounding ? 'HEADER_LINES_ROUNDING' : 'HEADER_LINES_MISMATCH',
      message: isRounding
        ? `فرق تقريب ${headerDiff} بين رأس الفاتورة ${headerTotal} ومجموع بنودها ${linesSum} — مصدره نظام العميل`
        : `إجمالي رأس الفاتورة ${headerTotal} لا يساوي مجموع بنودها ${linesSum} — فرق ${headerDiff}`,
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
    sourceCustomerName: g.header.customerName,
    sourceLocation: g.header.location,
    channel: g.header.channel,
    sourcePaymentMethods: methods,
    paidAmount: paidSum,
    sourceTotalInclusive: headerTotal,
    lines,
    headerRow: g.header.sourceRow,
    rows: g.rows,
  };
}
