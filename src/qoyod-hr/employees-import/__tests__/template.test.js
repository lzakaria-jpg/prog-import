// قراءة القالب الرسمي وتعبئته: الترويسة والقوائم تبقى كما هي، والصفوف الجاهزة تُكتب بأعمدتها الصحيحة.
import { describe, it, expect, beforeAll } from 'vitest';
import ExcelJS from 'exceljs';
import { analyzeWorkbook, buildRecords, processRecords } from '../lib/engine.js';
import { fillTemplate, readTemplate } from '../lib/template.js';
import { readBuf, readClient, SETTINGS } from './helpers.js';

let tplBuf, tpl;
beforeAll(async () => { tplBuf = readBuf('template_rich.xlsx'); tpl = await readTemplate(tplBuf); });

describe('القالب الرسمي', () => {
  it('يقرأ الأعمدة والإلزامي والقوائم', () => {
    expect(tpl.headers.length).toBe(46);
    expect(tpl.required.size).toBe(19);
    for (const k of ['first_name', 'national_id_number', 'join_date', 'employment_type']) expect(tpl.required.has(k)).toBe(true);
    expect(tpl.lists.department.length).toBeGreaterThan(0);
    expect(tpl.lists.nationality).toContain('السعودية');
  });

  it('يرفض ملفًا ليس قالب قيود', async () => {
    await expect(readTemplate(readBuf('clients/01_classic_ar.xlsx'))).rejects.toThrow();
  });

  it('يعبّئ الصفوف الجاهزة فقط بنفس ترويسة القالب', async () => {
    const a = analyzeWorkbook(readClient('02_english_export.xlsx'), tpl.lists);
    const rows = processRecords(buildRecords(a.prepared, a.mapping, { residence_country: 'السعودية' }, SETTINGS), { lists: tpl.lists, required: tpl.required, settings: SETTINGS });
    const ready = rows.filter((r) => r.status !== 'error');
    expect(ready.length).toBeGreaterThan(0);
    expect(ready.length).toBeLessThan(rows.length);

    const out = await fillTemplate(tplBuf, tpl, ready);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out);
    const ws = wb.getWorksheet('Employees');
    const col = (key) => tpl.headers.find((h) => h.key === key).col;
    // الترويسة لم تتغير
    for (const h of tpl.headers) expect(String(ws.getCell(1, h.col).value)).toContain(h.key);
    // أول صف بيانات = أول موظف جاهز
    const first = ready[0].cells;
    expect(String(ws.getCell(2, col('national_id_number')).value)).toBe(String(first.national_id_number.value));
    expect(String(ws.getCell(2, col('email')).value)).toBe(first.email.value);
    // عدد الصفوف المكتوبة = عدد الجاهزين
    let filled = 0;
    for (let r = 2; r <= ws.rowCount; r++) if (ws.getCell(r, col('national_id_number')).value) filled++;
    expect(filled).toBe(ready.length);
  });
});
