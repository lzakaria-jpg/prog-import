import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import GridCell from './GridCell.jsx';
import { COLUMNS } from '../engine/constants.js';

/**
 * جدول إدخال/تحقق الفواتير — نسخ لتصميم buildGridHeaderHtml + renderGrid الأصليين.
 * revalidate=true يطابق سلوك data-grid-2 (يعيد التحقق مع كل تعديل/حذف/لصق)، و false يطابق
 * data-grid (بلا إعادة تحقق آلية) — القاعدة #3 بالخطة. اللصق الذكي معلَّق على الجدول ذاته
 * (event delegation)، تمامًا كما كان في handleGridPaste الأصلية.
 *
 * ⚠️ إصلاح جوهري (خطأ تعليق/إغلاق المتصفح الحقيقي الذي شهده المستخدم مع ملفات فواتير
 * كبيرة — 5,700+ صف): بلا هذا الإصلاح كان الجدول يُنشئ عنصر DOM حيًّا (input/select) لكل
 * خلية من كل صف دفعة واحدة — أكثر من 125,000 عنصر لملف بحجم 5,700 صف فقط (22 عمودًا)،
 * وهذا يُعلِّق الصفحة عند الرسم الأول ويُسبِّب انهيار المتصفح، بلا أي علاقة بسرعة معالجة
 * البيانات نفسها (المعالجة الفعلية لأكبر ملف اختبار حقيقي استغرقت أقل من ثانية). الحل هنا
 * "نافذة تمرير" (virtualization) حقيقية: لا نعرض إلا الصفوف الظاهرة فعليًا داخل حاوية
 * التمرير + هامش صفوف احتياطي (overscan)، مع صفّي حشو (spacer) فارغين قبل/بعد لحفظ
 * الارتفاع الكلي الصحيح لشريط التمرير — كل شيء آخر (الأعمدة، القيم، التحقق، اللصق) بلا أي
 * تغيير منطقي. الجداول الصغيرة (أقل من الحد VIRTUALIZE_THRESHOLD) تُعرض كاملة كما كانت
 * تمامًا بلا أي تعقيد إضافي.
 */
const VIRTUALIZE_THRESHOLD = 150;
const OVERSCAN_ROWS = 8;
const DEFAULT_ROW_HEIGHT = 30; // تقدير أولي قبل قياس ارتفاع صف فعلي مُعروض؛ يُصحَّح فورًا

