import React from 'react';
import UploadCard from './UploadCard.jsx';
import MappingTable from './MappingTable.jsx';
import WideStockMappingTable from './WideStockMappingTable.jsx';
import { COLUMNS, MAPPING_DEFS } from '../engine/constants.js';
import { detectStockFormat } from '../engine/columnShape.js';

// نفس رسالة تنبيه القالب الأصلية (setCardLoaded + template-layout-warning) حرفيًا.
function templateStatus(template) {
  if (!template.loaded) return 'لم يُرفع بعد';
  const dd = template.dropdowns;
  const missing = template.missingFields || [];
  return `تم ✓ — ${dd.G.length} موقع، ${dd.V.length} فئة ضريبية، ${dd.H.length} طريقة دفع — تم التعرف على ${COLUMNS.length - missing.length} عمودًا من ${COLUMNS.length} في القالب`;
}

function TemplateWarning({ template }) {
  if (!template.loaded) return null;
  const missing = template.missingFields || [];
  const missingRequired = missing.filter((k) => COLUMNS.find((c) => c.key === k).required);
  if (missingRequired.length) {
    const names = missingRequired.map((k) => COLUMNS.find((c) => c.key === k).name).join('، ');
    return (
      <div className="qsv-note-box err" style={{ marginTop: 10 }}>
        ⛔ <b>لم يُتعرَّف على موضع أعمدة إلزامية داخل القالب:</b> {names}.<br />
        ستخرج هذه الأعمدة فارغة في الملف النهائي. تأكد أنك رفعت قالب قيود الأصلي دون تعديل على صف العناوين.
      </div>
    );
  }
  if (missing.length) {
    const names = missing.map((k) => COLUMNS.find((c) => c.key === k).name).join('، ');
    return (
      <div className="qsv-note-box warn" style={{ marginTop: 10 }}>
        ⚠️ أعمدة اختيارية غير موجودة في هذا القالب: {names} — ستُترك فارغة.
      </div>
    );
  }
  return null;
}

export default function Step1References({ engine }) {
  const { template, productsRef, stockRef, customersRef, uploadTemplate, uploadReferenceFile, confirmReferenceMapping, goToStep } = engine;

  const stockIsWide = stockRef.raw && detectStockFormat(stockRef.headers, stockRef.raw, template.dropdowns.G) === 'wide';

  return (
    <div className="qsv-panel">
      <h2>الخطوة 1: رفع الملفات المرجعية</h2>
      <p className="qsv-hint">ارفع قالب قيود المحمَّل حديثًا (إلزامي)، وباقي الملفات (اختيارية لكن موصى بها بشدة لتحقق أدق).</p>

      <div className="qsv-grid4">
        <UploadCard
          id="card-template" required title="قالب قيود (xlsx)"
          hint="نزّله الآن من صفحة استيراد الفواتير في قيود، ثم ارفعه هنا فورًا (بدون تعديل)."
          accept=".xlsx" status={templateStatus(template)} loaded={template.loaded}
          onFile={uploadTemplate}
        >
          <TemplateWarning template={template} />
        </UploadCard>

        <UploadCard
          id="card-products" title="تقرير المنتجات" hint="لمعرفة المنتجات الموجودة وحالتها (تُباع / لا تُباع)."
          accept=".xlsx,.csv,.xls"
          status={productsRef.loaded ? `تم ✓ — ${productsRef.bySku.size} منتج مفهرس${productsRef.nonStockedCount ? ` (منها ${productsRef.nonStockedCount} غير مخزَّن — بلا حد للكمية)` : ''}` : (productsRef.raw ? 'جارٍ التحليل...' : 'لم يُرفع بعد')}
          loaded={productsRef.loaded}
          onFile={(f) => uploadReferenceFile('products', f)}
        />

        <UploadCard
          id="card-stock" title="تقرير مواقع المنتجات" hint="لمعرفة الكمية المتوفرة من كل منتج في كل موقع."
          accept=".xlsx,.csv,.xls"
          status={stockRef.loaded ? `تم ✓ — ${stockRef.groupCount} مجموعة (منتج × موقع)${stockRef.locHeaderCount ? ` من ${stockRef.locHeaderCount} عمود موقع` : ''}` : (stockRef.raw ? 'جارٍ التحليل...' : 'لم يُرفع بعد')}
          loaded={stockRef.loaded}
          onFile={(f) => uploadReferenceFile('stock', f)}
        />

        <UploadCard
          id="card-customers" title="ملف العملاء" hint="لمعرفة الأرقام المرجعية للعملاء وحالتهم."
          accept=".xlsx,.csv,.xls"
          status={customersRef.loaded ? `تم ✓ — ${customersRef.byRef.size} عميل مفهرس` : (customersRef.raw ? 'جارٍ التحليل...' : 'لم يُرفع بعد')}
          loaded={customersRef.loaded}
          onFile={(f) => uploadReferenceFile('customers', f)}
        />
      </div>

      <div id="mapping-area">
        {productsRef.raw && !productsRef.loaded && (
          <MappingTable
            kind="products" title="مطابقة أعمدة تقرير المنتجات" defs={MAPPING_DEFS.products}
            headers={productsRef.headers} rows={productsRef.raw}
            onConfirm={(m) => confirmReferenceMapping('products', m)}
          />
        )}
        {stockRef.raw && !stockRef.loaded && (
          stockIsWide ? (
            <WideStockMappingTable
              headers={stockRef.headers} rows={stockRef.raw} templateLocations={template.dropdowns.G}
              onConfirm={(m) => confirmReferenceMapping('stock', m)}
            />
          ) : (
            <MappingTable
              kind="stock" title="مطابقة أعمدة تقرير مواقع المنتجات" defs={MAPPING_DEFS.stock}
              headers={stockRef.headers} rows={stockRef.raw}
              onConfirm={(m) => confirmReferenceMapping('stock', m)}
            />
          )
        )}
        {customersRef.raw && !customersRef.loaded && (
          <MappingTable
            kind="customers" title="مطابقة أعمدة ملف العملاء" defs={MAPPING_DEFS.customers}
            headers={customersRef.headers} rows={customersRef.raw}
            onConfirm={(m) => confirmReferenceMapping('customers', m)}
          />
        )}
      </div>

      <div className="qsv-actions-bar">
        <div />
        <div className="qsv-right">
          <button type="button" className="qsv-btn" disabled={!template.loaded} onClick={() => goToStep(2)}>
            التالي: إدخال بيانات الفواتير ←
          </button>
        </div>
      </div>
    </div>
  );
}
