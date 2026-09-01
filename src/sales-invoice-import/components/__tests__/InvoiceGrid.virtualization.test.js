// @vitest-environment jsdom
//
// خطأ جوهري حقيقي شهده المستخدم فعلياً: رفع ملف فواتير حقيقي بحجم 5,710 صفًا (22 عمودًا
// بجدول الإدخال) عَلَّق الموقع بالكامل وأغلق المتصفح. قياس مباشر لخط أنابيب المعالجة على
// نفس الملف الحقيقي (بلا أي رسم DOM) أظهر أن كل المعالجة (قراءة+مطابقة+تحقق) تتم في أقل من
// ثانية — السبب الحقيقي كان رسم كل خلية من كل صف كعنصر DOM حي دفعة واحدة (100,000+ عنصر)
// بلا أي نافذة تمرير (virtualization). هذا الاختبار يثبّت الإصلاح: عدد عناصر <tr> الحقيقية
// بالـDOM يبقى محدودًا (لا يتناسب مع عدد الصفوف الكلي) حتى مع آلاف الصفوف، مع بقاء السلوك
// القديم (كل الصفوف مرسومة) كما هو تمامًا للجداول الصغيرة (لا تغيير لأي مستخدم بملف عادي).
import { describe, it, expect, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import InvoiceGrid from '../InvoiceGrid.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY_TEMPLATE = { loaded: false, dropdowns: { G: [], H: [], S: ['نعم', 'لا'], L: [], V: [] } };
const EMPTY_REF = { loaded: false };
const EMPTY_ISSUES = { byRow: {}, list: [] };

function makeRows(n) {
  return Array.from({ length: n }, (_, i) => ({ id: 'r' + i, A: 'INV-' + i, C: 'CUS-1' }));
}

function renderGrid(rows) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const ref = React.createRef();
  act(() => {
    root.render(React.createElement(InvoiceGrid, {
      ref, tableId: 'data-grid-test', rows, template: EMPTY_TEMPLATE,
      customersRef: EMPTY_REF, productsRef: EMPTY_REF, issues: EMPTY_ISSUES, revalidate: false,
      onUpdateCell: () => {}, onDeleteRow: () => {}, onPasteGrid: () => {},
    }));
  });
  return { container, root, ref };
}

describe('InvoiceGrid — نافذة تمرير (virtualization) لمنع تعليق المتصفح مع ملفات كبيرة', () => {
  let cleanup = [];
  afterEach(() => {
    cleanup.forEach(({ root, container }) => { act(() => root.unmount()); container.remove(); });
    cleanup = [];
  });

  it('جدول صغير (أقل من الحد): كل الصفوف تُرسَم كما كانت دائمًا — بلا أي تغيير سلوك', () => {
    const rows = makeRows(50);
    const { container, root } = renderGrid(rows);
    cleanup.push({ root, container });
    const trs = container.querySelectorAll('tr[data-rowid]');
    expect(trs.length).toBe(50);
  });

  it('جدول كبير (5,000 صف — نفس نطاق الملف الحقيقي الذي عَلَّق المتصفح): عدد عناصر <tr> الفعلية بالـDOM محدود، لا 5,000', () => {
    const rows = makeRows(5000);
    const { container, root } = renderGrid(rows);
    cleanup.push({ root, container });
    const trs = container.querySelectorAll('tr[data-rowid]');
    expect(trs.length).toBeGreaterThan(0);
    expect(trs.length).toBeLessThan(100); // نافذة العرض + هامش احتياطي فقط، لا كل الصفوف
  });

  it('الانتقال (عبر ref.scrollToRow) لصف بعيد تمامًا خارج نافذة العرض الحالية يجعله يظهر بالـDOM فعليًا', async () => {
    const rows = makeRows(5000);
    const { container, root, ref } = renderGrid(rows);
    cleanup.push({ root, container });

    // الصف 3000 بعيد جدًا عن أول نافذة عرض (تبدأ من الصف 0) — لن يكون مرسومًا بالـDOM إطلاقًا
    expect(container.querySelector('tr[data-rowid="r3000"]')).toBeFalsy();

    await act(async () => { ref.current.scrollToRow('r3000'); });

    expect(container.querySelector('tr[data-rowid="r3000"]')).toBeTruthy();
  });
});
