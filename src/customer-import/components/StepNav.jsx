import { useLanguage } from '../../language.jsx';

const STEPS = [
  [1, { ar: 'ربط المنشأة', en: 'Connect account' }],
  [2, { ar: 'ملف العملاء', en: "Customers' file" }],
  [3, { ar: 'المراجعة والتعديل', en: 'Review & edit' }],
  [4, { ar: 'التصدير/الإرسال', en: 'Export / send' }]
];

export default function StepNav({ step, maxStep, onGo }) {
  const { t, lang } = useLanguage();
  return (
    <nav className="qci-steps" role="tablist">
      {STEPS.map(([n, label]) => (
        <button
          key={n}
          role="tab"
          aria-selected={step === n}
          className={n < step ? 'done' : ''}
          disabled={n > maxStep}
          onClick={() => onGo(n)}
        >
          <span className="n">{lang === 'ar' ? ['١', '٢', '٣', '٤'][n - 1] : n}</span>
          <span className="t">{t(label)}</span>
        </button>
      ))}
    </nav>
  );
}
