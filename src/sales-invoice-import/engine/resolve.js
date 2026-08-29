/**
 * محرك المطابقة — يربط بيانات المصدر بمراجع قيود المرفوعة.
 *
 * مبدأ حاكم: لا تخمين. المطابقة إما مؤكدة أو تُعرض على المستخدم ليقررها يدوياً.
 * سبب الصرامة: أكثر أسباب فشل الاستيراد في قيود هو مطابقة العميل بالاسم بدل
 * الرقم المرجعي، ومطابقة تقريبية صامتة تنتج فواتير على العميل الخطأ.
 */

import { normalizeAr, normalizeCode, toStr, round } from './num.js';

/* ────────────────────────────── العملاء ────────────────────────────── */

/**
 * @param {object[]} customers [{ ref, name, ...}] من ملف عملاء قيود
 * @returns فهرس مطابقة
 */
export function buildCustomerIndex(customers) {
  const byRef = new Map();
  const byName = new Map();
  const byNameAll = new Map();
  const dupNames = new Set();

  for (const c of customers) {
    const ref = toStr(c.ref);
    const name = toStr(c.name);
    if (ref) byRef.set(normalizeCode(ref), c);
    if (name) {
      const k = normalizeAr(name);
      if (!byNameAll.has(k)) byNameAll.set(k, []);
      byNameAll.get(k).push(c);
      if (byName.has(k)) dupNames.add(k);
      else byName.set(k, c);
    }
  }
  return { byRef, byName, byNameAll, dupNames, all: customers };
}

/**
 * يطابق عميل المصدر بسجل عميل في قيود.
 *
 * ترتيب الأولوية: قرار يدوي سابق ← الرقم المرجعي من ملف الفواتير إن وُجد وصحّ ←
 * مطابقة الاسم. تكرار الاسم بين عدة عملاء لا يُحسم عشوائياً؛ تُعاد قائمة كل
 * الأرقام المرجعية المحتملة لنفس الاسم ليختار المستخدم بينها.
 *
 * @param {string} sourceName
 * @param {object} index من buildCustomerIndex
 * @param {object} [overrides] قرارات يدوية سابقة: { [sourceName]: ref }
 * @param {string} [sourceRef] الرقم المرجعي كما ورد في ملف الفواتير، إن وُجد عمود له
 * @returns {{status:'matched'|'ambiguous'|'unmatched'|'empty', ref?:string, customer?:object, candidates?:object[]}}
 */
export function matchCustomer(sourceName, index, overrides = {}, sourceRef = '') {
  const name = toStr(sourceName);
  const ref = toStr(sourceRef);

  // قرار يدوي سابق له الأولوية المطلقة
  if (name && overrides[name]) {
    return { status: 'matched', ref: toStr(overrides[name]), manual: true };
  }

  // الرقم المرجعي من ملف الفواتير، بعد التحقق من وجوده فعلاً في ملف عملاء قيود
  if (ref) {
    const hit = index.byRef.get(normalizeCode(ref));
    if (hit) return { status: 'matched', ref: toStr(hit.ref), customer: hit, via: 'ref' };
  }

  if (!name) {
    if (overrides[''] !== undefined && toStr(overrides['']))
      return { status: 'matched', ref: toStr(overrides['']), manual: true, viaDefault: true };
    if (ref) return { status: 'unmatched', reason: `الرقم المرجعي «${ref}» غير موجود في ملف عملاء قيود` };
    return { status: 'empty' };
  }

  const k = normalizeAr(name);
  if (index.dupNames.has(k)) {
    const candidates = (index.byNameAll.get(k) || []).map(c => ({ ref: toStr(c.ref), name: toStr(c.name) }));
    return { status: 'ambiguous', reason: 'أكثر من عميل بنفس الاسم في قيود', candidates };
  }
  const hit = index.byName.get(k);
  if (hit) return { status: 'matched', ref: toStr(hit.ref), customer: hit };

  return { status: 'unmatched' };
}

