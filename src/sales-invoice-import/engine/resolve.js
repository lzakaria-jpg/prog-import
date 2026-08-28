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
  const dupNames = new Set();

  for (const c of customers) {
    const ref = toStr(c.ref);
    const name = toStr(c.name);
    if (ref) byRef.set(normalizeCode(ref), c);
    if (name) {
      const k = normalizeAr(name);
      if (byName.has(k)) dupNames.add(k);
      else byName.set(k, c);
    }
  }
  return { byRef, byName, dupNames, all: customers };
}

/**
 * يطابق اسم عميل المصدر بسجل عميل في قيود.
 * @returns {{status:'matched'|'ambiguous'|'unmatched'|'empty', ref?:string, customer?:object}}
 */
export function matchCustomer(sourceName, index, overrides = {}) {
  const name = toStr(sourceName);

  // قرار يدوي سابق له الأولوية المطلقة
  const ov = overrides[name] ?? overrides[''];
  if (name && overrides[name]) {
    return { status: 'matched', ref: toStr(overrides[name]), manual: true };
  }
  if (!name) {
    return overrides[''] !== undefined && toStr(overrides[''])
      ? { status: 'matched', ref: toStr(overrides['']), manual: true, viaDefault: true }
      : { status: 'empty' };
  }

  const k = normalizeAr(name);
  if (index.dupNames.has(k)) {
    return { status: 'ambiguous', reason: 'أكثر من عميل بنفس الاسم في قيود' };
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

  for (const p of products) {
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

  const stockKnown = products.filter(p => p.stockKnown).length;
  return { byCode, byName, dupNames, all: products, stockKnown, hasStockData: stockKnown > 0 };
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
    return { status: 'unmatched', reason: 'لا يوجد رمز، ولا يطابق الاسم أي منتج في قيود' };
  }

  return { status: 'empty' };
}

/**
 * فحص كفاية الكميات — يجمع المطلوب لكل منتج عبر كل الفواتير ويقارنه بالمتاح.
 *
 * سبب أهميته: قيود يرفض الفاتورة كلياً إذا لم تتوفر كمية كافية لمنتج مخزَّن،
 * وعندها يفشل الاستيراد بعد الرفع لا قبله.
 *
 * @param {Array<{code:string, quantity:number, invoiceRef:string, sourceRow:number}>} demands
 * @param {object} productIndex
 */
export function checkStock(demands, productIndex) {
  const agg = new Map();

  for (const d of demands) {
    const k = normalizeCode(d.code);
    if (!k) continue;
    if (!agg.has(k)) agg.set(k, { code: d.code, required: 0, invoices: new Set(), rows: [] });
    const a = agg.get(k);
    a.required = round(a.required + (d.quantity || 0), 6);
    a.invoices.add(d.invoiceRef);
    a.rows.push(d.sourceRow);
  }

  const results = [];
  for (const [k, a] of agg) {
    const p = productIndex.byCode.get(k);
    const available = p && p.stockKnown ? Number(p.stock) : null;

    let status = 'ok';
    if (!p) status = 'unknown_product';
    // غياب الرصيد ليس نقصاً: قوالب المنتجات لا تحمل الكمية المتاحة أصلاً،
    // فيُبلَّغ عن الحالة ولا يُمنع التصدير بسببها
    else if (p.tracked === false) status = 'not_tracked';
    else if (available === null) status = 'stock_unknown';
    else if (available < a.required) status = 'insufficient';

    results.push({
      code: a.code,
      name: p ? toStr(p.name) : '',
      required: a.required,
      available,
      shortage: status === 'insufficient' ? round(a.required - available, 6) : 0,
      invoiceCount: a.invoices.size,
      invoices: [...a.invoices],
      rows: a.rows,
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
