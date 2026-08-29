import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { readTemplate } from './engine/template.js';
import { detectMapping, parseSource, findSourceHeaderRow } from './engine/parseSource.js';
import { collectDecisions, runPipeline } from './engine/pipeline.js';
import { ENGINE_DEFAULTS } from './engine/constants.js';
import {
  readWorkbook, mapReferenceRecords, detectReferenceMapping,
  referenceHeaderFinder, locationStockHeaderFinder, parseLocationStock,
} from './io/readWorkbook.js';

import ReconStrip from './components/ReconStrip.jsx';
import Step1References from './components/Step1References.jsx';
import Step2Source from './components/Step2Source.jsx';
import Step3Mapping from './components/Step3Mapping.jsx';
import Step4Validate from './components/Step4Validate.jsx';
import Step5Export from './components/Step5Export.jsx';

import './styles.css';

const STEPS = [
  { id: 1, label: 'المراجع',    hint: 'قالب قيود · العملاء · المنتجات' },
  { id: 2, label: 'ملف العميل', hint: 'الرفع وربط الأعمدة' },
  { id: 3, label: 'المطابقة',   hint: 'العملاء · المنتجات · الدفع · المواقع' },
  { id: 4, label: 'التحقق',     hint: 'الملاحظات والمطابقة الحسابية' },
  { id: 5, label: 'التصدير',    hint: 'قالب قيود · المرتجعات · التقرير' },
];

const EMPTY_DECISIONS = {
  customers: {}, products: {}, payments: {}, locations: {},
  defaultPayment: '', defaultLocation: '',
};

/**
 * أداة استيراد فواتير المبيعات — المكوّن الرئيسي.
 *
 * مستقل تماماً: لا يعتمد على router ولا على أي Context خارجي، ولا يقرأ أي
 * متغيّر بيئة، ولا يتصل بأي خدمة. كل المعالجة داخل المتصفح.
 *
 * @param {object}   props
 * @param {string}   props.storageKey        مفتاح حفظ قرارات المطابقة في localStorage.
 *                                           مرّر قيمة فريدة لكل عميل لتفصل قراراتهم.
 *                                           مرّر null لتعطيل الحفظ تماماً.
 * @param {boolean}  props.showHeader        إظهار الشريط العلوي. مرّر false عند الدمج
 *                                           داخل تطبيق له شريطه الخاص.
 * @param {object}   props.initialOptions    تجاوز إعدادات المحرك الافتراضية.
 * @param {object}   props.initialDecisions  قرارات مطابقة مبدئية (تسبق المحفوظة).
 * @param {Function} props.onResult          يُستدعى بعد كل إعادة حساب: (result) => void
 * @param {Function} props.onExport          يُستدعى بعد كل تصدير: ({ kind, filename }) => void
 * @param {Function} props.onError           يُستدعى عند أي خطأ: (message) => void
 * @param {Function} props.onStepChange      يُستدعى عند تغيّر الخطوة: (stepId) => void
 */
