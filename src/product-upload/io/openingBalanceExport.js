/*
 ============================================================================
  توليد ملف "الأرصدة الافتتاحية للمنتجات" — أداة رفع المنتجات إلى قيود
  [إضافة 2026-09-07، مطابَق 2026-09-07 على القالب الرسمي الحقيقي]
 ============================================================================
  خلفية القرار: طلب المستخدم رفع "الكمية المتوفرة" كـ"قيد أرصدة افتتاحية" —
  ومركز مساعدة قيود الرسمي يوثّق هذه العملية بالتحديد (المحاسبة > قيود يدوية >
  أرصدة افتتاحية > المنتجات والتكاليف) كشاشة/استيراد Excel فقط، بنص صريح
  "لا حاجة لـ API" لهذه العملية — وأهم من ذلك: القيد لا يمكن تعديله بعد الحفظ
  (يُحذف ويُعاد بالكامل فقط لو صار خطأ). المستخدم اختار صراحةً توليد ملف Excel
  بدل أي محاولة قيد مباشر عبر journal_entries غير موثّق لهذا الغرض تحديداً —
  تفادياً لأي قيد محاسبي خاطئ لا يمكن تصحيحه على حساب عميل حقيقي.

  [تحديث 2026-09-07] زوّدنا المستخدم بنسخة حقيقية من هذا القالب الرسمي فعلاً
  (download_sample_1.xlsx — creator: axlsx، أي ملف مولَّد من خادم قيود نفسه لا
  اجتهاداً). التنسيق الفعلي المؤكَّد الآن (لا اجتهاد إطلاقاً):
   - ورقة Excel منفصلة لكل موقع، اسمها الحرفي بالضبط: "<رقم تسلسلي للموقع
     ابتداءً من 1> - <اسم الموقع>" (مثال حقيقي من الملف المرفق: "1 - المركز
     الرئيسي").
   - 3 أعمدة فقط بالضبط، بهذا الترتيب والنص الحرفي: "الرقم التسلسلي" |
     "متوسط التكلفة" | "الكمية" — **بلا** عمود اسم منتج، **وبلا** أي صف
     تاريخ/وصف/موقع فوق صف الترويسة (ما كان مولَّداً هنا سابقاً من صفوف
     "التاريخ"/"الوصف" كان اجتهاداً غير مطابق للقالب الحقيقي — أُزيل بالكامل).
     التاريخ يُدخَل يدوياً على شاشة قيود نفسها عند الاستيراد، لا داخل الملف —
     الأداة تعرضه بسجل الرفع وباسم الملف فقط كتذكير.
   - "الرقم التسلسلي" = رمز/كود المنتج (نفس ما يُرسَل كـsku بحمولة إنشاء
     المنتج) — يطابق تماماً ما يدمجه bill-import بهذا المشروع أصلاً
     (prodRef: "الرقم التسلسلي / الباركود"، ملف lib/fields.js).
   - القالب الحقيقي يفرض قيداً (data validation) أن التكلفة والكمية > 0 بكل
     صف — نفس القاعدة مطبَّقة أصلاً بطبقة parsing.js (buildOpeningBalanceRows
     تستثني الكمية الصفرية/الفارغة، وparseCostNumber لا يُرجع أبداً أقل من 1).
   - منتج بلا "رمز/كود" بملف العميل لا يمكن كتابته بهذا العمود إطلاقاً (لا يوجد
     عمود اسم بديل بالقالب الحقيقي) — يُستثنى صراحةً ويُسجَّل بـskippedNoSku
     ليُبلَّغ المستخدم به بدل تجاهله بصمت.
 ============================================================================
*/
import * as XLSX from "xlsx";

const SHEET_NAME_MAX = 31; // حد Excel الصارم لطول اسم الورقة

function safeSheetName(name, usedNames) {
  const cleaned = String(name || "موقع").replace(/[\\/*?:[\]]/g, "").trim() || "موقع";
  let base = cleaned.slice(0, SHEET_NAME_MAX);
  let candidate = base;
  let n = 2;
  while (usedNames.has(candidate)) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, SHEET_NAME_MAX - suffix.length) + suffix;
    n++;
  }
  usedNames.add(candidate);
  return candidate;
}

// يبني ملف الأرصدة الافتتاحية مطابقاً حرفياً للقالب الرسمي (راجع التعليق أعلاه).
// المواقع تُرقَّم 1..n حسب ترتيب ظهورها الأول بصفوف rows (ترتيب ثابت ومتوقَّع).
// @returns {{ workbook: XLSX.WorkBook, skippedNoSku: string[] }}
export function buildOpeningBalanceWorkbook(rows) {
  const wb = XLSX.utils.book_new();
  const byLocation = new Map();
  const skippedNoSku = [];

  (rows || []).forEach((r) => {
    if (!r.sku) { skippedNoSku.push(r.name || "(بلا اسم)"); return; }
    const loc = r.location || "بلا موقع محدد";
    if (!byLocation.has(loc)) byLocation.set(loc, []);
    byLocation.get(loc).push(r);
  });

  const usedNames = new Set();
  let idx = 0;
  byLocation.forEach((locRows, loc) => {
    idx++;
    const data = [
      ["الرقم التسلسلي", "متوسط التكلفة", "الكمية"],
      ...locRows.map((r) => [r.sku, r.cost, r.quantity]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 19 }, { wch: 18 }, { wch: 10 }]; // نفس عرض الأعمدة التقريبي بالقالب الحقيقي
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(`${idx} - ${loc}`, usedNames));
  });

  return { workbook: wb, skippedNoSku };
}

export function workbookToBlob(wb) {
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