/* ────────────────────────────── المنتجات ────────────────────────────── */

/**
 * يفهرس المنتجات بالرمز والباركود معاً.
 *
 * عمود المنتج في قالب الفواتير اسمه «الرقم التسلسلي/الباركود للمنتج»، وقيود
 * يقبل أياً منهما. وملفات المنتجات تحمل العمودين منفصلين، فيجب أن يصلا كلاهما
 * إلى الفهرس وإلا فشلت مطابقة كل منتج معرَّف بباركوده.
 *
 * @param {object[]} products [{ code, barcode, name, stock, tracked, stockKnown }]
 */
export function buildProductIndex(products) {
  const byCode = new Map();
  const byName = new Map();
  const dupNames = new Set();
  // منتجات غير مسموح ببيعها (sellable === false): تُستبعد من كل مطابقة أو اقتراح،
  // لكن تُحفظ هنا فقط لتفسير سبب عدم التطابق بدل الإيحاء بأن الرمز غير موجود أصلاً
  const excludedByCode = new Map();
  const excludedByName = new Map();
  const sellableProducts = [];

  for (const p of products) {
    if (p.sellable === false) {
      for (const raw of [p.code, p.barcode]) {
        const k = normalizeCode(raw);
        if (k && !excludedByCode.has(k)) excludedByCode.set(k, p);
      }
      const n = toStr(p.name);
      if (n && !excludedByName.has(normalizeAr(n))) excludedByName.set(normalizeAr(n), p);
      continue;
    }

    sellableProducts.push(p);
    for (const raw of [p.code, p.barcode]) {
      const k = normalizeCode(raw);
      if (k && !byCode.has(k)) byCode.set(k, p);
    }
    const name = toStr(p.name);
    if (name) {
      const k = normalizeAr(name);
      if (byName.has(k)) dupNames.add(k);
      else byName.set(k, p);
    }
  }

  const stockKnown = sellableProducts.filter(p => p.stockKnown).length;
  return {
    byCode, byName, dupNames, excludedByCode, excludedByName,
    all: sellableProducts, stockKnown, hasStockData: stockKnown > 0,
  };
}

/**
 * يطابق بند مصدر بمنتج في قيود — بالرمز أولاً ثم بالاسم.
 */
export function matchProduct(sourceSku, sourceName, index, overrides = {}) {
  const sku = toStr(sourceSku);
  const name = toStr(sourceName);
  const key = sku || name;

  if (key && overrides[key] !== undefined) {
    const code = toStr(overrides[key]);
    const p = index.byCode.get(normalizeCode(code));
    return { status: 'matched', code, product: p, manual: true };
  }

  if (sku) {
    const p = index.byCode.get(normalizeCode(sku));
    // يُعاد الرمز كما ورد في المصدر لأنه المفتاح الذي يعرفه قيود لهذا المنتج،
    // سواء كان الرقم التسلسلي أو الباركود
    if (p) return { status: 'matched', code: toStr(sku), product: p, via: 'code' };

    // الرمز موجود لكن المنتج غير مسموح ببيعه — لا يُقترح ولا يُطابق، ويُوضَّح السبب
    const excluded = index.excludedByCode.get(normalizeCode(sku));
    if (excluded) {
      return { status: 'unmatched', reason: `المنتج «${toStr(excluded.name) || sku}» غير مسموح ببيعه` };
    }

    // الرمز لم يطابق: قد يكون المنتج نفسه موجوداً برمز آخر (تغيّر ترميز، أو
    // نسخة مختلفة من الرمز). تُجرَّب المطابقة بالاسم، ويُعلَّم أنها احتياطية
    // ليراها المستخدم في شاشة المطابقة بدل أن تمر صامتة.
    if (name) {
      const k = normalizeAr(name);
      if (!index.dupNames.has(k)) {
        const byName = index.byName.get(k);
        if (byName) {
          return {
            status: 'matched',
            code: toStr(byName.code) || toStr(byName.barcode),
            product: byName,
            via: 'name-fallback',
            warning: `الرمز ${sku} غير موجود في قيود — طوبق المنتج باسمه ورُبط بالرمز ${toStr(byName.code) || toStr(byName.barcode)}`,
          };
        }
      }
    }

    return { status: 'unmatched', reason: `الرمز ${sku} غير موجود في قائمة منتجات قيود` };
  }

  if (name) {
    const k = normalizeAr(name);
    if (index.dupNames.has(k)) {
      return { status: 'ambiguous', reason: 'أكثر من منتج بنفس الاسم في قيود' };
    }
    const p = index.byName.get(k);
    if (p) return { status: 'matched', code: toStr(p.code) || toStr(p.barcode), product: p, via: 'name' };

    if (index.excludedByName.has(k)) {
      return { status: 'unmatched', reason: `المنتج «${name}» غير مسموح ببيعه` };
    }
    return { status: 'unmatched', reason: 'لا يوجد رمز، ولا يطابق الاسم أي منتج في قيود' };
  }

  return { status: 'empty' };
}

