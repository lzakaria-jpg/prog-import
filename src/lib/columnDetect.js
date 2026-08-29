/**
 * وحدة مركزية لاكتشاف الأعمدة — قابلة لإعادة الاستخدام في كل ملفات أداة استيراد
 * فواتير المبيعات (ملف العملاء، ملف المنتجات، ملف كميات المواقع، ملف الفواتير).
 *
 * ثلاث طبقات مطابقة، كل طبقة تُجرَّب فقط إذا فشلت التي قبلها:
 *   1. تطابق تام بعد التطبيع (أعلى ثقة).
 *   2. احتواء جزئي (رأس يحتوي مرادفاً، أو العكس).
 *   3. تشابه تقريبي (Levenshtein) — يلتقط الأخطاء الإملائية البسيطة فقط.
 *
 * لا تخمين صامت: كل مطابقة تحمل درجة ثقة، وطبقة أعلى تستدعي `validateColumnContent`
 * لتصحيح الاختيار بفحص محتوى العمود الفعلي، لا اسمه وحده.
 */

const EPS_LEN = 1;

/** تطبيع نص عربي/إنجليزي موحَّد: إزالة التشكيل، توحيد الألف والياء والتاء المربوطة،
 *  إزالة المسافات والرموز، تصغير الأحرف اللاتينية. يُستخدم لكل من رؤوس الأعمدة ومحتواها. */
