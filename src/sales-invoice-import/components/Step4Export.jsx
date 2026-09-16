import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../language.jsx';
import { norm } from '../engine/text.js';
import ApiSendResultsModal from './ApiSendResultsModal.jsx'; // [إضافة] إرسال مباشر عبر API — راجع تعليق رأس qoyodSalesInvoicePush.js
import StockShortageReviewPanel from './StockShortageReviewPanel.jsx'; // [إضافة] مراجعة فواتير نقص الكمية قبل الإرسال — راجع تعليق رأسه
import MissingEntitiesReviewPanel from './MissingEntitiesReviewPanel.jsx'; // [إضافة] مراجعة الكيانات الناقصة (عملاء/منتجات/مواقع) — راجع تعليق رأسه
import PaymentAccountsReviewPanel from './PaymentAccountsReviewPanel.jsx'; // [إضافة] مراجعة حسابات الدفع لسندات القبض المرتبطة بفواتير — راجع تعليق رأسه
import { buildEntityCreateResultsReportBlob } from '../io/entityCreateResultsReport.js'; // [إضافة] تقرير Excel لنتائج إنشاء الكيانات/تغذية المخزون
import { downloadBlob } from '../../lib/downloadBlob.js';

const isMissingEntitiesPlanEmpty = (plan) => !plan || (!plan.customers.length && !plan.products.length && !plan.locations.length);