/**
 * يفهرس ملف كميات المنتجات حسب المواقع (من io/readWorkbook.js parseLocationStock)
 * بالرمز وبالاسم، ليُطابَق بأي معرّف متاح دون الاعتماد على ترتيب الصفوف بين الملفين.
 */
export function buildLocationStockIndex(locationStock) {
  if (!locationStock || !locationStock.rows?.length) return null;
  const byCode = new Map();
  const byName = new Map();
  for (const row of locationStock.rows) {
    const codeKey = normalizeCode(row.code);
    if (codeKey && !byCode.has(codeKey)) byCode.set(codeKey, row);
    const nameKey = normalizeAr(row.name);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, row);
  }
  return { byCode, byName, locationColumns: locationStock.locationColumns };
}

function findLocationStockRow(code, name, locationStockIndex) {
  if (!locationStockIndex) return null;
  const byCode = code ? locationStockIndex.byCode.get(normalizeCode(code)) : null;
  if (byCode) return byCode;
  return name ? (locationStockIndex.byName.get(normalizeAr(name)) || null) : null;
}

/**
 * فحص كفاية الكميات — رصيد متسلسل وديناميكي، لا كمية أصلية تُعاد استخدامها لكل فاتورة.
 *
 * لكل منتج (ولكل موقع إن توفّر ملف كميات حسب المواقع — وهو المصدر الوحيد المعتمد
 * للكمية حسب الموقع، لا إجمالي ملف تعريف المنتجات) يُبنى رصيد متبقٍّ واحد، ثم
 * تُعالَج الفواتير بالترتيب الذي وردت به (وهو نفسه ترتيبها الزمني من parseSource):
 * فاتورة تُقبل بالكامل تخصم طلبها من الرصيد المتبقي فينتقل الفارق للفاتورة التالية؛
 * فاتورة يتجاوز طلبها الرصيد المتبقي وقتها تُعلَّم ناقصة ولا تُخصَم من الرصيد — لن
 * تُنشأ فعلياً في قيود، فلا يجوز أن تُحرم الفواتير اللاحقة من رصيد لم يُستهلَك فعلاً.
 *
 * بنود الفاتورة نفسها لنفس المنتج تُجمَع أولاً (سطر 5 + سطر 8 = طلب واحد قدره 13)
 * قبل مقارنتها بالرصيد، فلا تُقبَل جزئياً بسبب تفرقها على أكثر من سطر.
 *
 * منتج لا يظهر في ملف كميات المواقع إطلاقاً — رغم وجوده في ملف تعريف المنتجات —
 * منتج غير مخزَّن: يُباع بلا حد وبلا خصم من أي رصيد، لا يُعامَل كمنتج كميته صفر.
 *
 * بدون ملف كميات حسب المواقع، يبقى السلوك كما كان تماماً: رصيد عالمي واحد لكل
 * منتج من ملف تعريف المنتجات.
 *
 * @param {Array<{code:string, quantity:number, invoiceRef:string, sourceRow:number, location?:string}>} demands
 * @param {object} productIndex
 * @param {object|null} [locationStockIndex] من buildLocationStockIndex
 * @returns {Array<{code, location, name, required, available, remaining, shortage,
 *   invoiceCount, invoices, insufficientInvoices, rows, breakdown, status}>}
 *   breakdown: تسلسل الفواتير كما عولجت، كل عنصر بالرصيد المتبقي *قبل* معالجتها
 *   تحديداً (لا الرصيد الأصلي)، ليُعرض في واجهة المراجعة الرقم الصحيح وقت كل فاتورة.
 */
