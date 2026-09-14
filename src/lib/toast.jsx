/*
 ============================================================================
  toast.jsx — إشعارات عائمة عامة عابرة لكل الأدوات (خفيفة، بلا خادم خلفي).
  ============================================================================
  [إضافة 2026-09-14] جزء من ميزة "التبويبات المتعددة داخل كل أداة" — لما تنتهي
  عملية شبكة طويلة (إرسال/رفع) بتبويب غير ظاهر حاليًا (تبويب آخر نشط بنفس
  الأداة، أو أداة أخرى ظاهرة بالقائمة الجانبية)، تستدعي showToast() لإعلام
  المستخدم دون إجباره على مراقبة ذلك التبويب. مستقلة تمامًا عن NotificationBell
  (تلك خاصة بإشعارات الإشارة @mention المخزَّنة بـSupabase؛ هذه محلية بحتة،
  تُعرض وتختفي، بلا تخزين ولا قراءة/غير مقروء).

  الاستخدام: showToast({ text, kind }) من أي مكان (حتى خارج مكوّن React — دالة
  عادية، لا Hook) — <ToastHost/> يُركَّب مرة واحدة فقط بجذر التطبيق (App.jsx).
 ============================================================================
*/
import React, { useEffect, useState } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";

let idCounter = 0;
const listeners = new Set();

/** يُستدعى من أي مكان بالتطبيق (لا يحتاج يكون داخل مكوّن React). */
export function showToast({ text, kind = "info", durationMs = 6000 }) {
  const item = { id: ++idCounter, text, kind, durationMs };
  listeners.forEach((fn) => fn(item));
  return item.id;
}

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };
const COLORS = {
  success: { bg: "#ECFDF5", border: "#059669", icon: "#059669" },
  error: { bg: "#FEF2F2", border: "#DC2626", icon: "#DC2626" },
  info: { bg: "#EFF6FF", border: "#162560", icon: "#162560" },
};

/** يُركَّب مرة واحدة فقط بجذر التطبيق — يعرض كل الإشعارات النشطة أعلى يمين/يسار الشاشة. */
export function ToastHost({ isRTL }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onNew = (item) => {
      setItems((prev) => [...prev, item]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== item.id)), item.durationMs);
    };
    listeners.add(onNew);
    return () => listeners.delete(onNew);
  }, []);

  if (!items.length) return null;

  return (
    <div
      style={{
        position: "fixed", top: 16, [isRTL ? "left" : "right"]: 16, zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 8,
        width: "min(360px, calc(100vw - 32px))",
      }}
    >
      {items.map((item) => {
        const Icon = ICONS[item.kind] || Info;
        const c = COLORS[item.kind] || COLORS.info;
        return (
          <div
            key={item.id}
            style={{
              display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px",
              background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12,
              boxShadow: "0 8px 24px rgba(15,23,42,0.15)", fontSize: 13, color: "#0F172A",
            }}
          >
            <Icon size={18} color={c.icon} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, lineHeight: 1.5 }}>{item.text}</div>
            <button
              onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 14, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
