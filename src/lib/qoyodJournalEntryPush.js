/*
 ============================================================================
  qoyodJournalEntryPush — إرسال القيود المحاسبية الجاهزة (بعد اجتياز كل تحقق
  الأداة الحالي بلا أي تغيير عليه) مباشرة إلى منشأة العميل عبر Qoyod REST API،
  بدل/بجانب تنزيل ملف القالب النهائي يدويًا (excelExport.js).
  ============================================================================
  [إضافة] ميزة إضافية بحتة — لا تُعدِّل entries ولا محرك التحقق (validateEntryStructure)
  ولا أي دالة مطابقة (applyAutoContactRules/findSystemAccountCodes/...). تُستدعى
  فقط لقيود اجتازت كل تحقق حالي (بلا أخطاء)، وتقرأ entries كما هي بلا أي تعديل.

  حمولة POST /journal_entries (مؤكَّدة بمثال طلب حقيقي من المستخدم 2026-09-13):
    description/date (مطلوبان) — date بصيغة yyyy-mm-dd (المُدخَل الداخلي
      dd/mm/yyyy، dmyToIso أدناه تحوّله — القراءة فقط، بلا أي تعديل على تخزينه).
    debit_amounts[]/credit_amounts[] — كل عنصر: account_id (مطلوب، رقمي، من
      شجرة الحسابات المجلوبة عبر API فقط — راجع qoyodJournalRefFetch.js)،
      amount (نص بصيغة "0.00")، comment (اختياري)، project_id (اختياري)،
      contact_id (اختياري، فقط لبنود المدينون/الدائنون).
    لا status/حالة للقيد — [قرار صريح من المستخدم 2026-09-13] نظام قيود
      المحاسبي لا يعرف "مسودة" لقيود اليومية، كل قيد يُعتمَد مباشرة عند الإرسال.
    لا inventory_id — أداة القيود لا تحمل أي مفهوم موقع/مخزن أصلاً (بخلاف أداة
      فواتير المبيعات)، فلا نرسل حقلاً لا معنى له هنا (اختياري بمخطط الرد، لا
      رفض متوقَّع لغيابه).

  المشروع (project_id) — [إضافة، ميزة جديدة بالكامل لهذه الأداة، لم تكن موجودة
  إطلاقًا] مطلوب "على مستوى القيد أو مستوى السطر": entry.project افتراضي لكل
  بنود القيد، وrow.project (لو مُعبَّأ) يتجاوزه لذلك السطر تحديدًا فقط — نفس
  فلسفة fillDownHeaderFields/تجاوز الصف بأداة فواتير المبيعات، بلا حاجة لآلية
  fill-down فعلية هنا (القراءة تكون مباشرة: row.project ?? entry.project).

  جهة الاتصال (contact_id) — يُعاد استخدام عمود "جهة اتصال/ضريبة/موظف" (row.contact)
  الموجود أصلاً بلا أي تغيير على قيمته أو آلية تعبئته التلقائية (applyAutoContactRules)؛
  فقط عند الإرسال عبر API، لو كان كود حساب السطر ضمن حسابات المدينين/الدائنين
  المكتشفة (نفس debtorsCodes/creditorsCodes التي تبنيها JournalTool.jsx بلا أي
  تغيير) وrow.contact رقم صحيح موجب، يُرسَل كـcontact_id. لأي حساب آخر (تحديدًا
  ضريبة القيمة المضافة، حيث تحمل contact رمز "1"/"2" لا معرّف عميل حقيقي —
  راجع vat15Code/vatZeroCode بـexcelCore.js) contact_id لا يُرسَل إطلاقًا، بصمت
  ولا خطأ (تجنّبًا لخلط رمز الضريبة مع معرّف عميل حقيقي بالمصادفة).
 ============================================================================
*/
import { api } from '../product-upload/io/network.js';

const RATE_LIMIT_MS = 300; // نفس التأخير المستخدم فعليًا بأدوات API الأخرى بالمشروع

function dmyToIso(dmy) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(dmy || ''));
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function fmtAmount(n) {
  return (Math.round(Number(n) * 100) / 100).toFixed(2);
}

/**
 * يطابق قيمة مشروع (نص رقم أو اسم) بمشروع حقيقي من projectsIndex (byId أولاً،
 * وإلا byName) — نفس فلسفة مطابقة المشروع بأداة فواتير المبيعات
 * (qoyodSalesInvoicePush.js) حرفيًا: بلا فهرس محمَّل فعلًا = تجاهل صامت (لا
 * خطأ)؛ بفهرس محمَّل، قيمة غير فارغة يتعذّر ربطها = خطأ حاجب صريح لذلك البند
 * (لا إرسال بند بمشروع خاطئ بصمت أو تجاهل المشروع بصمت).
 */
