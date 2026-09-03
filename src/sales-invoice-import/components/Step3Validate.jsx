import React, { useRef } from 'react';
import InvoiceGrid from './InvoiceGrid.jsx';
import MissingLocationPanel from './MissingLocationPanel.jsx';
import IssuesList from './IssuesList.jsx';

// نسخ لتصميم قسم step3 الأصلي كاملًا (بطاقات الملخص + لوحة الفواتير بدون موقع + قائمة
// الملاحظات + الجدول القابل للتعديل المباشر مع إعادة تحقق فورية).
export default function Step3Validate({ engine }) {
  const {
    rows, template, customersRef, productsRef, issues, stats, missingLocationGroups,
    applyMissingLocation, revalidateNow, updateCell, deleteRow, pasteGrid, goToStep,
  } = engine;

  // gridRef: يسمح لقائمة الملاحظات بالانتقال لصف معيّن حتى لو كان خارج نافذة تمرير الجدول
  // (الجدول يعرض نافذة تمرير فعلية مع ملفات كبيرة — لا كل الصفوف مرسومة بالـDOM دفعة واحدة).
  const gridRef = useRef(null);

  return (
    <div className="qsv-panel">
      <h2>الخطوة 3: التحقق والتحليل</h2>
      <div className="qsv-summary-cards">
        <div className="qsv-scard total"><div className="qsv-n">{stats.total}</div>عدد الأسطر</div>
        <div className="qsv-scard err"><div className="qsv-n">{stats.err}</div>أخطاء حاجبة</div>
        <div className="qsv-scard warn"><div className="qsv-n">{stats.warn}</div>تحذيرات</div>
        <div className="qsv-scard ok"><div className="qsv-n">{stats.okInvoices}</div>فواتير جاهزة</div>
      </div>

      <MissingLocationPanel groups={missingLocationGroups} templateLocations={template.dropdowns.G} onApply={applyMissingLocation} />

      <h3>قائمة الملاحظات (اضغط على أي ملاحظة للانتقال للسطر مباشرة في الجدول)</h3>
      <IssuesList issues={issues} onJumpToRow={(rowId) => gridRef.current && gridRef.current.scrollToRow(rowId)} />

      <h3>الجدول (قابل للتعديل مباشرة — يُعاد التحقق فورًا مع كل تعديل)</h3>
      <InvoiceGrid
        ref={gridRef}
        tableId="data-grid-2" rows={rows} template={template} customersRef={customersRef} productsRef={productsRef}
        issues={issues} revalidate onUpdateCell={updateCell} onDeleteRow={deleteRow} onPasteGrid={pasteGrid}
      />

      <div className="qsv-actions-bar">
        <button type="button" className="qsv-btn secondary" onClick={() => goToStep(2)}>→ رجوع للإدخال</button>
        <div className="qsv-right">
          <button type="button" className="qsv-btn secondary" onClick={() => revalidateNow()}>🔄 إعادة التحقق</button>
          <button type="button" className="qsv-btn" disabled={stats.err > 0} onClick={() => goToStep(4)}>التالي: تحميل الملف الجاهز ←</button>
        </div>
      </div>
    </div>
  );
}
