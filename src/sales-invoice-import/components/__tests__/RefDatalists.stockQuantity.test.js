// @vitest-environment jsdom
//
// [إضافة] RefDatalists يبني قائمة منتجات منفصلة لكل موقع مخزون حقيقي (stockRef.byKey)
// بلاحقة الكمية المتوفرة بذلك الموقع بجانب اسم المنتج — راجع GridCell.jsx (يختار أيها
// يعرضه لعمود N حسب G بنفس الصف) وqoyodSalesRefFetch.buildStockIndexFromApi (نفس الفهرس
// المستخدَم فعليًا من stockSimulation.checkStockSequential بلا أي تعديل عليه هناك).
import { describe, it, expect, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import RefDatalists from '../RefDatalists.jsx';
import { productDatalistIdForLocation } from '../../engine/text.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY_REF = { loaded: false };

const PRODUCTS_REF = {
  loaded: true,
  bySku: new Map([['SKU1', { sku: 'SKU1', name: 'قلم' }]]),
};

function render(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(RefDatalists, {
      customersRef: EMPTY_REF, productsRef: EMPTY_REF, projectsRef: EMPTY_REF, stockRef: EMPTY_REF,
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

describe('RefDatalists — قوائم منتجات لكل موقع مخزون (كمية متوفرة)', () => {
  it('يبني datalist منفصل لكل موقع، بلاحقة الكمية الصحيحة لذلك الموقع', () => {
    const stockRef = {
      loaded: true,
      byKey: new Map([
        ['SKU1||الرياض', 5],
        ['SKU1||الدمام', 10],
      ]),
    };
    const { container, root } = render({ productsRef: PRODUCTS_REF, stockRef });
    cleanup.push({ root, container });

    const riyadhList = container.querySelector(`#${CSS.escape(productDatalistIdForLocation('الرياض'))}`);
    const dammamList = container.querySelector(`#${CSS.escape(productDatalistIdForLocation('الدمام'))}`);
    expect(riyadhList).toBeTruthy();
    expect(dammamList).toBeTruthy();

    const riyadhOption = riyadhList.querySelector('option');
    const dammamOption = dammamList.querySelector('option');
    expect(riyadhOption.getAttribute('value')).toBe('SKU1');
    expect(riyadhOption.getAttribute('label')).toBe('قلم (5) — SKU1');
    expect(dammamOption.getAttribute('label')).toBe('قلم (10) — SKU1');
  });

  it('منتج بلا كمية مسجَّلة بموقع معيّن: يظهر بلا لاحقة كمية بذلك الموقع (بلا افتراض صفر)', () => {
    const stockRef = { loaded: true, byKey: new Map([['SKU1||الرياض', 5]]) };
    const { container, root } = render({
      productsRef: { loaded: true, bySku: new Map([['SKU1', { sku: 'SKU1', name: 'قلم' }], ['SKU2', { sku: 'SKU2', name: 'دفتر' }]]) },
      stockRef,
    });
    cleanup.push({ root, container });
    const riyadhList = container.querySelector(`#${CSS.escape(productDatalistIdForLocation('الرياض'))}`);
    const options = Array.from(riyadhList.querySelectorAll('option'));
    const sku2Option = options.find((o) => o.getAttribute('value') === 'SKU2');
    expect(sku2Option.getAttribute('label')).toBe('دفتر — SKU2');
  });

  it('بلا بيانات مخزون إطلاقًا: لا يُبنى أي datalist بموقع، وdl-products العامة تبقى كما هي', () => {
    const { container, root } = render({ productsRef: PRODUCTS_REF });
    cleanup.push({ root, container });
    expect(container.querySelector(`#${CSS.escape(productDatalistIdForLocation('الرياض'))}`)).toBeFalsy();
    expect(container.querySelector('#dl-products')).toBeTruthy();
  });
});
