// @vitest-environment jsdom
//
// [إضافة، تصحيح 2026-09-17، خطأ محاسبي فادح حسب المستخدم] راجع تعليق رأس
// StockShortageReviewPanel.jsx وgetStockTopUpNeeds بـstockSimulation.js: سعر
// تكلفة تعديل المخزون لم يعد يُشتَق تلقائيًا من سعر البيع إطلاقًا — المستخدم
// يُدخِله يدويًا لكل منتج، إلزاميًا، قبل تفعيل زر التأكيد. هذا الاختبار يقفل
// سلوك تفعيل/تعطيل الزر وشكل onTopUpConfirm الناتج.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import StockShortageReviewPanel from '../StockShortageReviewPanel.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MOCK_ACCOUNTS = [
  { id: 10, code: '4001', type: 'Revenue', name_ar: 'إيرادات المبيعات' },
  { id: 20, code: '5001', type: 'Expense', name_ar: 'المصروفات التشغيلية' },
  { id: 30, code: '3001', type: 'Equity', name_ar: 'الأرباح المُحتجزة' },
];

function mockAccountsFetch() {
  global.fetch = vi.fn().mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('page=1')) return { ok: true, status: 200, text: async () => JSON.stringify({ accounts: MOCK_ACCOUNTS }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ accounts: [] }) };
  });
}

function renderPanel(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(StockShortageReviewPanel, {
      groups: [{ ref: 'INV-1', messages: ['نقص متوقع'] }],
      apiKey: 'KEY',
      onCancel: () => {},
      onConfirm: () => {},
      stockTopUpNeeds: [{ sku: 'SKU-1', loc: 'الرياض', shortfall: 5 }],
      ...props,
    }));
  });
  return { container, root };
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

let cleanup = [];
afterEach(() => {
  cleanup.forEach(({ root, container }) => { act(() => root.unmount()); container.remove(); });
  cleanup = [];
  vi.restoreAllMocks();
});

function openTopUpSection(container) {
  const openBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('تغذية المخزون تلقائيًا'));
  act(() => { openBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function findConfirmButton(container) {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('تأكيد التغذية وإرسال كل الفواتير'));
}

function setInputByPlaceholder(container, placeholder, value) {
  const input = Array.from(container.querySelectorAll('input')).find((i) => i.placeholder === placeholder);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
}

describe('StockShortageReviewPanel — سعر التكلفة اليدوي إلزامي (لا اشتقاق تلقائي من سعر البيع)', () => {
  it('زر التأكيد معطَّل حتى تُدخَل تكلفة كل SKU وتُختار الحسابات ويُقَر الأثر المحاسبي', async () => {
    mockAccountsFetch();
    const onTopUpConfirm = vi.fn();
    const { container, root } = renderPanel({ onTopUpConfirm });
    cleanup.push({ root, container });

    openTopUpSection(container);
    await flush();

    const confirmBtn = findConfirmButton(container);
    expect(confirmBtn.disabled).toBe(true); // بلا حسابات ولا تكلفة ولا إقرار بعد

    // إدخال التكلفة فقط لا يكفي بلا الحسابات والإقرار
    setInputByPlaceholder(container, 'سعر التكلفة...', '55.5');
    expect(findConfirmButton(container).disabled).toBe(true);
  });

  it('onTopUpConfirm يستقبل costBySku وdate كما أدخلهما المستخدم — لا rate مشتقًا من أي مكان آخر', async () => {
    mockAccountsFetch();
    const onTopUpConfirm = vi.fn();
    const { container, root } = renderPanel({ onTopUpConfirm });
    cleanup.push({ root, container });

    openTopUpSection(container);
    await flush();

    setInputByPlaceholder(container, 'سعر التكلفة...', '55.5');

    // اختيار الحسابين عبر SearchableSelect (input نصي يطابق label كامل من datalist)
    const accountInputs = Array.from(container.querySelectorAll('input[type="text"]'));
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    act(() => {
      setter.call(accountInputs[0], '4001 — إيرادات المبيعات');
      accountInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      setter.call(accountInputs[1], '5001 — المصروفات التشغيلية');
      accountInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    });

    // [ملاحظة] أول checkbox بالـDOM هو صف الفاتورة بالجدول أعلى اللوحة (groups) —
    // إقرار الأثر المحاسبي هو آخر checkbox مرسوم (بعد جدول تكلفة المنتجات).
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    const ack = checkboxes[checkboxes.length - 1];
    act(() => { ack.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const confirmBtn = findConfirmButton(container);
    expect(confirmBtn.disabled).toBe(false);
    act(() => { confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onTopUpConfirm).toHaveBeenCalledTimes(1);
    const arg = onTopUpConfirm.mock.calls[0][0];
    expect(arg.revenueAccountId).toBe(10);
    expect(arg.expenseAccountId).toBe(20);
    expect(arg.costBySku).toEqual({ 'SKU-1': '55.5' });
    expect(typeof arg.date).toBe('string');
    expect(arg.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('حساب الإيراد يعرض حسابات Revenue+Equity، وحساب المصروف يعرض حسابات Expense+Equity', async () => {
    mockAccountsFetch();
    const { container, root } = renderPanel({ onTopUpConfirm: vi.fn() });
    cleanup.push({ root, container });

    openTopUpSection(container);
    await flush();

    const datalists = container.querySelectorAll('datalist');
    const revenueOptions = Array.from(datalists[0].querySelectorAll('option')).map((o) => o.value);
    const expenseOptions = Array.from(datalists[1].querySelectorAll('option')).map((o) => o.value);
    expect(revenueOptions).toEqual(['4001 — إيرادات المبيعات', '3001 — الأرباح المُحتجزة']);
    expect(expenseOptions).toEqual(['5001 — المصروفات التشغيلية', '3001 — الأرباح المُحتجزة']);
  });
});