export function checkStock(demands, productIndex, locationStockIndex = null) {
  const groups = new Map();

  for (const d of demands) {
    const k = normalizeCode(d.code);
    if (!k) continue;
    const loc = toStr(d.location);
    const groupKey = locationStockIndex ? `${k}::${loc}` : k;
    if (!groups.has(groupKey)) groups.set(groupKey, { code: d.code, location: loc, order: [], perInvoice: new Map() });
    const grp = groups.get(groupKey);
    if (!grp.perInvoice.has(d.invoiceRef)) {
      grp.perInvoice.set(d.invoiceRef, { invoiceRef: d.invoiceRef, required: 0, rows: [] });
      grp.order.push(d.invoiceRef); // أول ظهور لكل فاتورة يحفظ ترتيب المعالجة
    }
    const e = grp.perInvoice.get(d.invoiceRef);
    e.required = round(e.required + (d.quantity || 0), 6);
    e.rows.push(d.sourceRow);
  }

  const results = [];
  for (const grp of groups.values()) {
    const k = normalizeCode(grp.code);
    const p = productIndex.byCode.get(k);

    let initialAvailable = null;
    // baseStatus مضبوطة تعني: هذا المفتاح لا يخضع لفحص كمية إطلاقاً (منتج غير
    // معروف، غير مخزَّن، أو رصيده غير معروف) — كل الفواتير تمر دون قيد ولا خصم
    let baseStatus = null;

    if (locationStockIndex) {
      const locRow = p ? findLocationStockRow(grp.code, toStr(p.name), locationStockIndex) : null;
      if (!p) baseStatus = 'unknown_product';
      // غياب المنتج عن ملف مواقع المنتجات ليس خطأً ولا يعني كمية صفر: هذا هو
      // تعريف «منتج غير مخزَّن» — عدد منتجات الملفين قد يختلف طبيعياً
      else if (!locRow) baseStatus = 'not_tracked';
      else {
        const qty = locRow.quantities[grp.location];
        initialAvailable = qty === null || qty === undefined ? null : qty;
        if (initialAvailable === null) baseStatus = 'stock_unknown';
      }
    } else {
      initialAvailable = p && p.stockKnown ? Number(p.stock) : null;
      if (!p) baseStatus = 'unknown_product';
      else if (p.tracked === false) baseStatus = 'not_tracked';
      else if (initialAvailable === null) baseStatus = 'stock_unknown';
    }

    const breakdown = [];
    let remaining = initialAvailable;
    let totalRequired = 0;
    let totalShortage = 0;
    const insufficientInvoices = [];

    for (const ref of grp.order) {
      const e = grp.perInvoice.get(ref);
      totalRequired = round(totalRequired + e.required, 6);

      if (baseStatus) {
        breakdown.push({
          invoiceRef: ref, requested: e.required, availableBefore: null,
          status: baseStatus, shortage: 0, rows: e.rows,
        });
        continue;
      }

      const availableBefore = remaining;
      if (e.required <= remaining + 1e-9) {
        remaining = round(remaining - e.required, 6);
        breakdown.push({ invoiceRef: ref, requested: e.required, availableBefore, status: 'ok', shortage: 0, rows: e.rows });
      } else {
        // الفاتورة الناقصة تُعلَّم ولا تُخصَم — لن تُنشأ فعلياً، فلا يُحرَم منها الرصيد
        const shortage = round(e.required - availableBefore, 6);
        totalShortage = round(totalShortage + shortage, 6);
        insufficientInvoices.push(ref);
        breakdown.push({ invoiceRef: ref, requested: e.required, availableBefore, status: 'insufficient', shortage, rows: e.rows });
      }
    }

    const status = baseStatus || (insufficientInvoices.length ? 'insufficient' : 'ok');

    results.push({
      code: grp.code,
      location: grp.location,
      name: p ? toStr(p.name) : '',
      required: totalRequired,
      available: initialAvailable,
      remaining: baseStatus ? null : remaining,
      shortage: totalShortage,
      invoiceCount: grp.order.length,
      invoices: [...grp.order],
      insufficientInvoices,
      rows: grp.order.flatMap(ref => grp.perInvoice.get(ref).rows),
      breakdown,
      status,
    });
  }

  results.sort((x, y) => (y.shortage - x.shortage) || (y.required - x.required));
  return results;
}

