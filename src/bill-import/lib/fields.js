/**
 * fields.js — تعريف حقول قالب قيود، ومرادفات أسماء الأعمدة في ملفات العملاء.
 * كل حقل: [المفتاح، التسمية، إلزامي؟، مرادفات اسم العمود]
 */

export const FIELDS = [
  ['ref', 'مرجع الفاتورة / التسلسل', true, ['مرجع', 'رقم الفاتوره', 'رقم فاتوره', 'التسلسل', 'رقم المستند', 'invoice number', 'bill number', 'number of bill', 'number of invoice', 'bill no', 'invoice no', 'inv no', 'bill', 'invoice', 'reference', 'doc no', 'رقم']],
  ['desc', 'وصف الفاتورة', false, ['وصف الفاتوره', 'بيان الفاتوره', 'ملاحظه الفاتوره']],
  ['vendorRef', 'الرقم المرجعي للمورد', true, ['رقم المورد', 'كود المورد', 'مرجع المورد', 'الرقم المرجعي للمورد', 'vendor code', 'supplier code', 'vendor reference', 'vendor id', 'supplier id', 'vendor no']],
  ['vendorName', 'اسم المورد', false, ['اسم المورد', 'المورد', 'الجهه', 'vendor', 'supplier', 'vendor name', 'supplier name']],
  ['vendorPhone', 'هاتف المورد', false, ['جوال', 'هاتف', 'رقم التواصل', 'phone', 'mobile', 'tel', 'contact number']],
  ['issueDate', 'تاريخ الإصدار', true, ['تاريخ الاصدار', 'تاريخ الفاتوره', 'التاريخ', 'invoice date', 'bill date', 'issue date', 'date']],
  ['dueDate', 'تاريخ الاستحقاق', false, ['تاريخ الاستحقاق', 'استحقاق', 'due date', 'payment due']],
  ['supplyDate', 'تاريخ التوريد', false, ['تاريخ التوريد', 'التسليم', 'supply date', 'delivery date', 'received date']],
  ['location', 'الموقع', false, ['الموقع', 'موقع', 'فرع', 'مستودع', 'مخزن', 'location', 'branch', 'warehouse', 'store']],
  ['terms', 'الشروط والأحكام', false, ['شروط', 'terms', 'conditions']],
  ['notes', 'الملاحظات', false, ['ملاحظات', 'note', 'notes', 'remark', 'comment']],
  ['docDiscVal', 'قيمة خصم المستند', false, ['خصم المستند', 'خصم الفاتوره', 'document discount', 'invoice discount']],
  ['docDiscAcc', 'حساب خصم المستند', false, ['حساب الخصم', 'discount account']],
  ['docDiscTax', 'ضريبة خصم المستند', false, ['ضريبه خصم المستند', 'discount tax']],
  ['prodRef', 'الرقم التسلسلي / الباركود', true, ['باركود', 'sku', 'barcode', 'كود الصنف', 'كود المنتج', 'رقم الصنف', 'رمز الصنف', 'الرقم التسلسلي', 'item code', 'product code', 'item no', 'part number', 'code']],
  ['prodName', 'اسم المنتج', false, ['اسم الصنف', 'الصنف', 'المنتج', 'اسم المنتج', 'item', 'product', 'product name', 'item name', 'البيان']],
  ['prodDesc', 'وصف البند', false, ['وصف البند', 'وصف المنتج', 'ملاحظه البند', 'line description']],
  ['qty', 'الكمية', true, ['الكميه', 'كميه', 'qty', 'quantity', 'عدد', 'count', 'units']],
  ['unit', 'وحدة التحويل', false, ['وحده', 'الوحده', 'unit', 'uom', 'وحده القياس', 'وحده التحويل', 'التعبئه', 'packing']],
  ['price', 'سعر الوحدة', true, ['سعر الوحده', 'سعر', 'السعر', 'unit price', 'price', 'rate', 'cost', 'سعر الشراء', 'purchase price']],
  ['lineTotal', 'إجمالي البند', false, ['الاجمالي', 'اجمالي', 'المجموع', 'قيمه البند', 'total', 'amount', 'line total', 'subtotal', 'net', 'gross', 'الاجمالي شامل الضريبه', 'total with vat']],
  ['taxIncl', 'شامل الضريبة؟', false, ['شامل الضريبه', 'السعر شامل الضريبه', 'المبلغ شامل الضريبه', 'شامل ضريبه القيمه المضافه', 'شامل', 'مشمول الضريبه', 'include tax', 'including vat', 'including tax', 'tax included', 'vat included', 'tax inclusive', 'vat inclusive', 'price includes vat', 'incl vat', 'incl tax', 'inclusive']],
  ['discPct', 'نسبة الخصم', false, ['نسبه الخصم', 'خصم نسبه', 'خصم percent', 'discount rate', 'discount percent', 'disc percent', 'نسبه']],
  ['discVal', 'قيمة الخصم', false, ['قيمه الخصم', 'مبلغ الخصم', 'discount amount', 'discount value', 'discount', 'خصم']],
  ['tax', 'الضريبة %', true, ['الضريبه', 'ضريبه', 'نسبه الضريبه', 'القيمه المضافه', 'vat', 'tax', 'tax rate', 'vat rate', 'tax percent', 'ضريبه percent']]
];

