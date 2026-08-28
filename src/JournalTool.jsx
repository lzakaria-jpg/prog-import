import React, { useState, useMemo, useRef, useCallback, useEffect, memo } from "react";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Loader2,
  Download, ChevronDown, ChevronUp, Info, RefreshCcw, Copy,
  ChevronLeft, ChevronRight, Search, X,
} from "lucide-react";
import { readWorkbookRows, readAnyEntriesFileRows, parseChartFile, parseEntriesFile, buildParentInfo, validateEntryStructure, getPostingSuggestions, getPostingDescendants, normalizeDateGuess, _parseDebug } from "./lib/excelCore";
import { buildImportFile, downloadBlob, buildPasteText } from "./lib/excelExport";
import { useLanguage } from "./language";
import { useAuth } from "./auth";
import { trackJournalImport, trackJournalExport, trackJournalError } from "./activityTracker";

const COLORS = {
  paper: "#0B1120", ink: "#E6EDF6", teal: "#12B886", tealLight: "#20D9A0",
  gold: "#FBBF24", amber: "#FBBF24", red: "#FB7185", green: "#34E0A0", line: "#233152",
};

const PAGE_SIZE = 50;

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
      style={{ borderColor: ok ? COLORS.green : COLORS.line, background: "#111A2E" }}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept={accept || ".xlsx,.xls"} className="hidden"
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      <div className="flex flex-col items-center gap-1">
        {busy ? <Loader2 size={26} className="animate-spin" style={{ color: COLORS.teal }} />
          : ok ? <CheckCircle2 size={26} style={{ color: COLORS.green }} /> : <Upload size={26} style={{ color: COLORS.teal }} />}
        <p className="text-sm font-semibold">{t(title)}</p>
        <p className="text-xs" style={{ color: "#8CA3C1" }}>{t(subtitle)}</p>
        {fileName && (
          <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: COLORS.tealLight }}>
            <FileSpreadsheet size={12} /> {fileName} {count && `— ${count}`}
          </p>
        )}
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
          background: active ? "rgba(18,184,134,0.12)" : "#111A2E",
          boxShadow: active ? "0 0 0 2px rgba(18,184,134,.35)" : "none",
        }}>
        <p className="text-2xl font-bold" style={{ color }}>{value}</p>
        <p className="text-xs" style={{ color: "#8CA3C1" }}>{t(label)}</p>
      </div>
    </button>
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
  return (
    <div className="relative">
      <input
        value={query || value || ""}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={t({ ar: "رمز الحساب", en: "Account code" })} dir="ltr"
        className="w-full rounded-md border px-2 py-1.5 text-sm font-mono text-start focus:outline-none focus:ring-1 focus:ring-blue-500"
        style={{ borderColor: hasError ? COLORS.red : COLORS.line, background: "#0E1830", color: "#E6EDF6" }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-72 overflow-y-auto rounded-md border shadow-lg" style={{ borderColor: COLORS.line, background: "#111A2E", insetInlineStart: 0 }}>
          {filtered.map((a) => (
            <div key={a.code} onMouseDown={() => { onChange(a.code); setQuery(""); setOpen(false); }}
              className="cursor-pointer px-3 py-1.5 text-sm hover:bg-[#14213B] text-start">
              <span className="font-mono me-2" style={{ color: COLORS.teal }}>{a.code}</span> {a.name}
            </div>
          ))}
        </div>
      )}
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
    <div className="card overflow-hidden rounded-lg border transition-all" style={{ borderColor: COLORS.line, background: "#111A2E" }}>
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-[#14213B] transition-colors">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: statusColor }}>
            {issues.length === 0 ? <CheckCircle2 size={14} /> : issues.length}
          </span>
          <div>
            <p className="text-sm font-semibold">{t(T)} #{entry.seq} — {entry.desc || t({ ar: "بدون وصف", en: "No description" })}</p>
            <p className="text-xs" style={{ color: "#8CA3C1" }}>{entry.date || t({ ar: "بدون تاريخ", en: "No date" })}</p>
          </div>
        </div>
        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {isOpen && (
        <div className="border-t px-4 py-3" style={{ borderColor: COLORS.line }}>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1">{t({ ar: "التاريخ:", en: "Date:" })}
              <input dir="ltr" value={entry.date || ""} onChange={(e) => onUpdateMeta(entry.seq, "date", e.target.value)}
                placeholder="dd/mm/yyyy" className="rounded border px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" style={{ borderColor: COLORS.line, background: "#0E1830", color: "#E6EDF6", width: 100 }} />
            </label>
            <label className="flex flex-1 items-center gap-1">{t({ ar: "الوصف:", en: "Description:" })}
              <input value={entry.desc || ""} onChange={(e) => onUpdateMeta(entry.seq, "desc", e.target.value)}
                className="flex-1 rounded border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" style={{ borderColor: COLORS.line, background: "#0E1830", color: "#E6EDF6" }} />
            </label>
          </div>
          <table className="mb-3 w-full text-xs">
            <thead><tr style={{ color: "#8CA3C1" }}>
              <th className="pb-1 text-start font-medium">{t({ ar: "الرمز", en: "Code" })}</th>
              <th className="pb-1 text-start font-medium">{t({ ar: "اسم الحساب", en: "Account" })}</th>
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
                      <input dir="ltr" value={r.debit ?? ""} onChange={(e) => onUpdateRow(entry.seq, r._rowIndex, "debit", e.target.value === "" ? null : parseFloat(e.target.value))}
                        className="w-20 rounded border px-1.5 py-1 font-mono text-start focus:outline-none focus:ring-1 focus:ring-blue-500" style={{ borderColor: COLORS.line, background: "#0E1830", color: "#E6EDF6" }} />
                    </td>
                    <td className="py-1.5 pe-2">
                      <input dir="ltr" value={r.credit ?? ""} onChange={(e) => onUpdateRow(entry.seq, r._rowIndex, "credit", e.target.value === "" ? null : parseFloat(e.target.value))}
                        className="w-20 rounded border px-1.5 py-1 font-mono text-start focus:outline-none focus:ring-1 focus:ring-blue-500" style={{ borderColor: COLORS.line, background: "#0E1830", color: "#E6EDF6" }} />
                    </td>
                    <td className="py-1.5">
                      <input value={r.comment || ""} onChange={(e) => onUpdateRow(entry.seq, r._rowIndex, "comment", e.target.value)}
                        className="w-full rounded border px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" style={{ borderColor: COLORS.line, background: "#0E1830", color: "#E6EDF6" }} />
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
                        <span className="text-left text-[11px] font-semibold" style={{ direction: "ltr", color: s.confidence === "high" ? "#34E0A0" : "#FBBF24" }}>{s.code} — {s.name}</span>
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
                        <span className="text-left text-[11px] font-semibold" style={{ color: "#34E0A0" }}>{s.code} — {s.name}</span>
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
  const [expanded, setExpanded] = useState({});
  const [copyStatus, setCopyStatus] = useState("");
  const [showManualCopy, setShowManualCopy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [resolvedIds, setResolvedIds] = useState({});
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
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
    return issues;
  }, [chartAccounts, chartMap, parentInfo, postingAccounts]);

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

  const handleEntriesUpload = async (file) => {
    setParseError(""); setEntriesFileName(file.name); setEntriesBusy(true);
    try {
      const rows = await readAnyEntriesFileRows(file);
      const grouped = parseEntriesFile(rows);
      if (grouped.length === 0) throw new Error("تم التعرف على تنسيق الملف لكن لم يتم العثور على أي قيود بداخله\n\nتفاصيل الفحص:\n" + (_parseDebug.info || ""));
      setEntries(grouped);
      setExpanded({});
      setResolvedIds({});
      setStructuralIssuesBySeq({});
      suggestionCacheRef.current.clear();
      setAuditVersion((version) => version + 1);
      setPage(0);
      setFilter("all");
      if (currentUser) trackJournalImport(currentUser, { filename: file.name, entries_count: grouped.length });
    } catch (err) {
      setParseError(localizeError("خطأ في قراءة ملف القيود: " + err.message, lang));
      setEntries(null);
      if (currentUser) trackJournalError(currentUser, { filename: file.name, error: err.message });
    } finally { setEntriesBusy(false); }
  };

  const updateRow = useCallback((seq, rowIndex, field, value) => {
    const currentEntry = entries?.find((entry) => entry.seq === seq);
    if (currentEntry) {
      const updatedEntry = {
        ...currentEntry,
        rows: currentEntry.rows.map((row) => row._rowIndex === rowIndex ? { ...row, [field]: value } : row),
      };
      setStructuralIssuesBySeq((previous) => ({ ...previous, [seq]: buildStructuralIssues(updatedEntry) }));
    }
    setResolvedIds((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !id.startsWith(`${seq}-`))));
    setEntries((prev) => prev.map((entry) => entry.seq !== seq ? entry :
      { ...entry, rows: entry.rows.map((r) => r._rowIndex === rowIndex ? { ...r, [field]: value } : r) }));
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
            <p className="mt-1 text-sm" style={{ color: "#8CA3C1" }}>{t({ ar: "ارفع شجرة الحسابات وملف القيود، وسيتم فحصها وتجهيزها للاستيراد تلقائياً", en: "Upload the chart of accounts and the journal file — they will be audited and prepared for import automatically" })}</p>
          </div>
          {(chartAccounts || entries) && (
            <button onClick={resetAll} className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: COLORS.line, color: COLORS.tealLight }}>
              <RefreshCcw size={14} /> {t({ ar: "بدء من جديد", en: "Start over" })}
            </button>
          )}
        </div>

        <div className="mb-6 flex items-start gap-2 rounded-lg border px-4 py-3 text-xs leading-relaxed" style={{ borderColor: "#2E4068", background: "rgba(125,211,252,0.08)" }}>
          <Info size={16} className="mt-0.5 shrink-0" style={{ color: "#7DD3FC" }} />
          <div style={{ color: "#8CA3C1" }}>
            {t({ ar: "المعايير المعتمدة: صيغة التاريخ dd/mm/yyyy · مدين = دائن لكل قيد · إجمالي القيد لا يجوز أن يكون صفراً · لا يجوز الترحيل على حساب رئيسي له حسابات فرعية.", en: "Accepted rules: date format dd/mm/yyyy · debit = credit per entry · entry total may not be zero · posting to a parent account with children is not allowed." })}
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <UploadCard title={{ ar: "شجرة الحسابات", en: "Chart of Accounts" }} subtitle={{ ar: "ملف الحسابات الخاص بالعميل", en: "Client's chart of accounts file" }} fileName={chartFileName} ok={!!chartAccounts} busy={chartBusy}
            count={chartAccounts ? t({ ar: `${chartAccounts.length} حساب`, en: `${chartAccounts.length} accounts` }) : ""} onFile={handleChartUpload} />
          <UploadCard title={{ ar: "القيود المراد استيرادها", en: "Journal Entries to Import" }} subtitle={{ ar: "Excel، PDF، أو Word — أي ترتيب أعمدة", en: "Excel, PDF, or Word — any column order" }} fileName={entriesFileName} ok={!!entries} busy={entriesBusy}
            count={entries ? t({ ar: `${entries.length} قيد`, en: `${entries.length} entries` }) : ""} onFile={handleEntriesUpload} accept=".xlsx,.xls,.pdf,.docx" />
        </div>

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
                <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2" style={{ color: "#5C7196" }} />
                <input ref={searchInputRef} type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                  placeholder={t({ ar: "بحث بالرمز، اسم الحساب، التاريخ، التعليق...", en: "Search by code, account name, date, comment..." })}
                  className="w-full rounded-lg border border-[#233152] bg-[#0E1830] py-2 pe-3 ps-9 text-xs text-[#E6EDF6] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  style={{ direction: dir }} />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(""); setPage(0); }} className="absolute end-3 top-1/2 -translate-y-1/2 text-[#5C7196] hover:text-[#8CA3C1]">
                    <X size={14} />
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-[#5C7196]">{t({ ar: "Ctrl+F للبحث السريع", en: "Ctrl+F for quick search" })}</p>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {filters.map(({ key, label }) => (
                <button key={key} onClick={() => { setFilter(key); setPage(0); }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    filter === key ? "border-[#12B886] bg-[#12B886] text-white" : "border-[#233152] bg-[#111A2E] text-[#8CA3C1] hover:border-[#20D9A0]"
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
                  <span className="px-2 text-xs font-medium" style={{ color: "#8CA3C1" }}>
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
                <span className="px-3 text-xs font-medium" style={{ color: "#8CA3C1" }}>
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
                <label className="flex items-center gap-2 text-xs" style={{ color: "#8CA3C1" }}>
                  {t({ ar: "ترتيب التصدير:", en: "Export order:" })}
                  <select value={exportSort} onChange={(event) => setExportSort(event.target.value)} className="rounded border px-2 py-1" style={{ borderColor: COLORS.line, background: "#0E1830", color: "#E6EDF6" }}>
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
                  className="mt-1 h-32 w-full max-w-md rounded border p-2 font-mono text-xs" style={{ borderColor: COLORS.line, background: "#0E1830", color: "#E6EDF6" }} />
              )}
              <p className="mx-auto mt-1 max-w-md text-center text-[11px] leading-relaxed" style={{ color: "#5C7196" }}>
                {t({ ar: "الملف مبني مباشرة فوق نسخة قالب قيود الرسمي — التنسيق محفوظ 100% تلقائياً.", en: "The file is built directly on Qoyod's official import template — formatting is preserved 100% automatically." })}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
