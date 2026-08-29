import { describe, it, expect } from 'vitest';
import { computeLineFields } from '../transform.js';
import { ENGINE_DEFAULTS, YES, NO } from '../constants.js';

describe('computeLineFields — tax-inclusive resolution', () => {
  it('keeps the validated global default (inclusive) when no explicit signal exists', () => {
    const line = { quantity: 2, grossExclusive: 100, discountExclusive: 0, taxRate: 0.15, sourceTotalInclusive: 230 };
    const calc = computeLineFields(line, ENGINE_DEFAULTS);
    expect(calc.taxInclusive).toBe(YES);
    expect(calc.inclusiveVia).toBe('default');
  });

  it('flips to exclusive for one line when its own explicit unit price proves it, without needing a global option change', () => {
    // gross before tax = 100 for qty 2 => 50/unit exclusive; inclusive would be 57.5/unit
    const line = {
      quantity: 2, grossExclusive: 100, discountExclusive: 0, taxRate: 0.15,
      sourceTotalInclusive: 115, unitPriceExplicit: 50,
    };
    const calc = computeLineFields(line, ENGINE_DEFAULTS);
    expect(calc.taxInclusive).toBe(NO);
    expect(calc.inclusiveVia).toBe('verified');
    expect(calc.unitPrice).toBe(50);
  });

  it('confirms inclusive via explicit unit price matching the inclusive basis', () => {
    const line = {
      quantity: 2, grossExclusive: 100, discountExclusive: 0, taxRate: 0.15,
      sourceTotalInclusive: 115, unitPriceExplicit: 57.5,
    };
    const calc = computeLineFields(line, ENGINE_DEFAULTS);
    expect(calc.taxInclusive).toBe(YES);
    expect(calc.inclusiveVia).toBe('verified');
  });

  it('an explicit yes/no flag column wins outright', () => {
    const line = {
      quantity: 2, grossExclusive: 100, discountExclusive: 0, taxRate: 0.15,
      sourceTotalInclusive: 115, taxInclusiveExplicit: false,
    };
    const calc = computeLineFields(line, ENGINE_DEFAULTS);
    expect(calc.taxInclusive).toBe(NO);
    expect(calc.inclusiveVia).toBe('explicit-flag');
  });

  it('never doubles-taxes: exported total always matches the recomputed total under either mode', () => {
    const line = { quantity: 3, grossExclusive: 90, discountExclusive: 0, taxRate: 0.15, sourceTotalInclusive: 103.5 };
    const calc = computeLineFields(line, ENGINE_DEFAULTS);
    expect(Math.abs(calc.drift)).toBeLessThanOrEqual(0.011);
  });
});

describe('computeLineFields — explicit discount priority', () => {
  it('uses an explicit discount percentage from the source file directly, without re-deriving it', () => {
    const line = { quantity: 1, grossExclusive: 100, discountExclusive: 999, taxRate: 0.15, sourceTotalInclusive: 100, discountPctExplicit: 10 };
    const calc = computeLineFields(line, ENGINE_DEFAULTS);
    expect(calc.discountPct).toBe(10);
  });

  it('falls back to deriving a percentage from a stated discount amount when no explicit percentage exists', () => {
    const line = { quantity: 1, grossExclusive: 100, discountExclusive: 20, taxRate: 0.15, sourceTotalInclusive: 92 };
    const calc = computeLineFields(line, ENGINE_DEFAULTS);
    expect(calc.discountPct).toBe(20);
  });

  it('never writes a discount when there is none (zero discount amount)', () => {
    const line = { quantity: 1, grossExclusive: 100, discountExclusive: 0, taxRate: 0.15, sourceTotalInclusive: 115 };
    const calc = computeLineFields(line, ENGINE_DEFAULTS);
    expect(calc.discountPct).toBeNull();
    expect(calc.discountVal).toBeNull();
  });
});
