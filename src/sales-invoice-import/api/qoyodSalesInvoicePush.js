/*
 ============================================================================
  qoyodSalesInvoicePush — إرسال فواتير المبيعات الجاهزة (بعد اجتياز كل تحقق
  الأداة الحالي بلا أي تغيير عليه) مباشرة إلى منشأة العميل عبر Qoyod REST API،
  بدل/بجانب تنزيل ملف القالب النهائي يدويًا (Step4Export.jsx).
  ============================================================================
  [إضافة] ميزة إضافية بحتة — لا تُعدِّل rows ولا محرك التحقق (runValidation)
  ولا أي دالة مطابقة. تُستدعى فقط بعد أن يكون errCount===0 (نفس شرط تفعيل
  التصدير اليدوي الحالي بـStep4Export.jsx)، وتقرأ rows كما هي بلا أي تعديل.

  حمولة POST /invoices (مؤكَّدة بالكامل عبر توثيق apidoc.qoyod.com + اختبار
  حي ناجح فعليًا على منشأة اختبارية 2026-09-11 — أنشأنا فاتورة حقيقية #229):
    contact_id (مطلوب) — نفس id الحقيقي بقيود، وهو ما تخزّنه customers.byRef
      فعليًا بمسار الجلب عبر API (qoyodSalesRefFetch.js)، فـrow.C يحمله مباشرة
      بعد المطابقة (resolveNamesToRefs/validation.js — بلا أي تغيير هناك).
    issue_date/due_date (مطلوبان) — بصيغة yyyy-mm-dd (fromDMY من engine/dates.js
      نفسها، القراءة فقط، بلا أي تعديل على الدالة).
    inventory_id (مطلوب) — رقمي، يُحل من اسم الموقع (row.G) عبر فهرس داخلي
      (locationIdByName من qoyodSalesRefFetch.js) لا علاقة له بـtemplate.dropdowns.G.
    line_items[].product_id (مطلوب) — رقمي، يُحل من كود المنتج (row.N) عبر
      products.bySku (نفس الفهرس الذي يستخدمه التحقق الحالي، بإضافة id فقط).
    line_items[].tax_id — [تصحيح 2026-09-11] الجملة السابقة هنا ادّعت عدم وجود
      أي endpoint لقائمة الفئات الضريبية — غير صحيح: GET /taxes موجود ومؤكَّد
      (مستخدَم فعليًا بأداة رفع المنتجات) وأكّده المستخدم بمثال طلب حقيقي يحمل
      tax_id/tax_percentage صريحين. لو V (عمود عنصر البند) غير فارغة ومطابقة
      لفئة ضريبية حقيقية من taxesIndex (مجلوبة عبر /taxes)، تُرسَل tax_id
      صريحًا — [إصلاح 2026-09-11، بلاغ اختبار حي] المطابقة كانت نصية حرفية
      بحتة (byLabel.get(norm(r.V)))، وأي فرق تنسيقي بسيط بين V المعروضة
      وصيغة مفتاح الفهرس كان يُسقِط المطابقة بصمت، فلا يُرسَل tax_id إطلاقًا
      وتُنشئ قيود الفاتورة بضريبة صفرية تلقائيًا بدل احترام الضريبة الحقيقية
      المطلوبة (بالضبط ما أبلغ عنه المستخدم: "نسبة الضريبة تُكتب بدل معرّف
      الضريبة الفعلي"، أي لا معرّف حقيقي يصل قيود أصلًا). الآن resolveTaxEntry
      تجرّب مطابقة نصية أولًا ثم رقمية بالنسبة المئوية (تسامح 0.01)، وأي V غير
      فارغة يتعذّر ربطها بفئة حقيقية رغم وجود فئات فعلية بالفهرس (byLabel غير
      فارغ) تصبح خطأ حاجبًا صريحًا بدل إرسال الفاتورة بضريبة خاطئة/صفرية بصمت
      — نفس فلسفة الموقع (G) والمشروع أدناه بالضبط. taxesIndex غائب أو فهرسه
      فارغ فعلًا (لا فئات بمنشأة العميل) = تُترَك كما كانت (بلا فرض مطابقة).
    line_items[].project_id — [تصحيح 2026-09-11، بلاغ اختبار حي + مثال طلب
      حقيقي من المستخدم] الإصدار الأول وضع project_id على مستوى الفاتورة
      (invoice.project_id) قياسًا على حقول أخرى مثل contact_id — خطأ: حمولة
      إنشاء الفاتورة الحقيقية لا تحمل project_id إلا داخل كل line_item، فكانت
      الفاتورة تُنشأ بنجاح تام (بلا أي خطأ) لكن بلا مشروع مرفق فعليًا، لأن قيود
      يتجاهل حقلًا لا تقرؤه بهذا المستوى بصمت. الآن project_id على كل بند من
      بنود نفس الفاتورة (نفس قيمة projectRef على مستوى الرأس، مُطبَّقة على كل
      سطر — fillDownHeaderFields يضمن تطابقها بكل صفوف المجموعة أصلًا).
    طريقة الدفع (عمود H) — [قرار صريح من المستخدم 2026-09-10، لا يزال ساريًا]
      تُتجاهَل عمدًا هنا رغم وجود حقل payment_method فعليًا بحمولة إنشاء الفاتورة
      (اكتشاف 2026-09-11 من مثال طلب حقيقي من المستخدم) — ربط قيمة H النصية
      برقم طريقة دفع حقيقي بمنشأة العميل مهمة منفصلة لم تُطلَب بعد.
 ============================================================================
*/
import { api } from '../../product-upload/io/network.js';
import { groupRowsByInvoiceRef } from '../engine/grouping.js';
import { fromDMY } from '../engine/dates.js';
import { norm, normKey, isBlank } from '../engine/text.js';

