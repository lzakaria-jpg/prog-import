import React, { useState } from 'react';
import { Card, Note, Badge, Stat, i, n } from './ui.jsx';

/**
 * الخطوة 4 — التحقق.
 *
 * يفصل بين نافذتين على نفس البيانات: الملاحظات، الكميات. الفصل مقصود لأن كلاً
 * منهما يُقرأ بطريقة مختلفة ويقود إلى إجراء مختلف.
 *
 * إجمالي الفاتورة المعتمد الوحيد هو مجموع بنودها؛ إجمالي المصدر — إن وُجد عمود
 * مجمَّع له في الملف — لا يُقارَن به إطلاقاً، ولا يُنتج عنه أي تحذير أو خطأ ولا
 * يؤثر على حالة الفاتورة أو نتيجة المراجعة، مهما بلغ الفرق بينهما.
 */
export default function Step4Validate({ state }) {
  const [tab, setTab] = useState('issues');
  const { result } = state;

  if (!result) return <div className="qii-empty">أكمل الخطوات السابقة لبدء التحقق</div>;

  const { validation, stock, notes } = result;
  const shortages = stock.filter(s => s.status === 'insufficient');
  const unknown = stock.filter(s => s.status === 'unknown_product');

  return (
    <>
      <h1 className="qii-page-title">التحقق</h1>
      <p className="qii-page-sub">طبقات فحص على الصفوف المُحوَّلة قبل التصدير.</p>

      <div className="qii-grid-3" style={{ marginBottom: 16 }}>
        <Stat k="أخطاء فادحة" v={i(validation.fatal.length)} tone={validation.fatal.length ? 'stop' : 'ok'} />
        <Stat k="تحذيرات" v={i(validation.warn.length + notes.length)} tone="warn" />
        <Stat k="نقص كميات" v={i(shortages.length)} tone={shortages.length ? 'stop' : 'ok'} />
      </div>

      {validation.fatal.length === 0
        ? <Note tone="ok">لا توجد أخطاء فادحة. الملف جاهز للتصدير.</Note>
        : <Note tone="stop">
            <strong>{i(validation.fatal.length)}</strong> خطأ فادح يمنع التصدير. عالجها من شاشة المطابقة أو صحّح ملف المصدر.
          </Note>}

      <section className="qii-card">
        <div className="qii-tabs">
          <Tab id="issues" tab={tab} setTab={setTab} label="الملاحظات" count={validation.issues.length + notes.length} />
          <Tab id="stock" tab={tab} setTab={setTab} label="الكميات" count={stock.length} />
        </div>
        <div className="qii-card-body tight">
          {tab === 'issues' && <IssuesTable issues={[...validation.issues, ...notes]} />}
          {tab === 'stock' && <StockTable rows={stock} />}
        </div>
      </section>
    </>
  );
}

function Tab({ id, tab, setTab, label, count }) {
  return (
    <button className={`qii-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
      {label} <Badge>{i(count)}</Badge>
    </button>
  );
}

function IssuesTable({ issues }) {
  const [only, setOnly] = useState('all');
  const filtered = issues.filter(x => only === 'all' || x.severity === only);
  const order = { fatal: 0, warn: 1 };
  const sorted = [...filtered].sort((a, b) => order[a.severity] - order[b.severity]);

  if (!issues.length) return <div className="qii-empty">لا ملاحظات</div>;

  return (
    <>
      <div style={{ padding: '12px 18px', display: 'flex', gap: 8 }}>
        {[['all', 'الكل'], ['fatal', 'فادح'], ['warn', 'تحذير']].map(([v, l]) => (
          <button key={v} className={`qii-btn sm${only === v ? ' primary' : ''}`} onClick={() => setOnly(v)}>{l}</button>
        ))}
      </div>
      <div className="qii-table-wrap">
        <table>
          <thead>
            <tr><th>الخطورة</th><th>الفاتورة</th><th className="n">صف المصدر</th><th>الملاحظة</th></tr>
          </thead>
          <tbody>
            {sorted.slice(0, 500).map((x, k) => (
              <tr key={k} className={x.severity === 'fatal' ? 'row-stop' : ''}>
                <td><Badge tone={x.severity === 'fatal' ? 'stop' : 'warn'}>{x.severity === 'fatal' ? 'فادح' : 'تحذير'}</Badge></td>
                <td className="mono">{x.invoiceRef || '—'}</td>
                <td className="n">{x.sourceRow ?? '—'}</td>
                <td style={{ whiteSpace: 'pre-line' }}>{x.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > 500 && (
        <div style={{ padding: '10px 18px', fontSize: 12.5, color: 'var(--ink-3)' }}>
          معروض 500 من {i(sorted.length)} — التقرير الكامل في ملف التحقق عند التصدير.
        </div>
      )}
    </>
  );
}

function StockTable({ rows }) {
  const [only, setOnly] = useState('problem');
  const label = { ok: 'كافية', insufficient: 'نقص', not_tracked: 'غير مخزَّن', stock_unknown: 'رصيد غير معروف', unknown_product: 'غير موجود في قيود' };
  const tone = { ok: 'ok', insufficient: 'stop', not_tracked: 'info', stock_unknown: 'warn', unknown_product: 'stop' };

  const list = only === 'problem'
    ? rows.filter(r => r.status === 'insufficient' || r.status === 'unknown_product')
    : rows;

  if (!rows.length) return <div className="qii-empty">فحص الكميات معطّل — ملف المنتجات لا يحتوي عمود كمية متاحة</div>;

  return (
    <>
      <div style={{ padding: '12px 18px', display: 'flex', gap: 8 }}>
        {[['problem', 'المشكلات فقط'], ['all', 'كل المنتجات']].map(([v, l]) => (
          <button key={v} className={`qii-btn sm${only === v ? ' primary' : ''}`} onClick={() => setOnly(v)}>{l}</button>
        ))}
      </div>
      {list.length === 0
        ? <div className="qii-empty">كل الكميات كافية ✓</div>
        : (
          <div className="qii-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الرمز</th><th>الاسم</th><th>الموقع</th>
                  <th className="n">المطلوب</th><th className="n">المتاح (الأصلي)</th><th className="n">النقص</th>
                  <th className="n">فواتير</th><th>الحالة</th><th>الفواتير الناقصة</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 500).map(p => (
                  <tr key={`${p.code}::${p.location}`} className={p.status === 'insufficient' || p.status === 'unknown_product' ? 'row-stop' : ''}>
                    <td className="mono">{p.code}</td>
                    <td><span className="qii-truncate" title={p.name}>{p.name || '—'}</span></td>
                    <td>{p.location || '—'}</td>
                    <td className="n">{n(p.required, 0)}</td>
                    <td className="n">{p.available === null ? '—' : n(p.available, 0)}</td>
                    <td className="n">{p.shortage ? n(p.shortage, 0) : '—'}</td>
                    <td className="n">{i(p.invoiceCount)}</td>
                    <td><Badge tone={tone[p.status]}>{label[p.status]}</Badge></td>
                    <td style={{ fontSize: 12 }}>
                      {p.insufficientInvoices?.length
                        ? p.insufficientInvoices.map((ref, idx) => {
                          const b = p.breakdown?.find(x => x.invoiceRef === ref);
                          return (
                            <div key={ref} className="mono">
                              {ref}{b ? ` — طلبت ${n(b.requested, 0)} والمتاح وقتها ${n(b.availableBefore, 0)}` : ''}
                            </div>
                          );
                        })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </>
  );
}