function resolveProjectId(value, projectsIndex) {
  if (!projectsIndex || !projectsIndex.loaded) return { ok: true, id: undefined };
  const typed = String(value || '').trim();
  if (!typed) return { ok: true, id: undefined };
  let matched = projectsIndex.byId ? projectsIndex.byId.get(typed) : undefined;
  if (!matched) {
    const candidates = (projectsIndex.byName ? projectsIndex.byName.get(typed.toLowerCase()) : undefined) || [];
    if (candidates.length === 1) matched = candidates[0];
    else if (candidates.length > 1) return { ok: false, error: `اسم المشروع "${typed}" مطابق لأكثر من مشروع بمنشأة العميل — استخدم رقم المشروع بدل الاسم.` };
  }
  if (!matched) return { ok: false, error: `تعذّر مطابقة المشروع "${typed}" بأي مشروع حقيقي بمنشأة العميل.` };
  return { ok: true, id: matched.id };
}

/**
 * يبني حمولة POST /journal_entries من قيد واحد (شكل entry الداخلي: seq, date,
 * desc, project?, rows:[{code, contact, debit, credit, comment, project?}]).
 * يرجّع {ok:true, payload} أو {ok:false, error} — دالة نقية بالكامل، بلا أي
 * إرسال فعلي هنا (فصل البناء عن الإرسال، نفس نمط buildSalesInvoicePayload).
 *
 * @param {object} entry
 * @param {object} opts
 * @param {object} opts.chartMap كود → حساب (من chartAccounts المجلوبة عبر API
 *   فقط — يحتاج .id حقيقي لكل حساب، راجع buildChartAccountsFromApi)
 * @param {Set<string>} opts.debtorsCodes أكواد حسابات "المدينون" المكتشفة
 * @param {Set<string>} opts.creditorsCodes أكواد حسابات "الدائنون" المكتشفة
 * @param {object} [opts.projectsIndex] {loaded, byId, byName} أو غير موجود
 */
export function buildJournalEntryPayload(entry, { chartMap, debtorsCodes, creditorsCodes } = {}, projectsIndex) {
  if (!entry || !entry.rows || !entry.rows.length) return { ok: false, error: 'قيد فارغ' };

  const isoDate = dmyToIso(entry.date);
  if (!isoDate) return { ok: false, error: `تعذّر قراءة تاريخ القيد ("${entry.date || '—'}")` };
  if (!entry.desc) return { ok: false, error: 'وصف القيد فارغ' };

  const debit_amounts = [];
  const credit_amounts = [];

  for (let i = 0; i < entry.rows.length; i++) {
    const r = entry.rows[i];
    const account = chartMap ? chartMap[r.code] : undefined;
    if (!account || account.id === undefined || account.id === null) {
      return { ok: false, error: `تعذّر تحديد معرّف الحساب الحقيقي بقيود لكود "${r.code || '—'}" (السطر ${i + 1})` };
    }

    const projectValue = !isBlankValue(r.project) ? r.project : entry.project;
    const projectResult = resolveProjectId(projectValue, projectsIndex);
    if (!projectResult.ok) return { ok: false, error: `${projectResult.error} (السطر ${i + 1})` };

    const item = { account_id: account.id };
    if (r.comment) item.comment = String(r.comment).trim();
    if (projectResult.id !== undefined) item.project_id = projectResult.id;

    // contact_id: فقط لبنود المدينين/الدائنين، وفقط لو contact رقم صحيح موجب
    // (رمز ضريبة القيمة المضافة "1"/"2" على حسابات أخرى لا يُفسَّر أبدًا كمعرّف
    // عميل — راجع تعليق الرأس أعلاه).
    if ((debtorsCodes && debtorsCodes.has(r.code)) || (creditorsCodes && creditorsCodes.has(r.code))) {
      const contactId = parseInt(String(r.contact || '').trim(), 10);
      if (!isNaN(contactId) && contactId > 0 && String(contactId) === String(r.contact || '').trim()) {
        item.contact_id = contactId;
      }
    }

    const debit = parseFloat(r.debit);
    const credit = parseFloat(r.credit);
    if (!isNaN(debit) && debit > 0) debit_amounts.push({ ...item, amount: fmtAmount(debit) });
    else if (!isNaN(credit) && credit > 0) credit_amounts.push({ ...item, amount: fmtAmount(credit) });
  }

  if (!debit_amounts.length || !credit_amounts.length) {
    return { ok: false, error: 'القيد بلا بنود مدينة أو دائنة صالحة' };
  }

  return {
    ok: true,
    payload: {
      journal_entry: {
        description: entry.desc,
        date: isoDate,
        debit_amounts,
        credit_amounts,
      },
    },
  };
}

