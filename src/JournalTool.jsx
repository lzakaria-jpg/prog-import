import React, { useState, useMemo, useRef, useCallback, useEffect, memo } from "react";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Loader2,
  Download, ChevronDown, ChevronUp, Info, RefreshCcw, Copy,
  ChevronLeft, ChevronRight, Search, X,
} from "lucide-react";
import { readWorkbookRows, readAnyEntriesFileRows, parseChartFile, parseEntriesFile, buildParentInfo, parseAmount, validateEntryStructure, getPostingSuggestions, getPostingDescendants, normalizeDateGuess, guessEntriesColumnMapping, parseEntriesFileWithMapping, parseNameRefFile, applyAutoContactRules, findSystemAccountCodes, VAT_PAYABLE_ACCOUNT_NAME, DEBTORS_ACCOUNT_NAME, CREDITORS_ACCOUNT_NAME, _parseDebug } from "./lib/excelCore";
import { buildImportFile, downloadBlob, buildPasteText } from "./lib/excelExport";
import { SafeInput } from "./lib/SafeInput";
import { useLanguage } from "./language";
import { useAuth } from "./auth";
import { trackJournalImport, trackJournalExport, trackJournalError } from "./activityTracker";

const COLORS = {
  paper: "#F1F5F9", ink: "#0F172A", teal: "#12B886", tealLight: "#15803D",
  gold: "#FBBF24", amber: "#FBBF24", red: "#DC2626", green: "#15803D", line: "#E2E8F0",
};

const PAGE_SIZE = 50;

// فحص جودة بسيط بعد التعرّف الآلي: لو القيود "نجحت" بالمعنى الفني (عدد أكبر
// من صفر) لكن أغلب أهم حقولها (الرمز/التاريخ/الوصف) فارغة تمامًا، فهذا يعني
// عمليًا فشل تعرّف على عمود لم يُكتشَف بصمت — نفس الخطأ الجوهري الذي شهده
// المستخدم فعليًا (كل الحسابات "—"، كل التواريخ "بدون تاريخ"). حدّي 30%/50%
// مقصودان يتيحان تسامحاً مع فراغات حقيقية متفرقة بالملف دون تفويت حالة فشل
// تعرّف كامل كهذه.
function assessEntriesQuality(grouped) {
  const totalRows = grouped.reduce((s, e) => s + e.rows.length, 0);
  if (totalRows === 0 || grouped.length === 0) return { ok: false, totalRows, totalEntries: grouped.length };
  const missingCode = grouped.reduce((s, e) => s + e.rows.filter((r) => !r.code).length, 0);
  const missingDate = grouped.filter((e) => !e.date).length;
  const missingDesc = grouped.filter((e) => !e.desc).length;
  const ok = missingCode / totalRows <= 0.3 && missingDate / grouped.length <= 0.5 && missingDesc / grouped.length <= 0.5;
  return { ok, totalRows, totalEntries: grouped.length, missingCode, missingDate, missingDesc };
}

function localizeError(msg, lang) {
  if (lang !== "en") return msg;
  return msg
    .replace("خطأ في قراءة ملف شجرة الحسابات: ", "Chart of accounts read error: ")
    .replace("خطأ في قراءة ملف القيود: ", "Journal entries read error: ")
    .replace("تم التعرف على تنسيق الملف لكن لم يتم العثور على أي قيود بداخله", "File format was recognized, but no journal entries were found inside it")
    .replace("تعذر إنشاء الملف: ", "Could not generate file: ");
}

function UploadCard({ title, subtitle, fileName, ok, count, onFile, busy, accept }) {
  const { t } = useLanguage();
  const inputRef = useRef(null);
  return (
    <div
      className="upload-zone rounded-lg border-2 border-dashed p-4 text-center transition cursor-pointer"
      style={{ borderColor: ok ? COLORS.green : COLORS.line, background: "#FFFFFF" }}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept={accept || ".xlsx,.xls"} className="hidden"
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      <div className="flex flex-col items-center gap-1">
        {busy ? <Loader2 size={26} className="animate-spin" style={{ color: COLORS.teal }} />
          : ok ? <CheckCircle2 size={26} style={{ color: COLORS.green }} /> : <Upload size={26} style={{ color: COLORS.teal }} />}
        <p className="text-sm font-semibold">{t(title)}</p>
        <p className="text-xs" style={{ color: "#64748B" }}>{t(subtitle)}</p>
        {fileName && (
          <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: COLORS.tealLight }}>
            <FileSpreadsheet size={12} /> {fileName} {count && `— ${count}`}
          </p>
        )}
      </div>
    </div>
  );
}

// [ميزة جديدة] لوحة "تحديد الأعمدة يدويًا": يختار المستخدم صف الرأس بنفسه، ثم
// لكل حقل منطقي (تسلسل القيد، التاريخ، الرمز...) عمود من أعمدة الملف الفعلية
// — كل خيار بالقائمة يعرض حرف/رقم العمود + نص خليته بصف الرأس المُختار + معاينة
// أول قيمة بيانات حقيقية تحته، حتى يتأكد المستخدم بصريًا قبل التطبيق بدل التخمين.
const MAPPER_FIELDS = [
  { key: "seq", ar: "تسلسل القيد", en: "Entry Sequence", required: false },
  { key: "date", ar: "التاريخ", en: "Date", required: false },
  { key: "desc", ar: "الوصف", en: "Description", required: false },
  { key: "code", ar: "رمز الحساب", en: "Account Code", required: true },
  { key: "debit", ar: "مدين", en: "Debit", required: true },
  { key: "credit", ar: "دائن", en: "Credit", required: true },
  { key: "comment", ar: "تعليق", en: "Comment", required: false },
];

