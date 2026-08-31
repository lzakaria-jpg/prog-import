import { describe, it, expect, afterEach } from "vitest";
import { parseDateParts, formatDateParts, toDMY, fromDMY, expandYear, setDateSep, getDateSep, reformatAllDates } from "../dates.js";

afterEach(()=>{ setDateSep('/'); });

describe("parseDateParts — كل أمثلة §6.3 من الدليل", () => {
  const cases = [
    ["December 30, 2025 05:16 PM", "30/12/2025"],
    ["2026-08-31 14:05:00", "31/08/2026"],
    ["2026-08-31T00:00:00Z", "31/08/2026"],
    ["05.09.2026", "05/09/2026"],
    ["31/12/2026", "31/12/2026"],
    ["8/31/2026", "31/08/2026"], // لأن 31>12
    ["05/09/2026", "05/09/2026"], // غامض ⇒ اليوم أولًا
    ["٣١/١٢/٢٠٢٦", "31/12/2026"],
    ["Dec 5, 2025", "05/12/2025"],
    ["45291", "31/12/2023"],
    ["20260831", "31/08/2026"],
  ];
  cases.forEach(([input, expected]) => {
    it(`"${input}" → "${expected}"`, () => {
      expect(toDMY(input)).toBe(expected);
    });
  });
  it('"مرحبا" ⇒ null (خطأ حاجب)', () => {
    expect(parseDateParts("مرحبا")).toBeNull();
  });
});

describe("expandYear — 4 أمثلة", () => {
  it("26 → 2026", () => expect(expandYear("26")).toBe(2026));
  it("85 → 1985", () => expect(expandYear("85")).toBe(1985));
  it("69 → 2069", () => expect(expandYear("69")).toBe(2069));
  it("70 → 1970", () => expect(expandYear("70")).toBe(1970));
});

describe("DATE_SEP و setDateSep/getDateSep", () => {
  it("الافتراضي / ويتغير مع setDateSep", () => {
    expect(getDateSep()).toBe('/');
    setDateSep('.');
    expect(getDateSep()).toBe('.');
    expect(toDMY("2026-08-31")).toBe("31.08.2026");
  });
});

describe("fromDMY", () => {
  it("31/08/2026 → 2026-08-31", () => {
    expect(fromDMY("31/08/2026")).toBe("2026-08-31");
  });
});

describe("reformatAllDates", () => {
  it("يعيد تنسيق كل حقول التاريخ في كل الصفوف بلا تعديل الأصل (immutable)", () => {
    setDateSep('/');
    const rows = [{id:'r1', A:'x', D:'2026-08-31', E:'', F:''}];
    setDateSep('.');
    const next = reformatAllDates(rows);
    expect(next[0].D).toBe('31.08.2026');
    expect(rows[0].D).toBe('2026-08-31'); // الأصل لم يتغيّر
  });
});
