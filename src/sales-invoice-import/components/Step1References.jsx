import React from 'react';
import { Card, FileDrop, Note, Stat, ColumnSelect, Badge, i } from './ui.jsx';

/**
 * الخطوة 1 — المراجع.
 *
 * تُرفع قبل أي شيء لأن كل ما بعدها يعتمد عليها: القوائم المعتمدة تأتي من
 * القالب المنزَّل من حساب العميل نفسه، والمطابقة تحتاج ملفي العملاء والمنتجات.
 */
export default function Step1References({ state, actions }) {
  const {
    template, templateFile, customersFile, productsFile, references, refMapping, refHeaders,
    locationStockFile, locationStockInfo,
  } = state;

  return (
    <>
      <h1 className="qii-page-title">المراجع</h1>
      <p className="qii-page-sub">
        ارفع قالب قيود وملفي العملاء والمنتجات. الأداة تبني كل عمليات التحقق على هذه الملفات، لا على قيم مخزّنة مسبقاً.
      </p>

      <Card title="قالب قيود الرسمي" aside={template ? <Badge tone="ok">مقروء</Badge> : <Badge tone="stop">مطلوب</Badge>}>
        <Note>
          نزّل القالب من <strong>المبيعات ← فواتير المبيعات ← استيراد</strong> في حساب العميل نفسه.
          القوائم المنسدلة (المواقع والضرائب وطرق الدفع) تختلف بين الحسابات، وقيود يوقف الاستيراد إذا بُني الملف على نموذج قديم.
        </Note>

        <FileDrop
          label="اسحب قالب قيود هنا أو اضغط للاختيار"
          hint="ملف xlsx يحتوي على ورقة Invoice Upload Template"
          accept=".xlsx"
          file={templateFile}
          onFile={f => actions.loadTemplate(f)}
        />

        {template && (
          <>
            <div className="qii-grid-3" style={{ marginTop: 14 }}>
              <Stat k="أعمدة القالب" v={i(template.columnCount)} />
              <Stat
                k="أعمدة تعرّفت عليها الأداة"
                v={i(Object.keys(template.columns).length)}
                tone={template.missing.length ? 'stop' : 'ok'}
              />
              <Stat
                k="خصم المستند"
                v={template.hasDocDiscount ? 'مفعّل' : 'غير مفعّل'}
                tone={template.hasDocDiscount ? 'warn' : undefined}
              />
            </div>

            {template.missing.length > 0 && (
              <Note tone="stop">
                أعمدة إلزامية لم تُوجد في القالب: {template.missing.join(' · ')} —
                تأكد أنه قالب استيراد فواتير المبيعات وليس قالباً آخر.
              </Note>
            )}

            {template.unmapped.length > 0 && (
              <Note tone="warn">
                أعمدة غير معروفة للأداة وستُترك فارغة: {template.unmapped.map(u => u.header).join(' · ')}
              </Note>
            )}

            <div className="qii-grid-2" style={{ marginTop: 12 }}>
              <ListPreview title="المواقع" values={template.lists.location} />
              <ListPreview title="الضرائب" values={template.lists.taxRate} />
              <ListPreview title="طرق الدفع" values={template.lists.paymentMethod} />
              <ListPreview title="وحدات التحويل" values={template.lists.unitOfConv} />
            </div>

            <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '10px 0 0' }}>
              الأعمدة تُعرَّف بأسمائها لا بمواقعها، والقوائم تُقرأ من قيود التحقق داخل القالب نفسه —
              فأي عمود يضيفه قيود مستقبلاً أو أي اختلاف بين حسابات العملاء لا يكسر الأداة.
            </p>
          </>
        )}
      </Card>

      <Card
        title="ملف العملاء"
        aside={references.customers?.length
          ? <Badge tone="ok">{i(references.customers.length)} عميل</Badge>
          : <Badge tone="stop">مطلوب</Badge>}
      >
        <Note>
          قيود يطابق العميل بحقل <strong>الرقم المرجعي</strong> في سجل العميل، لا باسمه — وهذا أكثر أسباب فشل الاستيراد.
          صدّر قائمة العملاء من قيود وارفعها هنا.
        </Note>

        <FileDrop
          label="اسحب ملف العملاء هنا"
          hint="xlsx أو csv — يحتاج عمود الاسم وعمود الرقم المرجعي"
          accept=".xlsx,.csv"
          file={customersFile}
          onFile={f => actions.loadReference(f, 'customers')}
        />

        {refHeaders.customers && (
          <div className="qii-grid-2" style={{ marginTop: 14 }}>
            <label className="qii-field">
              <span>عمود اسم العميل</span>
              <ColumnSelect
                value={refMapping.customers.name}
                options={refHeaders.customers}
                onChange={v => actions.setRefMapping('customers', 'name', v)}
              />
            </label>
            <label className="qii-field">
              <span>عمود الرقم المرجعي</span>
              <ColumnSelect
                value={refMapping.customers.ref}
                options={refHeaders.customers}
                onChange={v => actions.setRefMapping('customers', 'ref', v)}
              />
            </label>
          </div>
        )}
      </Card>

      <Card
        title="ملف المنتجات"
        aside={references.products?.length
          ? <Badge tone="ok">{i(references.products.length)} منتج</Badge>
          : <Badge tone="stop">مطلوب</Badge>}
      >
        <Note>
          يُستخدم لأمرين: التأكد أن كل منتج في ملف العميل موجود فعلاً في قيود، والتأكد أن الكمية المتاحة تكفي.
          قيود يرفض الفاتورة كاملة إذا لم تكفِ كمية منتج مخزَّن.
        </Note>

        <FileDrop
          label="اسحب ملف المنتجات هنا"
          hint="xlsx أو csv — يحتاج الرمز أو الباركود، والاسم، والكمية المتاحة"
          accept=".xlsx,.csv"
          file={productsFile}
          onFile={f => actions.loadReference(f, 'products')}
        />

        {refHeaders.products && (
          <>
            <div className="qii-grid-3" style={{ marginTop: 14 }}>
              <label className="qii-field">
                <span>عمود الرقم التسلسلي</span>
                <ColumnSelect
                  value={refMapping.products.code}
                  options={refHeaders.products}
                  onChange={v => actions.setRefMapping('products', 'code', v)}
                />
              </label>
              <label className="qii-field">
                <span>عمود الباركود</span>
                <ColumnSelect
                  value={refMapping.products.barcode}
                  options={refHeaders.products}
                  onChange={v => actions.setRefMapping('products', 'barcode', v)}
                />
              </label>
              <label className="qii-field">
                <span>عمود اسم المنتج</span>
                <ColumnSelect
                  value={refMapping.products.name}
                  options={refHeaders.products}
                  onChange={v => actions.setRefMapping('products', 'name', v)}
                />
              </label>
              <label className="qii-field">
                <span>عمود «هل المنتج مخزون؟»</span>
                <ColumnSelect
                  value={refMapping.products.tracked}
                  options={refHeaders.products}
                  onChange={v => actions.setRefMapping('products', 'tracked', v)}
                />
              </label>
              <label className="qii-field">
                <span>عمود الكمية المتاحة</span>
                <ColumnSelect
                  value={refMapping.products.stock}
                  options={refHeaders.products}
                  onChange={v => actions.setRefMapping('products', 'stock', v)}
                />
              </label>
              <label className="qii-field">
                <span>عمود «هل المنتج يُباع؟»</span>
                <ColumnSelect
                  value={refMapping.products.sellable}
                  options={refHeaders.products}
                  onChange={v => actions.setRefMapping('products', 'sellable', v)}
                />
              </label>
            </div>

            <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '0 0 12px' }}>
              الرقم التسلسلي والباركود كلاهما مقبول في عمود المنتج بقالب الفواتير، فتُفهرس القيمتان معاً.
              أي منتج تُحدَّد قيمة «لا» صراحةً في عمود «هل المنتج يُباع؟» يُستبعد نهائياً من كل مطابقة أو
              اقتراح بديل. اترك أي عمود فارغاً إن لم يكن موجوداً في ملفك.
            </p>
          </>
        )}

        {references.products?.length > 0 && (
          <>
            <div className="qii-grid-3">
              <Stat k="منتجات مقروءة" v={i(references.products.length)} />
              <Stat k="لها باركود" v={i(references.products.filter(p => p.barcode).length)} />
              <Stat
                k="لها كمية معروفة"
                v={i(references.products.filter(p => p.stockKnown).length)}
                tone={references.products.some(p => p.stockKnown) ? 'ok' : 'warn'}
              />
              {refMapping.products.sellable && (
                <Stat
                  k="غير مسموح ببيعها (مستبعدة)"
                  v={i(references.products.filter(p => p.sellable === false).length)}
                />
              )}
            </div>

            {!references.products.some(p => p.stockKnown) && !locationStockFile && (
              <Note tone="warn">
                لا يوجد عمود كمية متاحة في هذا الملف، وقوالب رفع المنتجات في قيود لا تحمله أصلاً.
                <strong> فحص الكميات معطّل.</strong> المطابقة بالرمز والباركود تعمل كالمعتاد، لكن قيود سيرفض
                أي فاتورة لا تكفي كمية أحد منتجاتها المخزَّنة. لتفعيل الفحص، ارفع ملف جرد أو تقرير أرصدة
                يحتوي عمود الكمية أدناه (ملف كميات المواقع)، أو أضف عمود الكمية هنا.
              </Note>
            )}
          </>
        )}
      </Card>

      <Card
        title="ملف كميات المنتجات حسب المواقع (اختياري)"
        aside={locationStockInfo ? <Badge tone="ok">{i(locationStockInfo.count)} منتج</Badge> : <Badge tone="info">اختياري</Badge>}
      >
        <Note>
          يحدد الكمية المتوفرة من كل منتج في كل موقع — عمود أو أكثر لتعريف المنتج (الرقم التسلسلي/الباركود/الاسم)،
          وبقية الأعمدة كل واحد منها موقع. أعمدة المواقع تُكتشف تلقائياً من رؤوس الملف. عند رفعه، يفحص التصدير
          كفاية الكمية في موقع كل فاتورة تحديداً بدل رصيد عالمي واحد.
        </Note>

        <FileDrop
          label="اسحب ملف كميات المواقع هنا"
          hint="xlsx أو csv"
          accept=".xlsx,.csv"
          file={locationStockFile}
          onFile={f => actions.loadLocationStock(f)}
        />

        {locationStockInfo && (
          <>
            <div className="qii-grid-3" style={{ marginTop: 14 }}>
              <Stat k="منتجات مقروءة" v={i(locationStockInfo.count)} />
              <Stat k="مواقع مكتشَفة" v={i(locationStockInfo.locationColumns.length)} />
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '10px 0 0' }}>
              المواقع المكتشَفة: {locationStockInfo.locationColumns.join(' · ') || '—'}
            </p>
            <button type="button" className="qii-btn ghost sm" style={{ marginTop: 10 }} onClick={actions.clearLocationStock}>
              إزالة الملف
            </button>
          </>
        )}
      </Card>
    </>
  );
}

function ListPreview({ title, values }) {
  return (
    <div className="qii-stat">
      <div className="qii-stat-k">{title} · {values?.length || 0}</div>
      <div style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.7 }}>
        {(values || []).map(v => <div key={v}>{v}</div>)}
        {!values?.length && <span style={{ color: 'var(--ink-3)' }}>لا يوجد عمود لهذه القائمة في القالب</span>}
      </div>
    </div>
  );
}