// [إضافة] استُخرج قسم "إرسال مباشر عبر API" لمكوّن مستقل لأنه صار يُعرض بمكانين:
// بعد نجاح توليد الملف اليدوي (كخيار إضافي)، أو وحده مباشرة لو لا يوجد قالب
// أصلًا (لا ملف يدوي ممكن بلا قالب — راجع تعليق useEffect بالأسفل). بلا أي
// تغيير على منطق الإرسال نفسه (sendInvoicesViaApi بالهوك يبقى كما هو).
//
// [إضافة] مسارَا مراجعة قبل الإرسال الفعلي، بالترتيب:
//  المرحلة الأولى (اختيارية) — MissingEntitiesReviewPanel: لو فيه عملاء/منتجات/
//  مواقع مذكورة بالملف لكن غير موجودة فعليًا بمنشأة العميل (missingEntitiesPlan،
//  فقط بمسار المرجعيات المجلوبة عبر API)، تظهر أولًا — بعد تأكيدها (وإنشاء ما
//  اختاره المستخدم فعليًا)، rows/issues تُعاد محاكاتها فورًا بالهوك (بما فيها
//  محاكاة المخزون)، فننتقل تلقائيًا للمرحلة الثانية.
//  المرحلة الثانية (اختيارية) — StockShortageReviewPanel: لو بقيت فواتير نقص
//  كمية متوقَّع (بما فيها منتجات أُنشئت للتو بالمرحلة الأولى وتبدأ من صفر مخزون)،
//  تظهر قبل الإرسال الفعلي كما كانت (بلا أي تغيير بمنطقها الأصلي) — بإضافة خيار
//  ثالث اختياري (تغذية المخزون تلقائيًا، راجع تعليق رأس المكوّن نفسه).
//  المرحلة الثالثة (اختيارية) — PaymentAccountsReviewPanel: لو بالملف سندات
//  قبض مرتبطة بفواتير (receiptsPlan، عمود "النوع" — راجع تعليق رأس
//  engine/receipts.js)، تظهر أخيرًا قبل الإرسال الفعلي مباشرة (بعد حل الكيانات
//  الناقصة ونقص المخزون، ما دام كلاهما ينطبق) — لمطابقة كود حساب الدفع بكل سند
//  بحساب حقيقي. تعمل عبر بوابة موحَّدة (proceedToSend/handleTopUpConfirm أدناه)
//  فتظهر بغض النظر عن أي المسارين (تغذية مخزون أو لا) أوصل الإرسال إليها.
function ApiSendSection({ engine, invoiceCount, standalone }) {
  const { t } = useLanguage();
  const {
    apiKey, stockShortageGroups, missingEntitiesPlan, receiptsPlan, apiSendBusy, apiSendResult, apiSendProgress, stopApiSend,
    entityCreateBusy, entityCreateResult, entityCreateEntries, stockTopUpResult, stockTopUpEntries, taxesRef,
  } = engine;
  const [reportBusy, setReportBusy] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(apiKey || '');
  const [sendStatus, setSendStatus] = useState('Draft');
  const [showSendModal, setShowSendModal] = useState(false);
  const [showStockReview, setShowStockReview] = useState(false);
  const [showMissingEntities, setShowMissingEntities] = useState(false);
  const [showPaymentAccounts, setShowPaymentAccounts] = useState(false);
  // [إضافة] يُضبَط true بعد تأكيد لوحة الكيانات الناقصة، ريثما ينتهي الإنشاء
  // الفعلي (entityCreateBusy) وrows/issues تُعاد محاكاتها بالهوك — عندها فقط
  // نقرأ stockShortageGroups (الطازجة، لا القديمة قبل الإنشاء) لتقرير الخطوة التالية.
  const [pendingAfterEntities, setPendingAfterEntities] = useState(false);
  // [إضافة، إصلاح خطأ حقيقي] كان الانتقال بعد لوحة الكيانات الناقصة يفحص
  // stockShortageGroups فقط ثم يرسل الفواتير مباشرة — لو فشل إنشاء منتج/عميل واحد
  // أو أكثر فعليًا (مثلًا 422 من قيود)، rows/issues بعد إعادة المحاكاة تبقى تحمل
  // نفس أخطاء missing_product/missing_customer لتلك العناصر تحديدًا (لم تُحَل)،
  // لكن checkStockSequential لا يُصدر code:'stock_shortage_draft' لمنتج غير موجود
  // أصلًا بالفهرس (فرع مختلف تمامًا: "لا تتوفر بيانات كمية")، فـstockShortageGroups
  // كانت تخرج فارغة والتدفق يكمل مباشرة لإرسال فواتير مصيرها الفشل الحتمي (لا معرّف
  // منتج حقيقي) — بلا أي تنبيه للمستخدم بأن الإنشاء فشل أصلًا. الآن نعيد فحص
  // missingEntitiesPlan هنا أيضًا (لا فقط بـhandleSendClick) قبل المتابعة.
  const [showEntityFailureWarning, setShowEntityFailureWarning] = useState(false);

  const hasReceipts = !!(receiptsPlan && receiptsPlan.length);
  // [إضافة] الإجراء "الحقيقي" (إرسال مباشر، أو تغذية مخزون ثم إرسال) المؤجَّل
  // ريثما تُؤكَّد لوحة مراجعة حسابات الدفع — يُخزَّن بـref لا state (استدعاء
  // مباشر بـreceiptsByRef الجاهز فور التأكيد، بلا إعادة رسم وسيطة).
  const pendingSendActionRef = useRef(null);

  const doSend = (sendOpts, receiptsByRef) => {
    setShowSendModal(true);
    engine.sendInvoicesViaApi(apiKeyInput.trim(), { status: sendStatus, ...sendOpts, receiptsByRef });
  };

  // [إضافة] بوابة موحَّدة لكل مسارات "إرسال الآن" (بلا تغذية مخزون) — تعرض لوحة
  // مراجعة حسابات الدفع أولًا لو بالملف سندات قبض (hasReceipts)، وإلا ترسل
  // مباشرة كما كان تمامًا قبل هذي الميزة.
  const proceedToSend = (sendOpts = {}) => {
    if (hasReceipts) {
      pendingSendActionRef.current = (receiptsByRef) => doSend(sendOpts, receiptsByRef);
      setShowPaymentAccounts(true);
    } else {
      doSend(sendOpts, undefined);
    }
  };

  const proceedAfterMissingEntities = () => {
    if (!isMissingEntitiesPlanEmpty(missingEntitiesPlan)) {
      setShowEntityFailureWarning(true);
      return;
    }
    if (stockShortageGroups && stockShortageGroups.length > 0) {
      setShowStockReview(true);
    } else {
      proceedToSend();
    }
  };

  useEffect(() => {
    if (!pendingAfterEntities || entityCreateBusy) return;
    setPendingAfterEntities(false);
    proceedAfterMissingEntities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAfterEntities, entityCreateBusy, stockShortageGroups]);

  const handleSendClick = () => {
    if (!isMissingEntitiesPlanEmpty(missingEntitiesPlan)) {
      setShowMissingEntities(true);
    } else if (stockShortageGroups && stockShortageGroups.length > 0) {
      setShowStockReview(true);
    } else {
      proceedToSend();
    }
  };

  const handleMissingEntitiesConfirm = (selections) => {
    setShowMissingEntities(false);
    setPendingAfterEntities(true);
    engine.resolveMissingEntities(apiKeyInput.trim(), selections);
  };

  const handleStockReviewConfirm = (decision) => {
    setShowStockReview(false);
    proceedToSend(decision);
  };

  // [إضافة] تنبيه صريح لو فشلت تغذية مخزون واحدة أو أكثر فعليًا — راجع تعليق
  // topUpStockAndFinish بالهوك: لا يُكمَل للإرسال تلقائيًا بعد الآن عند أي فشل
  // (بلاغ اختبار حي: فواتير أُنشئت Draft بصمت رغم "تأكيد التغذية"، لأن التغذية
  // نفسها فشلت بلا أي تنبيه).
  const [showTopUpFailureWarning, setShowTopUpFailureWarning] = useState(false);

  const doTopUpThenSend = async (adjustments, sendOpts, receiptsByRef) => {
    const result = await engine.topUpStockAndFinish(apiKeyInput.trim(), adjustments, { ...sendOpts, receiptsByRef });
    if (result && result.failed > 0) setShowTopUpFailureWarning(true);
    else setShowSendModal(true);
  };

  // [إضافة] المسار الثالث بلوحة نقص المخزون: تغذية المخزون تلقائيًا عبر
  // POST /inventory_adjustments (كمية النقص الفعلية بالضبط، مُجمَّعة حسب الموقع
  // لتقليل عدد الطلبات)، ثم إرسال كل الفواتير بالحالة المطلوبة أصلًا (لا Draft قسرًا)
  // — فقط لو نجحت التغذية بالكامل (راجع topUpStockAndFinish بالهوك). نفس بوابة
  // مراجعة حسابات الدفع (hasReceipts) تُطبَّق هنا أيضًا قبل التنفيذ الفعلي.
  const handleTopUpConfirm = async ({ revenueAccountId, expenseAccountId }) => {
    setShowStockReview(false);
    const needs = engine.getStockTopUpPlan();
    const byInventory = new Map();
    needs.forEach((n) => {
      const product = engine.productsRef.bySku ? engine.productsRef.bySku.get(n.sku) : null;
      const inventoryId = engine.locationIdByName ? engine.locationIdByName.get(n.loc) : undefined;
      if (!product || product.id == null || inventoryId === undefined) return;
      if (!byInventory.has(inventoryId)) byInventory.set(inventoryId, { inventoryId, revenueAccountId, expenseAccountId, ref: n.loc, lineItems: [] });
      byInventory.get(inventoryId).lineItems.push({ productId: product.id, quantity: n.shortfall, rate: n.rate });
    });
    const adjustments = Array.from(byInventory.values());
    if (hasReceipts) {
      pendingSendActionRef.current = (receiptsByRef) => doTopUpThenSend(adjustments, { status: sendStatus }, receiptsByRef);
      setShowPaymentAccounts(true);
    } else {
      await doTopUpThenSend(adjustments, { status: sendStatus }, undefined);
    }
  };

  const handlePaymentAccountsConfirm = (receiptsByRef) => {
    setShowPaymentAccounts(false);
    const action = pendingSendActionRef.current;
    pendingSendActionRef.current = null;
    if (action) action(receiptsByRef);
  };

  // [إضافة] تقرير Excel لنتائج إنشاء الكيانات الناقصة و/أو تغذية المخزون —
  // يجمع entries المرحلتين معًا (الأولى بلا kind ثابت لكل نوع، الثانية كلها
  // "تعديل مخزون") بملف واحد — راجع تعليق رأس entityCreateResultsReport.js.
  const downloadEntityReport = async () => {
    setReportBusy(true);
    try {
      const blob = await buildEntityCreateResultsReportBlob([...entityCreateEntries, ...stockTopUpEntries], t);
      downloadBlob(blob, t({ ar: 'تقرير-إنشاء-الكيانات-الناقصة.xlsx', en: 'missing-entities-creation-report.xlsx' }));
    } finally {
      setReportBusy(false);
    }
  };

  const hasEntityCreateReport = (entityCreateResult && !entityCreateResult.fatalError) || (stockTopUpResult && !stockTopUpResult.fatalError);

  return (
    <div style={standalone ? undefined : { marginTop: 26, paddingTop: 20, borderTop: '1px dashed var(--qsv-border)', textAlign: 'right' }}>
      <h3 style={{ marginTop: 0 }}>🔌 {standalone
        ? t({ ar: 'أرسل الفواتير مباشرة عبر API', en: 'Send the invoices directly via API' })
        : t({ ar: 'أو أرسل الفواتير مباشرة عبر API', en: 'Or send the invoices directly via API' })}</h3>
      <p className="qsv-hint">
        {t({
          ar: `سيتم إنشاء ${invoiceCount} فاتورة مباشرة بمنشأة العميل الحقيقية بقيود. طريقة الدفع (عمود H) لا تُرسَل (غير مدعومة بإنشاء الفاتورة عبر API). الفواتير مستقلة عن بعضها — فشل فاتورة واحدة لا يوقف إرسال الباقي.`,
          en: `${invoiceCount} invoice(s) will be created directly on the client's real Qoyod company. Payment method (column H) is not sent (unsupported by invoice creation via API). Invoices are independent — one failing does not stop the rest.`,
        })}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="password"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder="API-KEY"
          style={{ flex: '1 1 220px', minWidth: 200 }}
        />
        <select value={sendStatus} onChange={(e) => setSendStatus(e.target.value)} style={{ width: 140 }}>
          <option value="Draft">{t({ ar: 'مسودة (Draft)', en: 'Draft' })}</option>
          <option value="Approved">{t({ ar: 'معتمدة (Approved)', en: 'Approved' })}</option>
        </select>
        <button
          type="button"
          className="qsv-btn"
          disabled={!apiKeyInput.trim()}
          onClick={handleSendClick}
        >
          📤 {t({ ar: 'إرسال عبر API', en: 'Send via API' })}
        </button>
      </div>
      {showMissingEntities && (
        <MissingEntitiesReviewPanel
          plan={missingEntitiesPlan}
          apiKey={apiKeyInput.trim()}
          taxesIndex={taxesRef}
          onCancel={() => setShowMissingEntities(false)}
          onConfirm={handleMissingEntitiesConfirm}
        />
      )}
      {showPaymentAccounts && (
        <PaymentAccountsReviewPanel
          receiptsPlan={receiptsPlan}
          apiKey={apiKeyInput.trim()}
          onCancel={() => { setShowPaymentAccounts(false); pendingSendActionRef.current = null; }}
          onConfirm={handlePaymentAccountsConfirm}
        />
      )}
      {showEntityFailureWarning && (
        <div className="qsv-modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowEntityFailureWarning(false)}>
          <div className="qsv-modal" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ {t({ ar: 'بعض الكيانات لم يُنشأ فعليًا', en: 'Some entities were not actually created' })}</h3>
            <p className="qsv-hint">
              {t({
                ar: 'فشل إنشاء عميل/منتج/موقع واحد أو أكثر بمنشأة العميل الحقيقية — الفواتير المعتمِدة عليها ستفشل عند الإرسال. راجع سبب الفشل بالتقرير، ثم افتح لوحة الكيانات الناقصة مرة أخرى (ستعرض فقط ما تبقّى غير محلول).',
                en: 'One or more customers/products/locations failed to actually get created on the client\'s real company — invoices depending on them will fail on send. Check the reason in the report, then reopen the missing-entities panel (it will show only what is still unresolved).',
              })}
            </p>
            <div className="qsv-modal-actions" style={{ marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="qsv-btn ghost" onClick={() => setShowEntityFailureWarning(false)}>{t({ ar: 'إغلاق', en: 'Close' })}</button>
              {hasEntityCreateReport && (
                <button type="button" className="qsv-btn secondary" disabled={reportBusy} onClick={downloadEntityReport}>
                  🧩 {t({ ar: 'تحميل تقرير الإنشاء', en: 'Download creation report' })}
                </button>
              )}
              <button type="button" className="qsv-btn" onClick={() => { setShowEntityFailureWarning(false); setShowMissingEntities(true); }}>
                {t({ ar: 'مراجعة الكيانات الناقصة مرة أخرى', en: 'Review missing entities again' })}
              </button>
            </div>
          </div>
        </div>
      )}
      {showTopUpFailureWarning && (
        <div className="qsv-modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowTopUpFailureWarning(false)}>
          <div className="qsv-modal" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ {t({ ar: 'فشلت تغذية المخزون — لم تُرسَل الفواتير', en: 'Stock top-up failed — invoices were not sent' })}</h3>
            <p className="qsv-hint">
              {t({
                ar: 'تعذّر إنشاء تعديل مخزون واحد أو أكثر (POST /inventory_adjustments) بمنشأة العميل الحقيقية — لو أُرسلت الفواتير رغم ذلك لكانت أُنشئت كمسودة صامتة (المخزون الحقيقي لم يزد فعليًا). لم يُرسَل شيء بعد. راجع سبب الفشل بالتقرير، ثم أعد المحاولة من لوحة مراجعة نقص المخزون.',
                en: 'One or more inventory adjustments (POST /inventory_adjustments) failed to be created on the client\'s real company — had the invoices been sent anyway, they would have been created as silent drafts (real stock never actually increased). Nothing has been sent yet. Check the reason in the report, then retry from the stock shortage review panel.',
              })}
            </p>
            <div className="qsv-modal-actions" style={{ marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="qsv-btn ghost" onClick={() => setShowTopUpFailureWarning(false)}>{t({ ar: 'إغلاق', en: 'Close' })}</button>
              {hasEntityCreateReport && (
                <button type="button" className="qsv-btn secondary" disabled={reportBusy} onClick={downloadEntityReport}>
                  🧩 {t({ ar: 'تحميل تقرير التغذية', en: 'Download top-up report' })}
                </button>
              )}
              <button type="button" className="qsv-btn" onClick={() => { setShowTopUpFailureWarning(false); setShowStockReview(true); }}>
                {t({ ar: 'إعادة محاولة تغذية المخزون', en: 'Retry stock top-up' })}
              </button>
            </div>
          </div>
        </div>
      )}
      {showStockReview && (
        <StockShortageReviewPanel
          groups={stockShortageGroups}
          apiKey={apiKeyInput.trim()}
          onCancel={() => setShowStockReview(false)}
          onConfirm={handleStockReviewConfirm}
          onTopUpConfirm={handleTopUpConfirm}
        />
      )}
      {showSendModal && <ApiSendResultsModal engine={engine} onClose={() => setShowSendModal(false)} />}
      {/* [إضافة 2026-09-14] راجع نفس الإصلاح بـMergeTool.jsx/JournalTool.jsx —
          أيقونة عائمة تُتيح الرجوع للنافذة (أو مراقبة التقدّم) بعد تصغيرها. */}
      {!showSendModal && (apiSendBusy || apiSendResult) && (
        <div className="qsv-btn" style={{ position: 'fixed', bottom: 20, insetInlineStart: 20, zIndex: 1001, borderRadius: 999, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 12px 32px rgba(15,23,42,.25)' }}>
          <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowSendModal(true)}>
            📤 {apiSendBusy
              ? t({ ar: `جارٍ الإرسال: ${apiSendProgress.current}/${apiSendProgress.total}`, en: `Sending: ${apiSendProgress.current}/${apiSendProgress.total}` })
              : t({ ar: 'نتائج الإرسال', en: 'Send results' })}
            {!apiSendBusy && apiSendResult?.failed > 0 && (
              <span style={{ background: 'var(--qsv-err)', color: '#fff', borderRadius: 999, minWidth: 18, height: 18, fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{apiSendResult.failed}</span>
            )}
          </span>
          {apiSendBusy && (
            <button type="button" onClick={stopApiSend} title={t({ ar: 'إيقاف الإرسال', en: 'Stop sending' })} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.85 }}>✕</button>
          )}
        </div>
      )}
      {!entityCreateBusy && hasEntityCreateReport && (
        <div className="qsv-btn secondary" style={{ position: 'fixed', bottom: (!showSendModal && (apiSendBusy || apiSendResult)) ? 68 : 20, insetInlineStart: 20, zIndex: 1001, borderRadius: 999, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ cursor: 'pointer' }} onClick={reportBusy ? undefined : downloadEntityReport}>
            🧩 {reportBusy
              ? t({ ar: 'جارٍ التجهيز...', en: 'Preparing...' })
              : t({ ar: 'تحميل تقرير إنشاء الكيانات/تغذية المخزون', en: 'Download entity creation/stock top-up report' })}
          </span>
        </div>
      )}
    </div>
  );
}

// نسخ لتصميم renderFinalStep/downloadRowsAsXlsx الأصليين — عند الدخول للخطوة بلا أي خطأ حاجب
// يُولَّد الملف الكامل تلقائيًا فورًا (كما كان يحدث في الأصل عبر goStep(4) مباشرة)، وإلا تُعرض
// رسالة الأخطاء المتبقية مع خيار تحميل الفواتير الصحيحة فقط.
export default function Step4Export({ engine }) {
  const { t } = useLanguage();
  const { rows, issues, stats, validOnlyRows, exportBusy, exportResult, exportError, exportFinal, goToStep, template } = engine;
  const errCount = issues.list.filter((i) => i.sev === 'err').length;
  // [إضافة] "خطأ حاجب صلب" — يستبعد missing_customer/missing_product (قابلة
  // للإنشاء التلقائي بالخطوة نفسها) — راجع تعليق stats.hardErr بالهوك. تُستخدَم
  // فقط لبوابة شاشة الحجب أدناه؛ useEffect التوليد التلقائي للملف اليدوي بالأسفل
  // يبقى على errCount الخام كما هو تمامًا (لا يُخفَّف — لا يمكن توليد ملف يدوي
  // يحوي مراجع/مطابقات لكيانات لم تُنشأ فعليًا بعد).
  const hardErrCount = stats.hardErr;
  const autoTriggered = useRef(false);
  const invoiceCount = new Set(rows.map((r) => norm(r.A))).size;

  // [إضافة] توليد الملف اليدوي (exportFinal) يحتاج قالب قيود فعليًا مرفوعًا —
  // generateFinalXlsx يتلاعب ببنية XML الحقيقية لملف القالب نفسه (zip/sheet2Xml)،
  // فبلا قالب لا يوجد ما يُبنى عليه إطلاقًا. لو المستخدم تابع بلا قالب (المرجعيات
  // مجلوبة عبر API — راجع readyForStep2 بالهوك)، لا نحاول توليد ملف يدوي هنا
  // إطلاقًا؛ الإرسال المباشر عبر API فقط هو المسار المتاح.
  useEffect(() => {
    if (errCount === 0 && template.loaded && !autoTriggered.current && !exportResult && !exportBusy) {
      autoTriggered.current = true;
      exportFinal('all');
    }
  }, [errCount, template.loaded, exportResult, exportBusy, exportFinal]);

  if (hardErrCount > 0) {
    const validInvoiceCount = new Set(validOnlyRows.map((r) => norm(r.A))).size;
    return (
      <div className="qsv-panel">
        <div className="qsv-final-box">
          <div className="qsv-big-icon">🚫</div>
          <h3>{t({ ar: `لا يزال هناك ${hardErrCount} خطأ حاجب`, en: `There ${hardErrCount === 1 ? 'is' : 'are'} still ${hardErrCount} blocking error(s)` })}</h3>
          <p className="qsv-hint">{t({ ar: 'رجاءً ارجع لخطوة التحقق وصحّح كل الأخطاء الحاجبة أولاً قبل توليد الملف كاملًا.', en: 'Please go back to the validation step and fix all blocking errors first before generating the full file.' })}</p>
          <button type="button" className="qsv-btn secondary" onClick={() => goToStep(3)}>→ {t({ ar: 'رجوع للتحقق', en: 'Back to validation' })}</button>
          {validInvoiceCount > 0 && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px dashed var(--qsv-border)' }}>
              <p className="qsv-hint">{t({ ar: 'بدلًا من ذلك، يمكنك تحميل الفواتير', en: 'Instead, you can download' })} <b>{t({ ar: 'السليمة فقط', en: 'only the valid' })}</b> {t({ ar: `(${validInvoiceCount} فاتورة) وترك بقية الفواتير للتصحيح لاحقًا:`, en: `invoices (${validInvoiceCount}) and leave the rest for correction later:` })}</p>
              <button type="button" className="qsv-btn" onClick={() => exportFinal('validOnly')}>⬇️ {t({ ar: `تحميل الفواتير الصحيحة فقط (${validInvoiceCount})`, en: `Download valid invoices only (${validInvoiceCount})` })}</button>
              {exportResult && (
                <p><a className="qsv-btn" href={exportResult.url} download={exportResult.filename}>⬇️ {t({ ar: `تحميل الملف (${exportResult.filename})`, en: `Download the file (${exportResult.filename})` })}</a></p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // [إضافة] بلا قالب (المرجعيات مجلوبة عبر API فقط)، لا ملف يدوي يُبنى إطلاقًا —
  // الإرسال المباشر عبر API هو المسار الوحيد المتاح، فنعرضه مباشرة بلا انتظار
  // exportFinal (الذي لن يُستدعى أصلًا هنا — راجع useEffect أعلاه).
  if (!template.loaded) {
    return (
      <div className="qsv-panel">
        <div className="qsv-final-box">
          <div className="qsv-big-icon">🔌</div>
          <h3>{t({ ar: 'لا يوجد قالب قيود مرفوع — الإرسال المباشر عبر API فقط', en: 'No Qoyod template uploaded — direct API send only' })}</h3>
          <p className="qsv-hint">{t({ ar: 'بما إنك جلبت المرجعيات عبر API بلا رفع قالب، تنزيل الملف اليدوي غير متاح (يحتاج قالبًا حقيقيًا مرفوعًا). أرسل الفواتير مباشرة بالأسفل.', en: "Since you fetched the references via API without uploading a template, the manual file download isn't available (it needs a real uploaded template). Send the invoices directly below." })}</p>
          <ApiSendSection engine={engine} invoiceCount={invoiceCount} standalone />
          <button type="button" className="qsv-btn ghost" style={{ marginTop: 18 }} onClick={() => goToStep(3)}>→ {t({ ar: 'رجوع للتحقق مرة أخرى', en: 'Back to validation again' })}</button>
        </div>
      </div>
    );
  }

  // [إضافة] قالب مرفوع لكن بقيت مراجع عميل/منتج ناقصة قابلة للإنشاء تلقائيًا
  // (hardErrCount===0 لكن errCount>0) — الملف اليدوي لا يُولَّد تلقائيًا (useEffect
  // أعلاه يبقى على errCount الخام)، لكن الإرسال المباشر عبر API يبقى متاحًا فورًا
  // (لوحة مراجعة الكيانات الناقصة تُنشئها أولًا، ثم يكمل الإرسال).
  const manualFileBlockedByMissingEntities = errCount > 0 && hardErrCount === 0 && !exportResult && !exportBusy;

  return (
    <div className="qsv-panel">
      <div className="qsv-final-box">
        {exportBusy && (<><div className="qsv-big-icon">⏳</div><p>{t({ ar: 'جارٍ توليد الملف...', en: 'Generating the file...' })}</p></>)}
        {!exportBusy && exportError && (<><div className="qsv-big-icon">❌</div><p>{t({ ar: `حدث خطأ أثناء توليد الملف: ${exportError}`, en: `An error occurred while generating the file: ${exportError}` })}</p></>)}
        {!exportBusy && !exportError && exportResult && (
          <>
            <div className="qsv-big-icon">✅</div>
            <h3>{t({ ar: 'الملف جاهز تمامًا للرفع إلى قيود', en: 'The file is fully ready to upload to Qoyod' })}</h3>
            <p className="qsv-kv">{t({ ar: `عدد الفواتير: ${new Set(rows.map((r) => norm(r.A))).size} — عدد الأسطر: ${rows.length}`, en: `Invoice count: ${new Set(rows.map((r) => norm(r.A))).size} — Row count: ${rows.length}` })}</p>
            <p><a className="qsv-btn" href={exportResult.url} download={exportResult.filename}>⬇️ {t({ ar: `تحميل الملف (${exportResult.filename})`, en: `Download the file (${exportResult.filename})` })}</a></p>
            <p className="qsv-hint">{t({ ar: 'افتح المبيعات ‹ فواتير المبيعات ‹ استيراد الفواتير في قيود، واختر هذا الملف مباشرة، ثم اضغط "استيراد الفواتير".', en: 'Open Sales ‹ Sales Invoices ‹ Import Invoices in Qoyod, choose this file directly, then click "Import Invoices".' })}</p>

            {/* [إضافة] خيار إرسال مباشر عبر API — بديل إضافي لتنزيل الملف أعلاه، لا يستبدله */}
            <ApiSendSection engine={engine} invoiceCount={invoiceCount} />
          </>
        )}
        {manualFileBlockedByMissingEntities && (
          <>
            <div className="qsv-big-icon">🧩</div>
            <h3>{t({ ar: 'بقيت مراجع عملاء/منتجات غير موجودة — قابلة للإنشاء تلقائيًا', en: 'Some customer/product references are still missing — auto-creatable' })}</h3>
            <p className="qsv-hint">
              {t({
                ar: 'لا يمكن توليد ملف الرفع اليدوي حاليًا (سيحتوي مراجع لكيانات غير موجودة فعليًا بقيود). أرسل الفواتير مباشرة عبر API بالأسفل — سيُعرض عليك أولًا إنشاء الكيانات الناقصة، ثم يكمل الإرسال تلقائيًا.',
                en: "The manual upload file can't be generated right now (it would reference entities that don't exist in Qoyod yet). Send the invoices directly via API below — you'll first be offered to create the missing entities, then sending continues automatically.",
              })}
            </p>
            <ApiSendSection engine={engine} invoiceCount={invoiceCount} standalone />
          </>
        )}
        {(exportResult || manualFileBlockedByMissingEntities) && (
          <button type="button" className="qsv-btn ghost" style={{ marginTop: 18 }} onClick={() => goToStep(3)}>→ {t({ ar: 'رجوع للتحقق مرة أخرى', en: 'Back to validation again' })}</button>
        )}
      </div>
    </div>
  );
}
