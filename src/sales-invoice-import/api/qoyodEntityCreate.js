/*
 ============================================================================
  qoyodEntityCreate — إنشاء الكيانات الناقصة (عملاء/فئات منتج/وحدات منتج/
  منتجات/مواقع) مباشرة بمنشأة العميل عبر Qoyod REST API، بعد موافقة صريحة من
  المستخدم على لوحة مراجعة الكيانات الناقصة بالخطوة 4 (MissingEntitiesReviewPanel).
  ============================================================================
  [إضافة] الجزء الثاني من ميزة "الاستيراد الذكي": عميل/منتج مذكور بملف الفواتير
  غير موجود فعليًا بمنشأة العميل الحقيقية (API فقط — راجع code:'missing_customer'/
  'missing_product' بـengine/validation.js) يمكن إنشاؤه تلقائيًا بدل حجب الاستيراد
  بالكامل، وموقع مذكور بعمود الموقع (G) غير موجود كذلك (راجع computeMissingEntitiesPlan).
  لا يُستدعى أي شيء هنا إلا بعد ضغطة تأكيد صريحة من المستخدم على اللوحة — بلا
  استثناء (القاعدة المعتمَدة صراحةً بالخطة الموافَق عليها).

  حمولات الإنشاء (مؤكَّدة من config/qoyod-openapi-v2.1.yaml — القراءة المباشرة
  للمواصفة الرسمية، لا افتراضًا):
    POST /customers            {contact:{name, status:'Active'}} — نفس غلاف
      contactsPush.js (customer-import/lib/api.js: createContact).
    POST /categories           {category:{name}} — CategoryInput، فقط name إلزامي
      فعليًا (parent_id اختياري، غير مستخدَم هنا).
    POST /product_unit_types   {product_unit_type:{unit_name, unit_representation}}
      — كلاهما إلزاميان بالمواصفة؛ unit_representation يُشتَق تلقائيًا من أول 3
      أحرف من unit_name (نفس نمط useProductUploadEngine.js حرفيًا).
    POST /products              {product:{...}} — ProductInput. name إلزامي فعليًا
      (الحد الأدنى 3 أحرف يُفرَض فقط لمنشآت ZATCA المرحلة 2، لكن الحقل بحد ذاته
      مطلوب دومًا لكل منشأة) — نستخدم sku كاسم احتياطي لو لا اسم آخر متاح، فلا
      يُترَك فارغًا أبدًا. track_quantity/sale_item/purchase_item ثابتة دومًا
      (راجع buildProductCreatePayload لسبب كل قيمة).
    POST /inventories           {name, account_id} — account_id اختياري بالمواصفة
      لكن يُرسَل دومًا هنا (قرار المستخدم الصريح: كل موقع جديد يُربَط بحساب مخزون/
      أصول يختاره المستخدم بنفسه من اللوحة، لا حساب افتراضي مفروض).
    POST /inventory_adjustments {inventory_adjustment:{inventory_id,
      revenue_account_id, expense_account_id, date, status:'Completed',
      line_items:[{product_id, actual_quantity}]}} — منفصل تمامًا عن باقي هذا
      الملف (pushInventoryAdjustments)، يُستدعى فقط من المرحلة الثانية (بعد إعادة
      محاكاة المخزون بمنتجات مُنشأة حديثًا) لا من pushMissingEntitiesToQoyod نفسها
      — راجع تعليق رأس useSalesInvoiceImportEngine.js لتفصيل المرحلتين.
 ============================================================================
*/
import { api } from '../../product-upload/io/network.js';

const RATE_LIMIT_MS = 300; // نفس التأخير المستخدم فعليًا بكل أدوات API الأخرى بالمشروع

function todayIsoDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/* ========================= بناء الحمولات (نقية بالكامل) ========================= */

export function buildCustomerCreatePayload(name) {
  const n = (name || '').trim();
  if (!n) return { ok: false, error: 'اسم العميل مفقود' };
  return { ok: true, payload: { name: n, status: 'Active' } };
}

export function buildCategoryCreatePayload(name) {
  const n = (name || '').trim();
  if (!n) return { ok: false, error: 'اسم الفئة مفقود' };
  return { ok: true, payload: { name: n } };
}

export function buildUnitCreatePayload(name) {
  const n = (name || '').trim();
  if (!n) return { ok: false, error: 'اسم الوحدة مفقود' };
  return { ok: true, payload: { unit_name: n, unit_representation: n.slice(0, 3) } };
}

