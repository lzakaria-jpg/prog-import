import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../language.jsx';

const FIELD_LABEL = { C: { ar: 'العميل', en: 'Customer' }, N: { ar: 'المنتج', en: 'Product' } };

// نسخ لتصميم renderAmbiguityResolutionUI الأصلي — قائمة تفاعلية لحسم أسماء عملاء/منتجات مكررة.
export default function AmbiguityPanel({ ambiguities, onApply }) {
  const { t } = useLanguage();
  const [choices, setChoices] = useState({});
  // [إصلاح] كانت الاختيارات محفوظة بمفتاح = فهرس العنصر بالمصفوفة، والمكوّن لا
  // يُفرَّغ عند استبدال قائمة الغموض (يعيد null فقط)، فتبقى اختيارات دفعة سابقة
  // حيّة: عند استيراد ملف ثانٍ يُطبَّق رقم عميل اختاره المستخدم لسطر مختلف تمامًا
  // على سطر جديد — رقم عميل حقيقي فلا يرفع التحقق أي خطأ، وتُصدَّر الفاتورة لعميل
  // خاطئ. المفتاح الآن rowId+field (مستقر ومرتبط بالسطر فعلًا) ويُصفَّر مع كل دفعة.
  useEffect(() => { setChoices({}); }, [ambiguities]);
  const keyOf = (a) => `${a.rowId}|${a.field}`;
  if (!ambiguities.length) return null;

  return (
    <div className="qsv-panel qsv-ambiguity-box">
      <h3 style={{ marginTop: 0 }}>⚠️ {t({ ar: 'يوجد أسماء مكررة تحتاج تحديدًا يدويًا', en: 'There are duplicate names that need manual resolution' })} ({ambiguities.length})</h3>
      <p className="qsv-hint">{t({ ar: 'وُجد أكثر من تطابق بنفس الاسم — رجاءً اختر الصحيح لكل سطر:', en: 'More than one match was found with the same name — please choose the correct one for each row:' })}</p>
      <table className="qsv-mapping-table">
        <tbody>
          {ambiguities.map((a, i) => (
            <tr key={i}>
              <td>{t(FIELD_LABEL[a.field])}: "{a.typedName}"</td>
              <td>
                <select value={choices[keyOf(a)] || ''} onChange={(e) => setChoices((c) => ({ ...c, [keyOf(a)]: e.target.value }))}>
                  <option value="">— {t({ ar: 'اختر', en: 'Choose' })} —</option>
                  {a.candidates.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button" className="qsv-btn" style={{ marginTop: 10 }}
        onClick={() => onApply(ambiguities.map((a) => {
          const chosen = choices[keyOf(a)] || '';
          // لا نُطبّق أي قيمة ليست ضمن مرشّحي هذا السطر نفسه (حماية إضافية)
          const valid = a.candidates.some((c) => c.key === chosen) ? chosen : '';
          return { rowId: a.rowId, field: a.field, value: valid };
        }))}
      >
        ✅ {t({ ar: 'تطبيق الاختيارات', en: 'Apply choices' })}
      </button>
    </div>
  );
}
