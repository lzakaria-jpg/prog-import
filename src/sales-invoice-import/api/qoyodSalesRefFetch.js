/*
 ============================================================================
  qoyodSalesRefFetch — جلب الملفات المرجعية (منتجات/مخزون/عملاء) لأداة استيراد
  فواتير المبيعات مباشرة من منشأة العميل عبر Qoyod REST API، بدل رفعها يدويًا.
  ============================================================================
  [إضافة] ميزة إضافية بحتة — لا تُعدِّل أي كود مطابقة/تحقق/مقارنة بالأداة. تبني
  فقط نفس أشكال البيانات (productsRef/stockRef/customersRef) التي ينتجها مسار
  الرفع اليدوي الحالي تمامًا (buildProductsIndex/buildStockIndex/buildCustomersIndex
  في engine/referenceIndexes.js)، لتحل محلها بشكل شفاف بلا أي تغيير على بقية
  خطوات الأداة (المطابقة/التحقق/التصدير اليدوي تبقى كما هي 100%).

  [قرار صريح بعد تحقق حي مع المستخدم 2026-09-11] "قالب استيراد فواتير المبيعات"
  (dropdowns.G/H/V وbuild colMap) يبقى رفعًا يدويًا دائمًا — Qoyod API لا يوفر
  أي endpoint لقائمة الفئات الضريبية (V)، وشكل القالب نفسه (عدد الأعمدة) يختلف
  فعليًا حسب إعدادات كل منشأة (مثال: تفعيل خصم إجمالي على المستند يضيف أعمدة) —
  معلومة لا بديل عنها عن تحليل الملف الحقيقي المُنزَّل من قيود. هذا الملف لا
  يتعرض لـtemplate.js/columnMatching.js إطلاقًا.

  مصادر البيانات الفعلية (مؤكَّدة باختبار حي على منشأة اختبارية 2026-09-11):
    - GET /products  → sku, name_ar, name_en, is_sold, track_quantity, tax_id,
      inventories:[{id, name_ar, name_en, stock}] — المخزون بكل موقع مُضمَّن
      داخل رد المنتجات نفسه، فلا حاجة لأي endpoint منفصل لتقرير المواقع.
    - GET /customers → id, name, status — "الرقم المرجعي للعميل" (كما يظهر
      بواجهة قيود، مثل CUS198) غير موجود بالـAPI إطلاقًا (تحقّقنا بـ3 عملاء
      مختلفين، حتى بعد تعيينه يدويًا بالواجهة) — لذلك نستخدم id الحقيقي مباشرة
      كمرجع العميل (customers.byRef مفتاحه String(id))، وهذا صحيح ومتوافق تمامًا
      مع مسار الإرسال عبر API لاحقًا (qoyodSalesInvoicePush.js يحتاج contact_id
      الحقيقي أصلاً، لا "الرقم المرجعي" النصي الذي يحتاجه القالب اليدوي فقط).
 ============================================================================
*/
import { fetchAll } from '../../product-upload/io/network.js';
import { norm, normKey } from '../engine/text.js';

/**
 * يحوّل حالة "is_sold" الفعلية من Qoyod (Boolean) إلى نفس دلالة sellable
 * المستخدمة بمسار الرفع اليدوي (buildProductsIndex بـreferenceIndexes.js).
 */
function isSellableFromApi(apiProduct) {
  return apiProduct?.is_sold !== false;
}

/**
 * يحوّل حالة "track_quantity" الفعلية من Qoyod (Boolean) إلى نفس دلالة stocked
 * المستخدمة بمسار الرفع اليدوي. null فقط لو الحقل غائب تمامًا من الرد (لا يُفترض
 * عمليًا، لكن نحافظ على نفس دلالة "null = غير معروف" المستخدمة بالفهرس اليدوي).
 */
function isStockedFromApi(apiProduct) {
  if (apiProduct?.track_quantity === undefined) return null;
  return !!apiProduct.track_quantity;
}

/**
 * يبني نفس شكل رد buildProductsIndex (engine/referenceIndexes.js) من مصفوفة
 * GET /products الخام — بإضافة حقل id (غير موجود بالمسار اليدوي، يُستخدم لاحقًا
 * فقط من قِبل qoyodSalesInvoicePush.js لبناء product_id بالإرسال؛ لا يقرأه أي
 * كود مطابقة/تحقق حالي فيتأثر بوجوده).
 */
export function buildProductsIndexFromApi(apiProducts) {
  const bySku = new Map();
  const byName = new Map();
  (apiProducts || []).forEach((p) => {
    const sku = norm(p?.sku);
    if (!sku) return;
    const name = norm(p?.name_ar) || norm(p?.name_en);
    const rec = { sku, name, sellable: isSellableFromApi(p), stocked: isStockedFromApi(p), id: p?.id };
    bySku.set(sku, rec);
    if (name) {
      const nk = normKey(name);
      if (!byName.has(nk)) byName.set(nk, []);
      byName.get(nk).push(rec);
    }
  });
  const nonStockedCount = Array.from(bySku.values()).filter((p) => p.stocked === false).length;
  return { bySku, byName, nonStockedCount };
}

