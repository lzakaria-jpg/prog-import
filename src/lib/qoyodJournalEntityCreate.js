/*
 ============================================================================
  qoyodJournalEntityCreate — إنشاء الكيانات الناقصة (حساب/عميل/مورد/موقع) التي
  يشير إليها ملف القيود المرفوع فعليًا، عبر Qoyod REST API، قبل الإرسال —
  طلب صريح من المستخدم 2026-09-21: "نفس نمط فواتير المبيعات بالضبط: رصد
  تلقائي → لوحة مراجعة → إنشاء فعلي عبر API → تقرير نجاح/فشل شامل"، مطبَّق هنا
  على أداة استيراد القيود المحاسبية.
  ============================================================================
  [قيد حقيقي مؤكَّد من مواصفة Qoyod الرسمية] لا يوجد أي مسار POST /projects
  موثَّق إطلاقًا (فقط GET /projects وGET /projects/{id}) — إنشاء مشروع عبر API
  غير ممكن فعليًا. المشاريع الناقصة تُرصَد وتُعرَض للمستخدم بوضوح (اسم المشروع
  الظاهر بالملف + القيود المتأثرة)، لكن الإنشاء الفعلي يبقى يدويًا من واجهة
  قيود نفسها ثم "تحديث بيانات المنشأة" لإعادة الجلب — لا مسار آلي بديل ممكن.

  الحسابات: يُعاد استخدام buildQoyodAccountPayload/pushAccountsToQoyod
  (qoyodAccountSync.js/qoyodAccountPush.js — نفس المنطق المُختبَر ميدانياً
  فعلاً بأداة مطابقة شجرة الحسابات، بلا أي تكرار أو انحراف). كل حساب ناقص هنا
  حساب "تفصيلي" مباشر (level:3 دومًا) يُنشَأ برمزه/اسمه كما وردا بملف القيود،
  وفئة مستوى2 + نوع مستوى3 يختارهما المستخدم صراحةً (الملف لا يحمل أي معلومة
  عن نوع الحساب إطلاقاً — لا تخمين).

  العملاء/الموردون: POST /customers أو /vendors، حمولة {contact:{name,status}}
  فقط (نفس الحد الأدنى المُختبَر بأداتي استيراد العملاء/الموردين).

  المواقع: طلب صريح من المستخدم "يُضاف مع حساب المخزون الخاص به" — خطوتان
  مركَّبتان لكل موقع ناقص: (1) إنشاء حساب مخزون جديد مخصَّص له (level2Category
  "الأصول المتداولة"، type "المخزون" — ثابتان دومًا، هذا الغرض الوحيد للحساب)،
  (2) POST /inventories بـaccount_id الحساب الذي أُنشئ للتو. فشل الخطوة الأولى
  يمنع الثانية (لا معنى لموقع بلا حساب مخزون يخصه). فشل الثانية بعد نجاح الأولى
  يُبلَّغ صراحة (الحساب الجديد يبقى موجودًا، غير مستخدَم — لا حذف تلقائي).
 ============================================================================
*/
import { api } from '../product-upload/io/network.js';
import { buildQoyodAccountPayload } from './qoyodAccountSync.js';
import { pushAccountsToQoyod } from './qoyodAccountPush.js';

const RATE_LIMIT_MS = 300; // نفس التأخير المستخدم فعليًا بكل أدوات المشروع

/** POST /customers أو /vendors — حمولة الحد الأدنى المُختبَرة (name + status فقط). */
export function buildContactCreatePayload(name) {
  const n = String(name || '').trim();
  if (!n) return { ok: false, error: 'الاسم فارغ' };
  return { ok: true, payload: { contact: { name: n, status: 'Active' } } };
}

/** POST /inventories — {name, ar_name, account_id} (نفس شكل sales-invoice-import حرفيًا). */
export function buildLocationCreatePayload({ name, accountId } = {}) {
  const n = String(name || '').trim();
  if (!n) return { ok: false, error: 'اسم الموقع فارغ' };
  const payload = { name: n, ar_name: n };
  if (accountId !== undefined && accountId !== null) payload.account_id = accountId;
  return { ok: true, payload };
}

/**
 * ينشئ عملاء أو موردين (حسب resource: 'customers'|'vendors') من قائمة أسماء
 * — صفًا صفًا، بلا فحص تكرار مسبق (على عكس الحسابات، لا فهرس تكرار محلي هنا؛
 * قيود نفسه يرفض بوضوح لو الاسم مكرر تمامًا — يُلتقط كفشل عادي بالنتيجة).
 */
