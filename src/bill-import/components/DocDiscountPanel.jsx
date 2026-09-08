import { useState } from 'react';
import { useLanguage } from '../../language.jsx';
import { groupsOf, groupSubtotal } from '../lib/validation.js';
import { SafeInput } from '../../lib/SafeInput.jsx';

/**
 * لوحة خصم المستند — تتعامل مع الحالتين:
 * قالب يحتوي أعمدة الخصم (يحتاج حساباً وفئة ضريبية)، وقالب لا يحتويها (توزيع أو إلغاء).
 */
export default function DocDiscountPanel({ eng }) {
  const { t } = useLanguage();
  const [picked, setPicked] = useState({});
  const [acc, setAcc] = useState('');
  const [tax, setTax] = useState('');

  const list = [];
  groupsOf(eng.rows).forEach((rows, ref) => {
    const hit = rows.find((r) => r.docDiscVal != null);
    if (hit && hit.docDiscVal !== '') {
      list.push({ ref, rows, val: hit.docDiscVal, acc: rows[0].docDiscAcc || '', tax: rows[0].docDiscTax || '' });
    }
  });
  if (!list.length) return null;

  const supported = eng.hasDocDisc;
  const accounts = eng.tpl && eng.tpl.discAccounts.length ? eng.tpl.discAccounts : null;
  const taxCats = eng.tpl && eng.tpl.discTaxes.length ? eng.tpl.discTaxes : eng.catalog.taxes.map((t) => t.name);
  const isChecked = (g) => (picked[g.ref] === undefined ? true : picked[g.ref]);
  const chosen = () => list.filter(isChecked);

  return (
    <details className="qbi-box need" open>
      <summary>
        {t({ ar: `خصم المستند — ${list.length} فاتورة`, en: `Document discount — ${list.length} invoice(s)` })}
        <span className={`badge ${supported ? 'b-warn' : 'b-err'}`}>
          {supported ? t({ ar: 'يحتاج حساباً وفئة ضريبية', en: 'Needs an account and a tax category' }) : t({ ar: 'القالب المرفوع لا يحتوي أعمدة خصم المستند', en: 'The uploaded template has no document-discount columns' })}
        </span>
      </summary>

      <div className="qbi-list">
        {list.map((g) => (
          <label key={g.ref}>
            <input type="checkbox" checked={isChecked(g)}
              onChange={(e) => setPicked((p) => ({ ...p, [g.ref]: e.target.checked }))} />
            <b>{g.ref}</b>
            <span className="count">{t({ ar: ` خصم ${g.val} من إجمالي ${groupSubtotal(g.rows).toFixed(2)}`, en: ` discount ${g.val} of total ${groupSubtotal(g.rows).toFixed(2)}` })}</span>
            <span className={`badge ${g.acc && g.tax ? 'b-ok' : 'b-warn'}`}>
              {g.acc && g.tax ? `${g.acc} · ${g.tax}` : t({ ar: 'بلا حساب/فئة', en: 'No account/category' })}
            </span>
          </label>
        ))}
      </div>

      {supported ? (
        <div className="qbi-actions">
          <span className="count">{t({ ar: 'الحساب:', en: 'Account:' })}</span>
          {accounts
            ? <select value={acc} onChange={(e) => setAcc(e.target.value)}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            : <SafeInput value={acc} onChange={(e) => setAcc(e.target.value)} placeholder={t({ ar: 'حساب خصم المستند', en: 'Document discount account' })} />}
          <span className="count">{t({ ar: 'الفئة الضريبية:', en: 'Tax category:' })}</span>
          <select value={tax} onChange={(e) => setTax(e.target.value)}>
            <option value="">—</option>
            {taxCats.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="qbi-btn"
            onClick={() => chosen().forEach((g) => eng.setGroupDocDisc(g.ref, { docDiscAcc: acc, docDiscTax: tax }))}>
            {t({ ar: 'تطبيق على المحدد', en: 'Apply to selected' })}
          </button>
          <button className="qbi-btn ghost"
            onClick={() => chosen().forEach((g) => eng.setGroupDocDisc(g.ref, { docDiscVal: null, docDiscAcc: '', docDiscTax: '' }))}>
            {t({ ar: 'إلغاء الخصم', en: 'Cancel discount' })}
          </button>
        </div>
      ) : (
        <div className="qbi-actions">
          <span className="count">{t({ ar: 'القالب بلا أعمدة خصم مستند — اختر معالجة:', en: 'The template has no document-discount columns — choose how to handle it:' })}</span>
          <button className="qbi-btn" onClick={() => chosen().forEach((g) => eng.spreadDiscount(g.ref))}>
            {t({ ar: 'توزيعه على البنود', en: 'Spread it across the items' })}
          </button>
          <button className="qbi-btn ghost"
            onClick={() => chosen().forEach((g) => eng.setGroupDocDisc(g.ref, { docDiscVal: null, docDiscAcc: '', docDiscTax: '' }))}>
            {t({ ar: 'إلغاء الخصم', en: 'Cancel discount' })}
          </button>
          <span className="count">{t({ ar: 'التوزيع يحافظ على الإجمالي لكنه يسجّل الخصم على البنود لا على المستند.', en: 'Spreading preserves the total but records the discount on the items, not the document.' })}</span>
        </div>
      )}
    </details>
  );
}
