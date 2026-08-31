/* ========================= إعدادات الأعمدة =========================
   نسخ حرفي من qoyod_validator_core.js (أسطر 1-28، 69-74، 193-216، 955-978، 1083-1099) بلا أي تعديل منطقي. */

import { normKey } from './text.js';

export const COLUMNS = [
  {key:'A', name:'مرجع الفاتورة', level:'header', required:true,  type:'text'},
  {key:'B', name:'الوصف', level:'header', required:false, type:'text'},
  {key:'C', name:'الرقم المرجعي للعميل', level:'header', required:true, type:'text'},
  {key:'D', name:'تاريخ الإصدار', level:'header', required:true, type:'date'},
  {key:'E', name:'تاريخ الاستحقاق', level:'header', required:false, type:'date'},
  {key:'F', name:'تاريخ التوريد', level:'header', required:false, type:'date'},
  {key:'G', name:'الموقع', level:'header', required:true, type:'dropdown', dd:'G'},
  {key:'H', name:'طريقة الدفع', level:'header', required:false, type:'dropdown', dd:'H'},
  {key:'I', name:'الشروط والأحكام', level:'header', required:false, type:'text'},
  {key:'J', name:'الملاحظات', level:'header', required:false, type:'text'},
  {key:'K', name:'قيمة خصم المستند', level:'header', required:false, type:'number'},
  {key:'L', name:'حساب خصم المستند', level:'header', required:false, type:'dropdown', dd:'L'},
  {key:'M', name:'الفئة الضريبية لخصم المستند', level:'header', required:false, type:'dropdown', dd:'V'},
  {key:'N', name:'كود/باركود المنتج', level:'item', required:true, type:'text'},
  {key:'O', name:'وصف المنتج', level:'item', required:false, type:'text'},
  {key:'P', name:'الكمية', level:'item', required:true, type:'number'},
  {key:'Q', name:'وحدة التحويل', level:'item', required:false, type:'text'},
  {key:'R', name:'سعر الوحدة', level:'item', required:true, type:'number'},
  {key:'S', name:'شامل الضريبة؟', level:'item', required:true, type:'dropdown', dd:'S'},
  {key:'T', name:'نسبة الخصم', level:'item', required:false, type:'number'},
  {key:'U', name:'قيمة الخصم', level:'item', required:false, type:'number'},
  {key:'V', name:'الضريبة%', level:'item', required:true, type:'dropdown', dd:'V'},
];
export const HEADER_COLS = COLUMNS.filter(c=>c.level==='header').map(c=>c.key);
export const ITEM_COLS = COLUMNS.filter(c=>c.level==='item').map(c=>c.key);
export const COL_KEYS = COLUMNS.map(c=>c.key);

