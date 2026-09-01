import React from 'react';

// نسخ لتصميم قائمة الملاحظات في renderValidationUI الأصلي — الضغط على أي ملاحظة ينقل
// للسطر مباشرة في الجدول (data-rowid، نفس ما كان data-jump يفعله).
// onJumpToRow (بدل document.querySelector المباشر القديم): الجدول الآن يعرض فقط الصفوف
// الظاهرة ضمن نافذة التمرير (القاعدة الجديدة لمنع تعليق المتصفح مع ملفات كبيرة)، فقد لا
// يكون الصف الهدف موجودًا بالـDOM إطلاقًا لو كان خارج نافذة العرض — الأب (Step3Validate)
// يمرّر دالة تستدعي InvoiceGrid.scrollToRow عبر ref، وهي تُنقل نافذة العرض للصف أولًا.
export default function IssuesList({ issues, onJumpToRow }) {
  if (issues.list.length === 0) {
    return <div className="qsv-issues-list"><div className="qsv-issue-item">✅ لا توجد أي ملاحظات — الملف جاهز للانتقال للخطوة التالية.</div></div>;
  }
  const jumpTo = (rowId) => { if (onJumpToRow) onJumpToRow(rowId); };
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
