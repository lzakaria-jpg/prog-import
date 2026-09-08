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
import { useLanguage } from '../language.jsx';
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
  const { t, dir } = useLanguage();
  const eng = useImportEngine({ apiKey, apiBaseUrl, corsProxy, onExport, onError });

  useEffect(() => { onStepChange && onStepChange(eng.step); }, [eng.step, onStepChange]);

  return (
    <div className={`qbi ${className}`} dir={dir}>
      {showHeader && (
        <header className="qbi-header">
          <h1>{t({ ar: 'مُجهِّز فواتير المشتريات', en: 'Purchase Invoice Preparer' })}</h1>
          <div className="sub">{t({ ar: 'يحوّل ملفات العملاء غير المنظمة إلى قالب الاستيراد المعتمد في قيود', en: "Converts customers' unstructured files into Qoyod's approved import template" })}</div>
        </header>
      )}

      <div className="qbi-wrap">
        <StepNav step={eng.step} maxStep={eng.maxStep} onGo={eng.setStep} />

        {eng.step === 1 && <Step1Connect eng={eng} />}
        {eng.step === 2 && <Step2Mapping eng={eng} />}
        {eng.step === 3 && <Step3Review eng={eng} />}
        {eng.step === 4 && <Step4Export eng={eng} />}

        <details className="qbi-guide">
          <summary>{t({ ar: 'قواعد الاستيراد التي تفحصها الأداة', en: 'Import rules the tool checks' })}</summary>
          <ul>
            <li><b>{t({ ar: 'السعر مع وحدة التحويل:', en: 'Price with a conversion unit:' })}</b> {t({ ar: 'الكمية تُحوَّل إلى الوحدة الأساسية، لكن السعر يُطبَّق على الوحدة الأساسية بعد التحويل. سعر الكرتون يُقسم على معامل التحويل قبل الإدخال.', en: 'The quantity is converted to the base unit, but the price is applied to the base unit after conversion. A carton price is divided by the conversion factor before entry.' })}</li>
            <li><b>{t({ ar: 'الخصم:', en: 'Discount:' })}</b> {t({ ar: 'لا يجوز تعبئة نسبة الخصم وقيمة الخصم معاً في نفس البند.', en: 'A discount percentage and a discount amount cannot both be filled in on the same line item.' })}</li>
            <li><b>{t({ ar: 'المورد:', en: 'Vendor:' })}</b> {t({ ar: 'يُطابَق بالرقم المرجعي لا بالاسم. عند تكرار الاسم تظهر قائمة بالمرشحين مع أرقامهم.', en: 'Matched by reference number, not by name. When a name repeats, a list of candidates with their numbers is shown.' })}</li>
            <li><b>{t({ ar: 'المنتج:', en: 'Product:' })}</b> {t({ ar: 'يُطابَق بالرقم التسلسلي أو الباركود، وغير القابل للشراء يُستبعد.', en: 'Matched by SKU or barcode; a non-purchasable product is excluded.' })}</li>
            <li><b>{t({ ar: 'الضريبة:', en: 'Tax:' })}</b> {t({ ar: 'تُطابَق بالنسبة المئوية، ويُكتب اسمها كما هو معرَّف في قائمة القالب.', en: "Matched by percentage rate, and its name is written as defined in the template's list." })}</li>
            <li><b>{t({ ar: 'التواريخ:', en: 'Dates:' })}</b> {t({ ar: 'تُكتب بصيغة يوم/شهر/سنة كقيم تاريخ حقيقية، والاستحقاق لا يسبق الإصدار.', en: 'Written as day/month/year real date values, and the due date cannot precede the issue date.' })}</li>
            <li><b>{t({ ar: 'الكل أو لا شيء:', en: 'All or nothing:' })}</b> {t({ ar: 'خطأ واحد يرفض الملف بأكمله، لذا يُستبعد كامل الفاتورة الخاطئة عند التصدير الانتقائي.', en: 'A single error rejects the entire file, so the whole faulty invoice is excluded on a selective export.' })}</li>
            <li><b>{t({ ar: 'الحدود:', en: 'Limits:' })}</b> {t({ ar: '٥٠٠٠ صف كحد أقصى، والملفات فوق ١٠٠ صف تُعالَج في خلفية قيود ويصل تقريرها بالبريد.', en: "5,000 rows maximum, and files over 100 rows are processed in Qoyod's background with their report arriving by email." })}</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
