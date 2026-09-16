import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../language.jsx';
import { fetchAll } from '../../product-upload/io/network.js';
import SearchableSelect from './SearchableSelect.jsx';

const accountLabel = (a) => `${a.code ? a.code + ' — ' : ''}${a.name_ar || a.name_en || ''}`;

/**
 * [إضافة] لوحة مراجعة الفواتير التي فيها نقص كمية متوقَّع (تحذير لا خطأ حاجب —
 * فقط عند جلب المخزون عبر API، راجع stockSimulation.js/checkStockSequential).
 * تظهر عند الضغط على "إرسال عبر API" بالخطوة 4 لو وُجدت أي فاتورة من هذا النوع،
 * بدل الإرسال المباشر — تعطي المستخدم قرارًا صريحًا لكل فاتورة محفوفة بالمخاطر
 * قبل إرسالها فعليًا، بما إن كل فاتورة تُرسَل أصلًا بـdraft_if_out_of_stock:true
 * (قيود تُنشئها كمسودة بدل رفضها — راجع تعليق رأس qoyodSalesInvoicePush.js).
 *
 * onConfirm(decision): decision = {excludeRefs: Set<string>, forceDraftRefs: Set<string>}
 * تُمرَّر مباشرة كخيارات إضافية لـengine.sendInvoicesViaApi. الفواتير غير
 * المحفوفة بالمخاطر (خارج groups) ليست جزءًا من هذه اللوحة إطلاقًا — تُرسَل
 * دومًا بحالة الإرسال العامة المختارة أعلاه، بلا أي تغيير عليها هنا.
 *
 * [إضافة] مسار ثالث إضافي (لا يستبدل الخيارين أعلاه) — "تغذية المخزون تلقائيًا":
 * بدل إرسال الفواتير الناقصة كمسودة أو استبعادها، يُنشئ تعديل مخزون حقيقي
 * (POST /inventory_adjustments) بالكمية الناقصة بالضبط لكل منتج/موقع، ثم يرسل
 * كل الفواتير (بما فيها المحفوفة بالمخاطر) بالحالة المطلوبة أصلًا (مثلًا معتمدة)
 * بدل إجبارها Draft. هذا قيد محاسبي حقيقي ودائم بدفاتر العميل الحية — يظهر تحذير
 * واضح بالأثر المحاسبي (عربي/إنجليزي) لا يمكن تفويته، ويحتاج المستخدم اختيار
 * حساب إيراد/مصروف صراحةً لكل ضغطة. onTopUpConfirm({revenueAccountId,
 * expenseAccountId}) اختياري تمامًا — بلا تمريره (أو apiKey فارغ)، لا يظهر هذا
 * الخيار إطلاقًا (نفس الخيارين الأصليين أعلاه يبقيان متاحين دومًا).
 */
