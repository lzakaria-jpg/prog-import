// @vitest-environment jsdom
//
// [إضافة] يغطي جزئين طُلبا من المستخدم فعليًا 2026-09-11:
// 1) عمود "المشروع" الجديد (خارج COL_KEYS تمامًا) يظهر ويمكن تعديله بجدول الفواتير.
// 2) بلا قالب مرفوع، عمودا الموقع (G) والضريبة% (V) يصيران قائمة منسدلة حقيقية من
//    بيانات مجلوبة عبر API (locationOptions/taxesRef) بدل حقل نص حر — بلا أي تأثير
//    على السلوك الأصلي عندما لا تتوفر هذه البيانات (نفس نص حر كما كان دومًا).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import InvoiceGrid from '../InvoiceGrid.jsx';
import { createRow } from '../../engine/rows.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY_TEMPLATE = { loaded: false, dropdowns: { G: [], H: [], S: ['نعم', 'لا'], L: [], V: [] } };
const EMPTY_REF = { loaded: false };
const EMPTY_ISSUES = { byRow: {}, list: [] };

function renderGrid(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(InvoiceGrid, {
      tableId: 'data-grid-test', template: EMPTY_TEMPLATE,
      customersRef: EMPTY_REF, productsRef: EMPTY_REF, taxesRef: EMPTY_REF, locationOptions: [], projectsRef: EMPTY_REF,
      issues: EMPTY_ISSUES, revalidate: false,
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

describe('InvoiceGrid — عمود المشروع', () => {
  it('يظهر عمود "المشروع" بترويسة الجدول', () => {
    const { container, root } = renderGrid({ rows: [createRow(1, { A: 'INV-1' })] });
    cleanup.push({ root, container });
    const headers = Array.from(container.querySelectorAll('th')).map((th) => th.textContent);
    expect(headers.some((h) => h.includes('المشروع'))).toBe(true);
  });

  it('يعرض قيمة row.projectRef الحالية، ويستدعي onUpdateCell(rowId, "projectRef", value) عند التعديل', () => {
    const onUpdateCell = vi.fn();
    const rows = [createRow(1, { A: 'INV-1', projectRef: 'مشروع الرياض' })];
    const { container, root } = renderGrid({ rows, onUpdateCell });
    cleanup.push({ root, container });
    const inputs = Array.from(container.querySelectorAll('input'));
    const projectInput = inputs.find((i) => i.value === 'مشروع الرياض');
    expect(projectInput).toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(projectInput, 'مشروع جدة');
      projectInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onUpdateCell).toHaveBeenCalledWith(1, 'projectRef', 'مشروع جدة', { revalidate: false });
  });
});

describe('InvoiceGrid — قوائم G/V المنسدلة من بيانات API بلا قالب', () => {
  it('بلا قالب وبلا بيانات API: G وV يبقيان حقل نص حر (بلا تغيير بالسلوك الأصلي)', () => {
    const { container, root } = renderGrid({ rows: [createRow(1, { A: 'INV-1' })] });
    cleanup.push({ root, container });
    // بلا template ولا locationOptions/taxesRef، ما فيه أي <select> إطلاقًا غير عمود S
    // (S له بديل نعم/لا ثابت دومًا) — نتأكد أن عدد الـselect محدود لعمود S فقط
    const selects = container.querySelectorAll('select');
    expect(selects.length).toBe(1); // S فقط
  });

  it('locationOptions متوفرة بلا قالب: عمود الموقع (G) يصير <select> بنفس الخيارات', () => {
    const { container, root } = renderGrid({
      rows: [createRow(1, { A: 'INV-1', G: 'الرياض' })],
      locationOptions: ['الرياض', 'جدة'],
    });
    cleanup.push({ root, container });
    const selects = Array.from(container.querySelectorAll('select'));
    // select واحد لـS + select جديد لـG
    expect(selects.length).toBe(2);
    const gSelect = selects.find((s) => Array.from(s.options).some((o) => o.value === 'جدة'));
    expect(gSelect).toBeTruthy();
    expect(gSelect.value).toBe('الرياض');
  });

  it('taxesRef.labels متوفرة بلا قالب: عمود الضريبة% (V) يصير <select> بنفس التسميات (وM أيضًا — تشترك dd:"V")', () => {
    const { container, root } = renderGrid({
      rows: [createRow(1, { A: 'INV-1', V: '15%' })],
      taxesRef: { loaded: true, labels: ['15%', '0%'] },
    });
    cleanup.push({ root, container });
    // S ثابت دومًا + V وM (كلاهما dd:'V' فيستفيدان معًا من taxesRef.labels)
    const taxSelects = Array.from(container.querySelectorAll('select'))
      .filter((s) => Array.from(s.options).some((o) => o.value === '0%'));
    expect(taxSelects.length).toBe(2); // V + M
    const vSelect = taxSelects.find((s) => s.value === '15%');
    expect(vSelect).toBeTruthy();
  });
});