/**
 * يبني نفس شكل رد buildStockIndex (الوضع الطويل — مفتاح sku+'||'+اسم الموقع)
 * من نفس مصفوفة GET /products (كل منتج يحمل مخزونه بكل موقع بمصفوفة inventories
 * المُضمَّنة). اسم الموقع المستخدم بالمفتاح = ar_name (يطابق الأسماء العربية
 * الحقيقية المُسجَّلة بمنشأة العميل — نفس الأسماء التي ستظهر بقائمة G بالقالب
 * المرفوع يدويًا لأن كليهما يقرآن من نفس إعدادات المواقع الفعلية بمنشأة العميل).
 */
export function buildStockIndexFromApi(apiProducts) {
  const byKey = new Map();
  (apiProducts || []).forEach((p) => {
    const sku = norm(p?.sku);
    if (!sku) return;
    (p?.inventories || []).forEach((inv) => {
      const loc = norm(inv?.name_ar) || norm(inv?.name_en);
      const qty = parseFloat(inv?.stock);
      if (!loc || isNaN(qty)) return;
      byKey.set(sku + '||' + loc, qty);
    });
  });
  return { byKey, groupCount: byKey.size };
}

/**
 * يبني فهرس "اسم الموقع → معرّف المخزون (inventory_id)" من نفس مصفوفة GET
 * /products — يُستخدَم حصريًا داخليًا من qoyodSalesInvoicePush.js لحل عمود G
 * (اسم الموقع كما كتبه المستخدم) إلى inventory_id رقمي مطلوب بإنشاء الفاتورة.
 * لا علاقة له بـtemplate.dropdowns.G (يبقى من الملف المرفوع يدويًا فقط) ولا
 * يقرأه أي كود مطابقة/تحقق — بناء داخلي لمرحلة الإرسال فقط.
 */
export function buildLocationIdIndexFromApi(apiProducts) {
  const byName = new Map();
  (apiProducts || []).forEach((p) => {
    (p?.inventories || []).forEach((inv) => {
      const id = inv?.id;
      if (id === undefined || id === null) return;
      const arName = norm(inv?.name_ar);
      const enName = norm(inv?.name_en);
      if (arName && !byName.has(arName)) byName.set(arName, id);
      if (enName && !byName.has(enName)) byName.set(enName, id);
    });
  });
  return byName;
}

/**
 * يبني نفس شكل رد buildCustomersIndex من مصفوفة GET /customers الخام.
 * ref = String(id) الحقيقي بقيود (لا "الرقم المرجعي" النصي الظاهر بالواجهة —
 * غير متاح بالـAPI إطلاقًا، تحقّقنا من ذلك ميدانيًا). active يُستنتَج من status
 * بنفس منطق buildCustomersIndex الأصلي (أي قيمة غير "Active" فعليًا = غير نشط).
 */
export function buildCustomersIndexFromApi(apiCustomers) {
  const byRef = new Map();
  const byName = new Map();
  (apiCustomers || []).forEach((c) => {
    const id = c?.id;
    if (id === undefined || id === null) return;
    const ref = String(id);
    const name = norm(c?.name);
    const statusRaw = norm(c?.status).toLowerCase();
    const active = statusRaw === '' ? true : statusRaw === 'active';
    const rec = { ref, name, active };
    byRef.set(ref, rec);
    if (name) {
      const nk = normKey(name);
      if (!byName.has(nk)) byName.set(nk, []);
      byName.get(nk).push(rec);
    }
  });
  return { byRef, byName };
}

/**
 * الدالة المنسِّقة — تُستدعى من useSalesInvoiceImportEngine.js فقط. تجلب
 * /products و/customers بالتوازي (نفس مفتاح API)، وتبني الفهارس الثلاثة
 * (منتجات/مخزون/عملاء) + فهرس المواقع الداخلي للإرسال لاحقًا.
 * ترمي استثناءً برسالة عربية واضحة عند أي فشل شبكي — الهوك هو من يلتقطه ويعرضه.
 */
export async function fetchSalesReferencesFromApi(apiKey) {
  const key = (apiKey || '').trim();
  if (!key) throw new Error('أدخل مفتاح API أولاً');

  let apiProducts, apiCustomers;
  try {
    [apiProducts, apiCustomers] = await Promise.all([
      fetchAll('/products', key),
      fetchAll('/customers', key),
    ]);
  } catch (e) {
    throw new Error(`تعذّر جلب البيانات المرجعية من قيود: ${e.message || String(e)}`);
  }

  const products = buildProductsIndexFromApi(apiProducts);
  const stock = buildStockIndexFromApi(apiProducts);
  const customers = buildCustomersIndexFromApi(apiCustomers);
  const locationIdByName = buildLocationIdIndexFromApi(apiProducts);

  return {
    productsRef: { loaded: true, raw: null, headers: null, mapping: null, ...products },
    stockRef: { loaded: true, raw: null, headers: null, mapping: null, ...stock },
    customersRef: { loaded: true, raw: null, headers: null, mapping: null, ...customers },
    locationIdByName,
    counts: { products: apiProducts.length, customers: apiCustomers.length },
  };
}
