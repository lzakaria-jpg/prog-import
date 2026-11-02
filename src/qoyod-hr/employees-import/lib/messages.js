// ترجمة رسائل المحرك وأسماء الحقول للإنجليزية: قاموس عبارات (عربي ← إنجليزي).
// القيم بين علامات التنصيص والأرقام والتواريخ تُحفظ كما هي، وأي مقطع عربي غير معروف (بيانات العميل) يبقى كما هو.

const EN = {
  // ---------- عام / الهيكل ----------
  'مُجهّز بيانات الموظفين': 'Employee Data Preparer',
  'الملفات': 'Files', 'المطابقة والمراجعة': 'Mapping & review', 'التصدير': 'Export',
  'ارفع قالب قيود الرسمي وملف العميل كما هو': 'Upload the official Qoyod template and the client file as it is',
  'وين يروح كل عمود من ملف العميل بقالب قيود، ثم اعتماد': 'Where each client column goes in the Qoyod template, then approve',
  'صحّح الأخطاء واعتمد الملاحظات بنفس جدول المطابقة': 'Fix errors and approve notes in the same mapping table',
  'نزّل ملف الرفع الجاهز لقيود والتقارير': 'Download the Qoyod-ready upload file and reports',
  '🔒 بياناتك تبقى عندك': '🔒 Your data stays with you',
  'كل المعالجة داخل متصفحك، ولا يُرفع أي ملف لأي مكان.': 'All processing happens in your browser; no file is uploaded anywhere.',
  'القالب:': 'Template:', 'العميل:': 'Client:', 'جاهز للرفع': 'ready to upload', 'اللغة': 'Language', 'الإصدار': 'Version',
  'رجوع': 'Back', 'إغلاق': 'Close', 'استبدال': 'Replace', 'إلغاء': 'Cancel', 'التالي': 'Next', 'السابق': 'Previous', 'أو': 'or', 'من': 'of', 'صفحة': 'Page',
  // ---------- الخطوة 1 ----------
  '١. قالب قيود الرسمي': '1. Official Qoyod template', '٢. ملف العميل': '2. Client file',
  'نزّله من الموظفين ← إضافة جماعية ← تنزيل القالب. القوائم (الأقسام، المواقع، ملفات الدوام) خاصة بكل عميل، فاستخدم قالب نفس شركة العميل.':
    'Download it from Employees → Bulk add → Download template. Lists (departments, locations, attendance profiles) are specific to each client, so use the template of the same company.',
  'اسحب القالب هنا أو اضغط للاختيار': 'Drop the template here or click to choose', 'ملف xlsx الذي نزّلته من قيود': 'The xlsx file you downloaded from Qoyod',
  'أي شكل: عناوين عربي أو إنجليزي أو بدون عناوين، ترويسة بصفين، شيت لكل فرع، أسماء كاملة بعمود واحد، تواريخ هجري وميلادي، CSV بأي ترميز. الأداة تكتشف وتطابق وتنظّف.':
    'Any shape: Arabic, English or no headers, two-row headers, a sheet per branch, full names in one column, Hijri and Gregorian dates, CSV in any encoding. The tool detects, maps and cleans.',
  'اسحب ملف العميل هنا أو اضغط للاختيار': 'Drop the client file here or click to choose', 'xlsx أو xls أو csv': 'xlsx, xls or csv',
  'عمودًا': 'columns', 'إلزاميًا': 'required', 'قائمة': 'lists', '· محفوظ على هذا المتصفح': '· saved in this browser',
  'القسم:': 'Departments:', 'الموقع:': 'Locations:', 'ملف الدوام:': 'Attendance profiles:', 'الجنسيات:': 'Nationalities:',
  'أعمدة ناقصة بالقالب:': 'Columns missing from the template:', 'أعمدة جديدة بالقالب لا تعرفها الأداة:': 'New template columns the tool does not know:',
  'شيت': 'sheet(s)', 'دمج:': 'Merged:', 'الترويسة لكل شيت تلقائيًا': 'header detected per sheet', 'بدون ترويسة': 'no header', 'الترويسة بالصف': 'header on row',
  'عمودًا طابقتهم تلقائيًا': 'columns matched automatically', 'منها من المحتوى': 'of them from content', 'موظف': 'employees', 'مطابقة محفوظة': 'Saved mapping',
  'التالي: مطابقة الأعمدة': 'Next: map columns',
  'القالب المحمّل': 'The loaded template', 'تجريبي للاختبار فقط.': 'is a test sample only.',
  'قوائم الفروع والأقسام وملفات الدوام فيه مخترعة، فقيود يرفض الملف المصدّر منه': 'Its branch, department and attendance lists are made up, so Qoyod rejects files exported from it',
  '(مثل:': '(e.g.', 'ليس ضمن الخيارات المسموح بها").': 'is not among the allowed options").',
  'للرفع الحقيقي: من قيود ← الموظفين ← إضافة جماعية ← تنزيل القالب، لنفس شركة العميل، ثم اضغط': 'For a real upload: in Qoyod, Employees → Bulk add → Download template for the same company, then click',
  'وارفعه هنا.': 'and upload it here.',
  'طُبّقت مطابقة محفوظة سابقًا لملف بنفس الشكل': 'Applied a saved mapping from a file with the same layout',
  'دُمجت': 'Merged', 'شيتات بنفس البنية:': 'sheets with the same structure:',
  'تعذّر قراءة القالب:': 'Could not read the template:', 'تعذّر قراءة ملف العميل:': 'Could not read the client file:', 'الملف فاضي': 'The file is empty',
  // ---------- المطابقة ----------
  'مطابقة ملف العميل مع قالب قيود': 'Map the client file to the Qoyod template', 'قرأنا': 'Read', 'موظف من': 'employees from',
  'الشيتات': 'sheets', 'راجع وين يروح كل عمود، وعدّل إذا لزم.': 'Check where each column goes and adjust if needed.',
  '— الترويسة بالصف': '— header on row', '— بدون ترويسة': '— no header', '⚙ إعدادات القراءة': '⚙ Reading settings',
  'عرض تفصيلي (كل حقول قيود)': 'Detailed view (all Qoyod fields)', 'العرض المبسّط': 'Simple view',
  'عمود مربوط': 'columns mapped', 'متجاهَل': 'ignored', 'الإلزامي:': 'Required:', 'الأصفر: تأكد منه': 'Yellow: double-check',
  'الشيت': 'Sheet', 'كل الشيتات المتشابهة': 'All similar sheets', '(مخفي)': '(hidden)', '(فاضي)': '(empty)',
  'رقم صف الترويسة (0 = بدون ترويسة)': 'Header row number (0 = no header)', 'التواريخ الملتبسة (مثل 04/05/1991)': 'Ambiguous dates (e.g. 04/05/1991)',
  'يوم/شهر': 'Day/Month', 'شهر/يوم': 'Month/Day', 'تقسيم الاسم الكامل': 'Full-name split', 'الأول + الباقي': 'First + rest', 'الأول + الأخير': 'First + last',
  'أضف +966 للجوالات السعودية المحلية (05…)': 'Add +966 to local Saudi mobiles (05…)', 'ترجمة حرفية للاسم الناقص (عربي ⇄ إنجليزي)': 'Transliterate missing names (Arabic ⇄ English)',
  'عرض الملف الخام': 'Show raw file', 'إخفاء الملف الخام': 'Hide raw file', 'إعادة المطابقة التلقائية': 'Re-run automatic mapping',
  'صفًا كما هي بالملف — اضغط أي صف لتجعله الترويسة.': 'rows as they are in the file — click any row to make it the header.', 'أول': 'First',
  'تجاهلت الأداة': 'The tool skipped', 'صفًا غير بيانات (عناوين أقسام، ترويسة مكررة، إجماليات، ملاحظات)': 'non-data rows (section titles, repeated headers, totals, notes)',
  'صف': 'Row', 'عنوان/ملاحظة': 'Title/note', 'ترويسة مكررة': 'Repeated header', 'صف إجماليات': 'Totals row', 'توقيع/اعتماد': 'Signature/approval', 'صف شبه فاضي': 'Nearly empty row',
  'مطابقة أعمدة الملف': 'Map file columns',
  'اختر من كل قائمة حقل قيود المقابل لعمود العميل، أو اتركه "تجاهل". تحت كل قائمة عنوان العمود كما ورد بالملف، وعيّنة من قيمه للتأكيد. لما تخلص اضغط':
    'In each dropdown choose the Qoyod field for that client column, or leave it as "Ignore". Under each dropdown is the column header as it appears in the file and sample values to confirm. When done click',
  'اعتماد': 'Approve', 'وتتحول نفس الصفحة للمراجعة والتصحيح.': 'and the same page turns into review and correction.',
  'مربوط': 'Mapped', 'مربوط — تأكد منه': 'Mapped — double-check', 'عرض أول': 'Showing first', 'صفوف من': 'rows of',
  '— تجاهل —': '— Ignore —', 'تجاهل': 'Ignore', 'تأكد منها': 'please confirm', 'تهجئة تقديرية': 'estimated spelling', 'حُوّل لميلادي بتقويم أم القرى': 'converted to Gregorian (Umm al-Qura)', 'هـ': 'AH',
  'قيود لا يقبل التكرار، صحّح القيمة عند أحدهما': 'Qoyod does not accept duplicates; fix it for one of them', '— غير مرتبط —': '— Not mapped —', 'الاسم الكامل (يُقسَّم تلقائيًا)': 'Full name (split automatically)', '(مربوط بعمود آخر)': '(mapped to another column)',
  'تأكد': 'Check', 'ناقص': 'Missing', 'من الحقول الإلزامية': 'required fields', 'اختر لها عمود من القوائم بالجدول، أو ثبّت قيمة للكل تحت.': 'Pick a column for it in the table, or set one value for everyone below.',
  'حقول قيود الإلزامية الناقصة': 'Missing required Qoyod fields',
  'ملف العميل ما فيه عمود لها. اختر لها عمود من الكروت فوق، أو ثبّت قيمة وحدة لكل الموظفين هنا (وتقدر تعدّلها لكل موظف بالمراجعة).':
    'The client file has no column for these. Pick a column above, or set one value for all employees here (you can still edit each employee in review).',
  'اختر قيمة للكل…': 'Choose a value for all…', 'قيمة للكل…': 'Value for all…', 'تاريخ للكل…': 'Date for all…', '✓ كل حقول قيود الإلزامية لها مصدر': '✓ Every required Qoyod field has a source',
  '✓ اعتماد': '✓ Approve', 'عرض العيّنة فقط': 'Show sample only', 'التالي: التصدير': 'Next: export', 'جاهز)': 'ready)',
  'مطابقة الأعمدة — عرض تفصيلي': 'Column mapping — detailed view', 'لكل حقل بالقالب اختر عمود العميل، أو ثبّت قيمة واحدة لكل الموظفين.': 'For each template field choose the client column, or set one value for all employees.',
  'حقول إلزامية بدون مصدر:': 'Required fields without a source:', '. تقدر تكمل وتعبّيها بالمراجعة، أو تثبّت لها قيمة.': '. You can continue and fill them in review, or set a value.',
  'أعمدة العميل غير المستخدمة': 'Unused client columns', 'حقل القالب': 'Template field', 'عمود العميل': 'Client column', 'عيّنة من البيانات': 'Sample data', 'قيمة ثابتة': 'Fixed value',
  'قيمة ثابتة للكل…': 'Fixed value for all…', 'تاريخ ثابت للكل…': 'Fixed date for all…', 'يُشتق من': 'Derived from', 'نفس العمود مربوط بحقل آخر': 'Same column mapped to another field',
  'من المحتوى': 'From content', 'تقريبي — تأكد': 'Approximate — check', 'ليس له عمود بالملف': 'No column in the file', 'قيمة ثابتة للكل': 'Fixed value for all',
  'عنوان المجموعة (من صفوف العناوين)': 'Group title (from section rows)', 'اسم الشيت': 'Sheet name', 'عمود': 'Column',
  // ---------- المراجعة ----------
  'إجمالي الصفوف': 'Total rows', 'منها عليها ملاحظات (تنرفع عادي)': 'of them with notes (upload normally)', 'فيه أخطاء': 'With errors', 'مستبعد': 'Excluded',
  'متابعة مع العميل': 'Follow up with the client',
  'نزّل ملف فيه فقط الموظفين والخانات الناقصة أو الخاطئة (أصفر، مع سبب كل خانة وقوائم منسدلة)، أرسله للعميل، وبعد ما يرجعه ارفعه هنا وتنطبق التعبئة تلقائيًا.':
    'Download a file with only the employees and cells that are missing or wrong (yellow, with the reason and dropdowns), send it to the client, and when it comes back upload it here to apply the values.',
  'موظف اسمه مترجم تلقائيًا ويحتاج تأكيد.': 'employees have auto-transliterated names that need confirming.',
  'تنزيل ملف استكمال للعميل': 'Download client follow-up file', 'رفع الملف بعد تعبئة العميل': 'Upload the file after the client fills it',
  'ضمّن الخانات اللي تحتاج تأكيد (أسماء مترجمة، هوية منتهية…)': 'Include cells that need confirming (transliterated names, expired IDs…)',
  'مطابقة ومراجعة البيانات': 'Map & review data',
  'نفس جدول المطابقة بعد الاعتماد: كل الموظفين، القيم منظّفة ومفحوصة. اضغط أي خلية لتعديلها، ورقم الصف يفتح نموذج الموظف. تقدر تغيّر أي قائمة فوق وتتحدث البيانات فورًا.':
    'The same mapping table after approval: all employees, cleaned and validated. Click any cell to edit it; the row number opens the employee form. Change any dropdown above and the data updates instantly.',
  'بحث بالاسم أو الهوية أو الرقم الوظيفي…': 'Search by name, ID or employee number…', 'أزرق = صُحّح تلقائيًا': 'Blue = auto-fixed', 'أصفر = راجعه': 'Yellow = review', 'أحمر = لازم يتصلح': 'Red = must fix',
  'اضغط أي خلية للتعديل · قيمة القائمة الحمراء: اختر الصحيحة وتنطبق على كل الصفوف بنفس القيمة · رقم الصف يفتح نموذج الموظف':
    'Click any cell to edit · Red list value: pick the right one and it applies to all rows with the same value · Row number opens the employee form',
  '✓ تمت مراجعة كل الأصفر': '✓ Mark all yellow as reviewed', 'يعتمد كل الخانات الصفراء الحالية كمراجَعة (تقدر تتراجع من نموذج الموظف)': 'Marks all current yellow cells as reviewed (undo from the employee form)',
  'عرض الأعمدة المتجاهلة': 'Show ignored columns', 'الصف': 'Row', 'الحالة': 'Status', 'جاهز': 'Ready', 'مراجعة': 'Review', 'خطأ': 'Error', 'لا توجد صفوف بهذا التصفية': 'No rows match this filter',
  'نموذج الموظف': 'Employee form', 'اضغط لتعديل الاسم': 'Click to edit the name', 'تمت المراجعة': 'Reviewed', 'الأصل:': 'Original:',
  '— فاضي —': '— Empty —', 'اختر من التقويم أو اكتب التاريخ': 'Pick from the calendar or type the date', 'فتح التقويم': 'Open calendar',
  'تاريخ غير مفهوم — اكتب مثل 31-Dec-2030 أو 2030-12-31': 'Unrecognized date — type e.g. 31-Dec-2030 or 2030-12-31',
  'اعتُمدت المطابقة — راجع وصحّح البيانات بنفس الجدول': 'Mapping approved — review and fix the data in the same table',
  'اعتُمدت كل المطابقات التقريبية': 'All approximate matches approved', 'خانة صفراء كمراجَعة': 'yellow cells marked as reviewed', 'اعتُمدت': 'Approved',
  'طُبّق على': 'applied to', 'صف فيها نفس القيمة': 'rows with the same value', 'حُفظ': 'Saved', 'طبّقها على باقي الفاضي المطلوب': 'Apply to the remaining required empty cells',
  'طُبّق': 'Applied', 'تعديل على': 'changes to', 'صف غير معروف تُجوهل': 'unknown rows ignored',
  'هذا الملف ليس ملف استكمال من الأداة (ما فيه عمود مرجع الصف). ارفع الملف اللي نزّلته من زر "ملف استكمال للعميل" بعد ما يعبيه العميل.':
    'This is not a follow-up file from the tool (no row-reference column). Upload the file you downloaded with "client follow-up file" after the client fills it.',
  'تعذّر قراءة ملف الاستكمال:': 'Could not read the follow-up file:',
  // ---------- درج الموظف ----------
  'في ملف العميل': 'in the client file', 'استبعد من التصدير': 'Exclude from export', 'الملاحظات': 'Notes', 'كل الحقول': 'All fields',
  'عدّل مباشرة: التواريخ بالتقويم، القوائم بالاختيار، والباقي بالكتابة. التعديل ينحفظ فورًا. الأصفر تقدر تعتمده بـ "تمت المراجعة".':
    'Edit directly: dates with the calendar, lists by choosing, the rest by typing. Changes save instantly. Yellow can be approved with "Reviewed".',
  '✓ تمت مراجعة كل ملاحظات هذا الموظف': '✓ Mark all this employee\'s notes as reviewed', '✓ تمت المراجعة': '✓ Reviewed', 'تراجع عن المراجعة': 'Undo review',
  'معدّل يدويًا': 'Edited manually', 'الأصل بملف العميل:': 'Original in the client file:', 'افتح الصف': 'Open row', 'روجعت': 'Reviewed',
  'سليم': 'OK', 'مُصحَّح': 'Fixed', 'للمراجعة': 'Review', 'صُحّح تلقائيًا': 'Auto-fixed', '(غير موجود بالقائمة) —': '(not in the list) —',
  // ---------- التصدير ----------
  'جاهز للتصدير': 'Ready to export', 'يُعبَّأ قالب قيود الرسمي نفسه بدون أي تغيير بالترويسة أو القوائم، فيصير جاهز لرفعه كما هو.': 'The official Qoyod template itself is filled with no change to headers or lists, so it is ready to upload as is.',
  'للمراجعة (تدخل الملف عادي)': 'Review (included normally)', 'أخطاء (لن تُضمَّن)': 'Errors (not included)', 'صفوف في ملف الرفع': 'Rows in the upload file',
  'صف فيه أخطاء ما راح يدخل بملف الرفع.': 'rows with errors will not be in the upload file.', 'زر التنزيل معطّل لأنه ما في ولا صف جاهز: كل الصفوف': 'Download is disabled because no row is ready: all rows',
  'فيها خطأ واحد على الأقل، وقيود يرفضها.': 'have at least one error, and Qoyod rejects them.', 'صلّح الأخطاء الآن': 'Fix errors now', 'أكثر الأسباب:': 'Top reasons:',
  'الحقول الفاضية عند كل الموظفين تتعبّى مرة وحدة من لوحة': 'Fields empty for everyone are filled once from the panel', 'بخطوة المراجعة، والقيم غير الموجودة بالقائمة من لوحة': 'in review, and values not in the list from the panel',
  'رجوع للمراجعة': 'Back to review', 'تنزيل تقرير الملاحظات': 'Download notes report', 'تنزيل ملف الرفع': 'Download upload file', 'جارٍ التجهيز…': 'Preparing…',
  'القالب الحالي تجريبي، وقيود سيرفض الملف. تبي تنزّله للتجربة فقط؟': 'The current template is a sample and Qoyod will reject the file. Download it for testing only?',
  'نعم، نزّله للتجربة': 'Yes, download for testing', 'بعد التنزيل': 'After downloading', 'القالب يدعم': 'The template supports', 'صفًا بالملف، فبينقسم لعدة ملفات.': 'rows per file, so it will be split into several files.',
  'افتح قيود HR ← الموظفين ← إضافة جماعية.': 'Open Qoyod HR → Employees → Bulk add.', 'ارفع الملف الذي نزّلته من هنا (نفس القالب، فقط معبّأ).': 'Upload the file you downloaded here (the same template, just filled).',
  'الموظفون يُنشأون بالخلفية، راجع قائمة الموظفين وتنبيه "بيانات ناقصة" بعدها.': 'Employees are created in the background; check the employee list and the "missing data" alert afterwards.',
  'تقرير الملاحظات يوضح كل ما صُحّح وكل ما استُبعد وسببه، سلّمه للعميل للمتابعة.': 'The notes report shows everything fixed and excluded and why; hand it to the client for follow-up.',
  'نُزّل': 'Downloaded', 'ملف (': 'file(s) (',
  // ---------- أسماء الحقول ----------
  'المعلومات الشخصية': 'Personal information', 'الاتصال': 'Contact', 'التوظيف': 'Employment', 'البنك': 'Bank', 'الراتب': 'Salary',
  'الاسم الأول (إنجليزي)': 'First name (EN)', 'اسم العائلة (إنجليزي)': 'Last name (EN)', 'الاسم الأول (عربي)': 'First name (AR)', 'اسم العائلة (عربي)': 'Last name (AR)',
  'الجنس': 'Gender', 'تاريخ الميلاد': 'Date of birth', 'الحالة الاجتماعية': 'Marital status', 'الجنسية': 'Nationality', 'بلد الإقامة': 'Residence country',
  'رقم الهوية الوطنية': 'National ID / Iqama', 'تاريخ إصدار الهوية': 'ID issue date', 'تاريخ انتهاء الهوية': 'ID expiry date', 'البريد الإلكتروني': 'Email',
  'المسمى الوظيفي': 'Job title', 'رقم هاتف العمل': 'Work phone', 'حالة التوظيف': 'Employment status', 'القسم': 'Department', 'الرقم الوظيفي': 'Employee number',
  'المسؤول المباشر': 'Manager', 'الموقع': 'Location', 'بريد العمل': 'Work email', 'هاتف المنزل': 'Home phone', 'العنوان': 'Address',
  'اسم جهة اتصال الطوارئ': 'Emergency contact name', 'صلة القرابة': 'Relationship', 'هاتف منزل الطوارئ': 'Emergency home phone', 'جوال الطوارئ': 'Emergency mobile',
  'تاريخ الانضمام': 'Join date', 'نوع التوظيف': 'Employment type', 'نوع العقد': 'Contract type', 'تاريخ نهاية العقد': 'Contract end date', 'ملف الدوام': 'Attendance profile',
  'المستوى التعليمي': 'Education level', 'وصف التعليم': 'Education description', 'اسم البنك': 'Bank name', 'رمز البنك': 'Bank code', 'رقم الحساب': 'Account number',
  'عملة الحساب البنكي': 'Account currency', 'عنوان البنك': 'Bank address', 'رقم الآيبان': 'IBAN', 'رمز السويفت': 'SWIFT code', 'تاريخ بدء الراتب': 'Salary start date',
  'الراتب الأساسي': 'Basic salary', 'دورية الدفع': 'Pay frequency', 'نوع الراتب': 'Salary kind', 'أساس احتساب الوقت': 'Time basis',
  'الاسم الكامل (عربي)': 'Full name (AR)', 'الاسم الكامل (إنجليزي)': 'Full name (EN)',
  // ---------- رسائل المحرك ----------
  'حقل إلزامي فاضي': 'Required field is empty', 'توحيد صيغة التاريخ': 'Date format normalized', 'رقم تسلسلي إكسل حُوّل لتاريخ': 'Excel serial number converted to a date',
  'تاريخ غير مفهوم': 'Unrecognized date', 'تاريخ غير مفهوم:': 'Unrecognized date:', 'تاريخ غير صالح:': 'Invalid date:', 'تاريخ هجري تعذّر تحويله': 'Hijri date could not be converted',
  'سنة بخانتين — راجع القرن': 'Two-digit year — check the century', 'يوم/شهر غير محسوم، افتُرض يوم/شهر': 'Day/month ambiguous, assumed day/month', 'يوم/شهر غير محسوم، افتُرض شهر/يوم': 'Day/month ambiguous, assumed month/day',
  'تاريخ هجري (': 'Hijri date (', 'هـ) حُوّل لميلادي بتقويم أم القرى': 'AH) converted to Gregorian (Umm al-Qura)',
  'رقم هاتف غير صالح:': 'Invalid phone number:', 'إزالة الفواصل/توحيد الأرقام': 'Separators removed / digits normalized', 'الخلية فيها': 'The cell has', 'أرقام، أُخذ الأول': 'numbers; the first was used',
  'الرقم يبدو ناقصًا الصفر الأول (جوال سعودي من': 'The number seems to be missing the leading zero (Saudi mobile of', 'خانات)': 'digits)', 'جوال سعودي بطول غير معتاد': 'Saudi mobile with an unusual length',
  'رقم جوال سعودي ناقص أو زائد': 'Saudi mobile number too short or too long', 'خانات بدل': 'digits instead of', 'رقم غير مكتمل لقيود (المطلوب رقم دولي مثل': 'Incomplete number for Qoyod (a full international number is required, e.g.',
  'بريد غير صالح:': 'Invalid email:', 'توحيد البريد (أحرف صغيرة/حذف الزوائد)': 'Email normalized (lowercase / extras removed)', 'عناوين، أُخذ الأول': 'addresses; the first was used',
  'الآيبان يحوي رموزًا غير صالحة': 'IBAN contains invalid characters', 'الآيبان السعودي': 'Saudi IBAN is', 'خانة وهذا': 'characters and this is', 'فشل فحص صحة الآيبان (mod': 'IBAN checksum failed (mod',
  'إزالة المسافات/الزوائد/أحرف كبيرة': 'Spaces/extras removed, uppercased', 'رقم الهوية يحوي غير الأرقام:': 'ID contains non-digits:',
  'رقم الهوية فيه حرف بدل رقم': 'The ID has a character instead of a digit', 'الخانة': 'position', 'حرف O إنجليزي بدل صفر': 'letter O instead of zero',
  'حرف إنجليزي بدل': 'English letter instead of', 'حرف إنجليزي': 'English letter', 'حرف عربي': 'Arabic letter', 'رمز': 'symbol', 'قيود يقبل أرقام فقط': 'Qoyod accepts digits only', 'إزالة المسافات/الرموز': 'Spaces/symbols removed',
  'المبلغ يجب أن يكون أكبر من صفر': 'Amount must be greater than zero', 'مبلغ غير مفهوم:': 'Unrecognized amount:', 'تنظيف المبلغ (إزالة الفواصل/العملة)': 'Amount cleaned (separators/currency removed)',
  'الاسم يجب أن يكون بالإنجليزية': 'Name must be in English', 'الاسم يجب أن يكون بالعربية': 'Name must be in Arabic', 'خليط عربي/إنجليزي': 'Mixed Arabic/English', 'تنظيف المسافات': 'Spaces cleaned',
  'مطابقة يدوية:': 'Manual match:', 'غير موجود بقائمة القالب': 'is not in the template list', 'توحيد الكتابة:': 'Spelling normalized:', 'مطابقة تقريبية:': 'Approximate match:',
  'ترجمة حرفية تلقائية من': 'Automatic transliteration from', '(تهجئة تقديرية)': '(estimated spelling)', '— تأكد منها': '— please confirm', 'نُقل من عمود الاسم العربي لأنه مكتوب بالإنجليزي': 'Moved from the Arabic name column because it is written in English',
  'افتراضي: تاريخ بدء الراتب = تاريخ الانضمام': 'Default: salary start date = join date', 'افتراضي: الدفع شهري': 'Default: paid monthly', 'افتراضي: راتب ثابت': 'Default: fixed salary', 'افتراضي:': 'Default:',
  'للعقد تاريخ نهاية ← محدد المدة': 'Contract has an end date → fixed term',
  'طول الرقم': 'Number length', '(الهوية/الإقامة 10 خانات)': '(ID/Iqama is 10 digits)', 'يبدأ بـ': 'Starts with', 'للسعودي أو': 'for Saudis or', 'للمقيم عادةً': 'for residents, usually',
  'جنسية سعودية لكن الرقم يبدأ بـ': 'Saudi nationality but the number starts with', 'غير سعودي لكن الرقم يبدأ بـ': 'Non-Saudi but the number starts with', 'فشل فحص خانة التحقق للهوية': 'ID check digit failed',
  'نفس القيمة موجودة عند موظف آخر: الصف': 'The same value exists for another employee: row', '— قيود لا يقبل التكرار، صحّح القيمة عند أحدهما': '— Qoyod does not accept duplicates; fix it for one of them',
  'تاريخ ميلاد مستقبلي': 'Date of birth in the future', 'عمر غير معتاد': 'Unusual age', 'سنة': 'years', 'تاريخ الانتهاء قبل أو يساوي الإصدار': 'Expiry is on or before the issue date',
  'الهوية منتهية': 'ID expired', 'تاريخ إصدار مستقبلي': 'Issue date in the future', 'تاريخ انضمام بعيد بالمستقبل': 'Join date far in the future', 'الانضمام قبل الميلاد': 'Joined before birth',
  'عمر الموظف عند الانضمام أقل من 15 سنة': 'Employee was under 15 when joining', 'نهاية العقد قبل الانضمام': 'Contract ends before joining', 'العقد منتهي — تأكد من التجديد': 'Contract ended — check renewal',
  'مطلوب لغير السعوديين حسب القالب': 'Required for non-Saudis per the template', 'عقد محدد المدة بدون تاريخ نهاية': 'Fixed-term contract without an end date',
  'يجب أن يكون فارغًا لأن العقد': 'Must be empty because the contract is', '(شرط قيود): احذف التاريخ أو غيّر نوع العقد': '(Qoyod rule): delete the date or change the contract type',
  'موظف سعودي بعقد': 'Saudi employee with a', 'لأن له تاريخ نهاية — تأكد، أو احذف تاريخ النهاية ليصير غير محدد المدة': 'contract because it has an end date — confirm, or delete the end date to make it indefinite',
  'ناقص مع الراتب:': 'Missing with salary:', '(اضبط قيمًا ثابتة بخطوة المطابقة)': '(set fixed values in the mapping step)', 'بيانات راتب بدون مبلغ': 'Salary data without an amount', 'بدء الراتب قبل الانضمام': 'Salary starts before joining',
  'قيمة غير موجودة بقائمة القالب': 'Value not in the template list',
  // قيم القوائم الشائعة داخل الرسائل
  'محدد المدة': 'fixed term', 'غير محدد المدة': 'indefinite',
};

