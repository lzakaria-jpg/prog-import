import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildCustomerCreatePayload, buildCategoryCreatePayload, buildUnitCreatePayload,
  buildProductCreatePayload, buildLocationCreatePayload, buildInventoryAdjustmentPayload,
  pushMissingEntitiesToQoyod, pushInventoryAdjustments,
} from '../qoyodEntityCreate.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('buildCustomerCreatePayload', () => {
  it('يبني حمولة صحيحة بحالة Active افتراضيًا', () => {
    const built = buildCustomerCreatePayload('عميل جديد');
    expect(built).toEqual({ ok: true, payload: { name: 'عميل جديد', status: 'Active' } });
  });
  it('يفشل بوضوح لو الاسم فارغ', () => {
    expect(buildCustomerCreatePayload('  ').ok).toBe(false);
  });
});

describe('buildCategoryCreatePayload', () => {
  it('يبني حمولة {name}', () => {
    expect(buildCategoryCreatePayload('إلكترونيات')).toEqual({ ok: true, payload: { name: 'إلكترونيات' } });
  });
  it('يفشل لو الاسم فارغ', () => {
    expect(buildCategoryCreatePayload('').ok).toBe(false);
  });
});

describe('buildUnitCreatePayload', () => {
  it('يشتق unit_representation من أول 3 أحرف', () => {
    expect(buildUnitCreatePayload('Kilogram')).toEqual({ ok: true, payload: { unit_name: 'Kilogram', unit_representation: 'Kil' } });
  });
  it('يعمل مع اسم أقصر من 3 أحرف', () => {
    expect(buildUnitCreatePayload('كغ')).toEqual({ ok: true, payload: { unit_name: 'كغ', unit_representation: 'كغ' } });
  });
  it('يفشل لو الاسم فارغ', () => {
    expect(buildUnitCreatePayload('').ok).toBe(false);
  });
});

describe('buildProductCreatePayload', () => {
  it('يبني حمولة كاملة مع فئة/وحدة/سعر/ضريبة/حساب تكلفة/حساب إيراد، وtrack_quantity/sale_item/purchase_item ثابتة', () => {
    const built = buildProductCreatePayload({ sku: 'SKU-1', name: 'منتج تجريبي', categoryId: 7, unitId: 9, sellingPrice: 100, buyingPrice: 60, taxId: 3, cogsAccountId: 12, salesAccountId: 17 });
    expect(built).toEqual({
      ok: true,
      payload: {
        sku: 'SKU-1', name: 'منتج تجريبي', track_quantity: 1, sale_item: true, purchase_item: true,
        category_id: 7, product_unit_type_id: 9, selling_price: 100, buying_price: 60, tax_id: 3, cogs_account_id: 12, sales_account_id: 17,
      },
    });
  });
  it('يسقط على sku كاسم احتياطي لو لا اسم متاح', () => {
    const built = buildProductCreatePayload({ sku: 'SKU-2' });
    expect(built.payload.name).toBe('SKU-2');
    expect(built.payload).not.toHaveProperty('category_id');
    expect(built.payload).not.toHaveProperty('product_unit_type_id');
    expect(built.payload).not.toHaveProperty('tax_id');
    expect(built.payload).not.toHaveProperty('cogs_account_id');
    expect(built.payload).not.toHaveProperty('sales_account_id');
  });
  // [إضافة، إصلاح خطأ حقيقي — راجع تعليق رأس الدالة] منشأة عميل حقيقية رفضت
  // POST /products فعليًا (422) بلا selling_price/buying_price كرقمين صريحين —
  // الآن يُرسَلان دومًا، ولو غير مُمرَّرين فـ0 لا حذفًا.
  it('selling_price/buying_price يُرسَلان دومًا كرقم (0 افتراضيًا) — لا يُحذَفان أبدًا', () => {
    const built = buildProductCreatePayload({ sku: 'SKU-3' });
    expect(built.payload.selling_price).toBe(0);
    expect(built.payload.buying_price).toBe(0);
  });
  it('يفشل لو sku فارغ', () => {
    expect(buildProductCreatePayload({ name: 'بلا كود' }).ok).toBe(false);
  });
});

describe('buildLocationCreatePayload', () => {
  it('يبني حمولة {name, account_id}', () => {
    expect(buildLocationCreatePayload({ name: 'فرع جدة', accountId: 15 })).toEqual({ ok: true, payload: { name: 'فرع جدة', account_id: 15 } });
  });
  it('account_id اختياري — يُحذَف لو غير مُمرَّر', () => {
    const built = buildLocationCreatePayload({ name: 'فرع جدة' });
    expect(built.payload).not.toHaveProperty('account_id');
  });
  it('يفشل لو الاسم فارغ', () => {
    expect(buildLocationCreatePayload({}).ok).toBe(false);
  });
});

