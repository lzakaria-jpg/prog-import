import { describe, it, expect } from 'vitest';
import { hijriToGregorian, parseDate, formatDate } from '../num.js';

describe('hijriToGregorian', () => {
  it('matches the well-known Gregorian date for 1 Muharram 1445 AH', () => {
    expect(hijriToGregorian(1445, 1, 1)).toEqual({ y: 2023, m: 7, d: 19 });
  });

  it('matches the well-known Gregorian date for 1 Muharram 1446 AH (within a day of the sighting-based date)', () => {
    const g = hijriToGregorian(1446, 1, 1);
    expect(g.y).toBe(2024);
    expect(g.m).toBe(7);
    expect(g.d).toBeGreaterThanOrEqual(7);
    expect(g.d).toBeLessThanOrEqual(9);
  });
});

describe('parseDate — Hijri fallback', () => {
  it('parses a plausible Hijri-year date only after Gregorian interpretation fails', () => {
    const result = parseDate('05/02/1447');
    expect(result).not.toBeNull();
    expect(result.y).toBeGreaterThan(2000); // converted to a real Gregorian year
  });

  it('never reinterprets a valid Gregorian date as Hijri', () => {
    expect(parseDate('19/08/2026')).toEqual({ y: 2026, m: 8, d: 19 });
    expect(parseDate('2026-08-29')).toEqual({ y: 2026, m: 8, d: 29 });
  });

  it('formats back to DD/MM/YYYY as required by the Qoyod template', () => {
    expect(formatDate(parseDate('2026-08-29'))).toBe('29/08/2026');
  });
});
