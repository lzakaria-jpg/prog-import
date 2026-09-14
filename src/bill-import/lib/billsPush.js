/*
 ============================================================================
  billsPush — إرسال فواتير المشتريات الجاهزة (بعد اجتياز كل تحقق الأداة
  الحالي بلا أي تغيير عليه) مباشرة إلى منشأة العميل عبر Qoyod REST API، بدل/
  بجانب تنزيل ملف القالب النهائي يدويًا (Step4Export.jsx). نفس فلسفة
  sales-invoice-import/api/qoyodSalesInvoicePush.js تمامًا (المُثبَتة حيًا على
  فواتير المبيعات) مطبَّقة هنا على فواتير المشتريات (POST /bills)، وفق حمولة
  حقيقية مؤكَّدة قدّمها المستخدم مباشرة (مثال طلب/رد حقيقيان من توثيق Qoyod).
 ============================================================================
  [إضافة] ميزة إضافية بحتة — لا تُعدِّل useImportEngine ولا أي دالة تحقق/مطابقة
  حالية. تُستدعى فقط لمجموعات (فواتير) اجتازت التحقق بلا أخطاء (!group.bad، نفس
  شرط تفعيل "تحميل الفواتير الصحيحة فقط" الحالي بالضبط)، وتقرأ groups/catalog
  كما هي بلا أي تعديل.

  حقول الحمولة وسبب كل قرار (مطابقة الحمولة الحقيقية المؤكَّدة من المستخدم):
    contact_id (مطلوب) — id الحقيقي للمورد المُطابَق أصلاً (row.vendorRef، عبر
      matchVendor بـclientFile.js) — نُحلّه هنا إلى id عبر buildVendorIndex
      نفسها المستخدمة بالتحقق (matching.js)، بلا أي منطق مطابقة جديد.
    issue_date/due_date (مطلوبان) — بصيغة yyyy-mm-dd. row.issueDate/dueDate
      كائنا Date فعليان (UTC منتصف الليل، من toDate بـtext.js) — toISOString()
      عليهما يُنتج التاريخ الصحيح دومًا بلا مشكلة توقيت.
    inventory_id (على مستوى الفاتورة وكل بند) — يُحل من اسم الموقع (row.location،
      موحَّد إلزاميًا بكل الفاتورة عبر validateGroups) عبر inventoriesFull
      (api.js، تحديدًا مضافة لهذه الميزة — منفصلة عن catalog.locations النصية
      المستخدمة بالمطابقة اليدوية القديمة، لا علاقة لها بها).
    status — "Draft" دومًا: لا خيار معتمد/مسودة بواجهة الأداة الحالية إطلاقاً،
      و"مسودة" الخيار الأكثر أمانًا افتراضيًا (لا يُرحَّل تلقائيًا لدفاتر العميل
      المحاسبية بلا مراجعته أولًا).
    line_items[].product_id (مطلوب) — نفس مبدأ contact_id، عبر buildProductIndex.
    line_items[].tax_id/tax_percentage — [نفس درس فواتير المبيعات الحي]: tax_id
      وحده بلا tax_percentage يرفضه قيود (422 "tax_percentage: Cannot be 0") —
      يُرسَلان معًا دومًا، tax_percentage كنص لا رقمًا (نفس صيغة المثال الحقيقي).
      الضريبة مطلوبة أصلاً بتحقق الأداة (row.taxName لا يمكن أن يكون فارغًا
      لفاتورة "سليمة") فتحليلها هنا لا يفشل إلا لو catalog.taxes بلا id حقيقي
      (يعني catalogSource !== 'api' — مُستبعَد أصلاً بشرط تفعيل زر الإرسال).
    line_items[].discount_percent/discount_type — [حرفي من المثال الحقيقي
      المقدَّم من المستخدم] خصم نسبة مئوية فقط: discount_percent كنص +
      discount_type="0" بالضبط كما بالمثال. خصم بالقيمة (row.discVal) على
      مستوى البند **غير مدعوم هنا عمدًا** — لا مثال حقيقي مؤكَّد لشكل حمولته
      (الحقل discount_amount بالرد للقراءة فقط)، فتخمين اسم/شكل حقل الطلب
      لخصم بالقيمة قد يُنشئ فاتورة بخصم خاطئ بصمت (مبلغ حقيقي). بند عليه
      discVal>0 يصبح خطأً حاجبًا صريحًا لتلك الفاتورة بدل التخمين — ملف
      الاستيراد اليدوي يبقى متاحًا كالمعتاد لتلك الحالة تحديدًا.
    line_items[].unit_id — [حذف عمدي] لا يُرسَل إطلاقًا: prod.conversions
      (api.js normProduct) تحمل اسم/معامل التحويل فقط بلا id حقيقي لكل وحدة،
      فلا مصدر بيانات حقيقي لحل unit_id بثقة. حذفه آمن (اختياري بالحمولة) —
      قيود يطبّق الوحدة الأساسية للمنتج تلقائيًا، بلا أي فرق عن السلوك الحالي.
    line_items[].project_id — [حذف عمدي] لا مفهوم "مشروع" بهذه الأداة إطلاقًا
      حاليًا (بخلاف أداتي القيود وفواتير المبيعات اللتين طُلب فيهما صراحةً) —
      لم يُطلَب هنا، فلا عمود/فهرس مشاريع أصلًا لحله. إضافته تتطلب عمودًا جديدًا
      كاملًا بشاشة الربط (خارج نطاق هذا الطلب: "تصلح الـAPI جلبًا وإرسالًا").
    discount_account_id/discount_tax_id/inclusive_cd_discount/discount_type
      (خصم المستند، مستوى الفاتورة) — [حرفي من المثال الحقيقي: discount_type
      بمستوى الفاتورة سلسلة نصية "amount"، بخلاف الترميز الرقمي "0" بمستوى
      البند — حقلان مختلفان تمامًا بمعنيين مختلفين] يُرسَلان فقط لو
      docDiscVal>0 لهذه الفاتورة (نفس شرط "خصم مستند موجود" بالتحقق الحالي).
      discount_account_id يُحل من اسم الحساب (docDiscAcc) عبر accounts
      (api.js، مضافة لهذه الميزة عبر GET /accounts) — تعذّر الحل = خطأ حاجب
      صريح (لا فرض حساب افتراضي قد يخطئ دفتر الأستاذ الحقيقي). نفس الشيء
      لـdiscount_tax_id عبر catalog.taxes بمطابقة اسم docDiscTax.
    discount_timing — [حذف عمدي] المثال يعرض "before_vat" لكن لا مفهوم مطابق
      بالأداة يحدد قبل/بعد الضريبة — حذفه يترك قيود يطبّق افتراضه الخاص، أأمن
      من تخمين قيمة قد تُغيّر الإجمالي فعليًا.
    inclusive_unit_price — [حذف عمدي] unit_price + is_inclusive يكفيان تمامًا
      (نفس نمط كل حقول is_inclusive الأخرى بالمشروع) — لا قيمة مستقلة حقيقية
      بنموذج بيانات الأداة لحقل "سعر شامل" منفصل عن unit_price نفسه.
    is_third_party/is_nominal/is_export/is_summary/self_billed — [حذف عمدي]
      بلا مفهوم مطابق بالأداة؛ المثال يعرضها false (أي قيمة قيود الافتراضية
      أصلًا) — عدم إرسالها يترك قيود يطبّق نفس الافتراض بلا أي فرق حقيقي.
 ============================================================================
*/
import { postResource } from './api.js';
import { buildVendorIndex, buildProductIndex } from './matching.js';
import { norm } from './text.js';