export default function InvoiceImportTool({
  storageKey = 'qoyod-invoice-import/decisions',
  showHeader = true,
  initialOptions,
  initialDecisions,
  onResult,
  onExport,
  onError,
  onStepChange,
} = {}) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');

  const [template, setTemplate] = useState(null);
  const [templateFile, setTemplateFile] = useState('');

  const [references, setReferences] = useState({ customers: [], products: [], locationStock: null });
  const [refRaw, setRefRaw] = useState({ customers: null, products: null });
  const [refHeaders, setRefHeaders] = useState({ customers: null, products: null });
  const [refMapping, setRefMapping] = useState({
    customers: { name: '', ref: '' },
    products: { code: '', barcode: '', name: '', stock: '', tracked: '', sellable: '' },
  });
  const [customersFile, setCustomersFile] = useState('');
  const [productsFile, setProductsFile] = useState('');
  const [locationStockFile, setLocationStockFile] = useState('');
  const [locationStockInfo, setLocationStockInfo] = useState(null); // { idColumns, locationColumns, count }

  const [sourceFile, setSourceFile] = useState('');
  const [sourceRaw, setSourceRaw] = useState(null);
  const [sourceHeaders, setSourceHeaders] = useState(null);
  const [sourceMapping, setSourceMapping] = useState({});

  const [decisions, setDecisions] = useState(() => loadDecisions(storageKey, initialDecisions));
  const [options, setOptions] = useState({ ...ENGINE_DEFAULTS, ...(initialOptions || {}) });

  /* حفظ القرارات محلياً حتى لا يعيد المستخدم ربط طرق الدفع مع كل ملف */
  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(decisions)); } catch { /* التخزين قد يكون معطلاً */ }
  }, [decisions, storageKey]);

  const raise = useCallback(msg => {
    setError(msg);
    onError?.(msg);
  }, [onError]);

  /*
   * تفكيك ملف المصدر — عمود «رقم الفاتورة» وحده إلزامي لبدء التفكيك. عمود «نوع
   * السطر» اختياري: إن وُجد فالملف منظَّم (رأس/بند/دفع)، وإن غاب فالملف مسطَّح
   * (صف واحد لكل بند منتج، بيانات الفاتورة تُقرأ من كل صف وتُوفَّق تلقائياً) —
   * parseSource يختار المسار المناسب داخلياً.
   */
  const parsed = useMemo(() => {
    if (!sourceRaw || !sourceMapping.invoiceNumber) return null;
    try { return parseSource(sourceRaw.records, sourceMapping); }
    catch (e) { raise(`تعذّر تفكيك الملف: ${e.message}`); return null; }
  }, [sourceRaw, sourceMapping, raise]);

  /* ── القرارات المعلّقة ── */
  const pending = useMemo(() => {
    if (!parsed || !template) return null;
    return collectDecisions({ sales: parsed.sales, references, decisions, template });
  }, [parsed, template, references, decisions]);

  // مرجع دائم التحديث بآخر قيمة لـ pending، يقرؤه actions.decideAll وقت التنفيذ
  // لا وقت التعريف — بدونه يطبّق "تطبيق على الكل" قائمة قديمة من القيم المعلّقة
  const pendingRef = useRef(null);
  useEffect(() => { pendingRef.current = pending; }, [pending]);

  /* ── التحويل والتحقق ── */
  const result = useMemo(() => {
    if (!parsed || !template || !parsed.sales.length) return null;
    try { return runPipeline({ sales: parsed.sales, references, decisions, template, options }); }
    catch (e) { raise(`تعذّر التحويل: ${e.message}`); return null; }
  }, [parsed, template, references, decisions, options, raise]);

  /* إبلاغ المضيف بالنتيجة بعد كل إعادة حساب */
  const lastResult = useRef(null);
  useEffect(() => {
    if (result !== lastResult.current) {
      lastResult.current = result;
      if (result) onResult?.(result);
    }
  }, [result, onResult]);

  useEffect(() => { onStepChange?.(step); }, [step, onStepChange]);

  /* ── الأفعال ── */
  const loadTemplate = useCallback(async file => {
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const t = await readTemplate(buf);
      setTemplate(t);
      setTemplateFile(file.name);
      setDecisions(d => ({
        ...d,
        // موقع واحد فقط في القالب يعني أنه الموقع الوحيد الممكن، فيُعتمد افتراضياً
        defaultLocation: d.defaultLocation || (t.lists.location?.length === 1 ? t.lists.location[0] : ''),
      }));
    } catch (e) {
      raise(`تعذّرت قراءة القالب: ${e.message}`);
      setTemplate(null);
      setTemplateFile('');
    }
  }, [raise]);

  const loadReference = useCallback(async (file, kind) => {
    setError('');
    try {
      // صف العناوين قد لا يكون الأول — يُكتشف بفحص أول صفوف الملف بدل افتراضه
      const wbk = await readWorkbook(file, { findHeader: referenceHeaderFinder(kind) });
      const m = detectReferenceMapping(wbk.headers, kind);
      setRefRaw(r => ({ ...r, [kind]: wbk }));
      setRefHeaders(h => ({ ...h, [kind]: wbk.headers }));
      setRefMapping(mm => ({ ...mm, [kind]: { ...mm[kind], ...m } }));
      setReferences(refs => ({ ...refs, [kind]: mapReferenceRecords(wbk.records, m, kind) }));
      if (kind === 'customers') setCustomersFile(file.name);
      else setProductsFile(file.name);
    } catch (e) {
      raise(`تعذّرت قراءة الملف: ${e.message}`);
    }
  }, [raise]);

  const loadLocationStock = useCallback(async file => {
    setError('');
    try {
      const wbk = await readWorkbook(file, { findHeader: locationStockHeaderFinder() });
      const parsed = parseLocationStock(wbk);
      setReferences(refs => ({ ...refs, locationStock: parsed }));
      setLocationStockFile(file.name);
      setLocationStockInfo({
        idColumns: parsed.idColumns,
        locationColumns: parsed.locationColumns,
        count: parsed.rows.length,
      });
    } catch (e) {
      raise(`تعذّرت قراءة ملف كميات المواقع: ${e.message}`);
    }
  }, [raise]);

  const clearLocationStock = useCallback(() => {
    setReferences(refs => ({ ...refs, locationStock: null }));
    setLocationStockFile('');
    setLocationStockInfo(null);
  }, []);

  const setRefMappingField = useCallback((kind, field, value) => {
    setRefMapping(prev => {
      const next = { ...prev, [kind]: { ...prev[kind], [field]: value } };
      const raw = refRaw[kind];
      if (raw) setReferences(refs => ({ ...refs, [kind]: mapReferenceRecords(raw.records, next[kind], kind) }));
      return next;
    });
  }, [refRaw]);

  const loadSource = useCallback(async file => {
    setError('');
    try {
      const wbk = await readWorkbook(file, { findHeader: findSourceHeaderRow });
      setSourceRaw(wbk);
      setSourceHeaders(wbk.headers);
      setSourceMapping(detectMapping(wbk.headers));
      setSourceFile(file.name);
    } catch (e) {
      raise(`تعذّرت قراءة الملف: ${e.message}`);
      setSourceRaw(null);
      setSourceHeaders(null);
      setSourceFile('');
    }
  }, [raise]);

  const actions = useMemo(() => ({
    loadTemplate,
    loadReference,
    loadSource,
    loadLocationStock,
    clearLocationStock,
    setRefMapping: setRefMappingField,
    setSourceMapping: (field, value) => setSourceMapping(m => ({ ...m, [field]: value })),
    decide: (kind, key, value) => setDecisions(d => ({ ...d, [kind]: { ...d[kind], [key]: value } })),
    // يطبّق قيمة واحدة على كل القيم المعلّقة الحالية لهذا النوع دفعة واحدة —
    // "تطبيق على الكل" لموقع أو طريقة دفع بدل اختيارها فاتورة فاتورة
    decideAll: (kind, value) => setDecisions(d => {
      const items = pendingRef.current?.[kind] || [];
      const next = { ...d[kind] };
      for (const p of items) next[p.key] = value;
      return { ...d, [kind]: next };
    }),
    setDefault: (key, value) => setDecisions(d => ({ ...d, [key]: value })),
    setOption: (key, value) => setOptions(o => ({ ...o, [key]: value })),
    resetDecisions: () => setDecisions({ ...EMPTY_DECISIONS }),
    notifyExport: payload => onExport?.(payload),
  }), [loadTemplate, loadReference, loadSource, loadLocationStock, clearLocationStock, setRefMappingField, onExport]);

  const state = {
    template, templateFile, references, refHeaders, refMapping, customersFile, productsFile,
    locationStockFile, locationStockInfo,
    sourceFile, sourceRaw, sourceHeaders, sourceMapping, parsed, decisions, pending, result, options,
  };

  /*
   * ملفا المنتجات ومواقع المنتجات إلزاميان معاً — لا يُنتقَل إلى ملف العميل ولا
   * ما بعده قبل رفعهما (وملف العملاء) بنجاح. رصيد المخزون حسب الموقع تحديداً هو
   * ما يمنع الفواتير من إعادة استخدام نفس الكمية الأصلية بشكل مستقل عن بعضها.
   */
  const referencesReady = !!template
    && references.customers?.length > 0
    && references.products?.length > 0
    && !!references.locationStock?.rows?.length;

  /* الخطوة تُفتح فقط عندما تتوفر مدخلاتها */
  const ready = {
    1: true,
    2: referencesReady,
    3: referencesReady && !!parsed && !!template,
    4: referencesReady && !!result,
    5: referencesReady && !!result,
  };

  const openCount = pending
    ? pending.customers.filter(p => !decisions.customers?.[p.key]).length
      + pending.products.filter(p => !decisions.products?.[p.key]).length
      + pending.payments.filter(p => !decisions.payments?.[p.key]).length
      + pending.locations.filter(p => !decisions.locations?.[p.key]).length
    : 0;

  return (
    <div className="qii-app" dir="rtl">
      {showHeader && (
        <header className="qii-topbar">
          <h1>استيراد فواتير المبيعات</h1>
          <span className="sub">تحويل ملفات العملاء إلى قالب قيود الرسمي</span>
          <span className="spacer" />
          {result && (
            <span className="sub mono">
              {result.summary.invoices} فاتورة · {result.summary.rows} صف
            </span>
          )}
        </header>
      )}

      <div className="qii-shell">
        <nav className="qii-sidebar">
          <ol className="qii-steps">
            {STEPS.map(s => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`qii-step${step === s.id ? ' active' : ''}${step > s.id && ready[s.id] ? ' done' : ''}`}
                  onClick={() => setStep(s.id)}
                  disabled={!ready[s.id]}
                >
                  <span className="qii-step-num">{s.id}</span>
                  <span>
                    <span className="qii-step-label">{s.label}</span>
                    <span className="qii-step-hint">
                      {s.id === 3 && openCount > 0 ? `${openCount} قرار معلّق` : s.hint}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <div className="qii-sidebar-foot">
            <button type="button" className="qii-btn ghost sm" onClick={actions.resetDecisions}>
              مسح قرارات المطابقة المحفوظة
            </button>
          </div>
        </nav>

        <main className="qii-main">
          {error && (
            <div className="qii-note stop" role="alert">
              {error}
              <button type="button" className="qii-btn ghost sm" style={{ marginInlineStart: 10 }} onClick={() => setError('')}>
                إخفاء
              </button>
            </div>
          )}

          {step === 1 && <Step1References state={state} actions={actions} />}
          {step === 2 && <Step2Source     state={state} actions={actions} />}
          {step === 3 && <Step3Mapping    state={state} actions={actions} />}
          {step === 4 && <Step4Validate   state={state} actions={actions} />}
          {step === 5 && <Step5Export     state={state} actions={actions} />}

          <div className="qii-actions">
            <button type="button" className="qii-btn" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>
              السابق
            </button>
            <button
              type="button"
              className="qii-btn primary"
              onClick={() => setStep(s => Math.min(5, s + 1))}
              disabled={step === 5 || !ready[step + 1]}
            >
              التالي
            </button>
          </div>
        </main>
      </div>

      <ReconStrip result={result} stats={parsed?.stats} />
    </div>
  );
}

function loadDecisions(storageKey, initial) {
  const base = { ...EMPTY_DECISIONS, ...(initial || {}) };
  if (!storageKey) return base;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch { /* التخزين المحلي قد يكون معطلاً — نتابع بالقيم المبدئية */ }
  return base;
}
