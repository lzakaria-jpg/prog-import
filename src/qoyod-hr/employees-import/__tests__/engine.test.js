// منطق التحويل والتحقق: تواريخ، جوالات، هويات، قيم القوائم، واكتشاف أعمدة تصدير برامج HR الأخرى.
import { describe, it, expect, beforeAll } from 'vitest';
import * as XLSX from 'xlsx';
import { readClientFile, analyzeWorkbook, parseDate, cleanPhone, cleanId, makeResolver } from '../lib/engine.js';
import { loadTemplate } from './helpers.js';

let tpl;
beforeAll(async () => { tpl = await loadTemplate(); });

// يبني ملف xlsx بالذاكرة من مصفوفة صفوف ويقرأه كما يقرأ ملف العميل
const asClientFile = (aoa, name = 'client.xlsx') => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Employees');
  return readClientFile(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), name);
};

describe('التواريخ', () => {
  it('ميلادي بصيغ مختلفة وأرقام عربية', () => {
    expect(parseDate('2025-03-14').iso).toBe('2025-03-14');
    expect(parseDate('14/03/2025').iso).toBe('2025-03-14');
    expect(parseDate('25-Feb-2020').iso).toBe('2020-02-25');
    expect(parseDate('١٨/٠٣/٢٠١٧').iso).toBe('2017-03-18');
  });
  it('هجري يتحول لميلادي بتقويم أم القرى', () => {
    const r = parseDate('1445/09/01هـ');
    expect(r.iso).toBe('2024-03-11');
    expect(r.status).toBe('fixed');
  });
  it('تاريخ غير موجود = خطأ', () => {
    expect(parseDate('31/02/1990').status).toBe('error');
    expect(parseDate('1991-02-30').status).toBe('error');
  });
});

describe('الجوال والهوية', () => {
  it('الجوال السعودي يتحول لصيغة دولية', () => {
    expect(cleanPhone('0551234567', { addCC: true }).value).toBe('+966551234567');
    expect(cleanPhone('٠٥٥١٢٣٤٥٦٧', { addCC: true }).value).toBe('+966551234567');
    expect(cleanPhone('00966 55 123 4567', { addCC: true }).value).toBe('+966551234567');
    expect(cleanPhone('05504146', { addCC: true }).status).toBe('error');
  });
  it('الهوية: إزالة الرموز، والحرف بدل الرقم يُذكر بمكانه', () => {
    expect(cleanId('1-019238146').value).toBe('1019238146');
    const r = cleanId('1O19238146');
    expect(r.status).toBe('error');
    expect(r.msg).toContain('الخانة 2 "O"');
    expect(r.msg).toContain('حرف O إنجليزي بدل صفر');
  });
});

describe('قيم القوائم', () => {
  it('الجنسيات بأي صيغة، و"المملكة" = السعودية', () => {
    const r = makeResolver('nationality', tpl.lists.nationality);
    for (const v of ['سعودي', 'Saudi Arabian', 'KSA', 'المملكة']) expect(r(v)?.value).toBe('السعودية');
    expect(r('Indian')?.value).toBe('الهند');
  });
  it('قيمة غير موجودة بقائمة القالب ترجع none', () => {
    const r = makeResolver('department', tpl.lists.department);
    expect(r('قسم غير موجود إطلاقًا').how).toBe('none');
  });
});

describe('اكتشاف أعمدة تصدير برامج HR الأخرى', () => {
  it('عناوين بأسلوب ZenHR تُربط تلقائيًا', () => {
    const rows = [
      ['Employment Number', 'Name_en', 'Gender', 'Birth Date', 'Nationality', 'ID Number', 'Personal Email', 'Mobile', 'Position', 'Hiring Date', 'Basic_salary', 'Housing Allowance'],
      ['1001', 'Mohammed Ali Alharbi', 'Male', '1990-01-15', 'Saudi', '1019238146', 'm.alharbi@demo.sa', '+966551234567', 'Accountant', '2020-05-01', 8500, 2125],
      ['1002', 'Rajesh Kumar', 'Male', '1985-07-20', 'Indian', '2123456787', 'r.kumar@demo.sa', '0559876543', 'Driver', '2019-03-10', 3000, 750],
      ['1003', 'Sara Ahmed', 'Female', '1995-11-02', 'Egyptian', '2234567893', 's.ahmed@demo.sa', '966501112233', 'HR Specialist', '2022-01-09', 7000, 1750],
    ];
    const a = analyzeWorkbook(asClientFile(rows), tpl.lists);
    const byKey = Object.fromEntries(Object.entries(a.mapping).map(([k, m]) => [k, rows[0][m.col]]));
    expect(byKey).toMatchObject({
      employee_no: 'Employment Number', full_name_en: 'Name_en', gender: 'Gender', date_of_birth: 'Birth Date',
      nationality: 'Nationality', national_id_number: 'ID Number', email: 'Personal Email', work_phone_number: 'Mobile',
      job_title: 'Position', join_date: 'Hiring Date', salary_basic_salary_amount: 'Basic_salary',
    });
    expect(Object.values(byKey)).not.toContain('Housing Allowance');
  });
});
