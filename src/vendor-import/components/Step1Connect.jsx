import { useLanguage } from '../../language.jsx';
import Note from './Note.jsx';
import { SafeInput } from '../../lib/SafeInput.jsx';

/** الخطوة ١: الاتصال بواجهة قيود — يجلب الموردين الموجودين فعلاً لكشف التكرار بالاسم فقط */
export default function Step1Connect({ eng }) {
  const { t } = useLanguage();

  return (
    <section>
      <div className="qvi-card">
        <h2>{t({ ar: 'الاتصال بواجهة قيود البرمجية', en: "Connect to Qoyod's API" })}</h2>
        <p className="hint">
          {t({ ar: 'المفتاح يُولَّد من إعدادات المنشأة، ويُرسل في ترويسة', en: "The key is generated from the account's settings, and is sent in the" })} <span className="mono">API-KEY</span> {t({ ar: 'ترويسة.', en: 'header.' })}
          {' '}{t({ ar: 'يبقى في ذاكرة المتصفح ولا يُخزَّن ولا يُرسل لأي طرف ثالث.', en: "It stays in the browser's memory and is never stored or sent to any third party." })}
        </p>
        <label className="f">
          <span>{t({ ar: 'مفتاح الواجهة (API Key)', en: 'API key' })}</span>
          <SafeInput type="password" value={eng.apiKey}
            onChange={(e) => eng.setApiKey(e.target.value)} placeholder={t({ ar: 'الصق المفتاح هنا', en: 'Paste the key here' })} />
        </label>

        <div className="qvi-api-row">
          <div className="qvi-api-field" style={{ flex: '1 1 200px' }}>
            <span>{t({ ar: 'اسم العميل (للحفظ)', en: 'Customer name (to save)' })}</span>
            <SafeInput type="text" value={eng.customerName} onChange={(e) => eng.setCustomerName(e.target.value)}
              placeholder={t({ ar: 'اسم العميل', en: 'Customer name' })} />
          </div>
          <button className="qvi-btn ghost" onClick={eng.saveApiKeyForCustomer} disabled={!eng.customerName.trim() || !eng.apiKey.trim()}>
            {t({ ar: 'حفظ المفتاح', en: 'Save key' })}
          </button>
        </div>
        {Object.keys(eng.savedKeys || {}).length > 0 && (
          <div className="qvi-api-chips">
            {Object.keys(eng.savedKeys).map((name) => (
              <div key={name} className={`qvi-api-chip${eng.savedKeys[name] === eng.apiKey.trim() ? ' active' : ''}`}>
                <span onClick={() => eng.loadSavedApiKey(name)}>{name}</span>
                <span className="x" onClick={() => eng.removeSavedApiKey(name)} title={t({ ar: 'حذف', en: 'Remove' })}>×</span>
              </div>
            ))}
          </div>
        )}

        <div className="qvi-actions">
          <button className="qvi-btn" disabled={eng.busy} onClick={eng.connect}>
            {eng.busy ? t({ ar: 'جاري الجلب…', en: 'Fetching…' }) : t({ ar: 'جلب الموردين الموجودين', en: 'Fetch existing vendors' })}
          </button>
        </div>
        <Note note={eng.notes.api} />
        {eng.connected && (
          <div className="qvi-chips">
            <span className="chip ok">{t({ ar: 'الموجودون فعلاً', en: 'Existing already' })} <b>{eng.existingContacts.length}</b></span>
          </div>
        )}
        <div className="qvi-msg info" style={{ marginTop: 12 }}>
          {t({
            ar: 'هذا الاتصال يُستخدَم فقط لكشف تكرار الاسم قبل الإنشاء (اسم مطابق أو مشابه جداً لمورد موجود فعلاً) — ولا حاجة له لمتابعة رفع الملف وتصدير القالب، لكنه ضروري لتفعيل «الإرسال المباشر عبر API» بالخطوة الأخيرة.',
            en: 'This connection is used only to detect name duplicates before creating a record — you can continue to file upload and template export without it, but it is required to enable "Send directly via API" in the last step.',
          })}
        </div>

        <div className="qvi-actions-bar">
          <div />
          <button className="qvi-btn" onClick={() => eng.setStep(2)}>
            {t({ ar: 'التالي: ملف الموردين ←', en: "Next: vendors' file →" })}
          </button>
        </div>
      </div>
    </section>
  );
}