/**
 * name قد يغيب من صف الفاتورة (فقط O/وصف المنتج أو _productName الاختياريان قد يحملانه) —
 * نسقط دومًا على sku كاسم احتياطي (Qoyod يتطلب name دومًا، ولا نتركه فارغًا أبدًا).
 * track_quantity=1 (منتج مخزَّن) وsale_item=true وpurchase_item=true ثابتة دومًا لكل
 * منتج يُنشأ من هنا — تبسيط مقصود لا خيار له بالإصدار الأول (v1): المنتج يُباع فعليًا
 * على هذه الفاتورة (sale_item منطقي)، وتغذية المخزون لاحقًا لا معنى لها بلا تتبع كمية
 * (track_quantity)، فبقية القيم البديلة (منتج غير مخزَّن) خارج نطاق هذه الميزة أصلًا.
 *
 * [إصلاح خطأ حقيقي، اختبار حي 2026-09-16] المواصفة الرسمية (ProductInput) تصف
 * selling_price/buying_price/tax_id/cogs_account_id كحقول اختيارية — لكن منشأة
 * العميل الحقيقية رفضت POST /products بلا الأربعة معًا فعليًا (422: "tax_id:
 * Please select taxes"، "buying_price/selling_price: must be a number"،
 * "cogs_account_id: Can't be blank")، فكانت كل المنتجات تفشل إنشاؤها صامتًا ثم
 * كل الفواتير المعتمِدة عليها تفشل لاحقًا بصمت أيضًا (لا معرّف منتج حقيقي). الآن
 * تُرسَل الأربعة دومًا: selling_price من سعر الوحدة الحقيقي بالفاتورة نفسها (لا
 * تخمين)، buying_price/cogs_account_id افتراضيان للدفعة يختارهما المستخدم صراحةً
 * بلوحة المراجعة (MissingEntitiesReviewPanel)، وtax_id من فئة الضريبة الحقيقية
 * بالفاتورة (أو الافتراضي الاحتياطي للدفعة لو الملف بلا فئة مطابقة).
 */
export function buildProductCreatePayload({ sku, name, categoryId, unitId, sellingPrice, buyingPrice, taxId, cogsAccountId } = {}) {
  const s = (sku || '').trim();
  if (!s) return { ok: false, error: 'كود المنتج مفقود' };
  const n = (name || '').trim() || s;
  const payload = { sku: s, name: n, track_quantity: 1, sale_item: true, purchase_item: true };
  if (categoryId !== undefined && categoryId !== null) payload.category_id = categoryId;
  if (unitId !== undefined && unitId !== null) payload.product_unit_type_id = unitId;
  payload.selling_price = typeof sellingPrice === 'number' && !isNaN(sellingPrice) ? sellingPrice : 0;
  payload.buying_price = typeof buyingPrice === 'number' && !isNaN(buyingPrice) ? buyingPrice : 0;
  if (taxId !== undefined && taxId !== null) payload.tax_id = taxId;
  if (cogsAccountId !== undefined && cogsAccountId !== null) payload.cogs_account_id = cogsAccountId;
  return { ok: true, payload };
}

export function buildLocationCreatePayload({ name, accountId } = {}) {
  const n = (name || '').trim();
  if (!n) return { ok: false, error: 'اسم الموقع مفقود' };
  const payload = { name: n };
  if (accountId !== undefined && accountId !== null) payload.account_id = accountId;
  return { ok: true, payload };
}

/**
 * lineItems: [{productId, quantity}] — actual_quantity تُرسَل نصًا (مواصفة Qoyod
 * الرسمية: نوعها string، مثال "50.0") لا رقمًا. date افتراضيًا اليوم (قرار صريح
 * من المستخدم: "اليوم، الأبسط" — لا محاولة اشتقاق تاريخ محاسبي "صحيح").
 */
