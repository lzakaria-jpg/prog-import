// useTableVirtualization.js — نافذة تمرير (virtualization) قابلة لإعادة الاستخدام لأي
// جدول HTML عادي (<table>)، مستخرَجة من نفس المنطق المُختبَر فعلياً بـ
// sales-invoice-import/components/InvoiceGrid.jsx (حلّ انهيار متصفح حقيقي شهده المستخدم
// مع ملف 5,700 صف). لا تُعرض إلا الصفوف الظاهرة فعلياً + هامش احتياطي (overscan)، مع
// صفّي حشو (spacer) فارغين لحفظ ارتفاع شريط التمرير الصحيح. الجداول الصغيرة (أقل من
// threshold) تُعرض كاملة بلا أي تعقيد إضافي — لا تغيير بالمظهر أو السلوك لها.
//
// الاستخدام:
//   const v = useTableVirtualization(rows.length);
//   <div ref={v.scrollRef} style={{overflow:'auto', maxHeight:'...'}}>
//     <table><tbody>
//       {v.shouldVirtualize && v.topSpacerHeight > 0 && <tr><td colSpan={N} style={{height:v.topSpacerHeight}}/></tr>}
//       {(v.shouldVirtualize ? rows.slice(v.startIndex, v.endIndex) : rows).map((row, i) => (
//         <tr ref={i === 0 ? v.measuredRowRef : undefined}>...</tr>
//       ))}
//       {v.shouldVirtualize && v.bottomSpacerHeight > 0 && <tr><td colSpan={N} style={{height:v.bottomSpacerHeight}}/></tr>}
//     </tbody></table>
//   </div>
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

const DEFAULT_THRESHOLD = 150;
const DEFAULT_OVERSCAN = 8;
const DEFAULT_ROW_HEIGHT = 30;
const DEFAULT_VIEWPORT_HEIGHT = 520;

export function useTableVirtualization(totalRows, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const overscan = opts.overscan ?? DEFAULT_OVERSCAN;
  const initialViewportHeight = opts.defaultViewportHeight ?? DEFAULT_VIEWPORT_HEIGHT;

  const scrollRef = useRef(null);
  const measuredRowRef = useRef(null);
  const [rowHeight, setRowHeight] = useState(opts.defaultRowHeight ?? DEFAULT_ROW_HEIGHT);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(initialViewportHeight);

  // قياس ارتفاع صف فعلي مُعروض بدل قيمة ثابتة بالـCSS — يُصحَّح تلقائياً لو تغيّر
  useLayoutEffect(() => {
    const h = measuredRowRef.current && measuredRowRef.current.getBoundingClientRect().height;
    if (h && h > 0 && Math.abs(h - rowHeight) > 0.5) setRowHeight(h);
  });

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight || initialViewportHeight);
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => setViewportHeight(el.clientHeight || initialViewportHeight));
      ro.observe(el);
    }
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (ro) ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shouldVirtualize = totalRows > threshold;

  const { startIndex, endIndex } = useMemo(() => {
    if (!shouldVirtualize) return { startIndex: 0, endIndex: totalRows };
    const maxStart = Math.max(0, totalRows - 1);
    const first = Math.min(maxStart, Math.max(0, Math.floor(scrollTop / rowHeight) - overscan));
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    const last = Math.min(totalRows, first + visibleCount);
    return { startIndex: first, endIndex: last };
  }, [shouldVirtualize, scrollTop, rowHeight, viewportHeight, totalRows, overscan]);

  // للانتقال إلى صف معيّن حتى لو كان خارج نافذة العرض الحالية (زر "الانتقال" بقوائم القضايا)
  const scrollToIndex = useCallback((index) => {
    if (index == null || index < 0) return;
    const target = Math.max(0, index * rowHeight - viewportHeight / 2 + rowHeight / 2);
    if (shouldVirtualize) setScrollTop(target);
    const el = scrollRef.current;
    if (el) {
      try { el.scrollTo({ top: target, behavior: "smooth" }); } catch { el.scrollTop = target; }
    }
  }, [rowHeight, viewportHeight, shouldVirtualize]);

  const topSpacerHeight = shouldVirtualize ? startIndex * rowHeight : 0;
  const bottomSpacerHeight = shouldVirtualize ? Math.max(0, (totalRows - endIndex) * rowHeight) : 0;

  return {
    scrollRef, measuredRowRef, shouldVirtualize, startIndex, endIndex,
    topSpacerHeight, bottomSpacerHeight, scrollToIndex,
  };
}
