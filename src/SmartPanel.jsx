import React, { useState } from "react";
import { useLanguage } from "./language";
import { fullAnalysis, autoFixEntries, generateTemplates, findSimilarAccounts, buildAccountTree } from "./ruleEngine";
import { Wand2, Zap, FileText, AlertCircle, Check, Loader2, ChevronDown, ChevronUp, Search, Lightbulb } from "lucide-react";

export function SmartAnalysisPanel({ entries, chartOfAccounts, onApplyFixes }) {
  const { lang, t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("analyze");
  const [expandedError, setExpandedError] = useState(null);

  const tabs = [
    { id: "analyze", label: { ar: "تحليل", en: "Analyze" }, icon: Wand2 },
    { id: "fix", label: { ar: "تصحيح تلقائي", en: "Auto Fix" }, icon: Zap },
    { id: "templates", label: { ar: "قوالب", en: "Templates" }, icon: FileText },
  ];

  const handleAnalyze = () => {
    setLoading(true);
    setTimeout(() => {
      try {
        const r = fullAnalysis(entries, chartOfAccounts);
        setResult(r);
      } catch (e) { setResult({ error: e.message }); }
      setLoading(false);
    }, 100);
  };

  const handleAutoFix = () => {
    setLoading(true);
    setTimeout(() => {
      try {
        const r = autoFixEntries(entries, chartOfAccounts);
        setResult(r);
      } catch (e) { setResult({ error: e.message }); }
      setLoading(false);
    }, 100);
  };

  const handleTemplates = () => {
    setLoading(true);
    setTimeout(() => {
      try {
        const r = generateTemplates(chartOfAccounts);
        setResult(r);
      } catch (e) { setResult({ error: e.message }); }
      setLoading(false);
    }, 100);
  };

  const handleApplyFixes = () => {
    if (result && result.fixes && onApplyFixes) {
      onApplyFixes(result.fixes);
      handleAutoFix(); // Refresh
    }
  };

  return (
    <div style={{ border: "1px solid #233152", borderRadius: 16, overflow: "hidden", background: "#111A2E" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #233152", background: "#16213A" }}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setActiveTab(id); setResult(null); }}
            style={{ flex: 1, padding: "12px 8px", border: "none", background: activeTab === id ? "#111A2E" : "transparent", color: activeTab === id ? "#12B886" : "#5C7196", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderBottom: activeTab === id ? "2px solid #12B886" : "2px solid transparent", transition: "all 0.2s" }}>
            <Icon size={14} /> {t(label)}
          </button>
        ))}
      </div>

      <div style={{ padding: 20 }}>
        {/* Info badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(125,211,252,0.08)", border: "1px solid #2E4068", marginBottom: 16, fontSize: 12, color: "#7DD3FC" }}>
          <Lightbulb size={14} />
          <span>{t({ ar: "تحليل محاسبي ذكي بدون إنترنت - البيانات لا تغادر جهازك", en: "Smart accounting analysis offline - data stays on your device" })}</span>
        </div>

        {/* Action button */}
        <button
          onClick={activeTab === "analyze" ? handleAnalyze : activeTab === "fix" ? handleAutoFix : handleTemplates}
          disabled={loading || !entries || entries.length === 0}
          style={{ width: "100%", padding: "12px", borderRadius: 10, background: "linear-gradient(135deg, #12B886, #0A9B72)", color: "#FFF", fontSize: 14, fontWeight: 600, border: "none", cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: (loading || !entries || entries.length === 0) ? 0.6 : 1, marginBottom: 16 }}>
          {loading ? <><Loader2 size={16} className="animate-spin" /> {t({ ar: "جاري التحليل...", en: "Analyzing..." })}</>
            : activeTab === "analyze" ? <><Wand2 size={16} /> {t({ ar: "تحليل القيود", en: "Analyze Entries" })}</>
            : activeTab === "fix" ? <><Zap size={16} /> {t({ ar: "كشف وتصحيح", en: "Detect & Fix" })}</>
            : <><FileText size={16} /> {t({ ar: "توليد القوالب", en: "Generate Templates" })}</>}
        </button>

        {!entries || entries.length === 0 ? (
          <p style={{ textAlign: "center", color: "#5C7196", fontSize: 13 }}>{t({ ar: "ارفع ملف القيود أولاً", en: "Upload journal entries file first" })}</p>
        ) : null}

        {result && result.error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(251,113,133,0.12)", color: "#FB7185", fontSize: 12, marginBottom: 12 }}>
            <AlertCircle size={14} /> {result.error}
          </div>
        )}

        {/* ── Analysis Results ────────────────────────────── */}
        {result && activeTab === "analyze" && result.errors !== undefined && (
          <div>
            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
              <div style={{ padding: "12px", borderRadius: 10, background: result.parent_account_errors > 0 ? "rgba(251,113,133,0.12)" : "rgba(34,211,138,0.12)", textAlign: "center" }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: result.parent_account_errors > 0 ? "#FB7185" : "#34E0A0", margin: 0 }}>{result.parent_account_errors}</p>
                <p style={{ fontSize: 10, color: "#8CA3C1", margin: 0 }}>{t({ ar: "حسابات أب", en: "Parent Accounts" })}</p>
              </div>
              <div style={{ padding: "12px", borderRadius: 10, background: result.high_confidence_fixes > 0 ? "rgba(251,191,36,0.12)" : "rgba(34,211,138,0.12)", textAlign: "center" }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#FBBF24", margin: 0 }}>{result.high_confidence_fixes}</p>
                <p style={{ fontSize: 10, color: "#8CA3C1", margin: 0 }}>{t({ ar: "تصحيح مؤكد", en: "Auto-fixable" })}</p>
              </div>
              <div style={{ padding: "12px", borderRadius: 10, background: result.common_errors > 0 ? "rgba(251,113,133,0.12)" : "rgba(34,211,138,0.12)", textAlign: "center" }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: result.common_errors > 0 ? "#FB7185" : "#34E0A0", margin: 0 }}>{result.common_errors}</p>
                <p style={{ fontSize: 10, color: "#8CA3C1", margin: 0 }}>{t({ ar: "أخطاء أخرى", en: "Other Errors" })}</p>
              </div>
            </div>

            {/* Error list */}
            {result.errors.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {result.errors.map((err, i) => (
                  <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(251,113,133,0.12)", border: "1px solid rgba(251,113,133,0.35)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setExpandedError(expandedError === i ? null : i)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: err.error_type === "parent_account_entry" ? "rgba(251,191,36,0.2)" : "rgba(251,113,133,0.2)", color: err.error_type === "parent_account_entry" ? "#FBBF24" : "#FB7185", fontWeight: 600 }}>
                          {err.error_type === "parent_account_entry" ? t({ ar: "حساب أب", en: "Parent" }) : err.error_type === "unknown_account" ? t({ ar: "غير موجود", en: "Unknown" }) : err.error_type === "duplicate_entry" ? t({ ar: "مكرر", en: "Duplicate" }) : t({ ar: "خطأ", en: "Error" })}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#E6EDF6", direction: "ltr" }}>{err.account_code}</span>
                      </div>
                      {expandedError === i ? <ChevronUp size={14} color="#5C7196" /> : <ChevronDown size={14} color="#5C7196" />}
                    </div>
                    {expandedError === i && (
                      <div style={{ marginTop: 8 }}>
                        <p style={{ fontSize: 12, color: "#8CA3C1", marginBottom: 6 }}>{err.description}</p>
                        {err.suggestion && (
                          <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(34,211,138,0.12)", border: "1px solid rgba(34,211,138,0.35)", fontSize: 12 }}>
                            <span style={{ color: "#34E0A0", fontWeight: 600 }}>{t({ ar: "الحساب المقترح:", en: "Suggested:" })} </span>
                            <span style={{ color: "#34E0A0", direction: "ltr" }}>{err.suggestion.account_code} - {err.suggestion.account_name}</span>
                            <span style={{ display: "inline-block", marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 8, background: err.suggestion.confidence === "high" ? "rgba(34,211,138,0.2)" : err.suggestion.confidence === "medium" ? "rgba(251,191,36,0.2)" : "rgba(251,113,133,0.2)", color: err.suggestion.confidence === "high" ? "#34E0A0" : err.suggestion.confidence === "medium" ? "#FBBF24" : "#FB7185" }}>
                              {err.suggestion.confidence === "high" ? t({ ar: "عالي", en: "High" }) : err.suggestion.confidence === "medium" ? t({ ar: "متوسط", en: "Med" }) : t({ ar: "منخفض", en: "Low" })}
                            </span>
                          </div>
                        )}
                        {err.child_count && (
                          <p style={{ fontSize: 11, color: "#5C7196", marginTop: 4 }}>{t({ ar: `(${err.child_count} حساب فرعي متاح)`, en: `(${err.child_count} child accounts available)` })}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "24px 16px", background: "rgba(34,211,138,0.12)", borderRadius: 12, border: "1px solid rgba(34,211,138,0.35)" }}>
                <Check size={32} color="#34E0A0" style={{ margin: "0 auto 8px" }} />
                <p style={{ fontSize: 14, fontWeight: 700, color: "#34E0A0", margin: 0 }}>{t({ ar: "ممتاز! لا توجد أخطاء", en: "No errors found!" })}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Auto Fix Results ────────────────────────────── */}
        {result && activeTab === "fix" && result.fixes !== undefined && (
          <div>
            {result.fixes.length > 0 ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#12B886", marginBottom: 10 }}>
                  {t({ ar: `تم العثور على ${result.fixes.length} قيد يُمكن تصحيحه تلقائياً:`, en: `${result.fixes.length} entries can be auto-fixed:` })}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {result.fixes.map((fix, i) => (
                    <div key={i} style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 8, background: fix.confidence === "high" ? "rgba(34,211,138,0.2)" : "rgba(251,191,36,0.2)", color: fix.confidence === "high" ? "#34E0A0" : "#FBBF24", fontWeight: 600 }}>
                          {fix.confidence === "high" ? t({ ar: "مؤكد", en: "Confirmed" }) : t({ ar: "مقترح", en: "Suggested" })}
                        </span>
                        <span style={{ color: "#8CA3C1", fontSize: 10 }}>#{fix.original_index + 1}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "#FB7185", textDecoration: "line-through", fontWeight: 600, direction: "ltr" }}>{fix.original_account_code}</span>
                        <span style={{ color: "#34E0A0" }}>→</span>
                        <span style={{ color: "#34E0A0", fontWeight: 600, direction: "ltr" }}>{fix.new_account_code}</span>
                        <span style={{ color: "#8CA3C1" }}>- {fix.new_account_name}</span>
                      </div>
                      {fix.reason && <p style={{ fontSize: 11, color: "#FBBF24", margin: "6px 0 0", lineHeight: 1.5 }}>{fix.reason}</p>}
                      {fix.alternatives && fix.alternatives.length > 1 && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed rgba(251,191,36,0.35)" }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: "#FBBF24", margin: "0 0 4px" }}>{t({ ar: "حسابات بديلة مقترحة:", en: "Alternative suggestions:" })}</p>
                          {fix.alternatives.map((alt, ai) => (
                            <span key={ai} style={{ display: "inline-block", margin: "0 4px 4px 0", padding: "2px 8px", borderRadius: 8, fontSize: 10, direction: "ltr", background: alt.score >= 0.7 ? "rgba(34,211,138,0.2)" : alt.score >= 0.4 ? "rgba(251,191,36,0.2)" : "#16213A", color: alt.score >= 0.7 ? "#34E0A0" : alt.score >= 0.4 ? "#FBBF24" : "#8CA3C1" }}>
                              {alt.code} · {alt.name} ({Math.round(alt.score * 100)}%)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={handleApplyFixes} style={{ width: "100%", padding: "10px", borderRadius: 8, background: "#12B886", color: "#FFF", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Check size={14} /> {t({ ar: "تطبيق التصحيحات على القيود", en: "Apply Fixes to Entries" })}
                </button>
              </>
            ) : result.skipped && result.skipped.length > 0 ? (
              <div>
                <p style={{ fontSize: 13, color: "#8CA3C1", marginBottom: 10 }}>
                  {t({ ar: `تم فحص ${result.fixes.length + result.skipped.length} قيد. لا يوجد تصحيحات مؤكدة.`, en: `Checked ${result.fixes.length + result.skipped.length} entries. No confirmed fixes.` })}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {result.skipped.slice(0, 10).map((s, i) => (
                    <p key={i} style={{ fontSize: 11, color: "#5C7196" }}>#{s.index + 1}: {s.reason}</p>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "24px 16px", background: "rgba(34,211,138,0.12)", borderRadius: 12 }}>
                <Check size={32} color="#34E0A0" style={{ margin: "0 auto 8px" }} />
                <p style={{ fontSize: 14, fontWeight: 700, color: "#34E0A0", margin: 0 }}>{t({ ar: "لا يحتاج تصحيح!", en: "Nothing to fix!" })}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Templates Results ────────────────────────────── */}
        {result && activeTab === "templates" && result.templates && (
          <div>
            {result.templates.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {result.templates.map((tpl, i) => (
                  <div key={i} style={{ padding: "14px", borderRadius: 12, background: "#16213A", border: "1px solid #233152" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#12B886", marginBottom: 2 }}>{tpl.name}</p>
                    <p style={{ fontSize: 11, color: "#8CA3C1", marginBottom: 10 }}>{tpl.description}</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {tpl.entries.map((e, j) => (
                        <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, padding: "6px 8px", borderRadius: 6, background: e.debit > 0 ? "rgba(125,211,252,0.08)" : "rgba(251,191,36,0.08)", direction: "ltr" }}>
                          <span>{e.account_code} - {e.account_name}</span>
                          <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{e.debit > 0 ? `Dr ${e.debit.toLocaleString()}` : `Cr ${(e.credit || 0).toLocaleString()}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: "center", color: "#5C7196", fontSize: 13, padding: 16 }}>{t({ ar: "ارفع شجرة الحسابات أولاً لتوليد القوالب", en: "Upload chart of accounts to generate templates" })}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Smart Account Search ──────────────────────────────────────────────────

export function SmartAccountSearch({ chartOfAccounts, onSelect }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  const handleSearch = (val) => {
    setQuery(val);
    if (val.length < 2) { setResults([]); return; }
    const r = findSimilarAccounts(val, chartOfAccounts, 8);
    setResults(r);
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#5C7196" }} />
        <input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t({ ar: "بحث ذكي عن حساب...", en: "Smart account search..." })}
          style={{ width: "100%", padding: "10px 10px 10px 32px", borderRadius: 8, border: "1px solid #233152", background: "#0E1830", color: "#E6EDF6", fontSize: 13, outline: "none", direction: "ltr" }}
        />
      </div>
      {results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "#111A2E", border: "1px solid #233152", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", maxHeight: 200, overflow: "auto", marginTop: 4 }}>
          {results.map((r) => (
            <div key={r.code} onClick={() => { onSelect(r); setQuery(""); setResults([]); }}
              style={{ padding: "8px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, borderBottom: "1px solid #233152", transition: "background 0.15s" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#14213B"}
              onMouseLeave={(e) => e.currentTarget.style.background = "#111A2E"}>
              <div>
                <span style={{ fontWeight: 600, direction: "ltr" }}>{r.code}</span>
                <span style={{ color: "#8CA3C1", marginInlineStart: 8 }}>{r.name}</span>
              </div>
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: r.score > 0.7 ? "rgba(34,211,138,0.2)" : r.score > 0.4 ? "rgba(251,191,36,0.2)" : "#16213A", color: r.score > 0.7 ? "#34E0A0" : r.score > 0.4 ? "#FBBF24" : "#8CA3C1" }}>
                {Math.round(r.score * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
