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

// [إضافة 2026-09-28، طلب صريح من المستخدم] أنواع المنتج الخمسة المدعومة فعلياً
// بمواصفة Qoyod API الرسمية (ProductInput.type enum) — مصدر الحقيقة الوحيد
// (لا اجتهاد): مادة أولية RawMaterial، منتج Product (الافتراضي)، خدمة Service،
// مصروف Expense، ومنتج مجمّع (وصفة/BOM) Recipe — الوحيد الذي يقبل مكوّنات
// (ingredients: [{product_id, quantity, product_unit_id}]).
export const PRODUCT_TYPES = ["Product", "Service", "Expense", "RawMaterial", "Recipe"];

export const PRODUCT_TYPE_LABELS = {
  Product: { ar: "منتج", en: "Product" },
  Service: { ar: "خدمة", en: "Service" },
  Expense: { ar: "مصروف", en: "Expense" },
  RawMaterial: { ar: "مادة أولية", en: "Raw material" },
  Recipe: { ar: "منتج مجمّع", en: "Bundle" },
};

// نص عرض لخطأ بنيوي من planBundles (t = دالة اللغة المشتركة)
export function describeBundleIssue(x, t) {
  switch (x.kind) {
    case "parent_not_found":
      return t({ ar: `سطر ${x.rowNumber} بشيت المكوّنات: المنتج المجمّع "${x.parent}" غير موجود بشيت المنتجات`, en: `Components sheet row ${x.rowNumber}: bundle "${x.parent}" is not in the products sheet` });
    case "parent_wrong_type":
      return t({ ar: `"${x.parent}" له مكوّنات لكن نوعه بالملف "${t(PRODUCT_TYPE_LABELS[x.type] || PRODUCT_TYPE_LABELS.Product)}" لا "منتج مجمّع"`, en: `"${x.parent}" has components but its type in the file is "${t(PRODUCT_TYPE_LABELS[x.type] || PRODUCT_TYPE_LABELS.Product)}", not "Bundle"` });
    case "recipe_without_components":
      return t({ ar: `"${x.parent}" نوعه منتج مجمّع لكن ما له أي مكوّن بشيت المكوّنات`, en: `"${x.parent}" is a bundle but has no components in the components sheet` });
    case "self_reference":
      return t({ ar: `سطر ${x.rowNumber}: "${x.parent}" مكوّن لنفسه`, en: `Row ${x.rowNumber}: "${x.parent}" is a component of itself` });
    case "cycle":
      return t({ ar: `حلقة مكوّنات: ${x.path.join(" ← ")}`, en: `Component cycle: ${x.path.join(" → ")}` });
    default:
      return x.kind;
  }
}

// ترتيب الفحص أدناه مقصود: "مجمّع/تركيبة" يجب أن تُطابَق قبل النمط العام لـ
// Product (المطابقة الفضفاضة له تشمل كلمة "منتج" وحدها، و"منتج مجمّع" تحويها
// حرفياً) — وإلا خُطف كل صف "منتج مجمّع" كـProduct عادي بصمت.
const PRODUCT_TYPE_PATTERNS = [
  { type: "RawMaterial", re: /مادة\s*(أولية|اولية|خام)|raw\s*-?\s*material/i },
  { type: "Recipe", re: /مجمّع|مجمع|تركيب[ةه]|وصف[ةه]|طقم|bundle|recipe|kit|assembl/i },
  { type: "Service", re: /خدم[ةه]|service/i },
  { type: "Expense", re: /مصروف|مصاريف|expense/i },
  { type: "Product", re: /منتج|سلع[ةه]|بضاع[ةه]|product|goods/i },
];

// يطابق نص عمود "نوع المنتج" (إن وُجد) بأحد الأنواع الخمسة. عمود فارغ/غائب
// => Product (نفس الافتراضي الرسمي لقيود عند حذف الحقل كلياً)، explicit:false.
// نص غير فارغ لا يطابق أي نمط => Product أيضاً لكن recognized:false، ليُنبَّه
// المستخدم بالمعاينة بدل تجاهل القيمة بصمت.
export function normalizeProductType(raw) {
  const s = String(raw || "").trim();
  if (!s) return { type: "Product", recognized: true, explicit: false };
  for (const { type, re } of PRODUCT_TYPE_PATTERNS) {
    if (re.test(s)) return { type, recognized: true, explicit: true };
  }
  return { type: "Product", recognized: false, explicit: true };
}

