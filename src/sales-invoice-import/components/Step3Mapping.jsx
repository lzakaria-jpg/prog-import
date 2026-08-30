import React, { useState, useMemo, useRef } from 'react';
import {
  Note, Badge, i, n,
  RequiredStar, buildCustomerOptions, buildProductOptions, ConstrainedSelect, DateField,
} from './ui.jsx';
import { officialFieldLabel, isFieldRequiredInTemplate } from '../engine/fieldLabels.js';
import { YES, NO } from '../engine/constants.js';

/**
 * الخطوة 3 — المطابقة والمراجعة.
 *
 * صفحة واحدة تجمع: نتيجة تحليل تفاعلية (تصنيف كل فاتورة صحيحة/تنبيه/خطأ)،
 * شبكة مراجعة وتصحيح كاملة لكل فاتورة وبنودها، وأداة مطابقة مجمَّعة للقيم
 * المتكرِّرة غير المطابقة (عميل/منتج/موقع/دفع) — الأخيرة أسرع لتصحيح نفس الخطأ
 * عبر عشرات الفواتير دفعة واحدة، والشبكة أدق لتصحيح فاتورة بعينها أو أي حقل آخر.
 *
 * كل تعديل يعاد حسابه فوراً عبر runPipeline (state.result يُعاد بناؤه تفاعلياً
 * بفعل React، لا حاجة لأي زر «إعادة تحقق») — انظر InvoiceImportTool.jsx.
 */
export default function Step3Mapping({ state, actions }) {
  const [tab, setTab] = useState('grid');
  const [filter, setFilter] = useState('all');
  const gridRef = useRef(null);
  const { decisions, template, references, pending, result } = state;

  if (!pending || !result) return <div className="qii-empty">أكمل الخطوات السابقة أولاً</div>;

  const openCount = pending.customers.filter(p => !decisions.customers?.[p.key]).length
    + pending.products.filter(p => !decisions.products?.[p.key]).length
    + pending.payments.filter(p => !decisions.payments?.[p.key]).length
    + pending.locations.filter(p => !decisions.locations?.[p.key]).length;

  const goTo = f => {
    setFilter(f);
    setTab('grid');
    requestAnimationFrame(() => gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <>
      <h1 className="qii-page-title">المطابقة والمراجعة</h1>
      <p className="qii-page-sub">
        نتيجة التحليل، وتصحيح أي فاتورة أو بند مباشرة من نفس الصفحة قبل التصدير.
      </p>

      <AnalysisDashboard result={result} onSelect={goTo} />

      <div className="qii-tabs" style={{ margin: '18px 0 0' }}>
        <button className={`qii-tab${tab === 'grid' ? ' active' : ''}`} onClick={() => setTab('grid')}>
          الفواتير
        </button>
        <button className={`qii-tab${tab === 'pending' ? ' active' : ''}`} onClick={() => setTab('pending')}>
          مطابقة القيم المتكرِّرة <Badge tone={openCount ? 'stop' : 'ok'}>{openCount ? i(openCount) : '✓'}</Badge>
        </button>
      </div>

      {tab === 'grid' && (
        <div ref={gridRef}>
          <InvoiceGrid state={state} actions={actions} filter={filter} setFilter={setFilter} />
        </div>
      )}

      {tab === 'pending' && (
        <PendingMatchSection state={state} actions={actions} openCount={openCount} />
      )}
    </>
  );
}

/* ═══════════════════════════ نتيجة التحليل (تفاعلية) ═══════════════════════════ */

function classifyInvoices(result) {
  const allIssues = [...result.validation.issues, ...result.notes];
  const byInvoice = new Map();
  for (const r of result.rows) {
    const key = r._meta?.invoiceRef;
    if (!byInvoice.has(key)) byInvoice.set(key, { key, ref: r.invoiceRef || key, rows: [] });
    byInvoice.get(key).rows.push(r);
  }
  for (const grp of byInvoice.values()) {
    // القضايا تُطابَق بالمفتاح الأصلي الثابت أو برقم الفاتورة الحالي معاً — لأن
    // بعضها (فحص الكميات وأخطاء الحساب) يُبنى قبل أي تعديل يدوي على رقم الفاتورة
    const own = allIssues.filter(x => x.invoiceRef === grp.key || x.invoiceRef === grp.ref);
    grp.issues = own;
    grp.hasFatal = own.some(x => x.severity === 'fatal');
    grp.hasWarn = own.some(x => x.severity === 'warn');
    grp.status = grp.hasFatal ? 'error' : grp.hasWarn ? 'warning' : 'ok';
  }
  return [...byInvoice.values()];
}

function AnalysisDashboard({ result, onSelect }) {
  const invoices = useMemo(() => classifyInvoices(result), [result]);
  const total = invoices.length;
  const okCount = invoices.filter(g => g.status === 'ok').length;
  const errorCount = invoices.filter(g => g.status === 'error').length;
  const warnCount = invoices.filter(g => g.status === 'warning').length;

  return (
    <section className="qii-card">
      <header className="qii-card-head"><h2>نتيجة التحليل</h2></header>
      <div className="qii-card-body">
        <div className="qii-grid-3" style={{ gap: 12 }}>
          <DashboardTile label="إجمالي فواتير المبيعات" value={i(total)} onClick={() => onSelect('all')} />
          <DashboardTile label="إجمالي الصحيح" value={i(okCount)} tone="ok" onClick={() => onSelect('ok')} />
          <DashboardTile label="إجمالي الأخطاء" value={i(errorCount)} tone={errorCount ? 'stop' : 'ok'} onClick={() => onSelect('error')} />
          <DashboardTile label="إجمالي التنبيهات" value={i(warnCount)} tone={warnCount ? 'warn' : 'ok'} onClick={() => onSelect('warning')} />
          <DashboardTile label="إجمالي المبيعات" value={n(result.summary.expectedGrandTotal)} onClick={() => onSelect('all')} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--qii-ink-3)', margin: '10px 0 0' }}>
          اضغط أي مؤشر للانتقال مباشرة إلى فواتيره في الجدول أدناه.
        </p>
      </div>
    </section>
  );
}