const RATE_LIMIT_MS = 300; // نفس التأخير المستخدم فعليًا بأدوات API الأخرى بالمشروع

// [إضافة] يطابق قيمة V (نص فئة ضريبية معروضة، مثل "15%") بسجل تلك الفئة الحقيقي
// بـtaxesIndex.byLabel — مطابقة نصية حرفية أولًا (الحالة الشائعة، القيمة أتت أصلًا
// من نفس قائمة taxesIndex.labels عبر snapTaxCategory/الاختيار من القائمة المنسدلة)،
// وإلا مطابقة رقمية بالنسبة المئوية نفسها (تسامح 0.01) تحسبًا لأي فرق تنسيقي طفيف
// (فاصلة عشرية زائدة، مسافة، إلخ) لم يمر فعليًا عبر snapTaxCategory. راجع تعليق الرأس
// أعلاه لسبب الإصلاح.
function resolveTaxEntry(vValue, taxesIndex) {
  if (!taxesIndex || !taxesIndex.byLabel) return undefined;
  const key = norm(vValue);
  const exact = taxesIndex.byLabel.get(key);
  if (exact) return exact;
  const m = /(-?\d+(\.\d+)?)/.exec(key);
  if (!m) return undefined;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return undefined;
  for (const entry of taxesIndex.byLabel.values()) {
    if (Math.abs(entry.rate - num) < 0.01) return entry;
  }
  return undefined;
}

/**
 * يبني حمولة POST /invoices من صفوف مجموعة فاتورة واحدة (كما تُنتجها
 * groupRowsByInvoiceRef بعد fillDownHeaderFields بالخطوة 3 — حقول الرأس
 * متطابقة بكل صفوف المجموعة). يرجّع {ok:true, payload} أو {ok:false, error}
 * — دالة نقية بالكامل، بلا أي إرسال فعلي هنا (فصل البناء عن الإرسال لتسهيل
 * الاختبار، نفس نمط buildQoyodAccountPayload).
 */
