/**
 * text.js — أدوات نصية ورقمية مشتركة.
 * لا تعتمد على DOM ولا على React، ويمكن اختبارها منفردة.
 */

const AR_DIGITS = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
};

/** تحويل الأرقام العربية/الفارسية إلى لاتينية */
export function fixDigits(s) {
  return String(s).replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d]);
}

/**
 * تطبيع نص عربي للمقارنة: إزالة التشكيل والتطويل، توحيد الألف والهاء والياء،
 * إسقاط كل ما ليس حرفاً أو رقماً. يُستخدم في كل عمليات المطابقة.
 */
export function norm(v) {
  if (v == null) return '';
  return fixDigits(String(v))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^0-9a-zA-Z\u0600-\u06FF]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * تقطيع نص إلى كلمات (يحافظ على الفواصل بين الكلمات، بعكس norm).
 * تُحذف «ال» التعريف من أول الكلمة حتى يتساوى «الكمية» و«كمية» في المقارنة.
 */
export function toks(s) {
  return fixDigits(String(s ?? ''))
    .replace(/%/g, ' percent ')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .toLowerCase()
    .split(/[^0-9a-z\u0600-\u06FF]+/)
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.startsWith('ال') ? t.slice(2) : t));
}

/**
 * قراءة رقم بشكل صارم: "1,250.50" و"15%" و"(100)" و"12 ر.س" أرقام،
 * بينما "B-100" و"VND056" ليست أرقاماً (وهذا مقصود: أكواد لا أرقام).
 */
export function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = fixDigits(v).trim()
    .replace(/[\s,\u066C'٬]/g, '')
    .replace(/(ر\.?س|ريال|sar|usd|aed|jod|ils|شيكل|دينار|\$|﷼|₪)/gi, '')
    .replace(/%$/, '');
  if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

/** استخراج الأرقام فقط (لمقارنة أرقام الهواتف) */
export function digitsOnly(v) {
  return fixDigits(v ?? '').replace(/\D/g, '');
}

/** تحويل الرقم التسلسلي في إكسل إلى تاريخ */
export function excelDate(n) {
  const d = new Date(Date.UTC(1899, 11, 30));
  d.setUTCDate(d.getUTCDate() + Math.round(n));
  return d;
}

/** قراءة تاريخ من رقم تسلسلي أو نص بصيغ مختلفة */
export function toDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v === 'number') return v > 20 && v < 80000 ? excelDate(v) : null;
  const s = fixDigits(String(v)).trim();
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return new Date(Date.UTC(y, +m[2] - 1, +m[1]));
  }
  m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const d = new Date(s);
  return isNaN(d) ? null : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** صيغة يوم/شهر/سنة كما يطلبها قيود */
export function fmtDate(d) {
  if (!d) return '';
  return (
    String(d.getUTCDate()).padStart(2, '0') + '/' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '/' +
    d.getUTCFullYear()
  );
}

const YES_SET = new Set(['نعم', 'شامل', 'شامله', 'شاملالضريبه', 'مشمول', 'مشموله', 'صح', 'ايوه', 'اجل',
  'yes', 'ye', 'y', 'true', 't', '1', 'include', 'included', 'including', 'incl', 'inclusive']);
const NO_SET = new Set(['لا', 'غير', 'غيرشامل', 'غيرشامله', 'كلا', 'خطا',
  'no', 'n', 'false', 'f', '0', 'exclude', 'excluded', 'excl', 'exclusive', 'none']);

/**
 * قراءة قيمة منطقية بصيغ متعددة: نعم/لا، Yes/No، True/False، 1/0.
 * المطابقة بالقيمة الكاملة لا بجزء منها، حتى لا يُقرأ "B-100" على أنه "نعم".
 */
export function truthy(v) {
  const s = norm(v);
  if (!s) return null;
  if (YES_SET.has(s)) return true;
  if (NO_SET.has(s)) return false;
  if (s.includes('غيرشامل')) return false;
  if (s.includes('شامل')) return true;
  return null;
}

/** أول قيمة غير فارغة من مفاتيح متعددة (لاختلاف تسميات حقول الواجهة) */
export function pick(o, ...keys) {
  for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k];
  return '';
}

/** رقم العمود إلى حرفه: 0→A، 26→AA */
export function colLetter(i) {
  let s = '', n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
