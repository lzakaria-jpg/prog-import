/*
 ============================================================================
  useProductUploadEngine — الهوك المركزي لأداة رفع المنتجات إلى قيود
  المصدر: qoyod_uploader.html الأصلي (طبقة الواجهة ui.js من توثيق opencode)
  ============================================================================
  كل الحالة والمنطق هنا منقولان حرفياً من startUpload/handleFile/saveKey/...
  الأصلية، فقط أُعيد تغليفهما بـReact state/refs بدل document.getElementById
  المباشر، ونوافذ alert()/confirm() المتصفح استُبدلت برسائل/نافذة تأكيد داخل
  هوية الموقع (uploadAlert + ConfirmDialog) — تماماً كما فعلت أداة استيراد
  فواتير المبيعات مع نفس النوافذ الأصلية.
  [تحديث 2026-09-08] كل رسائل السجل/التنبيه (كانت نصوصاً إنجليزية أو عربية
  ثابتة بصرف النظر عن لغة التطبيق) أصبحت الآن ثنائية اللغة عبر t({ar,en})
  من useLanguage — بعد ملاحظة المستخدم إن تبديل اللغة ما كان يشمل هذه الأداة.
 ============================================================================
*/
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../language.jsx";
import {
  findHeaderRowIndex, detectColumnsWithFallback, rowsToProducts, MAPPABLE_FIELDS,
  buildProductPayload, chooseTax, resolveAccountId,
  parseSellingPriceNumber, parseQuantityNumber, buildOpeningBalanceRows, resolveExistingProductAction,
} from "./engine/parsing.js";
import { isRevenueAccount, isExpenseAccount, isExpenseOrNonCurrentAssetAccount, filterAccountsWithFallback } from "./engine/accountFilters.js";
import { api, fetchAll, fetchAllByCursor } from "./io/network.js";
import { getSavedKeys, saveKeysToStorage } from "./io/keyStorage.js";
import { readWorkbookRows } from "./io/excelReader.js";
import { buildOpeningBalanceWorkbook, workbookToBlob, downloadBlob } from "./io/openingBalanceExport.js";

