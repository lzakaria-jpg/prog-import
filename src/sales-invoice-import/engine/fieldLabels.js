/**
 * أسماء الحقول الرسمية وإلزاميتها — كما تظهر حرفياً في قالب قيود المرفوع، لا
 * كما تُسمَّى داخلياً في هذه الأداة.
 *
 * القالب هو المرجع الوحيد: كل رأس عمود يُقرأ حرفياً من template.headers (النص
 * الخام قبل أي تطبيع)، وإلزاميته تُقرَّر من وجود نجمة (*) في ذلك النص نفسه —
 * لا من علم `required` الثابت في constants.js. فلو غيّر قيود صياغة عمود أو نجمته
 * مستقبلاً، تتبع الواجهة القالب المرفوع فعلياً بدل نسخة مجمَّدة من التسمية.
 *
 * `FIELD_BY_KEY[key].label` يبقى احتياطاً فقط لحالة تعذّر قراءة القالب.
 */

import { FIELD_BY_KEY } from './constants.js';

const STAR_RE = /[*✱★]/;

/** الاسم الرسمي لعمود كما ورد حرفياً في القالب المرفوع (بلا أي تعديل) */
export function officialFieldLabel(template, key) {
  const col = template?.columns?.[key];
  const raw = col ? template?.headers?.[col - 1] : null;
  if (raw != null && String(raw).trim()) return String(raw).trim();
  return FIELD_BY_KEY[key]?.label || key;
}

/** هل العمود إلزامي؟ — النجمة في نص رأس العمود الفعلي بالقالب أولاً، فعلم الحقل احتياطاً */
export function isFieldRequiredInTemplate(template, key) {
  const col = template?.columns?.[key];
  const raw = col ? template?.headers?.[col - 1] : null;
  if (raw != null && String(raw).trim()) return STAR_RE.test(String(raw));
  return FIELD_BY_KEY[key]?.required === true;
}
