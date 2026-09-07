// [إصلاح خطأ أداء حقيقي شهده المستخدم] رفع ملف موردين/عملاء مرجعي بحجم معقول
// (~440 صفًا فأكثر) كان يُجمِّد الواجهة بالكامل عدة ثوانٍ (نافذة "صفحة غير
// مستجيبة" بالمتصفح) لأن applyAutoContactRules تُستدعى مباشرةً على مسار
// التنفيذ الرئيسي (main thread) — قِيس فعليًا: ~20 ثانية على ملف حقيقي 11332
// قيدًا × 394 موردًا مرجعيًا قبل تحسين الخوارزمية بـexcelCore.js، وحتى بعد ذلك
// التحسين تبقى العملية عملاً حسابيًا ثقيلًا قد يستغرق ثوانٍ مع ملفات أكبر —
// ولا شيء يضمن عدم التجميد "مهما كان حجم الملف" إلا تنفيذه خارج مسار الواجهة
// الرئيسي كليًا. هذا الملف يُشغَّل داخل Web Worker مستقل (خيط منفصل تمامًا عن
// الواجهة) عبر JournalTool.jsx، فتبقى الصفحة قابلة للتمرير والنقر طوال وقت
// المطابقة، مهما طالت.
//
// computeContactMatch مُصدَّرة بشكل مستقل عن self.onmessage عمدًا لتبقى قابلة
// للاختبار مباشرةً (Vitest، بيئة Node، بلا Worker حقيقي) بمعزل عن ربط الرسائل.
import { applyAutoContactRules } from "./excelCore.js";

export function computeContactMatch({ entries, chartAccounts, options }) {
  const result = applyAutoContactRules(entries, chartAccounts, options);
  // applyAutoContactRules تُعيد نفس مرجع entries حرفيًا لو لم يتغيّر شيء فعليًا
  // (انظر تعليقها بexcelCore.js) — نحسب "changed" هنا، *قبل* أي postMessage/
  // structured-clone، لأن المقارنة المرجعية (===) تفقد معناها بعد عبور حدود
  // الـWorker (كل postMessage ينسخ الكائنات نسخًا عميقًا فتصبح مراجع جديدة
  // دومًا، حتى لو لم يتغيّر شيء منطقيًا) — لولا هذا لأعاد الخيط الرئيسي تطبيق
  // setEntries على نتيجة "جديدة مرجعيًا" في كل مرة، فيدخل بحلقة تحديث بلا نهاية.
  return { changed: result !== entries, result };
}

// self.onmessage يُربَط فقط داخل سياق Worker فعلي (لا window به) — بلا أي أثر
// عند استيراد هذا الملف من بيئة اختبار عادية (Vitest/Node) لاختبار
// computeContactMatch مباشرةً.
if (typeof self !== "undefined" && typeof window === "undefined") {
  self.onmessage = (event) => {
    const { requestId, entries, chartAccounts, options } = event.data || {};
    try {
      const { changed, result } = computeContactMatch({ entries, chartAccounts, options });
      self.postMessage({ requestId, ok: true, changed, result: changed ? result : null });
    } catch (err) {
      self.postMessage({ requestId, ok: false, error: String((err && err.message) || err) });
    }
  };
}