const RATE_LIMIT_MS = 300; // نفس التأخير المستخدم فعليًا بأدوات API الأخرى بالمشروع

function toIsoDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return null;
  return d.toISOString().slice(0, 10);
}

/** فهارس مبنية مرة واحدة لكل تشغيل إرسال — لا لكل فاتورة (نفس مبدأ buildVendorIndex بالتحقق) */
export function buildBillIndexes(catalog) {
  const vendorIdx = buildVendorIndex(catalog.vendors || []);
  const productIdx = buildProductIndex(catalog.products || []);
  const inventoryIdByName = new Map((catalog.inventoriesFull || []).map((i) => [norm(i.name), i.id]));
  const accountIdByName = new Map();
  (catalog.accounts || []).forEach((a) => {
    if (a.name && !accountIdByName.has(norm(a.name))) accountIdByName.set(norm(a.name), a.id);
    if (a.code && !accountIdByName.has(norm(a.code))) accountIdByName.set(norm(a.code), a.id);
  });
  const taxByName = new Map((catalog.taxes || []).map((t) => [norm(t.name), t]));
  return { vendorRefMap: vendorIdx.refMap, productSkuMap: productIdx.skuMap, inventoryIdByName, accountIdByName, taxByName };
}

/**
 * يبني حمولة POST /bills من مجموعة فاتورة واحدة (invoiceGroups بـexporter.js —
 * {ref, rows, bad}). يرجّع {ok:true, payload} أو {ok:false, error} — دالة نقية
 * بالكامل، بلا أي إرسال فعلي هنا (فصل البناء عن الإرسال، نفس نمط باقي المشروع).
 */
