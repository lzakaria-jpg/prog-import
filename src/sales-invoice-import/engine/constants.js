/**
 * مواصفة قالب استيراد فواتير المبيعات في قيود.
 *
 * لا تُخزَّن مواقع الأعمدة هنا مطلقاً. الأعمدة تُعرَّف بأسمائها، وتُكتشف مواقعها
 * من القالب المرفوع نفسه في كل مرة.
 *
 * السبب: القالب يختلف بين حسابات العملاء ويتغيّر مع تحديثات قيود:
 *   · حساب بلا فوترة إلكترونية → 19 عموداً
 *   · حساب بخصم مستند مفعّل    → 22 عموداً (خصم المستند يُدرَج في المنتصف)
 * وكل إدراج جديد يزحزح كل أعمدة البنود. أي موقع ثابت في الكود يكسر الأداة
 * مع أول حساب مختلف.
 */

export const HEADER_ROW = 2;
export const FIRST_DATA_ROW = 3;
export const MAX_DATA_ROWS = 5000;

/**
 * تعريف حقول القالب.
 *
 * أنماط `match` مكتوبة بصيغة مُطبَّعة (التاء المربوطة هاءً، بلا مسافات ولا نجمة)
 * لأنها تُقارن بناتج normalizeHeader لا بالنص الخام.
 *
 * `match` تُجرَّب بالترتيب وأول تطابق يفوز، فترتيب المصفوفة مقصود:
 * الأنماط الأكثر تخصيصاً أولاً حتى لا يبتلع «قيمة الخصم» عمودَ «قيمة خصم المستند»،
 * ولا يبتلع «الوصف» عمودَ «وصف المنتج».
 */
export const TEMPLATE_FIELDS = [
  // ── خصم المستند: يُفحص أولاً لأنه يتضمن كلمات الحقول العامة ──
  { key: 'docDiscountValue',   scope: 'invoice', label: 'قيمة خصم المستند',
    match: h => h.includes('خصمالمستند') && h.includes('قيمه') },
  { key: 'docDiscountAccount', scope: 'invoice', label: 'حساب خصم المستند', list: true,
    match: h => h.includes('خصمالمستند') && h.includes('حساب') },
  { key: 'docDiscountTax',     scope: 'invoice', label: 'الفئة الضريبية لخصم المستند', list: true,
    match: h => h.includes('خصمالمستند') && (h.includes('ضريب') || h.includes('فئه')) },

  // ── تعريف المنتج ──
  { key: 'productCode', scope: 'line', label: 'الرقم التسلسلي/الباركود للمنتج', required: 'conditional',
    match: h => h.includes('تسلسلي') || h.includes('باركود') },
  { key: 'productDesc', scope: 'line', label: 'وصف المنتج', required: 'conditional',
    match: h => h.includes('وصف') && h.includes('منتج') },

  // ── تعريف الفاتورة ──
  { key: 'customerRef', scope: 'invoice', label: 'الرقم المرجعي للعميل', required: true, maxLen: 191,
    match: h => h.includes('مرجعي') && h.includes('عميل') },
  { key: 'invoiceRef',  scope: 'invoice', label: 'مرجع الفاتورة / التسلسل', required: true, maxLen: 191,
    match: h => h.includes('مرجع') && (h.includes('فاتورة') || h.includes('تسلسل')) },

  // ── التواريخ ──
  { key: 'issueDate',  scope: 'invoice', label: 'تاريخ الإصدار',    required: true, type: 'date',
    match: h => h.includes('تاريخ') && h.includes('اصدار') },
  { key: 'dueDate',    scope: 'invoice', label: 'تاريخ الاستحقاق', required: true, type: 'date',
    match: h => h.includes('تاريخ') && h.includes('استحقاق') },
  { key: 'supplyDate', scope: 'invoice', label: 'تاريخ التوريد',                   type: 'date',
    match: h => h.includes('تاريخ') && h.includes('توريد') },

  // ── قوائم على مستوى الفاتورة ──
  { key: 'location',      scope: 'invoice', label: 'الموقع', required: true, list: true,
    match: h => h.includes('موقع') },
  { key: 'paymentMethod', scope: 'invoice', label: 'طريقة الدفع', list: true,
    match: h => (h.includes('طريقه') || h.includes('وسيله')) && h.includes('دفع') },

  // ── نصوص الفاتورة ──
  { key: 'terms', scope: 'invoice', label: 'الشروط والأحكام',
    match: h => h.includes('شروط') || h.includes('احكام') },
  { key: 'notes', scope: 'invoice', label: 'الملاحظات',
    match: h => h.includes('ملاحظات') },

  // ── قيم البند ──
  { key: 'quantity',   scope: 'line', label: 'الكمية', required: true, type: 'number', gt: 0,
    match: h => h.includes('كميه') },
  { key: 'unitOfConv', scope: 'line', label: 'وحدة التحويل', list: true,
    match: h => h.includes('وحده') && h.includes('تحويل') },
  { key: 'unitPrice',  scope: 'line', label: 'سعر الوحدة', required: true, type: 'number', gte: 0,
    match: h => h.includes('سعر') && h.includes('وحده') },
  { key: 'taxInclusive', scope: 'line', label: 'شامل الضريبة؟', required: true, list: true,
    match: h => h.includes('شامل') && h.includes('ضريب') },
  { key: 'discountPct', scope: 'line', label: 'نسبة الخصم', type: 'number', between: [0, 100],
    match: h => h.includes('نسبه') && h.includes('خصم') },
  { key: 'discountVal', scope: 'line', label: 'قيمة الخصم', type: 'number', gte: 0,
    match: h => h.includes('قيمه') && h.includes('خصم') },
  { key: 'taxRate', scope: 'line', label: 'الضريبة%', required: true, list: true,
    match: h => h.includes('ضريب') },

  // ── الوصف العام: آخر ما يُجرَّب حتى لا يبتلع «وصف المنتج» ──
  { key: 'description', scope: 'invoice', label: 'الوصف',
    match: h => h.includes('وصف') },
];

