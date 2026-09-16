/*
 ============================================================================
  refSuggest.js — اقتراح "الرقم المرجعي" (Ref. No.) للصفوف التي لا تحمله في
  ملف العميل، بالاستمرار على نمط (بادئة + رقم) الأكثر شيوعًا بين القيم
  الموجودة فعلاً بنفس الملف فقط.
 ============================================================================
  [قرار تصميم مهم] حقل "الرقم المرجعي" (كما يظهر مثلاً "CUS14823" بنموذج
  "إضافة عميل" الحي بواجهة Qoyod) **غير موثَّق إطلاقاً** بمواصفة Qoyod
  البرمجية الرسمية (OpenAPI v2.1) لا لـ/customers ولا لـ/vendors — لا في
  حمولة POST/PUT، ولا في استجابة GET (ContactResponse بلا أي حقل مرجع، بخلاف
  الفواتير/القيود التي توثّق حقل reference صراحة). هذا فراغ حقيقي ودائم
  بسطح الـAPI الحالي، لا ثغرة يمكن الالتفاف عليها.
  المحاولة الأولى هنا كانت تمرير القيمة عبر custom_fields (حقل حر إضافي
  اختياري يُعرَّف يدويًا بإعدادات المنشأة) بافتراض أنه قد يحمل رقمًا مرجعيًا
  بمنشآت بعض العملاء — تصحيح مباشر من المستخدم: custom_fields ميزة مختلفة
  كليًا (حقل إضافي عام يُضيفه المستخدم بنفسه)، لا ترادف لمفهوم "الرقم
  المرجعي" الفعلي، ولا ضمان أي علاقة بينهما البتة. تراجعنا عن ذلك بالكامل.
  الحل الحالي إذًا: الرقم المرجعي هنا **محليّ لنطاق هذه الأداة/الملف فقط**:
    - يُقرأ من عمود المرجع بالملف حين موجود، كما هو حرفيًا.
    - يُقترَح تلقائيًا (قابل للتعديل دومًا بخطوة المراجعة) حين غائب، بالاستمرار
      على تسلسل القيم الموجودة فعلاً **بنفس الملف** فقط — بلا أي قراءة من
      حساب قيود الحي (لا حقل لقراءته منه أصلاً)، وبلا أي ضمان عدم تصادمه مع
      عميل/مورد موجود فعلاً بالحساب.
    - يُكتب في عمود "Ref. No." بملف قالب التصدير النهائي كالمعتاد (يُعالَج
      هناك عبر مسار استيراد قيود الخاص بها، منفصل تمامًا عن هذا المسار).
    - **لا يُرسَل إطلاقاً** بحمولة الإنشاء/التعديل المباشر عبر API (راجع
      contactsPush.js) — لا يوجد حقل حقيقي بقيود ليُرسَل إليه.
  كل مكان يظهر فيه هذا الحقل بالواجهة يحمل ملاحظة صريحة بهذا القيد — لا
  إيهام بضمان تفرّد غير موجود فعلاً.
 ============================================================================
*/
import { fixDigits } from './text.js';

/** يستخرج (بادئة نصية + رقم لاحق) من قيمة مرجع، أو null لو لم تنتهِ بأرقام */
export function parseRefPattern(raw) {
  const s = fixDigits(String(raw ?? '').trim());
  if (!s) return null;
  const m = /^(.*?)(\d+)$/.exec(s);
  if (!m) return null;
  return { prefix: m[1], number: parseInt(m[2], 10), width: m[2].length };
}

/** يبني رقماً مرجعياً من بادئة + رقم + عرض تعبئة أصفار (0 يعني بلا تعبئة) */
export function formatRef(prefix, number, width) {
  const digits = String(number);
  const padded = digits.length < width ? digits.padStart(width, '0') : digits;
  return `${prefix}${padded}`;
}

/**
 * يقترح قيمة `ref` لكل صف يفتقدها، بالاستمرار على نمط الصفوف التي تحملها
 * فعلاً بنفس الدفعة (الملف) — والاقتراحات تتزايد فيما بينها أيضاً فلا تتصادم
 * ببعضها داخل نفس الدفعة (راجع تعليق الرأس أعلاه لأسباب حصر النطاق بالملف).
 * @param {Array<object>} rows صفوف buildRows (كل صف يحمل مفتاح `key`)
 * @param {{key?: string}} [opts]
 * @returns {{rows: Array<object>, basis: {hasExisting: boolean, prefix: string, width: number}}}
 */
export function suggestRefs(rows, opts = {}) {
  const key = opts.key || 'ref';
  const parsed = (rows || []).map((r) => parseRefPattern(r[key])).filter(Boolean);

  const byPrefix = new Map();
  parsed.forEach((p) => {
    const cur = byPrefix.get(p.prefix) || { count: 0, maxNumber: 0, width: p.width };
    cur.count += 1;
    cur.maxNumber = Math.max(cur.maxNumber, p.number);
    cur.width = Math.max(cur.width, p.width);
    byPrefix.set(p.prefix, cur);
  });

  let prefix = '', width = 1, next = 1;
  const hasExisting = byPrefix.size > 0;
  if (hasExisting) {
    let best = null;
    byPrefix.forEach((v, k) => { if (!best || v.count > best.v.count) best = { k, v }; });
    prefix = best.k;
    width = best.v.width;
    next = best.v.maxNumber + 1;
  }

  const outRows = (rows || []).map((r) => {
    const has = String(r[key] ?? '').trim() !== '';
    if (has) return { ...r, refAutoSuggested: false };
    const suggested = formatRef(prefix, next, width);
    next += 1;
    return { ...r, [key]: suggested, refAutoSuggested: true };
  });

  return { rows: outRows, basis: { hasExisting, prefix, width } };
}
