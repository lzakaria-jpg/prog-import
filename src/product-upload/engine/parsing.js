/*
 ============================================================================
  الطبقة النقية (PARSING / VALIDATION) — أداة رفع المنتجات إلى قيود
  المصدر: qoyod_uploader.html الأصلي (عبر _docs_generated/core.js من opencode)
  ============================================================================
  منقول حرفياً دون تغيير أي شرط أو خوارزمية أو رسالة. لا DOM ولا fetch هنا.
 ============================================================================
*/

// Treat a value as "true" if it's a positive indicator. Handles "نعم"/"مخزن"/"Yes"/"y"/"true"/"1".
export function isTrue(v) {
  if (!v) return false;
  return /^(نعم|مخزن|مخزني|نعم$|yes|y|true|١|1)/i.test(v.trim());
}

// Detect column indexes from the header row by matching names (Arabic/English).
// Returns an object of logical column name -> index.
export function detectColumns(headerRow) {
  const norm = (h) => String(h || "").trim().replace(/\s+/g, " ");
  const map = {
    sku: -1, name: -1, sellable: -1, inventory: -1, unit: -1,
    revenue: -1, expense: -1, category: -1, category_code: -1, cost: -1,
    // [إضافة 2026-09-07] أعمدة اختيارية جديدة — طلب المستخدم: اسم إنجليزي، وصف،
    // سعر بيع، باركود، كمية متوفرة (لرصيد افتتاحي)، وموقع اختياري لذلك الرصيد.
    // كلها تُترك -1 (غير مكتشفة) عند غياب العمود بملف العميل، فلا يتغيّر أي
    // سلوك حالي إطلاقاً لملف لا يحوي هذه الأعمدة — تماماً كما طلب المستخدم
    // ("في حال لم توجد يبقى الحال كما هو").
    name_en: -1, description: -1, sellingPrice: -1, barcode: -1, quantity: -1, location: -1,
  };
  headerRow.forEach((h, i) => {
    const hh = norm(h).toLowerCase();
    // SKU / code — بلا أي تغيير عن الأصل (يبقى "باركود" ضمن مطابقة الرمز كما
    // كان دائماً، حتى لا ينكسر أي ملف عميل حالي يعتمد على هذا الاكتشاف).
    if (map.sku === -1 && /كود|رمز|باركود|sku|barcode|code/i.test(hh)) map.sku = i;
    // Name (avoid "اسم الصنف", "اسم الوحدة" etc by checking stricter order)
    // [إضافة 2026-09-07] استثناء صريح لعمود اسم إنجليزي (يُكتشف أدناه كحقل
    // مستقل name_en) كي لا يُخطَف عمود "اسم المنتج بالإنجليزي" كاسم عربي أساسي.
    // [إصلاح 2026-09-07] خلل حقيقي مكتشَف بملف عميل حقيقي (4822 صف): عمود
    // "اسم العربي" (بلا "ال" على "اسم"، شائع جداً ويقابل "اسم انجليزي" بنفس
    // الملف) لم يكن يُطابَق إطلاقاً — لا بالمطابقة الحرفية الصارمة، ولا
    // بالنمط الفضفاض — فيبقى name=-1 لكل الملف، وبما أن الاسم إلزامي لكل صف
    // (buildProductsFromRows تتخطى أي صف بلا اسم)، كانت النتيجة صفر منتجات
    // بصمت (بلا أي رسالة خطأ، لأن صف الترويسة نفسه يُكتشف بنجاح). أُضيف نمط
    // "اسم...عربي" (يطابق "اسم العربي"/"الاسم العربي"/"اسم عربي") بنفس أسلوب
    // نمط name_en أدناه.
    if (
      (
        /^\s*(الأسم|الاسم|الاسم\/الصنف|اسم المنتج)\s*$/i.test(hh) ||
        /كسوي|كسو|اسم المنتج|product name|اسم.*عربي|arabic name/i.test(hh)
      ) && !/[اأإآ]نجليزي|[اأإآ]نكليزي|english/i.test(hh)
    ) map.name = i;
    // [إضافة 2026-09-07] الاسم بالإنجليزية — عمود اختياري جديد، مستقل عن name.
    // [اأإآ] يغطي كل أشكال الألف (ا/أ/إ/آ) كي تُطابَق "بالإنجليزي"/"الانجليزي" معاً.
    if (map.name_en === -1 && /(اسم.*([اأإآ]نجليزي|[اأإآ]نكليزي))|(([اأإآ]نجليزي|[اأإآ]نكليزي).*اسم)|english name|name.?\(?en\)?\b/i.test(hh)) map.name_en = i;
    // Sellable status (حالة البيع)
    if (map.sellable === -1 && /حالة البيع|sell/i.test(hh)) map.sellable = i;
    // Inventory (مخزن / حالة التخزين)
    if (map.inventory === -1 && /مخزن|حالة التخزين|تخزين|inventory|stock/i.test(hh)) map.inventory = i;
    // Unit
    if (map.unit === -1 && /اسم الوحدة|الوحدة|unit/i.test(hh)) map.unit = i;
    // Revenue account
    // [إصلاح 2026-09-04] عملاء قيود يسمّون هذا العمود بعدة صيغ حقيقية شائعة:
    // "حساب الإيراد"/"الإيرادات"/"حساب المبيعات"/"حساب البيع" — كان النمط
    // الأصلي يقتصر على "حساب الإيراد"/"ايراد" فقط فيفوت الاكتشاف كاملاً على
    // أي ملف يستخدم تسمية "مبيعات"/"بيع". "حساب البيع" (لا "البيع" منفردة) كي
    // لا يتصادم مع نمط عمود "حالة البيع" (sellable) أسفله.
    if (map.revenue === -1 && /حساب الإيراد|الإيراد|ايراد|المبيعات|حساب البيع|revenue|sales/i.test(hh)) map.revenue = i;
    // Expense account (only when 'حساب المصروف' or explicit expense/cost account column)
    if (map.expense === -1 && /حساب المصروف|حساب التكلفة|مصروف|expense/i.test(hh)) map.expense = i;
    // Category
    // [إصلاح 2026-09-04] أضيف "الصنف" منفردة (بلا "اسم") لأنها تسمية شائعة أخرى
    // بملفات العملاء — لكن باستثناء صريح لعمود "رقم الصنف" (وهو category_code
    // عمود مختلف تماماً، انظر الشرط التالي) كي لا يُخلَط العمودان معاً.
    if (
      map.category === -1 &&
      /اسم الصنف|الصنف|فئة|تصنيف|cat(egory)?/i.test(hh) &&
      !/حساب|account/i.test(hh) &&
      !/رقم الصنف/i.test(hh)
    ) map.category = i;
    // Category code (رقم الصنف) - must check after category
    if (map.category_code === -1 && /رقم الصنف/i.test(hh)) map.category_code = i;
    // Cost price (التكلفة as a price column - exact match "التكلفة")
    // [إضافة 2026-09-07] وسّعت المطابقة لتشمل "سعر الشراء" (تسمية طلبها
    // المستخدم صراحةً) وما يرادفها بالإنجليزية — إضافة بديلة فقط، المطابقة
    // الأصلية الحرفية لـ"التكلفة" لم تُمس.
    if (
      map.cost === -1 &&
      (/^التكلفة$/i.test(hh) || /سعر الشراء|buying price|purchase price|cost price/i.test(hh)) &&
      !/حساب/i.test(hh)
    ) map.cost = i;
    // [إضافة 2026-09-07] سعر البيع — عمود اختياري جديد. `map.revenue !== i`
    // يمنع خطف نفس العمود لو كان عمود "Sales"/"سعر البيع" قد طابق مسبقاً نمط
    // حساب الإيراد الفضفاض أعلاه (نادر لكن ممكن نظرياً).
    if (map.sellingPrice === -1 && /سعر البيع|سعر المبيع|selling price|sale price|sales price/i.test(hh) && map.revenue !== i) map.sellingPrice = i;
    // [إضافة 2026-09-07] باركود المنتج — عمود مستقل عن sku عمداً (قد يتطابقا
    // على نفس العمود إن وُجد عمود واحد فقط لكليهما، وهذا مقصود وغير ضار).
    if (map.barcode === -1 && /باركود|barcode/i.test(hh)) map.barcode = i;
    // [إضافة 2026-09-07] الكمية المتوفرة — تُستخدم لاحقاً لبناء ملف الأرصدة
    // الافتتاحية فقط (ليست جزءاً من حمولة إنشاء المنتج نفسها).
    if (map.quantity === -1 && /الكمية المتوفرة|كمية متوفرة|^\s*(الكمية|كمية)\s*$|quantity|qty/i.test(hh)) map.quantity = i;
    // [إضافة 2026-09-07] الموقع/المخزن — اختياري، لتوزيع صفوف الرصيد الافتتاحي
    // على مواقع مختلفة بدل موقع افتراضي واحد.
    if (map.location === -1 && /الموقع|موقع|المخزن|location|warehouse/i.test(hh)) map.location = i;
    // [إضافة 2026-09-07] وصف المنتج — عمود اختياري جديد.
    if (map.description === -1 && /وصف المنتج|وصف الصنف|^\s*(الوصف|وصف)\s*$|description/i.test(hh)) map.description = i;
  });
  return map;
}