export function buildInventoryAdjustmentPayload({ inventoryId, revenueAccountId, expenseAccountId, date, lineItems } = {}) {
  if (!inventoryId) return { ok: false, error: 'معرّف الموقع (inventory_id) مفقود' };
  if (!revenueAccountId || !expenseAccountId) return { ok: false, error: 'حساب الإيراد/المصروف لتعديل المخزون مفقود' };
  if (!lineItems || !lineItems.length) return { ok: false, error: 'لا توجد بنود منتجات لتغذية المخزون' };
  return {
    ok: true,
    payload: {
      inventory_adjustment: {
        inventory_id: inventoryId,
        revenue_account_id: revenueAccountId,
        expense_account_id: expenseAccountId,
        date: date || todayIsoDate(),
        status: 'Completed',
        line_items: lineItems.map((l) => ({ product_id: l.productId, actual_quantity: String(l.quantity) })),
      },
    },
  };
}

/* ========================= الإرسال الفعلي ========================= */

/**
 * plan: {
 *   customers: [{name}],                          — عملاء مُحدَّدون للإنشاء
 *   newCategories: [{tempId, name}],                — فئات جديدة يُنشئها المستخدم بهذه الدفعة
 *   newUnits: [{tempId, name}],                      — وحدات جديدة كذلك
 *   products: [{sku, name, categoryId?, categoryTempId?, unitId?, unitTempId?, sellingPrice, taxId?}],
 *   locations: [{name, accountId}],
 *   defaultBuyingPrice: number,                      — سعر تكلفة افتراضي لكل منتجات الدفعة (راجع buildProductCreatePayload)
 *   defaultCogsAccountId: number,                     — حساب تكلفة المبيعات (COGS) الافتراضي لكل منتجات الدفعة
 * }
 * الترتيب إلزامي: عملاء ← فئات/وحدات جديدة ← منتجات (تحتاج نتائج الفئات/الوحدات) ←
 * مواقع (مستقلة تمامًا) — كل مرحلة مستقلة داخليًا (فشل عنصر واحد لا يوقف باقي
 * عناصر نفس المرحلة، ولا المراحل التالية).
 * @returns {Promise<{total,sent,failed,stoppedEarly,entries,created:{customers,categories,units,products,locations}}>}
 *   created.* كلها Map: customers/locations مفتاحها الاسم المكتوب بالضبط كما بـplan،
 *   categories/units مفتاحها tempId (أو الاسم لو بلا tempId)، products مفتاحها sku.
 *   كل قيمة {id, name}.
 */
