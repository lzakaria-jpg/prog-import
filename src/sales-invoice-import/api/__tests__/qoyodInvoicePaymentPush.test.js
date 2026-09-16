import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildInvoicePaymentPayload, pushInvoicePayment } from '../qoyodInvoicePaymentPush.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('buildInvoicePaymentPayload', () => {
  it('يبني حمولة صحيحة كاملة', () => {
    const built = buildInvoicePaymentPayload({ invoiceId: 8, amount: 200, accountId: 1, date: '15/12/2023' });
    expect(built).toEqual({ ok: true, payload: { invoice_id: 8, amount: '200', account_id: 1, date: '2023-12-15' } });
  });

  it('بلا invoiceId ⇒ خطأ صريح', () => {
    const built = buildInvoicePaymentPayload({ amount: 200, accountId: 1, date: '15/12/2023' });
    expect(built.ok).toBe(false);
  });

  it('بلا accountId (لم يُطابَق حساب حقيقي) ⇒ خطأ صريح', () => {
    const built = buildInvoicePaymentPayload({ invoiceId: 8, amount: 200, date: '15/12/2023' });
    expect(built.ok).toBe(false);
  });

  it('مبلغ صفري أو سالب ⇒ خطأ صريح (نفس فلسفة buildInventoryAdjustmentPayload)', () => {
    expect(buildInvoicePaymentPayload({ invoiceId: 8, amount: 0, accountId: 1, date: '15/12/2023' }).ok).toBe(false);
    expect(buildInvoicePaymentPayload({ invoiceId: 8, amount: -5, accountId: 1, date: '15/12/2023' }).ok).toBe(false);
  });

  it('تاريخ غير قابل للقراءة ⇒ خطأ صريح', () => {
    const built = buildInvoicePaymentPayload({ invoiceId: 8, amount: 200, accountId: 1, date: 'ليس تاريخًا' });
    expect(built.ok).toBe(false);
  });
});

describe('pushInvoicePayment', () => {
  it('رد مغلَّف {receipt:{id}} (كما بالمواصفة) ⇒ نجاح', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ receipt: { id: 55 } }) });
    const res = await pushInvoicePayment({ invoice_id: 8, amount: '200', account_id: 1, date: '2023-12-15' }, 'KEY');
    expect(res).toEqual({ ok: true, id: 55, response: { id: 55 } });
  });

  it('رد خام بلا غلاف (احتياطًا، نفس نمط pushMissingEntitiesToQoyod لموقع) ⇒ نجاح أيضًا', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ id: 56, amount: '200' }) });
    const res = await pushInvoicePayment({ invoice_id: 8, amount: '200', account_id: 1, date: '2023-12-15' }, 'KEY');
    expect(res).toEqual({ ok: true, id: 56, response: { id: 56, amount: '200' } });
  });

  it('رد بلا معرّف سند إطلاقًا ⇒ فشل صريح مع مقتطف الرد', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ errors: 'Cannot pay Draft invoice' }) });
    const res = await pushInvoicePayment({ invoice_id: 8, amount: '200', account_id: 1, date: '2023-12-15' }, 'KEY');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Cannot pay Draft invoice');
  });
});
