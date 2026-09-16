/**
 * fields.js — تعريف حقول قالب استيراد العملاء الرسمي بقيود، ومرادفات أسماء
 * الأعمدة في ملفات العملاء (سواء ملف العميل الخاص بصيغة حرة، أو إعادة رفع
 * قالب قيود الإنجليزي نفسه).
 * كل حقل: [المفتاح، التسمية (عربي)، إلزامي؟، مرادفات اسم العمود، التسمية (إنجليزي)]
 * نفس بنية bill-import/lib/fields.js حرفياً — راجع تعليق رأسه.
 *
 * ترتيب/تسميات الأعمدة مطابقة حرفياً لقالب Qoyod الرسمي "Import Customers"
 * (A→T، عشرون عموداً) — راجع src/customer-import/assets/customer_import_template.xlsx.
 */

export const FIELDS = [
  ['ref', 'الرقم المرجعي', false, ['ref', 'ref no', 'ref. no', 'reference', 'reference number', 'رقم مرجعي', 'الرقم المرجعي', 'رقم تسلسلي', 'تسلسل', 'كود', 'كود العميل'], 'Ref. No.'],
  ['name', 'الاسم', true, ['name', 'customer name', 'الاسم', 'اسم العميل', 'اسم العميل الكامل'], 'Name'],
  ['organization', 'اسم المنشأة', false, ['organization', 'organization name', 'company', 'company name', 'اسم المنشأة', 'اسم الشركة', 'الشركة', 'المنشأة'], 'Organization Name'],
  ['website', 'الموقع الإلكتروني', false, ['website', 'site', 'url', 'الموقع الالكتروني', 'الموقع', 'موقع الويب'], 'Website'],
  ['phone', 'رقم التواصل الأساسي', false, ['primary contact number', 'phone', 'mobile', 'primary phone', 'جوال', 'هاتف', 'رقم الجوال', 'رقم التواصل', 'رقم التواصل الاساسي', 'رقم الهاتف'], 'Primary Contact Number'],
  ['phone2', 'رقم التواصل الثانوي', false, ['secondary contact number', 'secondary phone', 'phone 2', 'mobile 2', 'رقم التواصل الثانوي', 'جوال ثاني', 'هاتف ثاني', 'رقم اخر', 'رقم آخر'], 'Secondary Contact Number'],
  ['email', 'البريد الإلكتروني الأساسي', false, ['primary email', 'email', 'e-mail', 'البريد الالكتروني', 'البريد الالكتروني الاساسي', 'الايميل'], 'Primary Email'],
  ['email2', 'البريد الإلكتروني الثانوي', false, ['secondary email', 'email 2', 'البريد الالكتروني الثانوي', 'ايميل ثاني', 'بريد اخر'], 'Secondary Email'],
  ['status', 'الحالة', false, ['status', 'الحالة', 'نشط او غير نشط', 'فعال'], 'Status'],
  ['billingAddress', 'عنوان الفوترة', false, ['billing address', 'عنوان الفوترة', 'العنوان', 'عنوان الفاتوره'], 'Billing Address'],
  ['billingCity', 'مدينة الفوترة', false, ['billing city', 'مدينة الفوترة', 'المدينة'], 'Billing City'],
  ['billingState', 'منطقة/إقليم الفوترة', false, ['billing state', 'billing state/district', 'billing district', 'منطقة الفوترة', 'المنطقة', 'الاقليم'], 'Billing State/District'],
  ['billingZip', 'الرمز البريدي للفوترة', false, ['billing zip', 'billing zip code', 'billing postal code', 'الرمز البريدي للفوترة', 'الرمز البريدي', 'رمز بريدي'], 'Billing Zip'],
  ['billingCountry', 'دولة الفوترة', false, ['billing country', 'دولة الفوترة', 'الدولة'], 'Billing Country'],
  ['shippingAddress', 'عنوان الشحن', false, ['shipping address', 'عنوان الشحن'], 'Shipping Address'],
  ['shippingCity', 'مدينة الشحن', false, ['shipping city', 'مدينة الشحن'], 'Shipping City'],
  ['shippingState', 'منطقة/إقليم الشحن', false, ['shipping state', 'shipping state/district', 'shipping district', 'منطقة الشحن'], 'Shipping State/District'],
  ['shippingZip', 'الرمز البريدي للشحن', false, ['shipping zip', 'shipping zip code', 'shipping postal code', 'الرمز البريدي للشحن'], 'Shipping Zip'],
  ['shippingCountry', 'دولة الشحن', false, ['shipping country', 'دولة الشحن'], 'Shipping Country'],
  ['taxNumber', 'الرقم الضريبي', false, ['tax number', 'vat number', 'tax no', 'الرقم الضريبي', 'رقم ضريبي', 'الرقم الضريبى'], 'Tax Number']
];

