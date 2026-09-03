/**
 * validation.js — الاستنتاجات والتحقق قبل التصدير.
 * كل رسالة خطأ هنا تقابل رسالة حقيقية يعرضها قيود عند رفض الاستيراد،
 * والهدف كشفها قبل الرفع لأن قيود يرفض الملف بأكمله إن أخطأ صف واحد.
 */
import { norm, fmtDate } from './text.js';
import { findProdBySku, buildVendorIndex, buildProductIndex } from './matching.js';

/** تجميع البنود في فواتير حسب مرجع الفاتورة */
export function groupsOf(rows) {
  const m = new Map();
  rows.forEach((r) => {
    if (!m.has(r.ref)) m.set(r.ref, []);
    m.get(r.ref).push(r);
  });
  return m;
}

export const groupSubtotal = (rows) => rows.reduce((s, r) => s + (r.qty || 0) * (r.price || 0), 0);

/** الصفوف التالية لنفس المرجع ترث بيانات الرأس من أول صف يحملها */
export function inheritHeaders(rows) {
  const KEYS = ['vendorRef', 'vendorRefRaw', 'vendorNameRaw', 'issueDate', 'dueDate', 'supplyDate',
    'location', 'desc', 'terms', 'notes', 'docDiscVal', 'docDiscAcc', 'docDiscTax'];
  groupsOf(rows).forEach((g) => {
    KEYS.forEach((k) => {
      const src = g.find((r) => r[k] != null && r[k] !== '');
      if (src) g.forEach((r) => { if (r[k] == null || r[k] === '') r[k] = src[k]; });
    });
  });
}

/** سعر الوحدة يُشتق من إجمالي البند عند غيابه: الإجمالي ÷ الكمية */
export function autoPrice(row) {
  if (row.lineTotal == null) return;
  if (row.price != null && !row.priceDerived) return;
  if (!(row.qty > 0)) {
    if (row.priceDerived) { row.price = null; row.priceDerived = false; }
    return;
  }
  row.price = Math.round((row.lineTotal / row.qty) * 1e6) / 1e6;
  row.priceDerived = true;
}

/**
 * «شامل الضريبة؟»: بيانات الملف أولاً، ثم تعديل المستخدم،
 * وإلا تُستنتج بمقارنة إجمالي البند بـ (الكمية × السعر) مع تسامح للتقريب.
 */
export function inferTaxIncl(row, opts) {
  row.taxInclInferred = false;
  if (row.taxInclManual || row.taxInclFromFile) {
    if (row.taxIncl == null) row.taxIncl = false;
    return;
  }
  if (row.priceDerived) {
    row.taxIncl = opts.totalBasis === 'incl';
    row.taxInclInferred = true;
    return;
  }
  if (row.lineTotal != null && row.price != null && row.qty > 0) {
    const base = row.qty * row.price;
    const tol = Math.max(0.02, Math.abs(row.lineTotal) * 0.005);
    const rate = row.taxPct != null && row.taxPct > 0 ? row.taxPct / 100 : null;
    // [إصلاح جوهري] كان الاستنتاج يفترض دائمًا أن إجمالي البند بالملف *شامل*
    // الضريبة: (الإجمالي ≈ الكمية × السعر) ⇒ "شامل = نعم". لكن الأساس المختار
    // افتراضيًا هو "قبل الضريبة" (totalBasis='excl') وفيه نفس التساوي يعني
    // العكس تمامًا: السعر قبل الضريبة ⇒ "شامل = لا". النتيجة كانت انعكاس القيمة
    // على كل سطر بكل ملف بالأساس الافتراضي: 10×100 وإجمالي 1000 و15% تُصدَّر
    // "نعم" فتحسبها قيود 869.57 + 130.43 بدل 1000 + 150 — نقص 150 ريال بكل
    // 1000، وضريبة أقل بـ19.57. الآن نحترم الأساس المختار صراحةً، ونستخدم نسبة
    // الضريبة المطابقة أصلًا للسطر (row.taxPct المحسوبة قبل هذه الدالة) للحالة
    // المعاكسة، ونرجع لافتراض الأساس نفسه إن لم تتحقق أي مقارنة.
    if (opts.totalBasis === 'incl') {
      if (Math.abs(row.lineTotal - base) <= tol) row.taxIncl = true;
      else if (rate && Math.abs(row.lineTotal - base * (1 + rate)) <= tol) row.taxIncl = false;
      else row.taxIncl = true;
    } else {
      if (Math.abs(row.lineTotal - base) <= tol) row.taxIncl = false;
      else if (rate && Math.abs(row.lineTotal - base / (1 + rate)) <= tol) row.taxIncl = true;
      else row.taxIncl = false;
    }
    row.taxInclInferred = true;
    return;
  }
  if (row.taxIncl == null) row.taxIncl = false;
}

