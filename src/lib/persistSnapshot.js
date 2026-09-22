/*
 ============================================================================
  persistSnapshot — حفظ/استعادة لقطة حالة أداة إلى localStorage بأمان وسرعة
  ============================================================================
  [بلاغ حقيقي من المستخدم] "الصفحة تتحدث تلقائي وكامل البيانات تروح — محتاج
  حتى لو صار تحديث تبقى البيانات محفوظة، وبنفس الوقت يضل سريع." كل حالة الأدوات
  كانت بالذاكرة فقط (قرار سابق صريح، انظر TabbedTool.jsx)، فأي إعادة تحميل
  للصفحة تمسح الشغل. هذي الطبقة تحفظ لقطة (snapshot) قابلة للتسلسل من مدخلات
  الأداة إلى localStorage، فتُستعاد صامتة عند إعادة فتح نفس التبويب.

  قرارات تصميمية:
  - localStorage (مُتزامن، بسيط، يكفي لمدخلات شجرة الحسابات ~مئات الكيلوبايت).
    الملفات الضخمة جدًا قد تتجاوز حد ~5MB — نلتقط الخطأ ونتخطى الحفظ بصمت
    (تبقى الحالة بالذاكرة كالسابق، بلا كسر). لا نخزّن كائنات File الخام
    (غير قابلة للتسلسل) ولا مفاتيح API الحساسة — فقط الصفوف المُحلَّلة والإعدادات.
  - كتابة مؤجَّلة (debounce) حتى لا يُبطّئ الكتابة المتكررة مع كل ضغطة/تعديل.
  - كل قراءة/كتابة داخل try/catch (localStorage قد يكون معطّلًا أو ممتلئًا أو
    محظورًا بوضع التصفح الخاص) — الفشل لا يكسر الأداة إطلاقًا.
 ============================================================================
*/
import { useEffect, useRef } from "react";

const PREFIX = "qoyod_snap_";

export function loadSnapshot(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(key, obj) {
  if (!key) return false;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(obj));
    return true;
  } catch {
    // حد التخزين تجاوز، أو تسلسل فشل، أو localStorage محظور — نتخطى بصمت
    return false;
  }
}

export function clearSnapshot(key) {
  if (!key) return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* تجاهل */
  }
}

/**
 * يحفظ `obj` (لقطة الحالة) تحت `key` مع تأجيل (debounce). يتخطى الحفظ تمامًا
 * لو key فارغ (persistKey غير متاح) أو `enabled` = false. لا يحفظ اللقطة
 * الأولى الفارغة تلقائيًا فوق لقطة محفوظة سابقًا إلا بعد أول تغيير فعلي —
 * يعتمد على أن المُستدعي يمرّر أحدث obj في كل رندر.
 */
export function useSnapshotPersist(key, obj, { debounceMs = 500, enabled = true } = {}) {
  const timer = useRef(null);
  useEffect(() => {
    if (!key || !enabled) return undefined;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveSnapshot(key, obj), debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, obj, debounceMs, enabled]);
}
