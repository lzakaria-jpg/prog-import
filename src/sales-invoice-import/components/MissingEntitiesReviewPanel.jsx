import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../language.jsx';
import { normKey } from '../engine/text.js';
import { fetchAll, api } from '../../product-upload/io/network.js';
import { buildCategoryCreatePayload, buildUnitCreatePayload } from '../api/qoyodEntityCreate.js';
import { resolveTaxEntry } from '../api/qoyodSalesInvoicePush.js';
import SearchableSelect from './SearchableSelect.jsx';

const normLower = (s) => (s || '').trim().toLowerCase();
// [إضافة] تسمية حساب قابلة للبحث بجزء من الكود (طلب صريح: كتابة "51" تُظهر
// 5101 وكل ما تحته) — الكود بادئة النص المعروض/المبحوث عنه فعليًا بـSearchableSelect.
const accountLabel = (a) => `${a.code ? a.code + ' — ' : ''}${a.name_ar || a.name_en || ''}`;

/**
 * [إضافة] لوحة مراجعة الكيانات الناقصة (عملاء/منتجات/مواقع غير موجودين فعليًا
 * بمنشأة العميل الحقيقية عبر API) — المرحلة الأولى من مراجعة الإرسال بالخطوة 4،
 * تظهر قبل StockShortageReviewPanel (المرحلة الثانية) عند الضغط على "إرسال عبر
 * API" لو وُجد أي كيان ناقص قابل للإنشاء تلقائيًا (engine.missingEntitiesPlan).
 * نفس نمط/تصميم StockShortageReviewPanel (قوائم اختيار + تفاصيل + تأكيد/رجوع)،
 * راجع تعليق رأسه للفلسفة العامة.
 *
 * لا شيء يُنشأ فعليًا هنا إلا بعد ضغطة "تأكيد الإنشاء والمتابعة" الصريحة — باستثناء
 * الفئة/الوحدة الجديدة المُنشأة عبر زر "+ إنشاء فئة/وحدة جديدة" المخصَّص، الذي
 * يُنشئها فورًا (نفس فلسفة "الاسم يجب أن يكون جاهزًا قبل التأكيد النهائي" — قرار
 * تصميم صريح بالخطة الموافَق عليها)؛ يبقى فعلًا صريحًا بضغطة مستقلة من المستخدم،
 * لا تلقائيًا.
 *
 * onConfirm(selections): نفس بنية plan بـpushMissingEntitiesToQoyod (qoyodEntityCreate.js)
 * — الأب (ApiSendSection بـStep4Export.jsx) هو من يستدعي فعليًا engine.resolveMissingEntities
 * (نفس نمط StockShortageReviewPanel.onConfirm الذي لا يستدعي engine مباشرة أيضًا).
 */