describe('buildInventoryAdjustmentPayload', () => {
  it('يبني حمولة كاملة، actual_quantity نصًا لا رقمًا', () => {
    const built = buildInventoryAdjustmentPayload({
      inventoryId: 1, revenueAccountId: 2, expenseAccountId: 3, date: '2026-09-16',
      lineItems: [{ productId: 10, quantity: 5 }],
    });
    expect(built).toEqual({
      ok: true,
      payload: {
        inventory_adjustment: {
          inventory_id: 1, revenue_account_id: 2, expense_account_id: 3, date: '2026-09-16', status: 'Completed',
          line_items: [{ product_id: 10, actual_quantity: '5' }],
        },
      },
    });
  });
  it('يستخدم تاريخ اليوم افتراضيًا لو بلا date', () => {
    const built = buildInventoryAdjustmentPayload({ inventoryId: 1, revenueAccountId: 2, expenseAccountId: 3, lineItems: [{ productId: 1, quantity: 1 }] });
    expect(built.ok).toBe(true);
    expect(built.payload.inventory_adjustment.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('يفشل بلا inventory_id', () => {
    expect(buildInventoryAdjustmentPayload({ revenueAccountId: 2, expenseAccountId: 3, lineItems: [{ productId: 1, quantity: 1 }] }).ok).toBe(false);
  });
  it('يفشل بلا حسابي إيراد/مصروف', () => {
    expect(buildInventoryAdjustmentPayload({ inventoryId: 1, lineItems: [{ productId: 1, quantity: 1 }] }).ok).toBe(false);
  });
  it('يفشل بلا بنود', () => {
    expect(buildInventoryAdjustmentPayload({ inventoryId: 1, revenueAccountId: 2, expenseAccountId: 3, lineItems: [] }).ok).toBe(false);
  });
});

describe('pushMissingEntitiesToQoyod', () => {
  it('يرجّع fatalError واضح بلا مفتاح API، بلا أي استدعاء شبكة', async () => {
    global.fetch = vi.fn();
    const result = await pushMissingEntitiesToQoyod({ customers: [{ name: 'أحمد' }] }, '');
    expect(result.fatalError).toMatch(/مفتاح API/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('يرجّع fatalError واضح بخطة فارغة تمامًا', async () => {
    global.fetch = vi.fn();
    const result = await pushMissingEntitiesToQoyod({ customers: [], products: [], locations: [] }, 'KEY');
    expect(result.fatalError).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ينشئ عميلًا واحدًا بنجاح ويضيفه لـcreated.customers', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => JSON.stringify({ contact: { id: 55 } }) });
    const result = await pushMissingEntitiesToQoyod({ customers: [{ name: 'أحمد' }] }, 'KEY');
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.created.customers.get('أحمد')).toEqual({ id: 55, name: 'أحمد' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual({ contact: { name: 'أحمد', status: 'Active' } });
  });

  it('فشل عنصر واحد بمرحلة لا يوقف باقي عناصر نفس المرحلة (استقلال تام)', async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call++;
      if (call === 1) return { ok: false, status: 422, text: async () => 'Validation failed' };
      return { ok: true, status: 201, text: async () => JSON.stringify({ contact: { id: 2 } }) };
    });
    const result = await pushMissingEntitiesToQoyod({ customers: [{ name: 'فشل' }, { name: 'نجاح' }] }, 'KEY');
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.entries[0].status).toBe('error');
    expect(result.entries[1].status).toBe('success');
  });

  it('يُنشئ فئة/وحدة جديدتين ثم منتجًا يستخدم معرّفيهما (categoryTempId/unitTempId)', async () => {
    const bodies = [];
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      bodies.push(JSON.parse(opts.body));
      if (bodies.length === 1) return { ok: true, status: 201, text: async () => JSON.stringify({ category: { id: 100, name: 'فئة جديدة' } }) };
      if (bodies.length === 2) return { ok: true, status: 201, text: async () => JSON.stringify({ product_unit_type: { id: 200, unit_name: 'قطعة' } }) };
      return { ok: true, status: 201, text: async () => JSON.stringify({ product: { id: 300 } }) };
    });
    const plan = {
      newCategories: [{ tempId: 'cat:x', name: 'فئة جديدة' }],
      newUnits: [{ tempId: 'unit:x', name: 'قطعة' }],
      products: [{ sku: 'SKU-9', name: 'منتج تجريبي', categoryTempId: 'cat:x', unitTempId: 'unit:x' }],
    };
    const result = await pushMissingEntitiesToQoyod(plan, 'KEY');
    expect(result.sent).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.created.products.get('SKU-9')).toEqual({ id: 300, name: 'منتج تجريبي' });
    const productBody = bodies[2];
    expect(productBody.product.category_id).toBe(100);
    expect(productBody.product.product_unit_type_id).toBe(200);
  });

  it('منتج بفئة/وحدة مرجعية (tempId) فشل إنشاؤها ⇒ يُسجَّل فشلًا صريحًا ولا يُرسَل POST /products له', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'Validation failed' });
    const plan = {
      newCategories: [{ tempId: 'cat:x', name: 'فئة ستفشل' }],
      products: [{ sku: 'SKU-9', name: 'منتج', categoryTempId: 'cat:x' }],
    };
    const result = await pushMissingEntitiesToQoyod(plan, 'KEY');
    expect(result.failed).toBe(2); // فشل الفئة + فشل المنتج المعتمِد عليها
    expect(result.entries.find((e) => e.kind === 'product').reason).toMatch(/فشل إنشاء الفئة/);
    expect(global.fetch).toHaveBeenCalledTimes(1); // فقط محاولة إنشاء الفئة، لا استدعاء لـ/products
  });

  // [إضافة، إصلاح خطأ حقيقي] راجع تعليق رأس buildProductCreatePayload — selling_price
  // من بيانات بند المنتج نفسه، buying_price/cogs_account_id من افتراضيات الدفعة بـplan.
  it('يمرّر sellingPrice/taxId لكل منتج وdefaultBuyingPrice/defaultCogsAccountId/defaultSalesAccountId من الخطة لكل منتجاتها', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => JSON.stringify({ product: { id: 500 } }) });
    const plan = {
      products: [{ sku: 'SKU-P', name: 'منتج', sellingPrice: 250, taxId: 7 }],
      defaultBuyingPrice: 100,
      defaultCogsAccountId: 33,
      defaultSalesAccountId: 44,
    };
    const result = await pushMissingEntitiesToQoyod(plan, 'KEY');
    expect(result.sent).toBe(1);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.product).toMatchObject({ selling_price: 250, buying_price: 100, tax_id: 7, cogs_account_id: 33, sales_account_id: 44 });
  });

  it('يُنشئ موقعًا مع account_id المرسَل', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => JSON.stringify({ inventory: { id: 44 } }) });
    const result = await pushMissingEntitiesToQoyod({ locations: [{ name: 'فرع جدة', accountId: 5 }] }, 'KEY');
    expect(result.sent).toBe(1);
    expect(result.created.locations.get('فرع جدة')).toEqual({ id: 44, name: 'فرع جدة' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual({ name: 'فرع جدة', account_id: 5 });
  });

  it('قابل للإيقاف اليدوي عبر stoppedRef بين المراحل', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => JSON.stringify({ contact: { id: 1 } }) });
    const stoppedRef = { current: true };
    const result = await pushMissingEntitiesToQoyod({ customers: [{ name: 'أحمد' }] }, 'KEY', { stoppedRef });
    expect(result.stoppedEarly).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('pushInventoryAdjustments', () => {
  it('يرسل تعديل مخزون واحدًا بنجاح', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ inventory_adjustment: { id: 9 } }) });
    const entries = [];
    const result = await pushInventoryAdjustments(
      [{ inventoryId: 1, revenueAccountId: 2, expenseAccountId: 3, lineItems: [{ productId: 5, quantity: 4 }] }],
      'KEY',
      { onEntry: (e) => entries.push(e) },
    );
    expect(result).toMatchObject({ total: 1, sent: 1, failed: 0, stoppedEarly: false });
    expect(entries[0]).toMatchObject({ status: 'success', id: 9 });
  });

  it('يرجّع fatalError بلا مفتاح API', async () => {
    global.fetch = vi.fn();
    const result = await pushInventoryAdjustments([{ inventoryId: 1 }], '');
    expect(result.fatalError).toMatch(/مفتاح API/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('يرجّع fatalError بلا عناصر', async () => {
    const result = await pushInventoryAdjustments([], 'KEY');
    expect(result.fatalError).toBeTruthy();
  });

  it('فشل عنصر واحد لا يوقف الباقي', async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call++;
      if (call === 1) return { ok: false, status: 422, text: async () => 'Validation failed' };
      return { ok: true, status: 200, text: async () => JSON.stringify({ inventory_adjustment: { id: 2 } }) };
    });
    const items = [
      { inventoryId: 1, revenueAccountId: 2, expenseAccountId: 3, lineItems: [{ productId: 1, quantity: 1 }] },
      { inventoryId: 2, revenueAccountId: 2, expenseAccountId: 3, lineItems: [{ productId: 2, quantity: 2 }] },
    ];
    const result = await pushInventoryAdjustments(items, 'KEY');
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
  });
});
