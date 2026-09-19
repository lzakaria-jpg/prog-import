/*
 ============================================================================
  JournalMissingEntitiesPanel — لوحة مراجعة الكيانات الناقصة (حساب/عميل/
  مورد/موقع) المُرصَدة قبل إرسال القيود عبر API — طلب صريح من المستخدم
  2026-09-21: "نفس نمط فواتير المبيعات بالضبط". مكوّن عرض بحت (presentational):
  لا يستدعي أي شبكة هنا — يجمع اختيار المستخدم فقط ويستدعي onConfirm(selections)
  بالشكل الذي تتوقعه pushMissingJournalEntitiesToQoyod (qoyodJournalEntityCreate.js)
  حرفيًا؛ JournalTool.jsx نفسه يملك استدعاء الشبكة والدمج بعدها (نفس تقسيم
  الأدوار المعتمَد فعلاً بـApiSendResultsModal بهذا الملف).

  المشاريع (plan.projects): رصد فقط، بلا أي خيار إنشاء — Qoyod لا يوفّر
  POST /projects إطلاقًا (فقط GET) بمواصفته الرسمية، فإنشاء مشروع عبر API غير
  ممكن فعليًا. تُعرَض بوضوح مع تعليمة صريحة: إنشاؤه يدويًا من واجهة قيود ثم
  الضغط على "تحديث بيانات المنشأة" لإعادة الجلب.
 ============================================================================
*/
import { useMemo, useState } from "react";
import { Loader2, X, AlertTriangle } from "lucide-react";
import { useLanguage } from "./language";
import { COLORS } from "./lib/journalColors.js";
import { LEVEL2_TO_LEVEL1, LEVEL3_MAP } from "./MergeTool.jsx";
import { classifyMissingAccount, buildCodeCategoryHints } from "./lib/accountsClassifier.js";

const LEVEL2_CATEGORIES = Object.keys(LEVEL2_TO_LEVEL1);
const LEVEL1_ROOTS = Array.from(new Set(Object.values(LEVEL2_TO_LEVEL1)));

// [إضافة] طلب المستخدم الصريح: نفس آلية التصنيف التلقائي المعتمَدة فعليًا بأداة
// استيراد شجرة الحسابات (AccountsTool.jsx → accountsClassifier.js)، مع تحسين
// إضافي طلبه صراحةً بجولة لاحقة: "رمز الحساب مهم جدًا بتحديد نوع الحساب بعد
// جلب شجرة حسابات العميل" — classifyMissingAccount تستنتج فئة الحساب (مستوى2)
// من رمزه أولاً (بمطابقته فعليًا بشجرة حسابات العميل المجلوبة عبر
// buildCodeCategoryHints — لا افتراض ترقيم قياسي ثابت)، ثم تطابق الاسم ضمنها.
// الحساب يبقى قابلاً للتعديل يدويًا دومًا (checked/level2Category/type كلها
// حقول قابلة للتغيير بالنموذج أدناه) — هذا فقط اقتراح ابتدائي.
function buildInitialAccountsState(accounts, codeCategoryHints) {
  const out = {};
  (accounts || []).forEach((a) => {
    const nameAr = a.nameFromFile || a.code;
    const { type, level2Category } = classifyMissingAccount(nameAr, a.code, codeCategoryHints);
    // [إصلاح خطأ حقيقي شهده المستخدم] الاسم الإنجليزي حقل مطلوب فعليًا بـQoyod
    // (buildQoyodAccountPayload يرفض إنشاء الحساب لو فارغًا) — تركه فارغًا افتراضيًا
    // كان يعني رفض كل حساب لم يكتب المستخدم اسمه الإنجليزي يدويًا بنفسه. الآن
    // يتكرر الاسم العربي كقيمة افتراضية للإنجليزي (قابلة للتعديل بالطبع)، تمامًا
    // كما طلب المستخدم: "وان لم يجد الانجليزي فكرره كما هو بالعربي".
    out[a.code] = { checked: true, nameAr, nameEn: nameAr, level2Category, type };
  });
  return out;
}
function buildInitialContactsState(items) {
  const out = {};
  (items || []).forEach((it) => { out[it.typedName] = { checked: true, name: it.typedName }; });
  return out;
}
function buildInitialLocationsState(locations) {
  const out = {};
  (locations || []).forEach((loc) => {
    out[loc.typedName] = { checked: true, name: loc.typedName, accountCode: "", accountNameAr: `مخزون - ${loc.typedName}` };
  });
  return out;
}

