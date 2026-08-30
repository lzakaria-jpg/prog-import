import React, { useRef, useState } from 'react';

export function FileDrop({ label, hint, accept, file, onFile, disabled }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);

  const pick = files => { if (files && files[0]) onFile(files[0]); };

  return (
    <div
      className={`qii-drop${over ? ' over' : ''}${file ? ' filled' : ''}`}
      onClick={() => !disabled && ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); if (!disabled) pick(e.dataTransfer.files); }}
      role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ref.current?.click(); } }}
    >
      <input ref={ref} type="file" accept={accept} onChange={e => pick(e.target.files)} />
      <div className="qii-drop-title">{file ? `✓ ${file}` : label}</div>
      <div className="qii-drop-hint">{file ? 'اضغط لاستبدال الملف' : hint}</div>
    </div>
  );
}

export function Stat({ k, v, tone }) {
  return (
    <div className="qii-stat">
      <div className="qii-stat-k">{k}</div>
      <div className={`qii-stat-v${tone ? ' ' + tone : ''}`}>{v}</div>
    </div>
  );
}

export function Badge({ tone, children }) {
  return <span className={`qii-badge${tone ? ' ' + tone : ''}`}>{children}</span>;
}

export function Note({ tone, children }) {
  return <div className={`qii-note${tone ? ' ' + tone : ''}`}>{children}</div>;
}

export function Card({ title, aside, children, tight }) {
  return (
    <section className="qii-card">
      {(title || aside) && (
        <header className="qii-card-head">
          {title && <h2>{title}</h2>}
          <span className="spacer" />
          {aside}
        </header>
      )}
      <div className={`qii-card-body${tight ? ' tight' : ''}`}>{children}</div>
    </section>
  );
}

/**
 * شبكة ربط الأعمدة على بيانات حقيقية — كل عمود من الملف المصدر يظهر بعموده
 * الأصلي وقائمة منسدلة أعلاه لاختيار الحقل الذي يُربط به، وعيّنة من صفوفه
 * الفعلية أسفله. نفس تجربة مرحلة المطابقة في أداة استيراد فواتير المشتريات:
 * ربط ذكي مبدئي، تعديل يدوي حر لكل عمود، وتجاهل صريح بلا حاجة لتذكّر اسم الحقل.
 *
 * @param {string[]} headers رؤوس الأعمدة كما وردت في الملف
 * @param {object[]} sampleRows عيّنة صفوف (كائنات مفاتيحها الرؤوس نفسها)
 * @param {Array<{title:string, fields:Array<{key:string,label:string,required?:boolean}>}>} fieldGroups
 * @param {Record<string,string>} mapping حقل → اسم العمود المرتبط به حالياً
 * @param {(header:string, fieldKey:string) => void} onAssign يُستدعى عند تغيير ربط عمود؛ fieldKey فارغ = تجاهل
 */
export function MappingGrid({ headers, sampleRows, fieldGroups, mapping, onAssign }) {
  const assignedField = {};
  Object.entries(mapping || {}).forEach(([field, header]) => { if (header) assignedField[header] = field; });

  return (
    <div className="qii-table-wrap" style={{ maxHeight: 400 }}>
      <table>
        <thead>
          <tr>
            {headers.map(h => {
              const field = assignedField[h] || '';
              return (
                <th key={h} style={{ whiteSpace: 'normal', minWidth: 150 }}>
                  <select
                    className={field ? 'set' : 'unset'}
                    value={field}
                    onChange={e => onAssign(h, e.target.value)}
                    style={{ fontWeight: 600, marginBottom: 5 }}
                  >
                    <option value="">— تجاهل هذا العمود —</option>
                    {fieldGroups.map(g => (
                      <optgroup key={g.title} label={g.title}>
                        {g.fields.map(f => (
                          <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div style={{ fontWeight: 400, fontSize: 11, opacity: .85 }} className="qii-truncate" title={h}>{h}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sampleRows.map((r, ri) => (
            <tr key={ri}>
              {headers.map(h => <td key={h}>{String(r[h] ?? '').slice(0, 40)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ColumnSelect({ value, options, onChange, allowEmpty = true }) {
  return (
    <select
      className={value ? 'set' : 'unset'}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
    >
      {allowEmpty && <option value="">— اختر عموداً —</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/** علامة الحقل الإلزامي — نجمة حمراء صغيرة، بجانب اسم الحقل الرسمي مباشرة */
export function RequiredStar() {
  return <span style={{ color: 'var(--qii-stop)', marginInlineStart: 3 }} title="حقل إلزامي في قالب قيود">*</span>;
}

/** خيارات قائمة العملاء — نفس التسمية المستخدمة في شاشة المطابقة: الاسم — الرقم المرجعي */
export function buildCustomerOptions(customers) {
  return (customers || []).map(c => ({ value: c.ref, label: `${c.name || '(بلا اسم)'} — ${c.ref}` }));
}

/** خيارات قائمة المنتجات — المنتجات غير المسموح ببيعها مستبعدة دائماً من أي اختيار يدوي */
export function buildProductOptions(products) {
  return (products || [])
    .filter(p => p.sellable !== false)
    .map(p => ({
      value: p.code,
      label: `${p.name || '(بلا اسم)'} — ${p.code}${p.stock !== null && p.stock !== undefined ? ` · متاح ${p.stock}` : ''}`,
    }));
}

/** قائمة اختيار عامة مقيَّدة بقيم محدَّدة — لا نص حر أبداً لحقل قيمته من بيانات النظام */
export function ConstrainedSelect({ value, options, onChange, placeholder = '— اختر —', disabled }) {
  return (
    <select className={value ? 'set' : 'unset'} value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled}>
      <option value="">{placeholder}</option>
      {options.map(o => (
        typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** حقل تاريخ قياسي — {y,m,d} الداخلي ↔ input[type=date] بصيغة ISO */
export function DateField({ value, onChange, disabled }) {
  const iso = value ? `${value.y}-${String(value.m).padStart(2, '0')}-${String(value.d).padStart(2, '0')}` : '';
  return (
    <input
      type="date"
      value={iso}
      disabled={disabled}
      onChange={e => {
        const v = e.target.value;
        if (!v) { onChange(null); return; }
        const [y, m, d] = v.split('-').map(Number);
        onChange({ y, m, d });
      }}
    />
  );
}

/** رقم منسّق بفواصل وخانتين — كل الأرقام في الواجهة تمر من هنا */
export function n(v, d = 2) {
  if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return '—';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function i(v) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('en-US');
}