export function buildSalesInvoicePayload(rowsInGroup, { productsIndex, locationIdByName, projectsIndex, taxesIndex, status } = {}) {
  if (!rowsInGroup || !rowsInGroup.length) return { ok: false, error: 'مجموعة فاتورة فارغة' };
  const header = rowsInGroup[0];

  const contactId = parseInt(norm(header.C), 10);
  if (!header.C || isNaN(contactId)) return { ok: false, error: `تعذّر تحديد رقم العميل الحقيقي لهذه الفاتورة (القيمة: "${header.C || '—'}")` };

  const issueDate = fromDMY(header.D);
  if (!issueDate) return { ok: false, error: `تعذّر قراءة تاريخ الإصدار ("${header.D || '—'}")` };
  const dueDate = !isBlank(header.E) ? fromDMY(header.E) : issueDate;

  const locName = norm(header.G);
  if (!locName) return { ok: false, error: 'الموقع (عمود الموقع) فارغ لهذه الفاتورة' };
  const inventoryId = locationIdByName ? locationIdByName.get(locName) : undefined;
  if (inventoryId === undefined) return { ok: false, error: `تعذّر مطابقة الموقع "${locName}" بمعرّف مخزون حقيقي بقيود` };

  // [إضافة] عمود "المشروع" (projectRef — خارج COL_KEYS، راجع constants.js
  // AUX_FIELD_KEYWORDS._project) — يُطابَق برقم المشروع الحقيقي (byId) أولًا،
  // وإلا بالاسم (byName). بلا قيمة أصلًا = لا مشروع لهذه الفاتورة (طبيعي، ليس
  // خطأ). قيمة موجودة لكن غير مطابقة = خطأ صريح بدل إرسال فاتورة بمشروع خاطئ
  // بصمت أو تجاهل المشروع بصمت — نفس فلسفة الموقع (G) أعلاه بالضبط.
  // [إصلاح] الشرط كان يفحص وجود الكائن projectsIndex فقط — لكن refs.projects
  // غير المحمَّل (EMPTY_REF = {loaded:false}) كائن صحيح (truthy) أيضًا بلا
  // byId/byName، فكان أي صف فيه projectRef يفشل ببناء الفاتورة كاملةً (خطأ
  // "تعذّر مطابقة المشروع") فور تمرير projectsIndex من الهوك دومًا (sendInvoicesViaApi
  // يمرّره دائمًا)، حتى لو المستخدم لم يجلب مشاريع أصلًا. الآن نتحقق من .loaded
  // صراحةً: بلا مشاريع محمَّلة فعليًا = تجاهل صامت (لا خطأ)، بنفس الفلسفة الموثَّقة.
  // [إصلاح 2026-09-11] مُطابَق مرة واحدة هنا (نفس projectRef بكل صفوف المجموعة
  // بعد fillDownHeaderFields) ويُطبَّق أدناه على كل بند (line_item) لا على الفاتورة
  // نفسها — راجع تعليق الرأس "line_items[].project_id" لسبب النقل.
  let matchedProjectId;
  if (!isBlank(header.projectRef) && projectsIndex && projectsIndex.loaded) {
    const typed = norm(header.projectRef);
    let matched = projectsIndex.byId ? projectsIndex.byId.get(typed) : undefined;
    if (!matched) {
      const candidates = (projectsIndex.byName ? projectsIndex.byName.get(normKey(typed)) : undefined) || [];
      if (candidates.length === 1) matched = candidates[0];
      else if (candidates.length > 1) {
        return { ok: false, error: `اسم المشروع "${typed}" مطابق لأكثر من مشروع بمنشأة العميل — استخدم رقم المشروع بدل الاسم لهذه الفاتورة.` };
      }
    }
    if (!matched) return { ok: false, error: `تعذّر مطابقة المشروع "${typed}" بأي مشروع حقيقي بمنشأة العميل.` };
    matchedProjectId = matched.id;
  }

  const hasRealTaxes = !!(taxesIndex && taxesIndex.byLabel && taxesIndex.byLabel.size > 0);

  const lineItems = [];
  for (let i = 0; i < rowsInGroup.length; i++) {
    const r = rowsInGroup[i];
    const sku = norm(r.N);
    const product = productsIndex && productsIndex.bySku ? productsIndex.bySku.get(sku) : null;
    if (!product || product.id === undefined || product.id === null) {
      return { ok: false, error: `تعذّر تحديد معرّف المنتج الحقيقي بقيود لكود "${sku || '—'}"` };
    }
    const qty = parseFloat(r.P);
    const price = parseFloat(r.R);
    if (isNaN(qty) || isNaN(price)) return { ok: false, error: `كمية/سعر غير صالحين لكود المنتج "${sku}"` };

    const item = {
      product_id: product.id,
      quantity: qty,
      unit_price: price,
      is_inclusive: norm(r.S) === 'نعم',
    };
    if (!isBlank(r.O)) item.description = norm(r.O);
    if (!isBlank(r.T)) { item.discount = parseFloat(r.T); item.discount_type = 'percentage'; }
    else if (!isBlank(r.U)) { item.discount = parseFloat(r.U); item.discount_type = 'amount'; }
    // [إصلاح 2026-09-11] فئة ضريبية حقيقية مُختارة صراحةً (V) — راجع resolveTaxEntry
    // وتعليق الرأس أعلاه. فهرس ضرائب حقيقي محمَّل فعلًا (hasRealTaxes) وV غير فارغة
    // لكن يتعذّر ربطها بأي فئة حقيقية = خطأ حاجب صريح الآن (كان يُتجاهَل بصمت فتُنشأ
    // الفاتورة بضريبة صفرية تلقائية). بلا فهرس ضرائب حقيقي أصلًا = تُترَك كما كانت
    // (بلا فرض مطابقة، لا بيانات حقيقية لفرضها).
    if (!isBlank(r.V)) {
      if (hasRealTaxes) {
        const tax = resolveTaxEntry(r.V, taxesIndex);
        if (!tax) return { ok: false, error: `تعذّر مطابقة فئة الضريبة "${norm(r.V)}" (كود المنتج "${sku}") بأي فئة ضريبية حقيقية بمنشأة العميل.` };
        item.tax_id = tax.id;
      } else if (taxesIndex && taxesIndex.byLabel) {
        const tax = taxesIndex.byLabel.get(norm(r.V));
        if (tax) item.tax_id = tax.id;
      }
    }
    if (matchedProjectId !== undefined) item.project_id = matchedProjectId;
    lineItems.push(item);
  }

  const invoice = {
    contact_id: contactId,
    issue_date: issueDate,
    due_date: dueDate,
    status: status === 'Approved' ? 'Approved' : 'Draft',
    inventory_id: inventoryId,
    draft_if_out_of_stock: true,
    line_items: lineItems,
  };
  if (!isBlank(header.A)) invoice.reference = norm(header.A);
  if (!isBlank(header.B)) invoice.description = norm(header.B);

  return { ok: true, payload: { invoice } };
}

