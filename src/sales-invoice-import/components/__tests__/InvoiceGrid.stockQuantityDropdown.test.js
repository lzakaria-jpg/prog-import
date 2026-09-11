// @vitest-environment jsdom
//
// [إضافة] طُلب من المستخدم 2026-09-11: بصفحة التحقق (الخطوة 3)، عند اختيار منتج من
// القائمة، تظهر الكمية المتوفرة بجانب اسمه بناءً على الموقع (G) المحدَّد بنفس الصف —
// نفس المنتج يظهر بكمية مختلفة حسب الموقع (5 بالمركز الرئيسي، 10 بالدمام مثلًا).
// التنفيذ: عمود N يشير لـ<datalist> مختلف لكل موقع حقيقي (RefDatalists.jsx يبنيها،
// معرّفها productDatalistIdForLocation) بدل القائمة العامة dl-products الثابتة —
// لا علاقة لهذا بمطابقة المنتج نفسها (لا تزال بالكود N فقط، بلا أي تغيير).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import InvoiceGrid from '../InvoiceGrid.jsx';
import { createRow } from '../../engine/rows.js';
import { productDatalistIdForLocation } from '../../engine/text.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY_TEMPLATE = { loaded: false, dropdowns: { G: [], H: [], S: ['نعم', 'لا'], L: [], V: [] } };
const EMPTY_REF = { loaded: false };
const EMPTY_ISSUES = { byRow: {}, list: [] };

const PRODUCTS_REF = {
  loaded: true,
  bySku: new Map([['SKU1', { sku: 'SKU1', name: 'قلم' }]]),
};
const STOCK_REF = {
  loaded: true,
  byKey: new Map([
    ['SKU1||الرياض', 5],
    ['SKU1||الدمام', 10],
  ]),
};

function renderGrid(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(InvoiceGrid, {
      tableId: 'data-grid-test', template: EMPTY_TEMPLATE,
      customersRef: EMPTY_REF, productsRef: EMPTY_REF, taxesRef: EMPTY_REF, locationOptions: [], projectsRef: EMPTY_REF,
      stockRef: EMPTY_REF,
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

function findProductInput(container) {
  return Array.from(container.querySelectorAll('input')).find((i) => i.value === 'SKU1');
}

describe('InvoiceGrid — قائمة منتجات خاصة بموقع الصف (كمية متوفرة)', () => {
  it('بيانات مخزون متوفرة وموقع محدَّد بالصف: عمود N يشير لقائمة الموقع (لا القائمة العامة)', () => {
    const { container, root } = renderGrid({
      rows: [createRow(1, { A: 'INV-1', G: 'الرياض', N: 'SKU1' })],
      productsRef: PRODUCTS_REF, stockRef: STOCK_REF,
    });
    cleanup.push({ root, container });
    const productInput = findProductInput(container);
    expect(productInput).toBeTruthy();
    expect(productInput.getAttribute('list')).toBe(productDatalistIdForLocation('الرياض'));
  });

  it('تغيير الموقع لصف آخر بنفس الجدول ⇒ قائمة مختلفة لكل صف', () => {
    const { container, root } = renderGrid({
      rows: [
        createRow(1, { A: 'INV-1', G: 'الرياض', N: 'SKU1' }),
        createRow(2, { A: 'INV-2', G: 'الدمام', N: 'SKU1' }),
      ],
      productsRef: PRODUCTS_REF, stockRef: STOCK_REF,
    });
    cleanup.push({ root, container });
    const productInputs = Array.from(container.querySelectorAll('input')).filter((i) => i.value === 'SKU1');
    expect(productInputs).toHaveLength(2);
    expect(productInputs[0].getAttribute('list')).toBe(productDatalistIdForLocation('الرياض'));
    expect(productInputs[1].getAttribute('list')).toBe(productDatalistIdForLocation('الدمام'));
  });

  it('بلا بيانات مخزون إطلاقًا: يبقى السلوك الأصلي (dl-products العامة)', () => {
    const { container, root } = renderGrid({
      rows: [createRow(1, { A: 'INV-1', G: 'الرياض', N: 'SKU1' })],
      productsRef: PRODUCTS_REF,
    });
    cleanup.push({ root, container });
    const productInput = findProductInput(container);
    expect(productInput.getAttribute('list')).toBe('dl-products');
  });

  it('بيانات مخزون متوفرة لكن الموقع (G) فارغ بعد بالصف: يبقى dl-products العامة', () => {
    const { container, root } = renderGrid({
      rows: [createRow(1, { A: 'INV-1', G: '', N: 'SKU1' })],
      productsRef: PRODUCTS_REF, stockRef: STOCK_REF,
    });
    cleanup.push({ root, container });
    const productInput = findProductInput(container);
    expect(productInput.getAttribute('list')).toBe('dl-products');
  });
});
