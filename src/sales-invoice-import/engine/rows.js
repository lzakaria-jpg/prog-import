/* إنشاء الصفوف وتكرار/ضغط حقول رأس الفاتورة — نسخ حرفي من qoyod_validator_core.js
   (أسطر 42-47 و 1284-1296 و 1966-1980).
   تبديل معماري: newRow كانت تستهلك state.rowSeq العام مباشرة لتوليد id تصاعدي لا يُصفَّر
   أبدًا طوال الجلسة؛ هنا createRow تستقبل id جاهزًا (يولّده الهوك عبر useRef مستمر) بدل
   توليده داخليًا — وهذا التبديل الوحيد، بقية الجسم حرفي. */

import { COL_KEYS, HEADER_COLS } from './constants.js';
import { norm, isBlank } from './text.js';

export function createRow(id, prefill){
  const r = {id};
  COL_KEYS.forEach(k=>r[k]='');
  if(prefill) Object.assign(r, prefill);
  return r;
}

// [إصلاح 2026-09-05] ملفات العملاء الشائعة تكتب رقم/مرجع الفاتورة مرة واحدة فقط بأول سطر
// الفاتورة، وتترك خانة المرجع فارغة بباقي سطور بنودها (تكرارًا حتى ظهور مرجع فاتورة تالٍ) —
// أسلوب "الخلايا المدمجة" الشائع بجداول إكسل. fillDownHeaderFields أدناه لا يعالج هذه الحالة:
// هي تُجمِّع الصفوف حسب r.A نفسه، فأي صف بـA فارغ لا يدخل أي مجموعة إطلاقًا (يبقى فارغًا للأبد).
// هذه الدالة تُشغَّل قبلها مباشرة (بأول تعيين للأعمدة من ملف العميل، قبل أي تجميع بحسب A):
// تمشي على الصفوف بترتيبها الفعلي بالملف وتنشر آخر مرجع فاتورة غير فارغ رأته على كل صف تالٍ
// مرجعه فارغ، حتى يظهر مرجع جديد فيصبح هو المرجع المنشور من حينها. صف بمرجع فارغ يسبق أي
// مرجع فعلي (لا يوجد مرجع سابق لنشره بعد) يبقى فارغًا كما هو — يظهر بخطوة التحقق كخطأ صريح
// بدل تخمين مرجع لا أساس له.
export function forwardFillInvoiceRef(rows){
  let lastRef = '';
  return rows.map(r=>{
    if(!isBlank(r.A)){ lastRef = norm(r.A); return r; }
    if(!lastRef) return r;
    return {...r, A: lastRef};
  });
}

// [إضافة] projectRef حقل رأس فاتورة مستقل تمامًا عن COL_KEYS (راجع تعليق
// AUX_FIELD_KEYWORDS._project بـconstants.js — لا علاقة له بأعمدة القالب
// الرسمي A-V)، لكنه سلوكيًا حقل رأس فاتورة عادي (نفس دلالة C/D/G): يُكتَب
// غالبًا مرة واحدة بأول سطر الفاتورة بملف العميل الخام ويُترك فارغًا ببقية
// سطورها، فيحتاج نفس معاملة التكرار على كل صفوف نفس المرجع.
const HEADER_FILL_KEYS = [...HEADER_COLS, 'projectRef'];

// تُنسخ أول قيمة غير فارغة لكل حقل من حقول رأس الفاتورة إلى بقية صفوف نفس المرجع، بحيث تتكرر
// بيانات الفاتورة الرئيسية في كل صف بشكل متطابق حرفيًا. لا نلمس القيم غير الفارغة المختلفة حتى
// يبقى تعارض البيانات مرئيًا في خطوة التحقق بدل إخفائه.
// تبديل معماري: تُعيد مصفوفة صفوف جديدة (نسخ سطحي) بدل التعديل بالإشارة المباشرة على rows الأصلية.
export function fillDownHeaderFields(rows){
  const byId = new Map(rows.map(r=>[r.id, {...r}]));
  const groups = new Map();
  rows.forEach(r=>{ const k = norm(r.A); if(!k) return; if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(r); });
  groups.forEach(list=>{
    HEADER_FILL_KEYS.forEach(hk=>{
      const src = list.find(r=>!isBlank(r[hk]));
      if(!src) return;
      const val = src[hk];
      list.forEach(r=>{ if(isBlank(r[hk])) byId.get(r.id)[hk] = val; });
    });
  });
  return rows.map(r=>byId.get(r.id));
}

// يُخرِج نسخة من الأسطر مع تكرار بيانات رأس الفاتورة بشكل متطابق حرفيًا في كل صفوف نفس المرجع.
// (قيود يقبل أسلوبين فقط: التعبئة في الصف الأول وترك الباقي فارغًا، أو التكرار المتطابق تمامًا —
//  وهنا نعتمد التكرار المتطابق كما هو مطلوب، والتطابق الحرفي مضمون لأن القيمة تُنسخ من مصدر واحد.)
// نسخ حرفي من qoyod_validator_core.js (أسطر 1966-1978) — تختلف عمدًا عن fillDownHeaderFields
// أعلاه: هذه تملأ من "أول قيمة غير فارغة" على **كل** صفوف المجموعة (بما فيها الأولى نفسها)،
// لا الفارغ فقط — الدالتان تُستخدَمان في سياقين مختلفين تمامًا (تصدير مقابل تحقق) ولا تُدمَجان.
export function compressHeaderFields(rows){
  const out = rows.map(r=>({...r}));
  const groups = new Map();
  out.forEach(r=>{ const k = norm(r.A); if(!k) return; if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(r); });
  groups.forEach(list=>{
    HEADER_COLS.forEach(hk=>{
      const src = list.find(r=>!isBlank(r[hk]));
      if(!src) return;
      list.forEach(r=>{ r[hk] = src[hk]; });
    });
  });
  return out;
}