const InvoiceGrid = React.forwardRef(function InvoiceGrid(
  { tableId, rows, template, customersRef, productsRef, issues, revalidate, onUpdateCell, onDeleteRow, onPasteGrid },
  ref,
) {
  const scrollRef = useRef(null);
  const measuredRowRef = useRef(null);
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);
  const [highlightRowId, setHighlightRowId] = useState(null);

  // قياس ارتفاع صف فعلي مُعروض (المحتوى نفسه يحدد الارتفاع بلا قيمة ثابتة بالـCSS) —
  // يُصحَّح تلقائيًا لو تغيّر (تكبير خط، إلخ) بلا أي إعادة رسم إضافية إلا عند اختلاف حقيقي.
  useLayoutEffect(() => {
    const h = measuredRowRef.current && measuredRowRef.current.getBoundingClientRect().height;
    if (h && h > 0 && Math.abs(h - rowHeight) > 0.5) setRowHeight(h);
  });

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight || 520);
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => setViewportHeight(el.clientHeight || 520));
      ro.observe(el);
    }
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (ro) ro.disconnect();
    };
  }, []);

  const total = rows.length;
  const shouldVirtualize = total > VIRTUALIZE_THRESHOLD;

  const { startIndex, endIndex } = useMemo(() => {
    if (!shouldVirtualize) return { startIndex: 0, endIndex: total };
    const maxStart = Math.max(0, total - 1);
    const first = Math.min(maxStart, Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS));
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + OVERSCAN_ROWS * 2;
    const last = Math.min(total, first + visibleCount);
    return { startIndex: first, endIndex: last };
  }, [shouldVirtualize, scrollTop, rowHeight, viewportHeight, total]);

  // يسمح للأب (Step3Validate عبر IssuesList) بالانتقال لصف معيّن حتى لو كان خارج نافذة
  // العرض الحالية — بدل الاعتماد على document.querySelector المباشر الذي لا يجد الصف إن
  // لم يكن مرسومًا فعليًا بالـDOM بسبب نافذة التمرير.
  useImperativeHandle(ref, () => ({
    scrollToRow(rowId) {
      const index = rows.findIndex((r) => r.id === rowId);
      if (index < 0) return;
      const target = Math.max(0, index * rowHeight - viewportHeight / 2 + rowHeight / 2);
      if (shouldVirtualize) setScrollTop(target);
      const el = scrollRef.current;
      if (el) {
        try { el.scrollTo({ top: target, behavior: 'smooth' }); } catch { el.scrollTop = target; }
      }
      setHighlightRowId(rowId);
    },
  }), [rows, rowHeight, viewportHeight, shouldVirtualize]);

  useEffect(() => {
    if (!highlightRowId) return;
    const t = setTimeout(() => {
      const el = scrollRef.current;
      const tr = el && el.querySelector(`tr[data-rowid="${highlightRowId}"]`);
      if (tr) {
        tr.style.outline = '2px solid var(--qsv-brand)';
        setTimeout(() => { tr.style.outline = ''; }, 1500);
      }
      setHighlightRowId(null);
    }, 60); // انتظار قصير حتى يُعاد رسم الصف الهدف ضمن نافذة العرض بعد تحديث scrollTop
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightRowId, startIndex, endIndex]);

  const handlePaste = useCallback((e) => {
    const target = e.target;
    if (!(target && target.dataset && target.dataset.rowId)) return;
    const text = e.clipboardData.getData('text');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return; // اترك اللصق العادي لخلية واحدة يعمل بشكل طبيعي
    e.preventDefault();
    onPasteGrid(target.dataset.rowId, target.dataset.colKey, text, { revalidate });
  }, [onPasteGrid, revalidate]);

  const visibleRows = shouldVirtualize ? rows.slice(startIndex, endIndex) : rows;
  const topSpacerHeight = shouldVirtualize ? startIndex * rowHeight : 0;
  const bottomSpacerHeight = shouldVirtualize ? Math.max(0, (total - endIndex) * rowHeight) : 0;
  const colSpanTotal = COLUMNS.length + 2; // + عمود رقم الصف + عمود الحذف

  return (
    <div className="qsv-grid-scroll" ref={scrollRef}>
      <table className="qsv-grid" id={tableId} onPaste={handlePaste}>
        <thead>
          <tr>
            <th className="qsv-row-num-col">#</th>
            {COLUMNS.map((c) => (
              <th key={c.key} className={c.level === 'header' ? 'qsv-col-group-header' : 'qsv-col-group-item'}>
                {c.name}{c.required && <span className="qsv-req-star"> *</span>}
              </th>
            ))}
            <th>حذف</th>
          </tr>
        </thead>
        <tbody>
          {shouldVirtualize && topSpacerHeight > 0 && (
            <tr aria-hidden="true" key="__top_spacer__">
              <td colSpan={colSpanTotal} style={{ height: topSpacerHeight, padding: 0, border: 'none' }} />
            </tr>
          )}
          {visibleRows.map((row, i) => (
            <tr key={row.id} data-rowid={row.id} ref={i === 0 ? measuredRowRef : undefined}>
              <td className="qsv-row-num-col">{startIndex + i + 1}</td>
              {COLUMNS.map((col) => (
                <td key={col.key}>
                  <GridCell
                    row={row} col={col} template={template} customersRef={customersRef} productsRef={productsRef}
                    issueList={(issues.byRow[row.id] || {})[col.key]}
                    onChange={(value) => onUpdateCell(row.id, col.key, value, { revalidate })}
                  />
                </td>
              ))}
              <td className="qsv-del-col">
                <button type="button" className="qsv-btn danger" onClick={() => onDeleteRow(row.id, { revalidate })}>✕</button>
              </td>
            </tr>
          ))}
          {shouldVirtualize && bottomSpacerHeight > 0 && (
            <tr aria-hidden="true" key="__bottom_spacer__">
              <td colSpan={colSpanTotal} style={{ height: bottomSpacerHeight, padding: 0, border: 'none' }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});

export default InvoiceGrid;