// نسخة مطبّعة من المفاتيح (بدون مسافات زائدة) لتسريع البحث
const DICT = new Map(Object.entries(EN).map(([k, v]) => [k.trim(), v]));
const HAS_AR = /[؀-ۿ]/;
// مقاطع تُحفظ كما هي: نص بين علامات تنصيص، أرقام/تواريخ، رموز
const KEEP = /("[^"]*"|“[^”]*”|\+?\d[\d\s/.,:+-]*\d|\d)/;

// يبحث عن العبارة مع أو بدون النقطتين بآخرها ("الأصل" / "الأصل:")
const look = (t) => {
  if (DICT.has(t)) return DICT.get(t);
  if (t.endsWith(':') && DICT.has(t.slice(0, -1))) return `${DICT.get(t.slice(0, -1))}:`;
  if (DICT.has(`${t}:`)) return DICT.get(`${t}:`).replace(/:$/, '');
  return undefined;
};
function trChunk(p) {
  const t = p.trim();
  if (!t || !HAS_AR.test(t)) return p;
  const w = look(t);
  if (w !== undefined) return p.replace(t, w);
  // تقسيم ثانٍ على الفواصل (· • — ، : ← ⇄ أقواس) وترجمة كل جزء
  return p.split(/(\s*[·•—،:؛←⇄()]\s*)/).map((q) => { const qt = q.trim(); const x = qt ? look(qt) : undefined; return x ? q.replace(qt, x) : q; }).join('');
}
function trLine(line) {
  const core = line.trim();
  if (!core || !HAS_AR.test(core)) return line;
  const w = look(core);
  if (w !== undefined) return line.replace(core, w);
  // "عنوان: قيمة" (الأصل: …): يُترجم العنوان وتبقى القيمة كما هي
  const m = core.match(/^([^:"]{1,40}):\s(.*)$/);
  if (m && DICT.has(`${m[1]}:`)) return line.replace(core, `${DICT.get(`${m[1]}:`)} ${m[2]}`);
  return line.split(KEEP).map((p, i) => (i % 2 === 1 ? p : trChunk(p))).join('');
}
export function trMsg(text, lang = 'en') {
  if (lang !== 'en' || !text || typeof text !== 'string' || !HAS_AR.test(text)) return text;
  return text.split('\n').map(trLine).join('\n');
}