export function buildBillPayload(group, indexes) {
  if (!group || !group.rows || !group.rows.length) return { ok: false, error: 'فاتورة فارغة' };
  const header = group.rows[0];

  const vendor = indexes.vendorRefMap.get(norm(header.vendorRef));
  if (!vendor || vendor.id == null) {
    return { ok: false, error: `تعذّر تحديد معرّف المورد الحقيقي بقيود (المرجع: "${header.vendorRef || '—'}")` };
  }

  const issueDate = toIsoDate(header.issueDate);
  if (!issueDate) return { ok: false, error: `تعذّر قراءة تاريخ إصدار الفاتورة "${group.ref}"` };
  const dueDate = header.dueDate ? toIsoDate(header.dueDate) : issueDate;

  const invId = indexes.inventoryIdByName.get(norm(header.location));
  if (invId == null) return { ok: false, error: `تعذّر تحديد معرّف الموقع/المخزون الحقيقي بقيود ("${header.location || '—'}")` };

  const lineItems = [];
  for (const r of group.rows) {
    const product = indexes.productSkuMap.get(norm(r.prodSku));
    if (!product || product.id == null) {
      return { ok: false, error: `تعذّر تحديد معرّف المنتج الحقيقي بقيود لكود "${r.prodSku || '—'}" (الفاتورة "${group.ref}")` };
    }
    const qty = Number(r.qty);
    const price = Number(r.price);
    if (!(qty > 0) || isNaN(price) || price < 0) {
      return { ok: false, error: `كمية/سعر غير صالحين لكود المنتج "${r.prodSku}" (الفاتورة "${group.ref}")` };
    }
    const tax = indexes.taxByName.get(norm(r.taxName));
    if (!tax || tax.id == null) {
      return { ok: false, error: `تعذّر تحديد معرّف الضريبة الحقيقي بقيود ("${r.taxName || '—'}") لكود المنتج "${r.prodSku}"` };
    }
    if (r.discVal > 0) {
      return {
        ok: false,
        error: `خصم بالقيمة على بند "${r.prodSku}" غير مدعوم عبر الإرسال المباشر بـAPI حاليًا — استخدم نسبة الخصم بدلًا منه، أو نزّل ملف الاستيراد اليدوي لهذه الفاتورة.`,
      };
    }

    const item = {
      product_id: product.id,
      quantity: qty,
      unit_price: price,
      is_inclusive: !!r.taxIncl,
      inventory_id: invId,
      tax_id: tax.id,
      tax_percentage: String(tax.percent),
    };
    if (r.prodDesc) item.description = r.prodDesc;
    if (r.discPct > 0) { item.discount_percent = String(r.discPct); item.discount_type = '0'; }
    lineItems.push(item);
  }

  const bill = {
    contact_id: vendor.id,
    reference: group.ref,
    issue_date: issueDate,
    due_date: dueDate,
    status: 'Draft',
    inventory_id: invId,
    line_items: lineItems,
  };
  if (header.desc) bill.description = header.desc;
  if (header.notes) bill.notes = header.notes;
  if (header.terms) bill.terms_and_conditions = header.terms;

  if (header.docDiscVal > 0) {
    const accId = header.docDiscAcc ? indexes.accountIdByName.get(norm(header.docDiscAcc)) : undefined;
    if (accId == null) return { ok: false, error: `تعذّر تحديد معرّف حساب خصم المستند الحقيقي بقيود ("${header.docDiscAcc || '—'}") للفاتورة "${group.ref}"` };
    const taxDisc = header.docDiscTax ? indexes.taxByName.get(norm(header.docDiscTax)) : undefined;
    if (!taxDisc || taxDisc.id == null) return { ok: false, error: `تعذّر تحديد معرّف الفئة الضريبية لخصم المستند الحقيقي بقيود ("${header.docDiscTax || '—'}") للفاتورة "${group.ref}"` };
    bill.inclusive_cd_discount = header.docDiscVal;
    bill.discount_account_id = accId;
    bill.discount_tax_id = taxDisc.id;
    bill.discount_type = 'amount';
  }

  return { ok: true, payload: { bill } };
}