function DashboardTile({ label, value, tone, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="qii-stat"
      style={{ textAlign: 'start', cursor: 'pointer', border: '1px solid var(--qii-line-soft)' }}
    >
      <div className="qii-stat-k">{label}</div>
      <div className={`qii-stat-v${tone ? ' ' + tone : ''}`}>{value}</div>
    </button>
  );
}

/* ═══════════════════════════ شبكة الفواتير (مراجعة وتصحيح) ═══════════════════════════ */

function InvoiceGrid({ state, actions, filter, setFilter }) {
  const { result, template, references } = state;
  const invoices = useMemo(() => classifyInvoices(result), [result]);

  const filtered = filter === 'all' ? invoices : invoices.filter(g => g.status === filter);
  const filterLabels = { all: 'كل الفواتير', ok: 'الفواتير الصحيحة', error: 'فواتير بها أخطاء', warning: 'فواتير بها تنبيهات' };

  const customerOptions = useMemo(() => buildCustomerOptions(references.customers), [references.customers]);
  const productOptions = useMemo(() => buildProductOptions(references.products), [references.products]);

  return (
    <section className="qii-card" style={{ marginTop: 12 }}>
      <header className="qii-card-head">
        <h2>الفواتير — {filterLabels[filter]}</h2>
        <span className="spacer" />
        <Badge>{i(filtered.length)}</Badge>
      </header>
      <div className="qii-card-body">
        {filter !== 'all' && (
          <button type="button" className="qii-btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setFilter('all')}>
            ← عرض كل الفواتير
          </button>
        )}

        {filtered.length === 0
          ? <div className="qii-empty">لا توجد فواتير ضمن هذا الفلتر</div>
          : filtered.slice(0, 300).map(grp => (
            <InvoiceCard
              key={grp.key} group={grp} template={template}
              customerOptions={customerOptions} productOptions={productOptions}
              actions={actions}
            />
          ))}

        {filtered.length > 300 && (
          <div style={{ padding: '10px 4px', fontSize: 12.5, color: 'var(--qii-ink-3)' }}>
            معروض 300 فاتورة من {i(filtered.length)} — ضيّق الفلتر لمراجعة الباقي.
          </div>
        )}
      </div>
    </section>
  );
}