export default function StockShortageReviewPanel({ groups, onCancel, onConfirm, apiKey, onTopUpConfirm }) {
  const { t } = useLanguage();
  const [checked, setChecked] = useState(() => new Set(groups.map((g) => g.ref)));

  const [showTopUp, setShowTopUp] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [accountsBusy, setAccountsBusy] = useState(false);
  const [accountsError, setAccountsError] = useState('');
  const [revenueAccountId, setRevenueAccountId] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [ackImpact, setAckImpact] = useState(false);
  const [accountsProgress, setAccountsProgress] = useState(0);
  const accountOptions = useMemo(() => accounts.map((a) => ({ value: a.id, label: accountLabel(a) })), [accounts]);

  useEffect(() => {
    if (!showTopUp || !apiKey || accounts.length) return;
    let cancelled = false;
    (async () => {
      setAccountsBusy(true); setAccountsError(''); setAccountsProgress(0);
      try {
        const accs = await fetchAll('/accounts', apiKey, { onPage: (n) => !cancelled && setAccountsProgress(n) });
        if (!cancelled) setAccounts(accs || []);
      } catch (e) {
        if (!cancelled) setAccountsError(e.message || String(e));
      } finally {
        if (!cancelled) setAccountsBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showTopUp, apiKey, accounts.length]);

  const toggle = (ref) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref); else next.add(ref);
      return next;
    });
  };

  const allRefs = groups.map((g) => g.ref);
  const uncheckedRefs = allRefs.filter((r) => !checked.has(r));

  return (
    <div className="qsv-modal-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="qsv-modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>⚠️ {t({
          ar: `${groups.length} فاتورة بها نقص كمية متوقَّع`,
          en: `${groups.length} invoice(s) with expected quantity shortage`,
        })}</h3>
        <p className="qsv-hint">
          {t({
            ar: 'قيود تُنشئ الفاتورة كمسودة (Draft) بدل رفضها عند نقص الكمية — راجع الفواتير أدناه وحدّد ما تريد إرساله كمسودة، أو تجاهلها وأرسل بقية الفواتير السليمة فقط.',
            en: "Qoyod creates the invoice as a Draft instead of rejecting it when quantity is short — review the invoices below and choose which to send as a draft, or skip them and send only the rest of the valid invoices.",
          })}
        </p>

        <div className="qsv-modal-scroll">
          <table className="qsv-send-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>{t({ ar: 'مرجع الفاتورة', en: 'Invoice ref' })}</th>
                <th>{t({ ar: 'التفاصيل', en: 'Details' })}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.ref}>
                  <td>
                    <input type="checkbox" checked={checked.has(g.ref)} onChange={() => toggle(g.ref)} />
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{g.ref}</td>
                  <td>{g.messages.join(' — ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {onTopUpConfirm && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--qsv-border)' }}>
            {!showTopUp ? (
              <button type="button" className="qsv-btn secondary" onClick={() => setShowTopUp(true)}>
                🔧 {t({ ar: 'بدلًا من ذلك: تغذية المخزون تلقائيًا وإرسال الكل بالحالة المطلوبة', en: 'Instead: auto top-up stock and send all with the requested status' })}
              </button>
            ) : (
              <>
                <div className="qsv-note-box err" style={{ marginBottom: 10 }}>
                  ⚠️ {t({
                    ar: 'تحذير محاسبي: سيُنشأ قيد تعديل مخزون حقيقي ودائم بدفاتر العميل الحية (POST /inventory_adjustments) بالكمية الناقصة بالضبط لكل منتج/موقع — هذا يؤثر فعليًا على حسابَي الإيراد والمصروف المختارين أدناه، ولا يمكن التراجع عنه تلقائيًا من هذه الأداة. تأكد من فهمك للأثر المحاسبي قبل المتابعة.',
                    en: 'Accounting warning: a real, permanent inventory adjustment entry (POST /inventory_adjustments) will be created in the client\'s live books, for the exact missing quantity of each product/location — this genuinely affects the revenue and expense accounts chosen below, and cannot be undone automatically from this tool. Make sure you understand the accounting impact before continuing.',
                  })}
                </div>
                {accountsBusy && (
                  <p className="qsv-hint">
                    ⏳ {t({ ar: `جارٍ جلب دليل الحسابات... (${accountsProgress} حساب حتى الآن)`, en: `Fetching chart of accounts... (${accountsProgress} so far)` })}
                  </p>
                )}
                {accountsError && <div className="qsv-note-box err">{accountsError}</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div style={{ flex: '1 1 220px' }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--qsv-muted)' }}>{t({ ar: 'حساب الإيراد (للزيادة)', en: 'Revenue account (for increases)' })}</label>
                    <SearchableSelect options={accountOptions} value={revenueAccountId} onChange={setRevenueAccountId} placeholder={t({ ar: 'اكتب كود أو اسم الحساب...', en: 'Type account code or name...' })} />
                  </div>
                  <div style={{ flex: '1 1 220px' }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--qsv-muted)' }}>{t({ ar: 'حساب المصروف (للنقص)', en: 'Expense account (for decreases)' })}</label>
                    <SearchableSelect options={accountOptions} value={expenseAccountId} onChange={setExpenseAccountId} placeholder={t({ ar: 'اكتب كود أو اسم الحساب...', en: 'Type account code or name...' })} />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginBottom: 10 }}>
                  <input type="checkbox" checked={ackImpact} onChange={(e) => setAckImpact(e.target.checked)} />
                  {t({ ar: 'أفهم أن هذا سيُنشئ قيدًا محاسبيًا حقيقيًا ودائمًا بدفاتر العميل الحية.', en: 'I understand this will create a real, permanent accounting entry in the client\'s live books.' })}
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="qsv-btn ghost" onClick={() => setShowTopUp(false)}>{t({ ar: 'رجوع', en: 'Back' })}</button>
                  <button
                    type="button"
                    className="qsv-btn"
                    disabled={!revenueAccountId || !expenseAccountId || !ackImpact}
                    onClick={() => onTopUpConfirm({ revenueAccountId, expenseAccountId })}
                  >
                    ✅ {t({ ar: 'تأكيد التغذية وإرسال كل الفواتير', en: 'Confirm top-up & send all invoices' })}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="qsv-modal-actions" style={{ marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="qsv-btn ghost" onClick={onCancel}>
            {t({ ar: 'رجوع', en: 'Back' })}
          </button>
          <button
            type="button"
            className="qsv-btn secondary"
            onClick={() => onConfirm({ excludeRefs: new Set(allRefs), forceDraftRefs: new Set() })}
          >
            {t({ ar: 'تجاهل هذه الفواتير — أرسل الصالحة فقط', en: 'Skip these invoices — send only the valid ones' })}
          </button>
          <button
            type="button"
            className="qsv-btn secondary"
            disabled={checked.size === 0 || checked.size === allRefs.length}
            onClick={() => onConfirm({ excludeRefs: new Set(uncheckedRefs), forceDraftRefs: new Set(checked) })}
          >
            {t({ ar: `إرسال المحدد كمسودة (${checked.size})`, en: `Send selected as draft (${checked.size})` })}
          </button>
          <button
            type="button"
            className="qsv-btn"
            onClick={() => onConfirm({ excludeRefs: new Set(), forceDraftRefs: new Set(allRefs) })}
          >
            {t({ ar: `إرسال الكل كمسودة (${allRefs.length})`, en: `Send all as draft (${allRefs.length})` })}
          </button>
        </div>
      </div>
    </div>
  );
}
