/**
 * useSalesInvoiceImportEngine.js — الهوك المركزي الذي يحمل كل حالة الأداة ومنطق تشغيلها،
 * على نمط useImportEngine.js في bill-import: المكوّنات تعرض فقط، ولا منطق أعمال داخلها.
 *
 * كل استدعاء لدالة من طبقة engine/io هنا هو استدعاء حرفي لنفس المنطق الموجود في
 * qoyod_validator_core.js — هذا الملف فقط يربطها بحالة React ويعيد إنتاج تسلسل الأحداث
 * الأصلي (goStep، أحداث input/change/paste، رفع الملفات) بلا أي تغيير في الترتيب أو الشروط.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../language.jsx';

import { COLUMNS, COL_KEYS, HEADER_COLS, ITEM_COLS } from './engine/constants.js';
import { isBlank, norm } from './engine/text.js';
import { setDateSep as setDateSepGlobal, getDateSep, reformatAllDates, toDMY } from './engine/dates.js';
import { createRow, fillDownHeaderFields } from './engine/rows.js';
import { groupRowsByInvoiceRef } from './engine/grouping.js';
import { resolveNamesToRefs } from './engine/resolveNames.js';
import { snapTaxCategoriesInRows } from './engine/taxAndDiscount.js';
import { buildProductsIndex, buildStockIndex, buildCustomersIndex } from './engine/referenceIndexes.js';
import { guessInvoiceImportMapping, applyInvoiceImportMapping } from './engine/invoiceImportMapping.js';
import { runValidation, findInvoicesMissingLocation, getValidOnlyRows, getStockShortageDraftGroups } from './engine/validation.js';
import { applyPastedGrid } from './engine/paste.js';

import { parseTemplateFile } from './io/template.js';
import { readGenericSpreadsheet } from './io/readGenericSpreadsheet.js';
import { generateFinalXlsx, triggerXlsxDownload } from './io/xmlExport.js';

// [إضافة] جلب/إرسال عبر Qoyod API — ميزة إضافية بحتة، راجع تعليقات الرأس
// بكلا الملفين لتفاصيل القرارات المؤكَّدة ميدانيًا (لا تُعدِّل أي كود مطابقة/تحقق).
import { fetchSalesReferencesFromApi } from './api/qoyodSalesRefFetch.js';
import { pushSalesInvoicesToQoyod } from './api/qoyodSalesInvoicePush.js';
// [إضافة] حفظ مفتاح API باسم العميل — نفس مخزن localStorage المشترك أصلاً بين أداتَي شجرة
// الحسابات (MergeTool.jsx) ورفع المنتجات (product-upload)؛ استيراد قراءة فقط لوحدة تخزين
// جاهزة ومُختبَرة، لا تعديل عليها ولا على أي كود آخر خارج هذا المجلد.
import { getSavedKeys, saveKeysToStorage } from '../product-upload/io/keyStorage.js';

const EMPTY_TEMPLATE = { loaded: false, dropdowns: { G: [], H: [], S: ['نعم', 'لا'], L: [], V: [] }, colMap: {}, missingFields: COL_KEYS.slice() };
const EMPTY_REF = { loaded: false, raw: null, headers: null, mapping: null };
const EMPTY_ISSUES = { byRow: {}, list: [] };

export default function useSalesInvoiceImportEngine() {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);

  // rowSeq لا يُصفَّر أبدًا طوال الجلسة (القاعدة #2 بالخطة) — عبر useRef مستمر.
  const rowSeqRef = useRef(1);
  const makeRow = useCallback((prefill) => createRow('r' + (rowSeqRef.current++), prefill), []);

  const [template, setTemplate] = useState(EMPTY_TEMPLATE);
  const [productsRef, setProductsRef] = useState(EMPTY_REF);
  const [stockRef, setStockRef] = useState(EMPTY_REF);
  const [customersRef, setCustomersRef] = useState(EMPTY_REF);

  const [invoiceImportFile, setInvoiceImportFile] = useState({ headers: [], rows: [] });
  const [invoiceImportGuesses, setInvoiceImportGuesses] = useState(null); // {mainGuesses, auxGuesses} | null
  const [invoiceImportStatus, setInvoiceImportStatus] = useState('');
  // [إصلاح] كل مسارات رفع الملفات كانت بلا try/catch ومكوّنات الرفع تستدعيها بلا
  // .catch — فأي ملف تالف/بصيغة غير متوقعة (xls مُسمّى xlsx، قالب بورقة ظاهرة
  // بمسار مختلف، ملف مرجعي فارغ) يرمي استثناءً يُبتلَع كـunhandled rejection:
  // البطاقة تبقى "لم يُرفع بعد" وزر التالي معطّل بلا أي سبب معروض للمستخدم.
  const [uploadError, setUploadError] = useState('');

  const [rows, setRows] = useState([]);
  const [issues, setIssues] = useState(EMPTY_ISSUES);
  const [ambiguities, setAmbiguities] = useState([]); // {rowId, field, typedName, candidates}
  const [dateSep, setDateSepState] = useState(getDateSep());

  const [exportBusy, setExportBusy] = useState(false);
  const [exportResult, setExportResult] = useState(null); // {url, filename} | null
  const [exportError, setExportError] = useState('');
  const prevExportUrlRef = useRef(null);

  // [إضافة] حالة الجلب/الإرسال عبر Qoyod API — منفصلة تمامًا عن حالة الرفع/التصدير
  // اليدوي أعلاه، بلا أي تداخل معها. apiKey واحد يُستخدَم بالخطوة 1 (الجلب) والخطوة 4
  // (الإرسال) إن رغب المستخدم، لكن كل مسار يعمل باستقلالية تامة عن الآخر.
  const [apiKey, setApiKey] = useState('');
  const [apiFetchBusy, setApiFetchBusy] = useState(false);
  const [apiFetchError, setApiFetchError] = useState('');
  const [apiFetchSummary, setApiFetchSummary] = useState(null); // {products, customers} | null
  const [locationIdByName, setLocationIdByName] = useState(null); // Map | null — لمسار الإرسال فقط
  const [apiSendBusy, setApiSendBusy] = useState(false);
  const [apiSendResult, setApiSendResult] = useState(null);
  const [apiSendEntries, setApiSendEntries] = useState([]); // تتراكم حيّة أثناء الإرسال (للعرض التدريجي)
  const [apiSendProgress, setApiSendProgress] = useState({ current: 0, total: 0 });
  const apiSendStoppedRef = useRef({ current: false });

  // [إضافة] حفظ مفتاح API باسم العميل — تخزين محلي بحت (localStorage)، مستقل تمامًا عن
  // apiKey أعلاه (قيمة الحقل الحالي بلا حفظ) وعن fetchReferencesFromApi (منطق الجلب نفسه
  // بلا أي تغيير). customerName حقل واجهة فقط، savedKeys قاموس {اسم العميل: مفتاح}.
  const [customerName, setCustomerName] = useState('');
  const [savedKeys, setSavedKeysState] = useState(() => getSavedKeys());

  const saveApiKeyForCustomer = useCallback((key, name) => {
    const k = (key || '').trim();
    const n = (name || '').trim();
    if (!k || !n) return { ok: false };
    const next = { ...getSavedKeys(), [n]: k };
    saveKeysToStorage(next);
    setSavedKeysState(next);
    return { ok: true };
  }, []);

  // يُرجع المفتاح المحفوظ لهذا الاسم (بلا أي جلب تلقائي — الجلب يبقى بضغطة صريحة على "جلب").
  const loadSavedApiKey = useCallback((name) => {
    setCustomerName(name);
    return savedKeys[name] || '';
  }, [savedKeys]);

  const removeSavedApiKey = useCallback((name) => {
    const next = { ...getSavedKeys() };
    delete next[name];
    saveKeysToStorage(next);
    setSavedKeysState(next);
  }, []);

  const refs = useMemo(() => ({
    template, products: productsRef, customers: customersRef, stock: stockRef,
  }), [template, productsRef, customersRef, stockRef]);

  const revalidateNow = useCallback((rowsOverride) => {
    // [إصلاح] كان زر "إعادة التحقق" يمرّر حدث النقر (SyntheticEvent) كـrowsOverride،
    // وهو كائن غير فارغ فيُستخدَم بدل الصفوف ثم يرمي runValidation استثناءً
    // (rows.forEach ليست دالة) داخل معالِج الحدث: الزر ميت تمامًا والأخطاء القديمة
    // تبقى معروضة بلا أي إشارة. نقبل مصفوفة فقط، وأي شيء آخر يعني "استخدم rows".
    const list = Array.isArray(rowsOverride) ? rowsOverride : rows;
    setIssues(runValidation(list, refs));
  }, [rows, refs]);

  /* ========================= الخطوة 1: الملفات المرجعية ========================= */

  const uploadTemplate = useCallback(async (file) => {
    setUploadError('');
    try {
      const res = await parseTemplateFile(file);
      setTemplate({ loaded: true, ...res });
    } catch (err) {
      setTemplate(EMPTY_TEMPLATE);
      setUploadError(t({
        ar: `تعذّر قراءة ملف القالب: ${err?.message || String(err)} — تأكد أنه ملف قالب قيود الأصلي بصيغة xlsx.`,
        en: `Could not read the template file: ${err?.message || String(err)} — make sure it's the original Qoyod template file in xlsx format.`,
      }));
    }
  }, [t]);

  const uploadReferenceFile = useCallback(async (kind, file) => {
    setUploadError('');
    let headers, raw;
    try {
      ({ headers, rows: raw } = await readGenericSpreadsheet(file));
    } catch (err) {
      setUploadError(t({ ar: `تعذّر قراءة الملف المرجعي: ${err?.message || String(err)}`, en: `Could not read the reference file: ${err?.message || String(err)}` }));
      return;
    }
    const setter = kind === 'products' ? setProductsRef : kind === 'stock' ? setStockRef : setCustomersRef;
    // [إصلاح] كان النشر ({...prev}) يُبقي فهارس الملف السابق (bySku/byName/byRef)
    // حيةً بعد رفع ملف مرجعي جديد، وresolveNamesToRefs تعتمد على وجود الفهرس لا على
    // loaded — فأسماء العملاء/المنتجات كانت تُحوَّل لأرقام مرجعية من الملف *القديم*
    // الذي استبدله المستخدم، وبلا أي خطأ لأن فحص الوجود يتخطّى المرجع غير المحمَّل.
    setter(() => ({ ...EMPTY_REF, raw, headers }));
  }, [t]);

  // mapping: {mode?, sku, name, sellable, stocked} لـ products، {mode:'long'|'wide', sku, location/qty | locCols} لـ stock،
  // {ref, name, status} لـ customers — نفس بنية mapping في buildIndex الأصلية.
  const confirmReferenceMapping = useCallback((kind, mapping) => {
    const store = kind === 'products' ? productsRef : kind === 'stock' ? stockRef : customersRef;
    const setter = kind === 'products' ? setProductsRef : kind === 'stock' ? setStockRef : setCustomersRef;
    const { raw, headers } = store;
    if (!raw || !headers) return;
    let index;
    if (kind === 'products') index = buildProductsIndex(raw, headers, mapping);
    else if (kind === 'stock') index = buildStockIndex(raw, headers, mapping);
    else index = buildCustomersIndex(raw, headers, mapping);
    setter((prev) => ({ ...prev, loaded: true, mapping, ...index }));
  }, [productsRef, stockRef, customersRef]);

  // [إضافة] جلب المنتجات/المخزون/العملاء دفعة واحدة عبر Qoyod API، بديل اختياري
  // للبطاقات الثلاث اليدوية المقابلة (بطاقة القالب تبقى رفعًا يدويًا دومًا —
  // راجع تعليق رأس qoyodSalesRefFetch.js). لا تُستدعى إلا بضغطة صريحة من المستخدم.
  const fetchReferencesFromApi = useCallback(async (key) => {
    setApiFetchBusy(true); setApiFetchError(''); setApiFetchSummary(null);
    try {
      const result = await fetchSalesReferencesFromApi(key);
      setApiKey(key);
      setProductsRef(result.productsRef);
      setStockRef(result.stockRef);
      setCustomersRef(result.customersRef);
      setLocationIdByName(result.locationIdByName);
      setApiFetchSummary(result.counts);
      return result;
    } catch (err) {
      setApiFetchError(err?.message || String(err));
      return null;
    } finally {
      setApiFetchBusy(false);
    }
  }, []);

  /* ========================= الخطوة 2: استيراد ملف فواتير غير منظم ========================= */

  const uploadInvoiceImportFile = useCallback(async (file) => {
    setUploadError('');
    let headers, raw;
    try {
      ({ headers, rows: raw } = await readGenericSpreadsheet(file));
    } catch (err) {
      setInvoiceImportStatus(t({ ar: `تعذّر قراءة الملف: ${err?.message || String(err)}`, en: `Could not read the file: ${err?.message || String(err)}` }));
      return;
    }
    if (!raw.length) { setInvoiceImportStatus(t({ ar: 'الملف لا يحتوي على بيانات قابلة للقراءة.', en: 'The file has no readable data.' })); return; }
    setInvoiceImportFile({ headers, rows: raw });
    setInvoiceImportStatus(t({
      ar: `تم قراءة ${raw.length} سطر — رجاءً طابق الأعمدة أدناه ثم اضغط "تأكيد المطابقة".`,
      en: `Read ${raw.length} row(s) — please match the columns below, then click "Confirm matching".`,
    }));
    setInvoiceImportGuesses(guessInvoiceImportMapping(headers, raw, refs));
  }, [refs, t]);

  const cancelInvoiceImportMapping = useCallback(() => {
    setInvoiceImportFile({ headers: [], rows: [] });
    setInvoiceImportGuesses(null);
    setInvoiceImportStatus('');
  }, []);

  const hasExistingData = useMemo(() => rows.some((r) => COLUMNS.some((c) => !isBlank(r[c.key]))), [rows]);

  // append: true يضيف الأسطر المستوردة لما هو موجود، false يستبدل الجدول بالكامل — القرار يتخذه
  // المكوّن (عبر ConfirmDialog) فقط عند hasExistingData، تمامًا كما كان confirm() الأصلي يُستدعى شرطيًا.
  const confirmInvoiceImportMapping = useCallback((mapping, { append } = {}) => {
    const { importedRows, ambiguities: newAmbiguities } = applyInvoiceImportMapping(
      invoiceImportFile.rows, invoiceImportFile.headers, mapping, refs, makeRow,
    );
    setRows((prev) => {
      const next = append ? prev.concat(importedRows) : importedRows;
      return next.length === 0 ? [makeRow()] : next;
    });
    setInvoiceImportStatus(t({
      ar: `تم ✓ — تمت تعبئة ${importedRows.length} سطر من الملف المرفوع.`,
      en: `Done ✓ — ${importedRows.length} row(s) filled in from the uploaded file.`,
    }));
    setInvoiceImportFile({ headers: [], rows: [] });
    setInvoiceImportGuesses(null);
    setAmbiguities(newAmbiguities);
    return { importedCount: importedRows.length };
  }, [invoiceImportFile, refs, makeRow, t]);

  // selections: [{rowId, field, value}] — يطابق بنية box.dataset.pending الأصلية عند التطبيق.
  const applyAmbiguityResolutions = useCallback((selections) => {
    let appliedCount = 0;
    setRows((prev) => {
      const byId = new Map(prev.map((r) => [r.id, { ...r }]));
      selections.forEach(({ rowId, field, value }) => {
        if (!value) return;
        const row = byId.get(rowId);
        if (row) { row[field] = value; appliedCount++; }
      });
      const next = prev.map((r) => byId.get(r.id));
      return fillDownHeaderFields(next); // ينشر الرقم المرجعي المختار على بقية صفوف نفس الفاتورة
    });
    setAmbiguities([]);
    return appliedCount;
  }, []);

  /* ========================= الخطوة 2: الجدول وإدخال البيانات ========================= */

  const addInvoiceRow = useCallback(() => {
    // [إصلاح] كان يُعبَّأ بصيغة ISO (2026-09-02) فيُصدَّر حرفيًا كذلك بعمود يتطلب
    // dd/mm/yyyy — التحقق كان ينبّه "سيُكتب كـ.." كتحذير غير حاجب فقط، ثم يُكتب الأصل.
    setRows((prev) => [...prev, makeRow({ D: toDMY(new Date().toISOString().slice(0, 10)) })]);
  }, [makeRow]);

  const addItemRow = useCallback(() => {
    setRows((prev) => {
      if (prev.length === 0) return [makeRow()];
      const last = prev[prev.length - 1];
      const copy = makeRow();
      HEADER_COLS.forEach((k) => { copy[k] = last[k]; });
      ITEM_COLS.forEach((k) => { copy[k] = ''; });
      return [...prev, copy];
    });
  }, [makeRow]);

  const clearAllRows = useCallback(() => { setRows([]); }, []);

  const setDateFormat = useCallback((sep) => {
    setDateSepGlobal(sep);
    setDateSepState(sep);
    setRows((prev) => reformatAllDates(prev));
  }, []);

  // revalidate: true لخطوة 3 (data-grid-2 يعيد التحقق مع كل تعديل)، false/undefined لخطوة 2
  // (data-grid لا يعيد التحقق آليًا) — القاعدة #3 بالخطة.
  const updateCell = useCallback((rowId, colKey, rawValue, { revalidate } = {}) => {
    const colDef = COLUMNS.find((c) => c.key === colKey);
    const v = colDef && colDef.type === 'date' ? toDMY(rawValue) : rawValue;
    setRows((prev) => {
      const next = prev.map((r) => (r.id === rowId ? { ...r, [colKey]: v } : r));
      if (revalidate) setIssues(runValidation(next, refs));
      return next;
    });
  }, [refs]);

  const deleteRow = useCallback((rowId, { revalidate } = {}) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== rowId);
      if (revalidate) setIssues(runValidation(next, refs));
      return next;
    });
  }, [refs]);

  // اللصق الذكي يعمل من كل من جدولي الخطوة 2 والخطوة 3؛ الفرق الوحيد إعادة التحقق (القاعدة #3).
  const pasteGrid = useCallback((startRowId, startColKey, clipboardText, { revalidate } = {}) => {
    setRows((prev) => {
      const next = applyPastedGrid(prev, startRowId, startColKey, clipboardText, makeRow);
      if (revalidate) setIssues(runValidation(next, refs));
      return next;
    });
  }, [refs, makeRow]);

  /* ========================= الخطوة 3: التحقق ========================= */

  // تسلسل goStep(3) الجانبي حرفيًا بالترتيب (القاعدة #7 بالخطة):
  // resolveNamesToRefs → snapTaxCategoriesInRows → fillDownHeaderFields → runValidation.
  const enterStep3 = useCallback(() => {
    setRows((prev) => {
      const resolved = resolveNamesToRefs(prev, false, customersRef, productsRef).rows;
      const snapped = snapTaxCategoriesInRows(resolved, template.dropdowns.V);
      const filled = fillDownHeaderFields(snapped);
      setIssues(runValidation(filled, refs));
      return filled;
    });
  }, [customersRef, productsRef, template, refs]);

  const missingLocationGroups = useMemo(() => {
    if (!template.loaded || !template.dropdowns.G.length) return [];
    return findInvoicesMissingLocation(rows);
  }, [template, rows]);

  const applyMissingLocation = useCallback((keys, location) => {
    if (!location) return;
    const keySet = new Set(keys);
    setRows((prev) => {
      const next = prev.map((r) => {
        const k = norm(r.A) || ('__blank__' + r.id);
        return keySet.has(k) ? { ...r, G: location } : r;
      });
      setIssues(runValidation(next, refs));
      return next;
    });
  }, [refs]);

  const stats = useMemo(() => {
    const errCount = issues.list.filter((i) => i.sev === 'err').length;
    const warnCount = issues.list.filter((i) => i.sev === 'warn').length;
    const groups = groupRowsByInvoiceRef(rows);
    let okInvoices = 0;
    groups.forEach((rowsInGroup, key) => {
      const anyErr = rowsInGroup.some((r) => issues.byRow[r.id] && Object.values(issues.byRow[r.id]).some((arr) => arr.some((i) => i.sev === 'err')));
      if (!anyErr && !key.startsWith('__blank__')) okInvoices++;
    });
    return { total: rows.length, err: errCount, warn: warnCount, okInvoices };
  }, [rows, issues]);

  /* ========================= الخطوة 4: التصدير ========================= */

  const revokePrevExportUrl = useCallback(() => {
    if (prevExportUrlRef.current) { try { URL.revokeObjectURL(prevExportUrlRef.current); } catch { /* تجاهل */ } }
  }, []);

  const validOnlyRows = useMemo(() => getValidOnlyRows(rows, issues.byRow), [rows, issues]);

  // [إضافة] فواتير نقص الكمية "القابلة للإرسال كمسودة" (تحذير لا خطأ حاجب —
  // فقط لو المخزون مجلوب عبر API، راجع stockSimulation.js) — تُستخدَم بلوحة
  // مراجعة الخطوة 4 (StockShortageReviewPanel) قبل الإرسال الفعلي عبر API.
  const stockShortageGroups = useMemo(() => getStockShortageDraftGroups(rows, issues.byRow), [rows, issues]);

  // kind: 'all' | 'validOnly' — يطابق downloadRowsAsXlsx(state.rows) مقابل downloadRowsAsXlsx(getValidOnlyRows()).
  const exportFinal = useCallback(async (kind) => {
    setExportBusy(true); setExportError('');
    try {
      const subset = kind === 'validOnly' ? validOnlyRows : rows;
      const blob = await generateFinalXlsx(subset, template);
      revokePrevExportUrl();
      const result = triggerXlsxDownload(blob, kind === 'validOnly' ? '_partial' : '');
      prevExportUrlRef.current = result.url;
      setExportResult(result);
      return result;
    } catch (err) {
      setExportError(err.message || String(err));
      return null;
    } finally {
      setExportBusy(false);
    }
  }, [rows, validOnlyRows, template, revokePrevExportUrl]);

  const resetExport = useCallback(() => { revokePrevExportUrl(); setExportResult(null); setExportError(''); }, [revokePrevExportUrl]);

  // [إضافة] إرسال الفواتير الجاهزة مباشرة عبر Qoyod API — بديل اختياري لتنزيل
  // ملف القالب النهائي (exportFinal أعلاه، لا تُعدَّل). يُستدعى فقط من Step4Export
  // بضغطة صريحة، وبعد نفس شرط errCount===0 المستخدم أصلاً لتفعيل التصدير اليدوي.
  // [إضافة] excludeRefs: مراجع فواتير (row.A) تُستبعَد من هذه الدفعة بالكامل —
  // تُستخدَم من StockShortageReviewPanel عند "تجاهل الفواتير الناقصة" (كل مراجع
  // stockShortageGroups) أو "إرسال جزء منها فقط" (المراجع غير المحدَّدة). forceDraftRefs
  // يُمرَّر مباشرة لـpushSalesInvoicesToQoyod (راجع تعليق رأسه). بلا الاثنين
  // (الاستخدام الافتراضي بلا فواتير محفوفة بالمخاطر)، السلوك كما كان تمامًا.
  const sendInvoicesViaApi = useCallback(async (key, { status, excludeRefs, forceDraftRefs } = {}) => {
    apiSendStoppedRef.current.current = false;
    setApiSendBusy(true); setApiSendResult(null); setApiSendEntries([]); setApiSendProgress({ current: 0, total: 0 });
    const targetRows = excludeRefs && excludeRefs.size ? rows.filter((r) => !excludeRefs.has(norm(r.A))) : rows;
    const result = await pushSalesInvoicesToQoyod(targetRows, key, {
      productsIndex: productsRef,
      locationIdByName,
      status,
      forceDraftRefs,
      stoppedRef: apiSendStoppedRef.current,
      onProgress: (current, total) => setApiSendProgress({ current, total }),
      onEntry: (entry) => setApiSendEntries((prev) => [...prev, entry]),
    });
    setApiSendResult(result);
    setApiSendBusy(false);
    return result;
  }, [rows, productsRef, locationIdByName]);

  const stopApiSend = useCallback(() => { apiSendStoppedRef.current.current = true; }, []);

  // [إضافة] "إعادة تعيين" — مسح كل بيانات الجلسة الحالية (الملفات المرفوعة/المجلوبة، الصفوف،
  // نتائج التحقق والتصدير والإرسال) والعودة للخطوة 1، بنفس مبدأ resetAll بأداتي الشجرة
  // والقيود. لا يمسّ: rowSeqRef (لا يُصفَّر أبدًا طوال الجلسة — قاعدة قائمة أصلاً)، apiKey
  // المكتوب حاليًا بالحقل، ولا قاموس savedKeys المحفوظ بـlocalStorage (يبقى متاحًا للاستخدام
  // فورًا بعد إعادة التعيين، تمامًا كما لا يمسح resetAll بـMergeTool.jsx مفاتيحه المحفوظة).
  const resetAll = useCallback(() => {
    setStep(1);
    setTemplate(EMPTY_TEMPLATE);
    setProductsRef(EMPTY_REF);
    setStockRef(EMPTY_REF);
    setCustomersRef(EMPTY_REF);
    setInvoiceImportFile({ headers: [], rows: [] });
    setInvoiceImportGuesses(null);
    setInvoiceImportStatus('');
    setUploadError('');
    setRows([]);
    setIssues(EMPTY_ISSUES);
    setAmbiguities([]);
    revokePrevExportUrl();
    setExportBusy(false);
    setExportResult(null);
    setExportError('');
    setApiFetchBusy(false);
    setApiFetchError('');
    setApiFetchSummary(null);
    setLocationIdByName(null);
    apiSendStoppedRef.current.current = false;
    setApiSendBusy(false);
    setApiSendResult(null);
    setApiSendEntries([]);
    setApiSendProgress({ current: 0, total: 0 });
  }, [revokePrevExportUrl]);

  /* ========================= التنقل بين الخطوات ========================= */

  // نفس شرط goStep الأصلي: n===1 أو القالب محمَّل — الفارق أن القرار هنا في المكوّن (تعطيل التبويب)
  // وهذه الدالة فقط تنفّذ الانتقال والتأثيرات الجانبية المرتبطة بكل خطوة.
  const goToStep = useCallback((n) => {
    if (n === 3) enterStep3();
    if (n === 4) resetExport();
    setStep(n);
  }, [enterStep3, resetExport]);

  // [إضافة] قالب قيود يصبح اختياريًا فقط عند جلب المرجعيات الثلاث (منتجات/مخزون/
  // عملاء) فعليًا عبر API — apiFetchSummary لا يُعبَّأ إلا بعد نجاح
  // fetchReferencesFromApi الكامل. الرفع اليدوي بلا قالب يبقى كما كان دومًا
  // (غير كافٍ للمتابعة) — الاستثناء محصور بمسار API فقط كما طُلب بالتحديد.
  const readyForStep2 = template.loaded || !!apiFetchSummary;

  return {
    step, goToStep, readyForStep2,
    template, productsRef, stockRef, customersRef,
    uploadTemplate, uploadReferenceFile, confirmReferenceMapping, uploadError,

    invoiceImportFile, invoiceImportGuesses, invoiceImportStatus, hasExistingData,
    uploadInvoiceImportFile, cancelInvoiceImportMapping, confirmInvoiceImportMapping,
    ambiguities, applyAmbiguityResolutions,

    rows, dateSep, setDateFormat,
    addInvoiceRow, addItemRow, clearAllRows, updateCell, deleteRow, pasteGrid,

    issues, stats, missingLocationGroups, applyMissingLocation, revalidateNow,

    validOnlyRows, exportBusy, exportResult, exportError, exportFinal, resetExport,
    stockShortageGroups,

    refs, makeRow,

    // [إضافة] جلب/إرسال عبر Qoyod API
    apiKey, apiFetchBusy, apiFetchError, apiFetchSummary, fetchReferencesFromApi,
    apiSendBusy, apiSendResult, apiSendEntries, apiSendProgress, sendInvoicesViaApi, stopApiSend,

    // [إضافة] حفظ مفتاح API باسم العميل + إعادة التعيين
    customerName, setCustomerName, savedKeys, saveApiKeyForCustomer, loadSavedApiKey, removeSavedApiKey,
    resetAll,
  };
}
