import { describe, it, expect } from 'vitest';
import { autoMap } from '../mapping.js';
import { DEFAULT_HEADERS, DEFAULT_KEYS } from '../fields.js';

function buildAoa(headers, dataRows) {
  return [headers, ...dataRows];
}

describe('autoMap — أعمدة قالب Qoyod الرسمي الإنجليزية الحرفية (Import Vendors)', () => {
  it('يربط كل عمود إلزامي/أساسي بحقله الصحيح عند رفع القالب نفسه (بلا أعمدة شحن — قالب الموردين لا يحتويها)', () => {
    const dataRows = [
      ['VEN1001', 'Ahmed Supplies', 'Acme Trading', 'https://acme.com', '+966501234567', '+966507654321',
        'ahmed@acme.com', 'billing@acme.com', 'Active',
        '456 Bill St', 'Riyadh', 'Riyadh Province', '12345', 'Saudi Arabia', '312345678912343'],
      ['VEN1002', 'Sara Trading', 'Sara Est', 'https://sara.example', '+966512345678', '',
        'sara@example.com', '', 'Inactive', '', '', '', '', '', ''],
    ];
    const aoa = buildAoa(DEFAULT_HEADERS, dataRows);
    const { map } = autoMap(aoa, 0, DEFAULT_HEADERS);

    expect(DEFAULT_KEYS).not.toContain('shippingAddress');
    DEFAULT_KEYS.forEach((key, i) => {
      expect(map[key], `expected column for "${key}"`).toBe(i);
    });
  });
});

describe('autoMap — ملف مورد بأسماء أعمدة عربية حرة', () => {
  it('يربط الاسم والهاتف والبريد والرقم الضريبي من أسماء عربية شائعة', () => {
    const headers = ['اسم المورد', 'رقم الجوال', 'البريد الالكتروني', 'الرقم الضريبي', 'المدينة'];
    const dataRows = [
      ['مؤسسة التوريد الحديثة', '+966501112222', 'm@x.com', '312345678912343', 'الرياض'],
      ['شركة فهد للمقاولات', '+966503334444', 'f@x.com', '', 'جدة'],
    ];
    const aoa = buildAoa(headers, dataRows);
    const { map } = autoMap(aoa, 0, headers);

    expect(map.name).toBe(0);
    expect(map.phone).toBe(1);
    expect(map.email).toBe(2);
    expect(map.taxNumber).toBe(3);
  });
});