function columnLetter(idx) {
  let s = "", n = idx;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

function ColumnMapperPanel({ rows, mapping, onChange, onApply, onCancel }) {
  const { t } = useLanguage();
  const headerRowIndex = mapping.headerRowIndex ?? 0;
  const headerRow = rows[headerRowIndex] || [];
  const previewRow = rows.slice(headerRowIndex + 1).find((r) => Array.isArray(r) && r.some((c) => c !== null && c !== "")) || [];
  const colCount = Math.max(headerRow.length, previewRow.length, 1);
  const colOptions = Array.from({ length: colCount }, (_, i) => i);
  return (
    <div className="mb-6 rounded-lg border-2 p-4" style={{ borderColor: COLORS.gold, background: "#FFFBEB" }}>
      <div className="mb-3 flex items-start gap-2">
        <Info size={16} className="mt-0.5 shrink-0" style={{ color: "#B98227" }} />
        <div className="text-sm font-semibold" style={{ color: "#78350F" }}>
          {t({ ar: "تحديد أعمدة ملف القيود يدويًا", en: "Manually map journal entry columns" })}
        </div>
      </div>
      <p className="mb-3 text-xs leading-relaxed" style={{ color: "#78350F" }}>
        {t({
          ar: "التعرّف الآلي على أعمدة هذا الملف لم يكن موثوقًا كفاية (رمز/تاريخ/وصف فارغة لأغلب القيود). اختر صف الرأس، ثم عيّن كل حقل من العمود الصحيح بالملف يدويًا.",
          en: "Automatic column detection for this file wasn't reliable enough (code/date/description empty for most entries). Pick the header row, then assign each field to the correct file column yourself.",
        })}
      </p>
      <div className="mb-3">
        <label className="mb-1 block text-xs font-semibold" style={{ color: "#78350F" }}>{t({ ar: "صف عناوين الأعمدة", en: "Header row" })}</label>
        <select
          value={headerRowIndex}
          onChange={(e) => onChange({ ...mapping, headerRowIndex: Number(e.target.value) })}
          className="w-full max-w-xs rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: COLORS.line, background: "#FFFFFF", color: "#0F172A" }}
        >
          {rows.slice(0, 20).map((r, i) => (
            <option key={i} value={i}>
              {t({ ar: "صف", en: "Row" })} {i + 1}: [{(Array.isArray(r) ? r : []).map((c) => (c === null || c === undefined || c === "" ? "∅" : String(c))).slice(0, 6).join(" | ")}]
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {MAPPER_FIELDS.map((f) => {
          const val = mapping[f.key];
          const current = val === -1 || val === "" || val === undefined || val === null ? "" : val;
          return (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-semibold" style={{ color: "#78350F" }}>
                {t({ ar: f.ar, en: f.en })} {f.required && <span style={{ color: COLORS.red }}>*</span>}
              </label>
              <select
                value={current}
                onChange={(e) => onChange({ ...mapping, [f.key]: e.target.value === "" ? -1 : Number(e.target.value) })}
                className="w-full rounded-md border px-2 py-1.5 text-sm"
                style={{ borderColor: COLORS.line, background: "#FFFFFF", color: "#0F172A" }}
              >
                <option value="">{t({ ar: "— بدون —", en: "— None —" })}</option>
                {colOptions.map((i) => {
                  const headerText = headerRow[i] !== null && headerRow[i] !== undefined && headerRow[i] !== "" ? String(headerRow[i]) : "";
                  const previewText = previewRow[i] !== null && previewRow[i] !== undefined && previewRow[i] !== "" ? String(previewRow[i]) : "";
                  const label = `${columnLetter(i)}${headerText ? " — " + headerText : ""}${previewText ? " (" + previewText.substring(0, 24) + ")" : ""}`;
                  return <option key={i} value={i}>{label}</option>;
                })}
              </select>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={onApply} className="rounded-md px-4 py-2 text-sm font-semibold text-white" style={{ background: COLORS.teal }}>
          {t({ ar: "تطبيق التخطيط وإعادة الاستيراد", en: "Apply Mapping & Re-import" })}
        </button>
        <button onClick={onCancel} className="rounded-md border px-4 py-2 text-sm font-semibold" style={{ borderColor: COLORS.line, color: "#64748B" }}>
          {t({ ar: "إلغاء", en: "Cancel" })}
        </button>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, color, onClick, active }) {
  const { t } = useLanguage();
  return (
    <button onClick={onClick} style={{ cursor: onClick ? "pointer" : "default", display: "block", width: "100%", textAlign: "center" }}>
      <div
        className="card rounded-lg border px-4 py-3 text-center transition"
        style={{
          borderColor: active ? COLORS.teal : COLORS.line,
          background: active ? "rgba(18,184,134,0.12)" : "#FFFFFF",
          boxShadow: active ? "0 0 0 2px rgba(18,184,134,.35)" : "none",
        }}>
        <p className="text-2xl font-bold" style={{ color }}>{value}</p>
        <p className="text-xs" style={{ color: "#64748B" }}>{t(label)}</p>
      </div>
    </button>
  );
}

// أقصى عدد نتائج تُعرض دفعة واحدة بقائمة اختيار الحساب — بلا هذا الحد، شجرة حسابات ضخمة
// (آلاف الحسابات) بلا نص بحث مكتوب تعرض كل الحسابات كعناصر DOM مرة واحدة عند فتح القائمة.
// كتابة أي حرف للبحث يُصفّي النتائج فوراً كما كان دائماً؛ الحد هنا فقط للحالة الافتراضية
// (القائمة مفتوحة بلا فلترة بعد).
const ACCOUNT_PICKER_MAX_RESULTS = 200;

// [إصلاح] خانة مبلغ (مدين/دائن) — كانت تستخدم parseFloat مباشرةً على نص الخانة،
// وفيها خطآن حقيقيان:
//  1) لصق مبلغ بفاصل آلاف من ملف العميل ("1,500.00") يعطي parseFloat القيمة 1
//     بصمت (يتوقف عند الفاصلة)، فيُخزَّن السطر بمبلغ 1 ريال بدل 1500 ويظل القيد
//     "متوازنًا" ظاهريًا إن عُدِّل طرفه الآخر بنفس الطريقة — خطأ جوهري لا يظهر بأي فحص.
//  2) الخانة متحكَّم بها بالكامل (value={r.debit ?? ""}) وparseFloat("1.") = 1،
//     فكانت النقطة العشرية تُمحى لحظة كتابتها ولا يمكن إدخال 1.5 إطلاقًا.
// الحل: نحتفظ بنص المستخدم محليًا أثناء التحرير (فلا تُمحى نقطة ولا سالب أثناء
// الكتابة)، ونمرّر للأعلى القيمة المحوَّلة بنفس parseAmount المستخدمة لقراءة
// الملفات (تتعامل مع الفواصل والسالب اللاحق والأقواس)، فيبقى التحقق فوريًا كما هو.
function NumericCell({ value, onCommit, className, style }) {
  const [draft, setDraft] = useState(null);
  const shown = draft !== null ? draft : (value ?? "");
  return (
    <SafeInput
      dir="ltr"
      value={shown}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        onCommit(text.trim() === "" ? null : parseAmount(text));
      }}
      onBlur={() => setDraft(null)}
      className={className}
      style={style}
    />
  );
}

function AccountPicker({ accounts, value, onChange, hasError, parentCodes }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selectable = useMemo(() => {
    return accounts
      .filter((a) => !parentCodes.has(a.code))
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [accounts, parentCodes]);
  const effectiveQuery = query !== "" ? query : value || "";
  const filtered = useMemo(() => {
    const q = effectiveQuery.trim().toLowerCase();
    if (!q) return selectable;
    return selectable.filter((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
  }, [effectiveQuery, selectable]);
  const shown = filtered.length > ACCOUNT_PICKER_MAX_RESULTS ? filtered.slice(0, ACCOUNT_PICKER_MAX_RESULTS) : filtered;
  return (
    <div className="relative">
      <SafeInput
        value={query || value || ""}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={t({ ar: "رمز الحساب", en: "Account code" })} dir="ltr"
        className="w-full rounded-md border px-2 py-1.5 text-sm font-mono text-start focus:outline-none focus:ring-1 focus:ring-blue-500"
        style={{ borderColor: hasError ? COLORS.red : COLORS.line, background: "#F1F5F9", color: "#0F172A" }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-72 overflow-y-auto rounded-md border shadow-lg" style={{ borderColor: COLORS.line, background: "#FFFFFF", insetInlineStart: 0 }}>
          {shown.map((a) => (
            <div key={a.code} onMouseDown={() => { onChange(a.code); setQuery(""); setOpen(false); }}
              className="cursor-pointer px-3 py-1.5 text-sm hover:bg-[#F8FAFC] text-start">
              <span className="font-mono me-2" style={{ color: COLORS.teal }}>{a.code}</span> {a.name}
            </div>
          ))}
          {filtered.length > ACCOUNT_PICKER_MAX_RESULTS && (
            <div className="px-3 py-1.5 text-xs" style={{ color: "#64748B" }}>
              {t({ ar: `و${filtered.length - ACCOUNT_PICKER_MAX_RESULTS} نتيجة أخرى — اكتب للتصفية`, en: `+${filtered.length - ACCOUNT_PICKER_MAX_RESULTS} more — type to filter` })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// [ميزة جديدة] تحديد يدوي اختياري لأحد حسابات النظام المقفلة الثلاثة (الضريبة/
// المدينون/الدائنون) من قائمة حسابات الشجرة المرفوعة مباشرةً بدل الاعتماد فقط
// على الاكتشاف التلقائي بالاسم — يتجاوز الاكتشاف التلقائي حين يُحدَّد صراحةً
// (بإعادة استخدام AccountPicker الحقيقي أعلاه: بحث فوري بالرمز/الاسم)، ويعرض
// تحته دائماً نتيجة الاكتشاف التلقائي الحالية (بالاسم) كتأكيد بصري، بحيث يرى
// المستخدم فوراً لو الاكتشاف التلقائي فشل (تماماً كما حدث فعلياً من قبل).
function SystemAccountOverride({ label, chartAccountsList, parentCodes, value, onChange, autoCodes, chartMap }) {
  const { t } = useLanguage();
  return (
    <div className="text-xs">
      <span className="mb-1 block font-semibold" style={{ color: COLORS.ink }}>{t(label)}</span>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <AccountPicker accounts={chartAccountsList} value={value} onChange={onChange} hasError={false} parentCodes={parentCodes} />
        </div>
        {value && (
          <button type="button" onClick={() => onChange("")} className="shrink-0 rounded border px-2 py-1.5 text-[11px]" style={{ borderColor: COLORS.line, color: "#64748B" }}>
            {t({ ar: "تلقائي", en: "Auto" })}
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px]" style={{ color: autoCodes.length ? "#64748B" : "#DC2626" }}>
        {autoCodes.length
          ? t({
              ar: `اكتُشف تلقائياً: ${autoCodes.map((c) => `${c} - ${chartMap[c]?.name || c}`).join("، ")}`,
              en: `Auto-detected: ${autoCodes.map((c) => `${c} - ${chartMap[c]?.name || c}`).join(", ")}`,
            })
          : t({ ar: "لم يُكتشف تلقائياً بالاسم — حدده يدوياً فوق إن وُجدت قيود عليه", en: "Not auto-detected by name — select it manually above if entries post to it" })}
      </p>
    </div>
  );
}

const EntryCard = memo(function EntryCard({ entry, issues, isOpen, onToggle, chartAccountsList, onUpdateRow, onUpdateMeta, parentCodes, onApplySuggestion, onApplyDateSuggestion, onApplyAllSuggestions, onDismiss }) {
  const { t } = useLanguage();
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const hasErrors = issues.length > 0;
  const statusColor = hasErrors ? COLORS.red : COLORS.green;
  const T = { ar: "قيد", en: "Entry" };
  return (
    <div className="card overflow-hidden rounded-lg border transition-all" style={{ borderColor: COLORS.line, background: "#FFFFFF" }}>
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-[#F8FAFC] transition-colors">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: statusColor }}>
            {issues.length === 0 ? <CheckCircle2 size={14} /> : issues.length}
          </span>
          <div>
            <p className="text-sm font-semibold">{t(T)} #{entry.seq} — {entry.desc || t({ ar: "بدون وصف", en: "No description" })}</p>
            <p className="text-xs" style={{ color: "#64748B" }}>{entry.date || t({ ar: "بدون تاريخ", en: "No date" })}</p>
          </div>
        </div>
        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {isOpen && (
        <div className="border-t px-4 py-3" style={{ borderColor: COLORS.line }}>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1">{t({ ar: "التاريخ:", en: "Date:" })}
              <SafeInput dir="ltr" value={entry.date || ""} onChange={(e) => onUpdateMeta(entry.seq, "date", e.target.value)}
                placeholder="dd/mm/yyyy" className="rounded border px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" style={{ borderColor: COLORS.line, background: "#F1F5F9", color: "#0F172A", width: 100 }} />
            </label>
            <label className="flex flex-1 items-center gap-1">{t({ ar: "الوصف:", en: "Description:" })}
              <SafeInput value={entry.desc || ""} onChange={(e) => onUpdateMeta(entry.seq, "desc", e.target.value)}
                className="flex-1 rounded border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" style={{ borderColor: COLORS.line, background: "#F1F5F9", color: "#0F172A" }} />
            </label>
          </div>
          <table className="mb-3 w-full text-xs">
            <thead><tr style={{ color: "#64748B" }}>
              <th className="pb-1 text-start font-medium">{t({ ar: "الرمز", en: "Code" })}</th>
              <th className="pb-1 text-start font-medium">{t({ ar: "اسم الحساب", en: "Account" })}</th>
              <th className="pb-1 text-start font-medium">{t({ ar: "جهة اتصال/ضريبة/موظف", en: "Contact/Tax/Employee" })}</th>
              <th className="pb-1 text-start font-medium">{t({ ar: "مدين", en: "Debit" })}</th>
              <th className="pb-1 text-start font-medium">{t({ ar: "دائن", en: "Credit" })}</th>
              <th className="pb-1 text-start font-medium">{t({ ar: "تعليق", en: "Comment" })}</th>
            </tr></thead>
            <tbody>
              {entry.rows.map((r) => {
                const rowIssue = issues.find((i) => i.rowIndex === r._rowIndex);
                const acc = chartAccountsList.find((a) => a.code === r.code);
                return (
                  <tr key={r._rowIndex} className="border-t" style={{ borderColor: COLORS.line }}>
                    <td className="py-1.5 pe-2" style={{ width: 130 }}>
                      <AccountPicker accounts={chartAccountsList} value={r.code} hasError={!!rowIssue} parentCodes={parentCodes}
                        onChange={(v) => onUpdateRow(entry.seq, r._rowIndex, "code", v)} />
                    </td>
                    <td className="py-1.5 pe-2 text-start" style={{ color: !acc ? COLORS.red : rowIssue?.type === "parent_account" ? COLORS.amber : COLORS.ink }}>
                      {acc ? acc.name : "—"}{rowIssue?.type === "parent_account" && t({ ar: " (رئيسي)", en: " (parent)" })}
                    </td>
                    <td className="py-1.5 pe-2">
                      <SafeInput value={r.contact || ""} onChange={(e) => onUpdateRow(entry.seq, r._rowIndex, "contact", e.target.value)}
                        title={t({ ar: "رقم مرجعي عميل/مورد، أو رمز نوع الضريبة، أو رقم موظف — حسب نوع الحساب", en: "Customer/supplier reference, tax type code, or employee number — depending on the account" })}
                        className="w-28 rounded border px-1.5 py-1 text-start focus:outline-none focus:ring-1 focus:ring-blue-500"
                        style={{ borderColor: rowIssue?.type === "missing_contact_ref" ? COLORS.red : COLORS.line, background: "#F1F5F9", color: "#0F172A" }} />
                    </td>
                    <td className="py-1.5 pe-2">
                      <NumericCell value={r.debit} onCommit={(v) => onUpdateRow(entry.seq, r._rowIndex, "debit", v)}
                        className="w-20 rounded border px-1.5 py-1 font-mono text-start focus:outline-none focus:ring-1 focus:ring-blue-500" style={{ borderColor: COLORS.line, background: "#F1F5F9", color: "#0F172A" }} />
                    </td>
                    <td className="py-1.5 pe-2">
                      <NumericCell value={r.credit} onCommit={(v) => onUpdateRow(entry.seq, r._rowIndex, "credit", v)}
                        className="w-20 rounded border px-1.5 py-1 font-mono text-start focus:outline-none focus:ring-1 focus:ring-blue-500" style={{ borderColor: COLORS.line, background: "#F1F5F9", color: "#0F172A" }} />
                    </td>
                    <td className="py-1.5">
                      <SafeInput value={r.comment || ""} onChange={(e) => onUpdateRow(entry.seq, r._rowIndex, "comment", e.target.value)}
                        className="w-full rounded border px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" style={{ borderColor: COLORS.line, background: "#F1F5F9", color: "#0F172A" }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {issues.some((issue) => (issue.type === "unknown_code" && issue.suggestions?.length) || (issue.type === "parent_account" && issue.suggestions?.length) || (issue.type === "date_format" && issue.suggestedDate)) && (
            <button onClick={() => onApplyAllSuggestions(entry.seq, issues)} className="mb-3 rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ background: "#B98227" }}>
              {t({ ar: "تطبيق مقترحات القيد", en: "Apply entry suggestions" })}
            </button>
          )}
          {issues.map((issue) => (
            <div key={issue.id} className="mb-2 flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-xs"
              style={{ borderColor: issue.severity === "warning" ? COLORS.amber : COLORS.red, background: issue.severity === "warning" ? "rgba(251,191,36,0.12)" : "rgba(251,113,133,0.12)" }}>
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: issue.severity === "warning" ? COLORS.amber : COLORS.red }} />
                <p>{issue.message}</p>
              </div>
              {issue.type === "date_format" && issue.suggestedDate && (
                <button onClick={() => onApplyDateSuggestion(entry.seq, issue.suggestedDate, issue.id)}
                  className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-white text-xs font-semibold" style={{ background: COLORS.green }}>
                  <CheckCircle2 size={13} /> {t({ ar: `تطبيق ${issue.suggestedDate}`, en: `Apply ${issue.suggestedDate}` })}
                </button>
              )}
              {issue.type === "semantic_mismatch" && (
                <div className="flex shrink-0 gap-1">
                  {issue.type === "semantic_mismatch" && issue.suggestedCode && (
                    <button onClick={() => onApplySuggestion(entry.seq, issue.rowIndex, issue.suggestedCode, issue.id)}
                      className="rounded px-2 py-1 text-white text-xs font-semibold" style={{ background: COLORS.green }}>{t({ ar: "تطبيق", en: "Apply" })}</button>
                  )}
                  <button onClick={() => onDismiss(issue.id)} className="rounded border px-2 py-1 text-xs" style={{ borderColor: COLORS.line }}>{t({ ar: "تجاهل", en: "Dismiss" })}</button>
                </div>
              )}
              {issue.type === "unknown_code" && issue.suggestions && issue.suggestions.length > 0 && (
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5" style={{ maxWidth: 280 }}>
                    {issue.suggestions.map((s) => (
                      <div key={s.code} className="flex items-center gap-2 rounded border px-2 py-1.5" style={{ borderColor: s.confidence === "high" ? "#2F8F5B" : "#A16207", background: s.confidence === "high" ? "rgba(34,211,138,0.12)" : "rgba(251,191,36,0.12)" }}>
                        <span className="text-left text-[11px] font-semibold" style={{ direction: "ltr", color: s.confidence === "high" ? "#15803D" : "#FBBF24" }}>{s.code} — {s.name}</span>
                        <button onClick={() => onApplySuggestion(entry.seq, issue.rowIndex, s.code, issue.id)} className="rounded px-2 py-1 text-[11px] font-semibold text-white" style={{ background: "#287653" }}>
                          {t({ ar: "تنفيذ المقترح", en: "Apply suggestion" })}
                        </button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => onDismiss(issue.id)} className="rounded border px-2 py-0.5 text-xs" style={{ borderColor: COLORS.line }}>{t({ ar: "تجاهل", en: "Dismiss" })}</button>
                </div>
              )}
              {issue.type === "parent_account" && issue.suggestions && issue.suggestions.length > 0 && (
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5" style={{ maxWidth: 420 }}>
                    {issue.suggestions.slice(0, showAllSuggestions ? issue.suggestions.length : 8).map((s) => (
                      <div key={s.code} className="flex items-center gap-2 rounded border px-2 py-1.5" style={{ direction: "ltr", background: "rgba(34,211,138,0.12)", borderColor: "#2F8F5B" }}>
                        <span className="text-left text-[11px] font-semibold" style={{ color: "#15803D" }}>{s.code} — {s.name}</span>
                        <button onClick={() => onApplySuggestion(entry.seq, issue.rowIndex, s.code, issue.id)} className="rounded px-2 py-1 text-[11px] font-semibold text-white" style={{ background: "#287653" }}>
                          {t({ ar: "تنفيذ المقترح", en: "Apply suggestion" })}
                        </button>
                      </div>
                    ))}
                  </div>
                  {issue.suggestions.length > 8 && (
                    <button onClick={() => setShowAllSuggestions((visible) => !visible)} className="text-[11px] underline" style={{ color: COLORS.tealLight }}>
                      {showAllSuggestions ? t({ ar: "إخفاء الباقي", en: "Show fewer" }) : t({ ar: `عرض جميع الحسابات (${issue.suggestions.length})`, en: `Show all accounts (${issue.suggestions.length})` })}
                    </button>
                  )}
                  <button onClick={() => onDismiss(issue.id)} className="rounded border px-2 py-0.5 text-xs" style={{ borderColor: COLORS.line }}>{t({ ar: "تجاهل", en: "Dismiss" })}</button>
                </div>
              )}
              {issue.type === "parent_account" && (!issue.suggestions || issue.suggestions.length === 0) && (
                <button onClick={() => onDismiss(issue.id)} className="shrink-0 rounded border px-2 py-1 text-xs" style={{ borderColor: COLORS.line }}>{t({ ar: "تجاهل", en: "Dismiss" })}</button>
              )}
              {((issue.type === "unknown_code" && (!issue.suggestions || issue.suggestions.length === 0)) ||
                (issue.type === "date_format" && !issue.suggestedDate) ||
                !["unknown_code", "date_format", "parent_account", "semantic_mismatch"].includes(issue.type)) && (
                <button onClick={() => onDismiss(issue.id)} className="shrink-0 rounded border px-2 py-1 text-xs" style={{ borderColor: COLORS.line }}>{t({ ar: "تجاهل", en: "Dismiss" })}</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default function JournalTool() {
  const { t, lang, dir } = useLanguage();
  const { currentUser } = useAuth();
  const [chartAccounts, setChartAccounts] = useState(null);
  const [chartFileName, setChartFileName] = useState("");
  const [chartBusy, setChartBusy] = useState(false);
  const [entries, setEntries] = useState(null);
  const [entriesFileName, setEntriesFileName] = useState("");
  const [entriesBusy, setEntriesBusy] = useState(false);
  const [parseError, setParseError] = useState("");
  // [ميزة جديدة] لوحة "تحديد الأعمدة يدويًا" — تُفتَح تلقائيًا لو التعرّف الآلي
  // فشل أو بدا مشبوهًا (رمز/تاريخ/وصف فارغين لأغلب القيود رغم "نجاح" ظاهري)،
  // ويظهر زر لفتحها يدويًا دائمًا بجانب رفع الملف حتى لو التعرّف الآلي بدا سليمًا.
  const [rawEntriesRows, setRawEntriesRows] = useState(null);
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [columnMapping, setColumnMapping] = useState(null);
  // [ميزة جديدة] تعبية تلقائية لعمود "جهة اتصال/ضريبة/موظف": رمزا الضريبة
  // (ثابتان نظاميًا بقيود لكل منشأة جديدة، افتراضيًا "1" للـ15% و"2" للصفرية،
  // وقابلان للتغيير يدويًا لو كانت منشأة العميل المحدَّدة تستخدم رمزين مختلفين
  // فعليًا حسب إعداداتها الضريبية الخاصة) + ملفا العملاء/الموردين المرجعيان
  // الاختياريان (اسم + رقم مرجعي) لتعبية حسابي المدينون/الدائنون الافتراضيين.
  const [vat15Code, setVat15Code] = useState("1");
  const [vatZeroCode, setVatZeroCode] = useState("2");
  const [customersRefList, setCustomersRefList] = useState(null);
  const [customersRefFileName, setCustomersRefFileName] = useState("");
  const [customersRefBusy, setCustomersRefBusy] = useState(false);
  const [suppliersRefList, setSuppliersRefList] = useState(null);
  const [suppliersRefFileName, setSuppliersRefFileName] = useState("");
  const [suppliersRefBusy, setSuppliersRefBusy] = useState(false);
  const [showRefSettings, setShowRefSettings] = useState(false);
  // [ميزة جديدة] تحديد يدوي اختياري لحساب الضريبة/المدينون/الدائنون من قائمة
  // حسابات الشجرة المرفوعة مباشرةً — يتجاوز الاكتشاف التلقائي بالاسم حين
  // يُحدَّد صراحةً (احتياط لو اسم الحساب بشجرة عميل معيّن غير قابل للاكتشاف
  // حتى بالمطابقة الضبابية)، ويبقى الاكتشاف التلقائي يعمل كاملاً حين تبقى فارغة.
  const [manualVatCode, setManualVatCode] = useState("");
  const [manualDebtorsCode, setManualDebtorsCode] = useState("");
  const [manualCreditorsCode, setManualCreditorsCode] = useState("");
  const [expanded, setExpanded] = useState({});
  const [copyStatus, setCopyStatus] = useState("");
  const [showManualCopy, setShowManualCopy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [resolvedIds, setResolvedIds] = useState({});
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  // [إصلاح أقوى] autoComplete="off" وحده لا يكفي — Chrome يتجاوزه فعلياً لحقول يظنها معلومات
  // اتصال (إيميل محفوظ)، بدليل تكرار نفس البلاغ. الحل المضمون عملياً: يبدأ الحقل readOnly
  // (فمتصفحات Chrome لا تعبّي حقلاً كذلك تلقائياً)، ويُزال القيد فور تركيز المستخدم عليه
  // (focus)، فيصبح قابلاً للكتابة كالمعتاد قبل أي محاولة كتابة فعلية من المستخدم.
  const [searchUnlocked, setSearchUnlocked] = useState(false);
  const [exportSort, setExportSort] = useState("number");
  const [auditVersion, setAuditVersion] = useState(0);
  const searchInputRef = useRef(null);
  const suggestionCacheRef = useRef(new Map());

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const chartMap = useMemo(() => {
    if (!chartAccounts) return {};
    const m = {};
    chartAccounts.forEach((a) => (m[a.code] = a));
    return m;
  }, [chartAccounts]);

  const parentInfo = useMemo(() => (chartAccounts ? buildParentInfo(chartAccounts) : { parentCodes: new Set(), childrenByParent: {} }), [chartAccounts]);

  // [ميزة جديدة] حساب المدينون/الدائنون/الضريبة الافتراضي يُكتشَف عبر اسمه
  // بالشجرة تلقائياً (لا كود ثابت، يختلف من عميل لعميل)؛ autoXxxCodes تبقى
  // دائماً نتيجة الاكتشاف التلقائي وحده (تُعرَض للمستخدم كتأكيد بصري)، بينما
  // xxxCodes (المُستخدَمة فعلياً بالتدقيق والتعبية) تُفضِّل التحديد اليدوي إن وُجد.
  const autoVatCodes = useMemo(() => (chartAccounts ? findSystemAccountCodes(chartAccounts, VAT_PAYABLE_ACCOUNT_NAME) : []), [chartAccounts]);
  const autoDebtorsCodes = useMemo(() => (chartAccounts ? findSystemAccountCodes(chartAccounts, DEBTORS_ACCOUNT_NAME) : []), [chartAccounts]);
  const autoCreditorsCodes = useMemo(() => (chartAccounts ? findSystemAccountCodes(chartAccounts, CREDITORS_ACCOUNT_NAME) : []), [chartAccounts]);
  const debtorsCodes = useMemo(() => new Set(manualDebtorsCode ? [manualDebtorsCode] : autoDebtorsCodes), [manualDebtorsCode, autoDebtorsCodes]);
  const creditorsCodes = useMemo(() => new Set(manualCreditorsCode ? [manualCreditorsCode] : autoCreditorsCodes), [manualCreditorsCode, autoCreditorsCodes]);

  const [structuralIssuesBySeq, setStructuralIssuesBySeq] = useState({});
  const postingAccounts = useMemo(
    () => (chartAccounts || []).filter((account) => !parentInfo.parentCodes.has(account.code)),
    [chartAccounts, parentInfo]
  );
  const buildStructuralIssues = useCallback((entry) => {
    const issues = validateEntryStructure(entry, chartMap, parentInfo);
    issues.forEach((iss) => {
      if (iss.type === "unknown_code" && iss.code) {
        const row = entry.rows.find((r) => r._rowIndex === iss.rowIndex);
        const cacheKey = `unknown:${iss.code}:${row?.name || ""}`;
        let suggestions = suggestionCacheRef.current.get(cacheKey);
        if (!suggestions) {
          suggestions = getPostingSuggestions(iss.code, row?.name, chartAccounts, parentInfo, 5)
            .map((account) => ({ code: account.code, name: account.name }));
          suggestionCacheRef.current.set(cacheKey, suggestions);
        }
        iss.suggestions = suggestions;
      } else if (iss.type === "parent_account") {
        const cacheKey = `parent:${iss.code}`;
        let suggestions = suggestionCacheRef.current.get(cacheKey);
        if (!suggestions) {
          suggestions = getPostingDescendants(iss.code, postingAccounts, parentInfo.childrenByParent)
            .map((account) => ({ code: account.code, name: account.name }));
          suggestionCacheRef.current.set(cacheKey, suggestions);
        }
        iss.suggestions = suggestions;
      } else if (iss.type === "date_format" && entry.date) {
        const normalized = normalizeDateGuess(entry.date);
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) iss.suggestedDate = normalized;
      }
    });
    // [ميزة جديدة] حساب المدينون/الدائنون الافتراضي يتطلب بقيود رقمًا مرجعيًا
    // للعميل/المورد بعمود "جهة اتصال/ضريبة/موظف" — لا اسمه. التعبية التلقائية
    // (applyAutoContactRules) تحاول ملء هذا الرقم من الملف المرجعي الاختياري
    // قبل هذا الفحص؛ ما تبقى فارغًا هنا يحتاج تدخل المستخدم يدويًا فعليًا.
    entry.rows.forEach((r, i) => {
      const isDebtors = debtorsCodes.has(r.code);
      const isCreditors = creditorsCodes.has(r.code);
      if ((isDebtors || isCreditors) && !r.contact) {
        issues.push({
          id: `${entry.seq}-row${r._rowIndex}-contactref`,
          type: "missing_contact_ref",
          severity: "error",
          rowIndex: r._rowIndex,
          code: r.code,
          message: `السطر ${i + 1}: الحساب "${chartMap[r.code]?.name || r.code}" حساب ${isDebtors ? "المدينون" : "الدائنون"} الافتراضي — يتطلب قيود تحديد الرقم المرجعي لـ${isDebtors ? "العميل" : "المورد"} في خانة "جهة اتصال/ضريبة/موظف"${r.comment ? ` (الاسم المتاح بالسطر: "${r.comment}" — تحقق منه في ملف ${isDebtors ? "العملاء" : "الموردين"} المرجعي إن رُفع، أو أدخل الرقم يدويًا)` : " (أدخله يدويًا، أو ارفع ملف مرجعي يحوي اسمه)"}`,
        });
      }
    });
    return issues;
  }, [chartAccounts, chartMap, parentInfo, postingAccounts, debtorsCodes, creditorsCodes]);

  // [ميزة جديدة] تعبية تلقائية لعمود "جهة اتصال/ضريبة/موظف": تُعاد كل مرة يتغيّر
  // فيها ملف شجرة الحسابات أو أحد الملفين المرجعيين الاختياريين أو رمزا الضريبة.
  // applyAutoContactRules تُرجع نفس مرجع entries حرفيًا لو لم يتغيّر شيء فعليًا،
  // فـsetEntries هنا لا تُسبِّب أي حلقة تحديث لا نهائية (React يتجاهل تحديث
  // state بنفس المرجع). السطور التي عدّلها المستخدم يدويًا (_userEdited) محمية
  // ولا تُلمَس داخل applyAutoContactRules نفسها.
  useEffect(() => {
    if (!entries || !chartAccounts) return;
    const next = applyAutoContactRules(entries, chartAccounts, {
      vat15Code, vatZeroCode,
      customersRef: customersRefList || [],
      suppliersRef: suppliersRefList || [],
      vatAccountCode: manualVatCode,
      debtorsAccountCode: manualDebtorsCode,
      creditorsAccountCode: manualCreditorsCode,
    });
    if (next !== entries) {
      setEntries(next);
      // لازم إعادة تشغيل تدقيق الهيكل (auditVersion) وإلا يبقى "missing_contact_ref"
      // معلَّقاً على سطور مُلِئت خانتها للتو تلقائياً — التدقيق الجماعي أدناه لا
      // يُعاد تلقائياً لمجرد تغيّر entries (auditVersion هو مُحرِّكه المتعمَّد).
      setAuditVersion((version) => version + 1);
    }
  }, [entries, chartAccounts, customersRefList, suppliersRefList, vat15Code, vatZeroCode, manualVatCode, manualDebtorsCode, manualCreditorsCode]);

  useEffect(() => {
    if (!entries || !chartAccounts) return;
    let cancelled = false;
    let index = 0;
    setStructuralIssuesBySeq({});
    const processBatch = () => {
      if (cancelled) return;
      const batch = {};
      const end = Math.min(index + 250, entries.length);
      for (; index < end; index += 1) {
        const entry = entries[index];
        batch[entry.seq] = buildStructuralIssues(entry);
      }
      setStructuralIssuesBySeq((previous) => ({ ...previous, ...batch }));
      if (index < entries.length) setTimeout(processBatch, 0);
    };
    processBatch();
    return () => { cancelled = true; };
  }, [auditVersion, chartAccounts, buildStructuralIssues]);

  useEffect(() => {
    if (!entries || !chartAccounts) return;
    setExpanded((previous) => {
      const next = { ...previous };
      entries.forEach((entry) => {
        if (next[entry.seq] === undefined) next[entry.seq] = (structuralIssuesBySeq[entry.seq] || []).length > 0;
      });
      return next;
    });
  }, [entries, chartAccounts, structuralIssuesBySeq]);

  const issuesBySeq = useMemo(() => {
    const out = {};
    (entries || []).forEach((entry) => {
      const struct = structuralIssuesBySeq[entry.seq] || [];
      out[entry.seq] = struct.filter((i) => !resolvedIds[i.id]);
    });
    return out;
  }, [entries, structuralIssuesBySeq, resolvedIds]);

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    let result = entries;
    if (filter === "ok") result = result.filter((e) => (issuesBySeq[e.seq] || []).length === 0);
    else if (filter === "error") result = result.filter((e) => (issuesBySeq[e.seq] || []).length > 0);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((e) => {
        const text = [
          e.date, e.desc, e.seq,
          ...(e.rows || []).map((r) => [r.code, r.name, r.comment, r.debit, r.credit].join(" ")),
        ].join(" ").toLowerCase();
        return text.includes(q);
      });
    }
    return result;
  }, [entries, filter, issuesBySeq, searchQuery]);

  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
  const pagedEntries = useMemo(() => {
    return filteredEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [filteredEntries, page]);

  const handleChartUpload = async (file) => {
    setParseError(""); setChartFileName(file.name); setChartBusy(true);
    try {
      const rows = await readWorkbookRows(file);
      suggestionCacheRef.current.clear();
      setChartAccounts(parseChartFile(rows));
      setAuditVersion((version) => version + 1);
    } catch (err) {
      setParseError(localizeError("خطأ في قراءة ملف شجرة الحسابات: " + err.message, lang));
      setChartAccounts(null);
    } finally { setChartBusy(false); }
  };

  // [ميزة جديدة] ملفا العملاء/الموردين المرجعيان — اختياريان بالكامل (فقط لو
  // وُجدت قيود على حساب المدينون/الدائنون الافتراضي)، عمودان: اسم + رقم مرجعي.
  const handleCustomersRefUpload = async (file) => {
    setParseError(""); setCustomersRefFileName(file.name); setCustomersRefBusy(true);
    try {
      const rows = await readWorkbookRows(file);
      const list = parseNameRefFile(rows);
      if (list.length === 0) throw new Error("لم يتم العثور على عمودي اسم العميل والرقم المرجعي في الملف — تأكد من وجود عمود اسم وعمود رقم مرجعي بعناوين واضحة");
      setCustomersRefList(list);
    } catch (err) {
      setParseError(localizeError("خطأ في قراءة ملف العملاء المرجعي: " + err.message, lang));
      setCustomersRefList(null);
    } finally { setCustomersRefBusy(false); }
  };

  const handleSuppliersRefUpload = async (file) => {
    setParseError(""); setSuppliersRefFileName(file.name); setSuppliersRefBusy(true);
    try {
      const rows = await readWorkbookRows(file);
      const list = parseNameRefFile(rows);
      if (list.length === 0) throw new Error("لم يتم العثور على عمودي اسم المورد والرقم المرجعي في الملف — تأكد من وجود عمود اسم وعمود رقم مرجعي بعناوين واضحة");
      setSuppliersRefList(list);
    } catch (err) {
      setParseError(localizeError("خطأ في قراءة ملف الموردين المرجعي: " + err.message, lang));
      setSuppliersRefList(null);
    } finally { setSuppliersRefBusy(false); }
  };

  const handleEntriesUpload = async (file) => {
    setParseError(""); setEntriesFileName(file.name); setEntriesBusy(true); setShowColumnMapper(false);
    let rows;
    try {
      rows = await readAnyEntriesFileRows(file);
    } catch (err) {
      // فشل قراءة الملف نفسه (صيغة غير مدعومة/ملف تالف) — لا صفوف إطلاقًا،
      // فلا معنى لعرض لوحة تحديد الأعمدة هنا (لا يوجد ما يُحدَّد).
      setParseError(localizeError("خطأ في قراءة ملف القيود: " + err.message, lang));
      setEntries(null); setRawEntriesRows(null); setEntriesBusy(false);
      if (currentUser) trackJournalError(currentUser, { filename: file.name, error: err.message });
      return;
    }
    setRawEntriesRows(rows);
    try {
      const grouped = parseEntriesFile(rows);
      if (grouped.length === 0) throw new Error("تم التعرف على تنسيق الملف لكن لم يتم العثور على أي قيود بداخله\n\nتفاصيل الفحص:\n" + (_parseDebug.info || ""));
      const quality = assessEntriesQuality(grouped);
      setEntries(grouped);
      setExpanded({});
      setResolvedIds({});
      setStructuralIssuesBySeq({});
      suggestionCacheRef.current.clear();
      setAuditVersion((version) => version + 1);
      setPage(0);
      setFilter("all");
      if (currentUser) trackJournalImport(currentUser, { filename: file.name, entries_count: grouped.length });
      // [ميزة جديدة] التعرّف الآلي "نجح" فنيًا (قيود أُنشئت) لكن أغلب حقولها
      // الأساسية فارغة — هذا بالضبط الخطأ الجوهري الذي شهده المستخدم (كل
      // الحسابات "—"، كل التواريخ "بدون تاريخ") فيما بدا للمستخدم كنجاح ظاهري.
      // نفتح لوحة تحديد الأعمدة يدويًا تلقائيًا بدل تسليم نتيجة فارغة بصمت.
      if (!quality.ok) {
        setColumnMapping(guessEntriesColumnMapping(rows));
        setShowColumnMapper(true);
      }
    } catch (err) {
      setParseError(localizeError("خطأ في قراءة ملف القيود: " + err.message, lang));
      setEntries(null);
      setColumnMapping(guessEntriesColumnMapping(rows));
      setShowColumnMapper(true);
      if (currentUser) trackJournalError(currentUser, { filename: file.name, error: err.message });
    } finally { setEntriesBusy(false); }
  };

  // يُبنى القيود من نفس صفوف آخر ملف مرفوع (rawEntriesRows) باستخدام تخطيط
  // الأعمدة الذي اختاره المستخدم يدويًا بلوحة "تحديد الأعمدة" — بديل كامل عن
  // parseEntriesFile التلقائي، وليس تعديلاً عليه، حتى يتحكّم المستخدم بنفسه
  // تمامًا حين يفشل التخمين الآلي أو حين يريد فرض تخطيط معيّن بنفسه.
  const applyColumnMapping = useCallback(() => {
    if (!rawEntriesRows || !columnMapping) return;
    setParseError("");
    try {
      const grouped = parseEntriesFileWithMapping(rawEntriesRows, columnMapping.headerRowIndex, columnMapping);
      if (grouped.length === 0) throw new Error("لم يتم العثور على أي قيود بالتخطيط المُحدَّد — تحقق من رقم صف الرأس ومن اختيار عمود واحد على الأقل للمدين أو الدائن");
      setEntries(grouped);
      setExpanded({});
      setResolvedIds({});
      setStructuralIssuesBySeq({});
      suggestionCacheRef.current.clear();
      setAuditVersion((version) => version + 1);
      setPage(0);
      setFilter("all");
      setShowColumnMapper(false);
    } catch (err) {
      setParseError(localizeError("خطأ في تطبيق تخطيط الأعمدة اليدوي: " + err.message, lang));
    }
  }, [rawEntriesRows, columnMapping, lang]);

  const updateRow = useCallback((seq, rowIndex, field, value) => {
    // [ميزة جديدة] تعديل يدوي لخانة "جهة اتصال/ضريبة/موظف" يُعلَّم السطر
    // (_userEdited) فتحميه applyAutoContactRules نهائيًا من أي تعبية تلقائية
    // لاحقة تُبطل تصحيح المستخدم (مثلاً لو غيّر رمز الضريبة أو رفع ملفًا مرجعيًا بعدها).
    const extra = field === "contact" ? { _userEdited: true } : {};
    const currentEntry = entries?.find((entry) => entry.seq === seq);
    if (currentEntry) {
      const updatedEntry = {
        ...currentEntry,
        rows: currentEntry.rows.map((row) => row._rowIndex === rowIndex ? { ...row, [field]: value, ...extra } : row),
      };
      setStructuralIssuesBySeq((previous) => ({ ...previous, [seq]: buildStructuralIssues(updatedEntry) }));
    }
    setResolvedIds((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !id.startsWith(`${seq}-`))));
    setEntries((prev) => prev.map((entry) => entry.seq !== seq ? entry :
      { ...entry, rows: entry.rows.map((r) => r._rowIndex === rowIndex ? { ...r, [field]: value, ...extra } : r) }));
  }, [buildStructuralIssues, entries]);

  const updateEntryMeta = useCallback((seq, field, value) => {
    const currentEntry = entries?.find((entry) => entry.seq === seq);
    if (currentEntry) {
      setStructuralIssuesBySeq((previous) => ({
        ...previous,
        [seq]: buildStructuralIssues({ ...currentEntry, [field]: value }),
      }));
    }
    setResolvedIds((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !id.startsWith(`${seq}-`))));
    setEntries((prev) => prev.map((entry) => (entry.seq === seq ? { ...entry, [field]: value } : entry)));
  }, [buildStructuralIssues, entries]);

  const applySuggestion = useCallback((seq, rowIndex, suggestedCode, issueId) => {
    updateRow(seq, rowIndex, "code", suggestedCode);
    setResolvedIds((prev) => ({ ...prev, [issueId]: true }));
  }, [updateRow]);

  const applyDateSuggestion = useCallback((seq, suggestedDate, issueId) => {
    updateEntryMeta(seq, "date", suggestedDate);
    setResolvedIds((prev) => ({ ...prev, [issueId]: true }));
  }, [updateEntryMeta]);

  const applyAllSuggestions = useCallback((targetSeq = null, targetIssues = null) => {
    const selected = targetSeq
      ? [{ entry: entries.find((item) => item.seq === targetSeq), issues: targetIssues || issuesBySeq[targetSeq] || [] }]
      : entries.map((entry) => ({ entry, issues: issuesBySeq[entry.seq] || [] }));
    const selectedBySeq = new Map(selected.filter(({ entry }) => entry).map((item) => [item.entry.seq, item]));
    const resolved = {};
    const updated = entries.map((entry) => {
      const item = selectedBySeq.get(entry.seq);
      if (!item) return entry;
      let nextEntry = { ...entry, rows: entry.rows.map((row) => ({ ...row })) };
      item.issues.forEach((issue) => {
        if (issue.type === "date_format" && issue.suggestedDate) {
          nextEntry.date = issue.suggestedDate;
          resolved[issue.id] = true;
        } else if (issue.rowIndex !== undefined) {
          const suggestion = issue.type === "unknown_code" ? issue.suggestions?.[0] : issue.type === "parent_account" ? issue.suggestions?.[0] : null;
          if (suggestion) {
            nextEntry.rows = nextEntry.rows.map((row) => row._rowIndex === issue.rowIndex ? { ...row, code: suggestion.code } : row);
            resolved[issue.id] = true;
          }
        }
      });
      return nextEntry;
    });
    setEntries(updated);
    setResolvedIds((previous) => ({ ...previous, ...resolved }));
    const nextIssues = { ...structuralIssuesBySeq };
    selectedBySeq.forEach(({ entry: entryBefore }) => {
      const entryAfter = updated.find((entry) => entry.seq === entryBefore?.seq);
      if (entryAfter) nextIssues[entryAfter.seq] = buildStructuralIssues(entryAfter);
    });
    setStructuralIssuesBySeq(nextIssues);
  }, [buildStructuralIssues, entries, issuesBySeq, structuralIssuesBySeq]);

  const dismissIssue = useCallback((issueId) => {
    setResolvedIds((prev) => ({ ...prev, [issueId]: true }));
  }, []);

  const toggleExpand = useCallback((seq) => {
    setExpanded((p) => ({ ...p, [seq]: !p[seq] }));
  }, []);

  const totalEntries = entries ? entries.length : 0;
  const entriesWithIssues = entries ? entries.filter((e) => (issuesBySeq[e.seq] || []).length > 0).length : 0;
  const totalOpenIssues = Object.values(issuesBySeq).reduce((s, arr) => s + arr.length, 0);
  const applicableCount = Object.values(issuesBySeq).reduce(
    (s, arr) => s + arr.filter((i) => (i.type === "unknown_code" && i.suggestions?.length) || (i.type === "parent_account" && i.suggestions?.length) || (i.type === "date_format" && i.suggestedDate)).length,
    0
  );
  const ready = chartAccounts && entries;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const sortedEntries = [...entries].sort((left, right) => {
        if (exportSort === "date") {
          const parseDate = (value) => { const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return match ? new Date(`${match[3]}-${match[2]}-${match[1]}`).getTime() : Number.MAX_SAFE_INTEGER; };
          return parseDate(left.date) - parseDate(right.date) || String(left.seq).localeCompare(String(right.seq), undefined, { numeric: true });
        }
        return String(left.seq).localeCompare(String(right.seq), undefined, { numeric: true });
      });
      const blob = await buildImportFile(sortedEntries);
      downloadBlob(blob, t({ ar: "قيود_جاهزة_للاستيراد.xlsx", en: "journal_entries_ready.xlsx" }));
      if (currentUser) trackJournalExport(currentUser, { entries_count: entries.length });
    } catch (err) {
      setParseError(localizeError("تعذر إنشاء الملف: " + err.message, lang));
    } finally { setDownloading(false); }
  };

  const copyToClipboard = async () => {
    const text = buildPasteText(entries);
    let success = false;
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); success = true; } catch { success = false; }
    }
    if (!success) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        success = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch { success = false; }
    }
    if (success) { setCopyStatus("copied"); setShowManualCopy(false); setTimeout(() => setCopyStatus(""), 3000); }
    else { setCopyStatus("failed"); setShowManualCopy(true); }
  };

  const resetAll = () => {
    setChartAccounts(null); setChartFileName(""); setEntries(null); setEntriesFileName("");
    setParseError(""); setExpanded({}); setResolvedIds({});
    setStructuralIssuesBySeq({});
    setPage(0); setFilter("all");
    suggestionCacheRef.current.clear();
    // [ميزة جديدة] "بدء من جديد" يعني عميلاً مختلفاً محتملاً — لا تُبقِ ملفي
    // العملاء/الموردين المرجعيين أو رمزي الضريبة المخصَّصين من العميل السابق.
    setCustomersRefList(null); setCustomersRefFileName("");
    setSuppliersRefList(null); setSuppliersRefFileName("");
    setVat15Code("1"); setVatZeroCode("2");
    setManualVatCode(""); setManualDebtorsCode(""); setManualCreditorsCode("");
    setShowRefSettings(false);
  };

  const filters = [
    { key: "all", label: { ar: `الكل (${totalEntries})`, en: `All (${totalEntries})` } },
    { key: "ok", label: { ar: `سليمة (${totalEntries - entriesWithIssues})`, en: `Valid (${totalEntries - entriesWithIssues})` } },
    { key: "error", label: { ar: `مشاكل (${entriesWithIssues})`, en: `Issues (${entriesWithIssues})` } },
  ];

  return (
    <div dir={dir} className="h-full w-full overflow-auto font-cairo" style={{ color: COLORS.ink }}>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
        <div className="mb-6 flex items-center justify-between border-b pb-4" style={{ borderColor: COLORS.line }}>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: COLORS.teal }}>{t({ ar: "تحليل القيود واستيرادها", en: "Analyze & Import Entries" })}</h1>
            <p className="mt-1 text-sm" style={{ color: "#64748B" }}>{t({ ar: "ارفع شجرة الحسابات وملف القيود، وسيتم فحصها وتجهيزها للاستيراد تلقائياً", en: "Upload the chart of accounts and the journal file — they will be audited and prepared for import automatically" })}</p>
          </div>
          {(chartAccounts || entries) && (
            <button onClick={resetAll} className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: COLORS.line, color: COLORS.tealLight }}>
              <RefreshCcw size={14} /> {t({ ar: "بدء من جديد", en: "Start over" })}
            </button>
          )}
        </div>

        <div className="mb-6 flex items-start gap-2 rounded-lg border px-4 py-3 text-xs leading-relaxed" style={{ borderColor: "#CBD5E1", background: "rgba(125,211,252,0.08)" }}>
          <Info size={16} className="mt-0.5 shrink-0" style={{ color: "#0284C7" }} />
          <div style={{ color: "#64748B" }}>
            {t({ ar: "المعايير المعتمدة: صيغة التاريخ dd/mm/yyyy · مدين = دائن لكل قيد · إجمالي القيد لا يجوز أن يكون صفراً · لا يجوز الترحيل على حساب رئيسي له حسابات فرعية.", en: "Accepted rules: date format dd/mm/yyyy · debit = credit per entry · entry total may not be zero · posting to a parent account with children is not allowed." })}
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <UploadCard title={{ ar: "شجرة الحسابات", en: "Chart of Accounts" }} subtitle={{ ar: "ملف الحسابات الخاص بالعميل", en: "Client's chart of accounts file" }} fileName={chartFileName} ok={!!chartAccounts} busy={chartBusy}
            count={chartAccounts ? t({ ar: `${chartAccounts.length} حساب`, en: `${chartAccounts.length} accounts` }) : ""} onFile={handleChartUpload} />
          <UploadCard title={{ ar: "القيود المراد استيرادها", en: "Journal Entries to Import" }} subtitle={{ ar: "Excel، PDF، أو Word — أي ترتيب أعمدة", en: "Excel, PDF, or Word — any column order" }} fileName={entriesFileName} ok={!!entries} busy={entriesBusy}
            count={entries ? t({ ar: `${entries.length} قيد`, en: `${entries.length} entries` }) : ""} onFile={handleEntriesUpload} accept=".xlsx,.xls,.pdf,.docx" />
        </div>

        <div className="mb-6">
          <button onClick={() => setShowRefSettings((v) => !v)} className="text-xs font-semibold underline" style={{ color: COLORS.tealLight }}>
            {showRefSettings
              ? t({ ar: "إخفاء إعدادات المرجع الاختيارية", en: "Hide optional reference settings" })
              : t({ ar: "إعدادات اختيارية: رمز الضريبة + ملفا العملاء/الموردين المرجعيان", en: "Optional settings: tax code + customers/suppliers reference files" })}
          </button>
          {showRefSettings && (
            <div className="mt-3 rounded-lg border p-4" style={{ borderColor: COLORS.line, background: "#F8FAFC" }}>
              <p className="mb-3 text-xs leading-relaxed" style={{ color: "#64748B" }}>
                {t({
                  ar: "اختيارية بالكامل — تلزم فقط لو وُجدت قيود على حساب \"ضريبة القيمة المضافة المستحقة\" أو حسابي \"المدينون\"/\"الدائنون\" الافتراضيين. تُعبَّى خانة \"جهة اتصال/ضريبة/موظف\" تلقائياً بناءً عليها.",
                  en: "Fully optional — needed only when entries post to the \"VAT payable\" account or the default \"Debtors\"/\"Creditors\" accounts. The \"Contact/Tax/Employee\" column is auto-filled from these.",
                })}
              </p>
              <div className="mb-4 flex flex-wrap items-end gap-4">
                <label className="text-xs">
                  <span className="mb-1 block font-semibold" style={{ color: COLORS.ink }}>{t({ ar: "رمز ضريبة القيمة المضافة 15%", en: "15% VAT code" })}</span>
                  <SafeInput dir="ltr" value={vat15Code} onChange={(e) => setVat15Code(e.target.value)}
                    className="w-20 rounded border px-2 py-1 font-mono text-center" style={{ borderColor: COLORS.line, background: "#FFFFFF" }} />
                </label>
                <label className="text-xs">
                  <span className="mb-1 block font-semibold" style={{ color: COLORS.ink }}>{t({ ar: "رمز الضريبة الصفرية 0%", en: "0% (zero-rated) VAT code" })}</span>
                  <SafeInput dir="ltr" value={vatZeroCode} onChange={(e) => setVatZeroCode(e.target.value)}
                    className="w-20 rounded border px-2 py-1 font-mono text-center" style={{ borderColor: COLORS.line, background: "#FFFFFF" }} />
                </label>
                <p className="text-xs" style={{ color: "#94A3B8" }}>
                  {t({ ar: "افتراضياً 1 و2 (ثابتان نظاميًا لكل منشأة جديدة بقيود) — غيّرهما فقط لو تأكدت أن منشأة هذا العميل تستخدم رمزين مختلفين فعليًا.", en: "Default 1 and 2 (system-fixed for every new Qoyod company) — change only if this client's company actually uses different codes." })}
                </p>
              </div>

              <p className="mb-2 text-xs leading-relaxed" style={{ color: "#64748B" }}>
                {t({
                  ar: "تحديد يدوي اختياري: لو الاكتشاف التلقائي بالاسم لم يجد الحساب الصحيح (اسمه بشجرة هذا العميل مختلف)، اختره مباشرةً من القائمة — يتجاوز الاكتشاف التلقائي فوراً، ويعمل الاكتشاف التلقائي كاملاً كالمعتاد لأي حساب تتركه \"تلقائي\".",
                  en: "Optional manual override: if automatic name detection didn't find the right account (this client's tree names it differently), pick it directly from the list — it takes priority immediately, while any account left on \"Automatic\" keeps working exactly as before.",
                })}
              </p>
              <div className="mb-4 grid gap-4 sm:grid-cols-3">
                <SystemAccountOverride
                  label={{ ar: "حساب ضريبة القيمة المضافة المستحقة", en: "VAT payable account" }}
                  chartAccountsList={chartAccounts || []} parentCodes={parentInfo.parentCodes}
                  value={manualVatCode} onChange={setManualVatCode}
                  autoCodes={autoVatCodes} chartMap={chartMap}
                />
                <SystemAccountOverride
                  label={{ ar: "حساب المدينون الافتراضي", en: "Default Debtors account" }}
                  chartAccountsList={chartAccounts || []} parentCodes={parentInfo.parentCodes}
                  value={manualDebtorsCode} onChange={setManualDebtorsCode}
                  autoCodes={autoDebtorsCodes} chartMap={chartMap}
                />
                <SystemAccountOverride
                  label={{ ar: "حساب الدائنون الافتراضي", en: "Default Creditors account" }}
                  chartAccountsList={chartAccounts || []} parentCodes={parentInfo.parentCodes}
                  value={manualCreditorsCode} onChange={setManualCreditorsCode}
                  autoCodes={autoCreditorsCodes} chartMap={chartMap}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <UploadCard title={{ ar: "ملف العملاء المرجعي (اختياري)", en: "Customers reference file (optional)" }} subtitle={{ ar: "عمودان: اسم العميل + الرقم المرجعي", en: "Two columns: customer name + reference number" }}
                  fileName={customersRefFileName} ok={!!customersRefList} busy={customersRefBusy}
                  count={customersRefList ? t({ ar: `${customersRefList.length} عميل`, en: `${customersRefList.length} customers` }) : ""} onFile={handleCustomersRefUpload} />
                <UploadCard title={{ ar: "ملف الموردين المرجعي (اختياري)", en: "Suppliers reference file (optional)" }} subtitle={{ ar: "عمودان: اسم المورد + الرقم المرجعي", en: "Two columns: supplier name + reference number" }}
                  fileName={suppliersRefFileName} ok={!!suppliersRefList} busy={suppliersRefBusy}
                  count={suppliersRefList ? t({ ar: `${suppliersRefList.length} مورد`, en: `${suppliersRefList.length} suppliers` }) : ""} onFile={handleSuppliersRefUpload} />
              </div>
            </div>
          )}
        </div>

        {rawEntriesRows && !showColumnMapper && (
          <div className="mb-6 -mt-2">
            <button
              onClick={() => { setColumnMapping(guessEntriesColumnMapping(rawEntriesRows)); setShowColumnMapper(true); }}
              className="text-xs font-semibold underline"
              style={{ color: "#B98227" }}
            >
              {t({ ar: "تحديد أعمدة ملف القيود يدويًا", en: "Manually map journal entry columns" })}
            </button>
          </div>
        )}

        {showColumnMapper && rawEntriesRows && columnMapping && (
          <ColumnMapperPanel
            rows={rawEntriesRows}
            mapping={columnMapping}
            onChange={setColumnMapping}
            onApply={applyColumnMapping}
            onCancel={() => setShowColumnMapper(false)}
          />
        )}

        {parseError && (
          <div className="mb-6 flex items-center gap-2 rounded-md border px-4 py-2 text-sm whitespace-pre-wrap" style={{ borderColor: COLORS.red, color: COLORS.red }}>
            <XCircle size={16} /> {parseError}
          </div>
        )}

        {ready && (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <SummaryStat label={{ ar: "إجمالي القيود", en: "Total Entries" }} value={totalEntries} color={COLORS.teal} active={filter === "all"} onClick={() => { setFilter("all"); setPage(0); }} />
              <SummaryStat label={{ ar: "قيود سليمة", en: "Valid Entries" }} value={totalEntries - entriesWithIssues} color={COLORS.green} active={filter === "ok"} onClick={() => { setFilter("ok"); setPage(0); }} />
              <SummaryStat label={{ ar: "قيود بها مشاكل", en: "Entries with Issues" }} value={entriesWithIssues} color={totalOpenIssues > 0 ? COLORS.red : COLORS.green} active={filter === "error"} onClick={() => { setFilter("error"); setPage(0); }} />
            </div>
            {applicableCount > 0 && (
              <button onClick={() => applyAllSuggestions()} className="mb-4 rounded-md px-4 py-2 text-sm font-semibold text-white" style={{ background: "#B98227" }}>
                {t({ ar: `تطبيق جميع المقترحات (${applicableCount})`, en: `Apply all suggestions (${applicableCount})` })}
              </button>
            )}

            <div className="mb-3">
              <div className="relative">
                <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2" style={{ color: "#94A3B8" }} />
                {/* [إصلاح أقوى — انظر تعليق searchUnlocked أعلاه] readOnly حتى أول focus + type="search"
                    (بدل text) يمنعان فعلياً تعبية Chrome التلقائية بإيميل المستخدم المحفوظ؛
                    autoComplete="off" + name فريد + data-lpignore/data-1p-ignore إضافة احترازية. */}
                <input ref={searchInputRef} type="search" name="qoyod-journal-search-no-autofill"
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false"
                  data-lpignore="true" data-1p-ignore="true" data-form-type="other"
                  readOnly={!searchUnlocked} onFocus={() => setSearchUnlocked(true)}
                  value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                  placeholder={t({ ar: "بحث بالرمز، اسم الحساب، التاريخ، التعليق...", en: "Search by code, account name, date, comment..." })}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] py-2 pe-3 ps-9 text-xs text-[#0F172A] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  style={{ direction: dir }} />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(""); setPage(0); }} className="absolute end-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]">
                    <X size={14} />
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-[#94A3B8]">{t({ ar: "Ctrl+F للبحث السريع", en: "Ctrl+F for quick search" })}</p>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {filters.map(({ key, label }) => (
                <button key={key} onClick={() => { setFilter(key); setPage(0); }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    filter === key ? "border-[#12B886] bg-[#12B886] text-white" : "border-[#E2E8F0] bg-[#FFFFFF] text-[#64748B] hover:border-[#15803D]"
                  }`}>
                  {t(label)}
                </button>
              ))}
              {totalPages > 1 && (
                <div className="ms-auto flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                    className="rounded border p-1 disabled:opacity-30" style={{ borderColor: COLORS.line }}>
                    <ChevronRight size={14} />
                  </button>
                  <span className="px-2 text-xs font-medium" style={{ color: "#64748B" }}>
                    {page + 1} / {totalPages}
                  </span>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    className="rounded border p-1 disabled:opacity-30" style={{ borderColor: COLORS.line }}>
                    <ChevronLeft size={14} />
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {pagedEntries.map((entry) => {
                const issues = issuesBySeq[entry.seq] || [];
                const isOpen = expanded[entry.seq] ?? issues.length > 0;
                return (
                  <EntryCard key={entry.seq} entry={entry} issues={issues} isOpen={isOpen} parentCodes={parentInfo.parentCodes}
                    onToggle={() => toggleExpand(entry.seq)}
                    chartAccountsList={chartAccounts} onUpdateRow={updateRow} onUpdateMeta={updateEntryMeta}
                    onApplySuggestion={applySuggestion} onApplyDateSuggestion={applyDateSuggestion} onApplyAllSuggestions={applyAllSuggestions} onDismiss={dismissIssue} />
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                  className="btn-secondary rounded border px-3 py-1.5 text-xs disabled:opacity-30" style={{ borderColor: COLORS.line }}>
                  <ChevronRight size={14} /> {t({ ar: "السابق", en: "Previous" })}
                </button>
                <span className="px-3 text-xs font-medium" style={{ color: "#64748B" }}>
                  {t({ ar: `صفحة ${page + 1} من ${totalPages}`, en: `Page ${page + 1} of ${totalPages}` })}
                </span>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="btn-secondary rounded border px-3 py-1.5 text-xs disabled:opacity-30" style={{ borderColor: COLORS.line }}>
                  {t({ ar: "التالي", en: "Next" })} <ChevronLeft size={14} />
                </button>
              </div>
            )}

            <div className="mt-8 flex flex-col items-center gap-2 border-t pt-6" style={{ borderColor: COLORS.line }}>
              {totalOpenIssues > 0 && (
                <p className="flex items-center gap-1 text-xs" style={{ color: COLORS.amber }}>
                  <AlertTriangle size={14} /> {t({ ar: `ما زال هناك ${totalOpenIssues} خطأ لم يُحل — يمكنك التنزيل بعد المراجعة`, en: `There are still ${totalOpenIssues} unresolved issues — you can download after review` })}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <label className="flex items-center gap-2 text-xs" style={{ color: "#64748B" }}>
                  {t({ ar: "ترتيب التصدير:", en: "Export order:" })}
                  <select value={exportSort} onChange={(event) => setExportSort(event.target.value)} className="rounded border px-2 py-1" style={{ borderColor: "#233152", background: "#0E1830", color: "#E6EDF6" }}>
                    <option value="number">{t({ ar: "رقم القيد", en: "Entry number" })}</option>
                    <option value="date">{t({ ar: "التاريخ", en: "Date" })}</option>
                  </select>
                </label>
                <button onClick={handleDownload} disabled={downloading}
                   className="btn-primary flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: COLORS.teal }}>
                  {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {t({ ar: "تنزيل الملف الجاهز", en: "Download prepared file" })}
                </button>
                <button onClick={copyToClipboard} className="btn-secondary flex items-center gap-2 rounded-md border px-5 py-2.5 text-sm font-semibold" style={{ borderColor: COLORS.green, color: COLORS.green }}>
                  <Copy size={16} /> {t({ ar: "نسخ البيانات", en: "Copy data" })}
                </button>
              </div>
              {copyStatus === "copied" && <span className="flex items-center gap-1 text-xs" style={{ color: COLORS.green }}><CheckCircle2 size={14} /> {t({ ar: "تم النسخ", en: "Copied" })}</span>}
              {showManualCopy && (
                <textarea readOnly dir="ltr" value={buildPasteText(entries)} onFocus={(e) => e.target.select()}
                  className="mt-1 h-32 w-full max-w-md rounded border p-2 font-mono text-xs" style={{ borderColor: COLORS.line, background: "#F1F5F9", color: "#0F172A" }} />
              )}
              <p className="mx-auto mt-1 max-w-md text-center text-[11px] leading-relaxed" style={{ color: "#94A3B8" }}>
                {t({ ar: "الملف مبني مباشرة فوق نسخة قالب قيود الرسمي — التنسيق محفوظ 100% تلقائياً.", en: "The file is built directly on Qoyod's official import template — formatting is preserved 100% automatically." })}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
