// دقة تحويل الملف ومطابقة الأعمدة: كل ملف عميل "مخربط" بـ fixtures/clients يمر على الأداة تلقائيًا
// بالكامل (بدون تدخل يدوي)، ونقارن الربط والقيم النهائية مع الحقيقة المعروفة بـ truth.json.
import fs from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { analyzeWorkbook, buildRecords, processRecords, MAPPABLE_KEYS } from '../lib/engine.js';
import { CLIENTS, analyzeClient, loadTemplate } from './helpers.js';

const truth = JSON.parse(fs.readFileSync(new URL('truth.json', CLIENTS), 'utf8'));
const norm = (k, v) => {
  if (v === null || v === undefined || v === '') return '';
  if (k === 'work_phone_number') return String(v).replace(/\D/g, '').slice(-9);
  if (k === 'salary_basic_salary_amount') return String(Number(v));
  return String(v);
};

let tpl;
beforeAll(async () => { tpl = await loadTemplate(); });

describe('تحويل ملف العميل ومطابقة الأعمدة تلقائيًا', () => {
  for (const [file, T] of Object.entries(truth)) {
    it(`${file}: كل عمود يُربط بحقله الصحيح وبدون ربط زائد`, () => {
      const a = analyzeClient(file, analyzeWorkbook, tpl.lists);
      const colOf = (key) => (T.synthetic[key] ? a.headers.find((h) => h.synthetic === T.synthetic[key])?.col : T.expectMap[key]);
      const want = {}, got = {};
      for (const key of new Set([...Object.keys(T.expectMap), ...Object.keys(T.synthetic)])) {
        if (!MAPPABLE_KEYS.has(key)) continue;
        want[key] = colOf(key);
        got[key] = a.mapping[key]?.col;
      }
      for (const key of Object.keys(a.mapping)) if (!(key in want)) got[key] = a.mapping[key].col;
      expect(got).toEqual(want);
    });

    it(`${file}: القيم النهائية لكل موظف مطابقة للمتوقع`, () => {
      const a = analyzeClient(file, analyzeWorkbook, tpl.lists);
      const recs = buildRecords(a.prepared, a.mapping, {}, { nameSplit: 'rest' });
      const rows = processRecords(recs, { lists: tpl.lists, required: tpl.required, settings: { dateOrder: 'dmy', addCC: true } });
      expect(rows.length).toBe(T.records.length);
      const byId = new Map(rows.map((r) => [String(r.cells.national_id_number.value), r]));
      const diffs = [];
      for (const exp of T.records) {
        const r = byId.get(exp.national_id_number);
        for (const k of T.fields) {
          if (exp[k] === undefined) continue;
          const g = r ? norm(k, r.cells[k].value) : '∅';
          if (g !== norm(k, exp[k])) diffs.push(`${exp.national_id_number} ${k}: "${g}" بدل "${norm(k, exp[k])}"`);
        }
      }
      expect(diffs).toEqual([]);
    });
  }
});
