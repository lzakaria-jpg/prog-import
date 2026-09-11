// نسخ نص للحافظة مع fallback يدوي (execCommand) لو navigator.clipboard غير
// متاح أو فشل — كانت نفس هالحلقة مكررة حرفياً داخل copyToClipboard بكل من
// AccountsTool.jsx وJournalTool.jsx (الفرق الوحيد بينهما مصدر النص نفسه، لا
// آلية النسخ). أُخرجت هنا كدالة عامة تُرجع true/false فقط؛ كل مكوّن يبقي
// تحديث حالته الخاصة (setCopyStatus/setShowManualCopy) عنده كما هو.
export async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // يكمل لمسار fallback بالأسفل
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const success = document.execCommand("copy");
    document.body.removeChild(ta);
    return success;
  } catch {
    return false;
  }
}
