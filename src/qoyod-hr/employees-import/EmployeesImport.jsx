/**
 * مُجهّز بيانات موظفي قيود اتش ار — يحوّل ملف موظفين بأي شكل (تصدير برنامج HR آخر، كشف يدوي،
 * CSV) إلى قالب الاستيراد الرسمي لقيود اتش ار: مطابقة أعمدة تلقائية، تنظيف وتحقق حسب قوائم قالب
 * الشركة نفسها، تصحيح داخل الجدول، ثم تعبئة القالب الرسمي جاهزًا للرفع (الموظفين ← إضافة جماعية).
 *
 * عقد TabbedTool: persistKey (حفظ واستعادة المدخلات)، onNameChange (اسم ملف العميل)،
 * onBusyChange (أثناء قراءة الملفات/تجهيز التنزيل)، و ref ({ requestStop }).
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../language.jsx';
import { loadSnapshot, useSnapshotPersist } from '../../lib/persistSnapshot.js';
import { downloadBlob } from '../../lib/downloadBlob.js';
import { FIELDS, FIELD_BY_KEY, GROUPS, VIRTUAL_FIELDS } from './lib/fields.js';
import {
  readClientFile, detectHeader, prepareSheet, mergePrepared, autoMap, analyzeWorkbook, buildRecords, processRecords,
  unmatchedValues, approxValues, cellText, columnSample, normKey, parseFollowup,
} from './lib/engine.js';
import { readTemplate, fillTemplate, buildReport, buildFollowup, followupRows } from './lib/template.js';
import { trMsg } from './lib/messages.js';
import DateField, { fmtDate } from './components/DateField.jsx';
import './styles/employees-import.css';

const STEPS = [{ ar: "الملفات", en: "Files" }, { ar: "المطابقة والمراجعة", en: "Mapping & review" }, { ar: "التصدير", en: "Export" }];
const LS_KEY = 'qhr-import-template-v1';
const LS_MAPS = 'qhr-import-maps-v1';
const PAGE = 40;
const STATUS_LABEL = { ok: { ar: "سليم", en: "OK" }, fixed: { ar: "مُصحَّح", en: "Fixed" }, review: { ar: "للمراجعة", en: "Review" }, error: { ar: "خطأ", en: "Error" }, empty: { ar: "فاضي", en: "Empty" } };

/* ---------- أدوات صغيرة ---------- */
const b64ToBuf = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
const bufToB64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const download = async (bytes, name) => {
  downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
};
// ملفات أكبر من هذا لا تُحفظ بلقطة التبويب (حد localStorage)، وتُرفع من جديد بعد إعادة التحميل
const SNAP_MAX_BYTES = 1.5 * 1024 * 1024;
const Icon = ({ d, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ICONS = {
  upload: 'M12 16V4m0 0L7 9m5-5l5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3',
  file: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5',
  check: 'M5 12l5 5L20 7',
  users: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 20a8 8 0 0116 0',
  down: 'M12 4v12m0 0l-5-5m5 5l5-5M4 20h16',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
};
// بصمة شكل الملف (عناوين الأعمدة) لحفظ المطابقة واسترجاعها لملفات نفس العميل
const sigOf = (P) => P.cols.filter((c) => !c.synthetic && c.own).map((c) => normKey(c.own)).join('|');
const colKey = (c) => (c.synthetic ? c.synthetic : normKey(c.own || c.text));

function DropZone({ title, hint, accept, onFile, icon = 'upload' }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`drop ${over ? 'over' : ''}`}
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
    >
      <Icon d={ICONS[icon]} size={30} />
      <div className="big">{title}</div>
      <div className="hint">{hint}</div>
      <input ref={ref} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </div>
  );
}

const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
// محرر حقل واحد حسب نوعه: تقويم للتواريخ، قائمة للقوائم، نص للباقي
function FieldEditor({ f, cell, list, onCommit, onCancel, autoFocus = false, inline = false }) {
  const { t } = useLanguage();
  const start = cell.value !== '' && cell.value !== undefined ? cell.value : cell.raw;
  if (f.type === 'date') {
    return <DateField value={isIsoDate(cell.value) ? cell.value : (cell.raw || '')} autoFocus={autoFocus} autoOpen={autoFocus} onChange={onCommit} onCancel={onCancel} />;
  }
  if (list?.length) {
    return (
      <select autoFocus={autoFocus} value={list.includes(cell.value) ? cell.value : ''} onChange={(e) => onCommit(e.target.value)} onBlur={() => !inline && onCancel?.()}>
        <option value="">{cell.value && !list.includes(cell.value) ? t({ ar: `— ${cell.value} (غير موجود بالقائمة) —`, en: `— ${cell.value} (not in the list) —` }) : t({ ar: "— فاضي —", en: "— Empty —" })}</option>
        {list.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  }
  const ltr = ['email', 'phone', 'iban', 'id', 'code', 'amount', 'name_en'].includes(f.type);
  return (
    <input type="text" dir={ltr ? 'ltr' : undefined} autoFocus={autoFocus} defaultValue={start ?? ''} key={String(start)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } if (e.key === 'Escape') { e.currentTarget.value = start ?? ''; onCancel?.(); } }}
      onBlur={(e) => { const v = e.currentTarget.value; if (v !== String(start ?? '')) onCommit(v); else onCancel?.(); }} />
  );
}

function FileButton({ label, accept, onFile, className = 'btn' }) {
  const ref = useRef(null);
  return (
    <>
      <button className={className} onClick={() => ref.current?.click()}>{label}</button>
      <input ref={ref} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </>
  );
}

function makePrepared(client, view) {
  if (!client) return null;
  if (view.merged) {
    const list = view.mergeNames.map((n) => client.sheets.find((s) => s.name === n)).filter(Boolean);
    return mergePrepared(list.map((s) => prepareSheet(s, detectHeader(s.rows))));
  }
  const s = client.sheets[view.sheetIdx];
  return s ? prepareSheet(s, view.hdr) : null;
}