function InvoiceCard({ group, template, customerOptions, productOptions, actions }) {
  const [open, setOpen] = useState(group.status !== 'ok');
  const has = key => !!template.columns[key];
  const first = group.rows[0];
  const invoiceIssues = group.issues.filter(x => x.scope !== 'line' && !x.sourceRow);
  const total = group.rows.reduce((s, r) => s + (r._meta?.expectedTotal || 0), 0);

  const setHeader = (field, value) => actions.setHeaderOverride(group.key, field, value);

  const toneBadge = { ok: 'ok', warning: 'warn', error: 'stop' }[group.status];
  const toneLabel = { ok: 'صحيحة', warning: 'بها تنبيه', error: 'بها خطأ' }[group.status];

  return (
    <div className={`qii-card ${group.status === 'error' ? 'row-stop' : group.status === 'warning' ? 'row-warn' : ''}`} style={{ marginBottom: 12 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: 'var(--qii-surface-2)' }}
        onClick={() => setOpen(o => !o)}
      >
        <Badge tone={toneBadge}>{toneLabel}</Badge>
        <strong className="mono">{first.invoiceRef || '(بلا رقم)'}</strong>
        <span style={{ fontSize: 12, color: 'var(--qii-ink-3)' }}>{group.rows.length} بند</span>
        <span className="spacer" />
        <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{n(total)}</span>
        <button type="button" className="qii-btn ghost sm">{open ? 'إخفاء' : 'فتح'}</button>
      </div>

      {open && (
        <div style={{ padding: 14 }}>
          {invoiceIssues.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {invoiceIssues.map((x, k) => (
                <Note key={k} tone={x.severity === 'fatal' ? 'stop' : 'warn'}>{x.message}</Note>
              ))}
            </div>
          )}

          {/* ── بيانات رأس الفاتورة ── */}
          <div className="qii-grid-3" style={{ marginBottom: 14 }}>
            {has('customerRef') && (
              <Field label={officialFieldLabel(template, 'customerRef')} required={isFieldRequiredInTemplate(template, 'customerRef')}>
                <ConstrainedSelect value={first.customerRef} options={customerOptions} onChange={v => setHeader('customerRef', v)} />
              </Field>
            )}
            <Field label={officialFieldLabel(template, 'invoiceRef')} required={isFieldRequiredInTemplate(template, 'invoiceRef')}>
              <input type="text" value={first.invoiceRef || ''} onChange={e => setHeader('invoiceRef', e.target.value)} />
            </Field>
            {has('location') && (
              <Field label={officialFieldLabel(template, 'location')} required={isFieldRequiredInTemplate(template, 'location')}>
                <ConstrainedSelect value={first.location} options={template.lists.location || []} onChange={v => setHeader('location', v)} />
              </Field>
            )}
            {has('issueDate') && (
              <Field label={officialFieldLabel(template, 'issueDate')} required={isFieldRequiredInTemplate(template, 'issueDate')}>
                <DateField value={first.issueDate} onChange={v => setHeader('issueDate', v)} />
              </Field>
            )}
            {has('dueDate') && (
              <Field label={officialFieldLabel(template, 'dueDate')} required={isFieldRequiredInTemplate(template, 'dueDate')}>
                <DateField value={first.dueDate} onChange={v => setHeader('dueDate', v)} />
              </Field>
            )}
            {has('supplyDate') && (
              <Field label={officialFieldLabel(template, 'supplyDate')}>
                <DateField value={first.supplyDate} onChange={v => setHeader('supplyDate', v)} />
              </Field>
            )}
            {has('paymentMethod') && (
              <Field label={officialFieldLabel(template, 'paymentMethod')}>
                <ConstrainedSelect value={first.paymentMethod} options={template.lists.paymentMethod || []} onChange={v => setHeader('paymentMethod', v)} />
              </Field>
            )}
            {has('terms') && (
              <Field label={officialFieldLabel(template, 'terms')}>
                <input type="text" value={first.terms || ''} onChange={e => setHeader('terms', e.target.value)} />
              </Field>
            )}
            {has('notes') && (
              <Field label={officialFieldLabel(template, 'notes')}>
                <input type="text" value={first.notes || ''} onChange={e => setHeader('notes', e.target.value)} />
              </Field>
            )}
          </div>

          {template.hasDocDiscount && first.docDiscountValue !== '' && first.docDiscountValue != null && (
            <div className="qii-grid-3" style={{ marginBottom: 14 }}>
              <Field label={officialFieldLabel(template, 'docDiscountValue')}>
                <input type="number" value={first.docDiscountValue ?? ''} onChange={e => setHeader('docDiscountValue', e.target.value === '' ? '' : Number(e.target.value))} />
              </Field>
              <Field label={officialFieldLabel(template, 'docDiscountAccount')}>
                {(template.lists.docDiscountAccount || []).length > 0 ? (
                  <ConstrainedSelect value={first.docDiscountAccount} options={template.lists.docDiscountAccount} onChange={v => setHeader('docDiscountAccount', v)} />
                ) : (
                  <input type="text" value={first.docDiscountAccount || ''} onChange={e => setHeader('docDiscountAccount', e.target.value)} placeholder="اسم/كود حساب الخصم كما في قيود" />
                )}
              </Field>
              <Field label={officialFieldLabel(template, 'docDiscountTax')}>
                <ConstrainedSelect value={first.docDiscountTax} options={template.lists.taxRate || []} onChange={v => setHeader('docDiscountTax', v)} />
              </Field>
            </div>
          )}

          {/* ── البنود ── */}
          <div className="qii-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{officialFieldLabel(template, 'productCode')}<RequiredStar /></th>
                  <th className="n">{officialFieldLabel(template, 'quantity')}<RequiredStar /></th>
                  {template.columns.unitOfConv && <th>{officialFieldLabel(template, 'unitOfConv')}</th>}
                  <th className="n">{officialFieldLabel(template, 'unitPrice')}<RequiredStar /></th>
                  <th>{officialFieldLabel(template, 'taxInclusive')}<RequiredStar /></th>
                  <th className="n">{officialFieldLabel(template, 'discountPct')}</th>
                  <th className="n">{officialFieldLabel(template, 'discountVal')}</th>
                  <th>{officialFieldLabel(template, 'taxRate')}<RequiredStar /></th>
                  <th className="n">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map(r => (
                  <LineRow key={r._meta.sourceRow} row={r} template={template} productOptions={productOptions}
                    lineIssues={group.issues.filter(x => x.sourceRow === r._meta.sourceRow)}
                    onChange={(field, value) => actions.setLineOverride(group.key, r._meta.sourceRow, field, value)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="qii-field">
      <span>{label}{required && <RequiredStar />}</span>
      {children}
    </label>
  );
}

function LineRow({ row, template, productOptions, lineIssues, onChange }) {
  const hasFatal = lineIssues.some(x => x.severity === 'fatal');
  const hasWarn = lineIssues.some(x => x.severity === 'warn');
  const productValue = row.productCode || '';

  return (
    <>
      <tr className={hasFatal ? 'row-stop' : hasWarn ? 'row-warn' : ''}>
        <td style={{ minWidth: 220 }}>
          <ConstrainedSelect value={productValue} options={productOptions} onChange={v => onChange('productCode', v)} placeholder={row.productDesc || '— اختر منتجاً —'} />
        </td>
        <td className="n"><input type="number" step="any" value={row.quantity ?? ''} onChange={e => onChange('quantity', e.target.value === '' ? '' : Number(e.target.value))} style={{ minWidth: 70 }} /></td>
        {template.columns.unitOfConv && (
          <td><ConstrainedSelect value={row.unitOfConv} options={template.lists.unitOfConv || []} onChange={v => onChange('unitOfConv', v)} placeholder="— أساسية —" /></td>
        )}
        <td className="n"><input type="number" step="any" value={row.unitPrice ?? ''} onChange={e => onChange('unitPrice', e.target.value === '' ? '' : Number(e.target.value))} style={{ minWidth: 90 }} /></td>
        <td>
          <select className={row.taxInclusive ? 'set' : 'unset'} value={row.taxInclusive || ''} onChange={e => onChange('taxInclusive', e.target.value)}>
            <option value="">—</option>
            <option value={YES}>{YES}</option>
            <option value={NO}>{NO}</option>
          </select>
        </td>
        <td className="n"><input type="number" step="any" value={row.discountPct ?? ''} onChange={e => onChange('discountPct', e.target.value === '' ? '' : Number(e.target.value))} style={{ minWidth: 70 }} /></td>
        <td className="n"><input type="number" step="any" value={row.discountVal ?? ''} onChange={e => onChange('discountVal', e.target.value === '' ? '' : Number(e.target.value))} style={{ minWidth: 70 }} /></td>
        <td><ConstrainedSelect value={row.taxRate} options={template.lists.taxRate || []} onChange={v => onChange('taxRate', v)} /></td>
        <td className="n mono">{n(row._meta?.expectedTotal)}</td>
      </tr>
      {lineIssues.length > 0 && (
        <tr className={hasFatal ? 'row-stop' : 'row-warn'}>
          <td colSpan={9} style={{ whiteSpace: 'pre-line', fontSize: 12 }}>
            {lineIssues.map((x, k) => <div key={k}>{x.message}</div>)}
          </td>
        </tr>
      )}
    </>
  );
}

/* ═══════════════════════════ مطابقة القيم المتكرِّرة (كما كانت) ═══════════════════════════ */

function PendingMatchSection({ state, actions, openCount }) {
  const [tab, setTab] = useState('customers');
  const { decisions, template, references, pending } = state;

  const tabs = [
    { id: 'customers', label: 'العملاء', open: pending.customers.length },
    { id: 'products',  label: 'المنتجات', open: pending.products.length },
    { id: 'payments',  label: 'طرق الدفع', open: pending.payments.length },
    { id: 'locations', label: 'المواقع', open: pending.locations.length },
  ];

  return (
    <section className="qii-card" style={{ marginTop: 12 }}>
      <Note>
        يجمع كل قيمة من ملف العميل تكرَّرت ولم تُطابَق تلقائياً، وتُطبَّق نتيجة اختيارك هنا على كل ظهور لها دفعة
        واحدة. لتصحيح فاتورة بعينها فقط استخدم تبويب «الفواتير» أعلاه.
      </Note>

      <div className="qii-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`qii-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            <Badge tone={t.open ? 'stop' : 'ok'}>{t.open ? i(t.open) : '✓'}</Badge>
          </button>
        ))}
      </div>

      <div className="qii-card-body">
        {tab === 'customers' && (
          <CustomerTab pending={pending.customers} references={references} decisions={decisions} actions={actions} />
        )}
        {tab === 'products' && (
          <ProductTab pending={pending.products} references={references} decisions={decisions} actions={actions} />
        )}
        {tab === 'payments' && (
          <ListTab
            kind="payments" pending={pending.payments}
            options={template?.lists?.paymentMethod || []}
            decisions={decisions} actions={actions}
            title="طرق الدفع"
            help="قيود يقبل خمس طرق فقط. اربط كل قيمة من نظام العميل بما يقابلها. طريقة الدفع إلزامية إذا كانت المنشأة في المرحلة الثانية من الفوترة الإلكترونية."
            defaultKey="defaultPayment"
            defaultLabel="طريقة الدفع الافتراضية للفواتير بلا قيمة"
          />
        )}
        {tab === 'locations' && (
          <ListTab
            kind="locations" pending={pending.locations}
            options={template?.lists?.location || []}
            decisions={decisions} actions={actions}
            title="المواقع"
            help="المواقع تأتي من حساب العميل عبر القالب. أي قيمة خارج القائمة يرفضها قيود."
            defaultKey="defaultLocation"
            defaultLabel="الموقع الافتراضي للفواتير بلا موقع"
          />
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────── العملاء ─────────────────────────── */

function CustomerTab({ pending, references, decisions, actions }) {
  const customers = references.customers || [];
  const [q, setQ] = useState('');

  const options = useMemo(() => buildCustomerOptions(customers), [customers]);

  // لكل عميل تعذّرت مطابقته باسم مكرر، خياراته تُحصر بالأرقام المرجعية المرتبطة
  // بنفس الاسم فقط — لا كل عملاء قيود — تماشياً مع: «محمد أحمد ← 10025 / 10071 / 10280»
  const optionsFor = p => (p.candidates?.length
    ? p.candidates.map(c => ({ value: c.ref, label: `${c.name || '(بلا اسم)'} — ${c.ref}` }))
    : options);

  return (
    <>
      <Note>
        قيود يطابق العميل بحقل <strong>الرقم المرجعي</strong> لا بالاسم. اختر العميل المقابل من قائمة قيود، أو
        اترك الفواتير بلا عميل على العميل الافتراضي أدناه.
      </Note>

      <label className="qii-field" style={{ maxWidth: 460 }}>
        <span>الرقم المرجعي للعميل الافتراضي — يُستخدم للفواتير التي لا تحمل اسم عميل</span>
        <input
          type="text"
          value={decisions.customers?.[''] || ''}
          placeholder="مثال: CASH-001"
          onChange={e => actions.decide('customers', '', e.target.value)}
        />
      </label>

      {pending.length === 0
        ? <div className="qii-empty">كل عملاء الملف مطابقون ✓</div>
        : (
          <>
            <input
              type="text" placeholder="ابحث في القيم غير المطابقة…"
              value={q} onChange={e => setQ(e.target.value)}
              style={{ maxWidth: 320, marginBottom: 12 }}
            />
            <MatchTable
              rows={pending.filter(p => !q || p.label.includes(q))}
              optionsFor={optionsFor}
              valueOf={p => decisions.customers?.[p.key] || ''}
              onChange={(p, v) => actions.decide('customers', p.key, v)}
              headers={['اسم العميل في المصدر', 'فواتير', 'السبب', 'العميل في قيود']}
            />
          </>
        )}
    </>
  );
}

/* ─────────────────────────── المنتجات ─────────────────────────── */

function ProductTab({ pending, references, decisions, actions }) {
  const products = references.products || [];
  const [q, setQ] = useState('');

  const options = useMemo(() => buildProductOptions(products), [products]);

  return (
    <>
      <Note>
        كل بند يحتاج منتجاً موجوداً في قيود. الرسوم مثل الشحن والدفع عند الاستلام تحتاج منتجات خدمية
        مضافة مسبقاً في حساب العميل.
      </Note>

      {pending.length === 0
        ? <div className="qii-empty">كل منتجات الملف مطابقة ✓</div>
        : (
          <>
            <input
              type="text" placeholder="ابحث في القيم غير المطابقة…"
              value={q} onChange={e => setQ(e.target.value)}
              style={{ maxWidth: 320, marginBottom: 12 }}
            />
            <MatchTable
              rows={pending.filter(p => !q || p.label.includes(q) || (p.sku || '').includes(q))}
              options={options}
              valueOf={p => decisions.products?.[p.key] || ''}
              onChange={(p, v) => actions.decide('products', p.key, v)}
              headers={['المنتج في المصدر', 'بنود', 'السبب', 'المنتج في قيود']}
            />
          </>
        )}
    </>
  );
}

/* ─────────────────── القوائم المعتمدة: دفع / مواقع ─────────────────── */

function ListTab({ kind, pending, options, decisions, actions, help, defaultKey, defaultLabel }) {
  const opts = options.map(o => ({ value: o, label: o }));
  const [bulkValue, setBulkValue] = useState('');

  return (
    <>
      <Note>{help}</Note>

      <label className="qii-field" style={{ maxWidth: 460 }}>
        <span>{defaultLabel}</span>
        <select
          className={decisions[defaultKey] ? 'set' : 'unset'}
          value={decisions[defaultKey] || ''}
          onChange={e => actions.setDefault(defaultKey, e.target.value)}
        >
          <option value="">— بدون قيمة افتراضية —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>

      {pending.length === 0
        ? <div className="qii-empty">كل القيم مطابقة ✓</div>
        : (
          <>
            <div className="qii-field" style={{ maxWidth: 460, display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 14 }}>
              <label style={{ flex: 1 }}>
                <span>تطبيق قيمة واحدة على كل الفواتير المعلّقة أدناه دفعة واحدة</span>
                <select value={bulkValue} onChange={e => setBulkValue(e.target.value)}>
                  <option value="">— اختر قيمة —</option>
                  {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <button
                type="button" className="qii-btn sm"
                disabled={!bulkValue}
                onClick={() => actions.decideAll(kind, bulkValue)}
              >
                تطبيق على الكل
              </button>
            </div>

            <MatchTable
              rows={pending}
              options={opts}
              valueOf={p => decisions[kind]?.[p.key] || ''}
              onChange={(p, v) => actions.decide(kind, p.key, v)}
              headers={['القيمة في المصدر', 'فواتير', 'السبب', 'القيمة في قيود']}
            />
          </>
        )}
    </>
  );
}

/* ─────────────────────────── الجدول المشترك ─────────────────────────── */

function MatchTable({ rows, options, optionsFor, valueOf, onChange, headers }) {
  return (
    <div className="qii-table-wrap">
      <table>
        <thead>
          <tr>
            <th>{headers[0]}</th>
            <th className="n">{headers[1]}</th>
            <th>{headers[2]}</th>
            <th style={{ minWidth: 300 }}>{headers[3]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => {
            const v = valueOf(p);
            const rowOptions = optionsFor ? optionsFor(p) : options;
            return (
              <tr key={p.key} className={v ? 'row-ok' : 'row-stop'}>
                <td>
                  <span className="qii-truncate" title={p.label}>{p.label}</span>
                  {p.sku && <div className="mono" style={{ fontSize: 11.5, color: 'var(--qii-ink-3)' }}>{p.sku}</div>}
                </td>
                <td className="n">{i(p.count)}</td>
                <td style={{ fontSize: 12.5, color: 'var(--qii-ink-3)' }}>{p.reason}</td>
                <td>
                  <select className={v ? 'set' : 'unset'} value={v} onChange={e => onChange(p, e.target.value)}>
                    <option value="">— اختر —</option>
                    {rowOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
