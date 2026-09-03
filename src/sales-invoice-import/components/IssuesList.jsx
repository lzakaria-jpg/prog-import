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
  // [إصلاح أداء] الجدول نفسه مُحوسَب بنافذة عرض (virtualization) لمنع تجميد
  // المتصفح، لكن قائمة الملاحظات كانت تُنشئ عنصر DOM لكل ملاحظة بلا سقف: ملف
  // كبير بحقول مطلوبة ناقصة يولّد عشرات آلاف الملاحظات، وكل ضغطة مفتاح بالخطوة 3
  // تُعيد التحقق وتُعيد رسم القائمة كاملة — تجميد بالثواني لكل حرف. نعرض أول
  // MAX_SHOWN فقط مع سطر يوضح العدد المتبقي (كل الملاحظات تبقى داخل issues.list
  // ولم يتغيّر أي منطق تحقق أو أي عدّاد أخطاء).
  const MAX_SHOWN = 300;
  const shown = issues.list.slice(0, MAX_SHOWN);
  const hidden = issues.list.length - shown.length;
  return (
    <div className="qsv-issues-list">
      {hidden > 0 && (
        <div className="qsv-issue-item">
          ℹ️ يُعرَض أول {MAX_SHOWN} ملاحظة من إجمالي {issues.list.length} — أصلِح المعروض ثم أعد التحقق لتظهر البقية.
        </div>
      )}
      {shown.map((i, idx) => (
        <div key={idx} className={`qsv-issue-item ${i.sev}`} onClick={() => jumpTo(i.rowId)}>
          <b>{i.sev === 'err' ? '❌ خطأ حاجب' : '⚠️ تحذير'}</b>{i.msg}
        </div>
      ))}
    </div>
  );
}