const DEFAULT_REVENUE_ACCT = "4101";
const DEFAULT_EXPENSE_ACCT = "5101";
const DEFAULT_LOCATION = "المركز الرئيسي";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function useProductUploadEngine() {
  const { t } = useLanguage();

  // ---- API key management (أصل: سطر 408-463) ----
  const [apiKey, setApiKey] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [savedKeys, setSavedKeys] = useState(() => getSavedKeys());
  const [removeKeyTarget, setRemoveKeyTarget] = useState(null); // اسم العميل المطلوب حذف مفتاحه (لتأكيد الحذف)

  const toggleKeyVisibility = useCallback(() => setKeyVisible((v) => !v), []);

  const saveKey = useCallback(() => {
    const key = apiKey.trim();
    const name = customerName.trim();
    if (!key) return t({ ar: "أدخل مفتاح API", en: "Enter API key" });
    if (!name) return t({ ar: "أدخل اسم العميل", en: "Enter customer name" });
    const keys = { ...getSavedKeys(), [name]: key };
    saveKeysToStorage(keys);
    setSavedKeys(keys);
    setCustomerName("");
    return null;
  }, [apiKey, customerName, t]);

  const loadKey = useCallback((name) => {
    const keys = getSavedKeys();
    if (keys[name]) setApiKey(keys[name]);
  }, []);

  const requestRemoveKey = useCallback((name) => setRemoveKeyTarget(name), []);
  const cancelRemoveKey = useCallback(() => setRemoveKeyTarget(null), []);
  const confirmRemoveKey = useCallback(() => {
    if (!removeKeyTarget) return;
    const keys = getSavedKeys();
    delete keys[removeKeyTarget];
    saveKeysToStorage(keys);
    setSavedKeys(keys);
    setRemoveKeyTarget(null);
  }, [removeKeyTarget]);

  // ---- Excel file (أصل: سطر 293-354) ----
  // [إعادة تصميم 2026-09-19، طلب صريح من المستخدم] كان يُحوَّل الملف مباشرة
  // لمصفوفة منتجات نهائية (buildProductsFromRows) بلا أي فرصة للمستخدم لمراجعة/
  // تصحيح خريطة الأعمدة المُكتشَفة تلقائياً — فأي عمود بعنوان غير متوقَّع (مثال
  // حقيقي: "مخزون" لم يكن يُطابَق إطلاقاً، راجع تعليق detectColumns) كان يفشل
  // بصمت بلا أي وسيلة للمستخدم لتصحيحه سوى تعديل الملف نفسه. الآن: الصفوف
  // الخام (rawRows) وصف الترويسة (headerRowIndex) وخريطة الأعمدة القابلة
  // للتعديل (colsMap) تُحفَظ بمعزل، وexcelData النهائية تُشتَق تفاعلياً منها
  // (rowsToProducts) — فتعديل المستخدم لأي عمود بشريط "مطابقة الأعمدة" الجديد
  // (ColumnMappingCard) يُعيد بناء excelData فوراً بلا إعادة رفع الملف.
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState([]);
  const [headerRowIndex, setHeaderRowIndex] = useState(-1);
  const [colsMap, setColsMap] = useState(null);
  // [إضافة 2026-09-19] تجاوزات حساب الإيراد/المصروف لكل صف على حدة (بالفهرس)
  // — تُطبَّق فوق excelData المُشتقَّة من الملف، وتُستهلَك عبر نفس آلية
  // resolveAccountId الحالية بلا أي تغيير بها (القيمة المخزَّنة هنا هي كود
  // الحساب المختار من دليل حسابات العميل الحقيقي، فتُطابَق بالكود دائماً).
  const [rowOverrides, setRowOverrides] = useState({});
  const [uploadAlert, setUploadAlert] = useState(null); // بديل alert() — نفس النص الحرفي

  const dismissAlert = useCallback(() => setUploadAlert(null), []);

  const baseExcelData = useMemo(() => (
    headerRowIndex >= 0 && colsMap ? rowsToProducts(rawRows, headerRowIndex, colsMap) : []
  ), [rawRows, headerRowIndex, colsMap]);

  const excelData = useMemo(() => (
    Object.keys(rowOverrides).length
      ? baseExcelData.map((p, i) => (rowOverrides[i] ? { ...p, ...rowOverrides[i] } : p))
      : baseExcelData
  ), [baseExcelData, rowOverrides]);

  // ---- بيانات منشأة العميل المرجعية (حسابات/ضرائب/وحدات/فئات) — تُجلَب قبل الرفع ----
  // [إضافة 2026-09-19، وسِّعت 2026-09-20 طلبًا صريحًا من المستخدم: "جلب البيانات
  // قبل بدء الرفع لتحديد حساب الإيراد والمصروف والضرائب والوحدات"] كانت تُجلَب
  // الحسابات فقط هنا (لقوائم اختيار حساب كل منتج بالمعاينة)، وstartUpload كان
  // يُعيد جلب الأربعة (حسابات/ضرائب/وحدات/فئات) من الصفر دائمًا عند الضغط على
  // "بدء الرفع" — تكرار شبكي كامل يؤخّر بداية الرفع الفعلي لعميل بآلاف
  // المنتجات بلا أي داعٍ. الآن تُجلَب الأربعة معًا مسبقًا (Promise.all — متوازيًا
  // لا متتاليًا، أسرع من الأصل حتى لو أُعيد الجلب لاحقًا)، وstartUpload يعيد
  // استخدامها مباشرة طالما لم يتغيّر مفتاح API منذ آخر جلب (referenceDataForKeyRef)
  // — فبداية الرفع الفعلي (إنشاء أول منتج) تصير فورية بلا أي انتظار جلب.
  // تغيّر المفتاح بلا إعادة جلب يدوي يعني عودة تلقائية لجلب startUpload الخاص
  // بها (المسار الاحتياطي بالأسفل) — بلا أي خطر استخدام بيانات منشأة عميل خطأ.
  const [previewAccounts, setPreviewAccounts] = useState([]);
  const [previewTaxes, setPreviewTaxes] = useState([]);
  const [previewUnits, setPreviewUnits] = useState([]);
  const [previewCategories, setPreviewCategories] = useState([]);
  const [referenceDataLoading, setReferenceDataLoading] = useState(false);
  const [referenceDataError, setReferenceDataError] = useState(null);
  const referenceDataForKeyRef = useRef(null);

  const fetchReferenceData = useCallback(async (keyOverride) => {
    const key = (keyOverride ?? apiKey).trim();
    if (!key) return;
    setReferenceDataLoading(true);
    setReferenceDataError(null);
    try {
      const [accounts, taxes, units, categories] = await Promise.all([
        fetchAllByCursor("/accounts", key),
        fetchAll("/taxes", key),
        fetchAll("/product_unit_types", key),
        fetchAll("/categories", key),
      ]);
      setPreviewAccounts(accounts);
      setPreviewTaxes(taxes);
      setPreviewUnits(units);
      setPreviewCategories(categories);
      referenceDataForKeyRef.current = key;
    } catch (e) {
      setReferenceDataError(e.message);
      referenceDataForKeyRef.current = null;
    } finally {
      setReferenceDataLoading(false);
    }
  }, [apiKey]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setFileName(file.name);
    setRowOverrides({});
    try {
      const rows = await readWorkbookRows(file);
      const headerIdx = findHeaderRowIndex(rows);
      if (headerIdx === -1) {
        setUploadAlert(t({ ar: "تعذر العثور على صف العناوين في ملف Excel.", en: "Could not find a header row in the Excel file." }));
        setRawRows([]); setHeaderRowIndex(-1); setColsMap(null);
        return;
      }
      setRawRows(rows);
      setHeaderRowIndex(headerIdx);
      setColsMap(detectColumnsWithFallback(rows[headerIdx]));
      setUploadAlert(null);
      // [إضافة 2026-09-19] جلب بيانات المنشأة المرجعية تلقائياً لو مفتاح API
      // مُدخَل فعلاً وقت رفع الملف — لو أُدخِل لاحقاً، زر التحديث اليدوي
      // بشاشة المعاينة هو الوسيلة (لا جلب صامت متكرر عند كل ضغطة مفتاح).
      if (apiKey.trim()) fetchReferenceData();
    } catch (err) {
      setUploadAlert(t({ ar: "خطأ في قراءة ملف Excel: ", en: "Error reading Excel: " }) + err.message);
    }
  }, [t, apiKey, fetchReferenceData]);

  // [إضافة 2026-09-19] تعديل يدوي على خريطة الأعمدة من شريط المطابقة: تعيين
  // عمود خام (colIndex) لحقل منطقي (fieldKey)، مع إلغاء أي تعيين سابق لنفس
  // العمود الخام من أي حقل آخر (عمود واحد لا يمكن أن يمثّل حقلين معاً).
  const assignColumn = useCallback((fieldKey, colIndex) => {
    setColsMap((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (next[k] === colIndex) next[k] = -1; });
      next[fieldKey] = colIndex;
      return next;
    });
  }, []);

  const ignoreColumn = useCallback((colIndex) => {
    setColsMap((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (next[k] === colIndex) next[k] = -1; });
      return next;
    });
  }, []);

  // [إضافة 2026-09-19] تجاوز حساب الإيراد/المصروف لصف واحد (بالفهرس) — code
  // فارغ يُلغي التجاوز (يرجع للقيمة المشتقَّة من الملف/الافتراضي). القيمة
  // المخزَّنة هي كود الحساب (وليس اسمه) كي تُطابَق دائماً بـresolveAccountId
  // (accountsByCode أولاً) بصرف النظر عمّا كتبه العميل بملفه الأصلي لهذا الصف.
  const setRowAccountOverride = useCallback((rowIndex, field, code) => {
    setRowOverrides((prev) => {
      const cur = { ...(prev[rowIndex] || {}) };
      if (code) cur[field] = code; else delete cur[field];
      const next = { ...prev };
      if (Object.keys(cur).length) next[rowIndex] = cur; else delete next[rowIndex];
      return next;
    });
  }, []);

  const mappingHeaders = headerRowIndex >= 0 ? (rawRows[headerRowIndex] || []) : [];
  const mappingPreviewRows = headerRowIndex >= 0 ? rawRows.slice(headerRowIndex + 1, headerRowIndex + 7) : [];

  const revenueAccountOptions = useMemo(() => previewAccounts.filter(isRevenueAccount), [previewAccounts]);
  const expenseAccountOptions = useMemo(
    () => filterAccountsWithFallback(previewAccounts, isExpenseOrNonCurrentAssetAccount, isExpenseAccount),
    [previewAccounts]
  );
  const previewAccountsByCode = useMemo(() => {
    const m = {};
    previewAccounts.forEach((a) => { const c = String(a.code || "").trim(); if (c) m[c] = a; });
    return m;
  }, [previewAccounts]);

  // ---- Settings (أصل: revenueAcct/expenseAcct/taxToggle/dupToggle) ----
  const [revenueAcct, setRevenueAcct] = useState(DEFAULT_REVENUE_ACCT);
  const [expenseAcct, setExpenseAcct] = useState(DEFAULT_EXPENSE_ACCT);
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [skipDups, setSkipDups] = useState(true);
  const toggleTaxInclusive = useCallback(() => setTaxInclusive((v) => !v), []);
  const toggleSkipDups = useCallback(() => setSkipDups((v) => !v), []);
  // [إضافة 2026-09-07] تحديث المنتجات الموجودة بدل تخطيها — إعداد جديد منفصل،
  // افتراضياً false (السلوك الحالي "تخطي فقط" يبقى كما هو تماماً بلا تفعيله).
  // مطابقة بالرمز (sku) فقط — قرار صريح من المستخدم، راجع resolveExistingProductAction.
  const [updateExisting, setUpdateExisting] = useState(false);
  const toggleUpdateExisting = useCallback(() => setUpdateExisting((v) => !v), []);
  // [إضافة 2026-09-07] إعدادا الرصيد الافتتاحي — يُضبطان داخل الأداة (وليس من
  // ملف العميل) كما طلب المستخدم صراحةً: تاريخ واحد للدفعة كاملة، وموقع افتراضي
  // لأي منتج بلا عمود "الموقع" بملفه.
  const [openingBalanceDate, setOpeningBalanceDate] = useState(() => todayIso());
  const [defaultLocation, setDefaultLocation] = useState(DEFAULT_LOCATION);

  // [إضافة 2026-09-19] الحساب الافتراضي الفعلي (المطابَق فعلياً بدليل حسابات
  // العميل الحقيقي، لو أُتيحت previewAccounts) — لعرضه بالمعاينة بدل نص ثابت
  // "افتراضي 4101/5101"، بلا أي تغيير على منطق الرفع الفعلي نفسه (startUpload
  // أسفله يحسب defaultRev/defaultExp من جلبه الخاص وقت الإرسال، كما كان تماماً).
  const defaultRevenueAccount = useMemo(
    () => previewAccountsByCode[(revenueAcct || "").trim() || DEFAULT_REVENUE_ACCT] || null,
    [previewAccountsByCode, revenueAcct]
  );
  const defaultExpenseAccount = useMemo(
    () => previewAccountsByCode[(expenseAcct || "").trim() || DEFAULT_EXPENSE_ACCT] || null,
    [previewAccountsByCode, expenseAcct]
  );

  // ---- Upload run state (أصل: سطر 242-250 و520-773) ----
  const [log, setLog] = useState([]);
  // [إضافة 2026-09-07] عدّاد "updated" جديد — منتجات حُدِّثت (PUT) لا أُنشئت.
  const [stats, setStats] = useState({ total: 0, uploaded: 0, updated: 0, skipped: 0, errors: 0 });
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [uploading, setUploading] = useState(false);
  const [showProgressCard, setShowProgressCard] = useState(false);
  const stoppedRef = useRef(false);

  const appendLog = useCallback((msg, cls = "info") => {
    setLog((prev) => [...prev, { msg, cls }]);
  }, []);

  const stopUpload = useCallback(() => {
    stoppedRef.current = true;
  }, []);

  const startUpload = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) { setUploadAlert(t({ ar: "أدخل مفتاح API", en: "Enter API key" })); return; }
    if (!excelData.length) { setUploadAlert(t({ ar: "ارفع ملف Excel أولاً", en: "Upload an Excel file first" })); return; }

    stoppedRef.current = false;
    setLog([]);
    setShowProgressCard(true);
    setUploading(true);
    let uploaded = 0, updatedCount = 0, skipped = 0, errors = 0;
    setStats({ total: excelData.length, uploaded: 0, updated: 0, skipped: 0, errors: 0 });
    setProgress({ current: 0, total: excelData.length });

    const unitsCache = {};
    const accountsByName = {};
    const accountsByCode = {};
    const categoriesCache = {};
    let selectedTaxId = null;
    const existingProducts = { skus: new Set(), names: new Set() };
    // [إضافة 2026-09-07] فهرس رمز (sku) -> id لكل منتج موجود فعلاً بقيود —
    // يُستخدم فقط لو updateExisting مفعَّل، لتحديد أي صف يُحدَّث (PUT) لا يُنشأ.
    const skuToId = {};
    // [إضافة 2026-09-07] فهرس صفوف excelData التي أُنشئت فعلاً بهذه الدفعة —
    // يُستخدم بعد انتهاء الحلقة لبناء ملف الأرصدة الافتتاحية لهذه المنتجات فقط
    // (لا المتخطاة كمكررة، ولا الفاشلة، **ولا المُحدَّثة** — منتج موجود أصلاً
    // غالباً له رصيد مسجَّل بالفعل؛ إضافة رصيد افتتاحي آخر له كانت ستُضاعف
    // كميته بصمت عند رفع الملف لقيود — خطر محاسبي حقيقي تفادته الأداة عمداً).
    const createdRowIndexes = new Set();

    const revCode = revenueAcct.trim() || DEFAULT_REVENUE_ACCT;
    const expCode = expenseAcct.trim() || DEFAULT_EXPENSE_ACCT;

    const updateStats = () => setStats({ total: excelData.length, uploaded, updated: updatedCount, skipped, errors });
    const setProg = (current) => setProgress({ current, total: excelData.length });

    try {
      appendLog(t({ ar: "=== بدء الرفع ===", en: "=== Starting Upload ===" }), "header");

      // 1. Accounts/taxes/units/categories — [إعادة تصميم 2026-09-20، طلب صريح
      // من المستخدم] استخدام البيانات المُجهَّزة مسبقًا (fetchReferenceData
      // بمرحلة المعاينة) طالما لم يتغيّر مفتاح API منذ آخر جلب لها — فلا وقت
      // انتظار إطلاقًا هنا قبل بدء إنشاء أول منتج. غير ذلك (لم تُجهَّز مسبقًا،
      // أو تغيّر المفتاح)، تُجلَب الأربعة الآن متوازية (Promise.all) بدل
      // متتالية كما كانت — أسرع حتى بالمسار الاحتياطي.
      const usePrefetched = referenceDataForKeyRef.current === key && previewAccounts.length > 0;
      appendLog(
        usePrefetched
          ? t({ ar: "استخدام بيانات المنشأة المُجهَّزة مسبقًا (دليل الحسابات/الضرائب/الوحدات/الفئات) — بلا إعادة جلب", en: "Using pre-fetched company data (accounts/taxes/units/categories) — no re-fetch" })
          : t({ ar: "جارٍ جلب دليل الحسابات والضرائب والوحدات والفئات (متوازيًا)...", en: "Fetching chart of accounts, taxes, units and categories (in parallel)..." }),
        "header"
      );
      const [accounts, taxes, units, categories] = usePrefetched
        ? [previewAccounts, previewTaxes, previewUnits, previewCategories]
        : await Promise.all([
            fetchAllByCursor("/accounts", key),
            fetchAll("/taxes", key),
            fetchAll("/product_unit_types", key),
            fetchAll("/categories", key),
          ]);

      accounts.forEach((a) => {
        const nameAr = (a.name_ar || "").toLowerCase();
        const nameEn = (a.name_en || "").toLowerCase();
        const code = String(a.code || "").trim();
        if (nameAr) accountsByName[nameAr] = a;
        if (nameEn) accountsByName[nameEn] = a;
        if (code) accountsByCode[code] = a;
      });
      appendLog(t({ ar: `  تم العثور على ${accounts.length} حساب`, en: `  Found ${accounts.length} accounts` }), "info");

      const defaultRev = accountsByCode[revCode];
      const defaultExp = accountsByCode[expCode];
      if (defaultRev) appendLog(t({ ar: `  حساب الإيراد ${revCode}: ${defaultRev.name_ar} (المعرّف: ${defaultRev.id})`, en: `  Revenue account ${revCode}: ${defaultRev.name_ar} (ID: ${defaultRev.id})` }), "success");
      else appendLog(t({ ar: `  تحذير: الحساب ${revCode} غير موجود!`, en: `  WARNING: Account ${revCode} not found!` }), "error");
      if (defaultExp) appendLog(t({ ar: `  حساب المصروف ${expCode}: ${defaultExp.name_ar} (المعرّف: ${defaultExp.id})`, en: `  Expense account ${expCode}: ${defaultExp.name_ar} (ID: ${defaultExp.id})` }), "success");
      else appendLog(t({ ar: `  تحذير: الحساب ${expCode} غير موجود!`, en: `  WARNING: Account ${expCode} not found!` }), "error");

      // 2. Taxes — prefer rate 15%
      try {
        const chosen = chooseTax(taxes);
        if (chosen) selectedTaxId = chosen.id;
        const chosenRate = chosen
          ? chosen.rate !== undefined ? chosen.rate : chosen.percentage !== undefined ? chosen.percentage : chosen.percent !== undefined ? chosen.percent : ""
          : "";
        appendLog(
          t({
            ar: `  تم العثور على ${taxes.length} ضريبة. الضريبة المستخدمة: "${chosen ? chosen.name || chosen.id : "لا يوجد"}"${chosen ? ` (النسبة ${chosenRate}, المعرّف ${chosen.id})` : ""}`,
            en: `  Found ${taxes.length} taxes. Using tax: "${chosen ? chosen.name || chosen.id : "NONE"}"${chosen ? ` (rate ${chosenRate}, ID ${chosen.id})` : ""}`,
          }),
          chosen ? "success" : "error"
        );
        if (!chosen) appendLog(t({ ar: "  تحذير: لا توجد ضرائب - لن يمكن إنشاء المنتجات بدون ضريبة!", en: "  WARNING: No taxes found - products will NOT be creatable without a tax!" }), "error");
      } catch (e) {
        appendLog(t({ ar: `  فشل معالجة الضرائب: ${e.message}`, en: `  Failed to process taxes: ${e.message}` }), "error");
      }

      // 3. Units
      units.forEach((u) => { unitsCache[(u.unit_name || "").toLowerCase()] = u; });
      appendLog(t({ ar: `  تم العثور على ${units.length} وحدة: ${units.map((u) => u.unit_name).join("، ")}`, en: `  Found ${units.length} units: ${units.map((u) => u.unit_name).join(", ")}` }), "info");

      // 4. Categories — ensure the ones this file needs exist
      appendLog(t({ ar: "\nجارٍ معالجة فئات المنتجات...", en: "\nProcessing product categories..." }), "header");
      categories.forEach((c) => {
        const k = (c.name || "").trim().toLowerCase();
        if (k) categoriesCache[k] = c;
      });
      appendLog(t({ ar: `  تم العثور على ${categories.length} فئة موجودة`, en: `  Found ${categories.length} existing categories` }), "info");

      const needed = new Map(); // key -> { name }
      excelData.forEach((p) => {
        const c = (p.category || "").trim();
        if (!c) return;
        const k = c.toLowerCase();
        if (!needed.has(k)) needed.set(k, { name: c });
      });

      if (needed.size > 0) {
        for (const [k, meta] of needed) {
          if (stoppedRef.current) break;
          if (categoriesCache[k]) continue;
          try {
            appendLog(t({ ar: `  جارٍ إنشاء الفئة: ${meta.name}`, en: `  Creating category: ${meta.name}` }), "info");
            const res = await api("POST", "/categories", { category: { name: meta.name } }, key);
            if (res.category) {
              categoriesCache[k] = res.category;
              appendLog(t({ ar: `  تم إنشاء الفئة: ${meta.name} (المعرّف: ${res.category.id})`, en: `  Category created: ${meta.name} (ID: ${res.category.id})` }), "success");
            } else {
              appendLog(t({ ar: `  فشل إنشاء الفئة: ${meta.name}`, en: `  FAILED to create category: ${meta.name}` }), "error");
            }
          } catch (e) {
            appendLog(t({ ar: `  فشل إنشاء الفئة '${meta.name}': ${e.message}`, en: `  Failed to create category '${meta.name}': ${e.message}` }), "error");
          }
          // [إزالة 2026-09-20، طلب صريح من المستخدم: رفع أسرع لملفات كبيرة]
          // كان هنا انتظار 300ms إضافي بعد كل فئة، بمعزل تام عن المُحدِّد
          // الحقيقي الوحيد لحد Qoyod (300 طلب/60 ثانية) — المُطبَّق مركزيًا
          // وبدقة عبر api()/waitForRateLimitSlot (network.js)، ويشمل هذا النداء
          // نفسه. الانتظار الإضافي هنا كان تكراراً صرفاً لا يزيد الأمان، فقط
          // يُبطئ إنشاء الفئات (عادة قليلة العدد فأثره هنا محدود، لكن إزالته
          // متسقة مع نفس الإصلاح بحلقة إنشاء المنتجات الرئيسية أدناه).
        }
      }
      appendLog(t({ ar: `  الفئات الجاهزة: ${Object.keys(categoriesCache).length}`, en: `  Categories ready: ${Object.keys(categoriesCache).length}` }), "info");

      // 3. Fetch existing products
      // [إصلاح 2026-09-07] خلل حقيقي مكتشَف عبر رد API حقيقي زوّدنا به المستخدم:
      // رد Qoyod الفعلي لمنتج (GET/PUT /products) لا يحوي حقل "name" إطلاقاً —
      // فقط name_ar/name_en. `if (p.name)` كانت دائماً false على بيانات حقيقية،
      // أي أن مطابقة "تخطي بالاسم" لم تعمل فعلياً أبداً منذ إنشاء الأداة (رغم
      // أن نص الواجهة يقول صراحة "تخطي المنتجات الموجودة مسبقاً (بالاسم أو
      // الرمز)") — المطابقة بالرمز فقط كانت تعمل. أُصلح الآن ليطابق name_ar
      // وname_en معاً (نفس نمط accountsByName أعلى بهذا الملف). [إضافة
      // 2026-09-07] أيضاً: يُجلب المنتجات أيضاً لو updateExisting مفعَّل (لا
      // skipDups فقط) لبناء فهرس skuToId اللازم للتحديث.
      if (skipDups || updateExisting) {
        appendLog(t({ ar: "جارٍ جلب المنتجات الموجودة...", en: "Fetching existing products..." }), "info");
        const products = await fetchAll("/products", key);
        products.forEach((p) => {
          if (p.sku) {
            const skuTrim = p.sku.trim();
            existingProducts.skus.add(skuTrim);
            skuToId[skuTrim] = p.id;
          }
          const nameAr = (p.name_ar || "").trim().toLowerCase();
          const nameEn = (p.name_en || "").trim().toLowerCase();
          if (nameAr) existingProducts.names.add(nameAr);
          if (nameEn) existingProducts.names.add(nameEn);
        });
        appendLog(t({ ar: `  تم العثور على ${products.length} منتج موجود`, en: `  Found ${products.length} existing products` }), "info");
      }

      // 4. Upload products
      appendLog(t({ ar: `\nجارٍ رفع ${excelData.length} منتج...`, en: `\nUploading ${excelData.length} products...` }), "header");
      appendLog(t({ ar: `شامل الضريبة: ${taxInclusive ? "نعم" : "لا"}`, en: `Tax inclusive: ${taxInclusive ? "Yes" : "No"}` }), "info");

      for (let i = 0; i < excelData.length; i++) {
        if (stoppedRef.current) { appendLog(t({ ar: "تم الإيقاف من قبل المستخدم", en: "STOPPED by user" }), "error"); break; }

        const p = excelData[i];

        // Check duplicates / existing-product match
        // [إضافة 2026-09-07] resolveExistingProductAction تقرر: تحديث (بالرمز
        // فقط، لو updateExisting مفعَّل) أو تخطٍّ (بالرمز أو الاسم، السلوك
        // الأصلي) أو إنشاء عادي — راجع تعليقها بـengine/parsing.js.
        const existingAction = resolveExistingProductAction(p, {
          skuToId, existingSkus: existingProducts.skus, existingNames: existingProducts.names,
          updateExisting, skipDups,
        });
        if (existingAction.action === "skip") {
          appendLog(
            t({
              ar: `[${i + 1}/${excelData.length}] تخطي (${existingAction.reason === "sku" ? "الرمز موجود" : "الاسم موجود"}): ${p.sku || p.name} - ${p.name}`,
              en: `[${i + 1}/${excelData.length}] SKIP (${existingAction.reason === "sku" ? "SKU exists" : "name exists"}): ${p.sku || p.name} - ${p.name}`,
            }),
            "warn"
          );
          skipped++;
          updateStats(); setProg(i + 1);
          continue;
        }

        // Resolve unit
        let unitId = null;
        if (p.unit) {
          const uKey = p.unit.toLowerCase();
          if (unitsCache[uKey]) {
            unitId = unitsCache[uKey].id;
          } else {
            try {
              appendLog(t({ ar: `  جارٍ إنشاء الوحدة: ${p.unit}`, en: `  Creating unit: ${p.unit}` }), "info");
              const res = await api("POST", "/product_unit_types", {
                product_unit_type: { unit_name: p.unit, unit_representation: p.unit.substring(0, 3) },
              }, key);
              if (res.product_unit_type) {
                unitsCache[uKey] = res.product_unit_type;
                unitId = res.product_unit_type.id;
                appendLog(t({ ar: `  تم إنشاء الوحدة: ${p.unit} (المعرّف: ${unitId})`, en: `  Unit created: ${p.unit} (ID: ${unitId})` }), "success");
              }
            } catch (e) {
              appendLog(t({ ar: `  فشل إنشاء الوحدة '${p.unit}': ${e.message}`, en: `  Failed to create unit '${p.unit}': ${e.message}` }), "error");
            }
          }
        }

        // Resolve revenue account — [إصلاح] يطابق برقم الحساب أولاً ثم بالاسم
        // (راجع resolveAccountId بـengine/parsing.js)؛ عدم المطابقة يُسجَّل
        // تحذيراً بدل الاستبدال الصامت بالحساب الافتراضي.
        let revId = null;
        if (p.revenue_account_name) {
          const resolved = resolveAccountId(p.revenue_account_name, accountsByCode, accountsByName);
          if (resolved.matched) {
            revId = resolved.id;
          } else {
            appendLog(t({ ar: `  تحذير: حساب الإيراد '${p.revenue_account_name}' لـ '${p.name}' غير موجود — سيُستخدم الافتراضي ${revCode}`, en: `  WARNING: revenue account '${p.revenue_account_name}' for '${p.name}' not found — using default ${revCode}` }), "warn");
            revId = defaultRev ? defaultRev.id : null;
          }
        } else {
          revId = defaultRev ? defaultRev.id : null;
        }

        // Resolve expense account — نفس منطق المطابقة أعلاه.
        let expId = null;
        if (p.expense_account_name) {
          const resolved = resolveAccountId(p.expense_account_name, accountsByCode, accountsByName);
          if (resolved.matched) {
            expId = resolved.id;
          } else {
            appendLog(t({ ar: `  تحذير: حساب المصروف '${p.expense_account_name}' لـ '${p.name}' غير موجود — سيُستخدم الافتراضي ${expCode}`, en: `  WARNING: expense account '${p.expense_account_name}' for '${p.name}' not found — using default ${expCode}` }), "warn");
            expId = defaultExp ? defaultExp.id : null;
          }
        } else {
          expId = defaultExp ? defaultExp.id : null;
        }

        // Resolve category
        let categoryId = null;
        if (p.category) {
          const cat = categoriesCache[p.category.trim().toLowerCase()];
          if (cat) categoryId = cat.id;
        }

        const payload = buildProductPayload(p, { unitId, categoryId, revId, expId, selectedTaxId, taxInclusive });
        const nameLower = p.name.trim().toLowerCase();

        try {
          // [إضافة 2026-09-07] تحديث (PUT) لمنتج موجود مطابق بالرمز، أو إنشاء
          // (POST) عادي — نفس الحمولة تماماً بالحالتين (buildProductPayload).
          const isUpdate = existingAction.action === "update";
          const res = isUpdate
            ? await api("PUT", `/products/${existingAction.id}`, { product: payload }, key)
            : await api("POST", "/products", { product: payload }, key);
          if (res.product) {
            if (isUpdate) {
              appendLog(t({ ar: `[${i + 1}/${excelData.length}] تم التحديث: ${p.name} (المعرّف: ${existingAction.id})`, en: `[${i + 1}/${excelData.length}] UPDATED: ${p.name} (ID: ${existingAction.id})` }), "success");
              updatedCount++;
              // عمداً: لا createdRowIndexes.add(i) — منتج موجود أصلاً يُستثنى من
              // ملف الأرصدة الافتتاحية (راجع تعليق createdRowIndexes أعلاه).
            } else {
              appendLog(t({ ar: `[${i + 1}/${excelData.length}] تم الإنشاء: ${p.name} (المعرّف: ${res.product.id})`, en: `[${i + 1}/${excelData.length}] CREATED: ${p.name} (ID: ${res.product.id})` }), "success");
              uploaded++;
              createdRowIndexes.add(i);
            }
            existingProducts.names.add(nameLower);
            if (p.sku) { existingProducts.skus.add(p.sku); skuToId[p.sku] = res.product.id; }
          } else {
            appendLog(t({ ar: `[${i + 1}/${excelData.length}] فشل: ${p.name}`, en: `[${i + 1}/${excelData.length}] FAILED: ${p.name}` }), "error");
            errors++;
          }
        } catch (e) {
          appendLog(t({ ar: `[${i + 1}/${excelData.length}] خطأ: ${p.name} - ${e.message}`, en: `[${i + 1}/${excelData.length}] ERROR: ${p.name} - ${e.message}` }), "error");
          errors++;
        }

        updateStats();
        setProg(i + 1);

        // [إزالة 2026-09-20، طلب صريح من المستخدم: "احتاج رفع سريع جدًا ودقيق
        // 100%" على ملف 4200 منتج] كان هنا انتظار 300ms إضافي بعد كل منتج،
        // بمعزل تام عن حد Qoyod الحقيقي (300 طلب/60 ثانية) المُطبَّق مركزيًا
        // وبدقة عبر api()/waitForRateLimitSlot (network.js) على كل نداء API
        // بالمشروع بلا استثناء — يشمل هذا النداء (POST/PUT /products) نفسه.
        // الانتظار الإضافي هنا كان من الكود الأصلي (قبل وجود ذلك المُحدِّد
        // المركزي)، ولا يزيد أي أمان حقيقي، فقط يُضاعِف تقريبًا زمن رفع ملف
        // كبير (4200 منتج × 300ms إضافية = 21 دقيقة ميتة بلا أي فائدة). إزالته
        // لا تُخاطر بتجاوز الحد الرسمي إطلاقًا — المُحدِّد المركزي يبقى الضامن
        // الوحيد والكافي لذلك بصرف النظر عن سرعة هذه الحلقة.
      }

      // [إضافة 2026-09-07] ملف الأرصدة الافتتاحية — فقط للمنتجات التي أُنشئت
      // فعلاً بهذه الدفعة ولها كمية صالحة (>0) بملف العميل. لا كتابة مباشرة عبر
      // API لهذا القيد (قرار المستخدم الصريح، راجع تعليق io/openingBalanceExport.js)
      // — فقط توليد ملف Excel مرجعي يرفعه المستخدم يدوياً من شاشة قيود الرسمية.
      const createdForBalance = excelData.filter((_, idx) => createdRowIndexes.has(idx));
      const balanceRows = buildOpeningBalanceRows(createdForBalance, {
        defaultLocation: defaultLocation.trim() || DEFAULT_LOCATION,
      });
      if (balanceRows.length > 0) {
        appendLog(t({ ar: `\nجارٍ إنشاء ملف الأرصدة الافتتاحية لـ ${balanceRows.length} منتج بكمية...`, en: `\nBuilding opening balance file for ${balanceRows.length} product(s) with quantity...` }), "header");
        try {
          const { workbook, skippedNoSku } = buildOpeningBalanceWorkbook(balanceRows);
          if (workbook.SheetNames.length > 0) {
            const blob = workbookToBlob(workbook);
            downloadBlob(blob, t({ ar: `ارصدة-افتتاحية-منتجات-${openingBalanceDate}.xlsx`, en: `opening-balance-products-${openingBalanceDate}.xlsx` }));
            appendLog(
              t({
                ar: `  تم تنزيل ملف الأرصدة الافتتاحية (${balanceRows.length - skippedNoSku.length} منتج، ${workbook.SheetNames.length} موقع) — ارفعه يدوياً من قيود: المحاسبة > قيود يدوية > أرصدة افتتاحية > المنتجات والتكاليف، وأدخل التاريخ ${openingBalanceDate} يدوياً بنفس الشاشة (القالب الرسمي لا يحمل التاريخ داخله)`,
                en: `  Downloaded the opening balance file (${balanceRows.length - skippedNoSku.length} product(s), ${workbook.SheetNames.length} location(s)) — upload it manually from Qoyod: Accounting > Manual Entries > Opening Balances > Products & Costs, and enter the date ${openingBalanceDate} manually on that same screen (the official template does not carry the date within it)`,
              }),
              "success"
            );
          }
          // [إضافة 2026-09-07] القالب الرسمي يحدّد المنتج بعمود "الرقم التسلسلي"
          // (= الرمز/الكود) فقط بلا عمود اسم بديل — منتج بلا رمز بملف العميل
          // لا يمكن كتابته بهذا الملف إطلاقاً، فيُستثنى ويُبلَّغ به صراحة بدل
          // تجاهله بصمت.
          if (skippedNoSku.length > 0) {
            appendLog(
              t({
                ar: `  تحذير: تم تخطي ${skippedNoSku.length} منتج من ملف الأرصدة الافتتاحية لعدم وجود رمز/كود له (القالب الرسمي يحدّد المنتج بالرمز فقط): ${skippedNoSku.join("، ")}`,
                en: `  WARNING: Skipped ${skippedNoSku.length} product(s) from the opening balance file for missing SKU/code (the official template identifies products by SKU only): ${skippedNoSku.join(", ")}`,
              }),
              "warn"
            );
          }
        } catch (e) {
          appendLog(t({ ar: `  تعذر توليد ملف الأرصدة الافتتاحية: ${e.message}`, en: `  Could not generate the opening balance file: ${e.message}` }), "error");
        }
      }

      appendLog(t({ ar: "\n=== اكتمل الرفع ===", en: "\n=== Upload Complete ===" }), "header");
      appendLog(
        t({
          ar: `الإجمالي: ${excelData.length} | تم الرفع: ${uploaded} | تم التحديث: ${updatedCount} | تم التخطي: ${skipped} | الأخطاء: ${errors}`,
          en: `Total: ${excelData.length} | Uploaded: ${uploaded} | Updated: ${updatedCount} | Skipped: ${skipped} | Errors: ${errors}`,
        }),
        "header"
      );
    } catch (e) {
      appendLog(t({ ar: `فادح: ${e.message}`, en: `FATAL: ${e.message}` }), "error");
    }

    setUploading(false);
  }, [
    apiKey, excelData, revenueAcct, expenseAcct, taxInclusive, skipDups, updateExisting, openingBalanceDate, defaultLocation,
    previewAccounts, previewTaxes, previewUnits, previewCategories, appendLog, t,
  ]);

  const previewSummary = useMemo(() => {
    const catSet = new Set(excelData.map((p) => p.category).filter(Boolean));
    const unitSet = new Set(excelData.map((p) => p.unit).filter(Boolean));
    // [إضافة 2026-09-07] عدّادات الحقول الاختيارية الجديدة — لعرضها بمعاينة
    // البيانات (رد فعل مباشر على ملاحظة المستخدم: "الأعمدة الظاهرة لي الآن محدودة").
    const withNameEn = excelData.filter((p) => p.name_en && p.name_en.trim()).length;
    const withDescription = excelData.filter((p) => p.description && p.description.trim()).length;
    const withSellingPrice = excelData.filter((p) => parseSellingPriceNumber(p.selling_price_raw) !== null).length;
    const withBarcode = excelData.filter((p) => p.barcode && p.barcode.trim()).length;
    const withQuantity = excelData.filter((p) => parseQuantityNumber(p.quantity_raw) !== null).length;
    const withLocation = excelData.filter((p) => p.location && p.location.trim()).length;
    return {
      count: excelData.length, categories: catSet.size, units: unitSet.size,
      withNameEn, withDescription, withSellingPrice, withBarcode, withQuantity, withLocation,
    };
  }, [excelData]);

  return {
    // key management
    apiKey, setApiKey, customerName, setCustomerName, keyVisible, toggleKeyVisibility,
    savedKeys, saveKey, loadKey, requestRemoveKey, removeKeyTarget, cancelRemoveKey, confirmRemoveKey,
    // file
    fileName, excelData, baseExcelData, handleFile,
    // [إضافة 2026-09-19] شريط مطابقة الأعمدة اليدوي
    mappingHeaders, mappingPreviewRows, colsMap, assignColumn, ignoreColumn, mappableFields: MAPPABLE_FIELDS,
    // alerts
    uploadAlert, dismissAlert,
    // settings
    revenueAcct, setRevenueAcct, expenseAcct, setExpenseAcct,
    taxInclusive, toggleTaxInclusive, skipDups, toggleSkipDups,
    updateExisting, toggleUpdateExisting,
    openingBalanceDate, setOpeningBalanceDate, defaultLocation, setDefaultLocation,
    // [إضافة 2026-09-19] بيانات المنشأة المرجعية (حسابات/ضرائب/وحدات/فئات) + التجاوز لكل صف
    previewAccounts, previewTaxes, previewUnits, previewCategories,
    referenceDataLoading, referenceDataError, fetchReferenceData,
    revenueAccountOptions, expenseAccountOptions, defaultRevenueAccount, defaultExpenseAccount,
    rowOverrides, setRowAccountOverride,
    // preview
    previewSummary,
    // upload run
    log, stats, progress, uploading, showProgressCard, startUpload, stopUpload,
  };
}
