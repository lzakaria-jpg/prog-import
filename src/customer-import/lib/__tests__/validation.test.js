import { describe, it, expect } from 'vitest';
import {
  isValidPhone, isValidTaxNumber, normalizeStatus, isBillingZipPlausible, validateRow, rowErr,
  autoFixPhone, autoFixTaxNumber,
} from '../validation.js';

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

describe('[إضافة 2026-09-21] autoFixPhone — تصحيح تلقائي (زر "تطبيق كل التصحيحات")', () => {
  it('يضيف 966 لرقم محلي يبدأ بصفر (0501234567 => 966501234567)', () => {
    expect(autoFixPhone('0501234567')).toBe('966501234567');
    expect(isValidPhone(autoFixPhone('0501234567'))).toBe(true);
  });
  it('يضيف 966 لرقم بلا صفر بادئ (501234567 => 966501234567)', () => {
    expect(autoFixPhone('501234567')).toBe('966501234567');
  });
  it('رقم يبدأ بـ966 فعلاً وصالح: يبقى كما هو', () => {
    expect(autoFixPhone('966501234567')).toBe('966501234567');
  });
  it('رقم يبدأ بـ966 فعلاً لكن طوله غير صحيح: لا يُقصّ ولا يُكمَّل — يبقى كما هو (يستمر مرفوضاً بوضوح)', () => {
    expect(autoFixPhone('9665012345678')).toBe('9665012345678');
    expect(isValidPhone(autoFixPhone('9665012345678'))).toBe(false);
  });
  it('رقم لا يبدأ بصفر ولا بـ966، بعد إضافة 966 يصير أطول من 12: يبقى غير صالح بوضوح بدل قصّه', () => {
    const fixed = autoFixPhone('12345678901');
    expect(fixed).toBe('96612345678901');
    expect(isValidPhone(fixed)).toBe(false);
  });
  it('فارغ يبقى فارغاً', () => {
    expect(autoFixPhone('')).toBe('');
    expect(autoFixPhone(null)).toBe('');
  });
});

describe('[إضافة 2026-09-21] autoFixTaxNumber — تصحيح تلقائي (زر "تطبيق كل التصحيحات")', () => {
  it('يصحّح الرقم الأخير فقط إلى 3 لو الرقم يبدأ بـ3 ولا ينتهي به (15 رقماً)', () => {
    expect(autoFixTaxNumber('312345678912340')).toBe('312345678912343');
    expect(isValidTaxNumber(autoFixTaxNumber('312345678912340'))).toBe(true);
  });
  it('رقم صالح فعلاً: يبقى كما هو', () => {
    expect(autoFixTaxNumber('312345678912343')).toBe('312345678912343');
  });
  it('رقم لا يبدأ بـ3: لا يُعدَّل إطلاقاً (لا يمكن تخمين البداية الصحيحة)', () => {
    expect(autoFixTaxNumber('412345678912340')).toBe('412345678912340');
  });
  it('رقم يبدأ بـ3 لكن طوله غير 15 (14 رقماً): يُصحَّح آخر رقم فقط، ويبقى مرفوضاً بسبب الطول تحديداً — لا تخمين لرقم مفقود', () => {
    const fixed = autoFixTaxNumber('31234567891230');
    expect(fixed).toBe('31234567891233');
    expect(isValidTaxNumber(fixed)).toBe(false);
  });
  it('فارغ يبقى فارغاً', () => {
    expect(autoFixTaxNumber('')).toBe('');
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
