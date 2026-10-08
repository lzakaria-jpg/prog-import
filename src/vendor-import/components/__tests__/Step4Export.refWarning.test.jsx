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
  qoyodTemplate: { rows, excluded: [], autoRefsBlanked: 0 },
});
const click = (el, text) => act(() => { [...el.querySelectorAll('button')].find((b) => b.textContent.includes(text)).click(); });

describe('Step4Export — تنبيه الأرقام المرجعية قبل الإرسال عبر API', () => {
  it('ملف بأرقام مرجعية: لا إرسال قبل التأكيد، وخيار القالب يصدّر الصفوف السليمة', () => {
    const eng = baseEng([{ i: 1, name: 'أ', ref: 'V0001', refAutoSuggested: false, action: 'create' }]);
    const el = render(eng);
    click(el, 'عبر API');
    expect(eng.pushViaApi).not.toHaveBeenCalled();
    expect(el.textContent).toContain('V0001');
    click(el, 'حمّل قالب قيود جاهز للرفع بالأرقام المرجعية');
    expect(eng.doExport).toHaveBeenCalledWith('qoyod');
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

  it('زر قالب قيود جاهز للرفع ظاهر دائماً بجانب الإرسال عبر API ويصدّر نوع qoyod', () => {
    const eng = baseEng([{ i: 1, name: 'أ', ref: 'V0001', refAutoSuggested: false, action: 'create' }]);
    const el = render(eng);
    expect(el.textContent).toContain('تحميل قالب قيود جاهز للرفع (1 صف)');
    click(el, 'تحميل قالب قيود جاهز للرفع');
    expect(eng.doExport).toHaveBeenCalledWith('qoyod');
    expect([...el.querySelectorAll('button')].some((b) => b.textContent.includes('عبر API'))).toBe(true);
  });
});
