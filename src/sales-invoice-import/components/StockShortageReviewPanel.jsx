import React, { useState } from 'react';
import { useLanguage } from '../../language.jsx';

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
 */
export default function StockShortageReviewPanel({ groups, onCancel, onConfirm }) {
  const { t } = useLanguage();
  const [checked, setChecked] = useState(() => new Set(groups.map((g) => g.ref)));

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
