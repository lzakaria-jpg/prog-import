// @vitest-environment jsdom
// [إضافة 2026-10-08] تنبيه قبل الإرسال عبر API: الرقم المرجعي من ملف العميل لا
// ينتقل (لا حقل له بواجهة قيود) — الإرسال لا يبدأ إلا بعد تأكيد صريح.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import Step4Export from '../Step4Export.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mounted = [];
afterEach(() => { mounted.forEach(({ root, el }) => { act(() => root.unmount()); el.remove(); }); mounted.length = 0; });

function render(eng) {
  const el = document.createElement('div'); document.body.appendChild(el);
  const root = createRoot(el); mounted.push({ root, el });
  act(() => { root.render(React.createElement(Step4Export, { eng })); });
  return el;
}
const baseEng = (rows) => ({
  rows, goodRows: rows, badRows: [], stats: { pendingDecision: 0 }, canSendViaApi: true, sendableRows: rows,
  apiSending: false, apiSendProgress: { current: 0, total: 0 }, apiSendResult: null, notes: {},
  pushViaApi: vi.fn(), doExport: vi.fn(), stopApiSend: vi.fn(),
  helpers: { rowErr: () => false, rowWarn: () => false },
});
const click = (el, text) => act(() => { [...el.querySelectorAll('button')].find((b) => b.textContent.includes(text)).click(); });

describe('Step4Export — تنبيه الأرقام المرجعية قبل الإرسال عبر API', () => {
  it('ملف بأرقام مرجعية: لا إرسال قبل التأكيد، وخيار القالب يصدّر الصفوف السليمة', () => {
    const eng = baseEng([{ i: 1, name: 'أ', ref: '12060001', refAutoSuggested: false, action: 'create' }]);
    const el = render(eng);
    click(el, 'عبر API');
    expect(eng.pushViaApi).not.toHaveBeenCalled();
    expect(el.textContent).toContain('12060001');
    click(el, 'حمّل القالب بالأرقام المرجعية');
    expect(eng.doExport).toHaveBeenCalledWith('valid');
    expect(eng.pushViaApi).not.toHaveBeenCalled();
    click(el, 'عبر API');
    click(el, 'أكمل الإرسال عبر API');
    expect(eng.pushViaApi).toHaveBeenCalledTimes(1);
  });

  it('أرقام مقترحة من الأداة فقط: الإرسال مباشر بلا تنبيه', () => {
    const eng = baseEng([{ i: 1, name: 'أ', ref: 'CUS001', refAutoSuggested: true, action: 'create' }]);
    const el = render(eng);
    click(el, 'عبر API');
    expect(eng.pushViaApi).toHaveBeenCalledTimes(1);
  });
});
