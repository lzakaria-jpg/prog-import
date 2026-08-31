import { describe, it, expect } from "vitest";
import {
  normalizePercentValue, normalizeDiscountPercentNumber, parseRateFromDropdownLabel,
  matchNearestTaxRate, snapTaxCategory, deriveTaxInclusive, deriveTaxRate, normalizeYesNo,
} from "../taxAndDiscount.js";

describe("normalizePercentValue — جدول §6.7 (حقل V)", () => {
  const cases = [
    [0.15, '15%'], [15, '15%'], ['15%','15%'], [0, '0%'],
    ['معفى','معفى'], ['ضريبة القيمة المضافة 15%','ضريبة القيمة المضافة 15%'], ['abc','abc'],
  ];
  cases.forEach(([input, expected]) => {
    it(`${JSON.stringify(input)} → "${expected}"`, () => {
      expect(normalizePercentValue(input)).toBe(expected);
    });
  });
});

describe("normalizeDiscountPercentNumber — جدول §6.7 (حقل T)", () => {
  const cases = [[0.05,'5'], [0.1,'10'], [10,'10'], ['50%','50'], ['abc','abc']];
  cases.forEach(([input, expected]) => {
    it(`${JSON.stringify(input)} → "${expected}"`, () => {
      expect(normalizeDiscountPercentNumber(input)).toBe(expected);
    });
  });
});

describe("§6.8 المثال الحاسم: 0.15 يُطابَق مع 'ضريبة القيمة المضافة 15%'", () => {
  it("normalizePercentValue(0.15) → '15%' ثم يُطابَق أقرب فئة بالقالب", () => {
    const list = ['ضريبة القيمة المضافة 15%', 'معفى'];
    const normalized = normalizePercentValue(0.15);
    expect(normalized).toBe('15%');
    expect(snapTaxCategory(normalized, list)).toBe('ضريبة القيمة المضافة 15%');
  });
  it("parseRateFromDropdownLabel: '15%'→0.15، 'ضريبة القيمة المضافة 15%'→0.15، 'معفى'→0، '0%'→0", () => {
    expect(parseRateFromDropdownLabel('15%')).toBe(0.15);
    expect(parseRateFromDropdownLabel('ضريبة القيمة المضافة 15%')).toBe(0.15);
    expect(parseRateFromDropdownLabel('معفى')).toBe(0);
    expect(parseRateFromDropdownLabel('0%')).toBe(0);
  });
  it("matchNearestTaxRate يقبل فقط فارق ≤0.02", () => {
    expect(matchNearestTaxRate(0.15, ['ضريبة القيمة المضافة 15%'])).toBe('ضريبة القيمة المضافة 15%');
    expect(matchNearestTaxRate(0.20, ['ضريبة القيمة المضافة 15%'])).toBeNull(); // فرق 0.05 > 0.02
  });
});

describe("deriveTaxInclusive — 4 أمثلة §6.5", () => {
  it("مثال 1: lineTotal=100, base=100 ⇒ نعم", () => {
    expect(deriveTaxInclusive({qty:2, price:50, totalForS:100, rate:null})).toBe('نعم');
  });
  it("مثال 2: total=115, base=100, rate=0.15 ⇒ لا (الضريبة أُضيفت فوق السعر)", () => {
    expect(deriveTaxInclusive({qty:2, price:50, totalForS:115, rate:0.15})).toBe('لا');
  });
  it("مثال 3: grandTotal=115, base=100, rate=0.15 ⇒ لا", () => {
    expect(deriveTaxInclusive({qty:20, price:5, totalForS:115, rate:0.15})).toBe('لا');
  });
  it("مثال 4 (تقريب): lineTotal=99.99, base=99.99 ⇒ نعم", () => {
    expect(deriveTaxInclusive({qty:3, price:33.33, totalForS:99.99, rate:null})).toBe('نعم');
  });
});

describe("deriveTaxRate — 4 أمثلة §6.6", () => {
  const taxList = ['ضريبة القيمة المضافة 15%'];
  it("مثال 1: grandTotal=115, base=100 ⇒ 0.15 ⇒ يُعتمد", () => {
    expect(deriveTaxRate({qty:20, price:5, grandTotalVal:115, taxList})).toBe('ضريبة القيمة المضافة 15%');
  });
  it("مثال 2: grandTotal=114.9, base=100 ⇒ 0.149 (فرق 0.001) ⇒ يُعتمد", () => {
    expect(deriveTaxRate({qty:20, price:5, grandTotalVal:114.9, taxList})).toBe('ضريبة القيمة المضافة 15%');
  });
  it("مثال 3: grandTotal=120, base=100 ⇒ 0.20 (فرق 0.05>0.02) ⇒ null", () => {
    expect(deriveTaxRate({qty:20, price:5, grandTotalVal:120, taxList})).toBeNull();
  });
  it("مثال 4: base=0 ⇒ لا قسمة ⇒ null", () => {
    expect(deriveTaxRate({qty:0, price:5, grandTotalVal:100, taxList})).toBeNull();
  });
});

describe("normalizeYesNo — §6.11", () => {
  it("نعم/Yes/y/true/1 → نعم", () => {
    ['نعم','Yes','y','true','1'].forEach(v=>expect(normalizeYesNo(v)).toBe('نعم'));
  });
  it("لا/no/false/0 → لا", () => {
    ['لا','no','false','0'].forEach(v=>expect(normalizeYesNo(v)).toBe('لا'));
  });
  it("نص يحوي 'غير' → لا", () => {
    expect(normalizeYesNo('غير مشمول')).toBe('لا');
  });
  it("فارغ → null، maybe → null", () => {
    expect(normalizeYesNo('')).toBeNull();
    expect(normalizeYesNo('maybe')).toBeNull();
  });
});