export async function pushMissingEntitiesToQoyod(plan, apiKey, opts = {}) {
  const { onEntry, onProgress, stoppedRef } = opts;
  const entries = [];
  const emit = (entry) => { entries.push(entry); if (onEntry) onEntry(entry); };

  const created = {
    customers: new Map(),
    categories: new Map(),
    units: new Map(),
    products: new Map(),
    locations: new Map(),
  };

  const key = (apiKey || '').trim();
  if (!key) return { total: 0, sent: 0, failed: 0, stoppedEarly: false, fatalError: 'أدخل مفتاح API أولاً', entries, created };

  const customers = (plan && plan.customers) || [];
  const newCategories = (plan && plan.newCategories) || [];
  const newUnits = (plan && plan.newUnits) || [];
  const products = (plan && plan.products) || [];
  const locations = (plan && plan.locations) || [];

  const totalSteps = customers.length + newCategories.length + newUnits.length + products.length + locations.length;
  if (!totalSteps) return { total: 0, sent: 0, failed: 0, stoppedEarly: false, fatalError: 'لا توجد كيانات ناقصة محدَّدة للإنشاء', entries, created };

  let doneSteps = 0, sent = 0, failed = 0, stoppedEarly = false;
  const stopped = () => !!(stoppedRef && stoppedRef.current);
  const tick = () => { doneSteps++; if (onProgress) onProgress(doneSteps, totalSteps); };
  const wait = () => new Promise((r) => setTimeout(r, RATE_LIMIT_MS));

  // 1) العملاء الناقصون — مستقلون تمامًا عن بعضهم
  for (const c of customers) {
    if (stopped()) { stoppedEarly = true; break; }
    const built = buildCustomerCreatePayload(c.name);
    if (!built.ok) { failed++; emit({ kind: 'customer', ref: c.name, status: 'error', reason: built.error }); tick(); continue; }
    try {
      const res = await api('POST', '/customers', { contact: built.payload }, key);
      const contact = res && res.contact;
      if (contact && contact.id != null) {
        sent++;
        created.customers.set(c.name, { id: contact.id, name: c.name });
        emit({ kind: 'customer', ref: c.name, status: 'success', id: contact.id });
      } else {
        failed++; emit({ kind: 'customer', ref: c.name, status: 'error', reason: 'رد غير متوقع من Qoyod (بلا معرّف عميل)' });
      }
    } catch (e) {
      failed++; emit({ kind: 'customer', ref: c.name, status: 'error', reason: e.message || String(e) });
    }
    tick();
    if (!stopped()) await wait();
  }

  // 2) الفئات/الوحدات الجديدة — مستقلة عن بعضها، والمنتجات (مرحلة 3) تعتمد على نتائجها
  if (!stopped()) {
    for (const cat of newCategories) {
      if (stopped()) { stoppedEarly = true; break; }
      const built = buildCategoryCreatePayload(cat.name);
      if (!built.ok) { failed++; emit({ kind: 'category', ref: cat.name, status: 'error', reason: built.error }); tick(); continue; }
      try {
        const res = await api('POST', '/categories', { category: built.payload }, key);
        const category = res && res.category;
        if (category && category.id != null) {
          sent++;
          created.categories.set(cat.tempId || cat.name, { id: category.id, name: cat.name });
          emit({ kind: 'category', ref: cat.name, status: 'success', id: category.id });
        } else {
          failed++; emit({ kind: 'category', ref: cat.name, status: 'error', reason: 'رد غير متوقع من Qoyod (بلا معرّف فئة)' });
        }
      } catch (e) {
        failed++; emit({ kind: 'category', ref: cat.name, status: 'error', reason: e.message || String(e) });
      }
      tick();
      if (!stopped()) await wait();
    }
  }
  if (!stopped()) {
    for (const u of newUnits) {
      if (stopped()) { stoppedEarly = true; break; }
      const built = buildUnitCreatePayload(u.name);
      if (!built.ok) { failed++; emit({ kind: 'unit', ref: u.name, status: 'error', reason: built.error }); tick(); continue; }
      try {
        const res = await api('POST', '/product_unit_types', { product_unit_type: built.payload }, key);
        const unit = res && res.product_unit_type;
        if (unit && unit.id != null) {
          sent++;
          created.units.set(u.tempId || u.name, { id: unit.id, name: u.name });
          emit({ kind: 'unit', ref: u.name, status: 'success', id: unit.id });
        } else {
          failed++; emit({ kind: 'unit', ref: u.name, status: 'error', reason: 'رد غير متوقع من Qoyod (بلا معرّف وحدة)' });
        }
      } catch (e) {
        failed++; emit({ kind: 'unit', ref: u.name, status: 'error', reason: e.message || String(e) });
      }
      tick();
      if (!stopped()) await wait();
    }
  }

  // 3) المنتجات الناقصة — تحتاج نتائج مرحلة 2 لو كانت فئتها/وحدتها من newCategories/newUnits
  if (!stopped()) {
    for (const p of products) {
      if (stopped()) { stoppedEarly = true; break; }
      let categoryId = p.categoryId;
      if (categoryId === undefined && p.categoryTempId !== undefined) {
        const rec = created.categories.get(p.categoryTempId);
        if (!rec) {
          failed++; emit({ kind: 'product', ref: p.sku, status: 'error', reason: 'تعذّر إنشاء المنتج: فشل إنشاء الفئة المطلوبة له' });
          tick(); if (!stopped()) await wait();
          continue;
        }
        categoryId = rec.id;
      }
      let unitId = p.unitId;
      if (unitId === undefined && p.unitTempId !== undefined) {
        const rec = created.units.get(p.unitTempId);
        if (!rec) {
          failed++; emit({ kind: 'product', ref: p.sku, status: 'error', reason: 'تعذّر إنشاء المنتج: فشل إنشاء الوحدة المطلوبة له' });
          tick(); if (!stopped()) await wait();
          continue;
        }
        unitId = rec.id;
      }
      const built = buildProductCreatePayload({
        sku: p.sku, name: p.name, categoryId, unitId,
        sellingPrice: p.sellingPrice,
        buyingPrice: plan.defaultBuyingPrice,
        taxId: p.taxId,
        cogsAccountId: plan.defaultCogsAccountId,
      });
      if (!built.ok) { failed++; emit({ kind: 'product', ref: p.sku, status: 'error', reason: built.error }); tick(); if (!stopped()) await wait(); continue; }
      try {
        const res = await api('POST', '/products', { product: built.payload }, key);
        const product = res && res.product;
        if (product && product.id != null) {
          sent++;
          created.products.set(p.sku, { id: product.id, name: built.payload.name });
          emit({ kind: 'product', ref: p.sku, status: 'success', id: product.id });
        } else {
          failed++; emit({ kind: 'product', ref: p.sku, status: 'error', reason: 'رد غير متوقع من Qoyod (بلا معرّف منتج)' });
        }
      } catch (e) {
        failed++; emit({ kind: 'product', ref: p.sku, status: 'error', reason: e.message || String(e) });
      }
      tick();
      if (!stopped()) await wait();
    }
  }

  // 4) المواقع الناقصة — مستقلة تمامًا عن المنتجات
  if (!stopped()) {
    for (const loc of locations) {
      if (stopped()) { stoppedEarly = true; break; }
      const built = buildLocationCreatePayload({ name: loc.name, accountId: loc.accountId });
      if (!built.ok) { failed++; emit({ kind: 'location', ref: loc.name, status: 'error', reason: built.error }); tick(); continue; }
      try {
        const res = await api('POST', '/inventories', built.payload, key);
        const inventory = res && res.inventory;
        if (inventory && inventory.id != null) {
          sent++;
          created.locations.set(loc.name, { id: inventory.id, name: loc.name });
          emit({ kind: 'location', ref: loc.name, status: 'success', id: inventory.id });
        } else {
          failed++; emit({ kind: 'location', ref: loc.name, status: 'error', reason: 'رد غير متوقع من Qoyod (بلا معرّف موقع)' });
        }
      } catch (e) {
        failed++; emit({ kind: 'location', ref: loc.name, status: 'error', reason: e.message || String(e) });
      }
      tick();
      if (!stopped()) await wait();
    }
  }

  if (onProgress) onProgress(doneSteps, totalSteps);
  return { total: totalSteps, sent, failed, stoppedEarly, entries, created };
}

