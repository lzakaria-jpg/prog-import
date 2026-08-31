import React from 'react';

const STEPS = [
  { id: 1, label: 'رفع الملفات المرجعية' },
  { id: 2, label: 'إدخال بيانات الفواتير' },
  { id: 3, label: 'التحقق والتحليل' },
  { id: 4, label: 'تحميل الملف الجاهز' },
];

// نفس شرط النقر الأصلي حرفيًا: n===1 أو القالب محمَّل (goStep click listener، سطر ~1498-1501).
export default function StepNav({ step, templateLoaded, onGoStep }) {
  return (
    <div className="qsv-steps">
      {STEPS.map((s) => {
        const clickable = s.id === 1 || templateLoaded;
        return (
          <button
            key={s.id}
            type="button"
            className={`qsv-step-tab${step === s.id ? ' active' : ''}${s.id < step ? ' done' : ''}`}
            disabled={!clickable}
            onClick={() => clickable && onGoStep(s.id)}
          >
            <span className="qsv-num">{s.id}</span> {s.label}
          </button>
        );
      })}
    </div>
  );
}
