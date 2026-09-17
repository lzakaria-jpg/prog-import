import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../language.jsx';
import { fetchAll } from '../../product-upload/io/network.js';
import { isRevenueOrEquityAccount, isExpenseOrEquityAccount, filterAccountsWithFallback } from '../engine/accountFilters.js';
import SearchableSelect from './SearchableSelect.jsx';

function todayIsoDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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
 * حساب إيراد/مصروف صراحةً لكل ضغطة، تاريخًا لعملية الجرد، وسعر تكلفة (rate)
 * يدويًا لكل منتج ناقص (راجع تعليق رأس getStockTopUpNeeds بـstockSimulation.js
 * — [تصحيح 2026-09-17، خطأ محاسبي فادح] لم يعد يُشتَق تلقائيًا من سعر البيع
 * إطلاقًا). onTopUpConfirm({revenueAccountId, expenseAccountId, date, costBySku})
 * اختياري تمامًا — بلا تمريره (أو apiKey فارغ)، لا يظهر هذا الخيار إطلاقًا
 * (نفس الخيارين الأصليين أعلاه يبقيان متاحين دومًا). stockTopUpNeeds (مطلوب
 * لو onTopUpConfirm مُمرَّرة): نفس ناتج engine.getStockTopUpPlan() — [{sku,
 * loc, shortfall}] — لعرض جدول التكلفة اليدوية لكل منتج ناقص فعليًا.
 */