export default function MissingEntitiesReviewPanel({ plan, apiKey, taxesIndex, onCancel, onConfirm }) {
  const { t } = useLanguage();
  const customers = plan.customers || [];
  const products = plan.products || [];
  const locations = plan.locations || [];

  const [checkedCustomers, setCheckedCustomers] = useState(() => new Set(customers.map((c) => c.typedName)));
  const [checkedProducts, setCheckedProducts] = useState(() => new Set(products.map((p) => p.typedSku)));
  const [checkedLocations, setCheckedLocations] = useState(() => new Set(locations.map((l) => l.typedName)));

  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [refsError, setRefsError] = useState('');
  const [loadingProgress, setLoadingProgress] = useState({ accounts: 0, categories: 0, units: 0 });

  const [locationAccountId, setLocationAccountId] = useState({}); // typedName -> accountId

  const [defaultCategoryName, setDefaultCategoryName] = useState('');
  const [defaultUnitName, setDefaultUnitName] = useState('');
  const [newCategoryDraft, setNewCategoryDraft] = useState('');
  const [newUnitDraft, setNewUnitDraft] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingUnit, setCreatingUnit] = useState(false);
  const [error, setError] = useState('');

  // [إضافة، إصلاح خطأ حقيقي] منشأة العميل الحقيقية ترفض POST /products بلا
  // selling_price/buying_price/tax_id/cogs_account_id فعليًا (راجع تعليق رأس
  // buildProductCreatePayload بـqoyodEntityCreate.js) رغم كونها اختيارية بمواصفة
  // Qoyod الرسمية. selling_price يأتي دومًا من سعر الوحدة الحقيقي بالفاتورة (لا
  // اختيار هنا) — الثلاثة الباقية تحتاج مدخلًا صريحًا من المستخدم لكل الدفعة.
  const [cogsAccountId, setCogsAccountId] = useState('');
  const [salesAccountId, setSalesAccountId] = useState('');
  const [buyingPriceDraft, setBuyingPriceDraft] = useState('0');
  const [defaultTaxLabel, setDefaultTaxLabel] = useState('');

  // [إضافة، توجيه محاسبي صريح من المستخدم] مخزون/غير مخزون لكل منتج على حدة
  // (لا افتراضي مشترك للدفعة — منتجات نفس الملف قد تخلط خدمات واشتراكات غير
  // مخزَّنة مع منتجات مادية مخزَّنة). افتراضيًا مخزَّن (توافقًا مع السلوك السابق).
  // راجع تعليق رأس buildProductCreatePayload بـqoyodEntityCreate.js للقاعدة الكاملة.
  const [productStocked, setProductStocked] = useState({}); // typedSku -> boolean
  const [productPurchaseItem, setProductPurchaseItem] = useState({}); // typedSku -> boolean، يُستخدَم فقط لو !stocked
  const isStocked = (sku) => productStocked[sku] !== false;
  const isPurchaseItem = (sku) => productPurchaseItem[sku] !== false;

  // [إضافة] خيارات SearchableSelect — تُبنى مرة واحدة من القوائم المجلوبة، تُعاد
  // حسابها فقط عند تغيّرها فعليًا (accounts/categories/units).
  const accountOptions = useMemo(() => accounts.map((a) => ({ value: a.id, label: accountLabel(a) })), [accounts]);
  const categoryOptions = useMemo(() => categories.map((c) => ({ value: c.name, label: c.name })), [categories]);
  const unitOptions = useMemo(() => units.map((u) => ({ value: u.unit_name, label: u.unit_name })), [units]);
  const taxOptions = useMemo(() => (taxesIndex && taxesIndex.byLabel ? Array.from(taxesIndex.byLabel.keys()).map((k) => ({ value: k, label: k })) : []), [taxesIndex]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!apiKey) return;
      setLoadingRefs(true); setRefsError(''); setLoadingProgress({ accounts: 0, categories: 0, units: 0 });
      try {
        const [accs, cats, us] = await Promise.all([
          fetchAll('/accounts', apiKey, { onPage: (n) => !cancelled && setLoadingProgress((p) => ({ ...p, accounts: n })) }),
          fetchAll('/categories', apiKey, { onPage: (n) => !cancelled && setLoadingProgress((p) => ({ ...p, categories: n })) }),
          fetchAll('/product_unit_types', apiKey, { onPage: (n) => !cancelled && setLoadingProgress((p) => ({ ...p, units: n })) }),
        ]);
        if (cancelled) return;
        setAccounts(accs || []);
        setCategories(cats || []);
        setUnits(us || []);
      } catch (e) {
        if (!cancelled) setRefsError(e.message || String(e));
      } finally {
        if (!cancelled) setLoadingRefs(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [apiKey]);

  const toggle = (setFn) => (key) => setFn((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const createCategoryNow = async () => {
    const built = buildCategoryCreatePayload(newCategoryDraft);
    if (!built.ok) { setError(built.error); return; }
    setCreatingCategory(true); setError('');
    try {
      const res = await api('POST', '/categories', { category: built.payload }, apiKey);
      if (res && res.category && res.category.id != null) {
        setCategories((prev) => [...prev, res.category]);
        setDefaultCategoryName(res.category.name || built.payload.name);
        setNewCategoryDraft('');
      } else {
        setError(t({ ar: 'تعذّر إنشاء الفئة — رد غير متوقع من قيود.', en: 'Could not create the category — unexpected response from Qoyod.' }));
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setCreatingCategory(false);
    }
  };

  const createUnitNow = async () => {
    const built = buildUnitCreatePayload(newUnitDraft);
    if (!built.ok) { setError(built.error); return; }
    setCreatingUnit(true); setError('');
    try {
      const res = await api('POST', '/product_unit_types', { product_unit_type: built.payload }, apiKey);
      if (res && res.product_unit_type && res.product_unit_type.id != null) {
        setUnits((prev) => [...prev, res.product_unit_type]);
        setDefaultUnitName(res.product_unit_type.unit_name || built.payload.unit_name);
        setNewUnitDraft('');
      } else {
        setError(t({ ar: 'تعذّر إنشاء الوحدة — رد غير متوقع من قيود.', en: 'Could not create the unit — unexpected response from Qoyod.' }));
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setCreatingUnit(false);
    }
  };

  // اسم الفئة/الوحدة الفعّال لمنتج معيّن: من الملف أولًا، وإلا الافتراضي المشترك للدفعة.
  const effectiveCategoryName = (p) => p.categoryFromFile || defaultCategoryName || '';
  const effectiveUnitName = (p) => p.unitFromFile || defaultUnitName || '';

  const findCategoryId = (name) => { const m = categories.find((c) => normLower(c.name) === normLower(name)); return m ? m.id : null; };
  const findUnitId = (name) => { const m = units.find((u) => normLower(u.unit_name) === normLower(name)); return m ? m.id : null; };

  const hasRealTaxes = !!(taxesIndex && taxesIndex.byLabel && taxesIndex.byLabel.size > 0);
  // فئة الضريبة الفعّالة لمنتج معيّن: من الملف أولًا (نفس فئة بند الفاتورة الحقيقي
  // — resolveTaxEntry نفسها المستخدمة عند إرسال الفواتير)، وإلا الافتراضي المشترك
  // للدفعة. ترجع {id, rate} أو null لو تعذّرت المطابقة كليًا.
  const effectiveTaxEntry = (p) => {
    if (!hasRealTaxes) return null;
    if (p.taxLabelFromFile) {
      const m = resolveTaxEntry(p.taxLabelFromFile, taxesIndex);
      if (m) return m;
    }
    if (defaultTaxLabel) return resolveTaxEntry(defaultTaxLabel, taxesIndex) || null;
    return null;
  };

  const selectedProducts = useMemo(() => products.filter((p) => checkedProducts.has(p.typedSku)), [products, checkedProducts]);

  // الفئات/الوحدات المطلوبة لكن غير موجودة فعليًا بقيود بعد — ستُنشأ تلقائيًا عند التأكيد.
  const categoriesToCreate = useMemo(() => {
    const names = new Map();
    selectedProducts.forEach((p) => {
      const name = effectiveCategoryName(p);
      if (name && !findCategoryId(name)) names.set(normKey(name), name);
    });
    return Array.from(names.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProducts, categories, defaultCategoryName]);

  const unitsToCreate = useMemo(() => {
    const names = new Map();
    selectedProducts.forEach((p) => {
      const name = effectiveUnitName(p);
      if (name && !findUnitId(name)) names.set(normKey(name), name);
    });
    return Array.from(names.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProducts, units, defaultUnitName]);

  const handleConfirm = () => {
    setError('');
    const missingAccount = locations.some((l) => checkedLocations.has(l.typedName) && !locationAccountId[l.typedName]);
    if (missingAccount) {
      setError(t({ ar: 'اختر حساب مخزون/أصول لكل موقع جديد محدَّد قبل المتابعة.', en: 'Choose an inventory/asset account for every selected new location before continuing.' }));
      return;
    }
    // [إضافة، إصلاح خطأ حقيقي] منشأة العميل الحقيقية ترفض إنشاء منتج بلا cogs_account_id
    // وبلا tax_id مطابق فعليًا — راجع تعليق رأس buildProductCreatePayload. نتحقق هنا
    // قبل أي طلب فعلي بدل محاولة إنشاء دفعة كاملة مصيرها الفشل صامتًا.
    if (selectedProducts.length > 0 && !cogsAccountId) {
      setError(t({ ar: 'اختر حساب تكلفة المبيعات (COGS) الافتراضي للمنتجات الجديدة قبل المتابعة.', en: 'Choose a default cost-of-sales (COGS) account for the new products before continuing.' }));
      return;
    }
    // [إضافة، إصلاح خطأ حقيقي] اختبار حي ثانٍ (بعد إصلاح COGS/الضريبة/السعر أعلاه)
    // كشف رفض Qoyod الفعلي أيضًا بلا sales_account_id — نفس فلسفة COGS بالضبط.
    if (selectedProducts.length > 0 && !salesAccountId) {
      setError(t({ ar: 'اختر حساب الإيراد الافتراضي للمنتجات الجديدة قبل المتابعة.', en: 'Choose a default revenue account for the new products before continuing.' }));
      return;
    }
    if (hasRealTaxes) {
      const missingTax = selectedProducts.some((p) => !effectiveTaxEntry(p));
      if (missingTax) {
        setError(t({ ar: 'بعض المنتجات بلا فئة ضريبية مطابقة من الملف — اختر فئة ضريبية افتراضية للدفعة قبل المتابعة.', en: 'Some products have no matching tax category from the file — choose a default tax category for the batch before continuing.' }));
        return;
      }
    }

    const newCategories = categoriesToCreate.map((name) => ({ tempId: 'cat:' + normKey(name), name }));
    const newUnits = unitsToCreate.map((name) => ({ tempId: 'unit:' + normKey(name), name }));

    const productsSel = selectedProducts.map((p) => {
      const entry = { sku: p.typedSku, name: p.typedName };
      const catName = effectiveCategoryName(p);
      if (catName) {
        const existingId = findCategoryId(catName);
        if (existingId) entry.categoryId = existingId; else entry.categoryTempId = 'cat:' + normKey(catName);
      }
      const unitName = effectiveUnitName(p);
      if (unitName) {
        const existingId = findUnitId(unitName);
        if (existingId) entry.unitId = existingId; else entry.unitTempId = 'unit:' + normKey(unitName);
      }
      entry.sellingPrice = typeof p.sellingPriceFromFile === 'number' ? p.sellingPriceFromFile : 0;
      const taxEntry = effectiveTaxEntry(p);
      if (taxEntry) entry.taxId = taxEntry.id;
      entry.stocked = isStocked(p.typedSku);
      if (!entry.stocked) entry.purchaseItem = isPurchaseItem(p.typedSku);
      return entry;
    });

    const selections = {
      customers: customers.filter((c) => checkedCustomers.has(c.typedName)).map((c) => ({ name: c.typedName })),
      newCategories,
      newUnits,
      products: productsSel,
      locations: locations.filter((l) => checkedLocations.has(l.typedName)).map((l) => ({ name: l.typedName, accountId: locationAccountId[l.typedName] })),
      defaultBuyingPrice: parseFloat(buyingPriceDraft) || 0,
      defaultCogsAccountId: cogsAccountId || undefined,
      defaultSalesAccountId: salesAccountId || undefined,
    };
    onConfirm(selections);
  };

  const nothingChecked = checkedCustomers.size === 0 && checkedProducts.size === 0 && checkedLocations.size === 0;

  return (
    <div className="qsv-modal-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="qsv-modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>🧩 {t({
          ar: `${customers.length + products.length + locations.length} كيان ناقص يمكن إنشاؤه تلقائيًا بمنشأة العميل`,
          en: `${customers.length + products.length + locations.length} missing entity(ies) can be auto-created on the client's company`,
        })}</h3>
        <p className="qsv-hint">
          {t({
            ar: 'راجع القوائم أدناه بعناية — لن يُنشأ أي عميل/منتج/موقع فعليًا بمنشأة العميل الحقيقية إلا بعد ضغطك "تأكيد الإنشاء والمتابعة".',
            en: 'Review the lists below carefully — nothing is actually created on the client\'s real company until you click "Confirm creation & continue".',
          })}
        </p>

        {loadingRefs && (
          <p className="qsv-hint">
            ⏳ {t({ ar: 'جارٍ جلب دليل الحسابات/الفئات/الوحدات...', en: 'Fetching accounts/categories/units...' })}
            {' '}({t({ ar: `حسابات: ${loadingProgress.accounts}`, en: `accounts: ${loadingProgress.accounts}` })}
            {', '}{t({ ar: `فئات: ${loadingProgress.categories}`, en: `categories: ${loadingProgress.categories}` })}
            {', '}{t({ ar: `وحدات: ${loadingProgress.units}`, en: `units: ${loadingProgress.units}` })})
            {loadingProgress.accounts >= 100 && (
              <> — {t({ ar: 'دليل الحسابات كبير، قد يستغرق الجلب وقتًا أطول من المعتاد.', en: 'Large chart of accounts — this may take longer than usual.' })}</>
            )}
          </p>
        )}
        {refsError && <div className="qsv-note-box err">{refsError}</div>}

        <div className="qsv-modal-scroll">
          {customers.length > 0 && (
            <>
              <h4>👤 {t({ ar: `عملاء غير موجودين (${customers.length})`, en: `Missing customers (${customers.length})` })}</h4>
              <table className="qsv-send-table">
                <thead><tr><th style={{ width: 32 }}></th><th>{t({ ar: 'اسم العميل كما كُتب بالملف', en: 'Customer name as written in the file' })}</th><th>{t({ ar: 'عدد الأسطر', en: 'Row count' })}</th></tr></thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.typedName}>
                      <td><input type="checkbox" checked={checkedCustomers.has(c.typedName)} onChange={() => toggle(setCheckedCustomers)(c.typedName)} /></td>
                      <td>{c.typedName}</td>
                      <td>{c.rowIds.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {products.length > 0 && (
            <>
              <h4 style={{ marginTop: 18 }}>📦 {t({ ar: `منتجات غير موجودة (${products.length})`, en: `Missing products (${products.length})` })}</h4>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '8px 0 12px' }}>
                <div style={{ flex: '1 1 240px' }}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--qsv-muted)' }}>{t({ ar: 'الفئة الافتراضية للدفعة (لمنتجات بلا فئة بالملف)', en: 'Default category for the batch (products with no file category)' })}</label>
                  <SearchableSelect options={categoryOptions} value={defaultCategoryName} onChange={setDefaultCategoryName} placeholder={t({ ar: '— بلا فئة —', en: '— no category —' })} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <input type="text" placeholder={t({ ar: 'اسم فئة جديدة...', en: 'New category name...' })} value={newCategoryDraft} onChange={(e) => setNewCategoryDraft(e.target.value)} />
                    <button type="button" className="qsv-btn secondary" disabled={!newCategoryDraft.trim() || creatingCategory} onClick={createCategoryNow}>
                      {creatingCategory ? '⏳' : `+ ${t({ ar: 'إنشاء فئة جديدة', en: 'Create new category' })}`}
                    </button>
                  </div>
                </div>
                <div style={{ flex: '1 1 240px' }}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--qsv-muted)' }}>{t({ ar: 'الوحدة الافتراضية للدفعة (لمنتجات بلا وحدة بالملف)', en: 'Default unit for the batch (products with no file unit)' })}</label>
                  <SearchableSelect options={unitOptions} value={defaultUnitName} onChange={setDefaultUnitName} placeholder={t({ ar: '— بلا وحدة —', en: '— no unit —' })} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <input type="text" placeholder={t({ ar: 'اسم وحدة جديدة...', en: 'New unit name...' })} value={newUnitDraft} onChange={(e) => setNewUnitDraft(e.target.value)} />
                    <button type="button" className="qsv-btn secondary" disabled={!newUnitDraft.trim() || creatingUnit} onClick={createUnitNow}>
                      {creatingUnit ? '⏳' : `+ ${t({ ar: 'إنشاء وحدة جديدة', en: 'Create new unit' })}`}
                    </button>
                  </div>
                </div>
                <div style={{ flex: '1 1 240px' }}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--qsv-muted)' }}>{t({ ar: 'حساب تكلفة المبيعات (COGS) الافتراضي — إلزامي *', en: 'Default cost-of-sales (COGS) account — required *' })}</label>
                  <SearchableSelect options={accountOptions} value={cogsAccountId} onChange={setCogsAccountId} placeholder={t({ ar: 'اكتب كود أو اسم الحساب...', en: 'Type account code or name...' })} />
                </div>
                <div style={{ flex: '1 1 240px' }}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--qsv-muted)' }}>{t({ ar: 'حساب الإيراد الافتراضي — إلزامي *', en: 'Default revenue account — required *' })}</label>
                  <SearchableSelect options={accountOptions} value={salesAccountId} onChange={setSalesAccountId} placeholder={t({ ar: 'اكتب كود أو اسم الحساب...', en: 'Type account code or name...' })} />
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--qsv-muted)' }}>{t({ ar: 'سعر التكلفة الافتراضي (buying price)', en: 'Default cost price (buying price)' })}</label>
                  <input type="number" step="0.01" value={buyingPriceDraft} onChange={(e) => setBuyingPriceDraft(e.target.value)} />
                  <p className="qsv-hint" style={{ margin: '4px 0 0' }}>{t({ ar: 'فاتورة المبيعات لا تحمل تكلفة شراء — 0 افتراضيًا، عدّله لاحقًا بقيود لو لزم.', en: 'A sales invoice carries no cost data — defaults to 0, adjust later in Qoyod if needed.' })}</p>
                </div>
                {hasRealTaxes && (
                  <div style={{ flex: '1 1 220px' }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--qsv-muted)' }}>{t({ ar: 'الفئة الضريبية الافتراضية (لمنتجات بلا فئة مطابقة بالملف)', en: 'Default tax category (products with no matching file tax)' })}</label>
                    <SearchableSelect options={taxOptions} value={defaultTaxLabel} onChange={setDefaultTaxLabel} placeholder={t({ ar: '— اختر فئة ضريبية —', en: '— choose a tax category —' })} />
                  </div>
                )}
              </div>
              <table className="qsv-send-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>{t({ ar: 'كود المنتج', en: 'SKU' })}</th>
                    <th>{t({ ar: 'الاسم', en: 'Name' })}</th>
                    <th>{t({ ar: 'الفئة', en: 'Category' })}</th>
                    <th>{t({ ar: 'الوحدة', en: 'Unit' })}</th>
                    <th>{t({ ar: 'سعر البيع', en: 'Selling price' })}</th>
                    {hasRealTaxes && <th>{t({ ar: 'الضريبة', en: 'Tax' })}</th>}
                    <th>{t({ ar: 'مخزون؟', en: 'Stocked?' })}</th>
                    <th>{t({ ar: 'يُشترى أيضًا؟', en: 'Also purchasable?' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const catName = effectiveCategoryName(p);
                    const unitName = effectiveUnitName(p);
                    const taxEntry = effectiveTaxEntry(p);
                    const stocked = isStocked(p.typedSku);
                    return (
                      <tr key={p.typedSku}>
                        <td><input type="checkbox" checked={checkedProducts.has(p.typedSku)} onChange={() => toggle(setCheckedProducts)(p.typedSku)} /></td>
                        <td style={{ fontFamily: 'monospace' }}>{p.typedSku}</td>
                        <td>{p.typedName}</td>
                        <td>{catName ? `${p.categoryFromFile ? t({ ar: 'من الملف', en: 'From file' }) : t({ ar: 'الافتراضي', en: 'Default' })}: ${catName}` : t({ ar: '— بلا فئة —', en: '— none —' })}</td>
                        <td>{unitName ? `${p.unitFromFile ? t({ ar: 'من الملف', en: 'From file' }) : t({ ar: 'الافتراضي', en: 'Default' })}: ${unitName}` : t({ ar: '— بلا وحدة —', en: '— none —' })}</td>
                        <td>{typeof p.sellingPriceFromFile === 'number' ? p.sellingPriceFromFile : 0}</td>
                        {hasRealTaxes && (
                          <td style={{ color: taxEntry ? undefined : 'var(--qsv-err)' }}>
                            {taxEntry ? `${p.taxLabelFromFile ? t({ ar: 'من الملف', en: 'From file' }) : t({ ar: 'الافتراضي', en: 'Default' })}: ${taxEntry.rate}%` : t({ ar: '⚠️ بلا مطابقة', en: '⚠️ no match' })}
                          </td>
                        )}
                        <td>
                          <input
                            type="checkbox"
                            checked={stocked}
                            onChange={(e) => setProductStocked((prev) => ({ ...prev, [p.typedSku]: e.target.checked }))}
                            title={t({ ar: 'مخزَّن ⇒ يشترى إجباريًا ويحتاج تغذية مخزون افتتاحي عند الحاجة', en: 'Stocked ⇒ purchasable is mandatory, may need opening stock top-up' })}
                          />
                        </td>
                        <td>
                          {stocked
                            ? <span className="qsv-hint">{t({ ar: 'إجباري (مخزَّن)', en: 'Mandatory (stocked)' })}</span>
                            : (
                              <input
                                type="checkbox"
                                checked={isPurchaseItem(p.typedSku)}
                                onChange={(e) => setProductPurchaseItem((prev) => ({ ...prev, [p.typedSku]: e.target.checked }))}
                              />
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(categoriesToCreate.length > 0 || unitsToCreate.length > 0) && (
                <p className="qsv-hint" style={{ marginTop: 8 }}>
                  {categoriesToCreate.length > 0 && t({ ar: `سيتم إنشاء الفئات الجديدة: ${categoriesToCreate.join('، ')}. `, en: `New categories to be created: ${categoriesToCreate.join(', ')}. ` })}
                  {unitsToCreate.length > 0 && t({ ar: `سيتم إنشاء الوحدات الجديدة: ${unitsToCreate.join('، ')}.`, en: `New units to be created: ${unitsToCreate.join(', ')}.` })}
                </p>
              )}
            </>
          )}

          {locations.length > 0 && (
            <>
              <h4 style={{ marginTop: 18 }}>📍 {t({ ar: `مواقع غير موجودة (${locations.length})`, en: `Missing locations (${locations.length})` })}</h4>
              <p className="qsv-hint">
                {t({
                  ar: '⚠️ قيود يفرض أن يكون هذا حساب مخزون حقيقي من تصنيف "مخزون" (Inventory) تحديدًا بشجرة الحسابات — لا أي حساب أصول آخر (نقدية، بنك، مدينون...)، وإلا يُرفَض الإنشاء برسالة "Please Select The Inventory Asset Account".',
                  en: '⚠️ Qoyod requires this to be a real account specifically classified as "Inventory" in the chart of accounts — not any other asset account (cash, bank, receivables...), otherwise creation is rejected with "Please Select The Inventory Asset Account".',
                })}
              </p>
              <table className="qsv-send-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>{t({ ar: 'اسم الموقع', en: 'Location name' })}</th>
                    <th>{t({ ar: 'حساب المخزون (Inventory) المرتبط', en: 'Linked Inventory-classified account' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((l) => (
                    <tr key={l.typedName}>
                      <td><input type="checkbox" checked={checkedLocations.has(l.typedName)} onChange={() => toggle(setCheckedLocations)(l.typedName)} /></td>
                      <td>{l.typedName}</td>
                      <td>
                        <SearchableSelect
                          options={accountOptions}
                          value={locationAccountId[l.typedName] || ''}
                          onChange={(v) => setLocationAccountId((prev) => ({ ...prev, [l.typedName]: v || undefined }))}
                          placeholder={t({ ar: 'اكتب كود أو اسم الحساب...', en: 'Type account code or name...' })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {error && <div className="qsv-note-box err" style={{ marginTop: 12 }}>{error}</div>}

        <div className="qsv-modal-actions" style={{ marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="qsv-btn ghost" onClick={onCancel}>{t({ ar: 'رجوع', en: 'Back' })}</button>
          <button type="button" className="qsv-btn" disabled={nothingChecked} onClick={handleConfirm}>
            ✅ {t({ ar: 'تأكيد الإنشاء والمتابعة', en: 'Confirm creation & continue' })}
          </button>
        </div>
      </div>
    </div>
  );
}
