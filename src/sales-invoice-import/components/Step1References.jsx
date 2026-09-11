import React from 'react';
import { useLanguage } from '../../language.jsx';
import UploadCard from './UploadCard.jsx';
import MappingTable from './MappingTable.jsx';
import WideStockMappingTable from './WideStockMappingTable.jsx';
import ApiFetchPanel from './ApiFetchPanel.jsx'; // [إضافة] جلب اختياري عبر API — راجع تعليق رأس الملف
import { COLUMNS, MAPPING_DEFS } from '../engine/constants.js';
import { detectStockFormat } from '../engine/columnShape.js';
import { downloadProductsRefFile, downloadStockRefFile, downloadCustomersRefFile } from '../io/referenceExport.js';

// [إضافة] زر "تنزيل الملف" يظهر فقط تحت بطاقة جُلبت بياناتها عبر API (raw===null
// هو نفس التمييز الذي تنتجه fetchSalesReferencesFromApi — لا وجود لملف مرفوع
// يدويًا أصلاً بهذه الحالة). لا يظهر إطلاقًا على رفع يدوي (raw موجود دومًا هناك).
function ApiRefDownloadButton({ onClick }) {
  const { t } = useLanguage();
  return (
    <button type="button" className="qsv-btn ghost" style={{ marginTop: 8 }} onClick={onClick}>
      ⬇️ {t({ ar: 'تنزيل الملف المجلوب', en: 'Download fetched file' })}
    </button>
  );
}

// نفس رسالة تنبيه القالب الأصلية (setCardLoaded + template-layout-warning) حرفيًا — الآن ثنائية
// اللغة عبر t()؛ أسماء الأعمدة (COLUMNS[].name) تبقى كما يعرّفها المحرك (طبقة عمل مؤجَّلة).
function templateStatus(template, t) {
  if (!template.loaded) return t({ ar: 'لم يُرفع بعد', en: 'Not uploaded yet' });
  const dd = template.dropdowns;
  const missing = template.missingFields || [];
  return t({
    ar: `تم ✓ — ${dd.G.length} موقع، ${dd.V.length} فئة ضريبية، ${dd.H.length} طريقة دفع — تم التعرف على ${COLUMNS.length - missing.length} عمودًا من ${COLUMNS.length} في القالب`,
    en: `Done ✓ — ${dd.G.length} location(s), ${dd.V.length} tax categor(y/ies), ${dd.H.length} payment method(s) — recognized ${COLUMNS.length - missing.length} of ${COLUMNS.length} columns in the template`,
  });
}

function TemplateWarning({ template }) {
  const { t } = useLanguage();
  if (!template.loaded) return null;
  const missing = template.missingFields || [];
  const missingRequired = missing.filter((k) => COLUMNS.find((c) => c.key === k).required);
  if (missingRequired.length) {
    const names = missingRequired.map((k) => COLUMNS.find((c) => c.key === k).name).join('، ');
    return (
      <div className="qsv-note-box err" style={{ marginTop: 10 }}>
        ⛔ <b>{t({ ar: 'لم يُتعرَّف على موضع أعمدة إلزامية داخل القالب:', en: 'Could not locate required columns within the template:' })}</b> {names}.<br />
        {t({ ar: 'ستخرج هذه الأعمدة فارغة في الملف النهائي. تأكد أنك رفعت قالب قيود الأصلي دون تعديل على صف العناوين.', en: 'These columns will come out empty in the final file. Make sure you uploaded the original Qoyod template without modifying the header row.' })}
      </div>
    );
  }
  if (missing.length) {
    const names = missing.map((k) => COLUMNS.find((c) => c.key === k).name).join('، ');
    return (
      <div className="qsv-note-box warn" style={{ marginTop: 10 }}>
        ⚠️ {t({ ar: 'أعمدة اختيارية غير موجودة في هذا القالب:', en: 'Optional columns not found in this template:' })} {names} — {t({ ar: 'ستُترك فارغة.', en: 'they will be left empty.' })}
      </div>
    );
  }
  return null;
}