// مفتاح مطابقة الأسماء/الرموز: قصّ المسافات وتوحيد المسافات الداخلية وحروف
// صغيرة فقط — لا توحيد إملائي (موزريلا ≠ جبنة موزريلا عمداً): أي اختلاف
// بالكتابة يُعرَض للمستخدم ليربطه يدوياً، قراره الصريح.
export function matchKey(v) {
  return String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

// ============================================================================
// [إضافة 2026-09-28] شيت المكوّنات (BOM) للمنتجات المجمّعة (Recipe)
// ============================================================================
// شيت مستقل بثلاثة أعمدة: المنتج المجمّع | المكوّن | الكمية — سطر لكل مكوّن.
// المنتج المجمّع والمكوّن يُشار لهما بالاسم أو الرمز كما وردا بشيت المنتجات
// (أو منتج موجود مسبقاً بمنشأة العميل للمكوّن).
export function detectBomColumns(headerRow) {
  const cols = { parent: -1, component: -1, qty: -1 };
  (headerRow || []).forEach((h, i) => {
    const hh = String(h ?? "").trim().replace(/\s+/g, " ").toLowerCase();
    if (!hh) return;
    if (cols.parent === -1 && /المنتج\s*المجم|الصنف\s*المجم|مجمّع|مجمع|وصفة|bundle|recipe|parent/i.test(hh)) { cols.parent = i; return; }
    if (cols.component === -1 && /مكوّن|مكون|component|ingredient|material/i.test(hh)) { cols.component = i; return; }
    if (cols.qty === -1 && /كمية|الكمية|qty|quantity/i.test(hh)) cols.qty = i;
  });
  return cols;
}

export function findBomHeader(rows) {
  for (let i = 0; i < Math.min((rows || []).length, 10); i++) {
    const cols = detectBomColumns(rows[i] || []);
    if (cols.parent >= 0 && cols.component >= 0 && cols.qty >= 0) return { headerIdx: i, cols };
  }
  return null;
}

// كل سطر صالح => { parent, component, qty, rowNumber }. سطر فيه مرجع بلا كمية
// صالحة (>0) لا يُفترض له كمية أبداً: يُرجَع بقائمة errors ليظهر للمستخدم.
export function parseBomRows(rows) {
  const found = findBomHeader(rows);
  if (!found) return { found: false, lines: [], errors: [] };
  const { headerIdx, cols } = found;
  const lines = [];
  const errors = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const parent = String(r[cols.parent] ?? "").trim();
    const component = String(r[cols.component] ?? "").trim();
    const qtyRaw = r[cols.qty];
    if (!parent && !component && (qtyRaw === null || qtyRaw === undefined || String(qtyRaw).trim() === "")) continue;
    const rowNumber = i + 1;
    if (!parent || !component) { errors.push({ rowNumber, reason: "missing_ref", parent, component }); continue; }
    const qty = typeof qtyRaw === "number" ? qtyRaw : parseFloat(String(qtyRaw ?? "").replace(/[^\d.-]/g, ""));
    if (!isFinite(qty) || qty <= 0) { errors.push({ rowNumber, reason: "bad_qty", parent, component }); continue; }
    lines.push({ parent, component, qty, rowNumber });
  }
  return { found: true, lines, errors };
}