function isBlankValue(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

/**
 * يرسل entries (شكل قيود الأداة الداخلي، بعد اجتياز كل تحقق حالي بلا أخطاء)
 * إلى Qoyod عبر API، قيدًا كاملاً في كل مرة — القيود مستقلة عن بعضها، فأي فشل
 * بقيد واحد لا يوقف الباقي (نفس فلسفة pushSalesInvoicesToQoyod)، ويستمر
 * الإرسال لكل القيود المتبقية دومًا — قابل للإيقاف اليدوي فقط عبر stoppedRef.
 *
 * @param {Array} entries
 * @param {string} apiKey
 * @param {object} opts
 * @param {object} opts.chartMap
 * @param {Set<string>} opts.debtorsCodes
 * @param {Set<string>} opts.creditorsCodes
 * @param {object} [opts.projectsIndex]
 * @param {(entry:{seq,status:'success'|'error',reason?,id?}) => void} [opts.onEntry]
 * @param {(current:number, total:number) => void} [opts.onProgress]
 * @param {{current:boolean}} [opts.stoppedRef]
 * @returns {Promise<{total:number, sent:number, failed:number, stoppedEarly:boolean, fatalError?:string, entries:Array}>}
 */
export async function pushJournalEntriesToQoyod(entries, apiKey, opts = {}) {
  const { chartMap, debtorsCodes, creditorsCodes, projectsIndex, onEntry, onProgress, stoppedRef } = opts;
  const resultEntries = [];
  const emit = (e) => { resultEntries.push(e); if (onEntry) onEntry(e); };

  const key = (apiKey || '').trim();
  if (!key) return { total: 0, sent: 0, failed: 0, stoppedEarly: false, fatalError: 'أدخل مفتاح API أولاً', entries: resultEntries };
  if (!entries || !entries.length) return { total: 0, sent: 0, failed: 0, stoppedEarly: false, fatalError: 'لا توجد قيود جاهزة للإرسال', entries: resultEntries };

  let sent = 0, failed = 0, stoppedEarly = false;

  for (let i = 0; i < entries.length; i++) {
    if (stoppedRef && stoppedRef.current) { stoppedEarly = true; break; }
    const entry = entries[i];
    if (onProgress) onProgress(i, entries.length);

    const built = buildJournalEntryPayload(entry, { chartMap, debtorsCodes, creditorsCodes }, projectsIndex);
    if (!built.ok) {
      failed++;
      emit({ seq: entry.seq, status: 'error', reason: built.error });
    } else {
      try {
        const res = await api('POST', '/journal_entries', built.payload, key);
        const created = (res && res.journal_entry) || null;
        // [إصلاح خطأ حقيقي مبلَّغ ميدانياً 2026-09-14] بلاغ مستخدم: دفعة 3707 قيد
        // ظهرت "فشل" بالكامل بهذا التقرير رغم أنها وصلت وأُنشئت بنجاح تام وصحيح
        // بمنشأة العميل (تأكَّد بنفسه من واجهة قيود مباشرة) — ونظام قيود يُرقّمها
        // بتسلسله الخاص (يتجاهل أي تلميح تسلسل بالطلب)، على الأرجح لأنه يعالج
        // دفعات القيود الكبيرة بشكل غير متزامن (queued بالخلفية). الكود القديم
        // كان يشترط journal_entry.id صريحاً بالرد الفوري ليُعتبر القيد ناجحاً —
        // فمع هذا النمط يفشل الشرط لكل قيد رغم نجاح الإنشاء الفعلي 100%. التصحيح:
        // أي رد HTTP ناجح (2xx — لم يُرمَ استثناء من api() أصلاً) يُعتبر نجاحاً
        // بصرف النظر عن وجود id صريح بالرد الفوري؛ الفشل الحقيقي (بيانات غير
        // صالحة، حساب غير موجود...) يصل دومًا كخطأ HTTP غير 2xx (422 حسب
        // JournalEntryInput بالمواصفة الرسمية) فيُلتقَط أصلاً بكتلة catch تحت،
        // لا بهذا الفرع — لا خطر بتحويل فشل حقيقي إلى نجاح زائف.
        sent++;
        emit({
          seq: entry.seq, status: 'success',
          id: created?.id ?? (typeof res?.id === 'number' ? res.id : null),
          totalDebit: created?.total_debit, totalCredit: created?.total_credit,
          response: created || res || {},
        });
      } catch (e) {
        failed++;
        emit({ seq: entry.seq, status: 'error', reason: e.message || String(e) });
      }
    }

    if (i < entries.length - 1) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  if (onProgress) onProgress(resultEntries.length, entries.length);
  return { total: entries.length, sent, failed, stoppedEarly, entries: resultEntries };
}
