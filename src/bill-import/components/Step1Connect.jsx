import { useState } from 'react';
import DropZone from './DropZone.jsx';
import Note from './Note.jsx';
import { SafeInput, SafeTextarea } from '../../lib/SafeInput.jsx';

/** الخطوة ١: الاتصال بالواجهة، ورفع القالب المعتمد، وبديل رفع القوائم يدوياً */
export default function Step1Connect({ eng }) {
  const [productsFile, setProductsFile] = useState(null);
  const [vendorsFile, setVendorsFile] = useState(null);
  const [taxesText, setTaxesText] = useState('ضريبة القيمة المضافة 15% = 15\nمعفاة = 0');
  const [locationsText, setLocationsText] = useState('Main الرئيسي');

  const c = eng.catalog;
  const noBuy = c.products.filter((p) => p.purchasable === false || p.active === false).length;

  return (
    <section>
      <div className="qbi-card">
        <h2>الاتصال بواجهة قيود البرمجية</h2>
        <p className="hint">
          المفتاح يُولَّد من إعدادات المنشأة، ويُرسل في ترويسة <span className="mono">API-KEY</span>.
          يبقى في ذاكرة المتصفح ولا يُخزَّن ولا يُرسل لأي طرف ثالث.
        </p>
        <div className="qbi-grid2">
          <label className="f">
            <span>مفتاح الواجهة (API Key)</span>
            <SafeInput type="password" value={eng.apiKey}
              onChange={(e) => eng.setApiKey(e.target.value)} placeholder="الصق المفتاح هنا" />
          </label>
          <label className="f">
            <span>عنوان الواجهة</span>
            <SafeInput type="text" className="mono" value={eng.baseUrl} onChange={(e) => eng.setBaseUrl(e.target.value)} />
          </label>
        </div>
        <label className="f">
          <span>وسيط CORS (اختياري — يُسبق العنوان عند تشغيل الأداة من المتصفح مباشرة)</span>
          <SafeInput type="text" className="mono" value={eng.proxy}
            onChange={(e) => eng.setProxy(e.target.value)} placeholder="http://localhost:8080/" />
        </label>
        <div className="qbi-actions">
          <button className="qbi-btn" disabled={eng.busy} onClick={eng.connect}>
            {eng.busy ? 'جاري الجلب…' : 'جلب بيانات المنشأة'}
          </button>
        </div>
        <Note note={eng.notes.api} />
        {(c.products.length || c.vendors.length) ? (
          <div className="qbi-chips">
            <span className="chip ok">المنتجات <b>{c.products.length}</b></span>
            <span className="chip ok">الموردون <b>{c.vendors.length}</b></span>
            <span className="chip ok">الضرائب <b>{c.taxes.length}</b></span>
            <span className="chip ok">المواقع <b>{c.locations.length}</b></span>
            {noBuy > 0 && <span className="chip warn">منتجات غير متاحة للشراء <b>{noBuy}</b></span>}
          </div>
        ) : null}
      </div>

      <div className="qbi-card">
        <h2>قالب قيود المعتمد</h2>
        <p className="hint">
          نزّل القالب من صفحة استيراد الفواتير في حساب العميل وارفعه هنا. تُقرأ منه القوائم المنسدلة كما هي:
          المواقع، الضرائب، حسابات وفئات خصم المستند، ووحدات التحويل — ويُكتب الملف النهائي داخله دون تغيير تنسيقه.
        </p>
        <DropZone accept=".xlsx" label="اسحب ملف القالب هنا أو انقر للاختيار" onFile={eng.loadTemplate} />
        <Note note={eng.notes.tpl} />
        {eng.tpl && (
          <div className="qbi-chips">
            <span className={`chip ${eng.tpl.locations.length ? 'ok' : ''}`}>المواقع <b>{eng.tpl.locations.length}</b></span>
            <span className={`chip ${eng.tpl.taxes.length ? 'ok' : ''}`}>الضرائب <b>{eng.tpl.taxes.length}</b></span>
            <span className={`chip ${eng.tpl.units.length ? 'ok' : ''}`}>وحدات التحويل <b>{eng.tpl.units.length}</b></span>
            <span className={`chip ${eng.tpl.discAccounts.length ? 'ok' : ''}`}>حسابات خصم المستند <b>{eng.tpl.discAccounts.length}</b></span>
            <span className={`chip ${eng.tpl.discTaxes.length ? 'ok' : ''}`}>فئات ضريبة الخصم <b>{eng.tpl.discTaxes.length}</b></span>
          </div>
        )}
      </div>

      <div className="qbi-card">
        <h2>تحميل القوائم يدوياً</h2>
        <p className="hint">
          استخدم هذا إن تعذّر الاتصال المباشر (حظر CORS مثلاً): صدِّر المنتجات والموردين من قيود وارفعهما هنا.
          يُقرأ من ملف المنتجات عمود «يُشترى؟» لاستبعاد غير القابل للشراء.
        </p>
        <div className="qbi-grid3">
          <label className="f">
            <span>ملف المنتجات (xlsx / csv)</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setProductsFile(e.target.files[0] || null)} />
          </label>
          <label className="f">
            <span>ملف الموردين (xlsx / csv)</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setVendorsFile(e.target.files[0] || null)} />
          </label>
        </div>
        <label className="f">
          <span>الضرائب — سطر لكل ضريبة بصيغة «الاسم = النسبة» (يُتجاهل عند رفع القالب)</span>
          <SafeTextarea rows={3} value={taxesText} onChange={(e) => setTaxesText(e.target.value)} />
        </label>
        <label className="f">
          <span>المواقع (المخازن) — اسم في كل سطر (يُتجاهل عند رفع القالب)</span>
          <SafeTextarea rows={2} value={locationsText} onChange={(e) => setLocationsText(e.target.value)} />
        </label>
        <div className="qbi-actions">
          <button className="qbi-btn ghost"
            onClick={() => eng.loadManualLists({ productsFile, vendorsFile, taxesText, locationsText })}>
            اعتماد القوائم المرفوعة
          </button>
        </div>
        <Note note={eng.notes.manual} />
      </div>
    </section>
  );
}