/**
 * يرسل rows (شكل صفوف الأداة الداخلي، بعد اجتياز errCount===0) إلى Qoyod عبر
 * API، فاتورة كاملة (مجموعة مرجع) في كل مرة — الفواتير مستقلة عن بعضها (لا
 * تبعية أب/ابن كما بالحسابات)، فأي فشل بفاتورة واحدة لا يوقف الباقي، ويستمر
 * الإرسال لكل الفواتير المتبقية دومًا — قابل للإيقاف اليدوي فقط عبر stoppedRef.
 *
 * @param {Array} rows
 * @param {string} apiKey
 * @param {object} opts
 * @param {object} opts.productsIndex نفس refs.products (يحتاج bySku مع id لكل سجل)
 * @param {Map}    opts.locationIdByName من qoyodSalesRefFetch.js
 * @param {object} [opts.projectsIndex] نفس refs.projects (loaded/byId/byName) — بلا
 *   تمريره، أو loaded!==true (لم تُجلَب مشاريع فعليًا)، أي فاتورة فيها projectRef
 *   تُرسَل بلا project_id بصمت (لا خطأ)؛ بـloaded===true، projectRef غير المطابَق
 *   يصير خطأً حاجبًا لتلك الفاتورة. project_id يُرسَل على كل line_item (لا على
 *   الفاتورة نفسها — مؤكَّد بمثال طلب حقيقي 2026-09-11، راجع تعليق رأس الملف).
 * @param {object} [opts.taxesIndex] نفس refs.taxes (byLabel، غير فارغ = فئات ضريبية
 *   حقيقية موجودة فعلًا بمنشأة العميل) — بلا تمريره أو byLabel فارغ، لا فرض مطابقة
 *   (تُترَك كما كانت، قيود يطبّق ضريبة المنتج تلقائيًا). بفئات حقيقية موجودة، V غير
 *   فارغة يتعذّر ربطها بأي فئة منها (resolveTaxEntry) تصير خطأً حاجبًا لتلك الفاتورة
 *   — [إصلاح 2026-09-11] كانت تُتجاهَل بصمت فتُنشأ الفاتورة بضريبة صفرية تلقائيًا.
 * @param {'Draft'|'Approved'} [opts.status]
 * @param {Set<string>} [opts.forceDraftRefs] [إضافة] مراجع فواتير (row.A) تُرسَل
 *   دومًا كمسودة (Draft) بغض النظر عن opts.status — تُستخدَم من لوحة مراجعة نقص
 *   الكمية بالخطوة 4 (StockShortageReviewPanel) عندما يختار المستخدم إرسال فواتير
 *   محفوفة بمخاطر نقص الكمية مع فواتير أخرى سليمة بحالة "معتمدة" بنفس الدفعة —
 *   الفواتير المحفوفة بالمخاطر فقط تُجبَر على Draft، الباقي يتبع opts.status كالمعتاد.
 * @param {(entry:{ref,status:'success'|'error',reason?,id?,total?}) => void} [opts.onEntry]
 * @param {(current:number, total:number) => void} [opts.onProgress]
 * @param {{current:boolean}} [opts.stoppedRef]
 * @returns {Promise<{total:number, sent:number, failed:number, stoppedEarly:boolean, fatalError?:string, entries:Array}>}
 */
