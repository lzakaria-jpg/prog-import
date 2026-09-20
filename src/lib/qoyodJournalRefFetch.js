/*
 ============================================================================
  qoyodJournalRefFetch — جلب البيانات المرجعية لأداة استيراد القيود المحاسبية
  (شجرة الحسابات + عملاء/موردين مرجعيين + مشاريع) مباشرة من منشأة العميل عبر
  Qoyod REST API، بدل رفعها يدويًا.
  ============================================================================
  [إضافة] طلب صريح من المستخدم: "شجرة الحسابات عبر API تغني عن رفع الملف" —
  بخلاف قرار سابق مماثل بأداة فواتير المبيعات (القالب هناك بقي إلزاميًا حتى مع
  API)، هنا القرار الصريح هو العكس: نجاح الجلب يجعل شجرة الحسابات جاهزة تمامًا
  بلا حاجة لرفع أي ملف — راجع JournalTool.jsx (chartAccounts تُملأ مباشرة من
  buildChartAccountsFromApi، بنفس شكل مصفوفة parseChartFile بالضبط + id إضافي).

  مصادر البيانات:
    - GET /accounts   → مؤكَّد ميدانيًا (qoyodAccountSync.js/qoyodAccountPush.js،
      أداة مطابقة شجرة الحسابات) — id, code, name_ar, name_en, description,
      recieve_payments, type (enum إنجليزي Qoyod، لا يُترجَم لتصنيف عربي — نفس
      قرار qoyodAccountsToFile1Records هناك، بلا تخمين).
    - GET /customers  → مؤكَّد ميدانيًا (sales-invoice-import) — id, name, status.
      "الرقم المرجعي" (CUS198 مثلاً) كما يظهر بواجهة قيود غير متاح بالـAPI
      إطلاقًا (تحقّقنا سابقًا) — نستخدم id الحقيقي كمرجع، وهذا متوافق تمامًا مع
      qoyodJournalEntryPush.js (يحتاج contact_id الحقيقي أصلاً).
    - GET /vendors    → [غير مؤكَّد ميدانيًا] لا يوجد أي استخدام سابق فعلي لهذا
      المسار بالمشروع كله (أداة استيراد فواتير المشتريات bill-import تعتمد ملف
      موردين مرفوع يدويًا فقط) — افتراض قياسًا على تسمية /customers القياسية.
      فشل جلبه (404 أو أي خطأ) يُعامَل كـ"لا موردون متاحون عبر API" فقط (فارغ)،
      لا يُفشل باقي الجلب — يحتاج اختبارًا حيًا على منشأة فيها موردون فعليون.
    - GET /projects   → [غير مؤكَّد ميدانيًا] نفس افتراض sales-invoice-import
      (qoyodSalesRefFetch.js) حرفيًا — نفس المنطق، فشل جلبه فارغ فقط.

  نفس فلسفة qoyodSalesRefFetch.js بالكامل: دوال بناء فهارس نقية قابلة للاختبار
  المباشر (بلا شبكة)، ودالة تنسيق واحدة تُستدعى من JournalTool.jsx فقط.
 ============================================================================
*/
import { fetchAll, fetchAllByCursor } from '../product-upload/io/network.js';
import { normalizeCode } from './excelCore.js';

/**
 * يستنتج رمز الأب بالاقتطاع من اليمين — نفس أسلوب guessParentByCodeTruncation
 * بـqoyodAccountSync.js حرفيًا (GET /accounts الفعلي لا يرسل parent_id/level
 * إطلاقًا، فقط بنية ترقيم الرمز نفسها تدل على الهرمية) — منسوخة هنا بدل
 * استيرادها لأنها غير مُصدَّرة هناك (دالة داخلية private بذلك الملف).
 */
function guessParentByCodeTruncation(code, codesSet) {
  let current = String(code || '').trim();
  while (current.length > 1) {
    current = current.slice(0, -1);
    if (codesSet.has(current)) return current;
  }
  return '';
}

/**
 * يحوّل مصفوفة GET /accounts الخام إلى نفس شكل مصفوفة parseChartFile بالضبط
 * (code, name, type, description, parentCode, canPay) + حقل id إضافي (لا يقرأه
 * أي كود مطابقة/تحقق حالي — findSystemAccountCodes/buildParentInfo/validateEntryStructure
 * كلها تقرأ code/name/parentCode فقط، فتعمل بلا أي تعديل عليها) يُستخدَم حصريًا
 * لاحقًا من qoyodJournalEntryPush.js لبناء account_id الحقيقي بالإرسال.
 * type يبقى فارغًا عمدًا (enum إنجليزي من Qoyod مثل "CurrentAsset"، لا نترجمه
 * لتصنيف عربي — نفس قرار qoyodAccountsToFile1Records، لا تخمين).
 */
