import React, { useState } from "react";
import { useLanguage } from "./language";
import { saveClaudeKey, getClaudeKey, hasClaudeKey, analyzeJournalEntries, suggestAccount, generateTemplates, autoFixEntries } from "./aiService";
import { Sparkles, Key, Check, AlertCircle, Loader2, Wand2, FileText, Lightbulb, Zap, X } from "lucide-react";

// ─── AI Settings Modal ─────────────────────────────────────────────────────

export function AISettings({ onClose }) {
  const { t } = useLanguage();
  const [key, setKey] = useState(getClaudeKey());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (key.trim()) {
      saveClaudeKey(key.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ width: 460, maxWidth: "95vw", background: "#FFF", borderRadius: 20, overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ background: "linear-gradient(135deg, #162560, #0F1A47)", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={20} color="#FBBF24" />
            <h2 style={{ color: "#FFF", fontSize: 18, fontWeight: 700, margin: 0 }}>{t({ ar: "إعدادات الذكاء الاصطناعي", en: "AI Settings" })}</h2>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#FFF", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>{t({ ar: "أدخل مفتاح Claude API للتحليل الذكي. المفتاح محفوظ محلياً على جهازك.", en: "Enter your Claude API key for smart analysis. Key is stored locally on your device." })}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#F0F9FF", border: "1px solid #BAE6FD", marginBottom: 16, fontSize: 12, color: "#162560" }}>
            <Lightbulb size={14} />
            <span>{t({ ar: "المفتاح يُستخدم فقط لتحليل بياناتك. لا يُخزّن ولا يُرسل لأي جهة أخرى.", en: "Key is used only to analyze your data. Not stored or sent elsewhere." })}</span>
          </div>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <Key size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              style={{ width: "100%", padding: "12px 12px 12px 38px", borderRadius: 10, border: "2px solid #E2E8F0", fontSize: 14, outline: "none", direction: "ltr", boxSizing: "border-box", fontFamily: "monospace" }}
            />
          </div>
          <button onClick={handleSave} style={{ width: "100%", padding: "12px", borderRadius: 10, background: saved ? "#16A34A" : "#162560", color: "#FFF", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background 0.3s" }}>
            {saved ? <><Check size={16} /> {t({ ar: "تم الحفظ!", en: "Saved!" })}</> : t({ ar: "حفظ المفتاح", en: "Save Key" })}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Analysis Panel (inline) ────────────────────────────────────────────

export function AIAnalysisPanel({ entries, chartOfAccounts, onApplyFixes, lang }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("analyze");

  const tabs = [
    { id: "analyze", label: { ar: "تحليل القيود", en: "Analyze Entries" }, icon: Wand2 },
    { id: "fix", label: { ar: "تصحيح تلقائي", en: "Auto Fix" }, icon: Zap },
    { id: "templates", label: { ar: "قوالب ذكية", en: "Smart Templates" }, icon: FileText },
  ];

  const handleAnalyze = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await analyzeJournalEntries(entries, chartOfAccounts);
      setResult(r);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleAutoFix = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await autoFixEntries(entries, chartOfAccounts);
      setResult(r);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleTemplates = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await generateTemplates(chartOfAccounts, lang);
      setResult(r);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  if (!hasClaudeKey()) {
    return (
      <div style={{ padding: "24px", textAlign: "center", borderRadius: 16, background: "#FFFBEB", border: "1px solid #FDE68A" }}>
        <Sparkles size={32} color="#F59E0B" style={{ margin: "0 auto 12px" }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: "#92400E", marginBottom: 8 }}>{t({ ar: "الذكاء الاصطناعي غير مُعد", en: "AI not configured" })}</p>
        <p style={{ fontSize: 12, color: "#A16207" }}>{t({ ar: "أضف مفتاح Claude API من الإعدادات", en: "Add Claude API key from Settings" })}</p>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 16, overflow: "hidden", background: "#FFF" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setActiveTab(id); setResult(null); setError(null); }}
            style={{ flex: 1, padding: "12px 8px", border: "none", background: activeTab === id ? "#FFF" : "transparent", color: activeTab === id ? "#162560" : "#94A3B8", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderBottom: activeTab === id ? "2px solid #162560" : "2px solid transparent", transition: "all 0.2s" }}>
            <Icon size={14} /> {t(label)}
          </button>
        ))}
      </div>

      <div style={{ padding: 20 }}>
        {/* Action button */}
        <button onClick={activeTab === "analyze" ? handleAnalyze : activeTab === "fix" ? handleAutoFix : handleTemplates}
          disabled={loading}
          style={{ width: "100%", padding: "12px", borderRadius: 10, background: "linear-gradient(135deg, #162560, #0F1A47)", color: "#FFF", fontSize: 14, fontWeight: 600, border: "none", cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: loading ? 0.7 : 1, marginBottom: 16 }}>
          {loading ? <><Loader2 size={16} className="animate-spin" /> {t({ ar: "جاري التحليل...", en: "Analyzing..." })}</> : activeTab === "analyze" ? <><Wand2 size={16} /> {t({ ar: "تحليل القيود بالذكاء الاصطناعي", en: "Analyze Entries with AI" })}</> : activeTab === "fix" ? <><Zap size={16} /> {t({ ar: "تصحيح تلقائي", en: "Auto Fix" })}</> : <><FileText size={16} /> {t({ ar: "توليد القوالب", en: "Generate Templates" })}</>}
        </button>

        {error && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", color: "#EF4444", fontSize: 12, marginBottom: 12 }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> <span style={{ wordBreak: "break-word" }}>{error}</span>
          </div>
        )}

        {/* Results */}
        {result && activeTab === "analyze" && (
          <div>
            {result.summary && <p style={{ fontSize: 13, color: "#334155", marginBottom: 12, padding: "10px 14px", background: "#F0F9FF", borderRadius: 8 }}>{result.summary}</p>}
            {result.errors && result.errors.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {result.errors.map((err, i) => (
                  <div key={i} style={{ padding: "12px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>{t({ ar: "خطأ", en: "Error" })} #{i + 1}</span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: err.suggestion?.confidence === "high" ? "#DCFCE7" : "#FEF9C3", color: err.suggestion?.confidence === "high" ? "#166534" : "#854D0E" }}>{err.error_type}</span>
                    </div>
                    <p style={{ fontSize: 13, color: "#1E293B", marginBottom: 6 }}>{err.description}</p>
                    {err.suggestion && (
                      <div style={{ padding: "8px 10px", borderRadius: 8, background: "#F0FDF4", border: "1px solid #BBF7D0", fontSize: 12 }}>
                        <span style={{ color: "#166534", fontWeight: 600 }}>{t({ ar: "اقتراح:", en: "Suggestion:" })} </span>
                        <span style={{ color: "#166534" }}>{err.suggestion.account_code} - {err.suggestion.account_name}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: "center", color: "#16A34A", fontSize: 13, padding: 16 }}>{t({ ar: "لا توجد أخطاء! القيود صحيحة", en: "No errors found! Entries are correct" })}</p>
            )}
          </div>
        )}

        {result && activeTab === "fix" && (
          <div>
            {result.fixed_entries && result.fixed_entries.length > 0 ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#162560", marginBottom: 10 }}>{t({ ar: `تم العثور على ${result.fixed_entries.length} قيد يحتاج تصحيح:`, en: `${result.fixed_entries.length} entries need fixing:` })}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {result.fixed_entries.map((fix, i) => (
                    <div key={i} style={{ padding: "10px 12px", borderRadius: 8, background: "#F0FDF4", border: "1px solid #BBF7D0", fontSize: 12 }}>
                      <span style={{ color: "#991B1B", textDecoration: "line-through" }}>{fix.original_account_code}</span>
                      <span style={{ color: "#166534", margin: "0 6px" }}>→</span>
                      <span style={{ color: "#166534", fontWeight: 600 }}>{fix.new_account_code} - {fix.new_account_name}</span>
                      <span style={{ color: "#64748B", marginRight: 8 }}> ({fix.reason})</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => onApplyFixes && onApplyFixes(result.fixed_entries)} style={{ width: "100%", padding: "10px", borderRadius: 8, background: "#16A34A", color: "#FFF", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>
                  {t({ ar: "تطبيق التصحيحات", en: "Apply Fixes" })}
                </button>
              </>
            ) : (
              <p style={{ textAlign: "center", color: "#16A34A", fontSize: 13, padding: 16 }}>{t({ ar: "لا يوجد ما يحتاج تصحيح!", en: "Nothing to fix!" })}</p>
            )}
          </div>
        )}

        {result && activeTab === "templates" && (
          <div>
            {result.templates && result.templates.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {result.templates.map((tpl, i) => (
                  <div key={i} style={{ padding: "12px 14px", borderRadius: 10, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#162560", marginBottom: 4 }}>{tpl.name}</p>
                    <p style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>{tpl.description}</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {tpl.entries && tpl.entries.map((e, j) => (
                        <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 8px", borderRadius: 4, background: e.debit > 0 ? "#EFF6FF" : "#FEFCE8" }}>
                          <span style={{ direction: "ltr" }}>{e.account_code} - {e.account_name}</span>
                          <span style={{ fontWeight: 600 }}>{e.debit > 0 ? `${t({ ar: "مدين", en: "Dr" })} ${e.debit.toLocaleString()}` : `${t({ ar: "دائن", en: "Cr" })} ${(e.credit || 0).toLocaleString()}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: 16 }}>{t({ ar: "لا توجد قوالب. شجرة الحسابات فارغة؟", en: "No templates. Is the chart of accounts empty?" })}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
