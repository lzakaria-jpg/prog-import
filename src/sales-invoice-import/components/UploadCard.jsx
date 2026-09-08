import React, { useRef } from 'react';
import { useLanguage } from '../../language.jsx';

/**
 * بطاقة رفع ملف واحدة — نسخ لهوية الأصل (upcard) بلا أي HTML مُدار مباشرة (المكوّن يعرض فقط).
 * required/loaded يتحكمان بلون الحد كما في الأصل (.required بحد وردي، .loaded بحد أخضر).
 */
export default function UploadCard({ id, required, title, hint, accept, status, loaded, onFile, children }) {
  const { t } = useLanguage();
  const inputRef = useRef(null);
  return (
    <div className={`qsv-upcard${required ? ' required' : ''}${loaded ? ' loaded' : ''}`} id={id}>
      {required ? <div className="qsv-tag">{t({ ar: 'إلزامي', en: 'Required' })}</div> : <div className="qsv-optional-tag">{t({ ar: 'اختياري (موصى به)', en: 'Optional (recommended)' })}</div>}
      <h4>{title}</h4>
      <p className="qsv-hint">{hint}</p>
      <label className="qsv-btn secondary" onClick={() => inputRef.current?.click()}>
        {t({ ar: 'اختر ملف', en: 'Choose file' })}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={(e) => { const f = e.target.files[0]; if (f) Promise.resolve(onFile(f)).catch(() => {}); e.target.value = ''; }}
        />
      </label>
      <div className="qsv-status-line">{status || t({ ar: 'لم يُرفع بعد', en: 'Not uploaded yet' })}</div>
      {children}
    </div>
  );
}