export function normalizeText(v) {
  return String(v ?? '')
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/[ً-ْٰ​-‏﻿]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىیي]/g, 'ي')
    .replace(/[کك]/g, 'ك')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[ـ]/g, '')
    .replace(/[_\-/\\.,،:;'"*]/g, ' ')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** مسافة Levenshtein بين نصين مطبَّعين */
export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** تشابه نسبي بين 0 و1 مبني على Levenshtein */
export function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * قاموس المرادفات — قابل للتوسعة: أضف حقلاً جديداً أو مرادفات لحقل قائم دون تعديل
 * أي منطق آخر. كل حقل: { ar: [...], en: [...] } نصوص خام (غير مطبَّعة)، تُطبَّع عند
 * الاستخدام. الأقصر أولاً لا يهم — الترتيب لا يؤثر على النتيجة.
 */
export const FIELD_SYNONYMS = {
  customerName: {
    ar: ['اسم العميل', 'العميل', 'الاسم', 'اسم الزبون', 'الزبون', 'اسم المشتري', 'اسم العميل بالعربي'],
    en: ['customer name', 'customer', 'client', 'client name', 'name', 'buyer', 'account name', 'cust', 'cs'],
  },
  customerRef: {
    ar: ['الرقم المرجعي', 'رقم العميل', 'كود العميل', 'معرف العميل', 'الرقم المرجعي للعميل', 'رقم مرجعي'],
    en: ['customer id', 'customer code', 'customer reference', 'customer ref', 'reference', 'ref', 'id', 'code'],
  },
  productName: {
    ar: ['اسم المنتج', 'المنتج', 'الصنف', 'اسم الصنف', 'وصف المنتج'],
    en: ['product name', 'item name', 'product', 'item', 'description', 'name'],
  },
  productCode: {
    ar: ['الرقم التسلسلي', 'رمز المنتج', 'كود المنتج', 'رقم المنتج', 'رقم الصنف', 'كود الصنف', 'الباركود', 'باركود'],
    en: ['sku', 'barcode', 'product code', 'item code', 'product id', 'serial', 'serial number', 'upc', 'ean', 'gtin'],
  },
  sellable: {
    ar: ['يباع', 'قابل للبيع', 'حالة البيع', 'نشط'],
    en: ['sold', 'sellable', 'sale status', 'active', 'is sold', 'for sale'],
  },
  stock: {
    ar: ['الكمية المتاحة', 'الكمية', 'المخزون', 'الرصيد'],
    en: ['stock', 'available', 'quantity on hand', 'qty', 'quantity'],
  },
  invoiceRef: {
    ar: ['رقم الفاتورة', 'المرجع', 'التسلسل', 'مرجع الفاتورة'],
    en: ['invoice number', 'invoice no', 'reference', 'ref', 'serial', 'document number', 'invoice ref'],
  },
  issueDate: { ar: ['تاريخ الإصدار', 'تاريخ الفاتورة', 'التاريخ'], en: ['issue date', 'invoice date', 'date'] },
  dueDate: { ar: ['تاريخ الاستحقاق'], en: ['due date'] },
  supplyDate: { ar: ['تاريخ التوريد'], en: ['supply date'] },
  location: {
    ar: ['الموقع', 'الفرع', 'المستودع', 'المخزن', 'مركز التكلفة'],
    en: ['location', 'branch', 'warehouse', 'store', 'site', 'outlet', 'cost center'],
  },
  paymentMethod: {
    ar: ['طريقة الدفع', 'وسيلة الدفع', 'نوع الدفع'],
    en: ['payment method', 'payment type', 'payment mode', 'tender'],
  },
  terms: { ar: ['الشروط والأحكام', 'الشروط', 'الأحكام'], en: ['terms', 'terms and conditions'] },
  notes: { ar: ['الملاحظات', 'ملاحظات'], en: ['notes', 'remarks', 'comment', 'comments'] },
  docDiscountValue: {
    ar: ['خصم إجمالي', 'خصم الفاتورة', 'خصم المستند', 'قيمة خصم المستند'],
    en: ['invoice discount', 'document discount', 'total discount'],
  },
  unit: { ar: ['الوحدة', 'وحدة القياس'], en: ['unit', 'uom', 'unit of measure'] },
  unitPrice: { ar: ['سعر الوحدة', 'سعر'], en: ['unit price', 'price'] },
  discountPct: { ar: ['نسبة الخصم', 'خصم %'], en: ['discount percent', 'discount %', 'discount rate'] },
  discountVal: { ar: ['قيمة الخصم', 'مبلغ الخصم'], en: ['discount value', 'discount amount'] },
  taxInclusive: { ar: ['شامل الضريبة', 'شامل؟', 'شامل'], en: ['tax inclusive', 'inclusive', 'incl. tax'] },
  quantity: { ar: ['الكمية', 'العدد'], en: ['quantity', 'qty', 'count', 'units'] },
};

function synonymList(fieldKey, extra) {
  const base = FIELD_SYNONYMS[fieldKey] || { ar: [], en: [] };
  const extraForField = extra?.[fieldKey] || { ar: [], en: [] };
  return [...(base.ar || []), ...(base.en || []), ...(extraForField.ar || []), ...(extraForField.en || [])]
    .map(normalizeText)
    .filter(Boolean);
}

/**
 * يحسب درجة تطابق رأس عمود واحد بحقل واحد.
 * @returns {{score:number, via:'exact'|'partial'|'fuzzy'|null}}
 */
export function scoreColumnMatch(header, fieldKey, extraSynonyms) {
  const h = normalizeText(header);
  if (!h) return { score: 0, via: null };
  const syns = synonymList(fieldKey, extraSynonyms);
  if (!syns.length) return { score: 0, via: null };

  // ١) تطابق تام
  if (syns.includes(h)) return { score: 100, via: 'exact' };

  // ٢) احتواء جزئي (بالاتجاهين): "اسم_العميل_الكامل" يحتوي "اسمالعميل"، والعكس أيضاً
  let best = 0;
  for (const s of syns) {
    if (s.length < 3) continue; // مرادف قصير جداً يعطي نتائج زائفة عبر الاحتواء
    if (h.includes(s) || s.includes(h)) {
      const longer = Math.max(h.length, s.length);
      const shorter = Math.min(h.length, s.length);
      const score = 55 + Math.round((shorter / longer) * 20); // 55–75
      if (score > best) best = score;
    }
  }
  if (best > 0) return { score: best, via: 'partial' };

  // ٣) تشابه تقريبي — يلتقط أخطاء إملائية بسيطة فقط، حد أدنى صارم لتفادي مطابقات زائفة
  for (const s of syns) {
    if (Math.abs(s.length - h.length) > Math.max(3, s.length * 0.4)) continue;
    const sim = similarity(h, s);
    if (sim >= 0.82) {
      const score = Math.round(35 + sim * 15); // 64–50 نطاق أدنى من partial عمداً
      if (score > best) best = score;
    }
  }
  if (best > 0) return { score: best, via: 'fuzzy' };

  return { score: 0, via: null };
}

/**
 * يخصّص كل عمود لحقل واحد على الأكثر من بين مجموعة حقول مطلوبة، بأسلوب جشع:
 * تُحسب كل الاحتمالات، تُرتَّب تنازلياً، ثم يُخصَّص كل عمود وحقل مرة واحدة فقط.
 *
 * @param {string[]} headers رؤوس الأعمدة كما وردت (غير مطبَّعة)
 * @param {string[]} fieldKeys الحقول المطلوب اكتشافها (مفاتيح من FIELD_SYNONYMS أو ممرَّرة عبر extraSynonyms)
 * @param {object} [opts]
 * @param {object} [opts.extraSynonyms] مرادفات إضافية لكل حقل: { fieldKey: { ar:[], en:[] } }
 * @param {number} [opts.minScore=45] أدنى درجة تُقبَل كمطابقة
 * @returns {{mapping: Record<string,string>, scores: Record<string,{score:number,via:string}>}}
 *          mapping: حقل → اسم العمود (الرأس الخام). scores: نفس المفاتيح مع تفاصيل الدرجة.
 */
export function detectColumns(headers, fieldKeys, opts = {}) {
  const { extraSynonyms, minScore = 45 } = opts;
  const candidates = [];

  headers.forEach((header, idx) => {
    for (const field of fieldKeys) {
      const { score, via } = scoreColumnMatch(header, field, extraSynonyms);
      if (score >= minScore) candidates.push({ field, idx, header, score, via });
    }
  });

  candidates.sort((a, b) => b.score - a.score);

  const mapping = {};
  const scores = {};
  const usedCols = new Set();
  const usedFields = new Set();
  for (const c of candidates) {
    if (usedFields.has(c.field) || usedCols.has(c.idx)) continue;
    mapping[c.field] = c.header;
    scores[c.field] = { score: c.score, via: c.via, columnIndex: c.idx };
    usedFields.add(c.field);
    usedCols.add(c.idx);
  }

  return { mapping, scores };
}

/**
 * يفحص أول صفوف الملف بحثاً عن صف العناوين الحقيقي، بدل افتراض أنه الصف الأول.
 *
 * ملفات العملاء الواقعية قد تبدأ بمقدمة وصفية أو صف عنوان أو صفوف فارغة قبل صف
 * العناوين الفعلي. يُجرَّب كل صف من أول `maxScan` صفاً كمرشّح، ويُحسب مجموع درجات
 * تطابقه مع الحقول المطلوبة، ويُختار الأعلى مجموعاً — بشرط عبوره حداً أدنى من
 * الحقول المطابقة، وإلا فالصف الأول هو الافتراض الآمن.
 *
 * @param {Array<Array>} rows صفوف خام (كل صف مصفوفة قيم الخلايا بترتيب الأعمدة)
 * @param {string[]} fieldKeys الحقول المتوقعة لتقييم كل صف كمرشّح عناوين
 * @param {object} [opts]
 * @param {number} [opts.maxScan=10]
 * @param {object} [opts.extraSynonyms]
 * @param {number} [opts.minFieldsMatched=2] أدنى عدد حقول مطابقة ليُعتمد صف كعناوين
 * @returns {{rowIndex:number, headers:string[], mapping:object, scores:object, confidence:number}}
 */
export function findHeaderRow(rows, fieldKeys, opts = {}) {
  const { maxScan = 10, extraSynonyms, minFieldsMatched = 2 } = opts;
  const scanLimit = Math.min(maxScan, rows.length);

  let best = null;
  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r];
    if (!row || !row.some(c => String(c ?? '').trim() !== '')) continue; // صف فارغ تماماً

    const headers = row.map(c => String(c ?? '').trim());
    const { mapping, scores } = detectColumns(headers, fieldKeys, { extraSynonyms });
    const matchedCount = Object.keys(mapping).length;
    if (matchedCount < minFieldsMatched) continue;

    const totalScore = Object.values(scores).reduce((s, x) => s + x.score, 0);
    if (!best || totalScore > best.totalScore) {
      best = { rowIndex: r, headers, mapping, scores, matchedCount, totalScore };
    }
  }

  if (!best) {
    // لا صف تجاوز الحد الأدنى: الصف الأول هو الافتراض الآمن الموثَّق بثقة صفر،
    // حتى تعرف الواجهة أن الاكتشاف لم ينجح وتطلب تدخل المستخدم بدل التخمين.
    const headers = (rows[0] || []).map(c => String(c ?? '').trim());
    return { rowIndex: 0, headers, mapping: {}, scores: {}, confidence: 0 };
  }

  // ثقة تقريبية: متوسط درجات الحقول المطابقة منسوباً إلى 100
  const avgScore = best.totalScore / Math.max(best.matchedCount, 1);
  const confidence = Math.round(Math.min(100, avgScore));

  return { rowIndex: best.rowIndex, headers: best.headers, mapping: best.mapping, scores: best.scores, confidence };
}