/**
 * يخطّط رفع المنتجات المجمّعة — طبقة نقية بلا شبكة.
 *
 * products: صفوف شيت المنتجات (excelData). existingProducts: منتجات منشأة
 * العميل الحالية (GET /products). links: ربط يدوي من المستخدم لكل مكوّن غير
 * مطابق، مفتاحه matchKey(اسم المكوّن) => {kind:"file",index} |
 * {kind:"existing",id} | {kind:"create"}.
 *
 * ترتيب حلّ المكوّن: ربط يدوي أولاً، ثم منتج بنفس الملف (رمز ثم اسم)، ثم منتج
 * موجود بقيود (رمز ثم اسم عربي/إنجليزي). لا مطابقة تقريبية إطلاقاً.
 *
 * يُرجع:
 *  - recipes: Map(fileIndex => [{ ref, qty, target }])
 *  - unresolved: [{ key, ref, usedBy: [أسماء المنتجات المجمّعة] }]
 *  - issues: [{ kind, ... }] أخطاء بنيوية تمنع الرفع
 *  - order: ترتيب رفع فهارس الملف (غير المجمّعة أولاً، ثم المجمّعة بعد كل
 *    مكوّناتها — يدعم منتج مجمّع داخل منتج مجمّع)
 *  - createRefs: مكوّنات اختار المستخدم إنشاءها كمادة أولية جديدة
 *  - effectiveTypes: نوع كل صف فعلياً (صف له مكوّنات ونوعه غير محدد => Recipe)
 */
export function planBundles({ products, bomLines, existingProducts, links }) {
  const fileBySku = new Map();
  const fileByName = new Map();
  (products || []).forEach((p, i) => {
    const s = matchKey(p.sku);
    const n = matchKey(p.name);
    const ne = matchKey(p.name_en);
    if (s && !fileBySku.has(s)) fileBySku.set(s, i);
    if (n && !fileByName.has(n)) fileByName.set(n, i);
    if (ne && !fileByName.has(ne)) fileByName.set(ne, i);
  });
  const exBySku = new Map();
  const exByName = new Map();
  (existingProducts || []).forEach((p) => {
    const s = matchKey(p.sku);
    if (s && !exBySku.has(s)) exBySku.set(s, p);
    [p.name_ar, p.name_en].forEach((nm) => { const k = matchKey(nm); if (k && !exByName.has(k)) exByName.set(k, p); });
  });

  const findFile = (ref) => {
    const k = matchKey(ref);
    if (fileBySku.has(k)) return fileBySku.get(k);
    if (fileByName.has(k)) return fileByName.get(k);
    return -1;
  };

  const issues = [];
  const recipes = new Map();
  const unresolvedMap = new Map();
  const createRefs = new Map();
  const effectiveTypes = (products || []).map((p) => p.product_type || "Product");

  (bomLines || []).forEach((line) => {
    const pi = findFile(line.parent);
    if (pi === -1) { issues.push({ kind: "parent_not_found", parent: line.parent, rowNumber: line.rowNumber }); return; }
    const pp = products[pi];
    if (pp.product_type_explicit && pp.product_type !== "Recipe") {
      if (!issues.some((x) => x.kind === "parent_wrong_type" && x.index === pi)) {
        issues.push({ kind: "parent_wrong_type", index: pi, parent: pp.name, type: pp.product_type });
      }
      return;
    }
    effectiveTypes[pi] = "Recipe";

    const key = matchKey(line.component);
    const link = links && links[key];
    let target = null;
    if (link && link.kind === "file" && products[link.index]) target = { kind: "file", index: link.index };
    else if (link && link.kind === "existing" && link.id) target = { kind: "existing", id: link.id, unitTypeId: link.unitTypeId || null };
    else if (link && link.kind === "create") target = { kind: "create", key, name: line.component.trim() };
    if (!target) {
      const fi = findFile(line.component);
      if (fi !== -1) target = { kind: "file", index: fi };
    }
    if (!target) {
      const ex = exBySku.get(key) || exByName.get(key);
      if (ex) target = { kind: "existing", id: ex.id, unitTypeId: ex.unit_type || null };
    }
    if (target && target.kind === "file" && target.index === pi) {
      issues.push({ kind: "self_reference", parent: pp.name, rowNumber: line.rowNumber });
      return;
    }
    if (!target) {
      if (!unresolvedMap.has(key)) unresolvedMap.set(key, { key, ref: line.component.trim(), usedBy: [] });
      const u = unresolvedMap.get(key);
      if (!u.usedBy.includes(pp.name)) u.usedBy.push(pp.name);
    }
    if (target && target.kind === "create" && !createRefs.has(key)) createRefs.set(key, target.name);
    if (!recipes.has(pi)) recipes.set(pi, []);
    recipes.get(pi).push({ ref: line.component.trim(), qty: line.qty, target });
  });

  (products || []).forEach((p, i) => {
    if (p.product_type === "Recipe" && !recipes.has(i)) issues.push({ kind: "recipe_without_components", index: i, parent: p.name });
  });

  // ترتيب طوبولوجي: منتج مجمّع بعد كل مكوّناته من نفس الملف. حلقة => خطأ.
  const order = [];
  const state = new Array((products || []).length).fill(0); // 0 لم يُزَر، 1 قيد الزيارة، 2 انتهى
  const visit = (i, stack) => {
    if (state[i] === 2) return;
    if (state[i] === 1) {
      if (!issues.some((x) => x.kind === "cycle" && x.index === i)) issues.push({ kind: "cycle", index: i, parent: products[i].name, path: [...stack, products[i].name] });
      return;
    }
    state[i] = 1;
    (recipes.get(i) || []).forEach((c) => { if (c.target && c.target.kind === "file") visit(c.target.index, [...stack, products[i].name]); });
    state[i] = 2;
    order.push(i);
  };
  (products || []).forEach((_, i) => { if (!recipes.has(i)) visit(i, []); });
  (products || []).forEach((_, i) => { if (recipes.has(i)) visit(i, []); });

  return {
    recipes,
    unresolved: [...unresolvedMap.values()],
    issues,
    order,
    createRefs: [...createRefs.entries()].map(([key, name]) => ({ key, name })),
    effectiveTypes,
  };
}