export default function StockShortageReviewPanel({ groups, onCancel, onConfirm, apiKey, onTopUpConfirm, stockTopUpNeeds }) {
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
  // [إضافة، طلب صريح من المستخدم 2026-09-17] حساب الإيراد يعرض حسابات "إيراد"
  // وحسابات "حقوق ملكية" معًا، وحساب المصروف يعرض حسابات "مصروف" وحسابات
  // "حقوق ملكية" معًا — تسوية جرد مخزون افتتاحي غالبًا تُرحَّل لحقوق الملكية لا
  // إيراد/مصروف تشغيلي فعلي. راجع تعليق رأس engine/accountFilters.js.
  const revenueAccountOptions = useMemo(() => filterAccountsWithFallback(accounts, isRevenueOrEquityAccount).map((a) => ({ value: a.id, label: accountLabel(a) })), [accounts]);
  const expenseAccountOptions = useMemo(() => filterAccountsWithFallback(accounts, isExpenseOrEquityAccount).map((a) => ({ value: a.id, label: accountLabel(a) })), [accounts]);

  // [إضافة، تصحيح 2026-09-17، خطأ محاسبي فادح حسب المستخدم] القيمة المخزنية
  // المُرحَّلة بقيد تعديل المخزون تُحسَب بسعر البيع خطأً سابقًا (rate تلقائي من
  // row.R بـgetStockTopUpNeeds) — سعر البيع ليس سعر التكلفة (هامش الربح يفصل
  // بينهما). الآن المستخدم يُدخِل متوسط التكلفة الحقيقي يدويًا لكل منتج (مفتاحه
  // sku فقط — نفس المنتج بأكثر من موقع ناقص يشارك نفس التكلفة المُدخَلة)، إلزاميًا
  // وبلا أي قيمة افتراضية (لا تخمين، لا سعر بيع كبديل احتياطي كما كان). تاريخ
  // عملية الجرد نفسها صار اختيارًا صريحًا أيضًا (كان "اليوم" ثابتًا دومًا).
  const [costBySku, setCostBySku] = useState({});
  const [topUpDate, setTopUpDate] = useState(() => todayIsoDate());
  const needs = stockTopUpNeeds || [];
  const distinctSkus = useMemo(() => Array.from(new Map(needs.map((n) => [n.sku, n])).values()), [needs]);
  const allCostsValid = distinctSkus.every((n) => { const c = parseFloat(costBySku[n.sku]); return !isNaN(c) && c > 0; });

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
                    <SearchableSelect options={revenueAccountOptions} value={revenueAccountId} onChange={setRevenueAccountId} placeholder={t({ ar: 'اكتب كود أو اسم الحساب...', en: 'Type account code or name...' })} />
                  </div>
                  <div style={{ flex: '1 1 220px' }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--qsv-muted)' }}>{t({ ar: 'حساب المصروف (للنقص)', en: 'Expense account (for decreases)' })}</label>
                    <SearchableSelect options={expenseAccountOptions} value={expenseAccountId} onChange={setExpenseAccountId} placeholder={t({ ar: 'اكتب كود أو اسم الحساب...', en: 'Type account code or name...' })} />
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--qsv-muted)' }}>{t({ ar: 'تاريخ عملية الجرد', en: 'Stock-take date' })}</label>
                    <input type="date" lang="en" value={topUpDate} onChange={(e) => setTopUpDate(e.target.value)} />
                  </div>
                </div>

                {distinctSkus.length > 0 && (
                  <>
                    <p className="qsv-hint" style={{ marginBottom: 6 }}>
                      {t({
                        ar: '⚠️ إلزامي: أدخل متوسط سعر التكلفة الحقيقي لكل منتج — هذا ما ينعكس فعليًا على قيمة المخزون بدفاتر العميل. لا تدخل سعر البيع.',
                        en: '⚠️ Required: enter the real average cost price for each product — this is what actually posts to the client\'s inventory valuation. Do not enter the selling price.',
                      })}
                    </p>
                    <table className="qsv-send-table" style={{ marginBottom: 10 }}>
                      <thead>
                        <tr>
                          <th>{t({ ar: 'المنتج', en: 'Product' })}</th>
                          <th>{t({ ar: 'المواقع الناقصة', en: 'Short locations' })}</th>
                          <th>{t({ ar: 'إجمالي النقص', en: 'Total shortfall' })}</th>
                          <th>{t({ ar: 'متوسط سعر التكلفة *', en: 'Average cost price *' })}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {distinctSkus.map((n) => {
                          const skuNeeds = needs.filter((x) => x.sku === n.sku);
                          const totalShortfall = skuNeeds.reduce((s, x) => s + x.shortfall, 0);
                          return (
                            <tr key={n.sku}>
                              <td>
                                {/* [إضافة، طلب صريح من المستخدم 2026-09-17] اسم
                                    المنتج فوق بخط كحلي غامق، وكوده تحته أصغر
                                    ورفيع برمادي — name قد يغيب (منتج لم يُحمَّل
                                    فهرسه بعد) فيبقى الكود وحده ظاهرًا كما كان. */}
                                {n.name && <div style={{ fontWeight: 700, color: '#1e3a5f' }}>{n.name}</div>}
                                <div style={{ fontFamily: 'monospace', fontSize: n.name ? 11 : undefined, fontWeight: n.name ? 300 : undefined, color: n.name ? '#8a8f98' : undefined }}>{n.sku}</div>
                              </td>
                              <td>{skuNeeds.map((x) => x.loc).join('، ')}</td>
                              <td>{totalShortfall}</td>
                              <td>
                                <input
                                  type="number" lang="en" step="0.01" min="0"
                                  value={costBySku[n.sku] ?? ''}
                                  onChange={(e) => setCostBySku((prev) => ({ ...prev, [n.sku]: e.target.value }))}
                                  placeholder={t({ ar: 'سعر التكلفة...', en: 'Cost price...' })}
                                  style={{ width: 120 }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginBottom: 10 }}>
                  <input type="checkbox" checked={ackImpact} onChange={(e) => setAckImpact(e.target.checked)} />
                  {t({ ar: 'أفهم أن هذا سيُنشئ قيدًا محاسبيًا حقيقيًا ودائمًا بدفاتر العميل الحية.', en: 'I understand this will create a real, permanent accounting entry in the client\'s live books.' })}
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="qsv-btn ghost" onClick={() => setShowTopUp(false)}>{t({ ar: 'رجوع', en: 'Back' })}</button>
                  <button
                    type="button"
                    className="qsv-btn"
                    disabled={!revenueAccountId || !expenseAccountId || !ackImpact || !topUpDate || !allCostsValid}
                    onClick={() => onTopUpConfirm({ revenueAccountId, expenseAccountId, date: topUpDate, costBySku })}
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
