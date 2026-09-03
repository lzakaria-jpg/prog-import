import React, { useRef } from 'react';

/**
 * بطاقة رفع ملف واحدة — نسخ لهوية الأصل (upcard) بلا أي HTML مُدار مباشرة (المكوّن يعرض فقط).
 * required/loaded يتحكمان بلون الحد كما في الأصل (.required بحد وردي، .loaded بحد أخضر).
 */
export default function UploadCard({ id, required, title, hint, accept, status, loaded, onFile, children }) {
  const inputRef = useRef(null);
  return (
    <div className={`qsv-upcard${required ? ' required' : ''}${loaded ? ' loaded' : ''}`} id={id}>
      {required ? <div className="qsv-tag">إلزامي</div> : <div className="qsv-optional-tag">اختياري (موصى به)</div>}
      <h4>{title}</h4>
      <p className="qsv-hint">{hint}</p>
      <label className="qsv-btn secondary" onClick={() => inputRef.current?.click()}>
        اختر ملف
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={(e) => { const f = e.target.files[0]; if (f) Promise.resolve(onFile(f)).catch(() => {}); e.target.value = ''; }}
        />
      </label>
      <div className="qsv-status-line">{status || 'لم يُرفع بعد'}</div>
      {children}
    </div>
  );
}