/* ============================== التطبيق ============================== */
const EmployeesImport = forwardRef(function EmployeesImport({ persistKey, onNameChange, onBusyChange } = {}, ref) {
  const { t, lang, dir } = useLanguage();
  // رسائل المحرك وأسماء الحقول مكتوبة بالعربي داخل المحرك: تُترجم عند العرض حسب لغة الواجهة
  const tm = useCallback((s) => trMsg(s, lang), [lang]);
  const label = (f) => tm(f?.label || '');
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState('');
  const [err, setErr] = useState('');

  // القالب الرسمي
  const [tplFile, setTplFile] = useState(null); // {name, buffer, tpl, saved}
  // ملف العميل
  const [client, setClient] = useState(null); // {name, sheets, mergeNames}
  const [view, setView] = useState({ merged: false, mergeNames: [], sheetIdx: 0, hdr: { top: -1, idx: -1 } });
  const [mapping, setMapping] = useState({}); // key -> {col, score, by}
  const [mapTouched, setMapTouched] = useState(false);
  const [constants, setConstants] = useState({});
  const [settings, setSettings] = useState({ dateOrder: 'dmy', addCC: true, nameSplit: 'rest', translit: true }); // قالب قيود يكتب الجوال +966…
  const [fuReview, setFuReview] = useState(true);
  const [restored, setRestored] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mapView, setMapView] = useState('simple'); // simple = جدول أعمدة العميل ، detailed = كل حقول قيود
  // بعد "اعتماد" يصير جدول المطابقة نفسه جدول المراجعة والتصحيح (كل الصفوف، قيم منظّفة، تعديل مباشر)
  const [approved, setApproved] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  // المراجعة
  const [userMaps, setUserMaps] = useState({});
  const [overrides, setOverrides] = useState({});
  const [reviewed, setReviewed] = useState({}); // {src: {field: القيمة وقت المراجعة}}
  const markReviewed = (row, keys) => setReviewed((m) => {
    const n = { ...m, [row.src]: { ...(m[row.src] || {}) } };
    for (const k of keys) n[row.src][k] = String(row.cells[k].value ?? '');
    return n;
  });
  const unmarkReviewed = (src, key) => setReviewed((m) => { const n = { ...m, [src]: { ...(m[src] || {}) } }; delete n[src][key]; return n; });
  const [excluded, setExcluded] = useState(() => new Set());
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [showAllCols, setShowAllCols] = useState(false);
  const [drawerRow, setDrawerRow] = useState(null);
  const [drawerAll, setDrawerAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [askSample, setAskSample] = useState(false);

  // رسالة قصيرة، واختياريًا زر إجراء ({label, fn}) يبقى ظاهرًا وقت أطول
  const [toastAction, setToastAction] = useState(null);
  const toastTimer = useRef(null);
  const flash = useCallback((m, action = null) => {
    setToast(m); setToastAction(action);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => { setToast(''); setToastAction(null); }, action ? 15000 : 3200);
  }, []);
  const lists = tplFile?.tpl.lists;

  // استرجاع التبويب بعد إعادة تحميل الصفحة (persistKey من TabbedTool): القالب وملف العميل وكل
  // قرارات المطابقة والتصحيح. بدون لقطة: آخر قالب استُخدم على هذا المتصفح.
  const snap0Ref = useRef(persistKey ? loadSnapshot(persistKey) : null);
  const [restoreDone, setRestoreDone] = useState(false);
  useEffect(() => {
    (async () => {
      const snap = snap0Ref.current;
      try {
        const saved = snap?.tpl || lsGet(LS_KEY);
        if (saved?.b64) {
          const buffer = b64ToBuf(saved.b64);
          const tpl = await readTemplate(buffer);
          setTplFile({ name: saved.name, buffer, b64: saved.b64, tpl, saved: true });
        }
        if (snap?.client?.b64) {
          const sheets = readClientFile(b64ToBuf(snap.client.b64), snap.client.name);
          setClient({ name: snap.client.name, b64: snap.client.b64, sheets, mergeNames: snap.client.mergeNames || [] });
          if (snap.view) setView(snap.view);
          setMapping(snap.mapping || {}); setMapTouched(true);
          setConstants(snap.constants || {}); setSettings((s) => ({ ...s, ...(snap.settings || {}) }));
          setUserMaps(snap.userMaps || {}); setOverrides(snap.overrides || {}); setReviewed(snap.reviewed || {});
          setExcluded(new Set(snap.excluded || [])); setApproved(!!snap.approved);
          setMapView(snap.mapView || 'simple'); setStep(snap.step || 0);
        }
      } catch { /* لقطة تالفة: نبدأ من جديد */ }
      setRestoreDone(true);
    })();
  }, []);

  const loadTemplate = async (file) => {
    setErr(''); setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const tpl = await readTemplate(buffer);
      const b64 = bufToB64(buffer);
      setTplFile({ name: file.name, buffer, b64, tpl, saved: false });
      if (lsSet(LS_KEY, { name: file.name, b64 })) setTplFile((x) => x && { ...x, saved: true });
    } catch (e) { setErr(t({ ar: `تعذّر قراءة القالب: ${e.message}`, en: `Could not read the template: ${e.message}` })); } finally { setBusy(false); }
  };
  const forgetTemplate = () => { try { localStorage.removeItem(LS_KEY); } catch { /* */ } setTplFile(null); };

  // تطبيق مطابقة محفوظة لنفس شكل الملف إن وجدت
  const applySaved = (P, m) => {
    const saved = lsGet(LS_MAPS)?.[sigOf(P)];
    if (!saved) return { mapping: m, restored: false };
    const out = {};
    for (const [k, ck] of Object.entries(saved.map)) {
      const c = P.cols.find((x) => colKey(x) === ck);
      if (c) out[k] = { col: c.col, score: 1, by: 'saved' };
    }
    if (saved.constants) setConstants(saved.constants);
    if (saved.settings) setSettings((s) => ({ ...s, ...saved.settings }));
    return { mapping: out, restored: true };
  };
  const saveProfile = () => {
    if (!prepared) return;
    const all = lsGet(LS_MAPS) || {};
    const map = {};
    for (const [k, m] of Object.entries(mapping)) { const c = prepared.cols.find((x) => x.col === m.col); if (c) map[k] = colKey(c); }
    all[sigOf(prepared)] = { map, constants, settings, at: Date.now(), file: client?.name };
    lsSet(LS_MAPS, all);
  };

  const remap = (P, l = lists) => {
    if (!P) return;
    setMapping(autoMap(P, l).mapping);
    setMapTouched(false);
  };

  const loadClient = async (file) => {
    setErr(''); setBusy(true);
    // نعطي المتصفح فرصة يرسم حالة الانشغال قبل التحليل (يأخذ ثواني مع الملفات الكبيرة)
    await new Promise((r) => setTimeout(r, 30));
    try {
      const ab = await file.arrayBuffer();
      const sheets = readClientFile(ab, file.name);
      if (!sheets.some((s) => s.rows.length)) throw new Error(t({ ar: "الملف فاضي", en: "The file is empty" }));
      const a = analyzeWorkbook(sheets, lists);
      const v = { merged: a.merged, mergeNames: a.mergeNames, sheetIdx: a.sheetIdx, hdr: a.hdr };
      setClient({ name: file.name, b64: ab.byteLength <= SNAP_MAX_BYTES ? bufToB64(ab) : null, sheets, mergeNames: a.mergeNames });
      setView(v);
      setConstants({}); setUserMaps({}); setOverrides({}); setExcluded(new Set()); setReviewed({}); setApproved(false);
      const sv = applySaved(a.prepared, a.mapping);
      setMapping(sv.mapping); setRestored(sv.restored); setMapTouched(sv.restored);
      if (sv.restored) flash(t({ ar: "طُبّقت مطابقة محفوظة سابقًا لملف بنفس الشكل", en: "Applied a saved mapping from a file with the same layout" }));
      else if (a.merged) flash(t({ ar: `دُمجت ${a.mergeNames.length} شيتات بنفس البنية: ${a.mergeNames.join('، ')}`, en: `Merged ${a.mergeNames.length} sheets with the same structure: ${a.mergeNames.join('، ')}` }));
    } catch (e) { setErr(t({ ar: `تعذّر قراءة ملف العميل: ${e.message}`, en: `Could not read the client file: ${e.message}` })); } finally { setBusy(false); }
  };

  // عقد TabbedTool: اسم التبويب = اسم ملف العميل، وحالة الانشغال، وحفظ اللقطة
  useEffect(() => { onNameChange && onNameChange(client ? client.name.replace(/\.[^.]+$/, '') : ''); }, [client, onNameChange]);
  useEffect(() => { onBusyChange && onBusyChange(busy); }, [busy, onBusyChange]);
  useImperativeHandle(ref, () => ({ requestStop: () => {} }), []);
  const snapshot = useMemo(() => ({
    tpl: tplFile?.b64 ? { name: tplFile.name, b64: tplFile.b64 } : null,
    client: client?.b64 ? { name: client.name, b64: client.b64, mergeNames: client.mergeNames } : null,
    view, mapping, constants, settings, userMaps, overrides, reviewed,
    excluded: [...excluded], approved, mapView, step,
  }), [tplFile, client, view, mapping, constants, settings, userMaps, overrides, reviewed, excluded, approved, mapView, step]);
  useSnapshotPersist(persistKey, snapshot, { enabled: restoreDone });

  // إعادة المطابقة عند تحميل القالب بعد ملف العميل (القوائم تحسّن الاكتشاف بالمحتوى)
  useEffect(() => {
    if (client && !mapTouched) remap(makePrepared(client, view), lists);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplFile]);

  const prepared = useMemo(() => makePrepared(client, view), [client, view]);
  const headers = prepared?.cols || [];
  const rawSheet = client && !view.merged ? client.sheets[view.sheetIdx] : null;

  const changeView = (patch) => {
    const v = { ...view, ...patch };
    setView(v);
    remap(makePrepared(client, v));
  };

  const records = useMemo(() => {
    if (!prepared || !tplFile) return [];
    const cleanMap = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v && v.col !== undefined && v.col !== null && v.col !== ''));
    return buildRecords(prepared, cleanMap, constants, settings);
  }, [prepared, mapping, constants, settings, tplFile]);

  const rows = useMemo(() => {
    if (!tplFile || !records.length) return [];
    const r = processRecords(records, { lists: tplFile.tpl.lists, required: tplFile.tpl.required, settings, userMaps, overrides, reviewed });
    r.forEach((x) => { x.excluded = excluded.has(x.src); });
    return r;
  }, [records, tplFile, settings, userMaps, overrides, excluded, reviewed]);

  const live = rows.filter((r) => !r.excluded);
  const counts = {
    all: rows.length,
    ok: live.filter((r) => r.status === 'ok').length,
    review: live.filter((r) => r.status === 'review').length,
    error: live.filter((r) => r.status === 'error').length,
    excluded: rows.length - live.length,
  };
  const reviewCells = live.reduce((s, r) => s + FIELDS.filter((f) => r.cells[f.key].status === 'review').length, 0);
  // "للمراجعة" لا يمنع التصدير أبدًا: فقط الأخطاء الحمراء
  const exportable = live.filter((r) => r.status !== 'error');

  const requiredKeys = useMemo(() => [...(tplFile?.tpl.required || [])], [tplFile]);
  const covered = (k) => (mapping[k] && mapping[k].col !== undefined && mapping[k].col !== '' && mapping[k].col !== null)
    || constants[k] || (k === 'first_name' && (mapping.full_name_en)) || (k === 'last_name' && (mapping.full_name_en))
    || (k === 'first_name_ar' && mapping.full_name_ar) || (k === 'last_name_ar' && mapping.full_name_ar);
  const missingRequired = requiredKeys.filter((k) => !covered(k));
  const usedCols = new Set(Object.values(mapping).map((m) => m.col));
  const unusedCols = headers.filter((h) => !usedCols.has(h.col));

  const SampleWarn = tplFile?.tpl.isSample && (
    <div className="banner err">
      <b>{t({ ar: "القالب المحمّل (", en: "The loaded template (" })}{tplFile?.name}{t({ ar: ") تجريبي للاختبار فقط.", en: ") is a test sample only." })}</b> {t({ ar: "قوائم الفروع والأقسام وملفات الدوام فيه مخترعة، فقيود يرفض الملف المصدّر منه (مثل: \"location ليس ضمن الخيارات المسموح بها\"). للرفع الحقيقي: من قيود ← الموظفين ← إضافة جماعية ← تنزيل القالب، لنفس شركة العميل، ثم اضغط \"استبدال\" وارفعه هنا.", en: "Its branch, department and attendance lists are made up, so Qoyod rejects files exported from it (e.g. \"location is not among the allowed options\"). For a real upload: in Qoyod, Employees → Bulk add → Download template for the same company, then click \"Replace\" and upload it here." })}
    </div>
  );

  /* --------------------------- الخطوة 1 --------------------------- */
  const StepFiles = (
    <>
      <div className="grid2">
        <div className="card">
          <h2>{t({ ar: "١. قالب قيود الرسمي", en: "1. Official Qoyod template" })}</h2>
          <p className="sub">{t({ ar: "نزّله من الموظفين ← إضافة جماعية ← تنزيل القالب. القوائم (الأقسام، المواقع، ملفات الدوام) خاصة بكل عميل، فاستخدم قالب نفس شركة العميل.", en: "Download it from Employees → Bulk add → Download template. Lists (departments, locations, attendance profiles) are specific to each client, so use the template of the same company." })}</p>
          {!tplFile ? (
            <DropZone title={t({ ar: "اسحب القالب هنا أو اضغط للاختيار", en: "Drop the template here or click to choose" })} hint={t({ ar: "ملف xlsx الذي نزّلته من قيود", en: "The xlsx file you downloaded from Qoyod" })} accept=".xlsx" onFile={loadTemplate} icon="file" />
          ) : (
            <>
              <div className="filebox">
                <div className="ico"><Icon d={ICONS.check} /></div>
                <div className="meta">
                  <div className="name">{tplFile.name}</div>
                  <div className="info">{tplFile.tpl.headers.length} {t({ ar: "عمودًا ·", en: "columns ·" })} {tplFile.tpl.required.size} {t({ ar: "إلزاميًا ·", en: "required ·" })} {Object.keys(tplFile.tpl.lists).length} {t({ ar: "قائمة", en: "lists" })}{tplFile.saved ? t({ ar: " · محفوظ على هذا المتصفح", en: " · saved in this browser" }) : ''}</div>
                </div>
                <button className="btn small" onClick={forgetTemplate}>{t({ ar: "استبدال", en: "Replace" })}</button>
              </div>
              <div className="chips">
                {['department', 'location', 'attendance_setting'].map((k) => (
                  <span key={k} className="chip">{label(FIELD_BY_KEY[k])}: {(tplFile.tpl.lists[k] || []).length}</span>
                ))}
                <span className="chip gray">{t({ ar: "الجنسيات:", en: "Nationalities:" })} {(tplFile.tpl.lists.nationality || []).length}</span>
              </div>
              {SampleWarn}
              {tplFile.tpl.missingHeaders.length > 0 && <div className="banner warn">{t({ ar: "أعمدة ناقصة بالقالب:", en: "Columns missing from the template:" })} {tplFile.tpl.missingHeaders.join(t({ ar: "، ", en: ", " }))}</div>}
              {tplFile.tpl.unknownHeaders.length > 0 && <div className="banner warn">{t({ ar: "أعمدة جديدة بالقالب لا تعرفها الأداة:", en: "New template columns the tool does not know:" })} {tplFile.tpl.unknownHeaders.join(t({ ar: "، ", en: ", " }))}</div>}
            </>
          )}
        </div>
        <div className="card">
          <h2>{t({ ar: "٢. ملف العميل", en: "2. Client file" })}</h2>
          <p className="sub">{t({ ar: "أي شكل: عناوين عربي أو إنجليزي أو بدون عناوين، ترويسة بصفين، شيت لكل فرع، أسماء كاملة بعمود واحد، تواريخ هجري وميلادي، CSV بأي ترميز. الأداة تكتشف وتطابق وتنظّف.", en: "Any shape: Arabic, English or no headers, two-row headers, a sheet per branch, full names in one column, Hijri and Gregorian dates, CSV in any encoding. The tool detects, maps and cleans." })}</p>
          {!client ? (
            <DropZone title={t({ ar: "اسحب ملف العميل هنا أو اضغط للاختيار", en: "Drop the client file here or click to choose" })} hint={t({ ar: "xlsx أو xls أو csv", en: "xlsx, xls or csv" })} accept=".xlsx,.xls,.xlsm,.csv,.txt,.tsv" onFile={loadClient} icon="users" />
          ) : (
            <>
              <div className="filebox">
                <div className="ico"><Icon d={ICONS.check} /></div>
                <div className="meta">
                  <div className="name">{client.name}</div>
                  <div className="info">
                    {client.sheets.length} {t({ ar: "شيت ·", en: "sheet(s) ·" })} {view.merged ? t({ ar: `دمج: ${view.mergeNames.join(' + ')}`, en: `Merged: ${view.mergeNames.join(' + ')}` }) : `${client.sheets[view.sheetIdx]?.name}`}
                    {' · '}{view.merged ? t({ ar: "الترويسة لكل شيت تلقائيًا", en: "header detected per sheet" }) : view.hdr.idx < 0 ? t({ ar: "بدون ترويسة", en: "no header" }) : t({ ar: `الترويسة بالصف ${view.hdr.idx + 1}`, en: `header on row ${view.hdr.idx + 1}` })}
                  </div>
                </div>
                <button className="btn small" onClick={() => setClient(null)}>{t({ ar: "استبدال", en: "Replace" })}</button>
              </div>
              <div className="chips">
                <span className="chip ok">{Object.keys(mapping).length} {t({ ar: "عمودًا طابقتهم تلقائيًا", en: "columns matched automatically" })}</span>
                {Object.values(mapping).some((m) => m.by === 'content') && <span className="chip fixed">{Object.values(mapping).filter((m) => m.by === 'content').length} {t({ ar: "منها من المحتوى", en: "of them from content" })}</span>}
                <span className="chip gray">{records.length || prepared?.data.length || 0} {t({ ar: "موظف", en: "employees" })}</span>
                {restored && <span className="chip review">{t({ ar: "مطابقة محفوظة", en: "Saved mapping" })}</span>}
              </div>
            </>
          )}
        </div>
      </div>
      {err && <div className="banner err">{err}</div>}
      <div className="actions">
        <span />
        <div className="right"><button className="btn primary" disabled={!tplFile || !client} onClick={() => setStep(1)}>{t({ ar: "التالي: مطابقة الأعمدة", en: "Next: map columns" })}</button></div>
      </div>
    </>
  );

  /* --------------------------- الخطوة 2 --------------------------- */
  const setMap = (key, col) => {
    setMapTouched(true);
    setMapping((m) => {
      const n = { ...m };
      if (col === '' || col === null) delete n[key]; else n[key] = { col: Number(col), score: 1, by: 'manual' };
      return n;
    });
  };
  const setConst = (key, v) => setConstants((c) => { const n = { ...c }; if (v === '') delete n[key]; else n[key] = v; return n; });
  const sampleOf = (key) => {
    const m = mapping[key];
    if (!m || !prepared) return '';
    return columnSample(prepared, m.col, 3).join('  ·  ');
  };
  const confBadge = (key) => {
    const m = mapping[key];
    if (!m) return null;
    if (m.by === 'content') return <span className="chip fixed conf" title={t({ ar: "العنوان غير واضح، الأداة استنتجت الحقل من شكل القيم", en: "The header is unclear; the tool inferred the field from the values" })}>{t({ ar: "من المحتوى", en: "From content" })}</span>;
    if (m.by === 'header' && m.score < 0.9) return <span className="chip review conf">{t({ ar: "تقريبي — تأكد", en: "Approximate — check" })}</span>;
    return null;
  };
  const derivedFrom = (k) => {
    if (['first_name', 'last_name'].includes(k) && mapping.full_name_en) return t({ ar: "الاسم الكامل (إنجليزي)", en: "Full name (EN)" });
    if (['first_name_ar', 'last_name_ar'].includes(k) && mapping.full_name_ar) return t({ ar: "الاسم الكامل (عربي)", en: "Full name (AR)" });
    return '';
  };
  const colLabel = (h) => `${h.text}${h.letter && h.letter !== '—' ? `  (${h.letter})` : ''}`;
  const rowFor = (f) => {
    const hasConstOption = !f.virtual;
    const listVals = tplFile?.tpl.lists[f.key];
    const missing = f.req && !covered(f.key);
    const dup = mapping[f.key] && Object.entries(mapping).some(([k, m]) => k !== f.key && m.col === mapping[f.key].col);
    return (
      <div key={f.key} className={`maprow ${missing ? 'missing' : ''}`}>
        <div className="lab">{label(f)}{f.req && <span className="req">*</span>}<small>{f.key}</small></div>
        <select value={mapping[f.key]?.col ?? ''} onChange={(e) => setMap(f.key, e.target.value)}>
          <option value="">{t({ ar: "— غير مرتبط —", en: "— Not mapped —" })}</option>
          {headers.map((h) => <option key={h.col} value={h.col}>{usedCols.has(h.col) && mapping[f.key]?.col !== h.col ? '• ' : ''}{colLabel(h)}</option>)}
        </select>
        <div className="sample" title={sampleOf(f.key)}>
          {dup && <span className="chip error conf">{t({ ar: "نفس العمود مربوط بحقل آخر", en: "Same column mapped to another field" })}</span>}
          {mapping[f.key] ? <>{confBadge(f.key)} {sampleOf(f.key)}</> : derivedFrom(f.key) ? <span className="chip fixed">{t({ ar: "يُشتق من", en: "Derived from" })} {derivedFrom(f.key)}</span> : ''}
        </div>
        {hasConstOption ? (
          listVals?.length ? (
            <select value={constants[f.key] ?? ''} onChange={(e) => setConst(f.key, e.target.value)} disabled={!!mapping[f.key]}>
              <option value="">{t({ ar: "قيمة ثابتة للكل…", en: "Fixed value for all…" })}</option>
              {listVals.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : f.type === 'date' ? (
            mapping[f.key] ? <input type="text" disabled placeholder={t({ ar: "قيمة ثابتة للكل…", en: "Fixed value for all…" })} /> : <DateField value={constants[f.key] ?? ''} placeholder={t({ ar: "تاريخ ثابت للكل…", en: "Fixed date for all…" })} onChange={(iso) => setConst(f.key, iso)} />
          ) : (
            <input type="text" placeholder={t({ ar: "قيمة ثابتة للكل…", en: "Fixed value for all…" })} value={constants[f.key] ?? ''} onChange={(e) => setConst(f.key, e.target.value)} disabled={!!mapping[f.key]} />
          )
        ) : <span />}
      </div>
    );
  };
  const salaryDefaults = () => {
    const L = tplFile.tpl.lists;
    const pick = (k, want) => (L[k] || []).find((v) => normKey(v) === normKey(want)) || '';
    setConstants((c) => ({
      ...c,
      ...(pick('salary_pay_frequency', 'Monthly') && { salary_pay_frequency: pick('salary_pay_frequency', 'Monthly') }),
      ...(pick('salary_basic_salary_kind', 'Fixed') && { salary_basic_salary_kind: pick('salary_basic_salary_kind', 'Fixed') }),
      ...(L.salary_input_time_type?.[0] && { salary_input_time_type: L.salary_input_time_type[0] }),
    }));
    if (mapping.join_date) setMapping((m) => ({ ...m, salary_start_date: m.join_date }));
    flash(t({ ar: "طُبّقت: شهري، ثابت، أول خيار بأساس الوقت، وبدء الراتب = تاريخ الانضمام", en: "Applied: monthly, fixed, first time-basis option, and salary start = join date" }));
  };

  const RawPreview = rawSheet && (
    <div className="rawwrap">
      <table className="raw">
        <tbody>
          {rawSheet.rows.slice(0, 18).map((r, i) => {
            const inHdr = i >= view.hdr.top && i <= view.hdr.idx && view.hdr.idx >= 0;
            return (
              <tr key={i} className={inHdr ? 'hdr' : ''} onClick={() => changeView({ hdr: { top: i, idx: i } })} title={t({ ar: "اضغط لجعل هذا الصف هو الترويسة", en: "Click to make this row the header" })}>
                <th>{i + 1}</th>
                {r.slice(0, 14).map((c, j) => <td key={j}>{cellText(c)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  /* ---- العرض المبسّط: كرت لكل عمود بملف العميل ---- */
  const keysOfCol = (col) => Object.entries(mapping).filter(([, m]) => m.col === col).map(([k]) => k);
  const setColField = (col, key) => {
    setMapTouched(true);
    setMapping((m) => {
      const n = {};
      for (const [k, v] of Object.entries(m)) if (v.col !== col) n[k] = v;
      if (key) n[key] = { col, score: 1, by: 'manual' };
      return n;
    });
  };
  const labelOf = (k) => tm((FIELD_BY_KEY[k] || VIRTUAL_FIELDS.find((v) => v.key === k))?.label || k);
  const cardState = (col) => {
    const ks = keysOfCol(col);
    if (!ks.length) return { cls: 'ignored', tag: t({ ar: "متجاهَل", en: "ignored" }) };
    const m = mapping[ks[0]];
    if (m.by === 'content') return { cls: 'check', tag: t({ ar: "من المحتوى — تأكد", en: "From content — Check" }) };
    if (m.by === 'header' && m.score < 0.9) return { cls: 'check', tag: t({ ar: "تقريبي — تأكد", en: "Approximate — check" }) };
    if (m.by === 'manual') return { cls: 'mapped', tag: t({ ar: "اخترته أنت", en: "Chosen by you" }) };
    if (m.by === 'saved') return { cls: 'mapped', tag: t({ ar: "مطابقة محفوظة", en: "Saved mapping" }) };
    return { cls: 'mapped', tag: t({ ar: "تلقائي", en: "Automatic" }) };
  };
  const ConstEditor = ({ f }) => {
    const list = tplFile.tpl.lists[f.key];
    if (list?.length) return (
      <select value={constants[f.key] ?? ''} onChange={(e) => setConst(f.key, e.target.value)}>
        <option value="">{t({ ar: "اختر قيمة للكل…", en: "Choose a value for all…" })}</option>
        {list.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    );
    if (f.type === 'date') return <DateField value={constants[f.key] ?? ''} placeholder={t({ ar: "تاريخ للكل…", en: "Date for all…" })} onChange={(iso) => setConst(f.key, iso)} />;
    return <input type="text" placeholder={t({ ar: "قيمة للكل…", en: "Value for all…" })} defaultValue={constants[f.key] ?? ''} key={constants[f.key] ?? ''} onBlur={(e) => setConst(f.key, e.target.value.trim())} />;
  };
  const mappedCount = headers.filter((h) => keysOfCol(h.col).length).length;
  // جدول المطابقة: صف اختيار حقل قيود، تحته عنوان عمود العميل، تحته أول صفوف البيانات للتأكيد
  const FieldPicker = ({ col }) => {
    const ks = keysOfCol(col);
    return (
      <select value={ks[0] || ''} onChange={(e) => setColField(col, e.target.value)} title={ks[0] ? labelOf(ks[0]) : t({ ar: "تجاهل", en: "Ignore" })}>
        <option value="">{t({ ar: "— تجاهل —", en: "— Ignore —" })}</option>
        <optgroup label={t({ ar: "الاسم الكامل (يُقسَّم تلقائيًا)", en: "Full name (split automatically)" })}>
          {VIRTUAL_FIELDS.map((v) => <option key={v.key} value={v.key}>{tm(v.label)}</option>)}
        </optgroup>
        {Object.entries(GROUPS).map(([g, gl]) => (
          <optgroup key={g} label={tm(gl)}>
            {FIELDS.filter((f) => f.group === g).map((f) => {
              const other = mapping[f.key] && mapping[f.key].col !== col;
              return <option key={f.key} value={f.key}>{label(f)}{tplFile.tpl.required.has(f.key) ? ' *' : ''}{other ? t({ ar: " (مربوط بعمود آخر)", en: " (mapped to another column)" }) : ''}</option>;
            })}
          </optgroup>
        ))}
      </select>
    );
  };
  const previewRows = prepared ? prepared.data.slice(0, 6) : [];
  const MapTable = (
    <div className="maptable-wrap">
      <table className="maptable">
        <thead>
          <tr className="pick">
            {headers.map((h) => <th key={h.col} className={cardState(h.col).cls}><FieldPicker col={h.col} /></th>)}
          </tr>
          <tr className="colname">
            {headers.map((h) => {
              const ks = keysOfCol(h.col);
              const st = cardState(h.col);
              return (
                <th key={h.col} className={st.cls} title={h.text}>
                  <span className="nm">{h.text}</span>
                  {st.cls === 'check' && <span className="chip review">{t({ ar: "تأكد", en: "Check" })}</span>}
                  {ks.length > 1 && <span className="also">+ {ks.slice(1).map(labelOf).join(t({ ar: "، ", en: ", " }))}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((r, i) => (
            <tr key={i}>
              {headers.map((h) => <td key={h.col} className={cardState(h.col).cls} dir="auto">{cellText(r[h.col])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const scrollToMissing = () => document.getElementById('missing-required')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const MissingNotice = missingRequired.length > 0 && (
    <div className="banner err missing-notice">
      <b>{t({ ar: "ناقص", en: "Missing" })} {missingRequired.length} {t({ ar: "من الحقول الإلزامية (", en: "required fields (" })}{requiredKeys.length - missingRequired.length} / {requiredKeys.length}):</b>
      {missingRequired.map((k) => <button key={k} className="chip error" onClick={scrollToMissing}>{label(FIELD_BY_KEY[k])}</button>)}
      <span className="hint">{t({ ar: "اختر لها عمود من القوائم بالجدول، أو ثبّت قيمة للكل تحت.", en: "Pick a column for it in the table, or set one value for everyone below." })}</span>
    </div>
  );
  const MissingRequired = missingRequired.length > 0 ? (
    <div className="card" id="missing-required">
      <h2>{t({ ar: "حقول قيود الإلزامية الناقصة (", en: "Missing required Qoyod fields (" })}{missingRequired.length})</h2>
      <p className="sub">{t({ ar: "ملف العميل ما فيه عمود لها. اختر لها عمود من الكروت فوق، أو ثبّت قيمة وحدة لكل الموظفين هنا (وتقدر تعدّلها لكل موظف بالمراجعة).", en: "The client file has no column for these. Pick a column above, or set one value for all employees here (you can still edit each employee in review)." })}</p>
      <div className="missgrid">
        {missingRequired.map((k) => (
          <div key={k} className="missrow">
            <b>{label(FIELD_BY_KEY[k])}</b>
            <ConstEditor f={FIELD_BY_KEY[k]} />
          </div>
        ))}
      </div>
    </div>
  ) : (
    <div className="banner ok-banner">{t({ ar: "✓ كل حقول قيود الإلزامية لها مصدر", en: "✓ Every required Qoyod field has a source" })}</div>
  );

  // دالة لا قيمة: تُستدعى عند الرسم بعد تعريف أدوات المراجعة (الفلترة، الخلايا، اللوحات) الموجودة تحت
  const renderStepMap = () => tplFile && client && prepared && (
    <>
      <div className="card">
        <div className="maphead">
          <div>
            <h2>{t({ ar: "مطابقة ملف العميل مع قالب قيود", en: "Map the client file to the Qoyod template" })}</h2>
            <p className="sub" style={{ margin: 0 }}>
              {t({ ar: "قرأنا", en: "Read" })} <b>{prepared.data.length}</b> {t({ ar: "موظف من", en: "employees from" })} {view.merged ? t({ ar: `الشيتات (${view.mergeNames.join(' + ')})`, en: `sheets (${view.mergeNames.join(' + ')})` }) : t({ ar: `شيت "${client.sheets[view.sheetIdx]?.name}"`, en: `sheet "${client.sheets[view.sheetIdx]?.name}"` })}
              {view.merged ? '' : view.hdr.idx < 0 ? t({ ar: " — بدون ترويسة", en: " — no header" }) : t({ ar: ` — الترويسة بالصف ${view.hdr.idx + 1}`, en: ` — header on row ${view.hdr.idx + 1}` })}.
              {' '}{t({ ar: "راجع وين يروح كل عمود، وعدّل إذا لزم.", en: "Check where each column goes and adjust if needed." })}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className={`btn small ${showSettings ? 'primary' : ''}`} onClick={() => setShowSettings((x) => !x)}>{t({ ar: "⚙ إعدادات القراءة", en: "⚙ Reading settings" })}</button>
            <button className="btn small" onClick={() => setMapView((v) => (v === 'simple' ? 'detailed' : 'simple'))}>{mapView === 'simple' ? t({ ar: "عرض تفصيلي (كل حقول قيود)", en: "Detailed view (all Qoyod fields)" }) : t({ ar: "العرض المبسّط", en: "Simple view" })}</button>
          </div>
        </div>
        <div className="mapsummary">
          <span className="chip ok">{mappedCount} {t({ ar: "عمود مربوط", en: "columns mapped" })}</span>
          <span className="chip gray">{headers.length - mappedCount} {t({ ar: "متجاهَل", en: "ignored" })}</span>
          <span className={`chip ${missingRequired.length ? 'error' : 'ok'}`}>{t({ ar: "الإلزامي:", en: "Required:" })} {requiredKeys.length - missingRequired.length} / {requiredKeys.length}</span>
          {Object.values(mapping).some((m) => m.by === 'content' || (m.by === 'header' && m.score < 0.9)) && <span className="chip review">{t({ ar: "الأصفر: تأكد منه", en: "Yellow: double-check" })}</span>}
        </div>
        {showSettings && (
        <div className="settings" style={{ marginTop: 12 }}>
          <div className="field"><label>{t({ ar: "الشيت", en: "Sheet" })}</label>
            <select value={view.merged ? 'merged' : view.sheetIdx} onChange={(e) => {
              if (e.target.value === 'merged') changeView({ merged: true });
              else { const i = +e.target.value; changeView({ merged: false, sheetIdx: i, hdr: detectHeader(client.sheets[i].rows) }); }
            }}>
              {client.mergeNames.length >= 2 && <option value="merged">{t({ ar: "كل الشيتات المتشابهة (", en: "All similar sheets (" })}{client.mergeNames.join(' + ')})</option>}
              {client.sheets.map((s, i) => <option key={s.name} value={i} disabled={!s.rows.length}>{s.name}{s.hidden ? t({ ar: " (مخفي)", en: " (hidden)" }) : ''}{!s.rows.length ? t({ ar: " (فاضي)", en: " (empty)" }) : ''}</option>)}
            </select>
          </div>
          {!view.merged && (
            <div className="field"><label>{t({ ar: "رقم صف الترويسة (0 = بدون ترويسة)", en: "Header row number (0 = no header)" })}</label>
              <input type="number" min="0" value={view.hdr.idx + 1} onChange={(e) => { const h = Math.max(-1, (+e.target.value || 0) - 1); changeView({ hdr: { top: h, idx: h } }); }} />
            </div>
          )}
          <div className="field"><label>{t({ ar: "التواريخ الملتبسة (مثل 04/05/1991)", en: "Ambiguous dates (e.g. 04/05/1991)" })}</label>
            <div className="seg">
              <button className={settings.dateOrder === 'dmy' ? 'on' : ''} onClick={() => setSettings((s) => ({ ...s, dateOrder: 'dmy' }))}>{t({ ar: "يوم/شهر", en: "Day/Month" })}</button>
              <button className={settings.dateOrder === 'mdy' ? 'on' : ''} onClick={() => setSettings((s) => ({ ...s, dateOrder: 'mdy' }))}>{t({ ar: "شهر/يوم", en: "Month/Day" })}</button>
            </div>
          </div>
          <div className="field"><label>{t({ ar: "تقسيم الاسم الكامل", en: "Full-name split" })}</label>
            <div className="seg">
              <button className={settings.nameSplit === 'rest' ? 'on' : ''} onClick={() => setSettings((s) => ({ ...s, nameSplit: 'rest' }))}>{t({ ar: "الأول + الباقي", en: "First + rest" })}</button>
              <button className={settings.nameSplit === 'last' ? 'on' : ''} onClick={() => setSettings((s) => ({ ...s, nameSplit: 'last' }))}>{t({ ar: "الأول + الأخير", en: "First + last" })}</button>
            </div>
          </div>
          <label className="switch"><input type="checkbox" checked={settings.addCC} onChange={(e) => setSettings((s) => ({ ...s, addCC: e.target.checked }))} />{t({ ar: "أضف +966 للجوالات السعودية المحلية (05…)", en: "Add +966 to local Saudi mobiles (05…)" })}</label>
          <label className="switch"><input type="checkbox" checked={settings.translit !== false} onChange={(e) => setSettings((s) => ({ ...s, translit: e.target.checked }))} />{t({ ar: "ترجمة حرفية للاسم الناقص (عربي ⇄ إنجليزي)", en: "Transliterate missing names (Arabic ⇄ English)" })}</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!view.merged && <button className="btn small" onClick={() => setShowRaw((x) => !x)}>{showRaw ? t({ ar: "إخفاء الملف الخام", en: "Hide raw file" }) : t({ ar: "عرض الملف الخام", en: "Show raw file" })}</button>}
            <button className="btn small" onClick={() => remap(prepared)}>{t({ ar: "إعادة المطابقة التلقائية", en: "Re-run automatic mapping" })}</button>
          </div>
        </div>
        )}
        {showSettings && showRaw && !view.merged && <><p className="sub" style={{ margin: '12px 0 6px' }}>{t({ ar: "أول 18 صفًا كما هي بالملف — اضغط أي صف لتجعله الترويسة.", en: "First 18 rows as they are in the file — click any row to make it the header." })}</p>{RawPreview}</>}
        {showSettings && prepared.skipped.length > 0 && (
          <details className="skipped">
            <summary>{t({ ar: "تجاهلت الأداة", en: "The tool skipped" })} {prepared.skipped.length} {t({ ar: "صفًا غير بيانات (عناوين أقسام، ترويسة مكررة، إجماليات، ملاحظات)", en: "non-data rows (section titles, repeated headers, totals, notes)" })}</summary>
            <ul>{prepared.skipped.slice(0, 40).map((s, i) => <li key={i}><b>{t({ ar: "صف", en: "Row" })} {s.src}</b> — {tm(s.reason)}{s.text ? `: ${s.text}` : ''}</li>)}</ul>
          </details>
        )}
      </div>

      {mapView === 'simple' && (
        <>
          {!approved && (
            <>
              <div className="card">
                <h2 className="title-bar">{t({ ar: "مطابقة أعمدة الملف", en: "Map file columns" })}</h2>
                <p className="sub">{t({ ar: "اختر من كل قائمة حقل قيود المقابل لعمود العميل، أو اتركه \"تجاهل\". تحت كل قائمة عنوان العمود كما ورد بالملف، وعيّنة من قيمه للتأكيد. لما تخلص اضغط", en: "In each dropdown choose the Qoyod field for that client column, or leave it as \"Ignore\". Under each dropdown is the column header as it appears in the file and sample values to confirm. When done click" })} <b>{t({ ar: "اعتماد", en: "Approve" })}</b> {t({ ar: "وتتحول نفس الصفحة للمراجعة والتصحيح.", en: "and the same page turns into review and correction." })}</p>
                {MissingNotice}
                {MapTable}
                <div className="maplegend">
                  <span><i className="sw mapped" /> {t({ ar: "مربوط", en: "Mapped" })}</span>
                  <span><i className="sw check" /> {t({ ar: "مربوط — تأكد منه", en: "Mapped — double-check" })}</span>
                  <span><i className="sw ignored" /> {t({ ar: "متجاهَل", en: "ignored" })}</span>
                  <span className="muted">{t({ ar: "عرض أول", en: "Showing first" })} {previewRows.length} {t({ ar: "صفوف من", en: "rows of" })} {prepared.data.length}</span>
                </div>
              </div>
              {MissingRequired}
            </>
          )}
          {approved && (
            <>
              {ReviewPanels}
              <div className="card">
                <div className="maphead">
                  <div>
                    <h2 className="title-bar">{t({ ar: "مطابقة ومراجعة البيانات", en: "Map & review data" })}</h2>
                    <p className="sub" style={{ margin: 0 }}>{t({ ar: "نفس جدول المطابقة بعد الاعتماد: كل الموظفين، القيم منظّفة ومفحوصة. اضغط أي خلية لتعديلها، ورقم الصف يفتح نموذج الموظف. تقدر تغيّر أي قائمة فوق وتتحدث البيانات فورًا.", en: "The same mapping table after approval: all employees, cleaned and validated. Click any cell to edit it; the row number opens the employee form. Change any dropdown above and the data updates instantly." })}</p>
                  </div>
                </div>
                {MissingNotice}
                {ReviewToolbar}
                {UnifiedTable()}
                <div className="pager">
                  <button className="btn small" disabled={curPage === 0} onClick={() => setPage(curPage - 1)}>{t({ ar: "السابق", en: "Previous" })}</button>
                  <span>{t({ ar: "صفحة", en: "Page" })} {curPage + 1} {t({ ar: "من", en: "of" })} {pages} · {filtered.length} {t({ ar: "صف", en: "Row" })}</span>
                  <button className="btn small" disabled={curPage >= pages - 1} onClick={() => setPage(curPage + 1)}>{t({ ar: "التالي", en: "Next" })}</button>
                </div>
              </div>
            </>
          )}
        </>
      )}
      {mapView === 'detailed' && (
      <div className="card">
        <div className="maphead">
          <div><h2>{t({ ar: "مطابقة الأعمدة — عرض تفصيلي", en: "Column mapping — detailed view" })}</h2><p className="sub" style={{ margin: 0 }}>{t({ ar: "لكل حقل بالقالب اختر عمود العميل، أو ثبّت قيمة واحدة لكل الموظفين.", en: "For each template field choose the client column, or set one value for all employees." })}</p></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="chip" style={{ background: missingRequired.length ? 'var(--error-bg)' : 'var(--ok-bg)', color: missingRequired.length ? 'var(--error)' : 'var(--ok)' }}>
              {t({ ar: "الإلزامي:", en: "Required:" })} {requiredKeys.length - missingRequired.length} / {requiredKeys.length}
            </span>
            <div className="meter"><i style={{ width: `${((requiredKeys.length - missingRequired.length) / Math.max(1, requiredKeys.length)) * 100}%` }} /></div>
          </div>
        </div>
        {missingRequired.length > 0 && <div className="banner warn">{t({ ar: "حقول إلزامية بدون مصدر:", en: "Required fields without a source:" })} {missingRequired.map((k) => label(FIELD_BY_KEY[k])).join(t({ ar: "، ", en: ", " }))}{t({ ar: ". تقدر تكمل وتعبّيها بالمراجعة، أو تثبّت لها قيمة.", en: ". You can continue and fill them in review, or set a value." })}</div>}
        {unusedCols.length > 0 && (
          <div className="unused">
            <span className="sub" style={{ margin: 0 }}>{t({ ar: "أعمدة العميل غير المستخدمة (", en: "Unused client columns (" })}{unusedCols.length}):</span>
            {unusedCols.map((h) => <span key={h.col} className="chip gray" title={columnSample(prepared, h.col, 3).join(' · ')}>{h.text}</span>)}
          </div>
        )}
        <div className="maprow head"><div>{t({ ar: "حقل القالب", en: "Template field" })}</div><div>{t({ ar: "عمود العميل", en: "Client column" })}</div><div>{t({ ar: "عيّنة من البيانات", en: "Sample data" })}</div><div>{t({ ar: "قيمة ثابتة", en: "Fixed value" })}</div></div>
        <div className="grp">{tm(GROUPS.personal)} {t({ ar: "— الاسم الكامل (يُقسَّم تلقائيًا)", en: "— Full name (split automatically)" })}</div>
        {VIRTUAL_FIELDS.map(rowFor)}
        {Object.entries(GROUPS).map(([g, gLabel]) => (
          <React.Fragment key={g}>
            <div className="grp">{tm(gLabel)}</div>
            {FIELDS.filter((f) => f.group === g).map(rowFor)}
          </React.Fragment>
        ))}
      </div>
      )}
      <div className="actions">
        <button className="btn" onClick={() => setStep(0)}>{t({ ar: "رجوع", en: "Back" })}</button>
        <div className="right">
          {!approved ? (
            <button className="btn primary" disabled={!records.length} onClick={approve}>{t({ ar: "✓ اعتماد (", en: "✓ Approve (" })}{records.length} {t({ ar: "موظف)", en: "employees)" })}</button>
          ) : (
            <>
              <button className="btn" onClick={() => { setApproved(false); window.scrollTo({ top: 0 }); }}>{t({ ar: "عرض العيّنة فقط", en: "Show sample only" })}</button>
              <button className="btn primary" onClick={() => setStep(2)}>{t({ ar: "التالي: التصدير (", en: "Next: Export (" })}{exportable.length} {t({ ar: "جاهز)", en: "ready)" })}</button>
            </>
          )}
        </div>
      </div>
    </>
  );

  /* --------------------------- الخطوة 3 --------------------------- */
  const um = useMemo(() => unmatchedValues(rows.filter((r) => !r.excluded)), [rows]);
  const umCount = Object.values(um).reduce((a, b) => a + b.length, 0);
  const ax = useMemo(() => approxValues(rows.filter((r) => !r.excluded)), [rows]);
  const axCount = Object.values(ax).reduce((a, b) => a + b.length, 0);
  const emptyReq = useMemo(() => {
    const m = {};
    for (const r of rows) {
      if (r.excluded) continue;
      for (const f of FIELDS) {
        const c = r.cells[f.key];
        if (c.status === 'error' && c.msg === 'حقل إلزامي فاضي') m[f.key] = (m[f.key] || 0) + 1;
      }
    }
    return Object.entries(m).filter(([, n]) => n >= 2);
  }, [rows]);
  const [fillVals, setFillVals] = useState({});
  const visibleFields = useMemo(() => {
    if (showAllCols) return FIELDS;
    return FIELDS.filter((f) => f.req || rows.some((r) => r.cells[f.key].status !== 'empty'));
  }, [rows, showAllCols]);
  const filtered = useMemo(() => {
    const q = normKey(query);
    return rows.filter((r) => {
      if (filter === 'excluded' && !r.excluded) return false;
      if (filter === 'ready' && (r.excluded || r.status === 'error')) return false;
      if (!['all', 'excluded', 'ready'].includes(filter) && (r.excluded || r.status !== filter)) return false;
      if (!q) return true;
      const hay = normKey(['first_name_ar', 'last_name_ar', 'first_name', 'last_name', 'national_id_number', 'employee_no', 'email', 'work_phone_number'].map((k) => r.cells[k].value).join(' ') + ' ' + r.src);
      return hay.includes(q);
    });
  }, [rows, filter, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const curPage = Math.min(page, pages - 1);
  const pageRows = filtered.slice(curPage * PAGE, curPage * PAGE + PAGE);

  const [editing, setEditing] = useState(null); // {src,key}
  const commitEdit = (src, key, val) => {
    setEditing(null);
    if (val === undefined) return;
    const row = rows.find((r) => r.src === src);
    const cell = row?.cells[key];
    const f = FIELD_BY_KEY[key];
    // قيمة قائمة غير موجودة/تقريبية: الاختيار ينطبق على كل الصفوف اللي فيها نفس القيمة الأصلية
    if (cell && f?.type === 'list' && val && cell.raw && !cell.manual && (cell.approx || /غير موجود بقائمة/.test(cell.msg || ''))) {
      const nk = normKey(cell.raw);
      const n = rows.filter((r) => !r.excluded && r.cells[key].raw && normKey(r.cells[key].raw) === nk).length;
      setUserMaps((m) => ({ ...m, [key]: { ...(m[key] || {}), [nk]: val } }));
      flash(n > 1 ? t({ ar: `"${cell.raw}" ← ${val} · طُبّق على ${n} صف فيها نفس القيمة`, en: `"${cell.raw}" ← ${val} · applied to ${n} rows with the same value` }) : `"${cell.raw}" ← ${val}`);
      return;
    }
    setOverrides((o) => ({ ...o, [src]: { ...(o[src] || {}), [key]: val } }));
    // خانة إلزامية فاضية: عرض تعبئة نفس القيمة لكل الفاضي بنفس العمود
    if (cell && val && !cell.raw && cell.status === 'error') {
      // فقط الخانات الحمراء الفاضية بنفس العمود (مثلًا نهاية العقد لغير السعوديين، لا للسعوديين اللي ما يحتاجونها)
      const targets = rows.filter((r) => !r.excluded && r.src !== src && r.cells[key].status === 'error' && !r.cells[key].raw && overrides[r.src]?.[key] === undefined).map((r) => r.src);
      if (targets.length > 0) {
        const shown = f?.type === 'date' && isIsoDate(val) ? fmtDate(val) : val;
        flash(t({ ar: `حُفظ ${f?.label}: ${shown}`, en: `Saved ${label(f)}: ${shown}` }), {
          label: t({ ar: `طبّقها على باقي الفاضي المطلوب (${targets.length})`, en: `Apply to the remaining required empty cells (${targets.length})` }),
          fn: () => setOverrides((o) => {
            const n = { ...o };
            for (const s of targets) n[s] = { ...(n[s] || {}), [key]: val };
            return n;
          }),
        });
      }
    }
  };
  const toggleExclude = (src) => setExcluded((s) => { const n = new Set(s); n.has(src) ? n.delete(src) : n.add(src); return n; });
  const applyMap = (field, nk, val) => { if (!val) return; setUserMaps((m) => ({ ...m, [field]: { ...(m[field] || {}), [nk]: val } })); };
  const acceptAllApprox = () => {
    setUserMaps((m) => {
      const n = { ...m };
      for (const [field, list] of Object.entries(ax)) { n[field] = { ...(n[field] || {}) }; for (const e of list) n[field][e.nk] = e.value; }
      return n;
    });
    flash(t({ ar: "اعتُمدت كل المطابقات التقريبية", en: "All approximate matches approved" }));
  };

  /* --------------------------- المتابعة مع العميل --------------------------- */
  const fuCount = useMemo(() => followupRows(rows, fuReview).length, [rows, fuReview]);
  const tlCount = useMemo(() => rows.filter((r) => !r.excluded && ['first_name_ar', 'last_name_ar', 'first_name', 'last_name'].some((k) => r.cells[k].translit)).length, [rows]);
  const doFollowup = async () => {
    setBusy(true);
    try {
      const bytes = await buildFollowup(rows, tplFile.tpl, { includeReview: fuReview });
      await download(bytes, `qhr_followup_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const loadFollowup = async (file) => {
    setErr('');
    try {
      const res = parseFollowup(readClientFile(await file.arrayBuffer(), file.name), rows);
      if (!res) { setErr(t({ ar: "هذا الملف ليس ملف استكمال من الأداة (ما فيه عمود مرجع الصف). ارفع الملف اللي نزّلته من زر \"ملف استكمال للعميل\" بعد ما يعبيه العميل.", en: "This is not a follow-up file from the tool (no row-reference column). Upload the file you downloaded with \"client follow-up file\" after the client fills it." })); return; }
      setOverrides((o) => {
        const n = { ...o };
        for (const [src, vals] of Object.entries(res.overrides)) n[src] = { ...(n[src] || {}), ...vals };
        return n;
      });
      flash(t({ ar: `طُبّق ${res.changed} تعديل على ${Object.keys(res.overrides).length} موظف${res.unknownRows.length ? ` · ${res.unknownRows.length} صف غير معروف تُجوهل` : ''}`, en: `Applied ${res.changed} changes to ${Object.keys(res.overrides).length} employees${res.unknownRows.length ? ` · ${res.unknownRows.length} unknown rows ignored` : ''}` }));
    } catch (e) { setErr(t({ ar: `تعذّر قراءة ملف الاستكمال: ${e.message}`, en: `Could not read the follow-up file: ${e.message}` })); }
  };
  const FollowupCard = tplFile && rows.length > 0 && (
    <div className="card">
      <div className="maphead">
        <div>
          <h2>{t({ ar: "متابعة مع العميل", en: "Follow up with the client" })}</h2>
          <p className="sub" style={{ margin: 0 }}>
            {t({ ar: "نزّل ملف فيه فقط الموظفين والخانات الناقصة أو الخاطئة (أصفر، مع سبب كل خانة وقوائم منسدلة)، أرسله للعميل، وبعد ما يرجعه ارفعه هنا وتنطبق التعبئة تلقائيًا.", en: "Download a file with only the employees and cells that are missing or wrong (yellow, with the reason and dropdowns), send it to the client, and when it comes back upload it here to apply the values." })}
            {tlCount > 0 && t({ ar: ` · ${tlCount} موظف اسمه مترجم تلقائيًا ويحتاج تأكيد.`, en: ` · ${tlCount} employees have auto-transliterated names that need confirming.` })}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        <button className="btn primary" disabled={busy || !fuCount} onClick={doFollowup}>{t({ ar: "تنزيل ملف استكمال للعميل (", en: "Download client follow-up file (" })}{fuCount} {t({ ar: "موظف)", en: "employees)" })}</button>
        <FileButton label={t({ ar: "رفع الملف بعد تعبئة العميل", en: "Upload the file after the client fills it" })} accept=".xlsx" onFile={loadFollowup} />
        <label className="switch"><input type="checkbox" checked={fuReview} onChange={(e) => setFuReview(e.target.checked)} />{t({ ar: "ضمّن الخانات اللي تحتاج تأكيد (أسماء مترجمة، هوية منتهية…)", en: "Include cells that need confirming (transliterated names, expired IDs…)" })}</label>
      </div>
      {err && step === 1 && <div className="banner err">{err}</div>}
    </div>
  );

  const renderCell = (r, f) => {
    const c = r.cells[f.key];
    const isEdit = editing && editing.src === r.src && editing.key === f.key;
    const shown = c.value !== '' && c.value !== undefined ? String(c.value) : (c.status === 'error' ? c.raw : '');
    const display = f.type === 'date' && isIsoDate(shown) ? fmtDate(shown) : shown;
    const tip = [tm(c.msg), c.raw && String(c.raw) !== String(c.value) ? t({ ar: `الأصل: ${c.raw}`, en: `Original: ${c.raw}` }) : ''].filter(Boolean).join('\n');
    if (isEdit) {
      return (
        <td key={f.key}><div className="cell-edit">
          <FieldEditor f={f} cell={c} list={tplFile.tpl.lists[f.key]} autoFocus onCommit={(v) => commitEdit(r.src, f.key, v)} onCancel={() => setEditing(null)} />
        </div></td>
      );
    }
    return (
      <td key={f.key}>
        <div className={`cell ${c.status} ${c.manual ? 'manual' : ''} ${c.acked ? 'acked' : ''}`} title={c.acked ? t({ ar: `تمت المراجعة\n${tip}`, en: `Reviewed\n${tip}` }) : tip} onClick={() => setEditing({ src: r.src, key: f.key })}>
          {['fixed', 'review', 'error'].includes(c.status) && <i className="dot" />}
          <span>{display || (c.status === 'empty' ? '—' : '')}</span>
        </div>
      </td>
    );
  };

  const approve = () => {
    saveProfile();
    setApproved(true); setMapView('simple'); setFilter('all'); setPage(0);
    window.scrollTo({ top: 0 });
    flash(t({ ar: "اعتُمدت المطابقة — راجع وصحّح البيانات بنفس الجدول", en: "Mapping approved — review and fix the data in the same table" }));
  };

  // لوحات المراجعة (تظهر فوق الجدول بعد الاعتماد)
  const ReviewPanels = tplFile && (
    <>
      <div className="stats">
        <button className={`stat ${filter === 'all' ? 'on' : ''}`} onClick={() => { setFilter('all'); setPage(0); }}><b>{counts.all}</b><span>{t({ ar: "إجمالي الصفوف", en: "Total rows" })}</span></button>
        <button className={`stat ok ${filter === 'ready' ? 'on' : ''}`} onClick={() => { setFilter('ready'); setPage(0); }}><b>{counts.ok + counts.review}</b><span>{t({ ar: "جاهز للرفع", en: "ready to upload" })}</span></button>
        <button className={`stat review ${filter === 'review' ? 'on' : ''}`} onClick={() => { setFilter('review'); setPage(0); }}><b>{counts.review}</b><span>{t({ ar: "منها عليها ملاحظات (تنرفع عادي)", en: "of them with notes (upload normally)" })}</span></button>
        <button className={`stat error ${filter === 'error' ? 'on' : ''}`} onClick={() => { setFilter('error'); setPage(0); }}><b>{counts.error}</b><span>{t({ ar: "فيه أخطاء", en: "With errors" })}</span></button>
        <button className={`stat ${filter === 'excluded' ? 'on' : ''}`} onClick={() => { setFilter('excluded'); setPage(0); }}><b>{counts.excluded}</b><span>{t({ ar: "مستبعد", en: "Excluded" })}</span></button>
      </div>

      {FollowupCard}

    </>
  );

  const ReviewToolbar = (
      <div className="toolbar">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" className="search" placeholder={t({ ar: "بحث بالاسم أو الهوية أو الرقم الوظيفي…", en: "Search by name, ID or employee number…" })} value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
          <span className="chip fixed">{t({ ar: "أزرق = صُحّح تلقائيًا", en: "Blue = auto-fixed" })}</span>
          <span className="chip review">{t({ ar: "أصفر = راجعه", en: "Yellow = review" })}</span>
          <span className="chip error">{t({ ar: "أحمر = لازم يتصلح", en: "Red = must fix" })}</span>
          <span className="chip gray">{t({ ar: "اضغط أي خلية للتعديل · قيمة القائمة الحمراء: اختر الصحيحة وتنطبق على كل الصفوف بنفس القيمة · رقم الصف يفتح نموذج الموظف", en: "Click any cell to edit · Red list value: pick the right one and it applies to all rows with the same value · Row number opens the employee form" })}</span>
          {reviewCells > 0 && (
            <button className="btn small" title={t({ ar: "يعتمد كل الخانات الصفراء الحالية كمراجَعة (تقدر تتراجع من نموذج الموظف)", en: "Marks all current yellow cells as reviewed (undo from the employee form)" })} onClick={() => {
              setReviewed((m) => {
                const n = { ...m };
                for (const r of rows) {
                  if (r.excluded) continue;
                  for (const f of FIELDS) if (r.cells[f.key].status === 'review') n[r.src] = { ...(n[r.src] || {}), [f.key]: String(r.cells[f.key].value ?? '') };
                }
                return n;
              });
              flash(t({ ar: `اعتُمدت ${reviewCells} خانة صفراء كمراجَعة`, en: `Approved ${reviewCells} yellow cells marked as reviewed` }));
            }}>{t({ ar: "✓ تمت مراجعة كل الأصفر (", en: "✓ Mark all yellow as reviewed (" })}{reviewCells})</button>
          )}
        </div>
        {headers.length > mappedCount && (
          <label className="switch"><input type="checkbox" checked={showIgnored} onChange={(e) => setShowIgnored(e.target.checked)} />{t({ ar: "عرض الأعمدة المتجاهلة (", en: "Show ignored columns (" })}{headers.length - mappedCount})</label>
        )}
      </div>
  );

  // الجدول الموحّد بعد الاعتماد: نفس صفّي المطابقة فوق (قائمة الحقل + عنوان عمود العميل)، وتحتها كل الصفوف بقيمها النهائية
  const srcIndex = useMemo(() => new Map((prepared?.src || []).map((s, i) => [String(s), i])), [prepared]);
  const UnifiedTable = () => {
    const primaryOf = (col) => keysOfCol(col)[0];
    const primary = new Set(headers.map((h) => primaryOf(h.col)).filter(Boolean));
    // بعد الاعتماد: الأعمدة المتجاهلة مخفية (إلا إذا طلب المستخدم إظهارها)
    const cols = showIgnored ? headers : headers.filter((h) => primaryOf(h.col));
    const hide = new Set();
    if (primary.has('full_name_ar')) { hide.add('first_name_ar'); hide.add('last_name_ar'); }
    if (primary.has('full_name_en')) { hide.add('first_name'); hide.add('last_name'); }
    // حقول قيود بدون عمود بملف العميل لكنها تهم: الإلزامي، أو المثبّت بقيمة، أو اللي عليه ملاحظات
    const extras = FIELDS.filter((f) => !primary.has(f.key) && !hide.has(f.key)
      && (tplFile.tpl.required.has(f.key) || constants[f.key] || rows.some((r) => !r.excluded && ['error', 'review'].includes(r.cells[f.key].status))));
    const RANK = { error: 3, review: 2, fixed: 1, ok: 0, empty: 0 };
    const nameCell = (r, a, b, key) => {
      const ca = r.cells[a], cb = r.cells[b];
      const st = RANK[ca.status] >= RANK[cb.status] ? ca.status : cb.status;
      const tip = [tm(ca.msg), tm(cb.msg)].filter(Boolean).join('\n');
      return (
        <td key={key}>
          <div className={`cell ${st}`} title={tip ? t({ ar: `${tip}\nاضغط لتعديل الاسم`, en: `${tip}\nClick to edit the name` }) : t({ ar: "اضغط لتعديل الاسم", en: "Click to edit the name" })} onClick={() => setDrawerRow(r.src)}>
            {['fixed', 'review', 'error'].includes(st) && <i className="dot" />}
            <span>{`${ca.value || ''} ${cb.value || ''}`.trim() || '—'}</span>
          </div>
        </td>
      );
    };
    const total = cols.length + extras.length + 2;
    return (
      <div className="maptable-wrap review-wrap">
        <table className="maptable review">
          <thead>
            <tr className="pick">
              <th className="sticky c0" />
              <th className="sticky c1" />
              {cols.map((h) => <th key={h.col} className={cardState(h.col).cls}><FieldPicker col={h.col} /></th>)}
              {extras.map((f) => <th key={f.key} className="extra"><span className="nofile">{constants[f.key] ? t({ ar: "قيمة ثابتة للكل", en: "Fixed value for all" }) : t({ ar: "ليس له عمود بالملف", en: "No column in the file" })}</span></th>)}
            </tr>
            <tr className="colname">
              <th className="sticky c0">{t({ ar: "الصف", en: "Row" })}</th>
              <th className="sticky c1">{t({ ar: "الحالة", en: "Status" })}</th>
              {cols.map((h) => {
                const st = cardState(h.col);
                return <th key={h.col} className={st.cls} title={h.text}><span className="nm">{h.text}</span>{st.cls === 'check' && <span className="chip review">{t({ ar: "تأكد", en: "Check" })}</span>}</th>;
              })}
              {extras.map((f) => <th key={f.key} className="extra" title={label(f)}><span className="nm">{label(f)}{tplFile.tpl.required.has(f.key) ? ' *' : ''}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const raw = prepared.data[srcIndex.get(String(r.src))] || [];
              return (
                <tr key={r.src} className={r.excluded ? 'excluded' : ''}>
                  <td className="sticky c0"><button className="rownum" onClick={() => setDrawerRow(r.src)} title={t({ ar: "نموذج الموظف", en: "Employee form" })}>{r.src}</button></td>
                  <td className="sticky c1"><div className="rowstate"><span className={`chip ${r.status}`}>{r.status === 'ok' ? t({ ar: "جاهز", en: "Ready" }) : r.status === 'review' ? t({ ar: `مراجعة ${r.reviewCount}`, en: `Review ${r.reviewCount}` }) : t({ ar: `خطأ ${r.errorCount}`, en: `Error ${r.errorCount}` })}</span></div></td>
                  {cols.map((h) => {
                    const k = primaryOf(h.col);
                    if (!k) return <td key={h.col} className="ignored"><div className="cell">{cellText(raw[h.col])}</div></td>;
                    if (k === 'full_name_ar') return nameCell(r, 'first_name_ar', 'last_name_ar', h.col);
                    if (k === 'full_name_en') return nameCell(r, 'first_name', 'last_name', h.col);
                    return <React.Fragment key={h.col}>{renderCell(r, FIELD_BY_KEY[k])}</React.Fragment>;
                  })}
                  {extras.map((f) => <React.Fragment key={f.key}>{renderCell(r, f)}</React.Fragment>)}
                </tr>
              );
            })}
            {!pageRows.length && <tr><td colSpan={total}><div className="empty">{t({ ar: "لا توجد صفوف بهذا التصفية", en: "No rows match this filter" })}</div></td></tr>}
          </tbody>
        </table>
      </div>
    );
  };

  /* --------------------------- الخطوة 4 --------------------------- */
  const doExport = async (force = false) => {
    // تأكيد داخل الصفحة (نوافذ confirm المنبثقة محجوبة في بعض المتصفحات والصفحات المضمّنة)
    if (tplFile.tpl.isSample && !force) { setAskSample(true); return; }
    setAskSample(false);
    setBusy(true);
    try {
      const max = tplFile.tpl.maxRows;
      const chunks = [];
      for (let i = 0; i < exportable.length; i += max) chunks.push(exportable.slice(i, i + max));
      for (let i = 0; i < chunks.length; i++) {
        const bytes = await fillTemplate(tplFile.buffer, tplFile.tpl, chunks[i]);
        await download(bytes, chunks.length > 1 ? `qhr_employees_upload_part${i + 1}.xlsx` : 'qhr_employees_upload.xlsx');
        await new Promise((r) => setTimeout(r, 400));
      }
      flash(t({ ar: `نُزّل ${chunks.length} ملف (${exportable.length} موظف)`, en: `Downloaded ${chunks.length} file(s) (${exportable.length} employees)` }));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const doReport = async () => {
    setBusy(true);
    try {
      const bytes = await buildReport(rows, { clientFile: client.name, templateFile: tplFile.name, exported: exportable.length, skipped: prepared?.skipped || [] });
      await download(bytes, 'qhr_import_report.xlsx');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  // ملخص أسباب الأخطاء: كم صف يتأثر بكل سبب (عشان يكون واضح ليش الصفوف ما تدخل ملف الرفع)
  const errorSummary = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (r.excluded || r.status !== 'error') continue;
      const seen = new Set();
      for (const f of FIELDS) {
        const c = r.cells[f.key];
        if (c.status !== 'error') continue;
        const why = /غير موجود بقائمة/.test(c.msg || '') ? t({ ar: "قيمة غير موجودة بقائمة القالب", en: "Value not in the template list" }) : (c.msg || t({ ar: "خطأ", en: "Error" })).split(' • ').pop().replace(/"[^"]*"/g, '').replace(/:\s*$/, '').trim();
        const k = `${f.key}|${why}`;
        if (seen.has(k)) continue;
        seen.add(k);
        m.set(k, { field: label(f), why: tm(why), n: (m.get(k)?.n || 0) + 1 });
      }
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [rows, tm]);
  const goFixErrors = () => { setFilter('error'); setPage(0); setApproved(true); setMapView('simple'); setStep(1); };

  const StepExport = tplFile && client && (
    <>
      <div className="card">
        <h2>{t({ ar: "جاهز للتصدير", en: "Ready to export" })}</h2>
        <p className="sub">{t({ ar: "يُعبَّأ قالب قيود الرسمي نفسه بدون أي تغيير بالترويسة أو القوائم، فيصير جاهز لرفعه كما هو.", en: "The official Qoyod template itself is filled with no change to headers or lists, so it is ready to upload as is." })}</p>
        {SampleWarn}
        <div className="stats">
          <div className="stat ok"><b>{counts.ok}</b><span>{t({ ar: "جاهز", en: "Ready" })}</span></div>
          <div className="stat review"><b>{counts.review}</b><span>{t({ ar: "للمراجعة (تدخل الملف عادي)", en: "Review (included normally)" })}</span></div>
          <div className="stat error"><b>{counts.error}</b><span>{t({ ar: "أخطاء (لن تُضمَّن)", en: "Errors (not included)" })}</span></div>
          <div className="stat"><b>{exportable.length}</b><span>{t({ ar: "صفوف في ملف الرفع", en: "Rows in the upload file" })}</span></div>
        </div>
        {counts.error > 0 && (
          <div className={`banner ${exportable.length ? 'warn' : 'err'}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <b>{exportable.length
                ? t({ ar: `${counts.error} صف فيه أخطاء ما راح يدخل بملف الرفع.`, en: `${counts.error} rows with errors will not be in the upload file.` })
                : t({ ar: `زر التنزيل معطّل لأنه ما في ولا صف جاهز: كل الصفوف (${counts.error}) فيها خطأ واحد على الأقل، وقيود يرفضها.`, en: `Download is disabled because no row is ready: all rows (${counts.error}) have at least one error, and Qoyod rejects them.` })}</b>
              <button className="btn small primary" onClick={goFixErrors}>{t({ ar: "صلّح الأخطاء الآن", en: "Fix errors now" })}</button>
            </div>
            <div style={{ marginTop: 6 }}>{t({ ar: "أكثر الأسباب:", en: "Top reasons:" })}</div>
            <ul className="errsum">
              {errorSummary.slice(0, 8).map((e) => <li key={e.field + e.why}><b>{e.field}</b>: {e.why} — <span className="chip error">{e.n} {t({ ar: "صف", en: "Row" })}</span></li>)}
            </ul>
            <div style={{ fontSize: 13 }}>{t({ ar: "اضغط \"صلّح الأخطاء الآن\" وصحّح كل خانة حمراء بالجدول. اختيار قيمة من القائمة ينطبق على كل الصفوف بنفس القيمة، وتعبئة خانة إلزامية فاضية تعرض تطبيقها على باقي الفاضي.", en: "Click \"Fix errors now\" and fix each red cell in the table. Picking a list value applies to every row with the same value, and filling an empty required cell offers to apply it to the other empty ones." })}</div>
          </div>
        )}
        {exportable.length > tplFile.tpl.maxRows && <div className="banner info">{t({ ar: "القالب يدعم", en: "The template supports" })} {tplFile.tpl.maxRows} {t({ ar: "صفًا بالملف، فبينقسم لعدة ملفات.", en: "rows per file, so it will be split into several files." })}</div>}
        {err && <div className="banner err">{err}</div>}
        <div className="actions">
          <button className="btn" onClick={() => setStep(1)}>{t({ ar: "رجوع للمراجعة", en: "Back to review" })}</button>
          <div className="right">
            <button className="btn" disabled={busy || !rows.length} onClick={doReport}>{t({ ar: "تنزيل تقرير الملاحظات", en: "Download notes report" })}</button>
            <button className="btn primary" disabled={busy || !exportable.length} onClick={() => doExport(false)}>{busy ? t({ ar: "جارٍ التجهيز…", en: "Preparing…" }) : t({ ar: `تنزيل ملف الرفع (${exportable.length})`, en: `Download upload file (${exportable.length})` })}</button>
          </div>
        </div>
        {askSample && (
          <div className="banner err" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <span>{t({ ar: "القالب الحالي تجريبي، وقيود سيرفض الملف. تبي تنزّله للتجربة فقط؟", en: "The current template is a sample and Qoyod will reject the file. Download it for testing only?" })}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button className="btn small" onClick={() => doExport(true)}>{t({ ar: "نعم، نزّله للتجربة", en: "Yes, download for testing" })}</button>
              <button className="btn small" onClick={() => setAskSample(false)}>{t({ ar: "إلغاء", en: "Cancel" })}</button>
            </span>
          </div>
        )}
      </div>
      {FollowupCard}
      <div className="card">
        <h2>{t({ ar: "بعد التنزيل", en: "After downloading" })}</h2>
        <ol className="steps-howto">
          <li>{t({ ar: "افتح قيود HR ← الموظفين ← إضافة جماعية.", en: "Open Qoyod HR → Employees → Bulk add." })}</li>
          <li>{t({ ar: "ارفع الملف الذي نزّلته من هنا (نفس القالب، فقط معبّأ).", en: "Upload the file you downloaded here (the same template, just filled)." })}</li>
          <li>{t({ ar: "الموظفون يُنشأون بالخلفية، راجع قائمة الموظفين وتنبيه \"بيانات ناقصة\" بعدها.", en: "Employees are created in the background; check the employee list and the \"missing data\" alert afterwards." })}</li>
          <li>{t({ ar: "تقرير الملاحظات يوضح كل ما صُحّح وكل ما استُبعد وسببه، سلّمه للعميل للمتابعة.", en: "The notes report shows everything fixed and excluded and why; hand it to the client for follow-up." })}</li>
        </ol>
      </div>
    </>
  );

  /* --------------------------- درج تفاصيل الصف --------------------------- */
  const dRow = rows.find((r) => r.src === drawerRow);
  const Drawer = dRow && (
    <>
      <div className="drawer-bg" onClick={() => setDrawerRow(null)} />
      <aside className="drawer">
        <h3>{t({ ar: "الصف", en: "Row" })} {dRow.src} {t({ ar: "في ملف العميل", en: "in the client file" })}</h3>
        <p className="sub">{dRow.cells.first_name_ar.value} {dRow.cells.last_name_ar.value} · {dRow.cells.first_name.value} {dRow.cells.last_name.value}</p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="switch"><input type="checkbox" checked={!!dRow.excluded} onChange={() => toggleExclude(dRow.src)} />{t({ ar: "استبعد من التصدير", en: "Exclude from export" })}</label>
          <div className="seg">
            <button className={!drawerAll ? 'on' : ''} onClick={() => setDrawerAll(false)}>{t({ ar: "الملاحظات (", en: "Notes (" })}{FIELDS.filter((f) => ['error', 'review'].includes(dRow.cells[f.key].status)).length})</button>
            <button className={drawerAll ? 'on' : ''} onClick={() => setDrawerAll(true)}>{t({ ar: "كل الحقول", en: "All fields" })}</button>
          </div>
        </div>
        <p className="sub" style={{ margin: '10px 0 0' }}>{t({ ar: "عدّل مباشرة: التواريخ بالتقويم، القوائم بالاختيار، والباقي بالكتابة. التعديل ينحفظ فورًا. الأصفر تقدر تعتمده بـ \"تمت المراجعة\".", en: "Edit directly: dates with the calendar, lists by choosing, the rest by typing. Changes save instantly. Yellow can be approved with \"Reviewed\"." })}</p>
        {(() => {
          const pending = FIELDS.filter((f) => dRow.cells[f.key].status === 'review');
          return pending.length > 0 && (
            <button className="btn small primary" style={{ marginTop: 10 }} onClick={() => markReviewed(dRow, pending.map((f) => f.key))}>{t({ ar: "✓ تمت مراجعة كل ملاحظات هذا الموظف (", en: "✓ Mark all this employee's notes as reviewed (" })}{pending.length})</button>
          );
        })()}
        {FIELDS.filter((f) => drawerAll || ['error', 'review', 'fixed'].includes(dRow.cells[f.key].status) || dRow.cells[f.key].manual || dRow.cells[f.key].acked)
          .sort((a, b) => (drawerAll ? 0 : ({ error: 0, review: 1, fixed: 2, ok: 3, empty: 3 }[dRow.cells[a.key].status] - { error: 0, review: 1, fixed: 2, ok: 3, empty: 3 }[dRow.cells[b.key].status])))
          .map((f) => {
            const c = dRow.cells[f.key];
            const NOTE_TAG = { fixed: t({ ar: "صُحّح تلقائيًا", en: "Auto-fixed" }), review: t({ ar: "للمراجعة", en: "Review" }), error: t({ ar: "خطأ", en: "Error" }) };
            return (
              <div key={f.key} className={`issue edit ${c.status}`}>
                <div className="issue-top">
                  <b>{label(f)}{tplFile.tpl.required.has(f.key) ? ' *' : ''}</b>
                  {c.status !== 'ok' && c.status !== 'empty' && <span className={`chip ${c.status}`}>{t(STATUS_LABEL[c.status])}</span>}
                  {c.acked && <span className="chip ok">{t({ ar: "✓ تمت المراجعة", en: "✓ Reviewed" })}</span>}
                  {c.manual && <span className="chip gray">{t({ ar: "معدّل يدويًا", en: "Edited manually" })}</span>}
                </div>
                <FieldEditor inline f={f} cell={c} list={tplFile.tpl.lists[f.key]} onCommit={(v) => commitEdit(dRow.src, f.key, v)} />
                {(c.notes || []).length > 0 && (
                  <ul className="notes">
                    {c.notes.map((n, i) => (
                      <li key={i} className={c.acked && n.status === 'review' ? 'ok' : n.status}>
                        <span className="tag">{c.acked && n.status === 'review' ? t({ ar: "روجعت", en: "Reviewed" }) : NOTE_TAG[n.status] || ''}</span>
                        <span>{tm(n.msg)}</span>
                        {n.ref !== undefined && <button className="btn small" onClick={() => setDrawerRow(n.ref)}>{t({ ar: "افتح الصف", en: "Open row" })} {n.ref}</button>}
                      </li>
                    ))}
                  </ul>
                )}
                {c.status === 'review' && <div><button className="btn small" onClick={() => markReviewed(dRow, [f.key])}>{t({ ar: "✓ تمت المراجعة", en: "✓ Reviewed" })}</button></div>}
                {c.acked && <div><button className="btn small ghost" onClick={() => unmarkReviewed(dRow.src, f.key)}>{t({ ar: "تراجع عن المراجعة", en: "Undo review" })}</button></div>}
                {c.raw && String(c.raw) !== String(c.value) && <div className="diff">{t({ ar: "الأصل بملف العميل:", en: "Original in the client file:" })} {c.raw}</div>}
              </div>
            );
          })}
        <div className="actions"><span /><button className="btn" onClick={() => setDrawerRow(null)}>{t({ ar: "إغلاق", en: "Close" })}</button></div>
      </aside>
    </>
  );

  const stepOK = [true, !!tplFile && !!client && !!records.length && approved];
  const STEP_SUB = [
    t({ ar: "ارفع قالب قيود الرسمي وملف العميل كما هو", en: "Upload the official Qoyod template and the client file as it is" }),
    approved ? t({ ar: "صحّح الأخطاء واعتمد الملاحظات بنفس جدول المطابقة", en: "Fix errors and approve notes in the same mapping table" }) : t({ ar: "وين يروح كل عمود من ملف العميل بقالب قيود، ثم اعتماد", en: "Where each client column goes in the Qoyod template, then approve" }),
    t({ ar: "نزّل ملف الرفع الجاهز لقيود والتقارير", en: "Download the Qoyod-ready upload file and reports" }),
  ];
  const STEP_ICON = [ICONS.upload, 'M4 6h7M4 12h7M4 18h7M15 6l5 6-5 6', ICONS.down];
  return (
    <div className="qhr-emp" dir={dir}>
      <header className="qhr-head">
        <div className="qhr-head-title">
          <span className="mark" dir="ltr"><span className="q">Q</span><span className="hr">HR</span></span>
          <div>
            <h1>{t({ ar: "مطابقة واستيراد موظفي قيود اتش ار", en: "Match & Import Qoyod HR Employees" })}</h1>
            <p>{t(STEPS[step])} — {STEP_SUB[step]}</p>
          </div>
        </div>
        <div className="topbar-meta">
          {tplFile && <span className="pill" title={tplFile.name}>{t({ ar: "القالب:", en: "Template:" })} {tplFile.name}</span>}
          {client && <span className="pill" title={client.name}>{t({ ar: "العميل:", en: "Client:" })} {client.name}</span>}
          {rows.length > 0 && <span className={`pill ${counts.error ? 'warn' : 'ok'}`}>{exportable.length} / {rows.length} {t({ ar: "جاهز للرفع", en: "ready to upload" })}</span>}
        </div>
      </header>
      <nav className="qhr-steps">
        {STEPS.map((s, i) => (
          <button key={s.ar} className={`qhr-step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`} disabled={i > step && !stepOK[i - 1]} onClick={() => setStep(i)}>
            <Icon d={i < step ? ICONS.check : STEP_ICON[i]} size={18} />
            <span>{t(s)}</span>
            {i === 1 && approved && rows.length > 0 && counts.error > 0 && <em className="badge">{counts.error}</em>}
          </button>
        ))}
        <span className="qhr-steps-note">{t({ ar: "🔒 كل المعالجة داخل المتصفح، ولا يُرفع ملف العميل لأي مكان.", en: "🔒 All processing happens in the browser; the client file is not uploaded anywhere." })}</span>
      </nav>
      <div className="content">
        {busy && step === 0 && <div className="banner info">{t({ ar: "جارٍ قراءة الملف وتحليله…", en: "Reading and analysing the file…" })}</div>}
        {step === 0 && StepFiles}
        {step === 1 && renderStepMap()}
        {step === 2 && StepExport}
      </div>
      {Drawer}
      {toast && (
        <div className="toast">
          <span>{toast}</span>
          {toastAction && <button className="btn small primary" onClick={() => { toastAction.fn(); setToast(''); setToastAction(null); }}>{toastAction.label}</button>}
        </div>
      )}
    </div>
  );
});

export default EmployeesImport;