// اقتراحات ربط لمكوّن غير مطابق — للعرض فقط، لا تُطبَّق إلا بضغطة المستخدم.
// مرشّح يحوي اسم المكوّن كاملاً أو العكس (مثال: "موزريلا" لـ"جبنة موزريلا").
export function suggestLinks(ref, candidates, limit = 3) {
  const k = matchKey(ref);
  if (!k) return [];
  return (candidates || [])
    .filter((c) => { const n = matchKey(c.name); return n && n !== k && (n.includes(k) || k.includes(n)); })
    .slice(0, limit);
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
    // [إضافة 2026-09-28] نوع المنتج (مادة أولية/منتج/خدمة/مصروف/منتج مجمّع) —
    // اختياري، يبقى -1 لملف لا يحويه فلا يتغيّر أي سلوك حالي. مكوّنات المنتج
    // المجمّع بشيت مستقل (parseBomRows)، لا عمود هنا.
    product_type: -1,
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
    // Inventory (مخزن / مخزون / حالة التخزين)
    // [إصلاح 2026-09-19] خلل حقيقي مبلَّغ من المستخدم: عمود بعنوان "مخزون" حرفياً
    // (شائع جداً بملفات العملاء) لم يكن يُطابَق إطلاقاً — "مخزن"/"تخزين" ليستا
    // سلسلتين فرعيتين من "مخزون" (الحروف مختلفة: و قبل ن). فتبقى inventory=-1
    // لكل الملف، وis_inventory تسقط صامتة لقيمتها الافتراضية false لكل صف مهما
    // كانت القيمة الفعلية بالعمود (نعم/لا) — راجع buildProductsFromRows أسفله.
    if (map.inventory === -1 && /مخزون|مخزن|حالة التخزين|تخزين|inventory|stock/i.test(hh)) map.inventory = i;
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
    // [إضافة 2026-09-28] نوع المنتج — مادة أولية/منتج/خدمة/مصروف/منتج مجمّع
    // (راجع normalizeProductType). "نوع الحساب"/"account type" مُستثنى صراحة
    // (لا علاقة له بنوع المنتج، قد يظهر بملفات فيها كلا العمودين معاً).
    if (map.product_type === -1 && /نوع\s*ال?منتج|نوع\s*الصنف|product\s*type|^\s*(النوع|نوع)\s*$/i.test(hh) && !/حساب|account/i.test(hh)) map.product_type = i;
  });
  return map;
}

