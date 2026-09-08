import React from 'react';
import { useLanguage } from '../../language.jsx';

const STEPS = [
  { id: 1, label: { ar: 'رفع الملفات المرجعية', en: 'Upload reference files' } },
  { id: 2, label: { ar: 'إدخال بيانات الفواتير', en: 'Enter invoice data' } },
  { id: 3, label: { ar: 'التحقق والتحليل', en: 'Validate & analyze' } },
  { id: 4, label: { ar: 'تحميل الملف الجاهز', en: 'Download the ready file' } },
];

// نفس شرط النقر الأصلي حرفيًا: n===1 أو القالب محمَّل (goStep click listener، سطر ~1498-1501).
export default function StepNav({ step, templateLoaded, onGoStep }) {
  const { t } = useLanguage();
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
            <span className="qsv-num">{s.id}</span> {t(s.label)}
          </button>
        );
      })}
    </div>
  );
}