/* ────────────────── القوائم المعتمدة: مواقع / دفع / ضريبة ────────────────── */

/**
 * يطابق قيمة مصدر بقيمة معتمدة في قوائم القالب.
 * لا يقبل إلا مطابقة تامة بعد التطبيع، أو قراراً يدوياً — لأن قيود يرفض
 * أي قيمة خارج القائمة المنسدلة.
 */
export function matchListValue(sourceValue, allowedValues, overrides = {}, defaultValue = null) {
  const v = toStr(sourceValue);

  if (overrides[v] !== undefined) {
    const chosen = toStr(overrides[v]);
    return allowedValues.includes(chosen)
      ? { status: 'matched', value: chosen, manual: true }
      : { status: 'invalid', reason: `القيمة «${chosen}» غير موجودة في قائمة القالب` };
  }

  if (!v) {
    if (defaultValue && allowedValues.includes(defaultValue)) {
      return { status: 'matched', value: defaultValue, viaDefault: true };
    }
    return { status: 'empty' };
  }

  const exact = allowedValues.find(a => toStr(a) === v);
  if (exact) return { status: 'matched', value: exact };

  const norm = allowedValues.find(a => normalizeAr(a) === normalizeAr(v));
  if (norm) return { status: 'matched', value: norm, via: 'normalized' };

  return { status: 'unmatched' };
}

/**
 * كـ matchListValue، مع محاولة إضافية عبر مجموعات مرادفات مفاهيمية قبل إعلان
 * عدم التطابق — مثل «رئيسي/مخزن رئيسي/المستودع الرئيسي» ← نفس مفهوم الموقع
 * الرئيسي، أو «الرياض/Riyadh/reyadh» ← نفس موقع الرياض في القالب، أياً كانت
 * صياغته الحرفية بالقالب.
 *
 * @param {object} synonymGroups { مفهوم: [مرادفاته...] }
 */
export function matchListValueSmart(sourceValue, allowedValues, synonymGroups, overrides = {}, defaultValue = null) {
  const direct = matchListValue(sourceValue, allowedValues, overrides, defaultValue);
  if (direct.status !== 'unmatched') return direct;

  const v = normalizeAr(sourceValue);
  if (!v || !synonymGroups) return direct;

  const belongsTo = (text, syns) => syns.some(s => {
    const sv = normalizeAr(s);
    return sv && (text === sv || text.includes(sv) || sv.includes(text));
  });

  const sourceConcept = Object.entries(synonymGroups).find(([, syns]) => belongsTo(v, syns))?.[0];
  if (!sourceConcept) return direct;

  const matches = allowedValues.filter(a => belongsTo(normalizeAr(a), synonymGroups[sourceConcept]));
  if (matches.length === 1) return { status: 'matched', value: matches[0], via: 'synonym' };
  if (matches.length > 1) {
    return { status: 'ambiguous', reason: 'أكثر من قيمة معتمدة محتملة لنفس المفهوم', candidates: matches };
  }
  return direct;
}