/** لا عمود ضريبة؟ تُستنتج النسبة من: الإجمالي ÷ (الكمية × السعر) − 1 */
export function inferTax(row, catalog, hasTaxColumn) {
  if (row.taxName || hasTaxColumn) return;
  if (row.lineTotal == null || row.priceDerived || !(row.qty > 0) || row.price == null) return;
  if (row.taxIncl) return;
  if (row.discPct != null || row.discVal != null) return;
  const base = row.qty * row.price;
  if (base <= 0) return;
  const rate = (row.lineTotal / base - 1) * 100;
  if (rate < -0.5 || rate > 60) return;
  const hit = catalog.taxes.filter((t) => Math.abs(t.percent - rate) < 0.6);
  if (!hit.length) return;
  row.taxName = hit[0].name;
  row.taxPct = hit[0].percent;
  row.taxCands = hit.length;
  row.taxInferred = Math.round(rate * 100) / 100;
}

/** هل يدعم القالب المرفوع قسم خصم المستند؟ */
export const tplHasDocDisc = (tpl) => !tpl || !tpl.columns || tpl.columns.some((c) => c.key === 'docDiscVal');

/**
 * فحص صف واحد؛ يملأ row.issues بقائمة {l:'e'|'w', m}.
 * idx (اختياري): {vendorIdx, productIdx} مسبقا البناء (buildVendorIndex/buildProductIndex)
 * — validateAll يبنيهما مرة واحدة فقط ويمرّرهما هنا لكل صف، بدل مسح كامل مصفوفتي
 * الموردين/المنتجات لكل صف من جديد (validateAll يُعاد تشغيله على كل الصفوف مع كل تعديل
 * خانة واحدة عبر useImportEngine.revalidate، فبلا هذا الفهرس التكلفة تتضاعف بسرعة).
 */