// [إضافة 2026-09-19] وصف الحقول المنطقية القابلة للمطابقة اليدوية بشريط
// "مطابقة الأعمدة" الجديد بالواجهة — نفس مفاتيح detectColumns أعلاه حرفياً.
// key يطابق مفتاح map بـdetectColumns، label/labelEn للعرض بقائمة الاختيار
// المنسدلة، required فقط لعمود الاسم (الوحيد الإلزامي فعلياً — راجع rowsToProducts:
// أي صف بلا name يُتخطى بصمت).
export const MAPPABLE_FIELDS = [
  ['name', 'الاسم', true, 'Name'],
  ['sku', 'الرمز/الكود', false, 'SKU / code'],
  ['name_en', 'الاسم (إنجليزي)', false, 'Name (English)'],
  ['sellable', 'حالة البيع', false, 'Sellable status'],
  ['inventory', 'حالة التخزين (مخزون)', false, 'Inventory status'],
  ['unit', 'الوحدة', false, 'Unit'],
  ['category', 'الفئة', false, 'Category'],
  ['category_code', 'رقم الصنف', false, 'Category code'],
  ['cost', 'التكلفة', false, 'Cost'],
  ['sellingPrice', 'سعر البيع', false, 'Selling price'],
  ['revenue', 'حساب الإيراد', false, 'Revenue account'],
  ['expense', 'حساب المصروف', false, 'Expense account'],
  ['barcode', 'الباركود', false, 'Barcode'],
  ['quantity', 'الكمية المتوفرة', false, 'Quantity'],
  ['location', 'الموقع', false, 'Location'],
  ['description', 'الوصف', false, 'Description'],
  // [إضافة 2026-09-28]
  ['product_type', 'نوع المنتج', false, 'Product type'],
];

// [إضافة 2026-09-19] الاكتشاف التلقائي الكامل لخريطة الأعمدة (detectColumns +
// التخطيط الاحتياطي الموضعي) — استُخرج من buildProductsFromRows ليُستخدَم أيضاً
// كخريطة ابتدائية لشريط "مطابقة الأعمدة" اليدوي (يعرضها كنقطة بداية قابلة
// للتعديل، بدل إعادة اكتشاف صامتة قد تختلف عمّا يراه المستخدم فعلياً).
export function detectColumnsWithFallback(headerRow) {
  const cols = detectColumns(headerRow);
  if (cols.name === -1 && cols.sku === -1 && cols.category === -1) {
    cols.sku = 0; cols.name = 1; cols.sellable = 2; cols.inventory = 3;
    cols.unit = 4; cols.revenue = 5; cols.expense = 6;
  }
  return cols;
}

// [إضافة 2026-09-19] يبحث عن صف الترويسة فقط — استُخرج من buildProductsFromRows
// (كان مدمجاً بجسمها) ليستخدمه أيضاً شريط "مطابقة الأعمدة" الجديد بواجهة
// المستخدم (يحتاج headerIdx بمعزل عن بناء المنتجات نفسها، لعرض صفوف الملف
// الخام تحت شريط المطابقة قبل أي تعديل من المستخدم على cols).
export function findHeaderRowIndex(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = (rows[i] || []).map((c) => String(c || "")).join(" ");
    if (/كود|اسم|صنف|وحدة|رمز|التكلفة|sku|product/i.test(joined)) return i;
  }
  return -1;
}

// [إضافة 2026-09-19] يحوّل صفوف البيانات (بعد صف الترويسة) إلى مصفوفة منتجات،
// بخريطة أعمدة (cols) مُمرَّرة صراحة — استُخرج من buildProductsFromRows (كان
// الجزء الثاني من جسمها) كي يعيد استدعائها شريط "مطابقة الأعمدة" الجديد بعد أي
// تعديل يدوي من المستخدم على cols (بلا إعادة اكتشاف تلقائي ولا تخطيط احتياطي
// موضعي — المستخدم حدَّد الأعمدة صراحةً بهذي الحالة). المنطق الداخلي حرفي بلا
// أي تغيير عمّا كان بجسم buildProductsFromRows الأصلي.
export function rowsToProducts(rows, headerIdx, cols) {
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

    // [إضافة 2026-09-28] نوع المنتج — عمود غائب/فارغ => Product بلا أي تغيير.
    const typeRaw = cols.product_type >= 0 && get(cols.product_type) !== null ? String(get(cols.product_type)).trim() : "";
    const nt = normalizeProductType(typeRaw);
    p.product_type = nt.type;
    p.product_type_raw = typeRaw;
    p.product_type_recognized = nt.recognized;
    p.product_type_explicit = nt.explicit;
    // هل عمود "حالة البيع" موجود فعلاً؟ — لتحديد افتراضي البيع حسب النوع فقط
    // حين يغيب العمود (راجع buildProductPayload).
    p.sellable_explicit = cols.sellable >= 0;

    data.push(p);
  }

  return data;
}