/*
 يحوّل صفوف ورقة العمل (كما تُخرج بواسطة XLSX.utils.sheet_to_json بوسائط
 { header: 1, defval: null }) إلى مصفوفة منتجات.

 ملاحظة الفصل عن الأصل: في الأصل عند عدم العثور على صف ترويسة يُستدعى
 alert(...) مباشرة من داخل نفس الدالة. هنا نُعيد { headerFound:false, data:[] }
 وتتولى طبقة الواجهة إظهار الرسالة (نفس النص الحرفي). كل الشروط والحسابات
 الداخلية الأخرى منقولة حرفياً.
*/
export function buildProductsFromRows(rows) {
  // Find the header row (the first row that contains recognizable header keywords)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = (rows[i] || []).map((c) => String(c || "")).join(" ");
    if (/كود|اسم|صنف|وحدة|رمز|التكلفة|sku|product/i.test(joined)) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return { headerFound: false, data: [] };

  const cols = detectColumns(rows[headerIdx]);

  // Fallback positional mapping if header-based detection failed for key columns
  // This supports the legacy 7-column layout (original customer format):
  // كود المنتج | الاسم | حالة البيع | حالة التخزين | الوحدة | حساب الإيراد | حساب المصروف
  if (cols.name === -1 && cols.sku === -1 && cols.category === -1) {
    cols.sku = 0; cols.name = 1; cols.sellable = 2; cols.inventory = 3;
    cols.unit = 4; cols.revenue = 5; cols.expense = 6;
  }

  const data = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => c === null || c === undefined || c === "")) continue;

    const get = (idx) => (idx >= 0 && idx < r.length ? r[idx] : null);
    const name = get(cols.name) !== null ? String(get(cols.name)).trim() : "";
    if (!name) continue;

    const p = {
      sku: get(cols.sku) !== null ? String(get(cols.sku)).trim() : "",
      name,
      is_sellable: cols.sellable >= 0 ? String(get(cols.sellable)).trim() === "نعم" : true,
      is_inventory: cols.inventory >= 0 ? isTrue(String(get(cols.inventory)).trim()) : false,
      unit: get(cols.unit) !== null ? String(get(cols.unit)).trim() : "",
      revenue_account_name: get(cols.revenue) !== null ? String(get(cols.revenue)).trim() : "",
      expense_account_name: get(cols.expense) !== null ? String(get(cols.expense)).trim() : "",
      category:
        get(cols.category) !== null && !String(get(cols.category)).trim().toLowerCase().includes("none")
          ? String(get(cols.category)).trim()
          : "",
      cost: get(cols.cost) !== null ? String(get(cols.cost)).trim() : "",
      // [إضافة 2026-09-07] حقول اختيارية جديدة — تبقى سلاسل فارغة (لا تُرسَل أي
      // قيمة API إضافية) عند غياب العمود المطابق بملف العميل.
      name_en: get(cols.name_en) !== null ? String(get(cols.name_en)).trim() : "",
      description: get(cols.description) !== null ? String(get(cols.description)).trim() : "",
      selling_price_raw: get(cols.sellingPrice) !== null ? String(get(cols.sellingPrice)).trim() : "",
      barcode: get(cols.barcode) !== null ? String(get(cols.barcode)).trim() : "",
      quantity_raw: get(cols.quantity) !== null ? String(get(cols.quantity)).trim() : "",
      location: get(cols.location) !== null ? String(get(cols.location)).trim() : "",
    };

    data.push(p);
  }

  return { headerFound: true, data };
}

