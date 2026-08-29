import { describe, it, expect } from 'vitest';
import { normalizeText, scoreColumnMatch, detectColumns, findHeaderRow } from '../columnDetect.js';

describe('normalizeText', () => {
  it('unifies hamza/alef variants, tashkeel, and spacing', () => {
    expect(normalizeText('اسم  العميل')).toBe('اسمالعميل');
    expect(normalizeText('إسم العميل')).toBe('اسمالعميل');
    expect(normalizeText('اسْمُ العميل')).toBe('اسمالعميل');
  });

  it('lowercases and strips punctuation for Latin text', () => {
    expect(normalizeText('Customer Name')).toBe('customername');
    expect(normalizeText('Customer_Name')).toBe('customername');
  });
});

describe('scoreColumnMatch', () => {
  it('scores an exact normalized match as 100', () => {
    const { score, via } = scoreColumnMatch('اسم العميل', 'customerName');
    expect(score).toBe(100);
    expect(via).toBe('exact');
  });

  it('still matches the reported real-world bug case (extra spaces + hamza variant)', () => {
    expect(scoreColumnMatch('اسم  العميل', 'customerName').score).toBeGreaterThanOrEqual(45);
    expect(scoreColumnMatch('إسم العميل', 'customerName').score).toBeGreaterThanOrEqual(45);
  });

  it('does not match an unrelated header', () => {
    expect(scoreColumnMatch('تاريخ الإصدار', 'customerName').score).toBe(0);
  });
});

describe('detectColumns', () => {
  it('assigns each column to at most one field, highest score wins', () => {
    const headers = ['اسم العميل', 'الرقم المرجعي', 'ملاحظة عشوائية'];
    const { mapping } = detectColumns(headers, ['customerName', 'customerRef']);
    expect(mapping.customerName).toBe('اسم العميل');
    expect(mapping.customerRef).toBe('الرقم المرجعي');
  });
});

describe('findHeaderRow', () => {
  it('finds the header row even when preceded by a descriptive intro and blank rows', () => {
    const rows = [
      ['تقرير العملاء - شركة كذا'],
      [],
      ['اسم العميل', 'الرقم المرجعي'],
      ['محمد أحمد', '10025'],
      ['سارة علي', '10071'],
    ];
    const found = findHeaderRow(rows, ['customerName', 'customerRef']);
    expect(found.rowIndex).toBe(2);
    expect(found.confidence).toBeGreaterThan(0);
  });

  it('falls back to row 0 with zero confidence when nothing matches', () => {
    const rows = [['x', 'y'], ['1', '2']];
    const found = findHeaderRow(rows, ['customerName', 'customerRef']);
    expect(found.rowIndex).toBe(0);
    expect(found.confidence).toBe(0);
  });
});
