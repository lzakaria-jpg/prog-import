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
    line_items[].tax_percent — [قرار مؤكَّد باختبار حي] يُترَك بلا إرسال عمدًا:
      Qoyod يطبّق تلقائيًا نسبة الضريبة المُسجَّلة على المنتج نفسه إن لم تُرسَل،
      وهذا مؤكَّد بالاختبار الحي (فاتورة #229: أرسلنا بلا tax_percent، ورجع
      "tax_percent":"15.0" و"total":"115.0" تلقائيًا من ضريبة المنتج). لا يوجد
      أي endpoint لقائمة الفئات الضريبية بـQoyod API (تأكَّد بالبحث الكامل
      بالتوثيق)، فعمود V بالجدول الداخلي (مطلوب دومًا لاجتياز التحقق الحالي،
      بلا أي تغيير عليه) لا يُستخدَم إطلاقًا بهذا المسار — قيمته تُتجاهَل عمدًا.
    طريقة الدفع (عمود H) — [قرار صريح من المستخدم 2026-09-10] تُتجاهَل تمامًا:
      لا يوجد لها أي حقل بإنشاء الفاتورة عبر API أصلاً (مورد Invoice Payments
      منفصل تمامًا، خارج نطاق هذه الميزة).
 ============================================================================
*/
import { api } from '../../product-upload/io/network.js';
import { groupRowsByInvoiceRef } from '../engine/grouping.js';
import { fromDMY } from '../engine/dates.js';
import { norm, isBlank } from '../engine/text.js';

const RATE_LIMIT_MS = 300; // نفس التأخير المستخدم فعليًا بأدوات API الأخرى بالمشروع

/**
 * يبني حمولة POST /invoices من صفوف مجموعة فاتورة واحدة (كما تُنتجها
 * groupRowsByInvoiceRef بعد fillDownHeaderFields بالخطوة 3 — حقول الرأس
 * متطابقة بكل صفوف المجموعة). يرجّع {ok:true, payload} أو {ok:false, error}
 * — دالة نقية بالكامل، بلا أي إرسال فعلي هنا (فصل البناء عن الإرسال لتسهيل
 * الاختبار، نفس نمط buildQoyodAccountPayload).
 */
export function buildSalesInvoicePayload(rowsInGroup, { productsIndex, locationIdByName, status } = {}) {
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
    // tax_percent متروكة عمدًا — راجع تعليق الرأس أعلاه.
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
  const { productsIndex, locationIdByName, status, forceDraftRefs, onEntry, onProgress, stoppedRef } = opts;
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
    const built = buildSalesInvoicePayload(rowsInGroup, { productsIndex, locationIdByName, status: effectiveStatus });
    if (!built.ok) {
      failed++;
      emit({ ref, status: 'error', reason: built.error });
    } else {
      try {
        const res = await api('POST', '/invoices', built.payload, key);
        const created = res && res.invoice;
        if (created && created.id) {
          sent++;
          emit({ ref, status: 'success', id: created.id, total: created.total });
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
