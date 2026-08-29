import React, { useState } from 'react';
import { Card, FileDrop, Note, Stat, ColumnSelect, Badge, MappingGrid, i, n } from './ui.jsx';
import { SOURCE_FIELD_ALIASES } from '../engine/parseSource.js';

const FIELD_LABELS = {
  invoiceNumber: 'رقم الفاتورة / المرجع',
  lineType:      'نوع السطر (اختياري)',
  date:          'تاريخ الإصدار',
  sellType:      'نوع العملية (بيع / مرتجع)',
  customerName:  'اسم العميل',
  customerRef:   'الرقم المرجعي للعميل',
  location:      'الموقع',
  channel:       'القناة',
  sku:           'رمز المنتج / الباركود',
  details:       'وصف المنتج',
  quantity:      'الكمية',
  subtotalEx:    'المبلغ قبل الضريبة',
  discount:      'الخصم',
  totalTax:      'إجمالي الضريبة',
  totalInc:      'الإجمالي شامل الضريبة',
  paymentMethod: 'طريقة الدفع',
  paidAmount:    'المبلغ المدفوع',
  vat:           'ضريبة القيمة المضافة',
  otherTaxes:    'ضرائب أخرى',
  dueDate:       'تاريخ الاستحقاق',
  supplyDate:    'تاريخ التوريد',
  terms:         'الشروط والأحكام',
  notes:         'الملاحظات',
  docDiscountValue: 'خصم إجمالي المستند',
  unit:          'الوحدة',
  unitPriceExplicit: 'سعر الوحدة (كما ورد في ملف العميل)',
  discountPctExplicit: 'نسبة الخصم (كما وردت في ملف العميل)',
  taxInclusiveFlag: 'شامل الضريبة؟ (كما ورد في ملف العميل)',
};

// «نوع السطر» لم يعد إلزامياً: بوجوده تُعامَل الملف كملف منظَّم (رأس/بند/دفع)
// كما كان دائماً؛ بغيابه تُعامَل كل صفوفه كبنود منتجات وتُجمَّع بالمرجع وحده
const REQUIRED = ['invoiceNumber', 'quantity', 'subtotalEx', 'totalInc', 'totalTax', 'date'];
const IMPORTANT = ['lineType', 'sellType', 'customerName', 'customerRef', 'location', 'sku', 'details', 'discount', 'paymentMethod'];
const OPTIONAL = [
  'channel', 'paidAmount', 'vat', 'otherTaxes', 'dueDate', 'supplyDate', 'terms', 'notes',
  'docDiscountValue', 'unit', 'unitPriceExplicit', 'discountPctExplicit', 'taxInclusiveFlag',
];

/**
 * الخطوة 2 — ملف العميل وربط أعمدته.
 *
 * الربط حر بالكامل: الأداة تكتشف الأعمدة تلقائياً ثم تترك التصحيح للمستخدم،
 * حتى تعمل مع أي مصدر لا مع تصدير واحد بعينه.
 */
// نفس تجربة مرحلة المطابقة في أداة استيراد فواتير المشتريات: أقسام الحقول تُبنى
// من نفس تعريف REQUIRED/IMPORTANT/OPTIONAL بلا تكرار، لتغذية كلاً من عرض الأعمدة
// المجمّع بالحقل واختيار الحقل لكل عمود في الشبكة
const FIELD_GROUPS = [
  { title: 'حقول أساسية', fields: REQUIRED, required: true },
  { title: 'حقول مهمة', fields: IMPORTANT },
  { title: 'حقول اختيارية', fields: OPTIONAL },
].map(g => ({ title: g.title, fields: g.fields.map(f => ({ key: f, label: FIELD_LABELS[f] || f, required: g.required })) }));