// Parse cost price (buying price) from the "التكلفة" column. Qoyod requires
// numeric prices; default to 1 when empty, 0, or invalid — منقول حرفياً من
// startUpload (سطر 716-723 بالأصل).
export function parseCostNumber(rawCost) {
  let costNum = 1;
  const trimmed = rawCost ? String(rawCost).trim() : "";
  if (trimmed !== "" && trimmed !== "0") {
    const cleaned = trimmed.replace(/[^\d.,-]/g, "").replace(/,/g, ".");
    const num = parseFloat(cleaned);
    if (!isNaN(num) && isFinite(num) && num > 0) costNum = num;
  }
  return costNum;
}

// [إضافة 2026-09-07] سعر البيع من عمود اختياري بالملف — نفس منطق تنظيف الأرقام
// المتبع بـparseCostNumber (فاصلة عشرية، إزالة رموز)، لكن بلا افتراض إلى 1: قيمة
// فارغة/صفر/غير صالحة تُعيد null صراحةً كي يستمر buildProductPayload بسلوكه
// الافتراضي الأصلي (1 للمنتج المخزون القابل للبيع فقط) عند غياب عمود حقيقي.
export function parseSellingPriceNumber(rawPrice) {
  const trimmed = rawPrice ? String(rawPrice).trim() : "";
  if (trimmed === "" || trimmed === "0") return null;
  const cleaned = trimmed.replace(/[^\d.,-]/g, "").replace(/,/g, ".");
  const num = parseFloat(cleaned);
  if (!isNaN(num) && isFinite(num) && num > 0) return num;
  return null;
}