export function validateRow(row, catalog, tpl, idx) {
  const is = [];
  const E = (m) => is.push({ l: 'e', m });
  const W = (m) => is.push({ l: 'w', m });

  if (!row.ref) E('مرجع الفاتورة مفقود');

  // المورد
  const vendorExists = idx ? idx.vendorIdx.refMap.has(norm(row.vendorRef)) : catalog.vendors.some((v) => norm(v.ref) === norm(row.vendorRef));
  if (!row.vendorRef) {
    if (row.vendorBy === 'dup') E('اسم المورد مكرر — اختر المورد الصحيح');
    else E('المورد غير موجود — رقم مرجع المورد غير موجود');
  } else if (!vendorExists) {
    E('الرقم المرجعي للمورد غير مطابق لأي مورد');
  } else if (row.vendorBy === 'name' || row.vendorBy === 'phone') {
    W('طُوبق المورد بالاسم/الهاتف — تحقق من الرقم المرجعي');
  }

  // المنتج
  const prod = findProdBySku(catalog.products, row.prodSku, idx && idx.productIdx);
  if (!row.prodSku) {
    if (row.prodBy === 'dup') E('اسم المنتج مكرر — اختر المنتج الصحيح');
    else E('المنتج غير متاح للشراء أو غير موجود');
  } else if (!prod) {
    E('كود المنتج غير موجود في المنشأة');
  } else if (row.prodBy === 'name') {
    W('طُوبق المنتج بالاسم — تحقق من الكود');
  }
  if (prod) {
    if (prod.active === false) E('المنتج غير مفعَّل في المنشأة');
    if (prod.purchasable === false) E('المنتج غير قابل للشراء — خانة «يُشترى؟» = لا على بطاقة المنتج');
  }

  // التواريخ
  if (!row.issueDate) E('التاريخ يجب أن يكون بصيغة يوم/شهر/سنة');
  if (row.issueDate && row.dueDate && row.dueDate < row.issueDate) {
    E('تاريخ الاستحقاق يجب أن يكون بعد تاريخ الإصدار');
  }

  // الموقع
  if (!row.location) E('الموقع غير صالح');
  else if (!catalog.locations.some((l) => norm(l) === norm(row.location))) E('الموقع غير صالح — غير موجود في المنشأة');

  // الكمية والسعر
  if (row.qty == null) E('الكمية مفقودة');
  else if (row.qty <= 0) E('يجب أن تكون الكمية رقمًا موجبًا');

  if (row.price == null) {
    E(row.lineTotal != null && !(row.qty > 0) ? 'تعذّر اشتقاق سعر الوحدة — الكمية مفقودة أو صفر' : 'سعر الوحدة مفقود');
  } else if (row.price < 0) {
    E('سعر الوحدة سالب');
  }
  if (row.priceDerived) {
    W(`سعر الوحدة مشتق: ${row.lineTotal} ÷ ${row.qty} = ${row.price}`);
    if (row.discPct != null || row.discVal != null) W('البند عليه خصم — تأكد أن الإجمالي في الملف قبل الخصم لا بعده');
    if (row.price !== Math.round(row.price * 100) / 100) W('السعر المشتق كسري — سيؤدي لفروق تقريب في إجمالي الفاتورة');
  } else if (row.lineTotal != null && row.price != null && row.qty > 0 && row.discPct == null && row.discVal == null
    && !row.taxIncl && row.taxInferred == null && Math.abs(row.qty * row.price - row.lineTotal) > 0.01) {
    W(`الإجمالي في الملف (${row.lineTotal}) لا يساوي الكمية × السعر (${(row.qty * row.price).toFixed(2)})`);
  }

  // الخصم على البند
  // [إصلاح] كان الشرط != null فقط، والصفر قيمة موجودة — فملف فيه عمودا خصم
  // (نسبة وقيمة) مملوءان بأصفار (شائع جدًا بتصدير الأنظمة) كان يرفع خطأً حاجبًا
  // "لا يمكن إدخال خصم كنسبة وقيمة معًا" على كل سطر بالملف بلا وجود أي خصم فعلًا،
  // فتصبح كل الفواتير حمراء ويتعطّل زر "تحميل الصحيحة فقط" بلا سبب حقيقي.
  if (row.discPct > 0 && row.discVal > 0) {
    E('لا يمكن إدخال خصم كنسبة وقيمة معًا');
  }

  // الضريبة
  if (!row.taxName) E('الضريبة غير مطابقة لأي ضريبة معرَّفة في المنشأة');
  else if (tpl && !tpl.taxes.some((t) => t === row.taxName)) E('اسم الضريبة لا يطابق أي قيمة في قائمة القالب');
  else if (row.taxCands > 1) W(`${row.taxCands} ضرائب بنفس النسبة — تأكد أن المختارة هي الصحيحة`);
  if (row.taxInferred != null) W(`نسبة الضريبة مستنتجة من الأرقام (${row.taxInferred}%) — لا يوجد عمود ضريبة في الملف`);
  if (row.taxInclInferred && !row.priceDerived) {
    W(`«شامل الضريبة؟» مستنتج من الأرقام: ${row.taxIncl ? 'نعم' : 'لا'} — لا يوجد عمود له في الملف`);
  }

  // خصم المستند
  // [إصلاح] نفس علة الصفر أعلاه: عمود "خصم الفاتورة" بقيمة 0 لكل الفواتير كان
  // يطالب بحساب خصم وفئة ضريبية لخصم غير موجود، فيمنع الاستيراد كليًا.
  if (row.docDiscVal > 0 && tplHasDocDisc(tpl) && (!row.docDiscAcc || !row.docDiscTax)) {
    E('خصم المستند يتطلب تعبئة الحساب والفئة الضريبية (العمودان K وL)');
  }
  if (tpl) {
    if (row.docDiscAcc && tpl.discAccounts.length && !tpl.discAccounts.some((a) => norm(a) === norm(row.docDiscAcc))) {
      E('حساب خصم المستند غير موجود في قائمة القالب');
    }
    if (row.docDiscTax && tpl.discTaxes.length && !tpl.discTaxes.some((a) => norm(a) === norm(row.docDiscTax))) {
      E('الفئة الضريبية لخصم المستند غير موجودة في قائمة القالب');
    }
    if (row.unit && !tpl.columns.some((c) => c.key === 'unit')) E('القالب المرفوع لا يحتوي عمود وحدة التحويل');
  }

  // وحدة التحويل
  if (row.unit) {
    if (prod) {
      const cv = (prod.conversions || []).find((c) => norm(c.name) === norm(row.unit));
      if (!cv && norm(prod.unit) !== norm(row.unit)) E(`وحدة التحويل "${row.unit}" غير مضبوطة لهذا المنتج`);
      else if (cv) {
        W(`السعر يُطبَّق على الوحدة الأساسية بعد التحويل (1 ${cv.name} = ${cv.factor ?? '؟'}) — تأكد أن ${row.price} سعر الوحدة الأساسية`);
      }
    } else {
      W('تعذّر التحقق من وحدة التحويل قبل تحديد المنتج');
    }
    if (tpl && tpl.units.length && !tpl.units.some((u) => norm(u) === norm(row.unit))) {
      E(`وحدة التحويل "${row.unit}" غير معرَّفة في المنشأة إطلاقاً`);
    }
  }

  row.issues = is;
  return is;
}