export function buildChartAccountsFromApi(apiAccounts) {
  const list = (apiAccounts || []).filter((a) => a && a.code !== undefined && a.code !== null && String(a.code).trim() !== '');
  const codesSet = new Set(list.map((a) => normalizeCode(a.code)));
  return list.map((a) => {
    const code = normalizeCode(a.code);
    return {
      code,
      name: String(a.name_ar ?? '').trim() || String(a.name_en ?? '').trim(),
      type: '',
      description: String(a.description ?? '').trim(),
      parentCode: guessParentByCodeTruncation(code, codesSet),
      canPay: '',
      id: a.id,
    };
  });
}

/**
 * يحوّل مصفوفة عملاء/موردين خام (GET /customers أو /vendors) إلى نفس شكل
 * parseNameRefFile بالضبط ([{name, ref}]) — يحل محل الملف المرجعي المرفوع
 * يدويًا بشفافية كاملة أمام applyAutoContactRules (بلا أي تعديل عليها إطلاقًا).
 * ref = String(id) الحقيقي بقيود (نفس منطق buildCustomersIndexFromApi
 * بـsales-invoice-import) — هذا بالضبط ما يحتاجه qoyodJournalEntryPush.js
 * لاحقًا لبناء contact_id الحقيقي، فيصير row.contact (بعد تطبيق applyAutoContactRules
 * تلقائيًا) نفس contact_id الجاهز للإرسال بلا أي تحويل إضافي.
 */
export function buildNameRefListFromApi(apiContacts) {
  const out = [];
  (apiContacts || []).forEach((c) => {
    const id = c?.id;
    if (id === undefined || id === null) return;
    const name = String(c?.name ?? '').trim();
    if (!name) return;
    out.push({ name, ref: String(id) });
  });
  return out;
}

/**
 * فهرس مشاريع منشأة العميل — نسخة مطابقة تمامًا لـbuildProjectsIndexFromApi
 * بـsales-invoice-import/api/qoyodSalesRefFetch.js (نفس شكل الحقول، نفس درجة
 * عدم التأكد الميداني — راجع تعليقها هناك). منسوخة هنا (لا مستوردة) لتبقى
 * أداة القيود مستقلة تمامًا عن مجلد sales-invoice-import.
 */
export function buildProjectsIndexFromApi(apiProjects) {
  const byId = new Map();
  const byName = new Map();
  (apiProjects || []).forEach((p) => {
    const id = p?.id;
    if (id === undefined || id === null) return;
    const name = String(p?.name ?? '').trim();
    const rec = { id, name };
    byId.set(String(id), rec);
    if (name) {
      const nk = name.toLowerCase();
      if (!byName.has(nk)) byName.set(nk, []);
      byName.get(nk).push(rec);
    }
  });
  return { byId, byName };
}

/**
 * [إضافة 2026-09-15] فهرس مواقع/مخازن منشأة العميل من مصفوفة GET /inventories
 * الخام — طلب المستخدم الصريح: بعض ملفات العملاء تحمل "الموقع" (inventory_id
 * بمواصفة Qoyod الرسمية، مؤكَّد بمثال طلب POST /journal_entries حقيقي من
 * المستخدم 2026-09-15 يحمل inventory_id على مستوى القيد ذاته وعلى مستوى كل بند
 * أيضًا معًا) بجانب "المشروع". GET /inventories مؤكَّد ميدانيًا فعلاً (bill-import/
 * lib/api.js: normInventoryFull) — id + name (إنجليزي، الحقل الأساسي) + ar_name
 * (عربي، مؤكَّد من توثيق Qoyod الرسمي). نفس شكل بناء الفهرس تمامًا كـ
 * buildProjectsIndexFromApi أعلاه (byId + byName)، بلا فرق سوى مصدر الاسم.
 */