// [إضافة 2026-09-07] الكمية المتوفرة من عمود اختياري بالملف — تُستخدم فقط لبناء
// صفوف ملف الأرصدة الافتتاحية (buildOpeningBalanceRows)، وليست جزءاً من حمولة
// إنشاء المنتج نفسها. صفر/فارغ/غير صالح => null (لا رصيد افتتاحي لهذا المنتج).
export function parseQuantityNumber(rawQty) {
  const trimmed = rawQty ? String(rawQty).trim() : "";
  if (trimmed === "" || trimmed === "0") return null;
  const cleaned = trimmed.replace(/[^\d.,-]/g, "").replace(/,/g, ".");
  const num = parseFloat(cleaned);
  if (!isNaN(num) && isFinite(num) && num > 0) return num;
  return null;
}

// يبني حمولة POST /products الكاملة لمنتج واحد — منقول حرفياً من startUpload،
// مع إضافات 2026-09-07 الاختيارية (اسم إنجليزي حقيقي، وصف، باركود، سعر بيع
// حقيقي) — كلها لا تُضاف للحمولة إطلاقاً إن غاب العمود المطابق بملف العميل، وكل
// حقل حالي (name_en الافتراضي، selling_price=1 الافتراضي...) يبقى محفوظاً حرفياً
// كما كان لأي منتج ليس فيه العمود الجديد.
//
// [تأكيد 2026-09-07] أسماء كل الحقول هنا — بما فيها description وbarcode —
// مؤكَّدة فعلياً باختبار حقيقي مباشر على POST /products وPUT /products/{id}
// (المستخدم أرسل الطلب والرد الفعليين: الحقلان رجعا بالضبط بنفس القيمة
// والاسم بالـresponse، مرتين). لا حقل اجتهادي متبقٍّ بهذه الحمولة.
export function buildProductPayload(p, { unitId, categoryId, revId, expId, selectedTaxId, taxInclusive }) {
  const costNum = parseCostNumber(p.cost);
  const nameEn = p.name_en && p.name_en.trim() ? p.name_en.trim() : p.name;
  const payload = { name_en: nameEn, name_ar: p.name };
  if (p.sku) payload.sku = p.sku;
  if (p.barcode) payload.barcode = p.barcode;
  if (p.description) payload.description = p.description;
  if (unitId) payload.product_unit_type_id = unitId;
  if (categoryId) payload.category_id = categoryId;
  if (revId) payload.sales_account_id = revId;
  if (expId) payload.expense_account_id = expId;
  if (isFinite(costNum)) payload.buying_price = costNum;
  payload.track_quantity = p.is_inventory;
  payload.purchase_item = true;
  payload.sale_item = p.is_sellable;
  // Selling price: عمود حقيقي بالملف (لمنتج قابل للبيع) يتفوّق على الافتراضي؛
  // بلا عمود (أو قيمة غير صالحة) => نفس السلوك الأصلي حرفياً: 1 للمخزون القابل
  // للبيع فقط.
  const sellingPriceNum = parseSellingPriceNumber(p.selling_price_raw);
  if (sellingPriceNum !== null && p.is_sellable) {
    payload.selling_price = sellingPriceNum;
  } else if (p.is_inventory && p.is_sellable) {
    payload.selling_price = 1;
  }
  if (selectedTaxId) payload.tax_id = selectedTaxId;
  payload.tax_inclusive = taxInclusive;
  return payload;
}

