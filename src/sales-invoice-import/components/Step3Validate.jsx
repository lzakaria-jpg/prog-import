import React, { useRef } from 'react';
import { useLanguage } from '../../language.jsx';
import InvoiceGrid from './InvoiceGrid.jsx';
import MissingLocationPanel from './MissingLocationPanel.jsx';
import IssuesList from './IssuesList.jsx';

// نسخ لتصميم قسم step3 الأصلي كاملًا (بطاقات الملخص + لوحة الفواتير بدون موقع + قائمة
// الملاحظات + الجدول القابل للتعديل المباشر مع إعادة تحقق فورية).
export default function Step3Validate({ engine }) {
  const { t } = useLanguage();
  const {
    rows, template, customersRef, productsRef, issues, stats, missingLocationGroups,
    applyMissingLocation, revalidateNow, updateCell, deleteRow, pasteGrid, goToStep,
  } = engine;

  // gridRef: يسمح لقائمة الملاحظات بالانتقال لصف معيّن حتى لو كان خارج نافذة تمرير الجدول
  // (الجدول يعرض نافذة تمرير فعلية مع ملفات كبيرة — لا كل الصفوف مرسومة بالـDOM دفعة واحدة).
  const gridRef = useRef(null);

  return (
    <div className="qsv-panel">
      <h2>{t({ ar: 'الخطوة 3: التحقق والتحليل', en: 'Step 3: Validate & analyze' })}</h2>
      <div className="qsv-summary-cards">
        <div className="qsv-scard total"><div className="qsv-n">{stats.total}</div>{t({ ar: 'عدد الأسطر', en: 'Row count' })}</div>
        <div className="qsv-scard err"><div className="qsv-n">{stats.err}</div>{t({ ar: 'أخطاء حاجبة', en: 'Blocking errors' })}</div>
        <div className="qsv-scard warn"><div className="qsv-n">{stats.warn}</div>{t({ ar: 'تحذيرات', en: 'Warnings' })}</div>
        <div className="qsv-scard ok"><div className="qsv-n">{stats.okInvoices}</div>{t({ ar: 'فواتير جاهزة', en: 'Ready invoices' })}</div>
      </div>

      <MissingLocationPanel groups={missingLocationGroups} templateLocations={template.dropdowns.G} onApply={applyMissingLocation} />

      <h3>{t({ ar: 'قائمة الملاحظات (اضغط على أي ملاحظة للانتقال للسطر مباشرة في الجدول)', en: 'Notes list (click any note to jump directly to its row in the table)' })}</h3>
      <IssuesList issues={issues} onJumpToRow={(rowId) => gridRef.current && gridRef.current.scrollToRow(rowId)} />

      <h3>{t({ ar: 'الجدول (قابل للتعديل مباشرة — يُعاد التحقق فورًا مع كل تعديل)', en: 'The table (directly editable — re-validated immediately with every edit)' })}</h3>
      <InvoiceGrid
        ref={gridRef}
        tableId="data-grid-2" rows={rows} template={template} customersRef={customersRef} productsRef={productsRef}
        issues={issues} revalidate onUpdateCell={updateCell} onDeleteRow={deleteRow} onPasteGrid={pasteGrid}
      />

      <div className="qsv-actions-bar">
        <button type="button" className="qsv-btn secondary" onClick={() => goToStep(2)}>→ {t({ ar: 'رجوع للإدخال', en: 'Back to entry' })}</button>
        <div className="qsv-right">
          <button type="button" className="qsv-btn secondary" onClick={() => revalidateNow()}>🔄 {t({ ar: 'إعادة التحقق', en: 'Re-validate' })}</button>
          <button type="button" className="qsv-btn" disabled={stats.err > 0} onClick={() => goToStep(4)}>{t({ ar: 'التالي: تحميل الملف الجاهز ←', en: 'Next: download the ready file →' })}</button>
        </div>
      </div>
    </div>
  );
}