export function buildLocationsIndexFromApi(apiInventories) {
  const byId = new Map();
  const byName = new Map();
  (apiInventories || []).forEach((inv) => {
    const id = inv?.id;
    if (id === undefined || id === null) return;
    const name = (String(inv?.name ?? '').trim() || String(inv?.ar_name ?? '').trim());
    const rec = { id, name };
    byId.set(String(id), rec);
    if (name) {
      const nk = name.toLowerCase();
      if (!byName.has(nk)) byName.set(nk, []);
      byName.get(nk).push(rec);
    }
  });
  return { byId, byName };
}

/**
 * الدالة المنسِّقة — تُستدعى من JournalTool.jsx فقط. تجلب /accounts (مطلوب)
 * بالتوازي مع /customers (اختياري)، ثم /vendors و/projects و/inventories
 * (اختيارية، فشل كل منها فارغ فقط بلا إيقاف الجلب). ترمي استثناءً برسالة عربية
 * واضحة فقط لو فشل جلب /accounts نفسه (المورد الوحيد الذي بلا بديل يدوي في
 * مسار API).
 */
export async function fetchJournalReferencesFromApi(apiKey, { onAccountsProgress } = {}) {
  const key = (apiKey || '').trim();
  if (!key) throw new Error('أدخل مفتاح API أولاً');

  // [إضافة — بلاغ حقيقي من المستخدم: "طول كتير الى الان ما خلص"] الإنقاذ
  // سجلاً سجلاً (per_page=1) بـfetchAll عند فشل الدفعة قد يأخذ دقائق فعلياً
  // لشجرة حسابات كبيرة، وواجهة JournalTool.jsx كانت تعرض مؤشر "جارٍ الجلب..."
  // بلا أي رقم — فيبدو الجلب متجمّداً رغم أنه يعمل فعلياً ببطء. onAccountsProgress
  // يمرَّر مباشرة لـfetchAll('/accounts',...) ليُحدِّث الواجهة بعدد الحسابات
  // المُجمَّعة حتى الآن أولاً بأول، سواء بالجلب الدفعي العادي أو بالإنقاذ الفردي.
  // [تغيير — دليل حي] /accounts يُجلَب بالترقيم بالمؤشر (q[s]=id asc + q[id_gt])
  // بدل OFFSET: أثبت اختبار حي أنه يتفادى خطأ 500 من قيود على الترقيم العميق
  // ويرجّع كل الحسابات القابلة للجلب دفعة وحدة بدل التوقف عند 100.
  let apiAccounts;
  try {
    apiAccounts = await fetchAllByCursor('/accounts', key, { onPage: onAccountsProgress });
  } catch (e) {
    throw new Error(`تعذّر جلب شجرة الحسابات من قيود: ${e.message || String(e)}`);
  }

  let apiCustomers;
  try {
    apiCustomers = await fetchAllByCursor('/customers', key);
  } catch (e) {
    apiCustomers = [];
  }

  let apiVendors;
  try {
    apiVendors = await fetchAllByCursor('/vendors', key);
  } catch (e) {
    apiVendors = [];
  }

  let apiProjects;
  try {
    apiProjects = await fetchAllByCursor('/projects', key);
  } catch (e) {
    apiProjects = [];
  }

  // [إضافة 2026-09-15] /inventories — نفس مسار /products، بلا ترقيم إطلاقًا
  // (مؤكَّد بـbill-import/lib/api.js) — fetchAll تتعامل مع هذا بأمان (رد غير
  // مُرقَّم يُعامَل كصفحة واحدة كاملة، لا حاجة لأي تعديل عليها).
  let apiInventories;
  try {
    apiInventories = await fetchAllByCursor('/inventories', key);
  } catch (e) {
    apiInventories = [];
  }

  // [قرار المستخدم] الجلب بالمؤشر (fetchAllByCursor) يجلب كل الحسابات الطرفية
  // كاملة؛ خطأ 500 على "التالي" بعد اكتمالها نهاية طبيعية بلا تحذير — لا حاجة
  // لأي حقل warning إطلاقًا.
  return {
    chartAccounts: buildChartAccountsFromApi(apiAccounts),
    customersRefList: buildNameRefListFromApi(apiCustomers),
    suppliersRefList: buildNameRefListFromApi(apiVendors),
    projectsRef: { loaded: true, ...buildProjectsIndexFromApi(apiProjects) },
    locationsRef: { loaded: true, ...buildLocationsIndexFromApi(apiInventories) },
    counts: { accounts: apiAccounts.length, customers: apiCustomers.length, vendors: apiVendors.length, projects: apiProjects.length, locations: apiInventories.length },
  };
}
