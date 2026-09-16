import { describe, it, expect } from 'vitest';
import { parseRefPattern, formatRef, suggestRefs } from '../refSuggest.js';

describe('parseRefPattern', () => {
  it('يستخرج بادئة ورقماً من "CUS14823"', () => {
    expect(parseRefPattern('CUS14823')).toEqual({ prefix: 'CUS', number: 14823, width: 5 });
  });
  it('قيمة رقمية بحتة ⇒ بادئة فارغة', () => {
    expect(parseRefPattern('1023')).toEqual({ prefix: '', number: 1023, width: 4 });
  });
  it('بلا أرقام لاحقة ⇒ null', () => {
    expect(parseRefPattern('ABC')).toBeNull();
  });
  it('فارغ ⇒ null', () => {
    expect(parseRefPattern('')).toBeNull();
    expect(parseRefPattern(null)).toBeNull();
  });
});

describe('formatRef', () => {
  it('يُعيد تعبئة الأصفار حسب العرض المطلوب', () => {
    expect(formatRef('CUS', 14825, 5)).toBe('CUS14825');
    expect(formatRef('', 7, 4)).toBe('0007');
  });
  it('لا يقصّ رقماً أطول من العرض', () => {
    expect(formatRef('CUS', 123456, 5)).toBe('CUS123456');
  });
});

describe('suggestRefs', () => {
  it('["CUS14823","CUS14824"] بالملف ⇒ الاقتراح التالي "CUS14825"', () => {
    const rows = [{ ref: 'CUS14823' }, { ref: 'CUS14824' }, { ref: '' }];
    const { rows: out, basis } = suggestRefs(rows);
    expect(basis.hasExisting).toBe(true);
    expect(out[2].ref).toBe('CUS14825');
    expect(out[2].refAutoSuggested).toBe(true);
    expect(out[0].refAutoSuggested).toBe(false);
  });

  it('اقتراحات متعددة بنفس الدفعة تتزايد فلا تتصادم', () => {
    const rows = [{ ref: 'CUS100' }, { ref: '' }, { ref: '' }, { ref: '' }];
    const { rows: out } = suggestRefs(rows);
    expect(out[1].ref).toBe('CUS101');
    expect(out[2].ref).toBe('CUS102');
    expect(out[3].ref).toBe('CUS103');
  });

  it('لا مرجع موجود بالملف إطلاقاً ⇒ بادئة فارغة تبدأ من 1، وbasis.hasExisting = false', () => {
    const rows = [{ ref: '' }, { ref: '' }];
    const { rows: out, basis } = suggestRefs(rows);
    expect(basis.hasExisting).toBe(false);
    expect(out[0].ref).toBe('1');
    expect(out[1].ref).toBe('2');
  });

  it('القيمة الموجودة بالملف تُستخدَم حرفياً بلا أي تعديل', () => {
    const rows = [{ ref: 'AB-9' }];
    const { rows: out } = suggestRefs(rows);
    expect(out[0].ref).toBe('AB-9');
    expect(out[0].refAutoSuggested).toBe(false);
  });
});
