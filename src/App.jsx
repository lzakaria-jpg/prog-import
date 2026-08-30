import React, { useState, useEffect } from "react";
import { MergeTool } from "./MergeTool";
import JournalTool from "./JournalTool";
import { LanguageProvider, useLanguage } from "./language";
import { AuthProvider, useAuth, LoginScreen, AdminPanel } from "./auth";
import { AISettings } from "./AIPanel";
import { ChatPanel, ChatToggle } from "./chat";
import { NotificationBell } from "./lib/notifications.jsx";
import { Watermark } from "./Watermark";
import QoyodBillImport from "./bill-import";
import InvoiceImportTool from "./sales-invoice-import";
import { can } from "./lib/permissions";
import { BookOpen, GitBranch, ChevronLeft, ChevronRight, Languages, Settings, LogOut, Sparkles, Download, RefreshCw, X, ArrowDownToLine, CheckCircle2 } from "lucide-react";

const NAV_ITEMS = [
  { id: "journal", permKey: "tool.journal", label: { ar: "تحليل القيود واستيرادها", en: "Analyze & Import Entries" }, icon: BookOpen, desc: { ar: "فحص وتجهيز وحفظ القيود", en: "Review, prepare & import journal entries" } },
  { id: "merge", permKey: "tool.merge", label: { ar: "تحليل الشجرة واستيرادها", en: "Analyze & Import Chart" }, icon: GitBranch, desc: { ar: "تحليل ودمج شجرة الحسابات", en: "Analyze & merge chart of accounts" } },
  { id: "bills", permKey: "tool.bills", label: { ar: "استيراد فواتير المشتريات", en: "Import Purchase Bills" }, icon: ArrowDownToLine, desc: { ar: "تهيئة فواتير المشتريات لقيود", en: "Prepare purchase bills for Qoyod" } },
  { id: "sales", permKey: "tool.sales", label: { ar: "استيراد فواتير المبيعات", en: "Import Sales Invoices" }, icon: ArrowDownToLine, desc: { ar: "تهيئة فواتير المبيعات لقيود", en: "Prepare sales invoices for Qoyod" } },
];

function LanguageToggle({ compact }) {
  const { lang, toggle, t } = useLanguage();
  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200 w-full"
      style={{ background: "rgba(255,255,255,0.06)", color: "#CBD5E1", border: "1px solid rgba(255,255,255,0.1)" }}
      title={lang === "ar" ? "Switch to English" : "التبديل للعربية"}
    >
      <Languages size={16} />
      <span>{lang === "ar" ? t({ ar: "English", en: "English" }) : t({ ar: "العربية", en: "Arabic" })}</span>
    </button>
  );
}

// ── Update Banner ──────────────────────────────────────────────────

