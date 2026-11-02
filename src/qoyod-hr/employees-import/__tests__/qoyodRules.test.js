// شروط رفع قيود اتش ار الفعلية (من رسائل رفض حقيقية) على كل صف يدخل ملف الرفع.
import fs from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { analyzeWorkbook, buildRecords, processRecords, normKey } from '../lib/engine.js';
import { CLIENTS, SETTINGS, analyzeClient, loadTemplate } from './helpers.js';

let tpl;
beforeAll(async () => { tpl = await loadTemplate(); });
const SA = normKey('السعودية');
const one = (vals, ov = {}) => processRecords([{ src: 1, vals }], { lists: tpl.lists, required: tpl.required, settings: SETTINGS, overrides: { 1: ov } })[0].cells;

describe('شروط قيود على ملف الرفع', () => {
  const files = fs.readdirSync(CLIENTS).filter((f) => /\.(xlsx|csv)$/.test(f));
  for (const file of files) {
    it(`${file}: الصفوف الجاهزة تحقق شروط قيود`, () => {
      const a = analyzeClient(file, analyzeWorkbook, tpl.lists);
      const recs = buildRecords(a.prepared, a.mapping, { residence_country: 'السعودية' }, SETTINGS);
      let rows = processRecords(recs, { lists: tpl.lists, required: tpl.required, settings: SETTINGS });
      // محاكاة "طبّقها على باقي الفاضي المطلوب" لنهاية العقد: فقط الخانات الحمراء الفاضية
      const targets = rows.filter((r) => r.cells.contract_end_date.status === 'error' && !r.cells.contract_end_date.raw).map((r) => r.src);
      const overrides = Object.fromEntries(targets.map((s) => [s, { contract_end_date: '2028-10-12' }]));
      rows = processRecords(recs, { lists: tpl.lists, required: tpl.required, settings: SETTINGS, overrides });
      for (const s of targets) expect(normKey(rows.find((x) => x.src === s).cells.nationality.value)).not.toBe(SA);
      for (const r of rows.filter((x) => x.status !== 'error')) {
        const c = r.cells;
        if (c.salary_basic_salary_amount.value) expect(c.salary_start_date.value).toBeTruthy();
        if (c.contract_end_date.value) expect(normKey(c.contract_type.value)).toBe(normKey('محدد المدة'));
        if (c.work_phone_number.value) expect(String(c.work_phone_number.value)).toMatch(/^\+\d{9,15}$/);
      }
    });
  }

  it('عقد غير محدد المدة مع تاريخ نهاية = خطأ', () => {
    expect(one({ nationality: 'سعودي', contract_type: 'غير محدد المدة', contract_end_date: '2028-01-01' }).contract_end_date.status).toBe('error');
  });
  it('تاريخ نهاية بدون نوع عقد ← محدد المدة (مراجعة للسعودي)', () => {
    let c = one({ nationality: 'مصري', contract_end_date: '2028-01-01' });
    expect([c.contract_type.value, c.contract_type.status]).toEqual(['محدد المدة', 'fixed']);
    c = one({ nationality: 'سعودي', contract_end_date: '2028-01-01' });
    expect([c.contract_type.value, c.contract_type.status]).toEqual(['محدد المدة', 'review']);
  });
  it('الراتب: بدء الراتب = الانضمام، شهري، ثابت، ولا يستبدل تاريخًا موجودًا', () => {
    let c = one({ salary_basic_salary_amount: 5000, join_date: '2024-03-01' });
    expect([c.salary_start_date.value, c.salary_pay_frequency.value, c.salary_basic_salary_kind.value]).toEqual(['2024-03-01', 'Monthly', 'Fixed']);
    c = one({ salary_basic_salary_amount: 5000, join_date: '2024-03-01', salary_start_date: '2024-04-01' });
    expect(c.salary_start_date.value).toBe('2024-04-01');
  });
  it('الجوال: الناقص خطأ، والثابت يتحول دولي', () => {
    expect(one({ work_phone_number: '050123456' }).work_phone_number.status).toBe('error');
    expect(one({ work_phone_number: '0114567890' }).work_phone_number.value).toBe('+966114567890');
  });
  it('هوية مكررة = خطأ عند الثاني مع رقم صف الأول', () => {
    const rows = processRecords([
      { src: 2, vals: { national_id_number: '1019238146' } },
      { src: 3, vals: { national_id_number: '1019238146' } },
    ], { lists: tpl.lists, required: tpl.required, settings: SETTINGS });
    expect(rows[1].cells.national_id_number.status).toBe('error');
    expect(rows[1].cells.national_id_number.notes.some((n) => n.ref === 2)).toBe(true);
  });
});
