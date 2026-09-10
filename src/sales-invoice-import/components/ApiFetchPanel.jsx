import React, { useState } from 'react';
import { useLanguage } from '../../language.jsx';

/**
 * [إضافة] لوحة "جلب البيانات المرجعية عبر API" — بديل اختياري لبطاقات الرفع
 * اليدوي الثلاث (المنتجات/المخزون/العملاء) في Step1References.jsx فقط. بطاقة
 * القالب (الرابعة) تبقى رفعًا يدويًا دومًا مهما تم إدخال مفتاح API هنا — راجع
 * تعليق رأس api/qoyodSalesRefFetch.js للسبب الكامل (لا endpoint لقائمة الفئات
 * الضريبية، وشكل القالب نفسه يختلف حسب إعدادات كل منشأة).
 *
 * لا تُعدِّل أي حالة غير apiKey/productsRef/stockRef/customersRef عبر
 * engine.fetchReferencesFromApi — إضافة بحتة، الرفع اليدوي يبقى يعمل بلا أي
 * تغيير سواء استُخدمت هذه اللوحة أو لا.
 *
 * [إضافة] حفظ اسم العميل + مفتاحه محليًا: زر "حفظ" مستقل تمامًا عن زر "جلب البيانات
 * الآن" — الحفظ لا يُطلق أي جلب تلقائي بنفسه (بخلاف نمط MergeTool)، فقط يخزّن
 * المفتاح باسم العميل بحيث يمكن اختياره لاحقًا من رقائق الأسماء ثم الضغط يدويًا على
 * "جلب البيانات الآن" — بالضبط تسلسل الخطوات الذي طلبه المستخدم.
 */
export default function ApiFetchPanel({ engine }) {
  const { t } = useLanguage();
  const {
    apiKey, apiFetchBusy, apiFetchError, apiFetchSummary, fetchReferencesFromApi,
    customerName, setCustomerName, savedKeys, saveApiKeyForCustomer, loadSavedApiKey, removeSavedApiKey,
  } = engine;
  const [keyInput, setKeyInput] = useState(apiKey || '');
  const [visible, setVisible] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const handleSave = () => {
    const { ok } = saveApiKeyForCustomer(keyInput, customerName);
    setSaveMsg(ok
      ? t({ ar: 'تم الحفظ ✓ — اضغط "جلب البيانات الآن" عند الرغبة.', en: 'Saved ✓ — click "Fetch now" whenever you\'re ready.' })
      : t({ ar: 'أدخل مفتاح API واسم العميل أولاً.', en: 'Enter the API key and customer name first.' }));
    if (ok) setTimeout(() => setSaveMsg(''), 4000);
  };

  const handleChipClick = (name) => {
    const key = loadSavedApiKey(name);
    if (key) setKeyInput(key);
  };

  const savedNames = Object.keys(savedKeys || {});

  return (
    <div className="qsv-panel" style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 15 }}>🔌 {t({ ar: 'جلب المنتجات والمخزون والعملاء تلقائيًا عبر API', en: 'Auto-fetch products, stock and customers via API' })}</h2>
      <p className="qsv-hint">
        {t({
          ar: 'اختياري — لو متوفر مفتاح API لمنشأة العميل، يمكن جلب بطاقات "تقرير المنتجات" و"تقرير مواقع المنتجات" و"ملف العملاء" الثلاث تلقائيًا بدل رفعها يدويًا. بطاقة "قالب قيود" تبقى رفعًا يدويًا دائمًا (لا بديل لها عبر API). لو ما فيه مفتاح، تجاهل هذي اللوحة وارفع الملفات كالمعتاد بالأسفل.',
          en: 'Optional — if the client\'s API key is available, the "Products report", "Product locations report" and "Customers file" cards can be fetched automatically instead of uploaded manually. The "Qoyod template" card always stays a manual upload (no API alternative for it). If you don\'t have a key, ignore this panel and upload files as usual below.',
        })}
      </p>

      <div className="qsv-api-row">
        <div className="qsv-api-field">
          <label>{t({ ar: 'مفتاح API', en: 'API key' })}</label>
          <input
            type={visible ? 'text' : 'password'}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="API-KEY"
            disabled={apiFetchBusy}
          />
        </div>
        <button type="button" className="qsv-btn ghost" onClick={() => setVisible((v) => !v)}>
          {visible ? t({ ar: 'إخفاء', en: 'Hide' }) : t({ ar: 'عرض', en: 'Show' })}
        </button>
        <div className="qsv-api-field" style={{ flex: '1 1 160px' }}>
          <label>{t({ ar: 'اسم العميل (للحفظ)', en: 'Customer name (to save)' })}</label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder={t({ ar: 'اسم العميل', en: 'Customer name' })}
          />
        </div>
        <button type="button" className="qsv-btn secondary" onClick={handleSave} disabled={apiFetchBusy}>
          💾 {t({ ar: 'حفظ', en: 'Save' })}
        </button>
        <button
          type="button"
          className="qsv-btn"
          disabled={apiFetchBusy || !keyInput.trim()}
          onClick={() => fetchReferencesFromApi(keyInput.trim())}
        >
          {apiFetchBusy ? t({ ar: 'جارٍ الجلب...', en: 'Fetching...' }) : t({ ar: 'جلب البيانات الآن', en: 'Fetch now' })}
        </button>
      </div>

      {saveMsg && <div className="qsv-status-line" style={{ color: 'var(--qsv-muted)' }}>{saveMsg}</div>}

      {savedNames.length > 0 && (
        <div className="qsv-api-chips">
          {savedNames.map((name) => (
            <div key={name} className={`qsv-api-chip${savedKeys[name] === keyInput.trim() ? ' active' : ''}`}>
              <span className="qsv-chip-name" onClick={() => handleChipClick(name)}>{name}</span>
              <span className="qsv-chip-remove" onClick={() => removeSavedApiKey(name)} title={t({ ar: 'حذف', en: 'Remove' })}>×</span>
            </div>
          ))}
        </div>
      )}

      {apiFetchError && <div className="qsv-note-box err" style={{ marginTop: 12 }}>⛔ {apiFetchError}</div>}
      {!apiFetchBusy && !apiFetchError && apiFetchSummary && (
        <div className="qsv-note-box" style={{ marginTop: 12 }}>
          ✅ {t({
            ar: `تم الجلب بنجاح — ${apiFetchSummary.products} منتج، ${apiFetchSummary.customers} عميل. البطاقات الثلاث بالأسفل صارت جاهزة تلقائيًا.`,
            en: `Fetched successfully — ${apiFetchSummary.products} product(s), ${apiFetchSummary.customers} customer(s). The three cards below are now populated automatically.`,
          })}
        </div>
      )}
    </div>
  );
}
