import { useMemo } from 'react';
import { useLanguage } from '../../language.jsx';
import { fmtDate, toDate, num, norm } from '../lib/text.js';
import { isBuyable, findProdBySku, buildVendorIndex, buildProductIndex } from '../lib/matching.js';
import { rowErr, rowWarn } from '../lib/validation.js';
import { useTableVirtualization } from '../../lib/useTableVirtualization.js';
import { SafeInput } from '../../lib/SafeInput.jsx';

const COLS = [
  { ar: '#', en: '#' }, { ar: 'مرجع الفاتورة', en: 'Invoice ref' }, { ar: 'المورد', en: 'Vendor' },
  { ar: 'تاريخ الإصدار', en: 'Issue date' }, { ar: 'الاستحقاق', en: 'Due' }, { ar: 'التوريد', en: 'Supply' },
  { ar: 'الموقع', en: 'Location' }, { ar: 'المنتج', en: 'Product' }, { ar: 'الكمية', en: 'Quantity' },
  { ar: 'وحدة التحويل', en: 'Conversion unit' }, { ar: 'سعر الوحدة', en: 'Unit price' }, { ar: 'إجمالي البند', en: 'Line total' },
  { ar: 'شامل؟', en: 'Incl.?' }, { ar: 'خصم %', en: 'Disc. %' }, { ar: 'خصم قيمة', en: 'Disc. amount' },
  { ar: 'الضريبة', en: 'Tax' }, { ar: 'الملاحظات', en: 'Notes' }
];

/**
 * جدول المراجعة: كل خانة قابلة للتعديل، والملاحظات تُعاد حسابها فور أي تغيير.
 *
 * ⚠️ نافذة تمرير (virtualization): بلا هذا كان الجدول يُنشئ عناصر DOM حيّة (input/select)
 * لكل خلية من كل صف دفعة واحدة — 17 عموداً × حتى 5000 صف (حد قيود الأقصى للاستيراد) يعني
 * عشرات آلاف عناصر DOM، نفس نمط تعليق/انهيار المتصفح الحقيقي الذي شهده المستخدم بأداة
 * فواتير المبيعات مع ملفات كبيرة. الحل نفسه هنا (مستخرَج بـsrc/lib/useTableVirtualization.js
 * من نفس منطق InvoiceGrid.jsx المُختبَر فعلياً): لا نعرض إلا الصفوف الظاهرة + هامش احتياطي.
 *
 * وفهرسة الموردين/المنتجات (buildVendorIndex/buildProductIndex) هنا بدل .find() لكل صف
 * بكل رسم — كانت تُعاد كل صف بكل render (حتى الصفوف غير المتغيّرة)، فتتضاعف مع حجم الملف.
 */