export async function pushSalesInvoicesToQoyod(rows, apiKey, opts = {}) {
  const { productsIndex, locationIdByName, projectsIndex, taxesIndex, status, forceDraftRefs, onEntry, onProgress, stoppedRef } = opts;
  const entries = [];
  const emit = (entry) => { entries.push(entry); if (onEntry) onEntry(entry); };

  const key = (apiKey || '').trim();
  if (!key) return { total: 0, sent: 0, failed: 0, stoppedEarly: false, fatalError: 'أدخل مفتاح API أولاً', entries };
  if (!rows || !rows.length) return { total: 0, sent: 0, failed: 0, stoppedEarly: false, fatalError: 'لا توجد فواتير جاهزة للإرسال', entries };

  const groups = Array.from(groupRowsByInvoiceRef(rows).entries()).filter(([k]) => !k.startsWith('__blank__'));

  let sent = 0, failed = 0, stoppedEarly = false;

  for (let i = 0; i < groups.length; i++) {
    if (stoppedRef && stoppedRef.current) { stoppedEarly = true; break; }
    const [ref, rowsInGroup] = groups[i];
    if (onProgress) onProgress(i, groups.length);

    const effectiveStatus = forceDraftRefs && forceDraftRefs.has(ref) ? 'Draft' : status;
    const built = buildSalesInvoicePayload(rowsInGroup, { productsIndex, locationIdByName, projectsIndex, taxesIndex, status: effectiveStatus });
    if (!built.ok) {
      failed++;
      emit({ ref, status: 'error', reason: built.error });
    } else {
      try {
        const res = await api('POST', '/invoices', built.payload, key);
        const created = res && res.invoice;
        if (created && created.id) {
          sent++;
          // [إضافة] response = رد قيود الكامل على الفاتورة (بما فيه line_items) —
          // يُستخدَم بتقرير Excel لنتائج الإرسال (sendResultsReport.js) لعرض تفاصيل
          // الفاتورة والمنتجات الفعلية المُنشأة، لا فقط id/total.
          emit({ ref, status: 'success', id: created.id, total: created.total, response: created });
        } else {
          failed++;
          emit({ ref, status: 'error', reason: 'رد غير متوقع من Qoyod (بلا معرّف فاتورة)' });
        }
      } catch (e) {
        failed++;
        emit({ ref, status: 'error', reason: e.message || String(e) });
      }
    }

    if (i < groups.length - 1) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  if (onProgress) onProgress(entries.length, groups.length);
  return { total: groups.length, sent, failed, stoppedEarly, entries };
}
