/* تجميع صفوف الجدول حسب مرجع الفاتورة (A) — استخراج DRY لشرط مكرر حرفيًا بنفس الصيغة في
   6 مواضع من qoyod_validator_core.js: runValidation (سطر ~1686)، renderValidationUI (~1879)،
   findInvoicesMissingLocation (~1913)، compressHeaderFields (~1969)، getValidOnlyRows (~2004)،
   renderMissingLocationUI (~1953). فاتورة بمرجع فارغ تُعامَل كمجموعة مستقلة بمفتاح
   '__blank__{rowId}' (§8.3 من الدليل) وتُستثنى من فحوص المجموعة. */

import { norm } from './text.js';

export function groupRowsByInvoiceRef(rows){
  const groups = new Map();
  rows.forEach(r=>{ const key = norm(r.A) || ('__blank__'+r.id); if(!groups.has(key)) groups.set(key, []); groups.get(key).push(r); });
  return groups;
}