/**
 * يرسل مجموعات فواتير (invoiceGroups، بعد استبعاد bad) إلى Qoyod عبر API،
 * فاتورة كاملة في كل مرة — الفواتير مستقلة عن بعضها، فأي فشل بفاتورة واحدة لا
 * يوقف الباقي. قابل للإيقاف اليدوي فقط عبر stoppedRef.
 *
 * @param {Array} groups نفس شكل invoiceGroups({ref, rows, bad}) — bad تُستبعَد قبل الاستدعاء
 * @param {string} apiKey
 * @param {object} opts
 * @param {object} opts.catalog نفس eng.catalog — يُبنى منه buildBillIndexes مرة واحدة هنا
 * @param {string} [opts.baseUrl]
 * @param {string} [opts.proxy]
 * @param {(entry:{ref,status:'success'|'error',reason?,id?,total?,response?}) => void} [opts.onEntry]
 * @param {(current:number, total:number) => void} [opts.onProgress]
 * @param {{current:boolean}} [opts.stoppedRef]
 * @returns {Promise<{total:number, sent:number, failed:number, stoppedEarly:boolean, fatalError?:string, entries:Array}>}
 */
export async function pushBillsToQoyod(groups, apiKey, opts = {}) {
  const { catalog, baseUrl, proxy, onEntry, onProgress, stoppedRef } = opts;
  const entries = [];
  const emit = (entry) => { entries.push(entry); if (onEntry) onEntry(entry); };

  const key = (apiKey || '').trim();
  if (!key) return { total: 0, sent: 0, failed: 0, stoppedEarly: false, fatalError: 'أدخل مفتاح API أولاً', entries };
  if (!groups || !groups.length) return { total: 0, sent: 0, failed: 0, stoppedEarly: false, fatalError: 'لا توجد فواتير جاهزة للإرسال', entries };

  const indexes = buildBillIndexes(catalog || {});
  let sent = 0, failed = 0, stoppedEarly = false;

  for (let i = 0; i < groups.length; i++) {
    if (stoppedRef && stoppedRef.current) { stoppedEarly = true; break; }
    const group = groups[i];
    if (onProgress) onProgress(i, groups.length);

    const built = buildBillPayload(group, indexes);
    if (!built.ok) {
      failed++;
      emit({ ref: group.ref, status: 'error', reason: built.error });
    } else {
      try {
        const res = await postResource('bills', built.payload, { base: baseUrl, proxy, apiKey: key });
        const created = res && res.bill;
        if (created && created.id) {
          sent++;
          emit({ ref: group.ref, status: 'success', id: created.id, total: created.total, response: created });
        } else {
          failed++;
          emit({ ref: group.ref, status: 'error', reason: 'رد غير متوقع من Qoyod (بلا معرّف فاتورة)' });
        }
      } catch (e) {
        failed++;
        emit({ ref: group.ref, status: 'error', reason: e.message || String(e) });
      }
    }

    if (i < groups.length - 1) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  if (onProgress) onProgress(entries.length, groups.length);
  return { total: groups.length, sent, failed, stoppedEarly, entries };
}
