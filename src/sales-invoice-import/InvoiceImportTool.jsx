import React, { forwardRef, useEffect, useImperativeHandle } from 'react';
import { RefreshCw } from 'lucide-react';
import { useLanguage } from '../language.jsx';
import ToolIcon from '../lib/ToolIcon.jsx';
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
 *
 * [إضافة 2026-09-14] forwardRef + onNameChange/onBusyChange — دعم "التبويبات
 * المتعددة داخل الأداة" (TabbedTool.jsx)، نفس نمط باقي الأدوات — إضافتان
 * اختياريتان بحتتان بلا قيمة افتراضية تُغيّر أي سلوك لو تُجوهلتا.
 */
const InvoiceImportTool = forwardRef(function InvoiceImportTool({ showHeader = true, onNameChange, onBusyChange } = {}, ref) {
  const { t, dir } = useLanguage();
  const engine = useSalesInvoiceImportEngine();

  useEffect(() => { onNameChange && onNameChange(engine.customerName); }, [engine.customerName, onNameChange]);
  useEffect(() => { onBusyChange && onBusyChange(engine.apiSendBusy); }, [engine.apiSendBusy, onBusyChange]);
  useImperativeHandle(ref, () => ({ requestStop: engine.stopApiSend }), [engine.stopApiSend]);

  return (
    <div className="qsv-app" dir={dir}>
      {showHeader && (
        // [إعادة تصميم] رأس بنفس تكوين رأس أداتي الشجرة والقيود (أيقونة كحلية + عنوان/عنوان فرعي)
        // بدل الشريط المتدرّج السابق، مع زر "إعادة تعيين" الجديد — بلا أي تأثير على منطق الأداة.
        <header className="qsv-header">
          <div className="qsv-header-left">
            <ToolIcon name="sales" />
            <div className="qsv-header-title">
              <h1>{t({ ar: 'مطابقة واستيراد فواتير المبيعات', en: 'Match & Import Sales Invoices' })}</h1>
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

      <RefDatalists customersRef={engine.customersRef} productsRef={engine.productsRef} projectsRef={engine.projectsRef} stockRef={engine.stockRef} />

      <div className="qsv-wrap">
        <StepNav step={engine.step} templateLoaded={engine.template.loaded} onGoStep={engine.goToStep} />

        {engine.step === 1 && <Step1References engine={engine} />}
        {engine.step === 2 && <Step2Entry engine={engine} />}
        {engine.step === 3 && <Step3Validate engine={engine} />}
        {engine.step === 4 && <Step4Export engine={engine} />}
      </div>
    </div>
  );
});

export default InvoiceImportTool;