// [إضافة 2026-09-07] يبني صفوف "الأرصدة الافتتاحية" (الكمية المتوفرة) لكل منتج
// له كمية صالحة (>0) بملف العميل — طبقة نقية بحتة، بلا أي استدعاء شبكة. تُستخدم
// لاحقاً لتوليد ملف Excel مرجعي يرفعه المستخدم يدوياً من شاشة قيود الرسمية
// (المحاسبة > قيود يدوية > أرصدة افتتاحية > المنتجات والتكاليف) — قرار صريح من
// المستخدم بعد أن وثّق مركز مساعدة قيود هذه العملية كقيد خاص غير موثّق كـAPI،
// ولا يمكن تعديله بعد الحفظ (يُحذف ويُعاد فقط لو صار خطأ) — فكتابته مباشرة عبر
// API بحقول غير مؤكدة كانت ستُخاطر بقيود محاسبية خاطئة لا يمكن تصحيحها.
export function buildOpeningBalanceRows(products, { defaultLocation } = {}) {
  const rows = [];
  (products || []).forEach((p) => {
    const qty = parseQuantityNumber(p.quantity_raw);
    if (qty === null) return;
    const location = p.location && p.location.trim() ? p.location.trim() : (defaultLocation || "").trim();
    const cost = parseCostNumber(p.cost);
    rows.push({ sku: p.sku || "", name: p.name, location, quantity: qty, cost });
  });
  return rows;
}

// [إصلاح 2026-09-04] يطابق قيمة عمود حساب الإيراد/المصروف بملف العميل بحساب
// فعلي من منشأة قيود. الكود الأصلي (وpayload الأول المنقول حرفياً هنا) كان
// يطابق بالاسم فقط (accountsByName)، فإن كانت قيمة العمود رقم حساب صريح (مثال:
// "4102") لا اسمًا — وهو ما يكتبه أغلب العملاء فعلياً — كانت المطابقة تفشل
// دائماً وتُستبدل الحسابات كلها بصمت بالحساب الافتراضي (4101/5101)، حتى لو
// وُجد عمود حساب مخصص لكل منتج. الآن تُجرَّب المطابقة بالرقم أولاً
// (accountsByCode)، ثم بالاسم (accountsByName) كبديل لمن يكتب اسم الحساب فعلاً.
export function resolveAccountId(rawValue, accountsByCode, accountsByName) {
  const trimmed = rawValue ? String(rawValue).trim() : "";
  if (!trimmed) return { id: null, matched: false };
  const byCode = accountsByCode[trimmed];
  if (byCode) return { id: byCode.id, matched: true };
  const byName = accountsByName[trimmed.toLowerCase()];
  if (byName) return { id: byName.id, matched: true };
  return { id: null, matched: false };
}

// [إضافة 2026-09-07] يقرر مصير صف: تحديث منتج موجود (PUT)، تخطٍّ (السلوك
// الأصلي)، أو إنشاء عادي (POST) — قرار صريح من المستخدم بعد أن زوّدنا بمثال
// حقيقي لـPUT /products/{id}:
//  - التحديث يُطابَق **بالرمز (sku) فقط** (لا بالاسم إطلاقاً) — طلب صريح من
//    المستخدم تفادياً لتحديث منتج خطأ بسبب تشابه أسماء. صف بلا رمز لا يمكن أن
//    يُحدَّث أبداً مهما كان اسمه مطابقاً.
//  - لو ما تحدَّد كـ"تحديث"، يستمر بنفس منطق التخطي الأصلي (بالرمز أو الاسم)
//    حرفياً، بلا أي تغيير.
export function resolveExistingProductAction(p, { skuToId, existingSkus, existingNames, updateExisting, skipDups }) {
  if (updateExisting && p.sku && skuToId && Object.prototype.hasOwnProperty.call(skuToId, p.sku)) {
    return { action: "update", id: skuToId[p.sku] };
  }
  if (skipDups) {
    if (p.sku && existingSkus && existingSkus.has(p.sku)) return { action: "skip", reason: "sku" };
    const nameLower = (p.name || "").trim().toLowerCase();
    if (existingNames && existingNames.has(nameLower)) return { action: "skip", reason: "name" };
  }
  return { action: "create" };
}

// يختار الضريبة ذات نسبة 15%، وإلا أول ضريبة — منقول حرفياً من startUpload.
export function chooseTax(taxes) {
  const chosen = taxes.find((t) => {
    const r = parseFloat(
      t.rate !== undefined ? t.rate : t.percentage !== undefined ? t.percentage : t.percent !== undefined ? t.percent : t.value
    );
    return r === 15;
  }) || taxes[0] || null;
  return chosen;
}
