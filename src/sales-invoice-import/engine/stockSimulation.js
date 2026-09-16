/* محاكاة استهلاك المخزون التسلسلية — نسخ حرفي من قسم "التحقق التراكمي من كفاية المخزون"
   داخل runValidation (qoyod_validator_core.js أسطر 1840-1868)، مُستخرَج لدالة مستقلة
   قابلة للاختبار مباشرة. تبديل معماري: state.products/state.stock تصبحان وسيطين
   productsIndex/stockIndex، وaddIssue(...) تصبح issues.push({...}) — نفس الشرط
   والمنطق التسلسلي حرفيًا بلا أي تغيير، بما فيه اعتماد النتيجة على ترتيب rows نفسه
   (يُمنع فرز rows في أي مكان بالواجهة لأجل هذا). */

import { norm } from './text.js';

// [تصحيح 2026-09-16، بلاغ اختبار حي ثانٍ] الإصدار الأول من هذا التمييز اعتبر
// مفتاحًا غائبًا "صفرًا مؤكَّدًا" فقط لو كان المنتج/الموقع أُنشئ هذه الجلسة بالذات
// (newSkus/newLocations) — أي منتج/موقع آخر غائب (موجود فعليًا بمنشأة العميل،
// من جولة اختبار سابقة مثلًا، لكن بلا أي مخزون مسجَّل قط) بقي "غامضًا" فيُخفي
// خيار تغذية المخزون تمامًا حتى بعد أن يفتحه المستخدم صراحةً — تكرر هذا فعليًا
// (منتجات/مواقع أُنشئت بجولة سابقة، والفاتورة الحالية أُرسلت Draft صامتًا بلا
// أي تنبيه أو خيار). بما أن أي تغذية فعلية تبقى تتطلب دومًا تأكيدًا صريحًا
// ومقصودًا من المستخدم بلوحة المراجعة (لا شيء يُنشأ تلقائيًا بمجرد هذا الافتراض)،
// الافتراض آمن دومًا لمسار API: مفتاح غائب عن stockIndex.byKey يعني ببساطة
// "لا مخزون مسجَّل إطلاقًا لهذا المنتج بهذا الموقع" — صفر، لا لغز. newSkus/
// newLocations يبقيان فقط لمسار يدوي نظري (raw!==null) لا يحدث عمليًا (الميزة
// كلها مقصورة على API أصلًا)، حفاظًا على التوافق.
function resolveInitialAvail(key, sku, loc, stockIndex, newSkus, newLocations){
  if(stockIndex.byKey.has(key)) return stockIndex.byKey.get(key);
  if(stockIndex.raw === null) return 0;
  if((newSkus && newSkus.has(sku)) || (newLocations && newLocations.has(loc))) return 0;
  return null;
}

export function checkStockSequential(rows, {productsIndex, stockIndex, newSkus, newLocations} = {}){
  const issues = []; // {rowId, colKey:'P', sev:'warn'|'err', msg}
  if(!stockIndex) return issues;
  const running = new Map(); // sku||loc -> remaining
  rows.forEach((row, idx)=>{
    const sku = norm(row.N), loc = norm(row.G);
    if(!sku || !loc) return;
    const qty = parseFloat(row.P);
    if(isNaN(qty) || qty<=0) return;
    // منتج "غير مخزَّن" (خدمة أو صنف بلا تتبع مخزون): يُباع بلا حد للكمية ولا يظهر أصلًا في
    // تقرير مواقع المنتجات — فلا نفحص له مخزونًا ولا نُصدر تنبيه "لا تتوفر بيانات كمية".
    const prod = productsIndex ? productsIndex.bySku.get(sku) : null;
    if(prod && prod.stocked===false) return;
    const key = sku+'||'+loc;
    if(!running.has(key)){
      running.set(key, resolveInitialAvail(key, sku, loc, stockIndex, newSkus, newLocations));
    }
    const rem = running.get(key);
    if(rem===null){
      issues.push({rowId:row.id, colKey:'P', sev:'warn', msg:`السطر ${idx+1}: لا تتوفر بيانات كمية لهذا المنتج/الموقع في تقرير مواقع المنتجات المرفوع — تعذر التحقق من كفاية المخزون.`});
      return;
    }
    if(qty <= rem){
      running.set(key, rem-qty);
    } else {
      // [إضافة] لو المخزون جاء عبر جلب API (stockIndex.raw===null — نفس التمييز
      // المستخدم بكل مكان آخر باليوم لمعرفة أصل البيانات)، نقص الكمية يصير تنبيهًا
      // لا خطأً حاجبًا: كل فاتورة تُرسَل عبر API تحمل أصلًا draft_if_out_of_stock:true
      // (راجع qoyodSalesInvoicePush.js)، فقيود نفسها تُنشئها كمسودة بدل رفضها —
      // الرسالة تُصاغ لتعكس هذا الفرق الحقيقي بدل التحذير من رفض لن يحدث فعليًا.
      const isApiStock = stockIndex && stockIndex.raw === null;
      const sev = isApiStock ? 'warn' : 'err';
      const code = isApiStock ? 'stock_shortage_draft' : undefined;
      const msg = isApiStock
        ? `السطر ${idx+1}: ⚠️ نقص متوقَّع بكمية المنتج "${row.N}" في الموقع "${row.G}" — المتبقي المتوقع بعد الفواتير السابقة في هذا الملف: ${rem}، والمطلوب هنا: ${qty}. الفاتورة ستُرسَل كمسودة (Draft) بدل الرفض إن أرسلتها عبر API — راجع لوحة المراجعة بالخطوة 4.`
        : `السطر ${idx+1}: ⚠️ يُتوقَّع رفض هذه الفاتورة من قيود لعدم توفر كمية كافية من المنتج "${row.N}" في الموقع "${row.G}" — المتبقي المتوقع بعد الفواتير السابقة في هذا الملف: ${rem}، والمطلوب هنا: ${qty}. (الفواتير السابقة لنفس المنتج/الموقع في هذا الملف قد تنجح وتستهلك الكمية أولًا).`;
      issues.push({rowId:row.id, colKey:'P', sev, msg, ...(code?{code}:{})});
      running.set(key, 0);
    }
  });
  return issues;
}

