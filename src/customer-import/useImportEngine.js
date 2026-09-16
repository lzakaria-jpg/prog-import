/**
 * useImportEngine.js — كل حالة أداة استيراد العملاء ومنطق تشغيلها في خطّاف
 * واحد. المكونات تعرض فقط؛ لا منطق أعمال داخلها. نفس بنية
 * bill-import/useImportEngine.js حرفياً، مبسَّطة لمفهوم "عميل واحد = صف واحد"
 * (بلا أي تجميع بنود/فواتير).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../language.jsx';
import { readWorkbook, sheetToAoa, guessHeaderRow, buildHeaders, buildRows } from './lib/clientFile.js';
import { autoMap } from './lib/mapping.js';
import { validateAll, validateRowWithDuplicates, rowErr, rowWarn, rowReadyForApi } from './lib/validation.js';
import { buildContactIndex } from './lib/duplicateMatch.js';
import { suggestRefs } from './lib/refSuggest.js';
import { fetchExistingContacts } from './lib/api.js';
import { exportContacts, errorReportBlob, saveBlob, stamp } from './lib/exporter.js';
import { pushContactsToQoyod } from './lib/contactsPush.js';
import { buildSendResultsReportBlob } from './lib/sendResultsReport.js';
import { getSavedKeys, saveKeysToStorage } from '../product-upload/io/keyStorage.js';
import templateUrl from './assets/customer_import_template.xlsx?url';

export default function useImportEngine({ apiKey: apiKeyProp = '', onExport, onError } = {}) {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(2); // لا كتالوج يُشترط قبل رفع ملف العميل هنا (بخلاف bill-import)

  const [apiKey, setApiKey] = useState(apiKeyProp);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState({});

  const [existingContacts, setExistingContacts] = useState([]);
  const [connected, setConnected] = useState(false);

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

  const note = useCallback((k, kind, text) => setNotes((n) => ({ ...n, [k]: text ? { kind, text } : null })), []);
  const fail = useCallback((k, e) => { note(k, 'err', e.message || String(e)); onError && onError(e); }, [note, onError]);

  /* ---------- الخطوة ١: الاتصال ---------- */
  const connect = useCallback(async () => {
    if (!apiKey.trim()) return note('api', 'err', t({ ar: 'أدخل مفتاح الواجهة أولاً.', en: 'Enter the API key first.' }));
    setBusy(true); note('api', '', '');
    try {
      const list = await fetchExistingContacts(apiKey.trim());
      setExistingContacts(list);
      setConnected(true);
      note('api', 'ok', t({ ar: `تم جلب ${list.length} جهة اتصال موجودة فعلاً — تُستخدم لكشف التكرار بالاسم فقط.`, en: `Fetched ${list.length} existing contact(s) — used for name-duplicate detection only.` }));
    } catch (e) {
      setConnected(false);
      note('api', 'err', t({
        ar: `تعذّر الاتصال: ${e.message}. تأكد من صحة مفتاح API. يمكنك المتابعة بلا اتصال، لكن بلا كشف تكرار أو إرسال مباشر.`,
        en: `Connection failed: ${e.message}. Make sure the API key is correct. You can continue without connecting, but without duplicate detection or direct sending.`,
      }));
      onError && onError(e);
    } finally { setBusy(false); }
  }, [apiKey, note, onError, t]);

  /* ---------- الخطوة ٢: ملف العميل والربط ---------- */
  const [wb, setWb] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [aoa, setAoa] = useState([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [headers, setHeaders] = useState([]);
  const [map, setMap] = useState({});

  const [rows, setRows] = useState([]);
  const [tick, setTick] = useState(0);
  const [refBasis, setRefBasis] = useState(null);

  const pickSheet = useCallback((book, name) => {
    const rowsAoa = sheetToAoa(book, name);
    const hr = guessHeaderRow(rowsAoa);
    const hs = buildHeaders(rowsAoa, hr);
    const { map: m } = autoMap(rowsAoa, hr, hs);
    setSheetName(name); setAoa(rowsAoa); setHeaderRow(hr); setHeaders(hs); setMap(m);
  }, []);

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
    const { map: m } = autoMap(aoa, hr, hs);
    setHeaderRow(hr); setHeaders(hs); setMap(m);
  }, [aoa]);

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

  // فهرس جهات الاتصال للمطابقة السريعة — يُبنى مرة واحدة لكل قائمة مجلوبة، لا
  // لكل صف ولا لكل ضغطة زر (راجع تعليق buildContactIndex بـduplicateMatch.js).
  const contactIndex = useMemo(() => buildContactIndex(existingContacts), [existingContacts]);

  const runMatch = useCallback(() => {
    const body = aoa.slice(headerRow + 1).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
    if (!body.length) return note('client', 'err', t({ ar: 'لا توجد صفوف بيانات بعد صف العناوين.', en: 'No data rows found after the header row.' }));
    const built = buildRows(aoa, headerRow, map);
    const { rows: withRefs, basis } = suggestRefs(built, { key: 'ref' });
    setRefBasis(basis);
    validateAll(withRefs, existingContacts, contactIndex);
    setRows(withRefs);
    setMaxStep((s) => Math.max(s, 3));
    setStep(3);
  }, [aoa, headerRow, map, existingContacts, contactIndex, note, t]);

  /* ---------- الخطوة ٣: المراجعة ---------- */
  /** فحص شامل لكل الصفوف — زر "إعادة الفحص" فقط، لا يُستدعى عند تعديل خانة */
  const revalidate = useCallback((mutate) => {
    setRows((prev) => {
      const next = prev.slice();
      if (mutate) mutate(next);
      validateAll(next, existingContacts, contactIndex);
      return next;
    });
    setTick((x) => x + 1);
  }, [existingContacts, contactIndex]);

  /**
   * [إصلاح بطء مبلَّغ ميدانياً 2026-09-16] تعديل خانة واحدة يُعيد فحص صفها فقط،
   * لا كل صفوف الملف — نتيجة أي صف مستقلة تماماً عن بقية الصفوف هنا (بخلاف
   * bill-import حيث تُجمَّع البنود بفواتير وتتأثر ببعضها).
   */
  const updateRow = useCallback((row, patch) => {
    setRows((prev) => {
      const next = prev.slice();
      const r = next.find((x) => x === row);
      if (r) { Object.assign(r, patch); validateRowWithDuplicates(r, contactIndex); }
      return next;
    });
    setTick((x) => x + 1);
  }, [contactIndex]);

  /** قرار المستخدم الصريح لصف عليه تكرار بالاسم: إنشاء جديد / تحديث الموجود (بمعرّفه) / تجاوز */
  const setRowAction = useCallback((row, action, targetId) => {
    setRows((prev) => {
      const next = prev.slice();
      const r = next.find((x) => x === row);
      if (r) { r.action = action; r.updateTargetId = action === 'update' ? (targetId ?? (r.dupExact ? r.dupExact.id : null)) : null; }
      return next;
    });
    setTick((x) => x + 1);
  }, []);

  /* ---------- الخطوة ٤: التصدير/الإرسال ---------- */
  const goodRows = useMemo(() => rows.filter((r) => !rowErr(r)), [rows, tick]);
  const badRows = useMemo(() => rows.filter(rowErr), [rows, tick]);
  const sendableRows = useMemo(() => rows.filter(rowReadyForApi), [rows, tick]);
  const pendingDecisionRows = useMemo(() => rows.filter((r) => !rowErr(r) && (r.action === null || r.action === undefined)), [rows, tick]);
  const canSendViaApi = connected;

  const stats = useMemo(() => ({
    total: rows.length,
    bad: badRows.length,
    warn: rows.filter(rowWarn).length,
    ok: rows.filter((r) => !rowErr(r) && !rowWarn(r)).length,
    pendingDecision: pendingDecisionRows.length,
  }), [rows, tick, badRows, pendingDecisionRows]);

  const doExport = useCallback(async (kind) => {
    const list = kind === 'valid' ? goodRows : rows;
    if (kind === 'errors') {
      const blob = errorReportBlob(rows);
      const filename = `qoyod-customers-issues-${stamp()}.xlsx`;
      saveBlob(blob, filename);
      onExport && onExport({ kind, filename, blob, rows: [] });
      return;
    }
    if (!list.length) return;
    const filename = `qoyod-customers-${kind}-${stamp()}.xlsx`;
    try {
      const buf = await fetch(templateUrl).then((r) => r.arrayBuffer());
      const blob = exportContacts(list, buf);
      saveBlob(blob, filename);
      note('export', 'ok', t({ ar: 'تمت الكتابة داخل قالب قيود الرسمي (Import Customers) ابتداءً من الصف الثاني.', en: "Written into Qoyod's official template (Import Customers) starting from row 2." }));
      onExport && onExport({ kind, filename, blob, rows: list.map((r) => r.name) });
    } catch (e) { fail('export', e); }
  }, [goodRows, rows, onExport, note, fail, t]);

  const apiStoppedRef = useRef({ current: false });
  const [apiSending, setApiSending] = useState(false);
  const [apiSendProgress, setApiSendProgress] = useState({ current: 0, total: 0 });
  const [apiSendResult, setApiSendResult] = useState(null);

  const pushViaApi = useCallback(async () => {
    if (!sendableRows.length) return;
    apiStoppedRef.current.current = false;
    setApiSending(true);
    setApiSendProgress({ current: 0, total: sendableRows.length });
    setApiSendResult(null);
    const result = await pushContactsToQoyod(sendableRows, apiKey, {
      onProgress: (current, total) => setApiSendProgress({ current, total }),
      stoppedRef: apiStoppedRef.current,
    });
    setApiSending(false);
    setApiSendResult(result);
  }, [sendableRows, apiKey]);

  const stopApiSend = useCallback(() => { apiStoppedRef.current.current = true; }, []);

  const downloadApiSendResults = useCallback(async () => {
    if (!apiSendResult) return;
    const blob = await buildSendResultsReportBlob(sendableRows, apiSendResult.entries, t);
    saveBlob(blob, `qoyod-customers-send-results-${stamp()}.xlsx`);
  }, [apiSendResult, sendableRows, t]);

  useEffect(() => { if (headers.length) setMaxStep((s) => Math.max(s, 2)); }, [headers.length]);

  return {
    step, maxStep, busy, notes,
    apiKey, setApiKey,
    existingContacts, connected,
    customerName, savedKeys,
    wb, sheetName, aoa, headerRow, headers, map,
    rows, refBasis,
    apiSending, apiSendProgress, apiSendResult,
    goodRows, badRows, sendableRows, pendingDecisionRows, canSendViaApi,
    stats,
    setStep, setCustomerName,
    connect, saveApiKeyForCustomer, loadSavedApiKey, removeSavedApiKey,
    loadClientFile, changeSheet, changeHeaderRow, assign, ignoreColumn, runMatch,
    revalidate, updateRow, setRowAction,
    doExport, pushViaApi, stopApiSend, downloadApiSendResults,
    helpers: { rowErr, rowWarn },
  };
}