export default function Step2Source({ state, actions }) {
  const { sourceFile, sourceRaw, sourceHeaders, sourceMapping, parsed } = state;
  const missing = REQUIRED.filter(f => !sourceMapping[f]);
  const [view, setView] = useState('grid');

  const assignColumn = (header, newField) => {
    const prevField = Object.keys(sourceMapping).find(f => sourceMapping[f] === header);
    if (prevField && prevField !== newField) actions.setSourceMapping(prevField, '');
    if (newField) actions.setSourceMapping(newField, header);
  };

  return (
    <>
      <h1 className="qii-page-title">ملف العميل</h1>
      <p className="qii-page-sub">ارفع ملف الفواتير كما استلمته، وصحّح ربط الأعمدة إن لزم.</p>

      <Card title="الملف">
        <FileDrop
          label="اسحب ملف فواتير العميل هنا"
          hint="xlsx أو csv"
          accept=".xlsx,.csv"
          file={sourceFile}
          onFile={f => actions.loadSource(f)}
        />
      </Card>

      {sourceHeaders && (
        <Card
          title="ربط الأعمدة"
          aside={missing.length
            ? <Badge tone="stop">{i(missing.length)} حقل أساسي ناقص</Badge>
            : <Badge tone="ok">الحقول الأساسية مكتملة</Badge>}
        >
          <Note>
            <strong>رقم الفاتورة</strong> هو أساس تجميع الصفوف: كل الصفوف التي تحمل نفس الرقم فاتورة واحدة.
            إن وُجد عمود <strong>نوع السطر</strong> (رأس/بند/دفع) يُستخدم لتمييز صف الرأس عن صفوف البنود كما
            في ملفات نقاط البيع المنظَّمة. إن غاب، تُعامَل كل الصفوف كبنود منتجات، وبيانات الفاتورة (العميل
            والتاريخ والموقع...) تُقرأ من كل صف وتُوفَّق تلقائياً — مناسب لملفات العملاء غير المنظَّمة.
            الربط الذكي مبدئي دائماً — راجعه أدناه وصحّح أي عمود غير صحيح قبل المتابعة.
          </Note>

          <div className="qii-tabs" style={{ margin: '0 0 14px', padding: 0, border: 0, background: 'transparent' }}>
            <button className={`qii-tab${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')}>
              شبكة الأعمدة على البيانات
            </button>
            <button className={`qii-tab${view === 'fields' ? ' active' : ''}`} onClick={() => setView('fields')}>
              حسب الحقل
            </button>
          </div>

          {view === 'grid'
            ? (
              <MappingGrid
                headers={sourceHeaders}
                sampleRows={(sourceRaw?.records || []).slice(0, 8)}
                fieldGroups={FIELD_GROUPS}
                mapping={sourceMapping}
                onAssign={assignColumn}
              />
            )
            : (
              <>
                <FieldGroup title="حقول أساسية" fields={REQUIRED} {...{ sourceHeaders, sourceMapping, actions }} />
                <FieldGroup title="حقول مهمة" fields={IMPORTANT} {...{ sourceHeaders, sourceMapping, actions }} />
                <FieldGroup title="حقول اختيارية" fields={OPTIONAL} {...{ sourceHeaders, sourceMapping, actions }} />
              </>
            )}
        </Card>
      )}

      {parsed && (
        <Card title="نتيجة التفكيك">
          <div className="qii-grid-3">
            <Stat k="صفوف الملف" v={i(parsed.stats.totalRows)} />
            <Stat k="فواتير مبيعات" v={i(parsed.stats.salesInvoices)} tone="ok" />
            <Stat k="بنود المبيعات" v={i(parsed.stats.salesLines)} />
            <Stat k="فواتير مرتجعات" v={i(parsed.stats.returnInvoices)} tone="warn" />
            <Stat k="بنود المرتجعات" v={i(parsed.stats.returnLines)} tone="warn" />
            <Stat
              k="إجمالي المبيعات"
              v={n(parsed.sales.reduce((s, x) => s + x.sourceTotalInclusive, 0))}
            />
          </div>

          {parsed.stats.returnInvoices > 0 && (
            <Note tone="warn">
              فُصلت <strong>{i(parsed.stats.returnInvoices)}</strong> فاتورة مرتجع ولن تُدرج في ملف الاستيراد.
              المرتجعات ليست فواتير مبيعات، ولها مسار مستقل في قيود. تنزّل في ملف منفصل عند التصدير.
            </Note>
          )}

          {parsed.issues.length > 0 && (
            <IssueSummary issues={parsed.issues} />
          )}
        </Card>
      )}
    </>
  );
}

function FieldGroup({ title, fields, sourceHeaders, sourceMapping, actions }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}>{title}</div>
      <div className="qii-grid-3">
        {fields.map(f => (
          <label className="qii-field" key={f}>
            <span>{FIELD_LABELS[f] || f}</span>
            <ColumnSelect
              value={sourceMapping[f]}
              options={sourceHeaders}
              onChange={v => actions.setSourceMapping(f, v)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function IssueSummary({ issues }) {
  const grouped = new Map();
  for (const x of issues) {
    if (!grouped.has(x.code)) grouped.set(x.code, { code: x.code, severity: x.severity, count: 0, sample: x.message });
    grouped.get(x.code).count++;
  }
  const list = [...grouped.values()].sort((a, b) => (a.severity === 'fatal' ? -1 : 1) - (b.severity === 'fatal' ? -1 : 1));

  return (
    <div className="qii-table-wrap" style={{ marginTop: 14 }}>
      <table>
        <thead>
          <tr><th>الخطورة</th><th className="n">العدد</th><th>الملاحظة</th></tr>
        </thead>
        <tbody>
          {list.map(g => (
            <tr key={g.code} className={g.severity === 'fatal' ? 'row-stop' : 'row-warn'}>
              <td><Badge tone={g.severity === 'fatal' ? 'stop' : 'warn'}>{g.severity === 'fatal' ? 'فادح' : 'تحذير'}</Badge></td>
              <td className="n">{i(g.count)}</td>
              <td>{g.sample}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