/** كلمات تُضعف ترشيح الحقل عند ظهورها في اسم العمود (تمنع الخلط بين متشابهات) */
export const NEG = {
  price: ['ضريبه', 'tax', 'vat', 'اجمالي', 'total', 'amount', 'خصم', 'discount'],
  lineTotal: ['ضريبه', 'tax', 'vat', 'خصم', 'discount', 'سعر الوحده', 'unit price'],
  qty: ['سعر', 'price', 'اجمالي', 'total', 'ضريبه', 'tax'],
  ref: ['مورد', 'vendor', 'supplier', 'منتج', 'product', 'item', 'صنف'],
  prodRef: ['مورد', 'vendor', 'supplier', 'فاتوره', 'invoice', 'bill'],
  vendorRef: ['منتج', 'product', 'item', 'صنف', 'فاتوره', 'invoice', 'bill'],
  tax: ['خصم', 'discount', 'مبلغ الضريبه', 'tax amount', 'قيمه الضريبه'],
  discPct: ['ضريبه', 'tax', 'vat'],
  discVal: ['ضريبه', 'tax', 'vat']
};

/** حقول لا تُخمَّن من القيم وحدها — تحتاج دلالة في اسم العمود */
export const NAME_REQUIRED = new Set([
  'discVal', 'discPct', 'lineTotal', 'desc', 'notes', 'terms', 'prodDesc',
  'docDiscVal', 'docDiscAcc', 'docDiscTax', 'unit', 'vendorPhone', 'supplyDate', 'dueDate'
]);

/** أقسام شريط الحقول في شاشة الربط */
export const SECTIONS = [
  ['تفاصيل الفاتورة', ['ref', 'desc', 'vendorRef', 'vendorName', 'vendorPhone', 'issueDate', 'dueDate', 'supplyDate', 'location', 'terms', 'notes']],
  ['خصم المستند', ['docDiscVal', 'docDiscAcc', 'docDiscTax']],
  ['تفاصيل البنود', ['prodRef', 'prodName', 'prodDesc', 'qty', 'unit', 'price', 'lineTotal', 'taxIncl', 'discPct', 'discVal', 'tax']]
];

/** تسميات أعمدة قالب قيود كما تظهر في الصف الثاني منه */
export const TPL_LABELS = {
  ref: ['مرجع الفاتوره', 'التسلسل'],
  desc: ['الوصف'],
  vendorRef: ['الرقم المرجعي للمورد'],
  issueDate: ['تاريخ الاصدار'],
  dueDate: ['تاريخ الاستحقاق'],
  supplyDate: ['تاريخ التوريد'],
  location: ['الموقع'],
  terms: ['الشروط والاحكام'],
  notes: ['الملاحظات'],
  docDiscVal: ['قيمه خصم المستند'],
  docDiscAcc: ['حساب خصم المستند'],
  docDiscTax: ['الفئه الضريبيه لخصم المستند'],
  prodRef: ['الرقم التسلسلي', 'الباركود للمنتج'],
  prodDesc: ['وصف المنتج'],
  qty: ['الكميه'],
  unit: ['وحده التحويل'],
  price: ['سعر الوحده'],
  taxIncl: ['شامل الضريبه'],
  discPct: ['نسبه الخصم'],
  discVal: ['قيمه الخصم'],
  tax: ['الضريبه']
};

/** الترتيب القياسي لأعمدة القالب الكامل A→U (يُستخدم عند غياب قالب مرفوع) */
export const DEFAULT_KEYS = [
  'ref', 'desc', 'vendorRef', 'issueDate', 'dueDate', 'supplyDate', 'location', 'terms', 'notes',
  'docDiscVal', 'docDiscAcc', 'docDiscTax', 'prodRef', 'prodDesc', 'qty', 'unit', 'price',
  'taxIncl', 'discPct', 'discVal', 'tax'
];

export const DEFAULT_HEADERS = [
  'مرجع الفاتورة/ التسلسل *', 'الوصف', 'الرقم المرجعي للمورد *', 'تاريخ الإصدار *', 'تاريخ الاستحقاق',
  'تاريخ التوريد', 'الموقع *', 'الشروط والأحكام', 'الملاحظات', 'قيمة خصم المستند', 'حساب خصم المستند *',
  'الفئة الضريبية لخصم المستند *', 'الرقم التسلسلي/ الباركود للمنتج *', 'وصف المنتج', 'الكمية *',
  'وحدة التحويل', 'سعر الوحدة *', 'شامل الضريبة؟ *', 'نسبة الخصم', 'قيمة الخصم', 'الضريبة% *'
];

export const fieldOf = (key) => FIELDS.find((f) => f[0] === key);
