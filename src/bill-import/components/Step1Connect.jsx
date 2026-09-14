import { useState } from 'react';
import { useLanguage } from '../../language.jsx';
import DropZone from './DropZone.jsx';
import Note from './Note.jsx';
import { SafeInput, SafeTextarea } from '../../lib/SafeInput.jsx';

// [إعادة تصميم 2026-09-14] طلب صريح من المستخدم: "خلي شكلها زي فواتير
// المبيعات — مربعات، ولما ارفق فيها تصير خضراء، ولو عملت API ما يلزم ارفق
// ملفات إلا القالب الرسمي وأروح للخطوة التالية". بطاقة عامة صغيرة (نفس مبدأ
// UploadCard.jsx بأداة فواتير المبيعات) — required بحد أحمر، loaded بحد
// وخلفية خضراء. لا تغيير على أي منطق جلب/تحقق — عرض فقط.
function UpCard({ id, required, title, hint, status, loaded, children }) {
  const { t } = useLanguage();
  return (
    <div className={`qbi-upcard${required ? ' required' : ''}${loaded ? ' loaded' : ''}`} id={id}>
      {required ? <div className="qbi-tag">{t({ ar: 'إلزامي', en: 'Required' })}</div> : <div className="qbi-optional-tag">{t({ ar: 'اختياري', en: 'Optional' })}</div>}
      <h4>{title}</h4>
      <p className="hint">{hint}</p>
      {children}
      <div className="qbi-status-line">{status}</div>
    </div>
  );
}

