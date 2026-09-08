import { useLanguage } from '../../language.jsx';

const STEPS = [
  [1, { ar: 'ربط المنشأة', en: 'Connect account' }],
  [2, { ar: 'ملف العميل', en: "Customer's file" }],
  [3, { ar: 'المطابقة والتعديل', en: 'Match & edit' }],
  [4, { ar: 'إخراج القالب', en: 'Export template' }]
];

export default function StepNav({ step, maxStep, onGo }) {
  const { t, lang } = useLanguage();
  return (
    <nav className="qbi-steps" role="tablist">
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
