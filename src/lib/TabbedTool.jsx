/*
 ============================================================================
  TabbedTool.jsx — يحوّل أي أداة أحادية النسخة (MergeTool أول تجربة، ثم باقي
  الأدوات لاحقًا) إلى أداة متعددة التبويبات: كل تبويب = نسخة مستقلة بالكامل
  من الأداة (حالتها الداخلية الكاملة) لعميل مختلف — طلب صريح من المستخدم
  (2026-09-14): "من الممكن ان يقوم المستخدم بانشاء اكثر من شجرة حسابات
  لعميلين او ثلاثة الى عدد غير محدود".
  ============================================================================
  المبدأ الأساسي: كل تبويب مُركَّب (mounted) دائمًا طالما موجودًا بالقائمة —
  يُخفى بـdisplay:none لا يُفك تركيبه. هذا نفس الأسلوب المُثبَت أصلاً بـApp.jsx
  للتنقل بين الأدوات نفسها (راجع تعليقها هناك) — الآن يُطبَّق مستوى أعمق، داخل
  الأداة الواحدة. النتيجة: عملية شبكة طويلة (إرسال/رفع) بتبويب معيّن لا تتوقف
  أبدًا سواء انتقل المستخدم لتبويب آخر بنفس الأداة أو لأداة أخرى بالكامل من
  القائمة الجانبية — بالضبط طلب المستخدم الصريح: "التنقل ما يوقف عمل اي اداة".

  عدم استمرار عبر تحديث الصفحة (F5) — قرار صريح من المستخدم (بدون رفريش
  يكفي) — كل الحالة بالذاكرة فقط (useState عادي)، بلا أي تخزين محلي.

  لا يُعدِّل أي شيء من منطق الأداة الملفوفة (Component) — فقط يستقبل الآن
  onNameChange/onBusyChange اختياريين (إضافة بحتة، بلا قيمة افتراضية تكسر شيئًا
  لو تُجوهلا)، وref اختياري لدعم requestStop عند إغلاق تبويب مشغول.
 ============================================================================
*/
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { useLanguage } from "../language.jsx";
import { showToast } from "./toast.jsx";

let tabSeq = 0;
function makeTab(label) {
  return { id: `t${Date.now()}_${++tabSeq}`, label: label || null };
}

