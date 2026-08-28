import { fmtDate, toDate, num, norm } from '../lib/text.js';
import { isBuyable, findProdBySku } from '../lib/matching.js';
import { rowErr, rowWarn } from '../lib/validation.js';

const COLS = ['#', 'مرجع الفاتورة', 'المورد', 'تاريخ الإصدار', 'الاستحقاق', 'التوريد', 'الموقع', 'المنتج',
  'الكمية', 'وحدة التحويل', 'سعر الوحدة', 'إجمالي البند', 'شامل؟', 'خصم %', 'خصم قيمة', 'الضريبة', 'الملاحظات'];

/** جدول المراجعة: كل خانة قابلة للتعديل، والملاحظات تُعاد حسابها فور أي تغيير */
export default function ReviewTable({ eng, filter, propagate }) {
  const list = eng.rows.filter((r) => (filter === 'all' ? true : filter === 'err' ? rowErr(r) : r.issues.length > 0));
  const buyable = eng.catalog.products.filter(isBuyable);

  const txt = (row, key) => (
    <input type="text" value={row[key] ?? ''} onChange={(e) => eng.updateRow(row, { [key]: e.target.value })} />
  );
  const nmb = (row, key) => (
    <input type="text" value={row[key] ?? ''} onChange={(e) => eng.updateRow(row, { [key]: num(e.target.value) })} />
  );
  const dte = (row, key) => (
    <input type="text" placeholder="يوم/شهر/سنة" value={fmtDate(row[key])}
      onChange={(e) => eng.updateRow(row, { [key]: toDate(e.target.value) })} />
  );

  return (
    <div className="qbi-scroll">
      <table className="qbi-rows">
        <thead><tr>{COLS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {list.map((row, idx) => {
            const vendor = eng.catalog.vendors.find((v) => norm(v.ref) === norm(row.vendorRef));
            const prod = findProdBySku(eng.catalog.products, row.prodSku);
            const prodCands = row.prodCands.filter(isBuyable);
            return (
              <tr key={`${row.i}-${idx}`} className={rowErr(row) ? 'r-err' : rowWarn(row) ? 'r-warn' : ''}>
                <td>{row.i}</td>
                <td>{txt(row, 'ref')}</td>
                <td>
                  {row.vendorCands.length > 1 && !row.vendorRef ? (
                    <select value="" onChange={(e) => eng.setVendorFor(row, e.target.value, propagate)}>
                      <option value="">{`— ${row.vendorCands.length} موردين بنفس الاسم —`}</option>
                      {row.vendorCands.map((v) => (
                        <option key={v.ref || v.name} value={v.ref}>{`${v.name} — ${v.ref || 'بلا رقم'}`}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" list="qbi-vendors" value={row.vendorRef} placeholder="الرقم المرجعي"
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
                      <option value="">{`— ${prodCands.length} منتجات متشابهة —`}</option>
                      {prodCands.map((p) => <option key={p.sku} value={p.sku}>{`${p.name} — ${p.sku}`}</option>)}
                    </select>
                  ) : (
                    <input type="text" list="qbi-products" value={row.prodSku} placeholder="SKU / باركود"
                      onChange={(e) => eng.setProductFor(row, e.target.value, propagate)} />
                  )}
                  <div className="count">{prod ? prod.name : row.prodNameRaw || row.prodRefRaw}</div>
                </td>
                <td className="num">{nmb(row, 'qty')}</td>
                <td>{txt(row, 'unit')}</td>
                <td className="num">
                  <input type="text" value={row.price ?? ''}
                    className={row.priceDerived ? 'derived' : ''}
                    title={row.priceDerived ? 'مشتق من إجمالي البند — اكتب قيمة لتثبيتها' : ''}
                    onChange={(e) => {
                      const v = num(e.target.value);
                      eng.updateRow(row, { price: v, priceDerived: v == null && row.lineTotal != null });
                    }} />
                </td>
                <td className="num">{nmb(row, 'lineTotal')}</td>
                <td>
                  <select value={row.taxIncl ? 'نعم' : 'لا'}
                    onChange={(e) => eng.updateRow(row, { taxIncl: e.target.value === 'نعم', taxInclManual: true })}>
                    <option>نعم</option><option>لا</option>
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
                      : <span className="badge b-ok">جاهز</span>}
                  </div>
                </td>
              </tr>
            );
          })}
          {!list.length && <tr><td colSpan={COLS.length}>لا توجد صفوف مطابقة لهذا العرض.</td></tr>}
        </tbody>
      </table>
      <datalist id="qbi-vendors">
        {eng.catalog.vendors.slice(0, 2000).map((v) => (
          <option key={v.ref || v.name} value={v.ref || v.name}>{`${v.name} — ${v.ref || 'بلا رقم مرجعي'}`}</option>
        ))}
      </datalist>
      <datalist id="qbi-products">
        {buyable.slice(0, 3000).map((p) => <option key={p.sku} value={p.sku || p.name}>{p.name}</option>)}
      </datalist>
    </div>
  );
}
