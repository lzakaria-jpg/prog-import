import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useLanguage } from '../language.jsx';
import useSalesInvoiceImportEngine from './useSalesInvoiceImportEngine.js';
import StepNav from './components/StepNav.jsx';
import RefDatalists from './components/RefDatalists.jsx';
import Step1References from './components/Step1References.jsx';
import Step2Entry from './components/Step2Entry.jsx';
import Step3Validate from './components/Step3Validate.jsx';
import Step4Export from './components/Step4Export.jsx';
import './styles/qoyod-sales-import.css';

/**
 * أداة استيراد وتحليل فواتير المبيعات — المكوّن الرئيسي.
 *
 * مستقل تمامًا: بلا Context أو i18n أو أي اعتماد خارج حدود هذا المجلد (نفس قاعدة bill-import
 * وأداة استيراد الفواتير القديمة) — الاندماج بالموقع يتم فقط عبر تسجيل هذا المكوّن كأداة خامسة
 * طبيعية في App.jsx (NAV_ITEMS + شرط can() + Watermark)، بلا أي تغيير على منطقه الداخلي.
 *
 * @param {object}  props
 * @param {boolean} props.showHeader إظهار الشريط العلوي الداخلي؛ مرّر false عند الدمج داخل
 *                                   تطبيق له شريطه الخاص (هذا ما يستخدمه App.jsx فعليًا).
 */
export default function InvoiceImportTool({ showHeader = true } = {}) {
  const { t, dir } = useLanguage();
  const engine = useSalesInvoiceImportEngine();

  return (
    <div className="qsv-app" dir={dir}>
      {showHeader && (
        // [إعادة تصميم] رأس بنفس تكوين رأس أداتي الشجرة والقيود (أيقونة كحلية + عنوان/عنوان فرعي)
        // بدل الشريط المتدرّج السابق، مع زر "إعادة تعيين" الجديد — بلا أي تأثير على منطق الأداة.
        <header className="qsv-header">
          <div className="qsv-header-left">
            <div className="qsv-header-icon" aria-hidden="true">🧾</div>
            <div className="qsv-header-title">
              <h1>{t({ ar: 'أداة تجهيز والتحقق من ملف استيراد فواتير المبيعات', en: 'Sales Invoice Import File Preparation & Validation Tool' })}</h1>
              <p>{t({ ar: 'تعمل بالكامل داخل متصفحك — بياناتك لا تُرسَل لأي خادم خارجي.', en: "Runs entirely inside your browser — your data is never sent to any external server." })}</p>
            </div>
          </div>
          <button
            type="button"
            className="qsv-reset-btn"
            onClick={() => { if (window.confirm(t({ ar: 'سيتم مسح كل البيانات المدخلة والملفات المرفوعة بهذه الجلسة والبدء من جديد. متابعة؟', en: 'This clears all data entered and files uploaded this session and starts over. Continue?' }))) engine.resetAll(); }}
            title={t({ ar: 'إعادة التعيين والبدء من الصفر', en: 'Reset and start over' })}
          >
            <RefreshCw size={14} /> {t({ ar: 'إعادة تعيين', en: 'Reset' })}
          </button>
        </header>
      )}

      <RefDatalists customersRef={engine.customersRef} productsRef={engine.productsRef} />

      <div className="qsv-wrap">
        <StepNav step={engine.step} templateLoaded={engine.template.loaded} onGoStep={engine.goToStep} />

        {engine.step === 1 && <Step1References engine={engine} />}
        {engine.step === 2 && <Step2Entry engine={engine} />}
        {engine.step === 3 && <Step3Validate engine={engine} />}
        {engine.step === 4 && <Step4Export engine={engine} />}
      </div>
    </div>
  );
}