export default function TabbedTool({ Component, toolKey, defaultTabLabel, componentProps }) {
  const { t, dir } = useLanguage();
  const [tabs, setTabs] = useState(() => [makeTab()]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [labels, setLabels] = useState({}); // id -> اسم العميل الحيّ
  const [closeConfirmId, setCloseConfirmId] = useState(null);
  const refs = useRef({}); // id -> ref المكوّن (لدعم requestStop عند الإغلاق القسري)
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const tabTitle = useCallback(
    (tabId) => labels[tabId] || t(defaultTabLabel || { ar: "عميل جديد", en: "New client" }),
    [labels, t, defaultTabLabel]
  );

  const handleNameChange = useCallback((id, name) => {
    setLabels((prev) => (name?.trim() ? { ...prev, [id]: name.trim() } : prev));
  }, []);

  const handleBusyChange = useCallback((id, isBusy) => {
    setBusyIds((prev) => {
      const wasBusy = prev.has(id);
      // [إضافة] إشعار عائم عند انتهاء عملية كانت شغالة بتبويب غير ظاهر حاليًا —
      // "غير ظاهر" يشمل: تبويب آخر بنفس الأداة نشط، أو المستخدم انتقل بالكامل
      // لأداة أخرى بالقائمة الجانبية (لا يمكن معرفة ذلك من هنا بيقين، فنفترض
      // "غير ظاهر" لأي تبويب ليس النشط حاليًا داخل هذه الأداة — أبسط وأأمن من
      // إخفاء الإشعار خطأً).
      if (wasBusy && !isBusy && id !== activeIdRef.current) {
        showToast({
          kind: "success",
          text: t({ ar: `✅ انتهت العملية بتبويب "${tabTitle(id)}"`, en: `✅ Finished in tab "${tabTitle(id)}"` }),
        });
      }
      const next = new Set(prev);
      if (isBusy) next.add(id); else next.delete(id);
      return next;
    });
  }, [t, tabTitle]);

  const addTab = () => {
    const tab = makeTab();
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
  };

  const doRemove = useCallback((id) => {
    setTabs((prev) => {
      const next = prev.filter((tb) => tb.id !== id);
      const finalList = next.length ? next : [makeTab()];
      setActiveId((curActive) => {
        if (curActive !== id) return curActive;
        return finalList[0].id;
      });
      return finalList;
    });
    setLabels((prev) => { const { [id]: _drop, ...rest } = prev; return rest; });
    setBusyIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    delete refs.current[id];
  }, []);

  const requestClose = (id) => {
    if (busyIds.has(id)) { setCloseConfirmId(id); return; }
    doRemove(id);
  };

  const confirmCloseAnyway = () => {
    const id = closeConfirmId;
    setCloseConfirmId(null);
    if (!id) return;
    // [حماية] إيقاف فعلي للعملية الجارية قبل الإزالة — لولا هذا تستمر حلقة
    // الإرسال (fetch) تعمل "يتيمة" بالخلفية رغم إغلاق التبويب ظاهريًا (الـpromise
    // لا يرتبط بدورة حياة React) فتستمر بإنشاء حسابات فعلية بمنشأة العميل دون
    // أن يرى المستخدم أي تقدّم أو نتيجة — خطر حقيقي على بيانات محاسبية حقيقية.
    refs.current[id]?.requestStop?.();
    doRemove(id);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 0 10px", flexWrap: "wrap", flexShrink: 0 }}>
        {tabs.map((tb) => (
          <div
            key={tb.id}
            onClick={() => setActiveId(tb.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
              padding: "7px 10px 7px 8px", borderRadius: 10, fontSize: 12.5, fontWeight: 600,
              border: `1.5px solid ${tb.id === activeId ? "#162560" : "#E2E8F0"}`,
              background: tb.id === activeId ? "rgba(22,37,96,0.06)" : "#FFFFFF",
              color: tb.id === activeId ? "#162560" : "#475569",
              maxWidth: 220, minWidth: 0,
            }}
            title={tabTitle(tb.id)}
          >
            {busyIds.has(tb.id) && <Loader2 size={12} className="animate-spin" style={{ flexShrink: 0 }} />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tabTitle(tb.id)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); requestClose(tb.id); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex", padding: 0, flexShrink: 0 }}
              title={t({ ar: "إغلاق", en: "Close" })}
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <button
          onClick={addTab}
          style={{
            display: "flex", alignItems: "center", gap: 4, padding: "7px 10px", borderRadius: 10,
            border: "1.5px dashed #CBD5E1", background: "#FFFFFF", color: "#162560", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          }}
          title={t({ ar: "عميل جديد", en: "New client" })}
        >
          <Plus size={14} /> {t({ ar: "عميل جديد", en: "New client" })}
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {tabs.map((tb) => (
          <div key={tb.id} style={{ display: tb.id === activeId ? "block" : "none", height: "100%" }}>
            <Component
              {...componentProps}
              ref={(r) => { refs.current[tb.id] = r; }}
              onNameChange={(name) => handleNameChange(tb.id, name)}
              onBusyChange={(isBusy) => handleBusyChange(tb.id, isBusy)}
            />
          </div>
        ))}
      </div>

      {closeConfirmId && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.5)" }}
          onClick={() => setCloseConfirmId(null)}
        >
          <div dir={dir} onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 22, maxWidth: 420, width: "92%", boxShadow: "0 20px 48px rgba(15,23,42,0.25)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
              {t({ ar: "⚠️ فيه عملية شغالة بهذا التبويب", en: "⚠️ An operation is running in this tab" })}
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
              {t({
                ar: `إغلاق تبويب "${tabTitle(closeConfirmId)}" الآن سيوقف عملية الإرسال/الرفع الجارية فورًا. أي حساب أُرسل فعلاً قبل الإغلاق يبقى محفوظًا بمنشأة العميل، والباقي لن يُرسَل. متابعة؟`,
                en: `Closing tab "${tabTitle(closeConfirmId)}" now will stop the running send/upload immediately. Anything already sent stays saved on the client's account; the rest will not be sent. Continue?`,
              })}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setCloseConfirmId(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                {t({ ar: "تراجع", en: "Cancel" })}
              </button>
              <button onClick={confirmCloseAnyway} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #DC2626", background: "#DC2626", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                {t({ ar: "أوقف وأغلق", en: "Stop & close" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
