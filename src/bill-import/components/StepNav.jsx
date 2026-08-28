const STEPS = [
  [1, 'ربط المنشأة'],
  [2, 'ملف العميل'],
  [3, 'المطابقة والتعديل'],
  [4, 'إخراج القالب']
];

export default function StepNav({ step, maxStep, onGo }) {
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
          <span className="n">{['١', '٢', '٣', '٤'][n - 1]}</span>
          <span className="t">{label}</span>
        </button>
      ))}
    </nav>
  );
}