/**
 * يتحقق من محتوى عمود مرشَّح ليؤكد أنه يمثّل فعلاً ما يُفترض، لا اسمه فقط.
 * لا يرفض المطابقة، بل يعيد تحذيراً يُعرض للمستخدم عند الشك.
 *
 * @param {Array} values قيم العمود عبر عيّنة من الصفوف
 * @param {'text'|'numeric'|'code'} kind النوع المتوقع لمحتوى العمود
 * @returns {{ok:boolean, reason?:string, sampleNonMatching?:Array}}
 */
export function validateColumnByContent(values, kind) {
  const nonEmpty = (values || []).filter(v => String(v ?? '').trim() !== '');
  if (nonEmpty.length === 0) return { ok: true }; // عمود فارغ بالكامل — لا دليل يُبنى عليه حكم

  const isNumeric = v => /^[\d٠-٩۰-۹\s.,]+$/.test(String(v).trim()) && String(v).trim() !== '';

  if (kind === 'numeric') {
    const bad = nonEmpty.filter(v => !isNumeric(v));
    const ratio = bad.length / nonEmpty.length;
    if (ratio > 0.3) {
      return { ok: false, reason: 'أغلب القيم ليست أرقاماً', sampleNonMatching: bad.slice(0, 5) };
    }
    return { ok: true };
  }

  if (kind === 'text') {
    const bad = nonEmpty.filter(v => isNumeric(v));
    const ratio = bad.length / nonEmpty.length;
    if (ratio > 0.6) {
      return { ok: false, reason: 'أغلب القيم أرقام صرفة، لا تشبه أسماء', sampleNonMatching: bad.slice(0, 5) };
    }
    return { ok: true };
  }

  return { ok: true };
}
