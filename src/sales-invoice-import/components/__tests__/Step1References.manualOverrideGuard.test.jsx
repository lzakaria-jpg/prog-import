// @vitest-environment jsdom
//
// [إضافة، إصلاح خطأ حقيقي 2026-09-16] راجع تعليق guardManualOverride بـ
// Step1References.jsx: رفع ملف يدوي لبطاقة (منتجات/مخزون/عملاء) سبق جلبها عبر
// API (raw===null) كان يستبدل الفهرس الحقيقي (يحمل id حقيقي بقيود) بفهرس يدوي
// بلا أي id بصمت تام — بلاغ اختبار حي: مستخدم جلب كل شيء عبر API بنجاح ثم رفع
// "تقرير المنتجات" يدويًا فوقه (عادة قديمة)، فتحوّلت كل أخطاء المنتج لحاجبة صلبة
// بلا code (لا إنشاء تلقائي، ولا إرسال فاتورة عبر API ناجح لذلك المنتج لاحقًا
// حتى لو تطابق). الآن يُطلب تأكيد صريح قبل الاستبدال.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import Step1References from '../Step1References.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY_TEMPLATE = { loaded: false, dropdowns: { G: [], H: [], S: ['نعم', 'لا'], L: [], V: [] }, missingFields: [] };
const API_PRODUCTS_REF = { loaded: true, raw: null, bySku: new Map(), byName: new Map() };
const MANUAL_PRODUCTS_REF_NOT_LOADED = { loaded: false, raw: null };
const EMPTY_STOCK_REF = { loaded: false, raw: null };
const EMPTY_CUSTOMERS_REF = { loaded: false, raw: null };

function baseEngine(overrides = {}) {
  return {
    template: EMPTY_TEMPLATE,
    productsRef: MANUAL_PRODUCTS_REF_NOT_LOADED,
    stockRef: EMPTY_STOCK_REF,
    customersRef: EMPTY_CUSTOMERS_REF,
    uploadTemplate: () => {},
    uploadReferenceFile: vi.fn(),
    confirmReferenceMapping: () => {},
    goToStep: () => {},
    uploadError: '',
    customerName: '',
    readyForStep2: false,
    ...overrides,
  };
}

function renderStep1(engine) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(Step1References, { engine }));
  });
  return { container, root };
}

function triggerProductsFileInput(container, file) {
  const cards = Array.from(container.querySelectorAll('#card-products input[type="file"]'));
  const input = cards[0];
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

let cleanup = [];
afterEach(() => {
  cleanup.forEach(({ root, container }) => { act(() => root.unmount()); container.remove(); });
  cleanup = [];
  vi.restoreAllMocks();
});

describe('Step1References — حماية استبدال بطاقة مجلوبة عبر API برفع يدوي بصمت', () => {
  it('بطاقة منتجات مجلوبة عبر API (raw===null) + المستخدم يؤكد الاستبدال ⇒ uploadReferenceFile يُستدعى', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const uploadReferenceFile = vi.fn();
    const engine = baseEngine({ productsRef: API_PRODUCTS_REF, uploadReferenceFile });
    const { container, root } = renderStep1(engine);
    cleanup.push({ root, container });

    const file = new File(['x'], 'products.xlsx');
    triggerProductsFileInput(container, file);

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(uploadReferenceFile).toHaveBeenCalledWith('products', file);
  });

  it('بطاقة منتجات مجلوبة عبر API (raw===null) + المستخدم يلغي التأكيد ⇒ uploadReferenceFile لا يُستدعى إطلاقًا', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const uploadReferenceFile = vi.fn();
    const engine = baseEngine({ productsRef: API_PRODUCTS_REF, uploadReferenceFile });
    const { container, root } = renderStep1(engine);
    cleanup.push({ root, container });

    triggerProductsFileInput(container, new File(['x'], 'products.xlsx'));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(uploadReferenceFile).not.toHaveBeenCalled();
  });

  it('بطاقة منتجات لم تُجلب بعد (بلا API) ⇒ الرفع اليدوي يمر مباشرة بلا أي تأكيد', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const uploadReferenceFile = vi.fn();
    const engine = baseEngine({ productsRef: MANUAL_PRODUCTS_REF_NOT_LOADED, uploadReferenceFile });
    const { container, root } = renderStep1(engine);
    cleanup.push({ root, container });

    const file = new File(['x'], 'products.xlsx');
    triggerProductsFileInput(container, file);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(uploadReferenceFile).toHaveBeenCalledWith('products', file);
  });

  it('بطاقة منتجات مرفوعة يدويًا مسبقًا (raw غير null) ⇒ رفع ملف يدوي جديد بلا أي تأكيد (ليست استبدال API)', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const uploadReferenceFile = vi.fn();
    const manualLoadedRef = { loaded: true, raw: [['x']], bySku: new Map(), byName: new Map() };
    const engine = baseEngine({ productsRef: manualLoadedRef, uploadReferenceFile });
    const { container, root } = renderStep1(engine);
    cleanup.push({ root, container });

    const file = new File(['x'], 'products.xlsx');
    triggerProductsFileInput(container, file);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(uploadReferenceFile).toHaveBeenCalledWith('products', file);
  });
});