/** كلمات تُضعف ترشيح الحقل عند ظهورها في اسم العمود (تمنع الخلط بين متشابهات) */
export const NEG = {
  phone: ['ثانوي', 'ثاني', 'secondary'],
  phone2: ['اساسي', 'اول', 'primary'],
  email: ['ثانوي', 'ثاني', 'secondary'],
  email2: ['اساسي', 'اول', 'primary'],
  billingAddress: ['شحن', 'shipping'],
  billingCity: ['شحن', 'shipping'],
  billingState: ['شحن', 'shipping'],
  billingZip: ['شحن', 'shipping'],
  billingCountry: ['شحن', 'shipping'],
  shippingAddress: ['فوتره', 'فاتوره', 'billing'],
  shippingCity: ['فوتره', 'فاتوره', 'billing'],
  shippingState: ['فوتره', 'فاتوره', 'billing'],
  shippingZip: ['فوتره', 'فاتوره', 'billing'],
  shippingCountry: ['فوتره', 'فاتوره', 'billing']
};

/** حقول لا تُخمَّن من القيم وحدها — تحتاج دلالة في اسم العمود.
 * phone2/email2 مُضافان هنا رغم كونهما شبيهين بقيمة phone/email تمامًا —
 * التمييز بينهما وبين الحقل الأساسي لا يمكن أن يأتي إلا من اسم العمود
 * (أساسي/ثانوي — primary/secondary)، لا من طبيعة القيم (نفس الشكل تمامًا). */
export const NAME_REQUIRED = new Set([
  'organization', 'website', 'billingAddress', 'billingCity', 'billingState', 'billingCountry',
  'shippingAddress', 'shippingCity', 'shippingState', 'shippingCountry', 'phone2', 'email2'
]);

/** أقسام شريط الحقول في شاشة الربط — العنوان {ar,en} لعرض ثنائي اللغة */
export const SECTIONS = [
  [{ ar: 'البيانات الأساسية', en: 'Basic details' }, ['ref', 'name', 'organization', 'website', 'status']],
  [{ ar: 'التواصل', en: 'Contact' }, ['phone', 'phone2', 'email', 'email2']],
  [{ ar: 'عنوان الفوترة', en: 'Billing address' }, ['billingAddress', 'billingCity', 'billingState', 'billingZip', 'billingCountry']],
  [{ ar: 'عنوان الشحن', en: 'Shipping address' }, ['shippingAddress', 'shippingCity', 'shippingState', 'shippingZip', 'shippingCountry']],
  [{ ar: 'الضريبة', en: 'Tax' }, ['taxNumber']]
];

/** الترتيب القياسي لأعمدة قالب Qoyod الرسمي A→T (Import Customers) */
export const DEFAULT_KEYS = [
  'ref', 'name', 'organization', 'website', 'phone', 'phone2', 'email', 'email2', 'status',
  'shippingAddress', 'shippingCity', 'shippingState', 'shippingZip', 'shippingCountry',
  'billingAddress', 'billingCity', 'billingState', 'billingZip', 'billingCountry', 'taxNumber'
];

export const DEFAULT_HEADERS = [
  'Ref. No.', 'Name*', 'Organization Name', 'Website', 'Primary Contact Number', 'Secondary Contact Number',
  'Primary Email', 'Secondary Email', 'Status', 'Shipping Address', 'Shipping City', 'Shipping State/District',
  'Shipping Zip', 'Shipping Country', 'Billing Address', 'Billing City', 'Billing State/District',
  'Billing Zip', 'Billing Country', 'Tax Number'
];

export const RESOURCE = 'customers';
export const HAS_SHIPPING = true;
export const TEMPLATE_SHEET_NAME = 'Import Customers ';

export const fieldOf = (key) => FIELDS.find((f) => f[0] === key);