// لكل عمود من أعمدة القالب A-V، كلمات مفتاحية (عربي/إنجليزي) تُستخدم لتخمين أقرب عمود مطابق
// في ملف العميل غير المنظم. اسم العمود نفسه (col.name) يُضاف تلقائيًا كأولوية أولى للتطابق التام.
export const INVOICE_COLUMN_KEYWORDS = {
  A: ['مرجع الفاتورة','رقم الفاتورة','invoice number','invoice no','invoice #','inv no','inv ref','invoice ref','bill number','bill no','number of bill','#bill','bill','invoice','مرجع'],
  B: ['الوصف','وصف الفاتورة','description','بيان'],
  C: ['الرقم المرجعي للعميل','رقم العميل المرجعي','كود العميل','رمز العميل','customer ref','customer code','customer id','client code','client id','client ref','العميل'],
  D: ['تاريخ الإصدار','تاريخ الفاتورة','issue date','invoice date','invoice dt','date','التاريخ'],
  E: ['تاريخ الاستحقاق','due date','استحقاق'],
  F: ['تاريخ التوريد','تاريخ الشحن','delivery date','shipping date','توريد'],
  G: ['الموقع','الفرع','المستودع','location','branch','warehouse'],
  H: ['طريقة الدفع','وسيلة الدفع','payment method','payment'],
  I: ['الشروط والأحكام','الشروط','terms','terms and conditions'],
  J: ['الملاحظات','ملاحظة','notes','note'],
  K: ['قيمة خصم المستند','خصم المستند','document discount value','document discount'],
  L: ['حساب خصم المستند','discount account'],
  M: ['الفئة الضريبية لخصم المستند','ضريبة خصم المستند','discount tax category'],
  N: ['كود/باركود المنتج','كود المنتج','باركود المنتج','رمز المنتج','sku','barcode','product code','product sku','item code','item no','item number'],
  O: ['وصف المنتج','اسم المنتج','product description','product name','item name','item description','products','items','product','item','المنتج','الصنف'],
  P: ['الكمية','qty','quantity','qty ordered'],
  Q: ['وحدة التحويل','الوحدة','unit','uom'],
  R: ['سعر الوحدة','السعر','unit price','price'],
  S: ['شامل الضريبة؟','شامل الضريبة','السعر شامل الضريبة','المبلغ شامل الضريبة','tax inclusive','including vat','include tax','tax included','inclusive of tax'],
  T: ['نسبة الخصم','discount percent','discount percentage','discount %'],
  U: ['قيمة الخصم','discount amount','discount value'],
  V: ['الضريبة%','الضريبة','نسبة الضريبة','tax','tax rate','vat'],
};

// حقول مساعدة (غير مُصدَّرة مباشرة لملف قيود) تُستخدم فقط لاستنتاج قيم أعمدة أخرى تلقائيًا:
// إجمالي مبلغ البند (لاستنتاج شامل الضريبة/سعر الوحدة)، الإجمالي شامل الضريبة (لاستنتاج نسبة الضريبة)،
// واسم العميل/المنتج (لمطابقتهما بالاسم عند غياب الرقم المرجعي/الكود).
export const AUX_FIELD_KEYWORDS = {
  _grandTotal: ['الإجمالي شامل الضريبة','الإجمالي النهائي','الإجمالي مع الضريبة','المبلغ المستحق','total tax inclusive','total (tax inclusive)','grand total','total with tax','total incl tax','total including tax','amount due','total after tax'],
  _lineTotal: ['إجمالي مبلغ البند','إجمالي البند','قيمة السطر','المبلغ الإجمالي','الإجمالي','line total','line amount','net amount','amount','total','subtotal'],
  _customerName: ['اسم العميل','العميل','customer name','client name','customer'],
  _productName: ['اسم المنتج','وصف المنتج','product name','item name','product','products','items','المنتج','الصنف'],
};
// عناوين لا يصح إسنادها لحقل مساعد معيّن مهما بلغ التشابه
export const AUX_FIELD_REJECT = {
  _lineTotal: h => /tax|vat|ضريب/i.test(normKey(h)),
};

export const AUX_FIELD_LABELS = {
  _lineTotal: {icon:'🧮', label:'إجمالي مبلغ البند', hint:'(اختياري — يُستخدم لاستنتاج "شامل الضريبة؟" وسعر الوحدة تلقائيًا عند الحاجة)'},
  _grandTotal: {icon:'🧮', label:'الإجمالي شامل الضريبة', hint:'(اختياري — يُستخدم لاستنتاج نسبة الضريبة تلقائيًا عند عدم وجود عمود صريح لها)'},
  _customerName: {icon:'👤', label:'اسم العميل', hint:'(اختياري — يُستخدم لمطابقة الرقم المرجعي تلقائيًا إن لم يوجد عمود رقم مرجعي صريح)'},
  _productName: {icon:'📦', label:'اسم المنتج', hint:'(اختياري — يُستخدم لمطابقة كود/باركود المنتج تلقائيًا إن لم يوجد عمود كود صريح)'},
};