/**
 * يطابق نسبة ضريبة مشتقة من المصدر بتسمية ضريبة في القالب.
 * تسميات القالب تحوي النسبة نصاً، مثل: «ضريبة القيمة المضافة - 15.0%».
 */
export function matchTaxByRate(rate, taxLabels, tolerance = 0.005) {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return { status: 'empty' };
  const target = rate * 100;

  const candidates = taxLabels.map(label => {
    const m = toStr(label).match(/(\d+(?:[.,]\d+)?)\s*%/);
    return { label, pct: m ? Number(m[1].replace(',', '.')) : null };
  }).filter(c => c.pct !== null);

  const hit = candidates.find(c => Math.abs(c.pct - target) <= tolerance * 100);
  if (hit) return { status: 'matched', value: hit.label, pct: hit.pct / 100 };

  return { status: 'unmatched', reason: `لا توجد ضريبة بنسبة ${round(target, 2)}% في قوائم القالب` };
}

/**
 * يحدد تسمية الضريبة لكل بند في فاتورة.
 *
 * المشكلة التي يعالجها: البند الذي وعاؤه الضريبي صفر (منتج مجاني، أو رسوم بصفر،
 * أو خصم 100%) لا يمكن اشتقاق نسبته حسابياً لأن القسمة على صفر. وهذه الحالة
 * تمثّل 131 بنداً في ملف العميل المرجعي.
 *
 * التسلسل: النسبة المشتقة من البند ← الضريبة السائدة في نفس الفاتورة ←
 * الضريبة الافتراضية المختارة. ولا يُخمَّن شيء بصمت: كل بند وُرث حكمه يُبلَّغ عنه.
 *
 * @param {object} invoice فاتورة المصدر
 * @param {string[]} taxLabels قوائم الضرائب من القالب
 * @param {string} defaultLabel التسمية الافتراضية عند تعذر كل ما سبق
 */
export function resolveInvoiceTaxes(invoice, taxLabels, defaultLabel) {
  const perLine = invoice.lines.map(l => matchTaxByRate(l.taxRateRaw, taxLabels));

  // الضريبة السائدة = الأكثر تكراراً بين البنود التي أمكن اشتقاق نسبتها
  const counts = new Map();
  perLine.forEach(m => {
    if (m.status === 'matched') counts.set(m.value, (counts.get(m.value) || 0) + 1);
  });
  let dominant = null;
  let best = 0;
  for (const [label, n] of counts) if (n > best) { best = n; dominant = label; }

  const notes = [];
  const resolved = perLine.map((m, i) => {
    if (m.status === 'matched') return { label: m.value, pct: m.pct, via: 'line' };

    const fallbackLabel = dominant || defaultLabel;
    const pctMatch = toStr(fallbackLabel).match(/(\d+(?:[.,]\d+)?)\s*%/);
    const pct = pctMatch ? Number(pctMatch[1].replace(',', '.')) / 100 : 0;

    notes.push({
      severity: 'warn', scope: 'line',
      invoiceRef: invoice.invoiceRef,
      sourceRow: invoice.lines[i].sourceRow,
      code: 'TAX_INHERITED',
      message: dominant
        ? `وعاء البند الضريبي صفر — وُرثت ضريبة الفاتورة السائدة «${fallbackLabel}»`
        : `وعاء البند الضريبي صفر ولا توجد ضريبة سائدة في الفاتورة — استُخدمت الضريبة الافتراضية «${fallbackLabel}»`,
    });

    return { label: fallbackLabel, pct, via: dominant ? 'invoice' : 'default' };
  });

  return { resolved, notes, dominant };
}