/** الخطوة ١: الاتصال بالواجهة، ورفع القالب المعتمد، وبديل رفع القوائم يدوياً */
export default function Step1Connect({ eng }) {
  const { t } = useLanguage();
  const [taxesText, setTaxesText] = useState('ضريبة القيمة المضافة 15% = 15\nمعفاة = 0');
  const [locationsText, setLocationsText] = useState('Main الرئيسي');

  const c = eng.catalog;
  const noBuy = c.products.filter((p) => p.purchasable === false || p.active === false).length;

  // [إضافة] رفع/تطبيق حقل واحد فقط فورًا عند اختيار الملف (بدل زر "اعتماد"
  // جماعي واحد) — نفس دالة loadManualLists الموجودة أصلاً بلا أي تعديل على
  // منطقها أو شروط التحقق بداخلها (لازالت تتطلب ضرائب/مواقع صالحة — من القالب
  // لو مرفوع، وإلا من الحقلين تحت)، فقط تُستدعى لحقل واحد بدل دفعة واحدة.
  const applyProducts = (file) => eng.loadManualLists({ productsFile: file, vendorsFile: null, taxesText, locationsText });
  const applyVendors = (file) => eng.loadManualLists({ productsFile: null, vendorsFile: file, taxesText, locationsText });
  const applyTaxesLocations = () => eng.loadManualLists({ productsFile: null, vendorsFile: null, taxesText, locationsText });

  return (
    <section>
      <div className="qbi-card">
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

        <div className="qbi-api-row">
          <div className="qbi-api-field" style={{ flex: '1 1 200px' }}>
            <span>{t({ ar: 'اسم العميل (للحفظ)', en: 'Customer name (to save)' })}</span>
            <SafeInput type="text" value={eng.customerName} onChange={(e) => eng.setCustomerName(e.target.value)}
              placeholder={t({ ar: 'اسم العميل', en: 'Customer name' })} />
          </div>
          <button className="qbi-btn ghost" onClick={eng.saveApiKeyForCustomer} disabled={!eng.customerName.trim() || !eng.apiKey.trim()}>
            {t({ ar: 'حفظ المفتاح', en: 'Save key' })}
          </button>
        </div>
        {Object.keys(eng.savedKeys || {}).length > 0 && (
          <div className="qbi-api-chips">
            {Object.keys(eng.savedKeys).map((name) => (
              <div key={name} className={`qbi-api-chip${eng.savedKeys[name] === eng.apiKey.trim() ? ' active' : ''}`}>
                <span onClick={() => eng.loadSavedApiKey(name)}>{name}</span>
                <span className="x" onClick={() => eng.removeSavedApiKey(name)} title={t({ ar: 'حذف', en: 'Remove' })}>×</span>
              </div>
            ))}
          </div>
        )}

        <div className="qbi-actions">
          <button className="qbi-btn" disabled={eng.busy} onClick={eng.connect}>
            {eng.busy ? t({ ar: 'جاري الجلب…', en: 'Fetching…' }) : t({ ar: 'جلب بيانات المنشأة', en: "Fetch the account's data" })}
          </button>
        </div>
        <Note note={eng.notes.api} />
        {(c.products.length || c.vendors.length) ? (
          <div className="qbi-chips">
            <span className="chip ok">{t({ ar: 'المنتجات', en: 'Products' })} <b>{c.products.length}</b></span>
            <span className="chip ok">{t({ ar: 'الموردون', en: 'Vendors' })} <b>{c.vendors.length}</b></span>
            <span className="chip ok">{t({ ar: 'الضرائب', en: 'Taxes' })} <b>{c.taxes.length}</b></span>
            <span className="chip ok">{t({ ar: 'المواقع', en: 'Locations' })} <b>{c.locations.length}</b></span>
            {noBuy > 0 && <span className="chip warn">{t({ ar: 'منتجات غير متاحة للشراء', en: 'Products not available for purchase' })} <b>{noBuy}</b></span>}
          </div>
        ) : null}
      </div>

      {/* [إعادة تصميم] القالب/المنتجات/الموردون كبطاقات — تصير خضراء تلقائيًا
          سواء جاءت البيانات عبر API أو رفع يدوي. لو الاتصال عبر API نجح، هذه
          البطاقات تصير جاهزة (خضراء) من تلقاء نفسها بلا أي رفع إضافي — القالب
          فقط يبقى مطلوبًا رفعه دائمًا (لا بديل API له، راجع تعليق قديم عن سبب
          ذلك بمنطق الأداة). */}
      <div className="qbi-grid4">
        <UpCard
          required
          title={t({ ar: 'قالب قيود المعتمد', en: "Qoyod's approved template" })}
          hint={t({ ar: 'نزّله من صفحة استيراد فواتير المشتريات وارفعه هنا. تُقرأ منه القوائم المنسدلة كما هي.', en: "Download it from the purchase-invoice import page and upload it here. Its dropdown lists are read as-is." })}
          loaded={!!eng.tpl}
          status={eng.tpl
            ? t({ ar: `تم ✓ — ${eng.tpl.locations.length} موقع، ${eng.tpl.taxes.length} ضريبة`, en: `Done ✓ — ${eng.tpl.locations.length} location(s), ${eng.tpl.taxes.length} tax(es)` })
            : t({ ar: 'لم يُرفع بعد', en: 'Not uploaded yet' })}
        >
          <DropZone accept=".xlsx" label={t({ ar: 'اسحب ملف القالب هنا أو انقر للاختيار', en: 'Drag the template file here or click to choose' })} onFile={eng.loadTemplate} />
          <Note note={eng.notes.tpl} />
        </UpCard>

        <UpCard
          title={t({ ar: 'ملف المنتجات', en: 'Products file' })}
          hint={t({ ar: 'يُجلب تلقائيًا عبر API أعلاه، أو ارفعه هنا يدويًا (يُقرأ منه عمود «يُشترى؟»).', en: 'Fetched automatically via the API above, or upload it here manually (the "Purchasable?" column is read from it).' })}
          loaded={c.products.length > 0}
          status={c.products.length > 0
            ? t({
              ar: `تم ✓ — ${c.products.length} منتج${eng.catalogSource === 'api' ? ' (عبر API)' : ''}`,
              en: `Done ✓ — ${c.products.length} product(s)${eng.catalogSource === 'api' ? ' (via API)' : ''}`,
            })
            : t({ ar: 'لم يُجلب/يُرفع بعد', en: 'Not fetched/uploaded yet' })}
        >
          <DropZone accept=".xlsx,.xls,.csv" label={t({ ar: 'اسحب ملف المنتجات هنا أو انقر للاختيار', en: 'Drag the products file here or click to choose' })} onFile={applyProducts} />
        </UpCard>

        <UpCard
          title={t({ ar: 'ملف الموردين', en: 'Vendors file' })}
          hint={t({ ar: 'يُجلب تلقائيًا عبر API أعلاه، أو ارفعه هنا يدويًا.', en: 'Fetched automatically via the API above, or upload it here manually.' })}
          loaded={c.vendors.length > 0}
          status={c.vendors.length > 0
            ? t({
              ar: `تم ✓ — ${c.vendors.length} مورد${eng.catalogSource === 'api' ? ' (عبر API)' : ''}`,
              en: `Done ✓ — ${c.vendors.length} vendor(s)${eng.catalogSource === 'api' ? ' (via API)' : ''}`,
            })
            : t({ ar: 'لم يُجلب/يُرفع بعد', en: 'Not fetched/uploaded yet' })}
        >
          <DropZone accept=".xlsx,.xls,.csv" label={t({ ar: 'اسحب ملف الموردين هنا أو انقر للاختيار', en: 'Drag the vendors file here or click to choose' })} onFile={applyVendors} />
        </UpCard>

        {/* [إعادة تصميم] بطاقة الضرائب/المواقع اليدوية تظهر فقط لو ما رُفع
            القالب بعد — القالب يملأ الاثنتين فورًا عند رفعه ويجعل هذه البطاقة
            بلا أثر عمليًا (نفس شرط "يُتجاهل عند رفع القالب" الأصلي بمنطق
            loadManualLists، هنا فقط نخفيها بدل إظهارها بلا فائدة). */}
        {!eng.tpl && (
          <UpCard
            title={t({ ar: 'الضرائب والمواقع (يدويًا)', en: 'Taxes & locations (manual)' })}
            hint={t({ ar: 'فقط لو تعذّر رفع القالب أعلاه — سطر لكل ضريبة بصيغة «الاسم = النسبة»، واسم موقع في كل سطر.', en: "Only if you can't upload the template above — one tax per line as \"name = rate\", one location name per line." })}
            loaded={c.taxes.length > 0 && c.locations.length > 0}
            status={c.taxes.length > 0 && c.locations.length > 0
              ? t({ ar: `تم ✓ — ${c.taxes.length} ضريبة، ${c.locations.length} موقع`, en: `Done ✓ — ${c.taxes.length} tax(es), ${c.locations.length} location(s)` })
              : t({ ar: 'لم يُطبَّق بعد', en: 'Not applied yet' })}
          >
            <SafeTextarea rows={2} value={taxesText} onChange={(e) => setTaxesText(e.target.value)} />
            <SafeTextarea rows={2} value={locationsText} onChange={(e) => setLocationsText(e.target.value)} style={{ marginTop: 6 }} />
            <button className="qbi-btn ghost" style={{ marginTop: 8 }} onClick={applyTaxesLocations}>
              {t({ ar: 'تطبيق', en: 'Apply' })}
            </button>
          </UpCard>
        )}
      </div>
      <Note note={eng.notes.manual} />

      <div className="qbi-actions-bar">
        <div />
        <button className="qbi-btn" disabled={!eng.readyForStep2} onClick={() => eng.setStep(2)}>
          {t({ ar: 'التالي: ملف العميل ←', en: 'Next: client file →' })}
        </button>
      </div>
    </section>
  );
}