// [إضافة] يرجّع احتياج التغذية الفعلي (كمية النقص المطلوب تعويضها عبر POST
// /inventory_adjustments) لكل زوج (كود منتج + موقع) عبر كامل الملف — نفس منطق
// المحاكاة التسلسلية أعلاه (checkStockSequential) حرفيًا (نفس ترتيب rows، نفس
// تجاهل المنتجات غير المخزَّنة)، لكن يُرجِع الأرقام الخام المُجمَّعة (لا رسائل
// نصية) بدل مُلاحظات addIssue — تُستخدَم فقط من المرحلة الثانية بلوحة مراجعة
// نقص المخزون بالخطوة 4 (StockShortageReviewPanel، خيار "تغذية المخزون تلقائيًا")
// بعد أن يختار المستخدم صراحةً هذا المسار. فقط لمسار المخزون المجلوب عبر API
// (stockIndex.raw===null) — بلا هذا الشرط لا يوجد رقم مخزون حقيقي (inventory_id)
// لنرسل له تعديل مخزون أصلًا، ولا معنى لتغذية آلية بلا API فعلي.
//
// [إصلاح خطأ حقيقي] منتج (أو موقع) أُنشئ للتو هذه الجلسة (عبر resolveMissingEntities)
// لا يملك أي مدخل بـstockIndex.byKey إطلاقًا (الفهرس بُني من جلب /products قبل
// إنشائه) — بلا newSkus/newLocations، كان "لا مدخل" يُعامَل كـ"لا تتوفر بيانات"
// (rem=null) فيُتجاهَل تمامًا هنا (needs تبقى فارغة له)، فيبقى معتمدًا على
// draft_if_out_of_stock الصامت بدل التغذية الفعلية — يناقض صراحةً هدف الميزة
// (ضمان فاتورة معتمدة لمنتج/موقع جديد، لا مسودة صامتة؛ بلاغ اختبار حي 2026-09-16:
// منتجات وموقع أُنشئوا جميعًا بنفس الجلسة، ومع ذلك أُنشئت الفواتير كمسودة —
// السبب: checkStockSequential [أدناه بملف validation.js] لم يكن يتلقى newSkus
// إطلاقًا، فـstockShortageGroups يخرج فارغًا واللوحة/التغذية لا تظهران أصلًا).
// الآن: مدخل غائب لكود منتج ضمن newSkus أو لموقع ضمن newLocations (كلاهما نعرف
// يقينًا أن رصيدهما صفر قبل أي إنشاء) يُعامَل كـ0 فيُحسَب نقصه كاملًا؛ أي منتج/
// موقع آخر غائب من الفهرس (موجود مسبقًا لكن بلا بيانات مخزون لسبب آخر — حالة
// غامضة حقًا) يبقى بسلوكه الأصلي بلا تغيير (يُتجاهَل هنا، يبقى تحذيرًا فقط
// بـcheckStockSequential) — تمييز مقصود، لا نفترض صفرًا لمنتج/موقع قائم فعليًا.
export function getStockTopUpNeeds(rows, {productsIndex, stockIndex, newSkus, newLocations} = {}){
  const needs = new Map(); // sku||loc -> {sku, loc, shortfall}
  if(!stockIndex || stockIndex.raw !== null) return [];
  const running = new Map();
  rows.forEach(row=>{
    const sku = norm(row.N), loc = norm(row.G);
    if(!sku || !loc) return;
    const qty = parseFloat(row.P);
    if(isNaN(qty) || qty<=0) return;
    const prod = productsIndex ? productsIndex.bySku.get(sku) : null;
    if(prod && prod.stocked===false) return;
    const key = sku+'||'+loc;
    if(!running.has(key)){
      running.set(key, resolveInitialAvail(key, sku, loc, stockIndex, newSkus, newLocations));
    }
    const rem = running.get(key);
    if(rem===null) return; // لا بيانات كمية أصلًا — لا نحسب نقصًا محدَّدًا (يبقى تحذير "لا تتوفر بيانات" فقط)
    if(qty <= rem){
      running.set(key, rem-qty);
    } else {
      const shortfall = qty - rem;
      running.set(key, 0);
      const existing = needs.get(key);
      if(existing) existing.shortfall += shortfall;
      else needs.set(key, {sku, loc, shortfall});
    }
  });
  return Array.from(needs.values());
}