async function pushContactsToQoyod(items, resource, apiKey, { onEntry, stoppedRef } = {}) {
  const entries = [];
  let sent = 0, failed = 0, stoppedEarly = false;
  for (let i = 0; i < items.length; i++) {
    if (stoppedRef && stoppedRef.current) { stoppedEarly = true; break; }
    const item = items[i];
    const built = buildContactCreatePayload(item.name);
    if (!built.ok) {
      failed++;
      const entry = { key: item.key, name: item.name, status: 'error', reason: built.error };
      entries.push(entry); if (onEntry) onEntry(entry);
      continue;
    }
    try {
      const res = await api('POST', `/${resource}`, built.payload, apiKey);
      const created = res && res.contact;
      if (created && created.id) {
        sent++;
        const entry = { key: item.key, name: item.name, status: 'success', id: created.id };
        entries.push(entry); if (onEntry) onEntry(entry);
      } else {
        failed++;
        const entry = { key: item.key, name: item.name, status: 'error', reason: 'رد غير متوقع من Qoyod (بلا معرّف)' };
        entries.push(entry); if (onEntry) onEntry(entry);
      }
    } catch (e) {
      failed++;
      const entry = { key: item.key, name: item.name, status: 'error', reason: e.message || String(e) };
      entries.push(entry); if (onEntry) onEntry(entry);
    }
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }
  return { sent, failed, stoppedEarly, entries };
}

/**
 * ينشئ موقعًا واحدًا مع حساب مخزون جديد مخصَّص له (الخطوتان المركَّبتان
 * الموصوفتان أعلى الملف). يرجّع {status:'success', locationId, accountId} أو
 * {status:'error', reason, accountId?} — accountId مُرفَق حتى مع فشل الخطوة
 * الثانية (الحساب أُنشئ فعلاً، يبقى للمستخدم علم به).
 */
async function pushOneLocationWithAccount(item, apiKey) {
  const accountBuilt = buildQoyodAccountPayload({
    code: item.accountCode,
    nameAr: item.accountNameAr,
    nameEn: item.accountNameEn || item.accountNameAr,
    level2Category: 'الأصول المتداولة',
    type: 'المخزون',
    level: 3,
    desc: '',
    payCollect: 'No',
  });
  if (!accountBuilt.ok) return { status: 'error', reason: `تعذّر بناء حساب المخزون: ${accountBuilt.error}` };

  let accountId;
  try {
    const accRes = await api('POST', '/accounts', accountBuilt.payload, apiKey);
    accountId = accRes && accRes.account && accRes.account.id;
    if (!accountId) return { status: 'error', reason: 'تعذّر إنشاء حساب المخزون المخصَّص لهذا الموقع (رد غير متوقع من قيود)' };
  } catch (e) {
    return { status: 'error', reason: `تعذّر إنشاء حساب المخزون المخصَّص لهذا الموقع: ${e.message || String(e)}` };
  }

  const locBuilt = buildLocationCreatePayload({ name: item.name, accountId });
  if (!locBuilt.ok) return { status: 'error', reason: locBuilt.error, accountId };
  try {
    const locRes = await api('POST', '/inventories', locBuilt.payload, apiKey);
    const created = locRes && locRes.inventory;
    if (created && created.id) return { status: 'success', locationId: created.id, accountId };
    return { status: 'error', reason: 'رد غير متوقع من قيود عند إنشاء الموقع (بلا معرّف)', accountId };
  } catch (e) {
    return { status: 'error', reason: e.message || String(e), accountId };
  }
}

/**
 * الدالة المنسِّقة — تُنشئ كل ما اختاره المستخدم بلوحة المراجعة بالترتيب:
 * حسابات ← عملاء ← موردون ← مواقع (كل موقع بحسابه المخصَّص). ترجّع خلاصة شاملة
 * تُستخدَم لعرض تقرير نجاح/فشل، ولدمج المُنشَأ فعليًا داخل حالة الأداة (JournalTool.jsx).
 *
 * @param {object} selections {accounts:[{key,code,nameAr,nameEn,level2Category,type}], customers:[{key,name}], vendors:[{key,name}], locations:[{key,name,accountCode,accountNameAr,accountNameEn}]}
 * @param {string} apiKey
 * @param {object} [opts] {onProgress:(current,total)=>void, stoppedRef:{current:boolean}}
 */
