/**
 * useImportEngine.js — كل حالة الأداة ومنطق تشغيلها في خطّاف واحد.
 * المكونات تعرض فقط؛ لا منطق أعمال داخلها.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../language.jsx';
import { fetchCatalog, DEFAULT_BASE } from './lib/api.js';
import { readTemplate } from './lib/template.js';
import { tplTax, findProdBySku, isBuyable } from './lib/matching.js';
import { readWorkbook, sheetToAoa, guessHeaderRow, buildHeaders, buildRows, readListFile, findKey } from './lib/clientFile.js';
import { autoMap } from './lib/mapping.js';
import { validateAll, rowErr, rowWarn, groupsOf, groupSubtotal, spreadDocDisc, tplHasDocDisc } from './lib/validation.js';
import { invoiceGroups, exportInvoices, errorReportBlob, saveBlob, stamp, layout } from './lib/exporter.js';
import { num, truthy, norm } from './lib/text.js';
import { pushBillsToQoyod } from './lib/billsPush.js';
import { buildSendResultsReportBlob } from './lib/billsSendResultsReport.js';
import { getSavedKeys, saveKeysToStorage } from '../product-upload/io/keyStorage.js';

const EMPTY_CATALOG = { products: [], vendors: [], taxes: [], units: [], locations: [], accounts: [], inventoriesFull: [] };

export default function useImportEngine({ apiKey: apiKeyProp = '', apiBaseUrl = DEFAULT_BASE, corsProxy = '', onExport, onError } = {}) {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);

  const [apiKey, setApiKey] = useState(apiKeyProp);
  const [baseUrl, setBaseUrl] = useState(apiBaseUrl);
  const [proxy, setProxy] = useState(corsProxy);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState({});           // رسائل الشاشات

  const [catalog, setCatalog] = useState(EMPTY_CATALOG);
  // [إضافة] مصدر catalog الحالي — 'api' فقط يعني أن vendors/products/taxes تحمل
  // معرّفات (id) حقيقية بقيود (لا null)، وهو الشرط الوحيد لإتاحة "الإرسال عبر
  // API" (billsPush.js) لاحقاً؛ 'manual' (رفع قوائم يدوية) يُبقي id=null دوماً
  // فيبقى تصدير الملف اليدوي متاحاً كالمعتاد لكن الإرسال المباشر معطَّلاً.
  const [catalogSource, setCatalogSource] = useState(null);
  const [tpl, setTpl] = useState(null);
  const templateFile = useRef(null);

  // [إضافة 2026-09-14] جاهزية الانتقال للخطوة 2 — راجع تعليق connect() فوق
  // لسبب إزالة الشرط القديم (عدد منتجات/موردين). الشرط الفعلي الصحيح هنا: وجود
  // ضرائب ومواقع صالحة بالكتالوج — يتحقق بصرف النظر عن مصدره (قالب/API/رفع
  // يدوي)، ويكفي فعليًا لبدء خطوة المطابقة (التي لا تحتاج مسبقًا مطابقة كل
  // منتج/مورد ناجحة، هذا دورها هي بالضبط). مشتقة مباشرة من catalog — بلا حالة
  // إضافية منفصلة يمكن أن تفلت من المزامنة.
  const readyForStep2 = catalog.taxes.length > 0 && catalog.locations.length > 0;
  useEffect(() => {
    if (readyForStep2) setMaxStep((s) => Math.max(s, 2));
  }, [readyForStep2]);

  const [wb, setWb] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [aoa, setAoa] = useState([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [headers, setHeaders] = useState([]);
  const [map, setMap] = useState({});
  const [totalBasis, setTotalBasis] = useState('excl');

  const [rows, setRows] = useState([]);
  const [tick, setTick] = useState(0);              // لإعادة الرسم بعد تعديل مباشر

  // [إضافة] حفظ مفتاح API باسم العميل — نفس تخزين localStorage المشترك أصلاً
  // بين أدوات أخرى بالمشروع (keyStorage.js، مفتاح "qoyod_keys") — يظهر أيضاً
  // بتلك الأدوات والعكس.
  const [customerName, setCustomerName] = useState('');
  const [savedKeys, setSavedKeysState] = useState(() => getSavedKeys());
  const saveApiKeyForCustomer = useCallback(() => {
    const name = customerName.trim();
    if (!name || !apiKey.trim()) return;
    const next = { ...savedKeys, [name]: apiKey.trim() };
    saveKeysToStorage(next);
    setSavedKeysState(next);
  }, [customerName, apiKey, savedKeys]);
  const loadSavedApiKey = useCallback((name) => {
    if (savedKeys[name]) { setApiKey(savedKeys[name]); setCustomerName(name); }
  }, [savedKeys]);
  const removeSavedApiKey = useCallback((name) => {
    const next = { ...savedKeys };
    delete next[name];
    saveKeysToStorage(next);
    setSavedKeysState(next);
  }, [savedKeys]);

  // [إضافة] إرسال الفواتير السليمة مباشرة عبر API (POST /bills، billsPush.js)
  // — بديل/بجانب تنزيل ملف الاستيراد اليدوي (doExport). متاح فقط لو catalogSource
  // === 'api' (كل المعرّفات الحقيقية اللازمة — مورد/منتج/ضريبة/موقع — متوفرة
  // فعلياً فقط حين catalog مصدرها الاتصال المباشر، لا رفع قوائم يدوية).
  const [apiSending, setApiSending] = useState(false);
  const [apiSendProgress, setApiSendProgress] = useState({ current: 0, total: 0 });
  const [apiSendResult, setApiSendResult] = useState(null);
  const apiStoppedRef = useRef({ current: false });

  const note = useCallback((k, kind, text) => setNotes((n) => ({ ...n, [k]: text ? { kind, text } : null })), []);
  const fail = useCallback((k, e) => { note(k, 'err', e.message || String(e)); onError && onError(e); }, [note, onError]);

  /* ---------- الخطوة ١ ---------- */
  // [إصلاح خطأ حقيقي مبلَّغ ميدانياً 2026-09-14] بلاغ مستخدم: "لم يجلب البيانات
  // او يظهر لي خيار للانتقال الى الصفحة التالية" — السبب: connect()/loadManualLists
  // كانا يشترطان products.length && vendors.length معًا (الاثنان غير صفر) قبل
  // فتح الخطوة التالية تلقائيًا. منشأة عميل جديدة (صفر منتجات أو صفر موردين
  // بعد) كانت تُعلِّق الأداة كليًا بلا أي طريقة للمتابعة رغم نجاح الجلب/الرفع
  // فعليًا (الفواتير لا تحتاج مطابقة كل منتج/مورد ناجحة مسبقًا — هذا دور خطوة
  // المطابقة التالية، لا شرط دخول لها). التصحيح: أُزيل القفز التلقائي القديم من
  // هنا بالكامل — الجاهزية الآن تُحسَب تفاعليًا (`readyForStep2` تحت) من وجود
  // ضرائب/مواقع صالحة بالكتالوج (شرط ضروري وكافٍ فعليًا لخطوة المطابقة، يتحقق
  // بصرف النظر عن مصدره: القالب يملؤه فورًا عند رفعه، وconnect()/loadManualLists
  // كلاهما يملآنه أيضًا) — بلا أي اعتماد على عدد المنتجات/الموردين إطلاقًا.
  const connect = useCallback(async () => {
    if (!apiKey.trim()) return note('api', 'err', t({ ar: 'أدخل مفتاح الواجهة أولاً.', en: 'Enter the API key first.' }));
    setBusy(true); note('api', '', '');
    try {
      const cat = await fetchCatalog({ base: baseUrl, proxy, apiKey: apiKey.trim() }, tpl);
      setCatalog(cat);
      setCatalogSource('api');
      const warns = (cat.warnings || []);
      // نعرض ما لم يُجلَب فعلًا بدل رسالة نجاح مطلقة تخفي قوائم مُلفَّقة
      note('api', warns.length ? 'warn' : 'ok',
        warns.length
          ? t({ ar: `تم جلب بيانات المنشأة جزئيًا — ${warns.join(' ')}`, en: `Fetched the account's data partially — ${warns.join(' ')}` })
          : t({ ar: 'تم جلب بيانات المنشأة.', en: "Fetched the account's data." }));
    } catch (e) {
      // [إصلاح] الرسالة القديمة كانت تفترض دومًا سبب CORS وتحيل لحقل "وسيط"
      // محذوف الآن (الاتصال يمر تلقائيًا عبر وكيل الخادم المشترك — راجع تعليق
      // رأس lib/api.js) — تُعرض رسالة الخطأ الحقيقية فقط، مع بديل الرفع اليدوي.
      note('api', 'err',
        t({
          ar: `تعذّر الاتصال: ${e.message}. تأكد من صحة مفتاح API، أو ارفع القوائم يدوياً كبديل.`,
          en: `Connection failed: ${e.message}. Make sure the API key is correct, or upload the lists manually instead.`,
        }));
      onError && onError(e);
    } finally { setBusy(false); }
  }, [apiKey, baseUrl, proxy, tpl, note, onError, t]);

  const loadTemplate = useCallback(async (file) => {
    note('tpl', 'info', t({ ar: 'جاري قراءة القالب…', en: 'Reading the template…' }));
    try {
      const tp = await readTemplate(file);
      if (!tp.locations.length && !tp.taxes.length) throw new Error(t({ ar: 'لم يُعثر على قوائم منسدلة — تأكد أنه قالب استيراد فواتير المشتريات', en: 'No dropdown lists found — make sure this is the purchase invoice import template' }));
      templateFile.current = file;
      setTpl(tp);
      setCatalog((c) => ({ ...c, locations: tp.locations.slice(), taxes: tp.taxes.map(tplTax).filter((x) => x.percent != null) }));
      const taxCol = tp.columns.find((c) => c.key === 'tax');
      const dup = tp.taxes.length - new Set(tp.taxes.map((x) => tplTax(x).percent)).size;
      const missing = ['docDiscVal', 'unit'].filter((k) => !tp.columns.some((c) => c.key === k));
      note('tpl', 'ok',
        t({
          ar: `تم اعتماد قوائم القالب من ورقة «${tp.sheetName}» — ${tp.columns.length} عموداً، والضريبة في العمود «${taxCol ? taxCol.letter : '؟'}».`
            + (missing.length ? ` هذه النسخة بلا ${missing.map((k) => (k === 'unit' ? 'عمود وحدة التحويل' : 'أعمدة خصم المستند')).join(' و')}.` : '')
            + (dup > 0 ? ` تنبيه: ${dup} ضريبة تتكرر نسبتها مع غيرها.` : ''),
          en: `Adopted the template's lists from sheet "${tp.sheetName}" — ${tp.columns.length} column(s), tax in column "${taxCol ? taxCol.letter : '?'}".`
            + (missing.length ? ` This version is missing ${missing.map((k) => (k === 'unit' ? 'a conversion-unit column' : 'document-discount columns')).join(' and ')}.` : '')
            + (dup > 0 ? ` Note: ${dup} tax(es) share a rate with another.` : ''),
        }));
    } catch (e) { fail('tpl', e); }
  }, [note, fail, t]);

  const loadManualLists = useCallback(async ({ productsFile, vendorsFile, taxesText, locationsText }) => {
    try {
      const next = { ...catalog };
      if (productsFile) {
        const list = await readListFile(productsFile);
        const h = list[0] || {};
        const s = findKey(h, ['sku', 'باركود', 'الرقم التسلسلي', 'كود', 'رمز']);
        const n = findKey(h, ['اسم', 'name']);
        const u = findKey(h, ['وحده', 'unit']);
        const buy = findKey(h, ['يشترى', 'يشتري', 'قابل للشراء', 'purchasable', 'is purchased', 'purchase', 'buy']);
        const act = findKey(h, ['مفعل', 'نشط', 'active', 'status']);
        next.products = list.map((r) => ({
          id: null, sku: String(s ? r[s] : ''), name: String(n ? r[n] : ''), unit: String(u ? r[u] : ''),
          taxPercent: null, purchasable: buy ? truthy(r[buy]) : null, active: act ? truthy(r[act]) : null, conversions: []
        })).filter((p) => p.sku || p.name);
      }
      if (vendorsFile) {
        const list = await readListFile(vendorsFile);
        const h = list[0] || {};
        const rf = findKey(h, ['الرقم المرجعي', 'reference', 'مرجع', 'كود']);
        const n = findKey(h, ['اسم', 'name']);
        const ph = findKey(h, ['جوال', 'هاتف', 'phone', 'mobile']);
        next.vendors = list.map((r) => ({
          id: null, ref: String(rf ? r[rf] : ''), name: String(n ? r[n] : ''),
          phone: String(ph ? r[ph] : '').replace(/\D/g, '')
        })).filter((v) => v.ref || v.name);
      }
      if (!tpl) {
        const tx = (taxesText || '').split('\n').map((l) => {
          const [a, b] = l.split('=');
          if (!a || !a.trim()) return null;
          return { id: null, name: a.trim(), percent: num(b) ?? num(a) };
        }).filter((x) => x && x.percent != null);
        if (tx.length) next.taxes = tx;
        const lc = (locationsText || '').split('\n').map((s) => s.trim()).filter(Boolean);
        if (lc.length) next.locations = lc;
      }
      if (!next.taxes.length) return note('manual', 'err', t({ ar: 'ارفع القالب المعتمد، أو عرّف ضريبة واحدة بصيغة «الاسم = النسبة».', en: 'Upload the approved template, or define one tax in the form "name = rate".' }));
      if (!next.locations.length) return note('manual', 'err', t({ ar: 'ارفع القالب المعتمد، أو أدخل اسم موقع واحد على الأقل.', en: 'Upload the approved template, or enter at least one location name.' }));
      setCatalog(next);
      setCatalogSource('manual');
      note('manual', 'ok', t({ ar: 'تم اعتماد القوائم المرفوعة.', en: 'The uploaded lists were adopted.' }));
      // [إصلاح خطأ حقيقي] راجع تعليق connect() أعلاه — نفس القفز التلقائي
      // القديم المشروط بعدد المنتجات/الموردين أُزيل من هنا أيضًا لنفس السبب.
    } catch (e) { fail('manual', e); }
  }, [catalog, tpl, note, fail, t]);

  /* ---------- الخطوة ٢ ---------- */
  const pickSheet = useCallback((book, name) => {
    const rowsAoa = sheetToAoa(book, name);
    const hr = guessHeaderRow(rowsAoa);
    const hs = buildHeaders(rowsAoa, hr);
    const { map: m } = autoMap(rowsAoa, hr, hs, catalog, tpl);
    setSheetName(name); setAoa(rowsAoa); setHeaderRow(hr); setHeaders(hs); setMap(m);
  }, [catalog, tpl]);

  const loadClientFile = useCallback(async (file) => {
    try {
      const book = await readWorkbook(file);
      setWb(book);
      pickSheet(book, book.SheetNames[0]);
      note('client', 'ok', t({ ar: `تمت قراءة ${file.name} — ${book.SheetNames.length} ورقة.`, en: `Read ${file.name} — ${book.SheetNames.length} sheet(s).` }));
    } catch (e) { fail('client', e); }
  }, [pickSheet, note, fail, t]);

  const changeSheet = useCallback((name) => { if (wb) pickSheet(wb, name); }, [wb, pickSheet]);

  const changeHeaderRow = useCallback((hr) => {
    const hs = buildHeaders(aoa, hr);
    const { map: m } = autoMap(aoa, hr, hs, catalog, tpl);
    setHeaderRow(hr); setHeaders(hs); setMap(m);
  }, [aoa, catalog, tpl]);

  const assign = useCallback((key, colIdx) => {
    setMap((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (next[k] === colIdx) delete next[k]; });
      if (colIdx == null) delete next[key]; else next[key] = colIdx;
      return next;
    });
  }, []);

  const ignoreColumn = useCallback((colIdx) => {
    setMap((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (next[k] === colIdx) delete next[k]; });
      return next;
    });
  }, []);

  const runMatch = useCallback(() => {
    const body = aoa.slice(headerRow + 1).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
    if (!body.length) return note('client', 'err', t({ ar: 'لا توجد صفوف بيانات بعد صف العناوين.', en: 'No data rows found after the header row.' }));
    if (body.length > 5000) note('client', 'warn', t({ ar: `الملف يحتوي ${body.length} صفاً، والحد الأقصى في قيود ٥٠٠٠ صف.`, en: `The file has ${body.length} row(s); Qoyod's maximum is 5,000 rows.` }));
    const built = buildRows(aoa, headerRow, map, catalog);
    validateAll(built, catalog, tpl, { totalBasis, hasTaxColumn: map.tax != null });
    setRows(built);
    setMaxStep((s) => Math.max(s, 3));
    setStep(3);
  }, [aoa, headerRow, map, catalog, tpl, totalBasis, note, t]);

  /* ---------- الخطوة ٣ ---------- */
  const revalidate = useCallback((mutate) => {
    setRows((prev) => {
      const next = prev.slice();
      if (mutate) mutate(next);
      validateAll(next, catalog, tpl, { totalBasis, hasTaxColumn: map.tax != null });
      return next;
    });
    setTick((t) => t + 1);
  }, [catalog, tpl, totalBasis, map]);

  const updateRow = useCallback((row, patch) => revalidate((list) => {
    const r = list.find((x) => x === row);
    if (r) Object.assign(r, patch);
  }), [revalidate]);

  const setVendorFor = useCallback((row, value, propagate) => revalidate((list) => {
    const v = catalog.vendors.find((x) => norm(x.ref) === norm(value))
      || catalog.vendors.find((x) => norm(x.name) === norm(value));
    const ref = v ? v.ref : String(value || '').trim();
    const key = norm(row.vendorNameRaw || row.vendorRefRaw);
    list.forEach((r) => {
      if (r === row || (propagate && norm(r.vendorNameRaw || r.vendorRefRaw) === key)) {
        r.vendorRef = ref; r.vendorBy = 'manual'; r.vendorCands = [];
      }
    });
  }), [catalog, revalidate]);

  const setProductFor = useCallback((row, value, propagate) => revalidate((list) => {
    const byName = catalog.products.filter((p) => norm(p.name) === norm(value));
    const p = findProdBySku(catalog.products, value) || byName.find(isBuyable) || byName[0];
    const sku = p ? p.sku : String(value || '').trim();
    const key = norm(row.prodNameRaw || row.prodRefRaw);
    list.forEach((r) => {
      if (r === row || (propagate && norm(r.prodNameRaw || r.prodRefRaw) === key)) {
        r.prodSku = sku; r.prodBy = 'manual'; r.prodCands = [];
      }
    });
  }), [catalog, revalidate]);

  const setGroupLocation = useCallback((ref, loc) => revalidate((list) => {
    list.forEach((r) => { if (r.ref === ref) r.location = loc; });
  }), [revalidate]);

  const setGroupDocDisc = useCallback((ref, patch) => revalidate((list) => {
    list.forEach((r) => { if (r.ref === ref) Object.assign(r, patch); });
  }), [revalidate]);

  const spreadDiscount = useCallback((ref) => revalidate((list) => spreadDocDisc(list, ref)), [revalidate]);

  /* ---------- الخطوة ٤ ---------- */
  const groups = useMemo(() => invoiceGroups(rows), [rows, tick]);

  const doExport = useCallback(async (kind) => {
    const gs = kind === 'valid' ? groups.filter((g) => !g.bad) : groups;
    if (kind === 'errors') {
      const blob = errorReportBlob(rows);
      const filename = `qoyod-import-issues-${stamp()}.xlsx`;
      saveBlob(blob, filename);
      onExport && onExport({ kind, filename, blob, invoices: [] });
      return;
    }
    if (!gs.length) return;
    const filename = `qoyod-bills-${kind}-${stamp()}.xlsx`;
    const { blob, usedTemplate, error } = await exportInvoices(gs, { tpl, templateFile: templateFile.current });
    saveBlob(blob, filename);
    note('export', usedTemplate ? 'ok' : 'warn',
      usedTemplate
        ? t({ ar: 'تمت الكتابة داخل القالب المرفوع دون تغيير في تنسيقه أو قوائمه.', en: 'Written into the uploaded template without changing its formatting or lists.' })
        : t({ ar: `صُدِّر ملف مبني بنفس بنية الأعمدة${error ? ` (${error})` : ''}.`, en: `Exported a file built with the same column structure${error ? ` (${error})` : ''}.` }));
    onExport && onExport({ kind, filename, blob, invoices: gs.map((g) => g.ref), usedTemplate });
  }, [groups, rows, tpl, note, onExport, t]);

  // فواتير سليمة 100% فقط (بلا أي خطأ مانع) — نفس شرط تفعيل "تحميل الفواتير
  // الصحيحة فقط" الحالي بالضبط (kind==='valid' بـdoExport أعلاه).
  const sendableGroups = useMemo(() => groups.filter((g) => !g.bad), [groups]);
  const canSendViaApi = catalogSource === 'api';

  const pushViaApi = useCallback(async () => {
    if (!sendableGroups.length) return;
    apiStoppedRef.current.current = false;
    setApiSending(true);
    setApiSendProgress({ current: 0, total: sendableGroups.length });
    setApiSendResult(null);
    const result = await pushBillsToQoyod(sendableGroups, apiKey, {
      catalog, baseUrl, proxy,
      onProgress: (current, total) => setApiSendProgress({ current, total }),
      stoppedRef: apiStoppedRef.current,
    });
    setApiSending(false);
    setApiSendResult(result);
  }, [sendableGroups, apiKey, catalog, baseUrl, proxy]);

  const stopApiSend = useCallback(() => { apiStoppedRef.current.current = true; }, []);

  const downloadApiSendResults = useCallback(async () => {
    if (!apiSendResult) return;
    const blob = await buildSendResultsReportBlob(sendableGroups, apiSendResult.entries, t);
    saveBlob(blob, `qoyod-bills-send-results-${stamp()}.xlsx`);
  }, [apiSendResult, sendableGroups, t]);

  return {
    // حالة
    step, maxStep, readyForStep2, busy, notes, catalog, catalogSource, tpl, templateName: templateFile.current?.name || '',
    wb, sheetName, aoa, headerRow, headers, map, rows, groups, totalBasis,
    apiKey, baseUrl, proxy,
    customerName, savedKeys,
    apiSending, apiSendProgress, apiSendResult,
    // مشتقات
    layoutCols: layout(tpl),
    hasDocDisc: tplHasDocDisc(tpl),
    sendableGroups, canSendViaApi,
    stats: {
      bad: rows.filter(rowErr).length,
      warn: rows.filter(rowWarn).length,
      ok: rows.filter((r) => !rowErr(r) && !rowWarn(r)).length,
      invoices: groups.length,
      badInvoices: groups.filter((g) => g.bad).length
    },
    // أفعال
    setStep, setApiKey, setBaseUrl, setProxy, setTotalBasis, setCustomerName,
    connect, loadTemplate, loadManualLists,
    saveApiKeyForCustomer, loadSavedApiKey, removeSavedApiKey,
    loadClientFile, changeSheet, changeHeaderRow, assign, ignoreColumn, runMatch,
    revalidate, updateRow, setVendorFor, setProductFor, setGroupLocation, setGroupDocDisc, spreadDiscount,
    doExport, pushViaApi, stopApiSend, downloadApiSendResults,
    helpers: { rowErr, rowWarn, groupsOf, groupSubtotal }
  };
}
