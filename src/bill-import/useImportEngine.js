/**
 * useImportEngine.js — كل حالة الأداة ومنطق تشغيلها في خطّاف واحد.
 * المكونات تعرض فقط؛ لا منطق أعمال داخلها.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../language.jsx';
import { fetchCatalog, DEFAULT_BASE } from './lib/api.js';
import { readTemplate } from './lib/template.js';
import { tplTax, findProdBySku, isBuyable } from './lib/matching.js';
import { readWorkbook, sheetToAoa, guessHeaderRow, buildHeaders, buildRows, readListFile, findKey } from './lib/clientFile.js';
import { autoMap } from './lib/mapping.js';
import { validateAll, rowErr, rowWarn, groupsOf, groupSubtotal, spreadDocDisc, tplHasDocDisc } from './lib/validation.js';
import { invoiceGroups, exportInvoices, errorReportBlob, saveBlob, stamp, layout } from './lib/exporter.js';
import { num, truthy, norm } from './lib/text.js';

const EMPTY_CATALOG = { products: [], vendors: [], taxes: [], units: [], locations: [] };

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
  const [tpl, setTpl] = useState(null);
  const templateFile = useRef(null);

  const [wb, setWb] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [aoa, setAoa] = useState([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [headers, setHeaders] = useState([]);
  const [map, setMap] = useState({});
  const [totalBasis, setTotalBasis] = useState('excl');

  const [rows, setRows] = useState([]);
  const [tick, setTick] = useState(0);              // لإعادة الرسم بعد تعديل مباشر

  const note = useCallback((k, kind, text) => setNotes((n) => ({ ...n, [k]: text ? { kind, text } : null })), []);
  const fail = useCallback((k, e) => { note(k, 'err', e.message || String(e)); onError && onError(e); }, [note, onError]);

  /* ---------- الخطوة ١ ---------- */
  const connect = useCallback(async () => {
    if (!apiKey.trim()) return note('api', 'err', t({ ar: 'أدخل مفتاح الواجهة أولاً.', en: 'Enter the API key first.' }));
    setBusy(true); note('api', '', '');
    try {
      const cat = await fetchCatalog({ base: baseUrl, proxy, apiKey: apiKey.trim() }, tpl);
      setCatalog(cat);
      const warns = (cat.warnings || []);
      // نعرض ما لم يُجلَب فعلًا بدل رسالة نجاح مطلقة تخفي قوائم مُلفَّقة
      note('api', warns.length ? 'warn' : 'ok',
        warns.length
          ? t({ ar: `تم جلب بيانات المنشأة جزئيًا — ${warns.join(' ')}`, en: `Fetched the account's data partially — ${warns.join(' ')}` })
          : t({ ar: 'تم جلب بيانات المنشأة.', en: "Fetched the account's data." }));
      if (cat.products.length && cat.vendors.length) { setMaxStep((s) => Math.max(s, 2)); setStep(2); }
    } catch (e) {
      note('api', 'err',
        t({
          ar: `تعذّر الاتصال: ${e.message}. المتصفح يمنع الاتصال المباشر بواجهة قيود غالباً (CORS) — استخدم وسيطاً محلياً أو ارفع القوائم يدوياً.`,
          en: `Connection failed: ${e.message}. The browser usually blocks a direct connection to the Qoyod API (CORS) — use a local proxy or upload the lists manually.`,
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
      note('manual', 'ok', t({ ar: 'تم اعتماد القوائم المرفوعة.', en: 'The uploaded lists were adopted.' }));
      if (next.products.length && next.vendors.length) { setMaxStep((s) => Math.max(s, 2)); setStep(2); }
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

  return {
    // حالة
    step, maxStep, busy, notes, catalog, tpl, templateName: templateFile.current?.name || '',
    wb, sheetName, aoa, headerRow, headers, map, rows, groups, totalBasis,
    apiKey, baseUrl, proxy,
    // مشتقات
    layoutCols: layout(tpl),
    hasDocDisc: tplHasDocDisc(tpl),
    stats: {
      bad: rows.filter(rowErr).length,
      warn: rows.filter(rowWarn).length,
      ok: rows.filter((r) => !rowErr(r) && !rowWarn(r)).length,
      invoices: groups.length,
      badInvoices: groups.filter((g) => g.bad).length
    },
    // أفعال
    setStep, setApiKey, setBaseUrl, setProxy, setTotalBasis,
    connect, loadTemplate, loadManualLists,
    loadClientFile, changeSheet, changeHeaderRow, assign, ignoreColumn, runMatch,
    revalidate, updateRow, setVendorFor, setProductFor, setGroupLocation, setGroupDocDisc, spreadDiscount,
    doExport,
    helpers: { rowErr, rowWarn, groupsOf, groupSubtotal }
  };
}
