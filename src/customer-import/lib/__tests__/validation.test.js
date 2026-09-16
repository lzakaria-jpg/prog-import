import { describe, it, expect } from 'vitest';
import { isValidPhone, isValidTaxNumber, normalizeStatus, isBillingZipPlausible, validateRow, rowErr } from '../validation.js';

describe('isValidPhone', () => {
  it('يقبل مثال المواصفة الرسمية حرفياً: "+966501234567"', () => {
    expect(isValidPhone('+966501234567')).toBe(true);
  });
  it('يقبل نفس الرقم بلا علامة +', () => {
    expect(isValidPhone('966501234567')).toBe(true);
  });
  it('يرفض رقماً لا يبدأ بـ966', () => {
    expect(isValidPhone('+201001234567')).toBe(false);
  });
  it('يرفض رقماً أقصر من 12 رقماً', () => {
    expect(isValidPhone('+96650123456')).toBe(false);
  });
  it('يرفض رقماً أطول من 12 رقماً', () => {
    expect(isValidPhone('+9665012345678')).toBe(false);
  });
  it('فارغ = لا خطأ (الهاتف غير إلزامي)', () => {
    expect(isValidPhone('')).toBe(true);
    expect(isValidPhone(null)).toBe(true);
  });
});

describe('isValidTaxNumber', () => {
  it('يقبل مثال المواصفة الرسمية حرفياً: "312345678912343"', () => {
    expect(isValidTaxNumber('312345678912343')).toBe(true);
  });
  it('يرفض رقماً لا يبدأ بـ3', () => {
    expect(isValidTaxNumber('412345678912343')).toBe(false);
  });
  it('يرفض رقماً لا ينتهي بـ3', () => {
    expect(isValidTaxNumber('312345678912344')).toBe(false);
  });
  it('يرفض رقماً ليس 15 رقماً', () => {
    expect(isValidTaxNumber('31234567891234')).toBe(false);
    expect(isValidTaxNumber('3123456789123433')).toBe(false);
  });
  it('فارغ = لا خطأ', () => {
    expect(isValidTaxNumber('')).toBe(true);
  });
});

describe('normalizeStatus', () => {
  it('يطبّع "Active"/"نشط"/"فعال" إلى Active', () => {
    expect(normalizeStatus('Active')).toBe('Active');
    expect(normalizeStatus('نشط')).toBe('Active');
    expect(normalizeStatus('فعال')).toBe('Active');
  });
  it('يطبّع "Inactive"/"غير نشط"/"معطل"/"موقوف" إلى Inactive', () => {
    expect(normalizeStatus('Inactive')).toBe('Inactive');
    expect(normalizeStatus('غير نشط')).toBe('Inactive');
    expect(normalizeStatus('معطل')).toBe('Inactive');
    expect(normalizeStatus('موقوف')).toBe('Inactive');
  });
  it('الفارغ/غير المعروف يُفترض Active (نفس افتراض المواصفة الرسمية)', () => {
    expect(normalizeStatus('')).toBe('Active');
    expect(normalizeStatus('xyz')).toBe('Active');
  });
});

describe('isBillingZipPlausible', () => {
  it('5 أرقام بالضبط = صالح', () => { expect(isBillingZipPlausible('12345')).toBe(true); });
  it('غير 5 أرقام = غير صالح (تحذير لا خطأ — راجع validateRow)', () => {
    expect(isBillingZipPlausible('1234')).toBe(false);
    expect(isBillingZipPlausible('123456')).toBe(false);
  });
  it('فارغ = صالح', () => { expect(isBillingZipPlausible('')).toBe(true); });
});

describe('validateRow', () => {
  it('الاسم المفقود خطأ مانع', () => {
    const row = { name: '' };
    validateRow(row);
    expect(rowErr(row)).toBe(true);
  });
  it('هاتف غير صالح خطأ مانع، لكن الرمز البريدي غير الصالح تحذير فقط', () => {
    const row = { name: 'X', phone: '+20100', billingZip: '123' };
    validateRow(row);
    expect(rowErr(row)).toBe(true);
    const zipIssue = row.issues.find((i) => i.m.includes('الرمز البريدي'));
    expect(zipIssue.l).toBe('w');
  });
  it('صف سليم كاملاً بلا مشاكل', () => {
    const row = { name: 'أحمد', phone: '+966501234567', taxNumber: '312345678912343', billingZip: '12345', status: 'نشط' };
    validateRow(row);
    expect(rowErr(row)).toBe(false);
    expect(row.statusNorm).toBe('Active');
  });
});
