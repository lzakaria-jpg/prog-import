import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../language.jsx';
import { norm } from '../engine/text.js';
import { parseDateParts } from '../engine/dates.js';
import { fetchAll } from '../../product-upload/io/network.js';
import SearchableSelect from './SearchableSelect.jsx';

const accountLabel = (a) => `${a.code ? a.code + ' — ' : ''}${a.name_ar || a.name_en || ''}`;

/**
 * [إضافة] لوحة مراجعة حسابات الدفع لسندات القبض المرتبطة بفواتير (راجع تعليق
 * رأس engine/receipts.js) — المرحلة الثالثة بالخطوة 4 (بعد لوحتَي الكيانات
 * الناقصة ونقص المخزون)، تظهر فقط لو engine.receiptsPlan غير فارغة، قبل
 * الإرسال الفعلي (ApiSendSection بـStep4Export.jsx).
 *
 * كود حساب الدفع كما كُتب بالملف الخام (row.paymentAccountCode) يُطابَق تلقائيًا
 * بكود حقيقي بدليل حسابات المنشأة (GET /accounts، حقل code) — نفس أسلوب مطابقة
 * حساب المخزون/COGS/الإيراد بـMissingEntitiesReviewPanel.jsx حرفيًا. كود بلا
 * مطابقة تلقائية يحتاج اختيارًا يدويًا صريحًا من المستخدم قبل تفعيل "تأكيد
 * والمتابعة" (قرار صريح من المستخدم 2026-09-16، بدل رفض الدفعة بالكامل).
 *
 * onConfirm(receiptsByRef): Map<ref, Array<{rowId,date,amount,accountId}>> —
 * نفس بنية opts.receiptsByRef بـpushSalesInvoicesToQoyod مباشرة.
 */
export default function PaymentAccountsReviewPanel({ receiptsPlan, apiKey, onCancel, onConfirm }) {
  const { t } = useLanguage();
  const receipts = receiptsPlan || [];

  const [accounts, setAccounts] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [refsError, setRefsError] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [accountIdByCode, setAccountIdByCode] = useState({}); // accountCode -> accountId
  const [error, setError] = useState('');

  const accountOptions = useMemo(() => accounts.map((a) => ({ value: a.id, label: accountLabel(a) })), [accounts]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!apiKey) return;
      setLoadingRefs(true); setRefsError(''); setLoadingProgress(0);
      try {
        const accs = await fetchAll('/accounts', apiKey, { onPage: (n) => !cancelled && setLoadingProgress(n) });
        if (cancelled) return;
        setAccounts(accs || []);
        const initial = {};
        receipts.forEach((rc) => {
          if (rc.accountCode && initial[rc.accountCode] === undefined) {
            const m = (accs || []).find((a) => norm(String(a.code)) === norm(rc.accountCode));
            if (m) initial[rc.accountCode] = m.id;
          }
        });
        setAccountIdByCode(initial);
      } catch (e) {
        if (!cancelled) setRefsError(e.message || String(e));
      } finally {
        if (!cancelled) setLoadingRefs(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const setAccountForCode = (code, accountId) => setAccountIdByCode((prev) => ({ ...prev, [code]: accountId || undefined }));

  const handleConfirm = () => {
    setError('');
    const missingAccount = receipts.some((rc) => !accountIdByCode[rc.accountCode]);
    if (missingAccount) {
      setError(t({ ar: 'اختر حسابًا حقيقيًا لكل كود حساب دفع ظاهر أدناه قبل المتابعة.', en: 'Choose a real account for every payment account code shown below before continuing.' }));
      return;
    }
    const badDate = receipts.find((rc) => !parseDateParts(rc.date));
    if (badDate) {
      setError(t({ ar: `تعذّر قراءة تاريخ سند القبض لمرجع الفاتورة "${badDate.ref}" ("${badDate.date || '—'}").`, en: `Could not read the receipt date for invoice ref "${badDate.ref}" ("${badDate.date || '—'}").` }));
      return;
    }

    const receiptsByRef = new Map();
    receipts.forEach((rc) => {
      if (!receiptsByRef.has(rc.ref)) receiptsByRef.set(rc.ref, []);
      receiptsByRef.get(rc.ref).push({ rowId: rc.rowId, date: rc.date, amount: rc.amount, accountId: accountIdByCode[rc.accountCode] });
    });
    onConfirm(receiptsByRef);
  };

  return (
    <div className="qsv-modal-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="qsv-modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>🧾 {t({ ar: `مراجعة سندات القبض المرتبطة بالفواتير (${receipts.length})`, en: `Reviewing invoice-linked receipts (${receipts.length})` })}</h3>
        <p className="qsv-hint">
          {t({
            ar: 'سيُنشأ سند قبض واحد لكل صف أدناه، مرتبطًا بفاتورته فور نجاح إنشائها بحالة "معتمدة" — قيود يرفض الدفع على فاتورة مسودة. اختر الحساب الحقيقي المستلِم لكل كود دفع.',
            en: 'One receipt will be created per row below, linked to its invoice right after it is successfully created as "Approved" — Qoyod rejects payment on a Draft invoice. Choose the real receiving account for each payment code.',
          })}
        </p>

        {loadingRefs && (
          <p className="qsv-hint">⏳ {t({ ar: `جارٍ جلب دليل الحسابات... (${loadingProgress})`, en: `Fetching chart of accounts... (${loadingProgress})` })}</p>
        )}
        {refsError && <div className="qsv-note-box err">{refsError}</div>}

        <div className="qsv-modal-scroll">
          <table className="qsv-send-table">
            <thead>
              <tr>
                <th>{t({ ar: 'مرجع الفاتورة', en: 'Invoice ref' })}</th>
                <th>{t({ ar: 'تاريخ السند', en: 'Receipt date' })}</th>
                <th>{t({ ar: 'المبلغ', en: 'Amount' })}</th>
                <th>{t({ ar: 'كود حساب الدفع بالملف', en: 'Payment account code (file)' })}</th>
                <th>{t({ ar: 'الحساب الحقيقي بقيود', en: 'Real Qoyod account' })}</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((rc) => (
                <tr key={rc.rowId}>
                  <td style={{ fontFamily: 'monospace' }}>{rc.ref}</td>
                  <td>{rc.date}</td>
                  <td>{isNaN(rc.amount) ? '—' : rc.amount}</td>
                  <td style={{ fontFamily: 'monospace' }}>{rc.accountCode || '—'}</td>
                  <td>
                    <SearchableSelect
                      options={accountOptions}
                      value={accountIdByCode[rc.accountCode] || ''}
                      onChange={(v) => setAccountForCode(rc.accountCode, v)}
                      placeholder={t({ ar: 'اكتب كود أو اسم الحساب...', en: 'Type account code or name...' })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <div className="qsv-note-box err" style={{ marginTop: 12 }}>{error}</div>}

        <div className="qsv-modal-actions" style={{ marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="qsv-btn ghost" onClick={onCancel}>{t({ ar: 'رجوع', en: 'Back' })}</button>
          <button type="button" className="qsv-btn" disabled={!receipts.length} onClick={handleConfirm}>
            ✅ {t({ ar: 'تأكيد والمتابعة للإرسال', en: 'Confirm & continue to send' })}
          </button>
        </div>
      </div>
    </div>
  );
}