export async function pushMissingJournalEntitiesToQoyod(selections, apiKey, opts = {}) {
  const { onProgress, stoppedRef } = opts;
  const key = (apiKey || '').trim();
  const accounts = selections.accounts || [];
  const customers = selections.customers || [];
  const vendors = selections.vendors || [];
  const locations = selections.locations || [];
  const total = accounts.length + customers.length + vendors.length + locations.length;
  let done = 0;
  const tick = () => { done++; if (onProgress) onProgress(done, total); };

  const created = { accounts: new Map(), customers: new Map(), vendors: new Map(), locations: new Map() };
  const report = { accounts: [], customers: [], vendors: [], locations: [] };

  if (!key) return { ok: false, error: 'أدخل مفتاح API أولاً', created, report };

  // 1) الحسابات — pushAccountsToQoyod تتولى فحص التكرار المسبق والإرسال والتقرير كاملاً.
  if (accounts.length && !(stoppedRef && stoppedRef.current)) {
    const rows = accounts.map((a) => ({
      code: a.code, nameAr: a.nameAr, nameEn: a.nameEn || a.nameAr,
      level2Category: a.level2Category, type: a.type, level: 3, desc: '', payCollect: 'No',
    }));
    let accountEntryIndex = 0;
    const res = await pushAccountsToQoyod(rows, key, {
      stoppedRef,
      // [طلب صريح من المستخدم] "المفترض الحساب الي ما ارسل يرسل غيره مباشر" —
      // الحسابات الناقصة هنا مستقلة تمامًا (كل واحد يخص سطر قيد مختلف)، فرفض
      // حساب واحد لا يبرّر تعطيل بقيتها. أداة مطابقة شجرة الحسابات تبقى على
      // قاعدتها الأصلية (توقف عند أول فشل) بلا أي تغيير — راجع تعليق الخيار.
      continueOnError: true,
      // [ملاحظة] pushAccountsToQoyod تستدعي onEntry مرة واحدة بالضبط لكل صف
      // بـrows، بنفس ترتيبه — accountEntryIndex هنا يطابق دومًا موقع الصف
      // المصدر المقابل بمصفوفة accounts الأصلية (لا بديل أنظف بلا تعديل تلك
      // الدالة العامة المُختبَرة أصلاً بأداة أخرى).
      onEntry: (entry) => {
        tick();
        const src = accounts[accountEntryIndex++];
        report.accounts.push({ key: src?.key, code: entry.code, name: entry.nameAr, status: entry.status, reason: entry.reason, id: entry.id });
        if (entry.status === 'success' && src) created.accounts.set(src.key, { id: entry.id, code: entry.code, name: entry.nameAr });
      },
    });
    if (res.fatalError) report.accounts.push({ key: null, name: '—', status: 'error', reason: res.fatalError });
  }

  // 2) العملاء
  if (customers.length && !(stoppedRef && stoppedRef.current)) {
    const res = await pushContactsToQoyod(customers, 'customers', key, {
      stoppedRef,
      onEntry: (entry) => { tick(); report.customers.push(entry); if (entry.status === 'success') created.customers.set(entry.key, { id: entry.id, name: entry.name }); },
    });
    void res;
  }

  // 3) الموردون
  if (vendors.length && !(stoppedRef && stoppedRef.current)) {
    const res = await pushContactsToQoyod(vendors, 'vendors', key, {
      stoppedRef,
      onEntry: (entry) => { tick(); report.vendors.push(entry); if (entry.status === 'success') created.vendors.set(entry.key, { id: entry.id, name: entry.name }); },
    });
    void res;
  }

  // 4) المواقع (كل موقع + حسابه المخصَّص معًا)
  for (const loc of locations) {
    if (stoppedRef && stoppedRef.current) break;
    const result = await pushOneLocationWithAccount(loc, key);
    tick();
    report.locations.push({ key: loc.key, name: loc.name, ...result });
    if (result.status === 'success') {
      created.locations.set(loc.key, {
        id: result.locationId, name: loc.name,
        accountId: result.accountId, accountCode: loc.accountCode, accountName: loc.accountNameAr,
      });
    }
    if (locations.indexOf(loc) < locations.length - 1) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  return { ok: true, created, report };
}