export const MONTH_NAMES = {
  jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,
  jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12,
  'يناير':1,'فبراير':2,'مارس':3,'ابريل':4,'أبريل':4,'مايو':5,'يونيو':6,'يوليو':7,
  'اغسطس':8,'أغسطس':8,'سبتمبر':9,'اكتوبر':10,'أكتوبر':10,'نوفمبر':11,'ديسمبر':12,
};

// مرادفات عنوان كل حقل كما قد تظهر في نسخ القالب المختلفة (بما فيها أخطاء إملائية واردة فعليًا).
export const MAPPING_DEFS = {
  products: [
    {field:'sku', label:'كود/باركود المنتج', kw:['sku','كود','باركود','تسلسلي','رقم المنتج','رقم الصنف','item code','product code'], required:true},
    {field:'name', label:'اسم المنتج', kw:['اسم المنتج','الاسم','اسم الصنف','اسم','name','product name','item name','المنتج','الصنف','description','الوصف'], required:false},
    {field:'sellable', label:'حالة البيع (يُباع / لا)', kw:['يباع','يُباع','هل يباع','قابل للبيع','متاح للبيع','حالة البيع','sellable','is sellable','for sale','sale','saleable','حالة'], required:false},
    {field:'stocked', label:'حالة التخزين (مخزن / غير مخزن)', kw:['مخزن','يخزن','يُخزن','تتبع المخزون','تتبع المخزن','نوع المنتج','مخزون','stocked','is stocked','track inventory','inventory tracking','stock tracking','product type','type'], required:false},
  ],
  stock: [
    {field:'sku', label:'كود/باركود المنتج', kw:['sku','كود','باركود','تسلسلي','رقم المنتج','منتج'], required:true},
    {field:'location', label:'الموقع/الفرع', kw:['موقع','فرع','location'], required:true},
    {field:'qty', label:'الكمية المتوفرة', kw:['كمية','qty','quantity','متوفر'], required:true},
  ],
  customers: [
    {field:'ref', label:'الرقم المرجعي', kw:['مرجعي','reference','كود العميل','رمز'], required:true},
    {field:'name', label:'اسم العميل', kw:['اسم','name'], required:false},
    {field:'status', label:'الحالة (نشط/غير نشط)', kw:['حالة','status','نشط'], required:false},
  ],
};

export const TEMPLATE_HEADER_SYNONYMS = {
  A: ['مرجع الفاتورة','رقم الفاتورة','المرجع'],
  B: ['الوصف','وصف الفاتورة'],
  C: ['الرقم المرجعي للعميل','رقم العميل المرجعي','الرقم المرجعي','رقم العميل'],
  D: ['تاريخ الإصدار','تاريخ الاصدار','تاريخ الفاتورة'],
  E: ['تاريخ الاستحقاق'],
  F: ['تاريخ التوريد','تاريخ التسليم'],
  G: ['الموقع','الفرع','المستودع'],
  H: ['طريقة الدفع','وسيلة الدفع'],
  I: ['الشروط والأحكام','الشروط'],
  J: ['الملاحظات','ملاحظات'],
  K: ['قيمة خصم المستند','خصم المستند'],
  L: ['حساب خصم المستند'],
  M: ['الفئة الضريبية لخصم المستند','ضريبة خصم المستند'],
  N: ['كود/باركود المنتج','الرقم التسلسلي/الباركود للمنتج','الرقم التسلسلي للمنتج','باركود المنتج','كود المنتج','رمز المنتج','الرقم التسلسلي','الباركود'],
  O: ['وصف المنتج','اسم المنتج'],
  P: ['الكمية','الكمية بالوحدة الأساسية','الكمية بالوحدة الاساسية'],
  Q: ['وحدة التحويل','الوحدة'],
  R: ['سعر الوحدة','السعر'],
  S: ['شامل الضريبة؟','شامل الضريبة','شامل الضريبية؟','شامل الضريبية','السعر شامل الضريبة'],
  T: ['نسبة الخصم'],
  U: ['قيمة الخصم'],
  V: ['الضريبة%','الضريبة %','الضريبة','نسبة الضريبة','الفئة الضريبية'],
};
