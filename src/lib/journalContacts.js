/*
 ============================================================================
  journalContacts — دليل العملاء/الموردين الموحَّد لأداة القيود
  ============================================================================
  [إصلاح جذري — بلاغ حقيقي 2026-10-08] كان للحقل نفسه (row.contact) معنيان
  متناقضان حسب مصدر القائمة:
   - جلب API: القائمة {name, ref: String(id)} => contact = المعرّف الداخلي.
   - رفع ملف العملاء/الموردين: {name, ref: الرقم المرجعي} => contact = الرقم المرجعي.
  والإرسال يعامل contact دائماً كمعرّف داخلي => كل رقم مرجعي يُرسَل كـcontact_id
  ويرفضه قيود: "Contact id 22010002 is not valid" (40 قيد من 40 بملف العميل).
  ورفع الملف كان يستبدل قائمة API كاملة بدل أن يُكمّلها.

  الحل: دليل واحد يدمج المصدرين بدل الاستبدال:
   - API: المعرّف الداخلي (id) + الاسم + الرقم الضريبي.
   - الملفات: الرقم المرجعي (trueRef) + الاسم (+ الرقم الضريبي لو موجود).
   - الربط بينهما: الرقم الضريبي أولاً، ثم الاسم المطبَّع حرفياً (بعد حذف
     بادئة "العميل"/"المورد" الشائعة بملفات العملاء) — تطابق وحيد فقط، بلا أي
     تخمين: اسم مكرر بقيود = لا ربط (التباس صريح عند الإرسال).
  واجهة قيود البرمجية لا توفّر الرقم المرجعي للعملاء/الموردين (موثَّق بأداتي
  استيراد العملاء/الموردين)، فالربط رقم مرجعي => معرّف لا يتم إلا عبر الملف.

  كل سجل بالدليل: { name, ref, trueRef, id, taxNumber, aliases }
   - ref: القيمة المعروضة بخانة "جهة اتصال" = الرقم المرجعي إن عُرف، وإلا id
     (توافق تام مع السلوك السابق لجلب API بلا ملف).
   - id: المعرّف الداخلي بقيود (غائب لسجل من الملف بلا عميل/مورد مطابق بالمنشأة).
 ============================================================================
*/

const ARABIC_INDIC = /[٠-٩۰-۹]/g;

