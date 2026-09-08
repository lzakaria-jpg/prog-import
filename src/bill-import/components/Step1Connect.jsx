import { useState } from 'react';
import { useLanguage } from '../../language.jsx';
import DropZone from './DropZone.jsx';
import Note from './Note.jsx';
import { SafeInput, SafeTextarea } from '../../lib/SafeInput.jsx';

/** الخطوة ١: الاتصال بالواجهة، ورفع القالب المعتمد، وبديل رفع القوائم يدوياً */
export default function Step1Connect({ eng }) {
  const { t } = useLanguage();
  const [productsFile, setProductsFile] = useState(null);
  const [vendorsFile, setVendorsFile] = useState(null);
  const [taxesText, setTaxesText] = useState('ضريبة القيمة المضافة 15% = 15\nمعفاة = 0');
  const [locationsText, setLocationsText] = useState('Main الرئيسي');

  const c = eng.catalog;
  const noBuy = c.products.filter((p) => p.purchasable === false || p.active === false).length;

  return (
    <section>
      <div className="qbi-card">
        <h2>{t({ ar: 'الاتصال بواجهة قيود البرمجية', en: "Connect to Qoyod's API" })}</h2>
        <p className="hint">
          {t({ ar: 'المفتاح يُولَّد من إعدادات المنشأة، ويُرسل في ترويسة', en: "The key is generated from the account's settings, and is sent in the" })} <span className="mono">API-KEY</span> {t({ ar: 'ترويسة.', en: 'header.' })}
          {' '}{t({ ar: 'يبقى في ذاكرة المتصفح ولا يُخزَّن ولا يُرسل لأي طرف ثالث.', en: "It stays in the browser's memory and is never stored or sent to any third party." })}
        </p>
        <div className="qbi-grid2">
          <label className="f">
            <span>{t({ ar: 'مفتاح الواجهة (API Key)', en: 'API key' })}</span>
            <SafeInput type="password" value={eng.apiKey}
              onChange={(e) => eng.setApiKey(e.target.value)} placeholder={t({ ar: 'الصق المفتاح هنا', en: 'Paste the key here' })} />
          </label>
          <label className="f">
            <span>{t({ ar: 'عنوان الواجهة', en: 'API base URL' })}</span>
            <SafeInput type="text" className="mono" value={eng.baseUrl} onChange={(e) => eng.setBaseUrl(e.target.value)} />
          </label>
        </div>
        <label className="f">
          <span>{t({ ar: 'وسيط CORS (اختياري — يُسبق العنوان عند تشغيل الأداة من المتصفح مباشرة)', en: 'CORS proxy (optional — prefixed to the URL when the tool runs directly in the browser)' })}</span>
          <SafeInput type="text" className="mono" value={eng.proxy}
            onChange={(e) => eng.setProxy(e.target.value)} placeholder="http://localhost:8080/" />
        </label>
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

      <div className="qbi-card">
        <h2>{t({ ar: 'قالب قيود المعتمد', en: "Qoyod's approved template" })}</h2>
        <p className="hint">
          {t({
            ar: 'نزّل القالب من صفحة استيراد الفواتير في حساب العميل وارفعه هنا. تُقرأ منه القوائم المنسدلة كما هي: المواقع، الضرائب، حسابات وفئات خصم المستند، ووحدات التحويل — ويُكتب الملف النهائي داخله دون تغيير تنسيقه.',
            en: "Download the template from the invoice import page in the customer's account and upload it here. Its dropdown lists are read as-is: locations, taxes, document-discount accounts and categories, and conversion units — and the final file is written inside it without changing its formatting.",
          })}
        </p>
        <DropZone accept=".xlsx" label={t({ ar: 'اسحب ملف القالب هنا أو انقر للاختيار', en: 'Drag the template file here or click to choose' })} onFile={eng.loadTemplate} />
        <Note note={eng.notes.tpl} />
        {eng.tpl && (
          <div className="qbi-chips">
            <span className={`chip ${eng.tpl.locations.length ? 'ok' : ''}`}>{t({ ar: 'المواقع', en: 'Locations' })} <b>{eng.tpl.locations.length}</b></span>
            <span className={`chip ${eng.tpl.taxes.length ? 'ok' : ''}`}>{t({ ar: 'الضرائب', en: 'Taxes' })} <b>{eng.tpl.taxes.length}</b></span>
            <span className={`chip ${eng.tpl.units.length ? 'ok' : ''}`}>{t({ ar: 'وحدات التحويل', en: 'Conversion units' })} <b>{eng.tpl.units.length}</b></span>
            <span className={`chip ${eng.tpl.discAccounts.length ? 'ok' : ''}`}>{t({ ar: 'حسابات خصم المستند', en: 'Document-discount accounts' })} <b>{eng.tpl.discAccounts.length}</b></span>
            <span className={`chip ${eng.tpl.discTaxes.length ? 'ok' : ''}`}>{t({ ar: 'فئات ضريبة الخصم', en: 'Discount tax categories' })} <b>{eng.tpl.discTaxes.length}</b></span>
          </div>
        )}
      </div>

      <div className="qbi-card">
        <h2>{t({ ar: 'تحميل القوائم يدوياً', en: 'Upload the lists manually' })}</h2>
        <p className="hint">
          {t({
            ar: 'استخدم هذا إن تعذّر الاتصال المباشر (حظر CORS مثلاً): صدِّر المنتجات والموردين من قيود وارفعهما هنا. يُقرأ من ملف المنتجات عمود «يُشترى؟» لاستبعاد غير القابل للشراء.',
            en: 'Use this when a direct connection fails (a CORS block, for example): export products and vendors from Qoyod and upload them here. The "Purchasable?" column is read from the products file to exclude non-purchasable ones.',
          })}
        </p>
        <div className="qbi-grid3">
          <label className="f">
            <span>{t({ ar: 'ملف المنتجات (xlsx / csv)', en: 'Products file (xlsx / csv)' })}</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setProductsFile(e.target.files[0] || null)} />
          </label>
          <label className="f">
            <span>{t({ ar: 'ملف الموردين (xlsx / csv)', en: 'Vendors file (xlsx / csv)' })}</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setVendorsFile(e.target.files[0] || null)} />
          </label>
        </div>
        <label className="f">
          <span>{t({ ar: 'الضرائب — سطر لكل ضريبة بصيغة «الاسم = النسبة» (يُتجاهل عند رفع القالب)', en: 'Taxes — one line per tax in the form "name = rate" (ignored when the template is uploaded)' })}</span>
          <SafeTextarea rows={3} value={taxesText} onChange={(e) => setTaxesText(e.target.value)} />
        </label>
        <label className="f">
          <span>{t({ ar: 'المواقع (المخازن) — اسم في كل سطر (يُتجاهل عند رفع القالب)', en: 'Locations (warehouses) — one name per line (ignored when the template is uploaded)' })}</span>
          <SafeTextarea rows={2} value={locationsText} onChange={(e) => setLocationsText(e.target.value)} />
        </label>
        <div className="qbi-actions">
          <button className="qbi-btn ghost"
            onClick={() => eng.loadManualLists({ productsFile, vendorsFile, taxesText, locationsText })}>
            {t({ ar: 'اعتماد القوائم المرفوعة', en: 'Adopt the uploaded lists' })}
          </button>
        </div>
        <Note note={eng.notes.manual} />
      </div>
    </section>
  );
}
