import React, { useRef, useState } from 'react';
import InvoiceGrid from './InvoiceGrid.jsx';
import InvoiceImportMappingPanel from './InvoiceImportMappingPanel.jsx';
import AmbiguityPanel from './AmbiguityPanel.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';

// نسخ لتصميم قسم step2 الأصلي كاملًا (رفع ملف فواتير غير منظم + شريط أدوات + الجدول).
export default function Step2Entry({ engine }) {
  const {
    template, rows, issues, customersRef, productsRef, dateSep,
    invoiceImportFile, invoiceImportGuesses, invoiceImportStatus, hasExistingData,
    uploadInvoiceImportFile, cancelInvoiceImportMapping, confirmInvoiceImportMapping,
    ambiguities, applyAmbiguityResolutions,
    addInvoiceRow, addItemRow, clearAllRows, setDateFormat, updateCell, deleteRow, pasteGrid,
    goToStep, refs,
  } = engine;

  const fileInputRef = useRef(null);
  const [pendingMapping, setPendingMapping] = useState(null); // {mapping} في انتظار قرار إضافة/استبدال
  const [confirmClear, setConfirmClear] = useState(false);

  const onConfirmMapping = (mapping) => {
    if (hasExistingData) { setPendingMapping({ mapping }); return; }
    confirmInvoiceImportMapping(mapping, { append: false });
  };

  return (
    <div className="qsv-panel">
      <h2>الخطوة 2: إدخال بيانات الفواتير</h2>
      <div className="qsv-note-box">
        💡 يمكنك <b>اللصق المباشر</b> من إكسل: انسخ نطاقًا من جدول (بنفس ترتيب الأعمدة الظاهر أدناه
        من مرجع الفاتورة حتى الضريبة%)، ثم اضغط داخل أي خلية في الجدول أدناه واضغط Ctrl+V — سيتم
        توزيع البيانات تلقائيًا بدءًا من تلك الخلية، مع إنشاء أسطر جديدة تلقائيًا حسب الحاجة.
      </div>

      <div className="qsv-upcard" id="card-invoice-import" style={{ textAlign: 'right', marginBottom: 16 }}>
        <h4>📤 أو ارفع ملف بيانات فواتيرك (بأي ترتيب/تسمية أعمدة)</h4>
        <p className="qsv-hint" style={{ margin: '4px 0 10px' }}>
          ارفع ملف Excel أو CSV يحتوي بيانات فواتيرك الحالية بأي شكل غير منظم — ستقوم بمطابقة كل عمود
          من ملفك مع الحقل المناسب هنا، وسيتم تعبئة الجدول أدناه تلقائيًا.
        </p>
        <label className="qsv-btn secondary" onClick={() => fileInputRef.current?.click()}>
          اختر ملف الفواتير
          <input
            ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
            onChange={(e) => { const f = e.target.files[0]; if (f) uploadInvoiceImportFile(f); e.target.value = ''; }}
          />
        </label>
        <div className="qsv-status-line">{invoiceImportStatus}</div>
        <div id="invoice-import-mapping-area">
          {invoiceImportFile.headers.length > 0 && invoiceImportGuesses && (
            <InvoiceImportMappingPanel
              headers={invoiceImportFile.headers} rawRows={invoiceImportFile.rows}
              guesses={invoiceImportGuesses} refs={refs}
              onConfirm={onConfirmMapping} onCancel={cancelInvoiceImportMapping}
            />
          )}
        </div>
      </div>

      <AmbiguityPanel ambiguities={ambiguities} onApply={applyAmbiguityResolutions} />

      <div className="qsv-toolbar">
        <button type="button" className="qsv-btn" onClick={addInvoiceRow}>➕ فاتورة جديدة</button>
        <button type="button" className="qsv-btn secondary" onClick={addItemRow}>➕ بند لنفس آخر فاتورة</button>
        <button type="button" className="qsv-btn ghost" onClick={() => setConfirmClear(true)}>🗑️ إفراغ الكل</button>
        <div className="qsv-flex-space" />
        <label className="qsv-kv" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          صيغة التاريخ:
          <select style={{ width: 'auto' }} value={dateSep} onChange={(e) => setDateFormat(e.target.value)}>
            <option value="/">DD/MM/YYYY (الصيغة المؤكَّدة مع قيود)</option>
            <option value=".">DD.MM.YYYY</option>
          </select>
        </label>
        <span className="qsv-kv">{rows.length} سطر</span>
      </div>

      <InvoiceGrid
        tableId="data-grid" rows={rows} template={template} customersRef={customersRef} productsRef={productsRef}
        issues={issues} revalidate={false} onUpdateCell={updateCell} onDeleteRow={deleteRow} onPasteGrid={pasteGrid}
      />

      <div className="qsv-actions-bar">
        <button type="button" className="qsv-btn secondary" onClick={() => goToStep(1)}>→ رجوع</button>
        <div className="qsv-right">
          <button type="button" className="qsv-btn" onClick={() => goToStep(3)}>التالي: التحقق والتحليل ←</button>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingMapping}
        title="الجدول يحتوي على بيانات"
        message={pendingMapping ? 'اضغط "إضافة" لإضافة الأسطر المستوردة إلى ما هو موجود، أو "استبدال" لاستبدال محتوى الجدول بالكامل بالأسطر المستوردة فقط.' : ''}
        confirmLabel="إضافة" cancelLabel="استبدال"
        onConfirm={() => { confirmInvoiceImportMapping(pendingMapping.mapping, { append: true }); setPendingMapping(null); }}
        onCancel={() => { confirmInvoiceImportMapping(pendingMapping.mapping, { append: false }); setPendingMapping(null); }}
      />
      <ConfirmDialog
        open={confirmClear}
        title="إفراغ كل الأسطر"
        message="هل أنت متأكد من إفراغ كل الأسطر؟"
        confirmLabel="إفراغ" cancelLabel="تراجع"
        onConfirm={() => { clearAllRows(); setConfirmClear(false); }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