function UpdateBanner() {
  const { lang, t } = useLanguage();
  const [updateState, setUpdateState] = useState(null);
  const [percent, setPercent] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const api = window.electronAPI;

  useEffect(() => {
    if (!api || !api.onUpdateStatus) return;
    const unsubscribe = api.onUpdateStatus((data) => {
      if (data.status === "available") {
        setUpdateState({ type: "available", version: data.version });
      } else if (data.status === "downloading") {
        setUpdateState({ type: "downloading" });
        setPercent(data.percent || 0);
      } else if (data.status === "downloaded") {
        setUpdateState({ type: "downloaded", version: data.version });
      } else if (data.status === "error") {
        setUpdateState(null);
      } else if (data.status === "not-available") {
        setUpdateState(null);
      }
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  if (!api || !api.onUpdateStatus) return null;
  if (dismissed || !updateState) return null;

  // Available: show download button
  if (updateState.type === "available") {
    return (
      <div style={{ background: "linear-gradient(135deg, #EFF6FF, #DBEAFE)", border: "1px solid #93C5FD", borderRadius: 12, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Download size={18} color="#2563EB" />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#1E40AF", margin: 0 }}>
              {t({ ar: `تحديث جديد متاح: ${updateState.version}`, en: `New update available: ${updateState.version}` })}
            </p>
            <p style={{ fontSize: 11, color: "#3B82F6", margin: 0 }}>
              {t({ ar: "جاري التنزيل تلقائياً...", en: "Downloading automatically..." })}
            </p>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} style={{ padding: "8px", borderRadius: 8, background: "transparent", color: "#94A3B8", border: "none", cursor: "pointer" }}>
          <X size={14} />
        </button>
      </div>
    );
  }

  // Downloading: show progress
  if (updateState.type === "downloading") {
    return (
      <div style={{ background: "linear-gradient(135deg, #FEF9C3, #FEF3C7)", border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <RefreshCw size={16} color="#D97706" className="animate-spin" />
          <p style={{ fontSize: 13, fontWeight: 600, color: "#92400E", margin: 0 }}>
            {t({ ar: `جاري التنزيل... ${percent}%`, en: `Downloading... ${percent}%` })}
          </p>
        </div>
        <div style={{ width: "100%", height: 6, borderRadius: 3, background: "#FDE68A", overflow: "hidden" }}>
          <div style={{ width: `${percent}%`, height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #F59E0B, #D97706)", transition: "width 0.3s" }} />
        </div>
      </div>
    );
  }

  // Downloaded: show restart button
  if (updateState.type === "downloaded") {
    return (
      <div style={{ background: "linear-gradient(135deg, #F0FDF4, #DCFCE7)", border: "1px solid #86EFAC", borderRadius: 12, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CheckCircle2 size={18} color="#16A34A" />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#166534", margin: 0 }}>
              {t({ ar: "التحديث جاهز للتثبيت!", en: "Update ready to install!" })}
            </p>
            {updateState.version && (
              <p style={{ fontSize: 11, color: "#16A34A", margin: 0 }}>
                {t({ ar: `الإصدار ${updateState.version}`, en: `Version ${updateState.version}` })}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => api.updateInstall()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, background: "#16A34A", color: "#FFF", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer" }}>
            <RefreshCw size={14} /> {t({ ar: "إعادة التشغيل والتحديث", en: "Restart & Update" })}
          </button>
          <button onClick={() => setDismissed(true)} style={{ padding: "8px", borderRadius: 8, background: "transparent", color: "#94A3B8", border: "none", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ── App Shell ──────────────────────────────────────────────────────

function AppShell() {
  const [tab, setTab] = useState("journal");
  const [collapsed, setCollapsed] = useState(false);
  const { lang, dir, t } = useLanguage();
  const { currentUser, isAdmin, isUserManager, currentUserRecord, logout, showAdmin, setShowAdmin, loading, adminEmail } = useAuth();
  const [showAISettings, setShowAISettings] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);

  const visibleNavItems = NAV_ITEMS.filter((item) => can(currentUserRecord, item.permKey));
  const visibleNavKey = visibleNavItems.map((i) => i.id).join(",");

  // إن فقد التبويب المفتوح صلاحيته (تعديل مباشر من مالك آخر)، انتقل لأول أداة متاحة بدل شاشة فارغة.
  // Hooks كلها قبل أي return مشروط، فلا يتغيّر ترتيب استدعائها بين الأجيال.
  useEffect(() => {
    if (visibleNavItems.length && !visibleNavItems.some((i) => i.id === tab)) {
      setTab(visibleNavItems[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNavKey, tab]);

  if (loading || !currentUser) return <LoginScreen />;

  const chevBase = lang === "ar" ? 0 : 180;
  const chevRot = collapsed ? 180 : 0;
  const chevTotal = chevBase + chevRot;

  const currentVersion = "1.5.4";
  const canUseAI = can(currentUserRecord, "tool.ai");

  return (
    <div className="flex h-screen font-cairo" style={{ background: "var(--qoyod-bg)", direction: dir }}>
      {showAdmin && isUserManager && <AdminPanel />}
      {showAISettings && canUseAI && <AISettings onClose={() => setShowAISettings(false)} />}

      {/* Sidebar */}
      <aside
        className="relative flex flex-col transition-all duration-300"
        style={{
          width: collapsed ? 72 : 264,
          minWidth: collapsed ? 72 : 264,
          background: "linear-gradient(180deg, var(--qoyod-sidebar-grad-a) 0%, var(--qoyod-sidebar-grad-b) 100%)",
          boxShadow: "4px 0 24px rgba(22, 37, 96, 0.18)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center px-5 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {!collapsed ? (
            <div className="animate-fadeIn">
              <h1 className="text-white text-base font-bold leading-tight tracking-tight">{t({ ar: "أدوات قيود المحاسبية", en: "Qoyod Accounting Tools" })}</h1>
              <p className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>{t({ ar: "تحليل واستيراد القيود والشجرة", en: "Analyze & import entries and chart" })}</p>
            </div>
          ) : (
            <span className="text-white text-lg font-bold mx-auto">م</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-1">
          {visibleNavItems.map(({ id, label, icon: Icon, desc }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="w-full flex items-center gap-3 rounded-lg transition-all duration-200 group"
                style={{
                  padding: collapsed ? "10px 0" : "10px 14px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  background: active ? "rgba(74,144,217,0.2)" : "transparent",
                  color: active ? "#93C5FD" : "#94A3B8",
                }}
                title={collapsed ? t(label) : undefined}
              >
                <Icon size={18} className={active ? "" : "group-hover:text-slate-300"} style={{ flexShrink: 0, color: active ? "#60A5FA" : undefined }} />
                {!collapsed && (
                  <div className="text-start animate-fadeIn">
                    <p className={`text-sm font-semibold leading-tight ${active ? "text-blue-200" : "text-slate-300 group-hover:text-white"}`}>{t(label)}</p>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{t(desc)}</p>
                  </div>
                )}
              </button>
            );
          })}

          {/* Admin button (owner + full user managers only) */}
          {isUserManager && (
            <button
              onClick={() => setShowAdmin(true)}
              className="w-full flex items-center gap-3 rounded-lg transition-all duration-200 group"
              style={{
                padding: collapsed ? "10px 0" : "10px 14px",
                justifyContent: collapsed ? "center" : "flex-start",
                background: "transparent",
                color: "#94A3B8",
              }}
              title={collapsed ? t({ ar: "إدارة المستخدمين", en: "Manage Users" }) : undefined}
            >
              <Settings size={18} style={{ flexShrink: 0 }} className="group-hover:text-slate-300" />
              {!collapsed && (
                <div className="text-start animate-fadeIn">
                  <p className="text-sm font-semibold leading-tight text-slate-300 group-hover:text-white">{t({ ar: "إدارة المستخدمين", en: "Manage Users" })}</p>
                  <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{t({ ar: "الأدوار والصلاحيات وسجل التدقيق", en: "Roles, permissions & audit log" })}</p>
                </div>
              )}
            </button>
          )}

          {/* AI Settings button */}
          {canUseAI && (
          <button
            onClick={() => setShowAISettings(true)}
            className="w-full flex items-center gap-3 rounded-lg transition-all duration-200 group"
            style={{
              padding: collapsed ? "10px 0" : "10px 14px",
              justifyContent: collapsed ? "center" : "flex-start",
              background: "transparent",
              color: "#94A3B8",
            }}
            title={collapsed ? t({ ar: "إعدادات الذكاء الاصطناعي", en: "AI Settings" }) : undefined}
          >
            <Sparkles size={18} style={{ flexShrink: 0 }} className="group-hover:text-amber-300" />
            {!collapsed && (
              <div className="text-start animate-fadeIn">
                <p className="text-sm font-semibold leading-tight text-slate-300 group-hover:text-white">{t({ ar: "الذكاء الاصطناعي", en: "AI Analysis" })}</p>
                <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{t({ ar: "تحليل ذكي للقيود", en: "Smart entry analysis" })}</p>
              </div>
            )}
          </button>
          )}
        </nav>

        {/* User info */}
        {!collapsed && currentUser && (
          <div className="px-3 py-2 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: "linear-gradient(135deg, #162560, #0F1A47)" }}>
                {currentUser.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-300 truncate" style={{ direction: "ltr" }}>{currentUser}</p>
                {isAdmin && <p className="text-[10px] text-blue-300">{t({ ar: "المالك", en: "Owner" })}</p>}
                {!isAdmin && isUserManager && <p className="text-[10px] text-blue-300">{t({ ar: "مدير مستخدمين", en: "User Manager" })}</p>}
              </div>
              <button onClick={logout} className="text-slate-500 hover:text-red-400 transition-colors" title={t({ ar: "خروج", en: "Logout" })}>
                <LogOut size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-5 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 z-10"
          style={{
            [lang === "ar" ? "left" : "right"]: "-12px",
            background: "var(--qoyod-sidebar-grad-b)",
            border: "2px solid rgba(74,144,217,0.35)",
            color: "#60A5FA",
          }}
        >
          <ChevronLeft size={12} style={{ transform: `rotate(${chevTotal}deg)`, transition: "transform 0.3s" }} />
        </button>

        {/* Footer */}
        {!collapsed && (
          <div className="px-3 py-3 border-t flex flex-col gap-2" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <LanguageToggle />
            <p className="text-[10px] text-slate-600 text-center">v{currentVersion} &mdash; Qoyod</p>
          </div>
        )}
        {collapsed && (
          <div className="px-2 py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <LanguageToggle compact />
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative" style={{ background: "var(--qoyod-bg)" }}>
        <Watermark type={tab === "merge" ? "tree" : tab === "bills" ? "bill" : tab === "sales" ? "sale" : "journal"} lang={lang} />
        <div className="app-content h-full" style={{ padding: "16px 20px" }}>
          <UpdateBanner />
          {/*
            كل أداة تُركَّب (mount) فقط إن كانت مسموحة فعلياً — لا تكفي CSS
            display:none لإخفائها، لأن المكوّن يبقى حياً في الـ DOM ويمكن
            كشفه بأدوات المطوّر. التنفيذ الفعلي هنا هو الإنفاذ الحقيقي الوحيد
            المتاح في تطبيق بلا خادم خلفي مستقل (انظر تعليق hasPermission في auth.jsx).
          */}
          {can(currentUserRecord, "tool.journal") && (
            <div style={{ display: tab === "journal" ? "block" : "none", height: "100%" }}>
              <JournalTool />
            </div>
          )}
          {can(currentUserRecord, "tool.merge") && (
            <div style={{ display: tab === "merge" ? "block" : "none", height: "100%" }}><MergeTool /></div>
          )}
          {can(currentUserRecord, "tool.bills") && (
            <div style={{ display: tab === "bills" ? "block" : "none", height: "100%" }}><QoyodBillImport showHeader={false} /></div>
          )}
          {can(currentUserRecord, "tool.sales") && (
            <div style={{ display: tab === "sales" ? "block" : "none", height: "100%" }}><InvoiceImportTool showHeader={false} /></div>
          )}
          {visibleNavItems.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94A3B8", fontSize: 14, textAlign: "center" }}>
              {t({ ar: "لا تملك صلاحية الوصول لأي أداة حالياً. تواصل مع مدير النظام.", en: "You don't have access to any tool yet. Contact your admin." })}
            </div>
          )}
        </div>
      </main>

      {/* Notifications */}
      <NotificationBell currentUser={currentUser} isRTL={dir === "rtl"} />

      {/* Chat — يتطلب صلاحية tool.chat على الأقل؛ عرض القناة العامة نفسها
          مُتحكَّم فيه داخل ChatPanel بصلاحية chat.view_public المنفصلة */}
      {can(currentUserRecord, "tool.chat") && (
        <>
          {!chatOpen && <ChatToggle onClick={() => { setChatOpen(true); setChatUnread(0); }} isRTL={dir === "rtl"} unreadCount={chatUnread} />}
          <ChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} isRTL={dir === "rtl"} onUnreadChange={setChatUnread} />
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </LanguageProvider>
  );
}
