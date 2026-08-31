import React from 'react';

// نسخ لتصميم قائمة الملاحظات في renderValidationUI الأصلي — الضغط على أي ملاحظة ينقل
// للسطر مباشرة في الجدول (data-rowid، نفس ما كان data-jump يفعله).
export default function IssuesList({ issues }) {
  if (issues.list.length === 0) {
    return <div className="qsv-issues-list"><div className="qsv-issue-item">✅ لا توجد أي ملاحظات — الملف جاهز للانتقال للخطوة التالية.</div></div>;
  }
  const jumpTo = (rowId) => {
    const tr = document.querySelector(`#data-grid-2 tr[data-rowid="${rowId}"]`);
    if (tr) {
      tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      tr.style.outline = '2px solid var(--qsv-brand)';
      setTimeout(() => { tr.style.outline = ''; }, 1500);
    }
  };
  return (
    <div className="qsv-issues-list">
      {issues.list.map((i, idx) => (
        <div key={idx} className={`qsv-issue-item ${i.sev}`} onClick={() => jumpTo(i.rowId)}>
          <b>{i.sev === 'err' ? '❌ خطأ حاجب' : '⚠️ تحذير'}</b>{i.msg}
        </div>
      ))}
    </div>
  );
}