const inputCls = "w-full rounded-md border px-2 py-1.5 text-xs";
const inputStyle = { borderColor: COLORS.line };
// [إصلاح خطأ حقيقي شهده المستخدم] عناصر <select> بكامل التطبيق داكنة الخلفية
// عمداً (راجع "select { color-scheme: dark; }" بـindex.css) — كل قائمة منسدلة
// أخرى بالتطبيق تُحدِّد ألوانها الخاصة صراحةً (خلفية داكنة + نص فاتح متباين)
// بدل الاعتماد على تنسيق المتصفح الافتراضي لهذا الوضع. القائمتان هنا (الفئة/
// النوع) كانتا تستخدمان inputStyle نفسه (حدّ فقط، بلا خلفية/لون) فتظهران داكنتين
// بنص غير واضح — نفس تنسيق باقي قوائم التطبيق المنسدلة (مثال: JournalTool.jsx
// قائمة exportSort) يُطبَّق هنا الآن لنفس السبب.
const selectStyle = { borderColor: "#233152", background: "#0E1830", color: "#E6EDF6" };

function Section({ title, count, children }) {
  if (!count) return null;
  return (
    <div className="mb-4">
      <h4 className="mb-2 text-xs font-bold" style={{ color: COLORS.ink }}>{title} <span style={{ color: "#94A3B8" }}>({count})</span></h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export default function JournalMissingEntitiesPanel({ plan, chartAccounts, busy, progress, result, onConfirm, onClose }) {
  const { t } = useLanguage();
  // [إضافة] فهرس {رمز: فئة/جذر} من شجرة حسابات العميل الفعلية — يُبنى مرة واحدة
  // فقط عند فتح اللوحة (شجرة العميل لا تتغيّر أثناء عرضها)، يُستخدَم لتصنيف كل
  // حساب ناقص أدناه اعتمادًا على رمزه لا اسمه فقط — راجع تعليق classifyMissingAccount.
  const codeCategoryHints = useMemo(() => buildCodeCategoryHints(chartAccounts), [chartAccounts]);
  const [accountsState, setAccountsState] = useState(() => buildInitialAccountsState(plan.accounts, codeCategoryHints));
  const [customersState, setCustomersState] = useState(() => buildInitialContactsState(plan.customers));
  const [vendorsState, setVendorsState] = useState(() => buildInitialContactsState(plan.vendors));
  const [locationsState, setLocationsState] = useState(() => buildInitialLocationsState(plan.locations));
  const [validationError, setValidationError] = useState("");

  const patchAccount = (code, patch) => setAccountsState((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
  const patchContact = (setter, key, patch) => setter((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const patchLocation = (key, patch) => setLocationsState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const checkedAccountsCount = useMemo(() => Object.values(accountsState).filter((a) => a.checked).length, [accountsState]);
  const checkedCustomersCount = useMemo(() => Object.values(customersState).filter((c) => c.checked).length, [customersState]);
  const checkedVendorsCount = useMemo(() => Object.values(vendorsState).filter((v) => v.checked).length, [vendorsState]);
  const checkedLocationsCount = useMemo(() => Object.values(locationsState).filter((l) => l.checked).length, [locationsState]);
  const totalToCreate = checkedAccountsCount + checkedCustomersCount + checkedVendorsCount + checkedLocationsCount;

  const handleConfirm = () => {
    setValidationError("");
    const accounts = [];
    for (const a of plan.accounts) {
      const s = accountsState[a.code];
      if (!s || !s.checked) continue;
      if (!s.nameAr.trim()) return setValidationError(t({ ar: `اسم الحساب "${a.code}" فارغ`, en: `Account "${a.code}" name is empty` }));
      if (!s.level2Category || !s.type) return setValidationError(t({ ar: `اختر فئة ونوع الحساب "${a.code}" أولاً`, en: `Choose a category and type for account "${a.code}" first` }));
      accounts.push({ key: a.code, code: a.code, nameAr: s.nameAr.trim(), nameEn: s.nameEn.trim(), level2Category: s.level2Category, type: s.type });
    }
    const customers = plan.customers.filter((c) => customersState[c.typedName]?.checked)
      .map((c) => ({ key: c.typedName, name: customersState[c.typedName].name.trim() || c.typedName }));
    const vendors = plan.vendors.filter((v) => vendorsState[v.typedName]?.checked)
      .map((v) => ({ key: v.typedName, name: vendorsState[v.typedName].name.trim() || v.typedName }));
    const locations = [];
    for (const loc of plan.locations) {
      const s = locationsState[loc.typedName];
      if (!s || !s.checked) continue;
      if (!s.accountCode.trim()) return setValidationError(t({ ar: `أدخل رمز حساب المخزون الجديد للموقع "${loc.typedName}"`, en: `Enter a new inventory account code for location "${loc.typedName}"` }));
      locations.push({
        key: loc.typedName, name: s.name.trim() || loc.typedName,
        accountCode: s.accountCode.trim(), accountNameAr: s.accountNameAr.trim() || `مخزون - ${loc.typedName}`,
      });
    }
    onConfirm({ accounts, customers, vendors, locations });
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: COLORS.line }}>
          <h3 className="text-sm font-bold" style={{ color: COLORS.ink }}>
            {t({ ar: "كيانات ناقصة بمنشأة العميل — أنشئها قبل الإرسال", en: "Missing entities in the client's company — create them before sending" })}
          </h3>
          {!busy && <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>}
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {!result && (
            <p className="mb-4 text-xs" style={{ color: "#64748B" }}>
              {t({
                ar: "الحسابات/العملاء/الموردون التالية مذكورة بملف القيود ولا وجود لها فعلياً بمنشأة العميل — راجع كل عنصر وعدّل ما تحتاج قبل الإنشاء الفعلي عبر API. أزل التأشير عن أي عنصر لا تريد إنشاءه (مثال: كان خطأ إملائي بالكود/الاسم — صحّحه بالقيد نفسه بدلاً من إنشاء كيان جديد).",
                en: "The accounts/customers/vendors below are referenced in the entries file but don't actually exist in the client's company yet — review and edit each before creating them via API. Uncheck anything you don't want created (e.g. it was a typo in the code/name — fix it in the entry itself instead).",
              })}
            </p>
          )}

          {!result && (
            <>
              <Section title={t({ ar: "حسابات ناقصة", en: "Missing accounts" })} count={plan.accounts.length}>
                {plan.accounts.map((a) => {
                  const s = accountsState[a.code];
                  const typeOptions = s.level2Category ? (LEVEL3_MAP[s.level2Category] || []) : [];
                  return (
                    <div key={a.code} className="rounded-md border p-2.5" style={{ borderColor: COLORS.line }}>
                      <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold">
                        <input type="checkbox" checked={s.checked} onChange={(e) => patchAccount(a.code, { checked: e.target.checked })} />
                        {t({ ar: `الرمز ${a.code}`, en: `Code ${a.code}` })}
                      </label>
                      {s.checked && (
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                          <input className={inputCls} style={inputStyle} value={s.nameAr} placeholder={t({ ar: "الاسم (عربي) *", en: "Name (Arabic) *" })}
                            onChange={(e) => patchAccount(a.code, { nameAr: e.target.value })} />
                          <input className={inputCls} style={inputStyle} value={s.nameEn} placeholder={t({ ar: "الاسم (إنجليزي)", en: "Name (English)" })}
                            onChange={(e) => patchAccount(a.code, { nameEn: e.target.value })} />
                          <select className={inputCls} style={selectStyle} value={s.level2Category}
                            onChange={(e) => patchAccount(a.code, { level2Category: e.target.value, type: "" })}>
                            <option value="">{t({ ar: "— الفئة * —", en: "— Category * —" })}</option>
                            {LEVEL1_ROOTS.map((root) => (
                              <optgroup key={root} label={root}>
                                {LEVEL2_CATEGORIES.filter((c) => LEVEL2_TO_LEVEL1[c] === root).map((c) => <option key={c} value={c}>{c}</option>)}
                              </optgroup>
                            ))}
                          </select>
                          <select className={inputCls} style={selectStyle} value={s.type} disabled={!s.level2Category}
                            onChange={(e) => patchAccount(a.code, { type: e.target.value })}>
                            <option value="">{t({ ar: "— النوع * —", en: "— Type * —" })}</option>
                            {typeOptions.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </Section>

              <Section title={t({ ar: "عملاء ناقصون", en: "Missing customers" })} count={plan.customers.length}>
                {plan.customers.map((c) => {
                  const s = customersState[c.typedName];
                  return (
                    <div key={c.typedName} className="flex items-center gap-2 rounded-md border p-2.5" style={{ borderColor: COLORS.line }}>
                      <input type="checkbox" checked={s.checked} onChange={(e) => patchContact(setCustomersState, c.typedName, { checked: e.target.checked })} />
                      <input className={inputCls} style={inputStyle} value={s.name} disabled={!s.checked}
                        onChange={(e) => patchContact(setCustomersState, c.typedName, { name: e.target.value })} />
                    </div>
                  );
                })}
              </Section>

              <Section title={t({ ar: "موردون ناقصون", en: "Missing vendors" })} count={plan.vendors.length}>
                {plan.vendors.map((v) => {
                  const s = vendorsState[v.typedName];
                  return (
                    <div key={v.typedName} className="flex items-center gap-2 rounded-md border p-2.5" style={{ borderColor: COLORS.line }}>
                      <input type="checkbox" checked={s.checked} onChange={(e) => patchContact(setVendorsState, v.typedName, { checked: e.target.checked })} />
                      <input className={inputCls} style={inputStyle} value={s.name} disabled={!s.checked}
                        onChange={(e) => patchContact(setVendorsState, v.typedName, { name: e.target.value })} />
                    </div>
                  );
                })}
              </Section>

              <Section title={t({ ar: "مواقع ناقصة (مع حساب مخزون مخصَّص لكل موقع)", en: "Missing locations (each with its own dedicated inventory account)" })} count={plan.locations.length}>
                {plan.locations.map((loc) => {
                  const s = locationsState[loc.typedName];
                  return (
                    <div key={loc.typedName} className="rounded-md border p-2.5" style={{ borderColor: COLORS.line }}>
                      <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold">
                        <input type="checkbox" checked={s.checked} onChange={(e) => patchLocation(loc.typedName, { checked: e.target.checked })} />
                        {loc.typedName}
                      </label>
                      {s.checked && (
                        <div className="grid grid-cols-2 gap-2">
                          <input className={inputCls} style={inputStyle} value={s.accountCode} placeholder={t({ ar: "رمز حساب المخزون الجديد *", en: "New inventory account code *" })}
                            onChange={(e) => patchLocation(loc.typedName, { accountCode: e.target.value })} />
                          <input className={inputCls} style={inputStyle} value={s.accountNameAr} placeholder={t({ ar: "اسم حساب المخزون الجديد", en: "New inventory account name" })}
                            onChange={(e) => patchLocation(loc.typedName, { accountNameAr: e.target.value })} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </Section>

              {plan.projects.length > 0 && (
                <div className="mb-2 rounded-md border p-3" style={{ borderColor: COLORS.gold, background: "rgba(251,191,36,0.08)" }}>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold" style={{ color: "#92400E" }}>
                    <AlertTriangle size={14} /> {t({ ar: `مشاريع ناقصة (${plan.projects.length}) — لا يمكن إنشاؤها آلياً`, en: `Missing projects (${plan.projects.length}) — cannot be auto-created` })}
                  </p>
                  <p className="mb-2 text-[11px]" style={{ color: "#78350F" }}>
                    {t({
                      ar: "واجهة قيود البرمجية لا توفّر إنشاء مشروع جديد إطلاقاً (تتيح فقط عرض المشاريع الموجودة). أنشئ المشروع يدوياً من واجهة قيود، ثم اضغط \"تحديث بيانات المنشأة\" أعلاه لإعادة الجلب قبل إعادة المحاولة.",
                      en: "Qoyod's API has no endpoint to create a new project (only listing existing ones). Create the project manually from Qoyod's own interface, then click \"Refresh company data\" above to re-fetch before retrying.",
                    })}
                  </p>
                  <ul className="space-y-1 text-[11px]" style={{ color: "#78350F" }}>
                    {plan.projects.map((p) => (
                      <li key={p.typedName}>• {p.typedName}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validationError && (
                <div className="mt-2 rounded-md border px-3 py-2 text-xs" style={{ borderColor: COLORS.red, background: "rgba(220,38,38,0.08)", color: COLORS.red }}>
                  ⛔ {validationError}
                </div>
              )}
            </>
          )}

          {busy && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={28} className="animate-spin" style={{ color: COLORS.teal }} />
              <p className="text-xs" style={{ color: "#64748B" }}>
                {t({ ar: `جارٍ الإنشاء: ${progress.current} من ${progress.total}`, en: `Creating: ${progress.current} of ${progress.total}` })}
              </p>
            </div>
          )}

          {result && !busy && (
            <div>
              {result.fatalError && (
                <div className="mb-3 rounded-md border px-3 py-2 text-xs" style={{ borderColor: COLORS.red, background: "rgba(220,38,38,0.08)", color: COLORS.red }}>
                  ⛔ {result.fatalError}
                </div>
              )}
              {[
                { key: "accounts", label: t({ ar: "الحسابات", en: "Accounts" }) },
                { key: "customers", label: t({ ar: "العملاء", en: "Customers" }) },
                { key: "vendors", label: t({ ar: "الموردون", en: "Vendors" }) },
                { key: "locations", label: t({ ar: "المواقع", en: "Locations" }) },
              ].filter((s) => (result.report[s.key] || []).length > 0).map((s) => (
                <div key={s.key} className="mb-3">
                  <h4 className="mb-1.5 text-xs font-bold" style={{ color: COLORS.ink }}>{s.label}</h4>
                  <div className="max-h-40 overflow-auto rounded-md border" style={{ borderColor: COLORS.line }}>
                    {result.report[s.key].map((e, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 border-b px-2.5 py-1.5 text-xs last:border-b-0" style={{ borderColor: COLORS.line }}>
                        <span>{e.name || e.code}</span>
                        <span style={{ color: e.status === "success" ? COLORS.green : COLORS.red }}>
                          {e.status === "success" ? t({ ar: "أُنشئ ✓", en: "Created ✓" }) : (e.reason || t({ ar: "فشل", en: "Failed" }))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-5 py-3.5" style={{ borderColor: COLORS.line }}>
          {!result ? (
            <>
              <button onClick={onClose} disabled={busy} className="rounded-md border px-4 py-2 text-xs font-semibold disabled:opacity-50" style={{ borderColor: COLORS.line, color: "#64748B" }}>
                {t({ ar: "إلغاء (سأصلحها يدوياً)", en: "Cancel (I'll fix it manually)" })}
              </button>
              <button onClick={handleConfirm} disabled={busy || totalToCreate === 0}
                className="rounded-md px-5 py-2 text-xs font-semibold text-white disabled:opacity-50" style={{ background: COLORS.teal }}>
                {busy
                  ? t({ ar: "جارٍ الإنشاء...", en: "Creating..." })
                  : t({ ar: `إنشاء ${totalToCreate} كيان محدَّد عبر API`, en: `Create ${totalToCreate} selected item(s) via API` })}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="mr-auto w-full rounded-md px-4 py-2 text-xs font-semibold text-white" style={{ background: COLORS.teal }}>
              {t({ ar: "تم — إعادة فحص القيود", en: "Done — re-check entries" })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