/** فحوص على مستوى الفاتورة الواحدة */
export function validateGroups(rows, tpl) {
  groupsOf(rows).forEach((g) => {
    const uniq = (f) => [...new Set(g.map(f).filter((v) => v !== '' && v != null))];

    if (uniq((r) => norm(r.vendorRef)).length > 1) {
      g.forEach((r) => r.issues.push({ l: 'e', m: 'نفس مرجع الفاتورة مستخدم لأكثر من مورد — غيّر المرجع ليُفصلا' }));
    }
    if (uniq((r) => norm(r.location)).length > 1) {
      g.forEach((r) => r.issues.push({ l: 'e', m: 'الفاتورة الواحدة لا تقبل أكثر من موقع — وحّد الموقع لكل بنودها' }));
    }
    if (uniq((r) => fmtDate(r.issueDate)).length > 1) {
      g.forEach((r) => r.issues.push({ l: 'w', m: 'تواريخ إصدار مختلفة داخل فاتورة واحدة — سيُعتمد تاريخ الصف الأول' }));
    }

    const dv = uniq((r) => r.docDiscVal);
    if (dv.length > 1) {
      g.forEach((r) => r.issues.push({ l: 'e', m: 'قيم مختلفة لخصم المستند داخل فاتورة واحدة — وحّدها' }));
    } else if (dv.length === 1) {
      const sub = groupSubtotal(g);
      if (dv[0] >= sub && sub > 0) {
        g[0].issues.push({ l: 'e', m: `خصم المستند (${dv[0]}) يساوي إجمالي الفاتورة أو يتجاوزه (${sub.toFixed(2)})` });
      }
      if (!tplHasDocDisc(tpl)) {
        g[0].issues.push({ l: 'e', m: 'القالب المرفوع لا يحتوي أعمدة خصم المستند — وزّعه على البنود أو ألغِه من اللوحة أعلاه' });
      }
    }
  });
}

/** الدورة الكاملة: وراثة، اشتقاق، استنتاج، فحص */
export function validateAll(rows, catalog, tpl, opts) {
  inheritHeaders(rows);
  // فهرسة مرة واحدة لكل تشغيل (لا لكل صف) — تُستدعى مع كل تعديل خانة واحدة (useImportEngine
  // .revalidate يعيد فحص كل الصفوف)، فبلا هذا كانت التكلفة تتضاعف بعدد الصفوف × المنشأة.
  const idx = { vendorIdx: buildVendorIndex(catalog.vendors), productIdx: buildProductIndex(catalog.products) };
  rows.forEach((r) => {
    autoPrice(r);
    inferTaxIncl(r, opts);
    inferTax(r, catalog, opts.hasTaxColumn);
    validateRow(r, catalog, tpl, idx);
  });
  validateGroups(rows, tpl);
  return rows;
}

export const rowErr = (r) => r.issues.some((x) => x.l === 'e');
export const rowWarn = (r) => !rowErr(r) && r.issues.length > 0;

/** توزيع خصم المستند على البنود بالتناسب مع قيمة كل بند */
export function spreadDocDisc(rows, ref) {
  const g = rows.filter((r) => r.ref === ref);
  const total = groupSubtotal(g);
  const disc = g[0] ? g[0].docDiscVal : null;
  if (!(total > 0) || !(disc > 0)) return;
  let left = disc;
  g.forEach((r, i) => {
    const base = (r.qty || 0) * (r.price || 0);
    let share = i === g.length - 1 ? left : Math.round((disc * base / total) * 100) / 100;
    left = Math.round((left - share) * 100) / 100;
    if (r.discPct != null) {
      share += (base * r.discPct) / 100;
      r.discPct = null;
    }
    r.discVal = Math.round(((r.discVal || 0) + share) * 100) / 100;
  });
  g.forEach((r) => { r.docDiscVal = null; r.docDiscAcc = ''; r.docDiscTax = ''; });
}
