// حقل تاريخ بتقويم منبثق: أرقام وأشهر إنجليزية، اختيار بالنقر أو كتابة بأي صيغة شائعة.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../../language.jsx';
import { parseDate } from '../lib/engine.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad = (n) => String(n).padStart(2, '0');
const toIso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => { const t = new Date(); return toIso(t.getFullYear(), t.getMonth(), t.getDate()); };
const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// "2030-12-31" ← "31-Dec-2030"
export function fmtDate(iso) {
  if (!isIso(iso)) return iso || '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${pad(d)}-${MONTHS[m - 1]}-${y}`;
}
// نص مكتوب ← ISO أو null
export function parseTyped(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  if (isIso(t)) return t;
  const r = parseDate(t, 'dmy', 'dmy');
  return r.status === 'error' ? null : r.iso;
}

function Calendar({ value, onPick, onToday, onClear, anchor, onClose, calRef }) {
  const init = isIso(value) ? value.split('-').map(Number) : null;
  const now = new Date();
  const [view, setView] = useState({ y: init ? init[0] : now.getFullYear(), m: init ? init[1] - 1 : now.getMonth() });
  const ref = calRef;
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // موضع ثابت تحت الحقل (لا يُقص داخل الجداول القابلة للتمرير)
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const el = ref.current;
      if (!a || !el) return;
      const w = el.offsetWidth, h = el.offsetHeight;
      let left = a.right - w;
      if (left < 8) left = Math.min(a.left, window.innerWidth - w - 8);
      let top = a.bottom + 4;
      if (top + h > window.innerHeight - 8) top = Math.max(8, a.top - h - 4);
      setPos({ top, left: Math.max(8, left) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor, view]);

  useEffect(() => {
    const onDoc = (e) => { if (!ref.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [anchor, onClose]);

  const days = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay();
    const n = new Date(view.y, view.m + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)];
  }, [view]);
  // مدى السنوات يشمل دائمًا السنة المعروضة (حتى لو كانت خطأ مثل 2099)
  const years = useMemo(() => {
    const out = [];
    for (let y = Math.max(now.getFullYear() + 30, view.y); y >= Math.min(1940, view.y); y--) out.push(y);
    return out;
  }, [view.y]); // eslint-disable-line
  const step = (d) => setView((v) => { const m = v.m + d; return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }; });
  const today = todayIso();

  return (
    <div className="cal" ref={ref} style={{ top: pos.top, left: pos.left }} onMouseDown={(e) => { if (e.target.tagName !== 'SELECT') e.preventDefault(); }} dir="ltr">
      <div className="cal-head">
        <button type="button" className="cal-nav" onClick={() => step(-1)} aria-label="Previous month">‹</button>
        <select value={view.m} onChange={(e) => setView((v) => ({ ...v, m: +e.target.value }))} aria-label="Month">
          {MONTHS_LONG.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select value={view.y} onChange={(e) => setView((v) => ({ ...v, y: +e.target.value }))} aria-label="Year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button type="button" className="cal-nav" onClick={() => step(1)} aria-label="Next month">›</button>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {days.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const iso = toIso(view.y, view.m, d);
          return (
            <button type="button" key={iso} className={`cal-day ${iso === value ? 'sel' : ''} ${iso === today ? 'today' : ''}`} onClick={() => onPick(iso)}>{d}</button>
          );
        })}
      </div>
      <div className="cal-foot">
        <button type="button" className="btn small" onClick={onToday}>Today</button>
        <span className="cal-val">{isIso(value) ? fmtDate(value) : '—'}</span>
        <button type="button" className="btn small ghost" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}

// value: ISO أو نص خام ; onChange(iso|'') يُستدعى عند الاختيار أو تأكيد الكتابة ; onCancel اختياري
export default function DateField({ value, onChange, onCancel, autoFocus = false, autoOpen = false, placeholder = 'DD-Mon-YYYY', className = '' }) {
  const { t } = useLanguage();
  const anchor = useRef(null);
  const inputRef = useRef(null);
  const calRef = useRef(null);
  const [open, setOpen] = useState(autoOpen);
  const [text, setText] = useState(isIso(value) ? fmtDate(value) : (value || ''));
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(isIso(value) ? fmtDate(value) : (value || '')); }, [value]);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const commitText = () => {
    const iso = parseTyped(text);
    if (iso === null) { setBad(true); return false; }
    setBad(false);
    if (iso !== (isIso(value) ? value : '')) onChange(iso);
    else onCancel?.();
    return true;
  };
  const pick = (iso) => { setText(fmtDate(iso)); setBad(false); setOpen(false); onChange(iso); };

  return (
    <div className={`datefield ${className}`} ref={anchor}>
      <input
        ref={inputRef}
        type="text"
        dir="ltr"
        className={bad ? 'bad' : ''}
        value={text}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => { setText(e.target.value); setBad(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { if (commitText()) setOpen(false); }
          if (e.key === 'Escape') { setOpen(false); onCancel?.(); }
        }}
        onBlur={(e) => { if (calRef.current?.contains(e.relatedTarget)) return; setOpen(false); commitText(); }}
        title={bad ? t({ ar: 'تاريخ غير مفهوم — اكتب مثل 31-Dec-2030 أو 2030-12-31', en: 'Unrecognized date — type e.g. 31-Dec-2030 or 2030-12-31' }) : t({ ar: 'اختر من التقويم أو اكتب التاريخ', en: 'Pick from the calendar or type the date' })}
      />
      <button type="button" className="date-ico" tabIndex={-1} onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); inputRef.current?.focus(); }} aria-label={t({ ar: 'فتح التقويم', en: 'Open calendar' })}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
      </button>
      {open && (
        <Calendar
          value={parseTyped(text) || (isIso(value) ? value : '')}
          anchor={anchor}
          calRef={calRef}
          onPick={pick}
          onToday={() => pick(todayIso())}
          onClear={() => { setText(''); setOpen(false); onChange(''); }}
          onClose={() => { setOpen(false); commitText(); }}
        />
      )}
    </div>
  );
}