export default function ReviewTable({ eng, filter, propagate }) {
  const { t } = useLanguage();
  const list = eng.rows.filter((r) => (filter === 'all' ? true : filter === 'err' ? rowErr(r) : r.issues.length > 0));
  const buyable = eng.catalog.products.filter(isBuyable);
  const vendorIdx = useMemo(() => buildVendorIndex(eng.catalog.vendors), [eng.catalog.vendors]);
  const productIdx = useMemo(() => buildProductIndex(eng.catalog.products), [eng.catalog.products]);
  const vt = useTableVirtualization(list.length);
  const visibleList = vt.shouldVirtualize ? list.slice(vt.startIndex, vt.endIndex) : list;

  const txt = (row, key) => (
    <SafeInput value={row[key] ?? ''} onChange={(e) => eng.updateRow(row, { [key]: e.target.value })} />
  );
  const nmb = (row, key) => (
    <SafeInput value={row[key] ?? ''} onChange={(e) => eng.updateRow(row, { [key]: num(e.target.value) })} />
  );
  const dte = (row, key) => (
    <SafeInput placeholder={t({ ar: 'يوم/شهر/سنة', en: 'DD/MM/YYYY' })} value={fmtDate(row[key])}
      onChange={(e) => eng.updateRow(row, { [key]: toDate(e.target.value) })} />
  );

  return (
    <div className="qbi-scroll" ref={vt.scrollRef}>
      <table className="qbi-rows">
        <thead><tr>{COLS.map((c, ci) => <th key={ci}>{t(c)}</th>)}</tr></thead>
        <tbody>
          {vt.shouldVirtualize && vt.topSpacerHeight > 0 && (
            <tr aria-hidden="true"><td colSpan={COLS.length} style={{ height: vt.topSpacerHeight, padding: 0, border: 'none' }} /></tr>
          )}
          {visibleList.map((row, i) => {
            const vendor = vendorIdx.refMap.get(norm(row.vendorRef));
            const prod = findProdBySku(eng.catalog.products, row.prodSku, productIdx);
            const prodCands = row.prodCands.filter(isBuyable);
            return (
              <tr key={`${row.i}-${vt.startIndex + i}`} ref={i === 0 ? vt.measuredRowRef : undefined}
                className={rowErr(row) ? 'r-err' : rowWarn(row) ? 'r-warn' : ''}>
                <td>{row.i}</td>
                <td>{txt(row, 'ref')}</td>
                <td>
                  {row.vendorCands.length > 1 && !row.vendorRef ? (
                    <select value="" onChange={(e) => eng.setVendorFor(row, e.target.value, propagate)}>
                      <option value="">{t({ ar: `— ${row.vendorCands.length} موردين بنفس الاسم —`, en: `— ${row.vendorCands.length} vendors with the same name —` })}</option>
                      {row.vendorCands.map((v) => (
                        <option key={v.ref || v.name} value={v.ref}>{`${v.name} — ${v.ref || t({ ar: 'بلا رقم', en: 'no number' })}`}</option>
                      ))}
                    </select>
                  ) : (
                    <SafeInput list="qbi-vendors" value={row.vendorRef} placeholder={t({ ar: 'الرقم المرجعي', en: 'Reference number' })}
                      onChange={(e) => eng.setVendorFor(row, e.target.value, propagate)} />
                  )}
                  <div className="count">{vendor ? vendor.name : row.vendorNameRaw || row.vendorRefRaw}</div>
                </td>
                <td>{dte(row, 'issueDate')}</td>
                <td>{dte(row, 'dueDate')}</td>
                <td>{dte(row, 'supplyDate')}</td>
                <td>
                  <select value={row.location || ''} onChange={(e) => eng.setGroupLocation(row.ref, e.target.value)}>
                    <option value="">—</option>
                    {eng.catalog.locations.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </td>
                <td>
                  {prodCands.length > 1 && !row.prodSku ? (
                    <select value="" onChange={(e) => eng.setProductFor(row, e.target.value, propagate)}>
                      <option value="">{t({ ar: `— ${prodCands.length} منتجات متشابهة —`, en: `— ${prodCands.length} similar products —` })}</option>
                      {prodCands.map((p) => <option key={p.sku} value={p.sku}>{`${p.name} — ${p.sku}`}</option>)}
                    </select>
                  ) : (
                    <SafeInput list="qbi-products" value={row.prodSku} placeholder={t({ ar: 'SKU / باركود', en: 'SKU / barcode' })}
                      onChange={(e) => eng.setProductFor(row, e.target.value, propagate)} />
                  )}
                  <div className="count">{prod ? prod.name : row.prodNameRaw || row.prodRefRaw}</div>
                </td>
                <td className="num">{nmb(row, 'qty')}</td>
                <td>{txt(row, 'unit')}</td>
                <td className="num">
                  <SafeInput value={row.price ?? ''}
                    className={row.priceDerived ? 'derived' : ''}
                    title={row.priceDerived ? t({ ar: 'مشتق من إجمالي البند — اكتب قيمة لتثبيتها', en: 'Derived from the line total — type a value to lock it' }) : ''}
                    onChange={(e) => {
                      const v = num(e.target.value);
                      eng.updateRow(row, { price: v, priceDerived: v == null && row.lineTotal != null });
                    }} />
                </td>
                <td className="num">{nmb(row, 'lineTotal')}</td>
                <td>
                  <select value={row.taxIncl ? 'yes' : 'no'}
                    onChange={(e) => eng.updateRow(row, { taxIncl: e.target.value === 'yes', taxInclManual: true })}>
                    <option value="yes">{t({ ar: 'نعم', en: 'Yes' })}</option><option value="no">{t({ ar: 'لا', en: 'No' })}</option>
                  </select>
                </td>
                <td className="num">{nmb(row, 'discPct')}</td>
                <td className="num">{nmb(row, 'discVal')}</td>
                <td>
                  <select value={row.taxName || ''} onChange={(e) => eng.updateRow(row, { taxName: e.target.value })}>
                    <option value="">—</option>
                    {eng.catalog.taxes.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                </td>
                <td>
                  <div className="issue-list">
                    {row.issues.length
                      ? row.issues.map((x, k) => (
                        <span key={k} className={`badge ${x.l === 'e' ? 'b-err' : 'b-warn'}`}>{x.m}</span>
                      ))
                      : <span className="badge b-ok">{t({ ar: 'جاهز', en: 'Ready' })}</span>}
                  </div>
                </td>
              </tr>
            );
          })}
          {vt.shouldVirtualize && vt.bottomSpacerHeight > 0 && (
            <tr aria-hidden="true"><td colSpan={COLS.length} style={{ height: vt.bottomSpacerHeight, padding: 0, border: 'none' }} /></tr>
          )}
          {!list.length && <tr><td colSpan={COLS.length}>{t({ ar: 'لا توجد صفوف مطابقة لهذا العرض.', en: 'No rows match this view.' })}</td></tr>}
        </tbody>
      </table>
      <datalist id="qbi-vendors">
        {eng.catalog.vendors.slice(0, 2000).map((v) => (
          <option key={v.ref || v.name} value={v.ref || v.name}>{`${v.name} — ${v.ref || t({ ar: 'بلا رقم مرجعي', en: 'no reference number' })}`}</option>
        ))}
      </datalist>
      <datalist id="qbi-products">
        {buyable.slice(0, 3000).map((p) => <option key={p.sku} value={p.sku || p.name}>{p.name}</option>)}
      </datalist>
    </div>
  );
}
