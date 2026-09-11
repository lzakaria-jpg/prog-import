import React, { useRef, useState } from 'react';
import { useLanguage } from '../../language.jsx';
import InvoiceGrid from './InvoiceGrid.jsx';
import InvoiceImportMappingPanel from './InvoiceImportMappingPanel.jsx';
import AmbiguityPanel from './AmbiguityPanel.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';

// نسخ لتصميم قسم step2 الأصلي كاملًا (رفع ملف فواتير غير منظم + شريط أدوات + الجدول).
export default function Step2Entry({ engine }) {
  const { t } = useLanguage();
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
      <h2>{t({ ar: 'الخطوة 2: إدخال بيانات الفواتير', en: 'Step 2: Enter invoice data' })}</h2>
      <div className="qsv-note-box">
        💡 {t({ ar: 'يمكنك', en: 'You can' })} <b>{t({ ar: 'اللصق المباشر', en: 'paste directly' })}</b> {t({
          ar: 'من إكسل: انسخ نطاقًا من جدول (بنفس ترتيب الأعمدة الظاهر أدناه من مرجع الفاتورة حتى الضريبة%)، ثم اضغط داخل أي خلية في الجدول أدناه واضغط Ctrl+V — سيتم توزيع البيانات تلقائيًا بدءًا من تلك الخلية، مع إنشاء أسطر جديدة تلقائيًا حسب الحاجة.',
          en: 'from Excel: copy a range from a table (in the same column order shown below, from Invoice Ref through Tax%), then click inside any cell in the table below and press Ctrl+V — the data will be distributed automatically starting from that cell, creating new rows automatically as needed.',
        })}
      </div>

      <div className="qsv-upcard" id="card-invoice-import" style={{ textAlign: 'right', marginBottom: 16 }}>
        <h4>📤 {t({ ar: 'أو ارفع ملف بيانات فواتيرك (بأي ترتيب/تسمية أعمدة)', en: "Or upload your invoice data file (any column order/naming)" })}</h4>
        <p className="qsv-hint" style={{ margin: '4px 0 10px' }}>
          {t({
            ar: 'ارفع ملف Excel أو CSV يحتوي بيانات فواتيرك الحالية بأي شكل غير منظم — ستقوم بمطابقة كل عمود من ملفك مع الحقل المناسب هنا، وسيتم تعبئة الجدول أدناه تلقائيًا.',
            en: 'Upload an Excel or CSV file containing your existing invoice data in any unstructured shape — you will match each column of your file to the appropriate field here, and the table below will be filled in automatically.',
          })}
        </p>
        <label className="qsv-btn secondary" onClick={() => fileInputRef.current?.click()}>
          {t({ ar: 'اختر ملف الفواتير', en: 'Choose invoices file' })}
          <input
            ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
            onChange={(e) => { const f = e.target.files[0]; if (f) Promise.resolve(uploadInvoiceImportFile(f)).catch(() => {}); e.target.value = ''; }}
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
        <button type="button" className="qsv-btn" onClick={addInvoiceRow}>➕ {t({ ar: 'فاتورة جديدة', en: 'New invoice' })}</button>
        <button type="button" className="qsv-btn secondary" onClick={addItemRow}>➕ {t({ ar: 'بند لنفس آخر فاتورة', en: 'Item for the same last invoice' })}</button>
        <button type="button" className="qsv-btn ghost" onClick={() => setConfirmClear(true)}>🗑️ {t({ ar: 'إفراغ الكل', en: 'Clear all' })}</button>
        <div className="qsv-flex-space" />
        <label className="qsv-kv" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t({ ar: 'صيغة التاريخ:', en: 'Date format:' })}
          <select style={{ width: 'auto' }} value={dateSep} onChange={(e) => setDateFormat(e.target.value)}>
            <option value="/">DD/MM/YYYY ({t({ ar: 'الصيغة المؤكَّدة مع قيود', en: 'the confirmed format with Qoyod' })})</option>
            <option value=".">DD.MM.YYYY</option>
          </select>
        </label>
        <span className="qsv-kv">{rows.length} {t({ ar: 'سطر', en: 'row(s)' })}</span>
      </div>

      <InvoiceGrid
        tableId="data-grid" rows={rows} template={template} customersRef={customersRef} productsRef={productsRef}
        taxesRef={engine.taxesRef} locationOptions={engine.locationOptions} projectsRef={engine.projectsRef} stockRef={engine.stockRef}
        issues={issues} revalidate={false} onUpdateCell={updateCell} onDeleteRow={deleteRow} onPasteGrid={pasteGrid}
      />

      <div className="qsv-actions-bar">
        <button type="button" className="qsv-btn secondary" onClick={() => goToStep(1)}>→ {t({ ar: 'رجوع', en: 'Back' })}</button>
        <div className="qsv-right">
          <button type="button" className="qsv-btn" onClick={() => goToStep(3)}>{t({ ar: 'التالي: التحقق والتحليل ←', en: 'Next: validate & analyze →' })}</button>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingMapping}
        title={t({ ar: 'الجدول يحتوي على بيانات', en: 'The table already has data' })}
        message={pendingMapping ? t({ ar: 'اضغط "إضافة" لإضافة الأسطر المستوردة إلى ما هو موجود، أو "استبدال" لاستبدال محتوى الجدول بالكامل بالأسطر المستوردة فقط.', en: 'Click "Add" to add the imported rows to what already exists, or "Replace" to replace the whole table content with only the imported rows.' }) : ''}
        confirmLabel={t({ ar: 'إضافة', en: 'Add' })} cancelLabel={t({ ar: 'استبدال', en: 'Replace' })}
        onConfirm={() => { confirmInvoiceImportMapping(pendingMapping.mapping, { append: true }); setPendingMapping(null); }}
        onCancel={() => { confirmInvoiceImportMapping(pendingMapping.mapping, { append: false }); setPendingMapping(null); }}
      />
      <ConfirmDialog
        open={confirmClear}
        title={t({ ar: 'إفراغ كل الأسطر', en: 'Clear all rows' })}
        message={t({ ar: 'هل أنت متأكد من إفراغ كل الأسطر؟', en: 'Are you sure you want to clear all rows?' })}
        confirmLabel={t({ ar: 'إفراغ', en: 'Clear' })} cancelLabel={t({ ar: 'تراجع', en: 'Cancel' })}
        onConfirm={() => { clearAllRows(); setConfirmClear(false); }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
