import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../language.jsx';

// نسخ لتصميم renderMissingLocationUI الأصلي — تنبيه تفاعلي للفواتير بلا موقع، مع تطبيق موقع
// افتراضي على المحدد أو على الكل دفعة واحدة.
export default function MissingLocationPanel({ groups, templateLocations, onApply }) {
  const { t } = useLanguage();
  const [checked, setChecked] = useState(() => new Set(groups.map((m) => m.key)));
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');

  // كل مرة تتغيّر قائمة الفواتير الناقصة (بعد كل إعادة تحقق) تُعاد تعليم الكل تلقائيًا كما في الأصل.
  useEffect(() => { setChecked(new Set(groups.map((m) => m.key))); }, [groups]);

  if (!templateLocations.length || !groups.length) return null;

  const toggle = (key) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const apply = (onlySelected) => {
    if (!location) { setError(t({ ar: 'الرجاء اختيار موقع أولًا.', en: 'Please choose a location first.' })); return; }
    setError('');
    const keys = onlySelected ? groups.filter((m) => checked.has(m.key)).map((m) => m.key) : groups.map((m) => m.key);
    onApply(keys, location);
  };

  return (
    <div className="qsv-panel qsv-missing-loc-box">
      <h3 style={{ marginTop: 0 }}>⚠️ {t({ ar: 'فواتير بدون موقع', en: 'Invoices without a location' })} ({groups.length})</h3>
      <p className="qsv-hint">
        {t({
          ar: 'لا يمكن أن تحتوي الفاتورة الواحدة على أكثر من موقع، ويجب أن يكون لها موقع واحد محدَّد. اختر الفواتير التي تريد تطبيق موقع افتراضي عليها، ثم اختر الموقع واضغط تطبيق.',
          en: 'A single invoice cannot have more than one location, and it must have exactly one location set. Choose the invoices you want to apply a default location to, then choose the location and click Apply.',
        })}
      </p>
      <div className="qsv-missing-loc-list">
        {groups.map((m) => (
          <label key={m.key}>
            <input type="checkbox" checked={checked.has(m.key)} onChange={() => toggle(m.key)} /> {m.key} ({m.rows.length} {t({ ar: 'سطر', en: 'row(s)' })})
          </label>
        ))}
      </div>
      {error && <div className="qsv-note-box err" style={{ marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select style={{ maxWidth: 280 }} value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="">— {t({ ar: 'اختر الموقع', en: 'Choose the location' })} —</option>
          {templateLocations.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <button type="button" className="qsv-btn" onClick={() => apply(true)}>{t({ ar: 'تطبيق على المحدد', en: 'Apply to selected' })}</button>
        <button type="button" className="qsv-btn secondary" onClick={() => apply(false)}>{t({ ar: 'تطبيق على الكل', en: 'Apply to all' })}</button>
      </div>
    </div>
  );
}
