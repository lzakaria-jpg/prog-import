// @vitest-environment jsdom
//
// [إضافة، إصلاح خطأ حقيقي] راجع تعليق رأس GridCell.jsx (كتلة col.type === 'dropdown').
// عمود الموقع (G) كان يعرض قائمة template.dropdowns.G الثابتة (لقطة وقت رفع
// ملف القالب) حصريًا كلما كان قالب مرفوعًا — والقالب إلزامي دومًا بالأداة، فهذا
// يعني تجاهل locationOptions (المجلوبة عبر API، الأحدث/الأدق) بشكل دائم فعليًا.
// بلاغ اختبار حي: مواقع حقيقية جديدة بمنشأة العميل لا تظهر بقائمة الخلية إطلاقًا،
// يُجبر المستخدم على اختيار موقع خاطئ من القالب القديم فقط ليتجاوز التحقق.
import { describe, it, expect, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import InvoiceGrid from '../InvoiceGrid.jsx';
import { createRow } from '../../engine/rows.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY_REF = { loaded: false };
const EMPTY_ISSUES = { byRow: {}, list: [] };

function renderGrid(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(InvoiceGrid, {
      tableId: 'data-grid-test', customersRef: EMPTY_REF, productsRef: EMPTY_REF, taxesRef: EMPTY_REF,
      projectsRef: EMPTY_REF, stockRef: EMPTY_REF, issues: EMPTY_ISSUES, revalidate: false,
      onUpdateCell: () => {}, onDeleteRow: () => {}, onPasteGrid: () => {},
      ...props,
    }));
  });
  return { container, root };
}

let cleanup = [];
afterEach(() => {
  cleanup.forEach(({ root, container }) => { act(() => root.unmount()); container.remove(); });
  cleanup = [];
});

function locationSelectOptions(container) {
  const selects = Array.from(container.querySelectorAll('select[data-col-key="G"]'));
  return selects[0] ? Array.from(selects[0].options).map((o) => o.value).filter(Boolean) : null;
}

describe('GridCell — مصدر قائمة الموقع (G) مع قالب مرفوع + locationOptions معًا', () => {
  it('قالب مرفوع (loaded:true) لكن locationOptions متاحة ⇒ تُستخدَم locationOptions، لا template.dropdowns.G', () => {
    const template = { loaded: true, dropdowns: { G: ['موقع قديم بالقالب'], H: [], S: ['نعم', 'لا'], L: [], V: [] } };
    const row = createRow('r1', { G: 'موقع جديد حي' });
    const { container, root } = renderGrid({
      rows: [row], template, locationOptions: ['موقع جديد حي', 'موقع آخر حي'],
    });
    cleanup.push({ root, container });
    expect(locationSelectOptions(container)).toEqual(['موقع جديد حي', 'موقع آخر حي']);
  });

  it('قالب مرفوع بلا locationOptions إطلاقًا ⇒ يبقى السلوك القديم (template.dropdowns.G) كما هو', () => {
    const template = { loaded: true, dropdowns: { G: ['موقع قديم بالقالب'], H: [], S: ['نعم', 'لا'], L: [], V: [] } };
    const row = createRow('r1', { G: 'موقع قديم بالقالب' });
    const { container, root } = renderGrid({ rows: [row], template, locationOptions: [] });
    cleanup.push({ root, container });
    expect(locationSelectOptions(container)).toEqual(['موقع قديم بالقالب']);
  });
});
