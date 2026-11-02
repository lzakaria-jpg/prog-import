// تعريف حقول قالب قيود HR (46 عمودًا بنفس ترتيب القالب الرسمي) + مرادفات العناوين والقيم.
// القوائم المرجعية (الأقسام، المواقع، الجنسيات ...) تُقرأ من القالب الرسمي نفسه وقت التشغيل ولا تُكتب هنا.

export const GROUPS = {
  personal: 'المعلومات الشخصية',
  contact: 'الاتصال',
  employment: 'التوظيف',
  bank: 'البنك',
  salary: 'الراتب',
};

// type: text | list | date | email | phone | iban | amount | id | name_en | name_ar | textfree
export const FIELDS = [
  { key: 'first_name', label: 'الاسم الأول (إنجليزي)', group: 'personal', type: 'name_en', req: true },
  { key: 'last_name', label: 'اسم العائلة (إنجليزي)', group: 'personal', type: 'name_en', req: true },
  { key: 'first_name_ar', label: 'الاسم الأول (عربي)', group: 'personal', type: 'name_ar', req: true },
  { key: 'last_name_ar', label: 'اسم العائلة (عربي)', group: 'personal', type: 'name_ar', req: true },
  { key: 'gender', label: 'الجنس', group: 'personal', type: 'list', req: true },
  { key: 'date_of_birth', label: 'تاريخ الميلاد', group: 'personal', type: 'date', req: true },
  { key: 'marital_status', label: 'الحالة الاجتماعية', group: 'personal', type: 'list', req: true },
  { key: 'nationality', label: 'الجنسية', group: 'personal', type: 'list', req: true },
  { key: 'residence_country', label: 'بلد الإقامة', group: 'personal', type: 'list', req: true },
  { key: 'national_id_number', label: 'رقم الهوية الوطنية', group: 'personal', type: 'id', req: true },
  { key: 'national_id_issued_date', label: 'تاريخ إصدار الهوية', group: 'personal', type: 'date', req: true },
  { key: 'national_id_expiry_date', label: 'تاريخ انتهاء الهوية', group: 'personal', type: 'date', req: true },
  { key: 'email', label: 'البريد الإلكتروني', group: 'contact', type: 'email', req: true },
  { key: 'job_title', label: 'المسمى الوظيفي', group: 'employment', type: 'text', req: true },
  { key: 'work_phone_number', label: 'رقم هاتف العمل', group: 'contact', type: 'phone', req: true },
  { key: 'employment_status', label: 'حالة التوظيف', group: 'employment', type: 'list', req: true },
  { key: 'department', label: 'القسم', group: 'employment', type: 'list', req: true },
  { key: 'employee_no', label: 'الرقم الوظيفي', group: 'employment', type: 'code' },
  { key: 'manager', label: 'المسؤول المباشر', group: 'employment', type: 'text' },
  { key: 'location', label: 'الموقع', group: 'employment', type: 'list' },
  { key: 'work_email', label: 'بريد العمل', group: 'contact', type: 'email' },
  { key: 'home_phone_number', label: 'هاتف المنزل', group: 'contact', type: 'phone' },
  { key: 'address', label: 'العنوان', group: 'contact', type: 'text' },
  { key: 'emergency_contact_name', label: 'اسم جهة اتصال الطوارئ', group: 'contact', type: 'text' },
  { key: 'emergency_contact_relationship', label: 'صلة القرابة', group: 'contact', type: 'text' },
  { key: 'emergency_contact_home_phone_number', label: 'هاتف منزل الطوارئ', group: 'contact', type: 'phone' },
  { key: 'emergency_contact_mobile_phone_number', label: 'جوال الطوارئ', group: 'contact', type: 'phone' },
  { key: 'join_date', label: 'تاريخ الانضمام', group: 'employment', type: 'date', req: true },
  { key: 'employment_type', label: 'نوع التوظيف', group: 'employment', type: 'list', req: true },
  { key: 'contract_type', label: 'نوع العقد', group: 'employment', type: 'list' },
  { key: 'contract_end_date', label: 'تاريخ نهاية العقد', group: 'employment', type: 'date' },
  { key: 'attendance_setting', label: 'ملف الدوام', group: 'employment', type: 'list' },
  { key: 'education_level', label: 'المستوى التعليمي', group: 'employment', type: 'list' },
  { key: 'education_description', label: 'وصف التعليم', group: 'employment', type: 'text' },
  { key: 'bank_name', label: 'اسم البنك', group: 'bank', type: 'text' },
  { key: 'bank_code', label: 'رمز البنك', group: 'bank', type: 'code' },
  { key: 'account_number', label: 'رقم الحساب', group: 'bank', type: 'code' },
  { key: 'bank_account_currency', label: 'عملة الحساب البنكي', group: 'bank', type: 'list' },
  { key: 'bank_address', label: 'عنوان البنك', group: 'bank', type: 'text' },
  { key: 'iban', label: 'رقم الآيبان', group: 'bank', type: 'iban' },
  { key: 'swift_code', label: 'رمز السويفت', group: 'bank', type: 'code' },
  { key: 'salary_start_date', label: 'تاريخ بدء الراتب', group: 'salary', type: 'date' },
  { key: 'salary_basic_salary_amount', label: 'الراتب الأساسي', group: 'salary', type: 'amount' },
  { key: 'salary_pay_frequency', label: 'دورية الدفع', group: 'salary', type: 'list' },
  { key: 'salary_basic_salary_kind', label: 'نوع الراتب', group: 'salary', type: 'list' },
  { key: 'salary_input_time_type', label: 'أساس احتساب الوقت', group: 'salary', type: 'list' },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

// أعمدة تُحفظ نصًا دائمًا (حتى لا تضيع الأصفار الأولى أو يتحول الرقم لصيغة علمية)
export const TEXT_TYPES = new Set(['id', 'phone', 'iban', 'code', 'text', 'email', 'name_en', 'name_ar']);

// ---------- مرادفات عناوين الأعمدة في ملف العميل ----------
export const HEADER_ALIASES = {
  first_name: ['first name', 'firstname', 'given name', 'الاسم الاول انجليزي', 'الاسم الاول english', 'الاسم الاول بالانجليزي', 'الاسم الاول بالانجليزية', 'first name en', 'first name english'],
  last_name: ['last name', 'lastname', 'surname', 'family name', 'اسم العائله انجليزي', 'اسم العائله english', 'اسم العائله بالانجليزي', 'العائله انجليزي', 'last name en', 'last name english'],
  first_name_ar: ['الاسم الاول', 'الاسم الاول عربي', 'الاسم الاول بالعربي', 'الاسم الاول بالعربيه', 'first name ar', 'first name arabic', 'الاسم الاول ar'],
  last_name_ar: ['اسم العائله', 'اسم العائله عربي', 'العائله', 'اللقب', 'اسم العائله بالعربي', 'اسم العائله بالعربيه', 'الاسم الاخير', 'last name ar', 'last name arabic', 'الكنيه'],
  gender: ['الجنس', 'النوع', 'gender', 'sex', 'ذكر انثي'],
  date_of_birth: ['تاريخ الميلاد', 'الميلاد', 'تاريخ الولاده', 'date of birth', 'dob', 'birth date', 'birthdate', 'birthday', 'تاريخ ميلاد'],
  marital_status: ['الحاله الاجتماعيه', 'الحاله الاجتماعية', 'الحاله الزوجيه', 'marital status', 'marital', 'الحاله الاجتماعيه للموظف'],
  nationality: ['الجنسيه', 'جنسيه', 'nationality', 'citizenship'],
  residence_country: ['بلد الاقامه', 'دوله الاقامه', 'بلد السكن', 'residence country', 'country of residence', 'residence', 'الدوله', 'country'],
  national_id_number: ['رقم الهويه الوطنيه', 'رقم الهويه', 'رقم الهويه الاقامه', 'رقم الهويه الوطنيه الاقامه', 'الهويه الوطنيه', 'الهويه', 'رقم الاقامه', 'الاقامه', 'رقم الاقامه الهويه', 'هويه', 'iqama', 'iqama number', 'id number', 'id no', 'national id', 'national id number', 'iqama no', 'رقم الهويه او الاقامه', 'السجل المدني'],
  national_id_issued_date: ['تاريخ اصدار الهويه', 'تاريخ اصدار الهويه الوطنيه', 'اصدار الهويه', 'تاريخ اصدار الاقامه', 'national id issued date', 'id issue date', 'id issued date', 'issue date', 'تاريخ الاصدار', 'تاريخ اصدار الهويه الاقامه'],
  national_id_expiry_date: ['تاريخ انتهاء الهويه', 'تاريخ انتهاء الهويه الوطنيه', 'انتهاء الهويه', 'تاريخ انتهاء الاقامه', 'انتهاء الاقامه', 'national id expiry date', 'id expiry date', 'id expiry', 'expiry date', 'تاريخ الانتهاء', 'تاريخ انتهاء الهويه الاقامه'],
  email: ['البريد الالكتروني', 'الايميل', 'ايميل', 'البريد', 'email', 'e mail', 'email address', 'personal email', 'البريد الشخصي', 'البريد الالكتروني الشخصي'],
  job_title: ['المسمي الوظيفي', 'المسمي', 'الوظيفه', 'المهنه', 'job title', 'title', 'position', 'job', 'designation', 'المسمي الوظيفي للموظف', 'مسمي وظيفي'],
  work_phone_number: ['رقم هاتف العمل', 'هاتف العمل', 'جوال العمل', 'الجوال', 'رقم الجوال', 'الهاتف', 'رقم الهاتف', 'الموبايل', 'رقم الموبايل', 'work phone number', 'work phone', 'phone', 'mobile', 'phone number', 'mobile number', 'جوال', 'هاتف'],
  employment_status: ['حاله التوظيف', 'حاله الموظف', 'الحاله', 'الحاله الوظيفيه', 'employment status', 'status', 'employee status'],
  department: ['القسم', 'الاداره', 'قسم', 'الادارة', 'department', 'dept', 'division'],
  employee_no: ['الرقم الوظيفي', 'رقم الموظف', 'الرقم الوظيفي للموظف', 'employee no', 'employee number', 'employee id', 'emp no', 'emp id', 'staff id', 'staff number', 'الرقم التسلسلي للموظف', 'كود الموظف', 'الكود'],
  manager: ['المسؤول المباشر', 'المدير المباشر', 'المدير', 'مباشر', 'manager', 'direct manager', 'reports to', 'line manager', 'supervisor', 'المشرف'],
  location: ['الموقع', 'الفرع', 'موقع العمل', 'مكان العمل', 'location', 'branch', 'work location', 'site'],
  work_email: ['بريد العمل', 'ايميل العمل', 'البريد الالكتروني للعمل', 'work email', 'company email', 'official email', 'البريد الرسمي'],
  home_phone_number: ['هاتف المنزل', 'رقم المنزل', 'home phone', 'home phone number', 'هاتف المنزل الارضي'],
  address: ['العنوان', 'عنوان السكن', 'عنوان الموظف', 'address', 'home address'],
  emergency_contact_name: ['اسم جهه الاتصال في حالات الطوارئ', 'جهه الاتصال في الطوارئ', 'اسم الطوارئ', 'اسم جهه الطوارئ', 'emergency contact', 'emergency contact name', 'emergency name'],
  emergency_contact_relationship: ['صله القرابه', 'القرابه', 'صله القرابه للطوارئ', 'emergency contact relationship', 'relationship', 'emergency relationship', 'relation'],
  emergency_contact_home_phone_number: ['هاتف منزل الطوارئ', 'emergency contact home phone number', 'emergency home phone'],
  emergency_contact_mobile_phone_number: ['جوال الطوارئ', 'جوال جهه الطوارئ', 'هاتف الطوارئ', 'رقم الطوارئ', 'emergency contact mobile phone number', 'emergency mobile', 'emergency phone', 'emergency contact phone'],
  join_date: ['تاريخ الانضمام', 'تاريخ التعيين', 'تاريخ المباشره', 'تاريخ الالتحاق', 'تاريخ بدء العمل', 'تاريخ مباشره العمل', 'تاريخ التوظيف', 'join date', 'joining date', 'hire date', 'start date', 'date of joining', 'date joined', 'doj', 'تاريخ المباشرة'],
  employment_type: ['نوع التوظيف', 'نوع الدوام', 'نوع العمل', 'نوع الوظيفه', 'employment type', 'job type', 'work type', 'contract nature', 'نمط الدوام'],
  contract_type: ['نوع العقد', 'العقد', 'مده العقد', 'contract type', 'contract', 'contract duration'],
  contract_end_date: ['تاريخ نهايه العقد', 'نهايه العقد', 'تاريخ انتهاء العقد', 'انتهاء العقد', 'contract end date', 'contract end', 'contract expiry', 'end of contract'],
  attendance_setting: ['ملف الدوام', 'جدول الدوام', 'الدوام', 'attendance setting', 'attendance profile', 'shift', 'work schedule', 'schedule'],
  education_level: ['المستوي التعليمي', 'المؤهل', 'المؤهل العلمي', 'التعليم', 'الشهاده', 'education level', 'education', 'qualification', 'degree'],
  education_description: ['وصف التعليم', 'التخصص', 'تفاصيل المؤهل', 'education description', 'major', 'field of study', 'specialization'],
  bank_name: ['اسم البنك', 'البنك', 'bank name', 'bank'],
  bank_code: ['رمز البنك', 'كود البنك', 'bank code', 'sort code', 'رمز المصرف'],
  account_number: ['رقم الحساب', 'الحساب البنكي', 'رقم الحساب البنكي', 'account number', 'account no', 'bank account', 'bank account number', 'acc no'],
  bank_account_currency: ['عمله الحساب البنكي', 'عمله الحساب', 'العمله', 'bank account currency', 'account currency', 'currency'],
  bank_address: ['عنوان البنك', 'فرع البنك', 'bank address', 'bank branch'],
  iban: ['رقم الايبان', 'الايبان', 'ايبان', 'iban', 'iban number', 'iban no', 'رقم الحساب الدولي'],
  swift_code: ['رمز السويفت', 'السويفت', 'سويفت', 'swift code', 'swift', 'bic', 'swift bic'],
  salary_start_date: ['تاريخ بدء الراتب', 'بدء الراتب', 'تاريخ سريان الراتب', 'salary start date', 'salary effective date', 'salary from'],
  salary_basic_salary_amount: ['الراتب الاساسي', 'الراتب', 'اساسي الراتب', 'الاساسي', 'راتب اساسي', 'الاجر الاساسي', 'الاجر', 'basic salary', 'salary', 'basic', 'basic pay', 'salary amount', 'basic salary amount', 'gross salary'],
  salary_pay_frequency: ['دوره الدفع', 'دوريه الدفع', 'دوره الراتب', 'تكرار الدفع', 'salary pay frequency', 'pay frequency', 'payment frequency', 'pay period'],
  salary_basic_salary_kind: ['نوع الراتب', 'نوع الاجر', 'salary kind', 'salary basic salary kind', 'salary type', 'pay type', 'basic salary kind'],
  salary_input_time_type: ['اساس احتساب الوقت', 'اساس الاحتساب', 'نوع ادخال الوقت', 'salary input time type', 'time basis', 'input time type'],
};

// إضافات مرادفات شائعة في ملفات العملاء
const MORE_ALIASES = {
  employee_no: ['emp', 'emp code', 'employee code', 'staff code', 'رقم وظيفي', 'badge', 'badge no', 'كود', 'الكود الوظيفي', 'رقم الموظف الوظيفي'],
  employment_status: ['الوضع الوظيفي', 'وضع الموظف', 'حاله الموظف', 'الحاله الوظيفيه', 'employment state', 'active inactive'],
  national_id_number: ['رقم السجل المدني', 'السجل المدني الاقامه', 'رقم الهويه الاقامه', 'الهويه الاقامه', 'id iqama', 'iqama id', 'id iqama no', 'رقم الهويه الوطنيه الاقامه', 'national id iqama', 'هويه اقامه'],
  work_phone_number: ['ارقام التواصل', 'رقم التواصل', 'التواصل', 'contact number', 'contact no', 'tel', 'telephone', 'cell', 'cell phone', 'رقم الجوال الشخصي', 'mobile no'],
  first_name: ['first name english', 'given name en', 'forename'],
  last_name: ['family name en', 'last name family'],
  date_of_birth: ['تاريخ الميلاد الميلادي', 'birth'],
  join_date: ['تاريخ الدخول للشركه', 'الدخول للشركه', 'تاريخ دخول الشركه', 'تاريخ الالتحاق بالشركه', 'تاريخ بدايه العمل', 'تاريخ التحاق', 'employment date', 'joined'],
  job_title: ['الوظيفه الحاليه', 'المهنه حسب الاقامه', 'occupation', 'role'],
  department: ['الاداره القسم', 'القسم الاداره', 'section'],
  education_level: ['المؤهل الدراسي', 'الدرجه العلميه'],
  national_id_expiry_date: ['iqama expiry', 'iqama expiry date', 'iqama exp', 'residency expiry', 'انتهاء الاقامه', 'id exp', 'expiry of iqama'],
  national_id_issued_date: ['iqama issue date', 'iqama issue', 'اصدار الاقامه'],
  salary_start_date: ['تاريخ بدايه الراتب', 'بدايه الراتب', 'salary start'],
  emergency_contact_name: ['اسم قريب للطوارئ', 'قريب للطوارئ', 'اسم الشخص للطوارئ', 'الاتصال في الطوارئ', 'emergency person'],
  attendance_setting: ['نظام الدوام', 'الوردية', 'نوع الدوام اليومي'],
};
MORE_ALIASES.employee_no.push('empno', 'empid', 'employeeno', 'employeeid', 'staffid', 'staffno', 'emp code no', 'employee code');
MORE_ALIASES.national_id_number.push('nid', 'beneficiary id', 'رقم المستفيد', 'id no iqama', 'iqama no', 'iqamano', 'nationalid');
MORE_ALIASES.job_title.push('profession', 'profession iqama', 'المهنه', 'trade');
MORE_ALIASES.date_of_birth.push('dob', 'birthdate', 'date birth');
MORE_ALIASES.join_date.push('dateofjoining', 'joiningdate', 'joining', 'doj');
for (const [k, arr] of Object.entries(MORE_ALIASES)) HEADER_ALIASES[k].push(...arr);
// صيغ تصدير أنظمة HR الشائعة (ZenHR / Bayzat / Odoo / جسر / مسير)
const EXPORT_ALIASES = {
  employee_no: ['employment number', 'employment no', 'badge id', 'badge number', 'personnel number', 'رقم الموظف بالنظام'],
  join_date: ['hiring date', 'hired date', 'hired on', 'date of hire', 'date of hiring', 'first working day'],
  national_id_number: ['identification no', 'identification number', 'id number', 'national id iqama'],
  nationality: ['nationality country'],
  residence_country: ['country of residence', 'private country'],
  salary_basic_salary_amount: ['wage', 'contract wage', 'basic pay'],
  education_level: ['certificate level', 'certificate'],
  work_phone_number: ['work mobile', 'mobile number'],
};
for (const [k, arr] of Object.entries(EXPORT_ALIASES)) HEADER_ALIASES[k].push(...arr);
const MORE_FULLNAME = ['beneficiary name', 'اسم المستفيد', 'employee name as per iqama', 'name as per iqama', 'الاسم حسب الهويه', 'الاسم حسب الاقامه', 'name en', 'name ar', 'emp name', 'employee full name'];

// كلمات إذا ظهرت بعنوان العمود تمنع ربطه بهذا الحقل (مثلًا "اسم الأب" ليس الاسم الكامل، "بدل السكن" ليس الراتب الأساسي)
const NAME_NEG = ['اب', 'الاب', 'ابو', 'والد', 'الوالد', 'جد', 'الجد', 'الام', 'father', 'middle', 'grandfather', 'mother', 'طوارئ', 'الطوارئ', 'emergency', 'المدير', 'مدير', 'manager', 'المسؤول', 'المشرف', 'supervisor', 'البنك', 'bank', 'الشركه', 'company', 'المستخدم', 'user', 'username', 'الكفيل', 'sponsor', 'قريب', 'القريب', 'relative', 'الوظيفه', 'القسم', 'الملف', 'file', 'المرافق', 'dependent', 'الزوج', 'الزوجه', 'spouse'];
const PHONE_NEG = ['طوارئ', 'الطوارئ', 'emergency', 'منزل', 'المنزل', 'home', 'fax', 'فاكس', 'القريب', 'relative'];
const ID_NEG = ['جواز', 'الجواز', 'passport', 'حدود', 'الحدود', 'border', 'تامين', 'التامين', 'insurance', 'gosi', 'حساب', 'الحساب', 'account', 'emp', 'وظيفي', 'الوظيفي', 'staff', 'بطاقه العمل', 'رخصه', 'الرخصه', 'license', 'licence', 'المرافق'];
const IDDATE_NEG = ['جواز', 'الجواز', 'passport', 'رخصه', 'الرخصه', 'license', 'licence', 'تامين', 'التامين', 'insurance', 'العقد', 'contract', 'تاشيره', 'التاشيره', 'visa', 'عمل', 'العمل', 'work permit'];
export const HEADER_NEG = {
  full_name: NAME_NEG, first_name: NAME_NEG, last_name: NAME_NEG, first_name_ar: NAME_NEG, last_name_ar: NAME_NEG,
  salary_basic_salary_amount: ['بدل', 'بدلات', 'اجمالي', 'الاجمالي', 'gross', 'total', 'allowance', 'allowances', 'housing', 'transport', 'سكن', 'السكن', 'نقل', 'النقل', 'صافي', 'الصافي', 'net', 'deduction', 'deductions', 'خصم', 'الخصومات', 'حوافز', 'عموله', 'commission', 'overtime', 'اضافي', 'الاضافي', 'bonus', 'مكافاه', 'تامينات', 'gosi', 'سابق', 'previous', 'old'],
  work_phone_number: PHONE_NEG,
  national_id_number: ID_NEG,
  national_id_issued_date: IDDATE_NEG,
  national_id_expiry_date: IDDATE_NEG,
  date_of_birth: ['الزوج', 'الزوجه', 'المرافق', 'الابن', 'spouse', 'dependent', 'child'],
  email: ['العمل', 'عمل', 'work', 'company', 'official', 'الرسمي', 'الشركه', 'المدير', 'manager'],
  employee_no: ['الهويه', 'الاقامه', 'iqama', 'national', 'الجواز', 'passport', 'الحساب', 'account'],
  job_title: ['المدير', 'manager'],
  account_number: ['قديم', 'القديم', 'old', 'previous', 'سابق', 'السابق', 'iban', 'ايبان', 'الايبان', 'الدولي'],
  emergency_contact_name: ['رقم', 'جوال', 'هاتف', 'phone', 'mobile', 'no', 'number'],
  join_date: ['العقد', 'contract', 'الراتب', 'salary', 'الاقامه', 'الهويه'],
  manager: ['رقم', 'id', 'no', 'number', 'email', 'الايميل', 'البريد'],
};
// أعمدة تُتجاهل دائمًا (رقم تسلسلي، ملاحظات...)
export const IGNORE_HEADERS = ['م', 'ت', 'no', 'sr', 's no', 'sno', 'sr no', 'srno', 'sl no', 'remarks', 'الملاحظات', 'payment description', 'sn', 's n', 'serial', 'مسلسل', 'التسلسل', 'تسلسل', 'الترقيم', 'ملاحظات', 'ملاحظه', 'notes', 'note', 'remarks', 'comments', 'تعليق', 'التوقيع', 'signature'];

// حقول وهمية للاسم الكامل (تُقسَّم تلقائيًا)
export const VIRTUAL_FIELDS = [
  { key: 'full_name_ar', label: 'الاسم الكامل (عربي)', group: 'personal', virtual: true },
  { key: 'full_name_en', label: 'الاسم الكامل (إنجليزي)', group: 'personal', virtual: true },
];
export const FULLNAME_ALIASES = [...MORE_FULLNAME, 'الاسم', 'الاسم الكامل', 'اسم الموظف', 'الاسم رباعي', 'الاسم الرباعي', 'اسم', 'name', 'full name', 'fullname', 'employee name', 'staff name', 'الاسم ثلاثي', 'الاسم الثلاثي', 'اسم الموظف كاملا', 'الاسم بالكامل', 'الاسم الكامل عربي', 'الاسم الكامل انجليزي', 'الاسم بالعربي', 'الاسم بالانجليزي', 'full name ar', 'full name en', 'arabic name', 'english name'];

// ---------- مرادفات قيم القوائم ----------
// الهدف (المفتاح) يُحلّ إلى القيمة الفعلية الموجودة في القالب بمقارنة منسّقة.
// المرادف الذي يبدأ بـ ~ يعني مطابقة تقريبية تُعلَّم "للمراجعة".
export const VALUE_ALIASES = {
  gender: {
    'ذكر': ['m', 'male', 'man', 'boy', 'رجل', 'مذكر', 'ذكور', 'ذ', 'mr'],
    'أنثى': ['f', 'female', 'woman', 'girl', 'امراه', 'مؤنث', 'انثي', 'اناث', 'انثى', 'ا', 'mrs', 'ms', 'miss'],
  },
  marital_status: {
    'أعزب': ['single', 'عزباء', 'عازب', 'غير متزوج', 'unmarried'],
    'متزوج': ['married', 'متزوجه', 'متزوج ه'],
    'مطلق': ['divorced', 'مطلقه'],
    'أرمل': ['widowed', 'widow', 'widower', 'ارمله'],
  },
  employment_status: {
    'مفعّل': ['active', 'نشط', 'فعال', 'على راس العمل', 'علي راس العمل', 'مفعل', 'موظف', 'working', 'قائم', 'على رأس العمل', 'on duty', 'employed', 'current', 'بالخدمه', 'على الخدمه', 'يعمل'],
    'غير مفعّل': ['inactive', 'archived', 'not active', 'deactivated', 'منتهي الخدمة', 'غير نشط', 'منتهي', 'terminated', 'موقوف', 'غير فعال', 'مستقيل', 'ترك العمل', 'غير مفعل', 'resigned', 'left', 'exited', 'final exit', 'خروج نهائي', 'منتهي الخدمه', 'منتهيه خدمته', 'انتهت خدمته', 'مفصول', 'dismissed', 'ended', 'end of service', 'نهايه الخدمه', 'نهايه خدمه', 'استقال', 'هارب', 'متغيب عن العمل', 'absconded', 'تم انهاء الخدمه'],
    'فترة الإشعار': ['notice period', 'notice', 'فتره اشعار', 'فترة اشعار', 'under notice', 'في فترة الاشعار', 'تحت الاشعار', 'on notice', 'serving notice', 'notice served', 'في فتره الانذار', 'فتره الانذار'],
  },
  employment_type: {
    'دوام كامل': ['full time', 'fulltime', 'full-time', 'كامل', 'دوام كلي', 'full', 'permanent', 'دائم', 'ft'],
    'دوام جزئي': ['part time', 'parttime', 'part-time', 'جزئي', 'part', 'pt'],
    'عقد': ['contract', 'contractor', 'عقد مؤقت', 'temporary', 'temp', 'مؤقت', 'عقد محدد'],
  },
  contract_type: {
    'محدد المدة': ['fixed', 'fixed term', 'fixed-term', 'limited', 'محدد', 'محدده المده', 'محدودة المدة', 'definite', 'limited term'],
    'غير محدد المدة': ['unlimited', 'indefinite', 'permanent', 'open ended', 'open-ended', 'غير محدد', 'دائم', 'مفتوح', 'غير محدده المده', 'unlimited term'],
  },
  education_level: {
    'أقل من الثانوية': ['less than high school', 'below high school', 'اقل من ثانوي', 'ابتدائي', 'primary', 'intermediate', '~متوسط'],
    'شهادة ثانوية': ['high school', 'secondary', 'ثانويه', 'ثانوي', 'ثانويه عامه', 'ثانوية عامة', 'توجيهي'],
    'درجة المنتسبين': ['associate', 'associate degree', 'منتسبين', '~diploma', '~دبلوم', '~دبلوم عالي'],
    'درجة البكالوريوس': ['bachelor', "bachelor's degree", 'bachelors degree', 'bachelor degree', 'bachelor s degree', 'university degree', 'bachelors', "bachelor's", 'bsc', 'ba', 'بكالوريوس', 'بكالريوس', 'ليسانس', '~جامعي', '~جامعية'],
    'درجة ماجستير': ['master', 'masters', "master's", 'msc', 'mba', 'ماجستير', 'ma'],
    'درجة دكتوراه': ['phd', 'doctorate', 'دكتوراه', 'doctor', 'ph d'],
  },
  attendance_setting: {
    'افتراضي': ['عادي', 'default', 'normal', 'standard', 'regular', 'general', 'صباحي', 'morning', 'الافتراضي'],
  },
  salary_pay_frequency: {
    'Monthly': ['شهري', 'شهريا', 'month', 'monthly', 'per month'],
    'Weekly': ['اسبوعي', 'أسبوعي', 'weekly', 'week', 'per week'],
    'Daily': ['يومي', 'يوميا', 'daily', 'day', 'per day'],
  },
  salary_basic_salary_kind: {
    'Fixed': ['ثابت', 'fixed', 'salary', 'مقطوع', 'شهري'],
    'Hourly': ['بالساعة', 'ساعي', 'hourly', 'hour', 'per hour', 'بالساعه'],
  },
  salary_input_time_type: {
    'وقت التوظيف': ['employment time', 'employed time', 'hiring time', 'وقت الدوام', 'وقت التعيين'],
    'وقت العمل الفعلي': ['actual', 'actual working time', 'actual time', 'الفعلي', 'وقت العمل', 'actual work time'],
  },
  department: {
    'الموارد البشرية': ['hrd', 'hrm', 'personnel', 'people', 'hr', 'human resources', 'موارد بشرية', 'الموارد البشريه', 'شؤون الموظفين', 'شئون الموظفين', 'h r'],
    'المالية': ['fin', 'fin acct', 'accounts finance', 'accounts and finance', 'finance accounts', 'ماليه', 'الماليه والحسابات', 'finance', 'مالية', 'المالية والمحاسبة', 'المحاسبة', 'حسابات', 'الحسابات', 'accounting', 'accounts', 'finance and accounting'],
    'الهندسة': ['eng', 'engg', 'projects', 'engineering', 'هندسة', 'القسم الهندسي', 'الهندسه'],
    'المبيعات': ['sls', 'sales dept', 'sales', 'مبيعات', 'sale', 'business development'],
    'التسويق': ['mktg', 'mkt', 'mkting', 'marketing', 'تسويق', 'التسويق والاعلان'],
    'العمليات': ['operations', 'عمليات', 'ops', 'operation', 'التشغيل', 'تشغيل'],
    'تقنية المعلومات': ['it', 'i t', 'information technology', 'تقنيه معلومات', 'الدعم الفني', 'الحاسب الالي', 'tech', 'technology', 'it department'],
    'خدمة العملاء': ['cs', 'cx', 'customer services', 'customer service', 'customer care', 'customer support', 'call center', 'call centre', 'مركز الاتصال', 'مركز اتصال', 'الكول سنتر', 'contact center', 'customer experience', 'تجربه العملاء', 'خدمه عملاء', 'الدعم', 'support'],
    'المشتريات': ['proc', 'purch', 'procurement', 'purchasing', 'purchase', 'مشتريات'],
    'الشؤون الإدارية': ['admin', 'administration', 'الشئون الاداريه', 'الشؤون الاداريه', 'اداريه', 'الاداريه', 'شؤون اداريه'],
    'القانونية': ['legal', 'الشؤون القانونيه', 'قانونيه'],
    'الذكاء الاصطناعي': ['ai', 'a i', 'artificial intelligence', 'data and ai', 'data ai', 'ai and data', 'data science', 'ai department', 'ذكاء اصطناعي', 'الذكاء الصناعي', 'الذكاء الاصطناعى'],
    'ادارة المنتج': ['product', 'products', 'product management', 'product team', 'product dept', 'المنتج', 'المنتجات', 'ادارة المنتجات', 'إدارة المنتج', 'إدارة المنتجات', 'اداره المنتجات', 'اداره المنتج'],
    'المستودعات': ['warehouse', 'stores', 'مستودع', 'المستودع', 'logistics', 'اللوجستيات'],
  },
  bank_account_currency: {
    'ريال سعودي': ['sar', 'sr', 'ر س', 'ريال', 'saudi riyal', 'riyal', 'saudi riyals', 'ريال سعودى'],
    'درهم إماراتي': ['aed', 'dirham', 'uae dirham'],
    'ريال قطري': ['qar'],
    'دينار كويتي': ['kwd'],
    'دينار بحريني': ['bhd'],
    'ريال عماني': ['omr'],
    'دولار أمريكي': ['usd', 'dollar', 'us dollar', 'دولار'],
    'يورو': ['eur', 'euro'],
    'جنيه إسترليني': ['gbp', 'pound sterling', 'british pound'],
    'جنيه مصري': ['egp', 'egyptian pound'],
    'دينار أردني': ['jod'],
    'روبية هندية': ['inr', 'indian rupee'],
    'روبية باكستانية': ['pkr', 'pakistani rupee'],
    'بيزو فلبيني': ['php', 'philippine peso'],
  },
};

// الجنسيات (صفات) وأسماء الدول الإنجليزية → اسم الدولة العربي كما في القالب
const COUNTRY_ALIASES = {
  'السعودية': ['سعودي', 'سعوديه', 'سعودية', 'saudi', 'saudi arabia', 'saudi arabian', 'ksa', 'المملكه العربيه السعوديه', 'المملكة العربية السعودية', 'sa', 'المملكه', 'المملكة', 'k s a', 'saudia', 'kingdom of saudi arabia'],
  'الإمارات العربيّة المتّحدة': ['اماراتي', 'اماراتيه', 'الامارات', 'الإمارات', 'uae', 'emirati', 'united arab emirates', 'الامارات العربيه المتحده', 'ae'],
  'قطر': ['قطري', 'قطريه', 'qatar', 'qatari'],
  'الكويت': ['كويتي', 'كويتيه', 'kuwait', 'kuwaiti'],
  'البحرين': ['بحريني', 'بحرينيه', 'bahrain', 'bahraini'],
  'عمان': ['عماني', 'عمانيه', 'سلطنه عمان', 'oman', 'omani'],
  'العراق': ['عراقي', 'عراقيه', 'iraq', 'iraqi'],
  'مصر': ['مصري', 'مصريه', 'egypt', 'egyptian', 'جمهوريه مصر العربيه'],
  'الأردن': ['اردني', 'اردنيه', 'jordan', 'jordanian', 'الاردن'],
  'لبنان': ['لبناني', 'لبنانيه', 'lebanon', 'lebanese'],
  'فلسطين': ['فلسطيني', 'فلسطينيه', 'palestine', 'palestinian'],
  'سوريا': ['سوري', 'سوريه', 'syria', 'syrian', 'سورية'],
  'اليمن': ['يمني', 'يمنيه', 'yemen', 'yemeni'],
  'المغرب': ['مغربي', 'مغربيه', 'morocco', 'moroccan'],
  'تونس': ['تونسي', 'تونسيه', 'tunisia', 'tunisian'],
  'الجزائر': ['جزائري', 'جزائريه', 'algeria', 'algerian'],
  'ليبيا': ['ليبي', 'ليبيه', 'libya', 'libyan'],
  'السودان': ['سوداني', 'سودانيه', 'sudan', 'sudanese'],
  'الهند': ['هندي', 'هنديه', 'india', 'indian'],
  'باكستان': ['باكستاني', 'باكستانيه', 'pakistan', 'pakistani'],
  'بنغلاديش': ['بنغلاديشي', 'بنغالي', 'bangladesh', 'bangladeshi', 'بنقلاديش'],
  'الفلبّين': ['فلبيني', 'فلبينيه', 'philippines', 'filipino', 'philippine', 'الفلبين', 'الفلبينيه'],
  'سريلانكا': ['سريلانكي', 'سيريلانكي', 'sri lanka', 'sri lankan', 'srilankan', 'سيريلانكا'],
  'نيبال': ['نيبالي', 'nepal', 'nepali', 'nepalese'],
  'إندونيسيا': ['اندونيسي', 'indonesia', 'indonesian'],
  'إثيوبيا': ['اثيوبي', 'ethiopia', 'ethiopian'],
  'كينيا': ['كيني', 'kenya', 'kenyan'],
  'نيجيريا': ['نيجيري', 'nigeria', 'nigerian'],
  'تركيّا': ['تركي', 'turkey', 'turkish', 'turkiye', 'تركيا'],
  'أفغانستان': ['افغاني', 'afghanistan', 'afghan'],
  'المملكة المتحدة': ['بريطاني', 'british', 'uk', 'united kingdom', 'britain', 'england', 'بريطانيا', 'انجليزي'],
  'الولايات المتّحدة': ['امريكي', 'اميركي', 'american', 'usa', 'us', 'united states', 'america', 'امريكا', 'الولايات المتحده الامريكيه'],
  'كندا': ['كندي', 'canadian', 'canada'],
  'فرنسا': ['فرنسي', 'french', 'france'],
  'ألمانيا': ['الماني', 'german', 'germany'],
  'إسبانيا': ['اسباني', 'spanish', 'spain'],
  'إيطاليا': ['ايطالي', 'italian', 'italy'],
  'الاتّحاد الرّوسي': ['روسي', 'russian', 'russia', 'روسيا'],
  'الصّين': ['صيني', 'chinese', 'china', 'الصين'],
  'اليابان': ['ياباني', 'japanese', 'japan'],
  'كوريا، جمهوريّة كوريا': ['كوري', 'korean', 'south korea', 'korea', 'كوريا الجنوبيه'],
  'إيران، الجمهوريّة الإسلاميّة الإيرانيّة': ['ايراني', 'iran', 'iranian', 'ايران'],
  'أوغندا': ['اوغندي', 'uganda', 'ugandan'],
  'الصومال': ['صومالي', 'somalia', 'somali'],
  'جنوب إفريقيا': ['جنوب افريقي', 'south african', 'south africa'],
  'أستراليا': ['استرالي', 'australian', 'australia'],
  'ماليزيا': ['ماليزي', 'malaysia', 'malaysian'],
  'تايلاند': ['تايلاندي', 'thailand', 'thai'],
  'الفيتنام': ['فيتنامي', 'vietnam', 'vietnamese'],
  'أوكرانيا': ['اوكراني', 'ukraine', 'ukrainian'],
  'رومانيا': ['روماني', 'romania', 'romanian'],
  'البرازيل': ['برازيلي', 'brazil', 'brazilian'],
  'الأرجنتين': ['ارجنتيني', 'argentina', 'argentinian'],
  'المكسيك': ['مكسيكي', 'mexico', 'mexican'],
  'الصحراء الغربيّة': [],
};
// رموز الدول ISO (حرفين/ثلاثة) كما تظهر في أنظمة الرواتب والتأشيرات
const ISO = {
  'السعودية': 'sau', 'الإمارات العربيّة المتّحدة': 'are', 'قطر': 'qa qat', 'الكويت': 'kw kwt', 'البحرين': 'bh bhr', 'عمان': 'om omn',
  'العراق': 'iq irq', 'مصر': 'eg egy', 'الأردن': 'jo jor', 'لبنان': 'lb lbn', 'فلسطين': 'ps pse', 'سوريا': 'sy syr', 'اليمن': 'ye yem',
  'المغرب': 'ma mar', 'تونس': 'tn tun', 'الجزائر': 'dz dza', 'ليبيا': 'ly lby', 'السودان': 'sd sdn', 'الهند': 'in ind', 'باكستان': 'pk pak',
  'بنغلاديش': 'bd bgd', 'الفلبّين': 'ph phl', 'سريلانكا': 'lk lka', 'نيبال': 'np npl', 'إندونيسيا': 'id idn', 'إثيوبيا': 'et eth',
  'كينيا': 'ke ken', 'نيجيريا': 'ng nga', 'تركيّا': 'tr tur', 'أفغانستان': 'af afg', 'المملكة المتحدة': 'gb gbr', 'الولايات المتّحدة': 'usa',
  'كندا': 'ca can', 'فرنسا': 'fr fra', 'ألمانيا': 'de deu', 'إسبانيا': 'es esp', 'إيطاليا': 'ita', 'الاتّحاد الرّوسي': 'ru rus', 'الصّين': 'cn chn',
  'اليابان': 'jp jpn', 'كوريا، جمهوريّة كوريا': 'kr kor', 'إيران، الجمهوريّة الإسلاميّة الإيرانيّة': 'ir irn', 'أوغندا': 'ug uga', 'الصومال': 'so som',
  'جنوب إفريقيا': 'za zaf', 'أستراليا': 'au aus', 'ماليزيا': 'my mys', 'تايلاند': 'th tha', 'الفيتنام': 'vn vnm', 'أوكرانيا': 'ua ukr',
  'رومانيا': 'ro rou', 'البرازيل': 'br bra', 'الأرجنتين': 'ar arg', 'المكسيك': 'mx mex',
};
for (const [c, codes] of Object.entries(ISO)) for (const code of codes.split(' ')) if (!COUNTRY_ALIASES[c].includes(code)) COUNTRY_ALIASES[c].push(code);
VALUE_ALIASES.nationality = COUNTRY_ALIASES;
VALUE_ALIASES.residence_country = COUNTRY_ALIASES;

// ترجمة مسبقة للقيم قبل مطابقتها بقوائم القالب الخاصة بكل عميل (أسماء المدن بالإنجليزي مثلًا)
export const VALUE_TRANSLATE = {
  location: {
    riyadh: 'الرياض', riyad: 'الرياض', ruh: 'الرياض', jeddah: 'جدة', jedda: 'جدة', jiddah: 'جدة', jed: 'جدة', dammam: 'الدمام', dmm: 'الدمام',
    khobar: 'الخبر', factory: 'المصنع', plant: 'المصنع', 'the factory': 'المصنع', 'manufacturing plant': 'المصنع', 'main factory': 'المصنع', 'riyadh map': 'الرياض خريطة', 'riyadh khareeta': 'الرياض خريطة', 'motamayez map': 'متميزخريطة', 'motamayez': 'متميزخريطة', 'al khobar': 'الخبر', alkhobar: 'الخبر', makkah: 'مكة', mecca: 'مكة', makka: 'مكة', madinah: 'المدينة', medina: 'المدينة', madina: 'المدينة',
    taif: 'الطائف', tabuk: 'تبوك', abha: 'أبها', qassim: 'القصيم', buraidah: 'بريدة', buraydah: 'بريدة', jubail: 'الجبيل', yanbu: 'ينبع',
    hail: 'حائل', jazan: 'جازان', jizan: 'جازان', najran: 'نجران', 'khamis mushait': 'خميس مشيط', 'al ahsa': 'الأحساء', alahsa: 'الأحساء', hofuf: 'الهفوف',
    dubai: 'دبي', 'abu dhabi': 'أبوظبي', cairo: 'القاهرة', 'head office': 'المقر الرئيسي', hq: 'المقر الرئيسي', 'main office': 'المقر الرئيسي',
  },
};
// كلمات زائدة تُحذف من القيمة إذا لم تُطابق مباشرة ("إدارة المالية" ← "المالية")
export const VALUE_NOISE = {
  department: ['قسم', 'اداره', 'department', 'dept', 'division', 'قطاع', 'وحده', 'unit', 'team', 'فريق'],
  location: ['فرع', 'مدينه', 'branch', 'office', 'city', 'site', 'موقع', 'مكتب', 'منطقه', 'region'],
  nationality: ['الجنسيه', 'جنسيه', 'nationality'],
  residence_country: ['دوله', 'country'],
};

// الحقول التي قيمها قائمة في القالب (مفتاح العمود في شيت Reference = مفتاح الحقل)
export const LIST_FIELDS = FIELDS.filter((f) => f.type === 'list').map((f) => f.key);