export default function Step1References({ engine }) {
  const { t } = useLanguage();
  const { template, productsRef, stockRef, customersRef, uploadTemplate, uploadReferenceFile, confirmReferenceMapping, goToStep, uploadError, customerName } = engine;

  // بادئة اسم الملف باسم العميل المحفوظ بلوحة API لو موجود (نفس الحقل المستخدم
  // بـApiFetchPanel.jsx لحفظ المفتاح) — تجميلية بحتة، بلا أي أثر على البيانات.
  const filenamePrefix = customerName?.trim() ? `${customerName.trim()}-` : '';

  const stockIsWide = stockRef.raw && detectStockFormat(stockRef.headers, stockRef.raw, template.dropdowns.G) === 'wide';

  return (
    <div className="qsv-panel">
      <h2>{t({ ar: 'الخطوة 1: رفع الملفات المرجعية', en: 'Step 1: Upload reference files' })}</h2>
      <p className="qsv-hint">{t({ ar: 'ارفع قالب قيود المحمَّل حديثًا (إلزامي)، وباقي الملفات (اختيارية لكن موصى بها بشدة لتحقق أدق).', en: "Upload a freshly downloaded Qoyod template (required), and the rest of the files (optional, but strongly recommended for more accurate validation)." })}</p>

      {/* [إصلاح] رسالة خطأ رفع ظاهرة — كان فشل قراءة أي ملف يُبتلَع بصمت تمامًا */}
      {uploadError && <div className="qsv-note-box err" style={{ marginBottom: 10 }}>⛔ {uploadError}</div>}

      <ApiFetchPanel engine={engine} />

      <div className="qsv-grid4">
        <UploadCard
          id="card-template" required title={t({ ar: 'قالب قيود (xlsx)', en: 'Qoyod template (xlsx)' })}
          hint={t({ ar: 'نزّله الآن من صفحة استيراد الفواتير في قيود، ثم ارفعه هنا فورًا (بدون تعديل).', en: "Download it now from Qoyod's invoice import page, then upload it here right away (without modifying it)." })}
          accept=".xlsx" status={templateStatus(template, t)} loaded={template.loaded}
          onFile={uploadTemplate}
        >
          <TemplateWarning template={template} />
        </UploadCard>

        <UploadCard
          id="card-products" title={t({ ar: 'تقرير المنتجات', en: 'Products report' })} hint={t({ ar: 'لمعرفة المنتجات الموجودة وحالتها (تُباع / لا تُباع).', en: 'To know which products exist and their status (sellable / not sellable).' })}
          accept=".xlsx,.csv,.xls"
          status={productsRef.loaded
            ? t({
              ar: `تم ✓ — ${productsRef.bySku.size} منتج مفهرس${productsRef.nonStockedCount ? ` (منها ${productsRef.nonStockedCount} غير مخزَّن — بلا حد للكمية)` : ''}`,
              en: `Done ✓ — ${productsRef.bySku.size} product(s) indexed${productsRef.nonStockedCount ? ` (${productsRef.nonStockedCount} of them non-stocked — no quantity limit)` : ''}`,
            })
            : (productsRef.raw ? t({ ar: 'جارٍ التحليل...', en: 'Analyzing...' }) : t({ ar: 'لم يُرفع بعد', en: 'Not uploaded yet' }))}
          loaded={productsRef.loaded}
          onFile={(f) => uploadReferenceFile('products', f)}
        >
          {productsRef.loaded && !productsRef.raw && (
            <ApiRefDownloadButton onClick={() => downloadProductsRefFile(productsRef, `${filenamePrefix}منتجات.xlsx`, t)} />
          )}
        </UploadCard>

        <UploadCard
          id="card-stock" title={t({ ar: 'تقرير مواقع المنتجات', en: 'Product locations report' })} hint={t({ ar: 'لمعرفة الكمية المتوفرة من كل منتج في كل موقع.', en: 'To know the available quantity of each product at each location.' })}
          accept=".xlsx,.csv,.xls"
          status={stockRef.loaded
            ? t({
              ar: `تم ✓ — ${stockRef.groupCount} مجموعة (منتج × موقع)${stockRef.locHeaderCount ? ` من ${stockRef.locHeaderCount} عمود موقع` : ''}`,
              en: `Done ✓ — ${stockRef.groupCount} group(s) (product × location)${stockRef.locHeaderCount ? ` from ${stockRef.locHeaderCount} location column(s)` : ''}`,
            })
            : (stockRef.raw ? t({ ar: 'جارٍ التحليل...', en: 'Analyzing...' }) : t({ ar: 'لم يُرفع بعد', en: 'Not uploaded yet' }))}
          loaded={stockRef.loaded}
          onFile={(f) => uploadReferenceFile('stock', f)}
        >
          {stockRef.loaded && !stockRef.raw && (
            <ApiRefDownloadButton onClick={() => downloadStockRefFile(stockRef, productsRef, `${filenamePrefix}مواقع-المنتجات.xlsx`, t)} />
          )}
        </UploadCard>

        <UploadCard
          id="card-customers" title={t({ ar: 'ملف العملاء', en: 'Customers file' })} hint={t({ ar: 'لمعرفة الأرقام المرجعية للعملاء وحالتهم.', en: "To know customers' reference numbers and their status." })}
          accept=".xlsx,.csv,.xls"
          status={customersRef.loaded
            ? t({ ar: `تم ✓ — ${customersRef.byRef.size} عميل مفهرس`, en: `Done ✓ — ${customersRef.byRef.size} customer(s) indexed` })
            : (customersRef.raw ? t({ ar: 'جارٍ التحليل...', en: 'Analyzing...' }) : t({ ar: 'لم يُرفع بعد', en: 'Not uploaded yet' }))}
          loaded={customersRef.loaded}
          onFile={(f) => uploadReferenceFile('customers', f)}
        >
          {customersRef.loaded && !customersRef.raw && (
            <ApiRefDownloadButton onClick={() => downloadCustomersRefFile(customersRef, `${filenamePrefix}العملاء.xlsx`, t)} />
          )}
        </UploadCard>
      </div>

      <div id="mapping-area">
        {productsRef.raw && !productsRef.loaded && (
          <MappingTable
            kind="products" title={t({ ar: 'مطابقة أعمدة تقرير المنتجات', en: 'Match the products report columns' })} defs={MAPPING_DEFS.products}
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
              kind="stock" title={t({ ar: 'مطابقة أعمدة تقرير مواقع المنتجات', en: 'Match the product locations report columns' })} defs={MAPPING_DEFS.stock}
              headers={stockRef.headers} rows={stockRef.raw}
              onConfirm={(m) => confirmReferenceMapping('stock', m)}
            />
          )
        )}
        {customersRef.raw && !customersRef.loaded && (
          <MappingTable
            kind="customers" title={t({ ar: 'مطابقة أعمدة ملف العملاء', en: 'Match the customers file columns' })} defs={MAPPING_DEFS.customers}
            headers={customersRef.headers} rows={customersRef.raw}
            onConfirm={(m) => confirmReferenceMapping('customers', m)}
          />
        )}
      </div>

      <div className="qsv-actions-bar">
        <div />
        <div className="qsv-right">
          <button type="button" className="qsv-btn" disabled={!template.loaded} onClick={() => goToStep(2)}>
            {t({ ar: 'التالي: إدخال بيانات الفواتير ←', en: 'Next: enter invoice data →' })}
          </button>
        </div>
      </div>
    </div>
  );
}
