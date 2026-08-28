/**
 * QoyodBillImport — المكون الرئيسي للأداة.
 * مستقل بالكامل: لا Context ولا Provider ولا Router ولا حالة عامة.
 * يكفي استيراده ووضعه داخل أي تبويب في تطبيق React/Vite.
 *
 * @param {string}   [apiKey]        مفتاح واجهة قيود، إن أردت تعبئته مسبقاً
 * @param {string}   [apiBaseUrl]    عنوان الواجهة (افتراضي https://api.qoyod.com/2.0)
 * @param {string}   [corsProxy]     وسيط CORS اختياري
 * @param {boolean}  [showHeader]    إظهار ترويسة الأداة (افتراضي true)
 * @param {string}   [className]     صنف إضافي للجذر
 * @param {Function} [onExport]      يُستدعى بعد كل تصدير: ({kind, filename, blob, invoices, usedTemplate})
 * @param {Function} [onStepChange]  يُستدعى عند تغيّر الخطوة: (stepNumber)
 * @param {Function} [onError]       يُستدعى عند أي فشل: (Error)
 */
import { useEffect } from 'react';
import useImportEngine from './useImportEngine.js';
import StepNav from './components/StepNav.jsx';
import Step1Connect from './components/Step1Connect.jsx';
import Step2Mapping from './components/Step2Mapping.jsx';
import Step3Review from './components/Step3Review.jsx';
import Step4Export from './components/Step4Export.jsx';
import './styles/qoyod-import.css';

export default function QoyodBillImport({
  apiKey = '',
  apiBaseUrl,
  corsProxy = '',
  showHeader = true,
  className = '',
  onExport,
  onStepChange,
  onError
}) {
  const eng = useImportEngine({ apiKey, apiBaseUrl, corsProxy, onExport, onError });

  useEffect(() => { onStepChange && onStepChange(eng.step); }, [eng.step, onStepChange]);

  return (
    <div className={`qbi ${className}`} dir="rtl">
      {showHeader && (
        <header className="qbi-header">
          <h1>مُجهِّز فواتير المشتريات</h1>
          <div className="sub">يحوّل ملفات العملاء غير المنظمة إلى قالب الاستيراد المعتمد في قيود</div>
        </header>
      )}

      <div className="qbi-wrap">
        <StepNav step={eng.step} maxStep={eng.maxStep} onGo={eng.setStep} />

        {eng.step === 1 && <Step1Connect eng={eng} />}
        {eng.step === 2 && <Step2Mapping eng={eng} />}
        {eng.step === 3 && <Step3Review eng={eng} />}
        {eng.step === 4 && <Step4Export eng={eng} />}

        <details className="qbi-guide">
          <summary>قواعد الاستيراد التي تفحصها الأداة</summary>
          <ul>
            <li><b>السعر مع وحدة التحويل:</b> الكمية تُحوَّل إلى الوحدة الأساسية، لكن السعر يُطبَّق على الوحدة الأساسية بعد التحويل. سعر الكرتون يُقسم على معامل التحويل قبل الإدخال.</li>
            <li><b>الخصم:</b> لا يجوز تعبئة نسبة الخصم وقيمة الخصم معاً في نفس البند.</li>
            <li><b>المورد:</b> يُطابَق بالرقم المرجعي لا بالاسم. عند تكرار الاسم تظهر قائمة بالمرشحين مع أرقامهم.</li>
            <li><b>المنتج:</b> يُطابَق بالرقم التسلسلي أو الباركود، وغير القابل للشراء يُستبعد.</li>
            <li><b>الضريبة:</b> تُطابَق بالنسبة المئوية، ويُكتب اسمها كما هو معرَّف في قائمة القالب.</li>
            <li><b>التواريخ:</b> تُكتب بصيغة يوم/شهر/سنة كقيم تاريخ حقيقية، والاستحقاق لا يسبق الإصدار.</li>
            <li><b>الكل أو لا شيء:</b> خطأ واحد يرفض الملف بأكمله، لذا يُستبعد كامل الفاتورة الخاطئة عند التصدير الانتقائي.</li>
            <li><b>الحدود:</b> ٥٠٠٠ صف كحد أقصى، والملفات فوق ١٠٠ صف تُعالَج في خلفية قيود ويصل تقريرها بالبريد.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