/**
 * items: [{inventoryId, revenueAccountId, expenseAccountId, date?, lineItems:[{productId,quantity}], ref?}]
 * كل عنصر = استدعاء POST /inventory_adjustments واحد (مُجمَّع مسبقًا حسب inventory_id
 * من قِبل المستدعي لتقليل عدد الطلبات — راجع تعليق رأس الملف). نفس عقد
 * {onEntry,onProgress,stoppedRef} → {total,sent,failed,stoppedEarly,entries} المستخدَم
 * بكل دالة push شقيقة بالمشروع حرفيًا (contactsPush.js/qoyodSalesInvoicePush.js).
 */
export async function pushInventoryAdjustments(items, apiKey, opts = {}) {
  const { onEntry, onProgress, stoppedRef } = opts;
  const entries = [];
  const emit = (entry) => { entries.push(entry); if (onEntry) onEntry(entry); };

  const key = (apiKey || '').trim();
  if (!key) return { total: 0, sent: 0, failed: 0, stoppedEarly: false, fatalError: 'أدخل مفتاح API أولاً', entries };
  if (!items || !items.length) return { total: 0, sent: 0, failed: 0, stoppedEarly: false, fatalError: 'لا توجد بنود لتغذية المخزون', entries };

  let sent = 0, failed = 0, stoppedEarly = false;

  for (let i = 0; i < items.length; i++) {
    if (stoppedRef && stoppedRef.current) { stoppedEarly = true; break; }
    const it = items[i];
    if (onProgress) onProgress(i, items.length);
    const built = buildInventoryAdjustmentPayload(it);
    const label = it.ref || `inventory ${it.inventoryId}`;
    if (!built.ok) {
      failed++;
      emit({ ref: label, status: 'error', reason: built.error });
    } else {
      try {
        const res = await api('POST', '/inventory_adjustments', built.payload, key);
        const adj = res && res.inventory_adjustment;
        if (adj && adj.id != null) {
          sent++;
          emit({ ref: label, status: 'success', id: adj.id, response: adj });
        } else {
          failed++;
          emit({ ref: label, status: 'error', reason: 'رد غير متوقع من Qoyod (بلا معرّف تعديل مخزون)' });
        }
      } catch (e) {
        failed++;
        emit({ ref: label, status: 'error', reason: e.message || String(e) });
      }
    }
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  if (onProgress) onProgress(entries.length, items.length);
  return { total: items.length, sent, failed, stoppedEarly, entries };
}