/*
 يحوّل صفوف ورقة العمل (كما تُخرج بواسطة XLSX.utils.sheet_to_json بوسائط
 { header: 1, defval: null }) إلى مصفوفة منتجات — الاكتشاف التلقائي الكامل
 (صف الترويسة + خريطة الأعمدة + التخطيط الاحتياطي الموضعي)، ثم rowsToProducts.

 ملاحظة الفصل عن الأصل: في الأصل عند عدم العثور على صف ترويسة يُستدعى
 alert(...) مباشرة من داخل نفس الدالة. هنا نُعيد { headerFound:false, data:[] }
 وتتولى طبقة الواجهة إظهار الرسالة (نفس النص الحرفي). كل الشروط والحسابات
 الداخلية الأخرى منقولة حرفياً.
*/
export function buildProductsFromRows(rows) {
  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx === -1) return { headerFound: false, data: [] };

  const cols = detectColumnsWithFallback(rows[headerIdx]);
  return { headerFound: true, data: rowsToProducts(rows, headerIdx, cols) };
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
//
// [إضافة 2026-09-28] type (مادة أولية/منتج/خدمة/مصروف/منتج مجمّع) وingredients
// (للمنتج المجمّع فقط). بلا type => Product ونفس الحمولة السابقة حرفياً ما عدا
// حقل type نفسه (نفس الافتراضي الرسمي لقيود أصلاً). قواعد حسب النوع:
//  - خدمة/مصروف: لا تتبّع كمية أبداً (track_quantity=false) مهما كان عمود المخزون.
//  - مادة أولية/مصروف بلا عمود "حالة البيع" بالملف: غير قابلة للبيع افتراضياً.
//    عمود صريح بالملف يتفوّق دائماً.
export function buildProductPayload(p, { unitId, categoryId, revId, expId, selectedTaxId, taxInclusive, type, ingredients }) {
  const costNum = parseCostNumber(p.cost);
  const nameEn = p.name_en && p.name_en.trim() ? p.name_en.trim() : p.name;
  const resolvedType = PRODUCT_TYPES.includes(type) ? type : "Product";
  const noStock = resolvedType === "Service" || resolvedType === "Expense";
  const defaultNotSold = (resolvedType === "RawMaterial" || resolvedType === "Expense") && !p.sellable_explicit;
  p = { ...p, is_inventory: noStock ? false : p.is_inventory, is_sellable: defaultNotSold ? false : p.is_sellable };
  const payload = { name_en: nameEn, name_ar: p.name, type: resolvedType };
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
  // [إصلاح خطأ حقيقي] "tax_inclusive" ليس حقلاً موجوداً إطلاقاً بمواصفة Qoyod
  // الرسمية (ProductInput) — لا بأي endpoint آخر بكل الملف (تأكَّد بالبحث
  // الكامل). الحقلان الحقيقيان منفصلان لكل سعر على حدة: is_buying_price_inclusive
  // وis_selling_price_inclusive. المفتاح المُرسَل سابقاً كان يُتجاهَل بصمت من
  // قيود (حقل غير معروف بالـparams)، فتبديلة المستخدم "شامل الضريبة" بالواجهة
  // لم يكن لها أي أثر فعلي على أي منتج رُفع منذ إنشاء الأداة. الآن يُطبَّق نفس
  // اختيار المستخدم على الحقلين الرسميين معاً (سعر الشراء وسعر البيع).
  payload.is_buying_price_inclusive = taxInclusive;
  payload.is_selling_price_inclusive = taxInclusive;
  if (resolvedType === "Recipe" && Array.isArray(ingredients) && ingredients.length) payload.ingredients = ingredients;
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
