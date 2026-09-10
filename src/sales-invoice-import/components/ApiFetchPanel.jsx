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
 */
export default function ApiFetchPanel({ engine }) {
  const { t } = useLanguage();
  const { apiKey, apiFetchBusy, apiFetchError, apiFetchSummary, fetchReferencesFromApi } = engine;
  const [keyInput, setKeyInput] = useState(apiKey || '');
  const [visible, setVisible] = useState(false);

  return (
    <div className="qsv-panel" style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 15 }}>🔌 {t({ ar: 'جلب المنتجات والمخزون والعملاء تلقائيًا عبر API', en: 'Auto-fetch products, stock and customers via API' })}</h2>
      <p className="qsv-hint">
        {t({
          ar: 'اختياري — لو متوفر مفتاح API لمنشأة العميل، يمكن جلب بطاقات "تقرير المنتجات" و"تقرير مواقع المنتجات" و"ملف العملاء" الثلاث تلقائيًا بدل رفعها يدويًا. بطاقة "قالب قيود" تبقى رفعًا يدويًا دائمًا (لا بديل لها عبر API). لو ما فيه مفتاح، تجاهل هذي اللوحة وارفع الملفات كالمعتاد بالأسفل.',
          en: 'Optional — if the client\'s API key is available, the "Products report", "Product locations report" and "Customers file" cards can be fetched automatically instead of uploaded manually. The "Qoyod template" card always stays a manual upload (no API alternative for it). If you don\'t have a key, ignore this panel and upload files as usual below.',
        })}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        <input
          type={visible ? 'text' : 'password'}
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="API-KEY"
          style={{ flex: '1 1 260px', minWidth: 220 }}
          disabled={apiFetchBusy}
        />
        <button type="button" className="qsv-btn secondary" onClick={() => setVisible((v) => !v)}>
          {visible ? t({ ar: 'إخفاء', en: 'Hide' }) : t({ ar: 'عرض', en: 'Show' })}
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
