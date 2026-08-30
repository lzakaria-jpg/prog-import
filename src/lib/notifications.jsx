import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import { useLanguage } from "../language";
import { Bell, X, AtSign, Check } from "lucide-react";

/**
 * إشعارات الإشارة (@mention) داخل التطبيق — جرس عائم، عدّاد غير مقروء، وقائمة
 * منسدلة. يستمع لجدول notifications عبر Realtime فيظهر الإشعار فوراً دون
 * إعادة تحميل. مستقل عن حالة الشات نفسه، فلا يتطلب فتحه لرؤية الإشعار.
 */
export function NotificationBell({ currentUser, isRTL }) {
  const { t, lang } = useLanguage();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(true); // false إذا لم يُشغَّل جدول notifications بعد
  const popRef = useRef(null);

  const load = useCallback(async () => {
    if (!currentUser) return;
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_email", currentUser)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) { setAvailable(false); return; }
      setAvailable(true);
      setItems(data || []);
    } catch (e) { setAvailable(false); }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!currentUser) return;
    const channel = supabase
      .channel(`notifications-${currentUser}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_email=eq.${currentUser}` }, (payload) => {
        setItems((prev) => [payload.new, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_email=eq.${currentUser}` }, (payload) => {
        setItems((prev) => prev.map((n) => (n.id === payload.new.id ? payload.new : n)));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser]);

  useEffect(() => {
    const handler = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = items.filter((n) => !n.is_read).length;

  const markRead = async (id) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try { await supabase.from("notifications").update({ is_read: true }).eq("id", id); } catch (e) {}
  };

  const markAllRead = async () => {
    const ids = items.filter((n) => !n.is_read).map((n) => n.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try { await supabase.from("notifications").update({ is_read: true }).in("id", ids); } catch (e) {}
  };

  if (!available || !currentUser) return null;

  return (
    <div ref={popRef} style={{ position: "fixed", bottom: 84, [isRTL ? "left" : "right"]: 16, zIndex: 998 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 44, height: 44, borderRadius: 22, border: "none", cursor: "pointer",
          background: "#FFFFFF", boxShadow: "0 6px 24px rgba(0,0,0,0.35)", color: "#0F172A",
          display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
        }}
        title={t({ ar: "الإشعارات", en: "Notifications" })}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span style={{ position: "absolute", top: -2, [isRTL ? "left" : "right"]: -2, minWidth: 16, height: 16, padding: "0 3px", borderRadius: 8, background: "#DC2626", color: "#FFF", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", bottom: 52, [isRTL ? "left" : "right"]: 0, width: 320, maxHeight: 400,
          background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          overflow: "hidden", display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{t({ ar: "الإشعارات", en: "Notifications" })}</p>
            <div style={{ display: "flex", gap: 6 }}>
              {unread > 0 && (
                <button onClick={markAllRead} style={{ background: "none", border: "none", color: "#0284C7", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                  <Check size={12} /> {t({ ar: "تعليم الكل كمقروء", en: "Mark all read" })}
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer" }}><X size={14} /></button>
            </div>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {items.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#94A3B8", fontSize: 12 }}>
                {t({ ar: "لا توجد إشعارات", en: "No notifications" })}
              </div>
            ) : items.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                style={{
                  display: "flex", gap: 8, width: "100%", padding: "10px 14px", border: "none",
                  borderBottom: "1px solid #F8FAFC", background: n.is_read ? "transparent" : "rgba(74,144,217,0.08)",
                  cursor: "pointer", textAlign: isRTL ? "right" : "left",
                }}
              >
                <AtSign size={14} color="#4A90D9" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, color: "#0F172A" }}>
                    <strong>{n.actor_email?.split("@")[0]}</strong> {t({ ar: "أشار إليك", en: "mentioned you" })}
                    {n.channel_label ? ` ${lang === "ar" ? "في" : "in"} ${n.channel_label}` : ""}
                  </p>
                  {n.content_preview && (
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.content_preview}</p>
                  )}
                  <p style={{ margin: "2px 0 0", fontSize: 10, color: "#94A3B8" }}>{new Date(n.created_at).toLocaleString()}</p>
                </div>
                {!n.is_read && <span style={{ width: 7, height: 7, borderRadius: 4, background: "#4A90D9", flexShrink: 0, marginTop: 4 }} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
