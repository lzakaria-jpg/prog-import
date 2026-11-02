// ترجمة رسائل المحرك وأسماء الحقول للإنجليزية مع حفظ القيم بين التنصيص والأرقام كما هي.
import { describe, it, expect } from 'vitest';
import { trMsg } from '../lib/messages.js';

describe('trMsg', () => {
  it('بالعربي يرجع النص كما هو', () => {
    expect(trMsg('حقل إلزامي فاضي', 'ar')).toBe('حقل إلزامي فاضي');
  });
  it('يترجم أسماء الحقول والرسائل', () => {
    expect(trMsg('رقم الهوية الوطنية')).toBe('National ID / Iqama');
    expect(trMsg('حقل إلزامي فاضي')).toBe('Required field is empty');
  });
  it('يحفظ القيم بين التنصيص والأرقام', () => {
    expect(trMsg('رقم جوال سعودي ناقص أو زائد (8 خانات بدل 10): "05041462"'))
      .toBe('Saudi mobile number too short or too long (8 digits instead of 10): "05041462"');
    expect(trMsg('رقم الهوية فيه حرف بدل رقم: الخانة 2 "O" (حرف O إنجليزي بدل صفر) — قيود يقبل أرقام فقط'))
      .toBe('The ID has a character instead of a digit: position 2 "O" (letter O instead of zero) — Qoyod accepts digits only');
  });
  it('"الأصل: …" يترجم العنوان ويترك القيمة', () => {
    expect(trMsg('توحيد صيغة التاريخ\nالأصل: ١٨/٠٣/٢٠١٧')).toBe('Date format normalized\nOriginal: ١٨/٠٣/٢٠١٧');
  });
});
