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
  };
  headerRow.forEach((h, i) => {
    const hh = norm(h).toLowerCase();
    // SKU / code
    if (map.sku === -1 && /كود|رمز|باركود|sku|barcode|code/i.test(hh)) map.sku = i;
    // Name (avoid "اسم الصنف", "اسم الوحدة" etc by checking stricter order)
    if (
      /^\s*(الأسم|الاسم|الاسم\/الصنف|اسم المنتج)\s*$/i.test(hh) ||
      /كسوي|كسو|اسم المنتج|product name/i.test(hh)
    ) map.name = i;
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
    if (map.cost === -1 && /^التكلفة$/i.test(hh) && !/حساب/i.test(hh)) map.cost = i;
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

// يبني حمولة POST /products الكاملة لمنتج واحد — منقول حرفياً من startUpload.
export function buildProductPayload(p, { unitId, categoryId, revId, expId, selectedTaxId, taxInclusive }) {
  const costNum = parseCostNumber(p.cost);
  const payload = { name_en: p.name, name_ar: p.name };
  if (p.sku) payload.sku = p.sku;
  if (unitId) payload.product_unit_type_id = unitId;
  if (categoryId) payload.category_id = categoryId;
  if (revId) payload.sales_account_id = revId;
  if (expId) payload.expense_account_id = expId;
  if (isFinite(costNum)) payload.buying_price = costNum;
  payload.track_quantity = p.is_inventory;
  payload.purchase_item = true;
  payload.sale_item = p.is_sellable;
  // Selling price: no separate column in the file -> default 1 for inventory sellable items
  if (p.is_inventory && p.is_sellable) payload.selling_price = 1;
  if (selectedTaxId) payload.tax_id = selectedTaxId;
  payload.tax_inclusive = taxInclusive;
  return payload;
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