/** الحقول التي لا يعمل القالب بدونها */
export const REQUIRED_FIELDS = TEMPLATE_FIELDS.filter(f => f.required === true).map(f => f.key);

export const FIELD_BY_KEY = Object.fromEntries(TEMPLATE_FIELDS.map(f => [f.key, f]));

/** الحقول الخاضعة لقاعدة «الثلاثة معاً أو لا شيء» */
export const DOC_DISCOUNT_FIELDS = ['docDiscountValue', 'docDiscountAccount', 'docDiscountTax'];

export const INVOICE_SCOPE_KEYS = TEMPLATE_FIELDS.filter(f => f.scope === 'invoice').map(f => f.key);
export const LINE_SCOPE_KEYS = TEMPLATE_FIELDS.filter(f => f.scope === 'line').map(f => f.key);

export const YES = 'نعم';
export const NO = 'لا';

/**
 * تطبيع رأس عمود قبل المطابقة: إزالة النجمة والتشكيل والأقواس والمسافات،
 * وتوحيد الهمزات، حتى يطابق «تاريخ الإصدار * (DD/MM/YYYY)» النمطَ «تاريخ + اصدار».
 */
export function normalizeHeader(v) {
  return String(v ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[*\u2731\u2605]/g, ' ')
    .replace(/[\u064B-\u0652\u0670\u200B-\u200F\uFEFF]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىی]/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/ة/g, 'ه')
    .replace(/[/\-_،,.:]/g, ' ')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * قرارات التحويل المعتمدة — كل خيار مبرَّر لأنه يغيّر أرقام المخرج.
 */
export const ENGINE_DEFAULTS = {
  /**
   * تكرار بيانات الفاتورة في كل صف.
   * توثيق قيود يذكر التكرار صراحةً ويدرج عدمه ضمن أسباب فشل الصفوف.
   */
  repeatInvoiceData: true,

  /**
   * التسعير شامل الضريبة.
   * مصادر نقاط البيع مسعّرة شاملاً: 1079 بنداً من 1159 يعطي سعر وحدة نظيفاً
   * بالأساس الشامل مقابل 1012 بالأساس غير الشامل.
   */
  priceMode: 'inclusive',

  /**
   * دقة سعر الوحدة.
   * 4 خانات → انحراف إجمالي 0.67 ر.س على 219 فاتورة. خانتان → 1.30 ر.س.
   */
  unitPriceDecimals: 4,

  /**
   * الخصم بالنسبة المئوية دائماً، وقيمة الخصم تبقى فارغة.
   * النسبة محايدة تجاه أساس الاحتساب، فتلغي الغموض في تفسير «قيمة الخصم»
   * مع «شامل الضريبة = نعم» — غموض كلفته المقاسة 9091 ر.س في ملف مرجعي.
   * وتضمن عدم مخالفة قاعدة قيود: لا يُقبل الخصم بالنسبة والقيمة معاً.
   */
  discountMode: 'percent',
  discountPctDecimals: 4,

  /**
   * وحدة التحويل تبقى فارغة.
   * التوثيق: الخانة الفارغة تعني أن الكمية بالوحدة الأساسية للمنتج — وهو ما
   * تعطيه مصادر نقاط البيع فعلاً. وتعبئتها على صف بلا كود منتج تُفشل الصف،
   * وهذا يشمل بنود الرسوم التي تصل بلا كود.
   */
  unitOfConvMode: 'blank',

  /**
   * خصم المستند يبقى فارغاً.
   * مصادر نقاط البيع تسجّل الخصم على مستوى البند لا المستند. والأعمدة الثلاثة
   * تخضع لقاعدة «الثلاثة معاً أو لا شيء»، فتعبئة بعضها تُفشل الصف.
   */
  docDiscountMode: 'blank',

  /** تاريخ الاستحقاق غير موجود في مصدر نقاط البيع → يساوي تاريخ الإصدار */
  dueDateFallback: 'issueDate',

  /** الفوترة الإلكترونية المرحلة الثانية تجعل طريقة الدفع إلزامية */
  phase2Einvoicing: false,

  /** فحص كفاية الكميات مقابل ملف المنتجات */
  enforceStock: true,
};

export const ROUNDING = { money: 2 };
