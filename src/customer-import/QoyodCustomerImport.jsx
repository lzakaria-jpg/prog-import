/**
 * QoyodCustomerImport — المكون الرئيسي لأداة استيراد العملاء.
 * مستقل بالكامل: لا Context ولا Provider ولا Router ولا حالة عامة.
 * نفس عقد src/bill-import/QoyodBillImport.jsx حرفياً (props/ref) لضمان توافق
 * تام مع TabbedTool.jsx ونظام الصلاحيات دون أي تخصيص إضافي.
 *
 * @param {string}   [apiKey]        مفتاح واجهة قيود، إن أردت تعبئته مسبقاً
 * @param {boolean}  [showHeader]    إظهار ترويسة الأداة (افتراضي true)
 * @param {string}   [className]     صنف إضافي للجذر
 * @param {Function} [onExport]      يُستدعى بعد كل تصدير: ({kind, filename, blob, rows})
 * @param {Function} [onStepChange]  يُستدعى عند تغيّر الخطوة: (stepNumber)
 * @param {Function} [onError]       يُستدعى عند أي فشل: (Error)
 * @param {Function} [onNameChange]  يُستدعى عند تغيّر اسم العميل — دعم "التبويبات المتعددة" (TabbedTool.jsx)
 * @param {Function} [onBusyChange]  يُستدعى عند تغيّر حالة الانشغال (إرسال جارٍ عبر API)
 */
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { useLanguage } from '../language.jsx';
import ToolIcon from '../lib/ToolIcon.jsx';
import useImportEngine from './useImportEngine.js';
import StepNav from './components/StepNav.jsx';
import Step1Connect from './components/Step1Connect.jsx';
import Step2Mapping from './components/Step2Mapping.jsx';
import Step3Review from './components/Step3Review.jsx';
import Step4Export from './components/Step4Export.jsx';
import './styles/qoyod-import.css';

const QoyodCustomerImport = forwardRef(function QoyodCustomerImport({
  apiKey = '',
  showHeader = true,
  className = '',
  onExport,
  onStepChange,
  onError,
  onNameChange,
  onBusyChange,
}, ref) {
  const { t, dir } = useLanguage();
  const eng = useImportEngine({ apiKey, onExport, onError });

  useEffect(() => { onStepChange && onStepChange(eng.step); }, [eng.step, onStepChange]);
  useEffect(() => { onNameChange && onNameChange(eng.customerName); }, [eng.customerName, onNameChange]);
  useEffect(() => { onBusyChange && onBusyChange(eng.apiSending); }, [eng.apiSending, onBusyChange]);
  useImperativeHandle(ref, () => ({ requestStop: eng.stopApiSend }), [eng.stopApiSend]);

  return (
    <div className={`qci ${className}`} dir={dir}>
      {showHeader && (
        <header className="qci-header">
          <ToolIcon name="customers" />
          <div className="qci-header-title">
            <h1>{t({ ar: 'مطابقة واستيراد العملاء', en: 'Match & Import Customers' })}</h1>
            <div className="sub">{t({ ar: 'يطابق أسماء العملاء مع الموجودين بالمنشأة، ويحوّل ملف العملاء غير المنظم إلى قالب استيراد العملاء المعتمد في قيود، مع إنشاء مباشر عبر API', en: "Matches customer names against those already in the account, and converts an unstructured customer file into Qoyod's approved customer import template, with direct API creation" })}</div>
          </div>
        </header>
      )}

      <div className="qci-wrap">
        <StepNav step={eng.step} maxStep={eng.maxStep} onGo={eng.setStep} />

        {eng.step === 1 && <Step1Connect eng={eng} />}
        {eng.step === 2 && <Step2Mapping eng={eng} />}
        {eng.step === 3 && <Step3Review eng={eng} />}
        {eng.step === 4 && <Step4Export eng={eng} />}

        <details className="qci-guide">
          <summary>{t({ ar: 'قواعد الاستيراد التي تفحصها الأداة', en: 'Import rules the tool checks' })}</summary>
          <ul>
            <li><b>{t({ ar: 'الاسم:', en: 'Name:' })}</b> {t({ ar: 'إلزامي لكل صف — الحقل الوحيد المطلوب فعلياً بمواصفة قيود الرسمية.', en: "Required for every row — the only field the official Qoyod spec actually requires." })}</li>
            <li><b>{t({ ar: 'الهاتف:', en: 'Phone:' })}</b> {t({ ar: 'إن وُجد، يجب أن يبدأ بـ966 ويتكوّن من 12 رقماً بالضبط (مثال: 966501234567+).', en: 'When present, it must start with 966 and be exactly 12 digits (example: +966501234567).' })}</li>
            <li><b>{t({ ar: 'الرقم الضريبي:', en: 'Tax number:' })}</b> {t({ ar: 'إن وُجد، يجب أن يتكوّن من 15 رقماً، يبدأ وينتهي بالرقم 3.', en: 'When present, it must be exactly 15 digits, starting and ending with 3.' })}</li>
            <li><b>{t({ ar: 'الرمز البريدي:', en: 'Zip code:' })}</b> {t({ ar: 'تنبيه فقط لو ليس 5 أرقام — الإلزام مشروط بتفعيل ZATCA، لا يمكن التأكد منه هنا.', en: "A warning only if it's not 5 digits — the requirement is conditional on ZATCA, which can't be confirmed here." })}</li>
            <li><b>{t({ ar: 'التكرار بالاسم:', en: 'Name duplicates:' })}</b> {t({ ar: 'تحذير عند تطابق أو تشابه كبير مع عميل موجود فعلاً — يتطلب اختياراً صريحاً (إنشاء/تحديث/تجاوز) قبل الإرسال المباشر.', en: 'A warning on an exact or highly similar match with an existing customer — requires an explicit choice (create/update/skip) before direct send.' })}</li>
            <li><b>{t({ ar: 'الرقم المرجعي:', en: 'Ref. No.:' })}</b> {t({ ar: 'غير موثَّق بواجهة قيود البرمجية للعملاء — مرجع محلي بالأداة/ملف التصدير فقط، لا يُرسَل عبر API.', en: "Not documented in Qoyod's customer API — a local, tool/export-file-only reference, never sent via the API." })}</li>
          </ul>
        </details>
      </div>
    </div>
  );
});

export default QoyodCustomerImport;
