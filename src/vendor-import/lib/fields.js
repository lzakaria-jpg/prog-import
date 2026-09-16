/**
 * fields.js — تعريف حقول قالب استيراد الموردين الرسمي بقيود، ومرادفات أسماء
 * الأعمدة في ملفات العملاء. نفس src/customer-import/lib/fields.js حرفياً
 * باستثناء حقول عنوان الشحن الخمسة (غير موجودة بقالب "Import Vendors" الرسمي
 * — راجع src/vendor-import/assets/vendor_import_template.xlsx).
 */

export const FIELDS = [
  ['ref', 'الرقم المرجعي', false, ['ref', 'ref no', 'ref. no', 'reference', 'reference number', 'رقم مرجعي', 'الرقم المرجعي', 'رقم تسلسلي', 'تسلسل', 'كود', 'كود المورد'], 'Ref. No.'],
  ['name', 'الاسم', true, ['name', 'vendor name', 'الاسم', 'اسم المورد', 'اسم المورد الكامل'], 'Name'],
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
  ['taxNumber', 'الرقم الضريبي', false, ['tax number', 'vat number', 'tax no', 'الرقم الضريبي', 'رقم ضريبي', 'الرقم الضريبى'], 'Tax Number']
];

/** كلمات تُضعف ترشيح الحقل عند ظهورها في اسم العمود (تمنع الخلط بين متشابهات) */
export const NEG = {
  phone: ['ثانوي', 'ثاني', 'secondary'],
  phone2: ['اساسي', 'اول', 'primary'],
  email: ['ثانوي', 'ثاني', 'secondary'],
  email2: ['اساسي', 'اول', 'primary']
};

/** حقول لا تُخمَّن من القيم وحدها — تحتاج دلالة في اسم العمود */
export const NAME_REQUIRED = new Set([
  'organization', 'website', 'billingAddress', 'billingCity', 'billingState', 'billingCountry'
]);

/** أقسام شريط الحقول في شاشة الربط — العنوان {ar,en} لعرض ثنائي اللغة */
export const SECTIONS = [
  [{ ar: 'البيانات الأساسية', en: 'Basic details' }, ['ref', 'name', 'organization', 'website', 'status']],
  [{ ar: 'التواصل', en: 'Contact' }, ['phone', 'phone2', 'email', 'email2']],
  [{ ar: 'عنوان الفوترة', en: 'Billing address' }, ['billingAddress', 'billingCity', 'billingState', 'billingZip', 'billingCountry']],
  [{ ar: 'الضريبة', en: 'Tax' }, ['taxNumber']]
];

/** الترتيب القياسي لأعمدة قالب Qoyod الرسمي A→O (Import Vendors) */
export const DEFAULT_KEYS = [
  'ref', 'name', 'organization', 'website', 'phone', 'phone2', 'email', 'email2', 'status',
  'billingAddress', 'billingCity', 'billingState', 'billingZip', 'billingCountry', 'taxNumber'
];

export const DEFAULT_HEADERS = [
  'Ref. No.', 'Name*', 'Organization Name', 'Website', 'Primary Contact Number', 'Secondary Contact Number',
  'Primary Email', 'Secondary Email', 'Status', 'Billing Address', 'Billing City', 'Billing State/District',
  'Billing Zip', 'Billing Country', 'Tax Number'
];

export const RESOURCE = 'vendors';
export const HAS_SHIPPING = false;
export const TEMPLATE_SHEET_NAME = 'Import Vendors';

export const fieldOf = (key) => FIELDS.find((f) => f[0] === key);
