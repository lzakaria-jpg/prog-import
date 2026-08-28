import { useState } from 'react';
import { groupsOf } from '../lib/validation.js';

/** لوحة مواقع الفواتير: الموقع خاصية للفاتورة لا للبند */
export default function LocationPanel({ eng, defaultLoc, setDefaultLoc }) {
  const [picked, setPicked] = useState({});
  const all = [];
  groupsOf(eng.rows).forEach((rows, ref) => {
    const locs = [...new Set(rows.map((r) => r.location).filter(Boolean))];
    all.push({ ref, rows, locs, kind: !locs.length ? 'missing' : locs.length > 1 ? 'mixed' : 'ok' });
  });
  if (!all.length) return null;

  const need = all.filter((b) => b.kind !== 'ok');
  const isChecked = (b) => (picked[b.ref] === undefined ? b.kind !== 'ok' : picked[b.ref]);
  const apply = (mode) => {
    all.forEach((b) => {
      const hit = mode === 'selected' ? isChecked(b) : b.kind === 'missing';
      if (hit) eng.setGroupLocation(b.ref, defaultLoc);
    });
  };

  return (
    <details className={`qbi-box${need.length ? ' need' : ''}`} open={need.length > 0}>
      <summary>
        {`مواقع الفواتير — ${all.length} فاتورة`}
        <span className={`badge ${need.length ? 'b-warn' : 'b-ok'}`}>
          {need.length
            ? [
              all.filter((b) => b.kind === 'missing').length ? `${all.filter((b) => b.kind === 'missing').length} بلا موقع` : '',
              all.filter((b) => b.kind === 'mixed').length ? `${all.filter((b) => b.kind === 'mixed').length} بأكثر من موقع` : ''
            ].filter(Boolean).join(' · ')
            : 'كلها مضبوطة'}
        </span>
      </summary>

      <div className="qbi-list">
        {all.map((b) => (
          <label key={b.ref}>
            <input type="checkbox" checked={isChecked(b)}
              onChange={(e) => setPicked((p) => ({ ...p, [b.ref]: e.target.checked }))} />
            <b>{b.ref}</b>
            <span className="count">{` ${b.rows.length} بند`}</span>
            <span className={`badge ${b.kind === 'missing' ? 'b-warn' : b.kind === 'mixed' ? 'b-err' : 'b-ok'}`}>
              {b.kind === 'missing' ? 'بلا موقع' : b.locs.join(' / ')}
            </span>
          </label>
        ))}
      </div>

      <div className="qbi-actions">
        <span className="count">الموقع المختار:</span>
        <select value={defaultLoc} onChange={(e) => setDefaultLoc(e.target.value)}>
          {eng.catalog.locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <button className="qbi-btn" onClick={() => apply('selected')}>تطبيق على المحدد</button>
        <button className="qbi-btn ghost" onClick={() => apply('missing')}>تطبيق على كل فاتورة بلا موقع</button>
        <button className="qbi-btn ghost"
          onClick={() => {
            const on = all.every(isChecked);
            const next = {}; all.forEach((b) => { next[b.ref] = !on; }); setPicked(next);
          }}>تحديد الكل / إلغاء</button>
      </div>
    </details>
  );
}
