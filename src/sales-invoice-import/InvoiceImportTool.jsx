import React from 'react';
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
  const engine = useSalesInvoiceImportEngine();

  return (
    <div className="qsv-app" dir="rtl">
      {showHeader && (
        <header className="qsv-topbar">
          <h1>🧾 أداة تجهيز والتحقق من ملف استيراد فواتير المبيعات</h1>
          <p>تعمل بالكامل داخل متصفحك — بياناتك لا تُرسَل لأي خادم خارجي.</p>
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
