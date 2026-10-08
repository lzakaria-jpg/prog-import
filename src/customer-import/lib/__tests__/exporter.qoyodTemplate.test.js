// [إضافة 2026-10-08] قالب قيود جاهز للرفع: صفوف إنشاء جديد فقط + الرقم المرجعي من ملف العميل كما هو
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { qoyodTemplateRows, exportContacts } from '../exporter.js';
import { DEFAULT_KEYS } from '../fields.js';

const ok = (o) => ({ issues: [], action: 'create', refAutoSuggested: false, ...o });
const TEMPLATE = path.resolve(__dirname, '../../assets/customer_import_template.xlsx');

describe('qoyodTemplateRows', () => {
  it('يُبقي صفوف الإنشاء السليمة بأرقامها ويستبعد الخطأ/التحديث/التجاوز/المعلَّق', () => {
    const rows = [
      ok({ i: 2, name: 'أحمد', ref: ' 12060001 ' }),
      ok({ i: 3, name: 'خطأ', ref: 'X1', issues: [{ l: 'e', m: 'x' }] }),
      ok({ i: 4, name: 'محدَّث', ref: 'X2', action: 'update' }),
      ok({ i: 5, name: 'متجاوز', ref: 'X3', action: 'skip' }),
      ok({ i: 6, name: 'معلق', ref: 'X4', action: null }),
      ok({ i: 7, name: 'تحذير فقط', ref: '12060002', issues: [{ l: 'w', m: 'w' }] }),
    ];
    const res = qoyodTemplateRows(rows);
    expect(res.rows.map((r) => [r.name, r.ref])).toEqual([['أحمد', '12060001'], ['تحذير فقط', '12060002']]);
    expect(res.excluded.map((x) => x.row.i)).toEqual([3, 4, 5, 6]);
    expect(rows[0].ref).toBe(' 12060001 '); // لا تعديل على صفوف الأداة نفسها
  });

  it('الرقم المقترَح تلقائياً يُترك فارغاً ليرقّمه قيود', () => {
    const res = qoyodTemplateRows([ok({ i: 2, name: 'أ', ref: 'C10' }), ok({ i: 3, name: 'ب', ref: 'C11', refAutoSuggested: true })]);
    expect(res.rows.map((r) => r.ref)).toEqual(['C10', '']);
    expect(res.autoRefsBlanked).toBe(1);
  });

  it('رقم مرجعي أو اسم مكرر داخل الملف: يُعتمد الأول ويُستبعد التالي مع سببه', () => {
    const res = qoyodTemplateRows([
      ok({ i: 2, name: 'أ', ref: 'c10' }),
      ok({ i: 3, name: 'ب', ref: 'C10' }),
      ok({ i: 4, name: ' أ ', ref: 'C12' }),
      ok({ i: 5, name: 'ج', ref: '' }),
      ok({ i: 6, name: 'د', ref: '' }),
    ]);
    expect(res.rows.map((r) => r.i)).toEqual([2, 5, 6]);
    expect(res.excluded.map((x) => [x.row.i, x.reason.ar])).toEqual([
      [3, 'رقم مرجعي مكرر بالملف (C10) مع الصف 2'],
      [4, 'اسم مكرر بالملف مع الصف 2'],
    ]);
  });

  it('الملف الناتج: قالب قيود الرسمي بنفس العناوين والرقم المرجعي بالعمود A نصاً كما هو', () => {
    const { rows } = qoyodTemplateRows([ok({ i: 2, name: 'شركة أ', ref: '00123', statusNorm: 'Active' }), ok({ i: 3, name: 'شركة ب', ref: 'S9', refAutoSuggested: true, statusNorm: 'Active' })]);
    const blob = exportContacts(rows, fs.readFileSync(TEMPLATE));
    return blob.arrayBuffer().then((ab) => {
      const wb = XLSX.read(ab, { type: 'array' });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      expect(aoa[0].length).toBe(DEFAULT_KEYS.length);
      expect(aoa[0][0]).toBe('Ref. No.');
      expect(aoa[0][1]).toBe('Name*');
      expect(aoa.slice(1).map((r) => [r[0], r[1]])).toEqual([['00123', 'شركة أ'], ['', 'شركة ب']]);
    });
  });
});