export function toLatinDigits(value) {
  return String(value ?? "").replace(ARABIC_INDIC, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

// نفس تطبيع normalizeAccountName بـexcelCore.js حرفياً + حذف التطويل
export function normalizeContactText(value) {
  return toLatinDigits(value).trim().toLowerCase()
    .replace(/[ً-ْ]/g, "")
    .replace(/ـ/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

// اسم للمطابقة الحرفية: بلا بادئة "العميل"/"المورد" التي تكتبها ملفات العملاء
// قبل الاسم الفعلي (" العميل شركة فيلم ماستر  العربية ")
const ROLE_PREFIX_RE = /^(ال)?(عميل|مورد)\s+/;
export function contactNameKey(value) {
  return normalizeContactText(value).replace(ROLE_PREFIX_RE, "").trim();
}

export function normalizeTaxNumber(value) {
  const digits = toLatinDigits(value).replace(/\D/g, "");
  return digits.length === 15 ? digits : "";
}

function cleanRef(value) {
  return toLatinDigits(value).trim().replace(/\.0+$/, "");
}

/**
 * يدمج قائمة API (بمعرّفات) مع قائمة الملف (بأرقام مرجعية) بدليل واحد.
 * apiList: [{id, name, taxNumber?, ref?(رقم مرجعي لو وفّره API يوماً), linkedRef?}]
 * fileList: [{name, ref, taxNumber?}]
 */
export function mergeContactDirectory(apiList, fileList) {
  const records = [];
  const apiByTax = new Map();
  const apiByName = new Map();
  const apiByLinkedRef = new Map();
  (apiList || []).forEach((c) => {
    if (!c || c.id === undefined || c.id === null || String(c.id).trim() === "") return;
    const rec = {
      name: String(c.name || "").trim(),
      id: c.id,
      // linkedRef: رابط مؤكَّد مسبقاً (رقم مرجعي => هذا المعرّف) — من إنشاء جهة
      // ناقصة بالأداة، أو محفوظ من رفع سابق لنفس المنشأة — صالح بلا أي ملف
      trueRef: cleanRef(c.ref || c.linkedRef || ""),
      taxNumber: normalizeTaxNumber(c.taxNumber),
      aliases: [],
    };
    records.push(rec);
    if (rec.taxNumber) {
      if (!apiByTax.has(rec.taxNumber)) apiByTax.set(rec.taxNumber, []);
      apiByTax.get(rec.taxNumber).push(rec);
    }
    const key = contactNameKey(rec.name);
    if (key) {
      if (!apiByName.has(key)) apiByName.set(key, []);
      apiByName.get(key).push(rec);
    }
    const linked = cleanRef(c.linkedRef || "");
    if (linked) apiByLinkedRef.set(linked, rec);
  });

  (fileList || []).forEach((f) => {
    if (!f) return;
    const name = String(f.name || "").trim();
    const ref = cleanRef(f.ref);
    if (!name && !ref) return;
    const tax = normalizeTaxNumber(f.taxNumber);
    const key = contactNameKey(name);
    let candidates = (ref && apiByLinkedRef.has(ref)) ? [apiByLinkedRef.get(ref)] : [];
    if (!candidates.length && tax && apiByTax.has(tax)) candidates = apiByTax.get(tax);
    if (!candidates.length && key && apiByName.has(key)) candidates = apiByName.get(key);
    const free = candidates.filter((c) => !c.trueRef || c.trueRef === ref);
    if (free.length === 1) {
      const target = free[0];
      if (!target.trueRef) target.trueRef = ref;
      if (name && name !== target.name) target.aliases.push(name);
      if (!target.taxNumber && tax) target.taxNumber = tax;
      return;
    }
    records.push({
      name, id: undefined, trueRef: ref, taxNumber: tax, aliases: [],
      ambiguousIds: free.length > 1 ? free.map((c) => c.id) : undefined,
    });
  });

  return records.map((r) => ({ ...r, ref: r.trueRef || (r.id !== undefined ? String(r.id) : "") }));
}

/** فهارس الدليل — تُبنى مرة واحدة لكل تشغيل (لا لكل سطر) */
export function buildContactLookup(records) {
  const byRef = new Map(), byId = new Map(), byTax = new Map(), byName = new Map(), byFirstWord = new Map();
  const add = (map, k, rec) => { if (!k) return; if (!map.has(k)) map.set(k, []); if (!map.get(k).includes(rec)) map.get(k).push(rec); };
  (records || []).forEach((rec) => {
    add(byRef, rec.trueRef, rec);
    if (rec.id !== undefined && rec.id !== null) add(byId, String(rec.id), rec);
    add(byTax, rec.taxNumber, rec);
    [rec.name, ...(rec.aliases || [])].forEach((n) => {
      const key = contactNameKey(n);
      add(byName, key, rec);
      // فهرس البحث داخل جملة: اسم من كلمتين فأكثر فقط (اسم من كلمة واحدة
      // مثل "نقدي" قد يظهر بأي بيان عابر — لا يُعتمد عليه داخل جملة)
      const words = key.split(" ").filter(Boolean);
      if (words.length >= 2) {
        if (!byFirstWord.has(words[0])) byFirstWord.set(words[0], []);
        byFirstWord.get(words[0]).push({ key, rec });
      }
    });
  });
  return { byRef, byId, byTax, byName, byFirstWord, size: (records || []).length };
}

/**
 * [إضافة 2026-10-08] اسم عميل/مورد مذكور كاملاً داخل جملة بيان حرة ("دفعة من
 * العميل شركة لام للفعاليات قيمة الفاتورة 5") — كلمات الاسم كاملة متتالية
 * بحدود كلمات. أكثر من جهة مختلفة بنفس الجملة = لا شيء (لا تخمين)، إلا لو اسم
 * أحدها جزء من اسم الأخرى (يُعتمد الأطول).
 */
export function findContactNameInSentence(text, lookup) {
  if (!lookup || !lookup.byFirstWord) return null;
  const norm = normalizeContactText(text);
  if (!norm) return null;
  const padded = ` ${norm} `;
  const hits = [];
  new Set(norm.split(" ")).forEach((w) => {
    (lookup.byFirstWord.get(w) || []).forEach(({ key, rec }) => {
      if (padded.includes(` ${key} `)) hits.push({ key, rec });
    });
  });
  if (!hits.length) return null;
  const maximal = hits.filter((h) => !hits.some((o) => o.key !== h.key && o.key.includes(h.key)));
  const recs = new Set(maximal.map((h) => h.rec));
  return recs.size === 1 ? [...recs][0] : null;
}

function single(list) {
  return list && list.length === 1 ? list[0] : null;
}

/**
 * يطابق قيمة خانة "جهة اتصال" (رقم مرجعي، أو معرّف، أو رقم ضريبي، أو اسم)
 * بسجل واحد بالدليل. الرقم المرجعي أولاً (هو ما يكتبه المستخدم وما بملفات
 * العميل)، ثم المعرّف الداخلي. تعارض بين الاثنين لسجلين مختلفين = التباس صريح.
 * يرجّع { ok:true, record } أو { ok:false, reason: 'not_found'|'ambiguous', candidates? }
 */
export function lookupContact(value, lookup) {
  const raw = cleanRef(value);
  if (!raw || !lookup) return { ok: false, reason: "not_found" };
  const viaRef = lookup.byRef.get(raw) || [];
  const viaId = lookup.byId.get(raw) || [];
  if (viaRef.length > 1) return { ok: false, reason: "ambiguous", candidates: viaRef };
  if (viaRef.length === 1) {
    if (viaId.length && viaId.some((r) => r !== viaRef[0])) return { ok: false, reason: "ambiguous", candidates: [viaRef[0], ...viaId] };
    return { ok: true, record: viaRef[0] };
  }
  if (viaId.length === 1) return { ok: true, record: viaId[0] };
  const tax = normalizeTaxNumber(raw);
  if (tax) {
    const viaTax = lookup.byTax.get(tax) || [];
    if (viaTax.length === 1) return { ok: true, record: viaTax[0] };
    if (viaTax.length > 1) return { ok: false, reason: "ambiguous", candidates: viaTax };
  }
  const viaName = lookup.byName.get(contactNameKey(raw)) || [];
  if (viaName.length === 1) return { ok: true, record: viaName[0] };
  if (viaName.length > 1) return { ok: false, reason: "ambiguous", candidates: viaName };
  return { ok: false, reason: "not_found" };
}

/**
 * يبحث عن عميل/مورد مذكور داخل نص حر (البيان/التعليق/عمود الجهة):
 *  1) أي رقم بالنص (4 خانات فأكثر) يطابق رقماً مرجعياً أو رقماً ضريبياً
 *     (أو معرّفاً داخلياً لو allowId — فقط لأعمدة الجهة الصريحة، لا للنص الحر).
 *  2) النص كاملاً = اسم عميل/مورد (بعد التطبيع وحذف بادئة العميل/المورد).
 * مطابقة وحيدة فقط — أكثر من عميل/مورد بنفس النص = لا شيء (لا تخمين).
 */
export function findContactInText(text, lookup, { allowId = false } = {}) {
  const raw = toLatinDigits(text).trim();
  if (!raw || !lookup || !lookup.size) return null;
  const found = new Set();
  const tokens = raw.match(/\d{4,}/g) || [];
  tokens.forEach((tok) => {
    (lookup.byRef.get(tok) || []).forEach((r) => found.add(r));
    const tax = normalizeTaxNumber(tok);
    if (tax) (lookup.byTax.get(tax) || []).forEach((r) => found.add(r));
  });
  if (!found.size && allowId && /^\d+$/.test(raw)) (lookup.byId.get(raw) || []).forEach((r) => found.add(r));
  if (found.size === 1) return [...found][0];
  if (found.size > 1) return null;
  return single(lookup.byName.get(contactNameKey(raw))) || findContactNameInSentence(raw, lookup);
}

/** أرقام بالنص (4 خانات فأكثر) لا تطابق أي رقم مرجعي/ضريبي/معرّف معروف — لتنبيه
 *  "الملف يكتب الجهات بأرقامها المرجعية" (لا تُرجعها واجهة قيود البرمجية) */
export function unknownNumericTokens(text, lookup) {
  const raw = toLatinDigits(text);
  return (raw.match(/\d{4,}/g) || []).filter((tok) => !(lookup && (lookup.byRef.has(tok) || lookup.byId.has(tok) || lookup.byTax.has(normalizeTaxNumber(tok)))));
}

/**
 * المعرّف الداخلي الحقيقي لسطر مدينون/دائنون عند الإرسال.
 * يرجّع { ok:true, id } أو { ok:false, error }
 */
export function resolveContactIdForRow(row, lookup, kindLabel) {
  const value = String(row.contact ?? "").trim();
  if (!value) return { ok: true, id: undefined };
  if (row._contactId !== undefined && row._contactId !== null && row._autoRef && row._contactValue === value) {
    return { ok: true, id: row._contactId };
  }
  const hit = lookupContact(value, lookup);
  if (hit.ok) {
    if (hit.record.id === undefined || hit.record.id === null) {
      return {
        ok: false,
        reason: "not_in_company",
        record: hit.record,
        error: `${kindLabel} "${hit.record.name || value}" (الرقم المرجعي ${hit.record.trueRef || value}) غير موجود فعلياً بمنشأة العميل — أنشئه أولاً (لوحة الكيانات الناقصة) ثم أعد الإرسال`,
      };
    }
    return { ok: true, id: hit.record.id, record: hit.record };
  }
  if (hit.reason === "ambiguous") {
    const names = (hit.candidates || []).map((c) => c.name).filter(Boolean).slice(0, 3).join("، ");
    return { ok: false, reason: "ambiguous", error: `${kindLabel} "${value}" يطابق أكثر من جهة (${names}) — حدّده بدقة` };
  }
  return { ok: false, reason: "not_found", error: `${kindLabel} "${value}" غير موجود لا بملف ${kindLabel === "العميل" ? "العملاء" : "الموردين"} ولا بمنشأة العميل` };
}

/*
 * [إضافة 2026-10-08 — طلب المستخدم: "الجلب عبر API وحده يكفي"] واجهة قيود لا
 * تُرجع الرقم المرجعي، فربط رقم مرجعي => معرّف يحتاج ملف الجهات مرة واحدة. بعدها
 * تحفظ الأداة الربط محلياً لكل منشأة (مفتاحه بصمة غير قابلة للعكس من مفتاح API)،
 * فملفات السنوات التالية لنفس المنشأة تُطابَق بالجلب وحده بلا أي ملف.
 */
const STORE_PREFIX = "qoyod-journal-contact-refs:";

export function companyStoreKey(apiKey) {
  const k = String(apiKey || "").trim();
  if (!k) return "";
  let h = 5381;
  for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) >>> 0;
  return `${STORE_PREFIX}${h.toString(36)}${k.length}`;
}

/** الروابط المؤكَّدة فقط (معرّف حقيقي + رقم مرجعي) من دليل مدمج */
export function extractLinkedRefs(records) {
  return (records || [])
    .filter((r) => r.id !== undefined && r.id !== null && r.trueRef)
    .map((r) => ({ id: r.id, ref: r.trueRef, name: r.name }));
}

/** يدمج روابط محفوظة بقائمة API (بالمعرّف الداخلي — لا يعتمد على الاسم) */
export function applyStoredRefs(apiList, stored) {
  if (!apiList || !stored || !stored.length) return apiList;
  const byId = new Map(stored.map((s) => [String(s.id), s.ref]));
  return apiList.map((c) => (!c.ref && !c.linkedRef && byId.has(String(c.id)) ? { ...c, linkedRef: byId.get(String(c.id)) } : c));
}

export function loadStoredContactRefs(apiKey, storage = globalThis.localStorage) {
  const key = companyStoreKey(apiKey);
  if (!key || !storage) return { customers: [], suppliers: [] };
  try {
    const parsed = JSON.parse(storage.getItem(key) || "null");
    return { customers: parsed?.customers || [], suppliers: parsed?.suppliers || [] };
  } catch {
    return { customers: [], suppliers: [] };
  }
}

/** يحفظ الروابط بالدمج مع المحفوظ سابقاً (رابط جديد لنفس الرقم المرجعي يستبدل القديم) */
export function saveStoredContactRefs(apiKey, { customers = [], suppliers = [] }, storage = globalThis.localStorage) {
  const key = companyStoreKey(apiKey);
  if (!key || !storage) return false;
  const prev = loadStoredContactRefs(apiKey, storage);
  const mergeList = (a, b) => {
    const m = new Map(a.map((x) => [x.ref, x]));
    b.forEach((x) => m.set(x.ref, x));
    return [...m.values()];
  };
  const next = { customers: mergeList(prev.customers, customers), suppliers: mergeList(prev.suppliers, suppliers), savedAt: new Date().toISOString() };
  try { storage.setItem(key, JSON.stringify(next)); return true; } catch { return false; }
}
