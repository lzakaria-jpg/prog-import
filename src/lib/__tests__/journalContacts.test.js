import { describe, it, expect } from 'vitest';
import {
  mergeContactDirectory, buildContactLookup, lookupContact, findContactInText, resolveContactIdForRow,
  contactNameKey, toLatinDigits,
} from '../journalContacts.js';
import { applyAutoContactRules, parseEntriesFile, parseNameRefFile, guessEntriesColumnMapping } from '../excelCore.js';
import { buildJournalEntryPayload } from '../qoyodJournalEntryPush.js';
import { buildContactApiList } from '../qoyodJournalRefFetch.js';

/**
 * بلاغ حقيقي (2026-10-08) — 40 قيداً "سليمة" رفضها قيود كلها:
 * "Contact id 22010002 is not valid". الرقم المرجعي كان يُرسَل كمعرّف داخلي.
 */
const api = [
  { id: 515, name: 'مؤسسة  لام للفعاليات  الترفيهية', taxNumber: '' },
  { id: 983, name: 'شركة ريسبونس للتسويق', taxNumber: '300000000000003' },
  { id: 984, name: 'مؤسسة الحلول', taxNumber: '' },
];
const file = [
  { name: 'مؤسسة  لام للفعاليات  الترفيهية ', ref: '12060001' },
  { name: 'المورد شركة ريسبونس للتسويق', ref: '22010002' },
  { name: 'العميل مؤسسة الحلول', ref: '22010003' },
  { name: 'مورد غير موجود بالمنشأة', ref: '22010099' },
];

describe('دليل الجهات الموحَّد', () => {
  it('يربط الرقم المرجعي (الملف) بالمعرّف الداخلي (API) بالاسم بعد حذف بادئة العميل/المورد', () => {
    const dir = mergeContactDirectory(api, file);
    const byRef = Object.fromEntries(dir.map((d) => [d.trueRef, d]));
    expect(byRef['12060001'].id).toBe(515);
    expect(byRef['22010002'].id).toBe(983);
    expect(byRef['22010003'].id).toBe(984);
    expect(byRef['22010099'].id).toBeUndefined();
    expect(byRef['22010002'].ref).toBe('22010002');
  });

  it('الربط بالرقم الضريبي أولاً حتى لو اختلف الاسم', () => {
    const dir = mergeContactDirectory(api, [{ name: 'ريسبونس', ref: '777', taxNumber: '٣٠٠٠٠٠٠٠٠٠٠٠٠٠٣' }]);
    expect(dir.find((d) => d.trueRef === '777').id).toBe(983);
  });

  it('اسم مكرر بالمنشأة => لا ربط بالتخمين', () => {
    const dir = mergeContactDirectory([{ id: 1, name: 'شركة أ' }, { id: 2, name: 'شركة أ' }], [{ name: 'شركة أ', ref: '500' }]);
    const rec = dir.find((d) => d.trueRef === '500');
    expect(rec.id).toBeUndefined();
    expect(rec.ambiguousIds).toEqual([1, 2]);
  });

  it('قائمة API وحدها: القيمة المعروضة = المعرّف (نفس السلوك السابق)', () => {
    const dir = mergeContactDirectory(api, null);
    expect(dir.map((d) => d.ref)).toEqual(['515', '983', '984']);
  });

  it('lookupContact: الرقم المرجعي ثم المعرّف، وتعارضهما لسجلين = التباس', () => {
    const lookup = buildContactLookup(mergeContactDirectory(api, file));
    expect(lookupContact('22010002', lookup).record.id).toBe(983);
    expect(lookupContact('983', lookup).record.id).toBe(983);
    const clash = buildContactLookup(mergeContactDirectory([{ id: 77, name: 'س' }, { id: 5, name: 'ص' }], [{ name: 'ص', ref: '77' }]));
    expect(lookupContact('77', clash).reason).toBe('ambiguous');
  });

  it('findContactInText: رقم مرجعي داخل نص البيان، والمعرّف لا يُقبل من نص حر', () => {
    const lookup = buildContactLookup(mergeContactDirectory(api, file));
    expect(findContactInText('سداد للمورد رقم 22010002 من بنك الجزيرة', lookup).id).toBe(983);
    expect(findContactInText('٢٢٠١٠٠٠٢', lookup).id).toBe(983);
    expect(findContactInText('دفعة 983', lookup)).toBeNull();
    expect(findContactInText('983', lookup, { allowId: true }).id).toBe(983);
    expect(findContactInText('العميل مؤسسة الحلول', lookup).id).toBe(984);
    expect(findContactInText('22010002 و 22010003', lookup)).toBeNull();
  });

  it('resolveContactIdForRow: رقم مرجعي مكتوب يدوياً => المعرّف الحقيقي؛ مرجع بلا جهة بالمنشأة => خطأ صريح', () => {
    const lookup = buildContactLookup(mergeContactDirectory(api, file));
    expect(resolveContactIdForRow({ contact: '22010002' }, lookup, 'المورد')).toMatchObject({ ok: true, id: 983 });
    const miss = resolveContactIdForRow({ contact: '22010099' }, lookup, 'المورد');
    expect(miss.ok).toBe(false);
    expect(miss.reason).toBe('not_in_company');
    expect(miss.record.name).toBe('مورد غير موجود بالمنشأة');
    expect(resolveContactIdForRow({ contact: '55555555' }, lookup, 'المورد').reason).toBe('not_found');
  });

  it('أدوات التطبيع', () => {
    expect(contactNameKey(' العميل   شركة  فيلم ماستر ')).toBe('شركه فيلم ماستر');
    expect(toLatinDigits('١٢٣۴')).toBe('1234');
  });
});

describe('التعبية التلقائية + الإرسال — سيناريو البلاغ', () => {
  const chart = [
    { code: '1206', name: 'المدينون', parentCode: '', id: 11 },
    { code: '2201', name: 'الدائنون', parentCode: '', id: 22 },
    { code: '41020001', name: 'مصاريف تصاميم', parentCode: '', id: 33 },
  ];
  const entry = (rows) => ({ seq: '00000002', date: '26/01/2023', desc: 'قيمة عقد تصميم', project: '', location: '', rows });
  const row = (i, code, debit, credit, extra = {}) => ({ _rowIndex: i, code, name: '', contact: '', debit, credit, comment: '', ...extra });

  it('الرقم المرجعي بالتعليق يُتعرَّف عليه، والإرسال يحمل المعرّف الداخلي لا المرجعي', () => {
    const dir = mergeContactDirectory(api, file);
    const entries = [entry([
      row(0, '41020001', 15000, 0, { comment: 'قيمة عقد تصميم مشروع' }),
      row(1, '2201', 0, 15000, { comment: '22010002' }),
    ])];
    const out = applyAutoContactRules(entries, chart, { customersRef: dir, suppliersRef: dir });
    const apLine = out[0].rows[1];
    expect(apLine.contact).toBe('22010002');
    expect(apLine._contactId).toBe(983);
    const lookup = buildContactLookup(dir);
    const built = buildJournalEntryPayload(out[0], {
      chartMap: Object.fromEntries(chart.map((a) => [a.code, a])),
      debtorsCodes: new Set(['1206']), creditorsCodes: new Set(['2201']),
      contactLookups: { customers: lookup, suppliers: lookup },
    });
    expect(built.ok).toBe(true);
    expect(built.payload.journal_entry.credit_amounts[0].contact_id).toBe(983);
  });

  it('عمود الجهة الصريح (اسم/رقم ضريبي) يُقرأ ويُطابَق', () => {
    const dir = mergeContactDirectory(api, file);
    const entries = [entry([
      row(0, '1206', 100, 0, { party: 'مؤسسة لام للفعاليات الترفيهية' }),
      row(1, '2201', 0, 100, { party: '300000000000003' }),
    ])];
    const out = applyAutoContactRules(entries, chart, { customersRef: dir, suppliersRef: dir });
    expect(out[0].rows[0]._contactId).toBe(515);
    expect(out[0].rows[0].contact).toBe('12060001');
    expect(out[0].rows[1]._contactId).toBe(983);
  });

  it('رقم مرجعي مكتوب يدوياً بخانة الجهة يتحول للمعرّف عند الإرسال', () => {
    const lookup = buildContactLookup(mergeContactDirectory(api, file));
    const e = entry([
      row(0, '41020001', 50, 0),
      row(1, '2201', 0, 50, { contact: '22010003', _userEdited: true }),
    ]);
    const built = buildJournalEntryPayload(e, {
      chartMap: Object.fromEntries(chart.map((a) => [a.code, a])),
      debtorsCodes: new Set(['1206']), creditorsCodes: new Set(['2201']),
      contactLookups: { customers: lookup, suppliers: lookup },
    });
    expect(built.payload.journal_entry.credit_amounts[0].contact_id).toBe(984);
  });

  it('جهة غير قابلة للتحويل لمعرّف => القيد لا يُرسَل برقم خاطئ (خطأ صريح بدل 422)', () => {
    const lookup = buildContactLookup(mergeContactDirectory(api, file));
    const e = entry([row(0, '41020001', 50, 0), row(1, '2201', 0, 50, { contact: '22010099' })]);
    const built = buildJournalEntryPayload(e, {
      chartMap: Object.fromEntries(chart.map((a) => [a.code, a])),
      debtorsCodes: new Set(['1206']), creditorsCodes: new Set(['2201']),
      contactLookups: { customers: lookup, suppliers: lookup },
    });
    expect(built.ok).toBe(false);
    expect(built.error).toContain('غير موجود فعلياً بمنشأة العميل');
  });
});

describe('قراءة ملفات العميل', () => {
  it('ملف القيود بعناوين بالتطويل و"من/الى" يُقرأ تلقائياً بلا تحديد أعمدة يدوي', () => {
    const rows = [
      ['', 'الى', 'من', 'التعليق', 'الوصف', 'اســــم الحساب', 'كـــود الحساب', 'التاريخ', 'رقم المـلــــف', 'رقم القيـــــد'],
      [14, 0, 15000, 'قيمة عقد', 'قيمة عقد تصميم', 'مصاريف تصاميم', '41020001', '26/01/2023', '', '00000002'],
      [15, 15000, 0, 22010002, '', 'الموردين', 2201, '26/01/2023', '', '00000002'],
      [16, 0, 300, 22010006, '', 'مصاريف تجهيز', '41020002', '06/04/2023', '', '00000008'],
      [17, 300, 0, 22010006, '', 'الموردين', 2201, '06/04/2023', '', '00000008'],
    ];
    const map = guessEntriesColumnMapping(rows);
    expect(map.debit).toBe(2);
    expect(map.credit).toBe(1);
    expect(map.code).toBe(6);
    const entries = parseEntriesFile(rows);
    expect(entries.map((e) => e.seq)).toEqual(['00000002', '00000008']);
    expect(entries[0].rows[0]).toMatchObject({ code: '41020001', debit: 15000, credit: 0 });
    expect(entries[0].rows[1]).toMatchObject({ code: '2201', debit: 0, credit: 15000, comment: '22010002' });
    expect(entries[0].desc).toBe('قيمة عقد تصميم');
    // قيد بلا وصف بالملف: أول تعليق نصي، وإلا اسم أول حساب
    expect(entries[1].desc).toBe('مصاريف تجهيز');
  });

  it('عمود "اسم العميل/المورد" بملف القيود يُقرأ بحقل party', () => {
    const rows = [
      ['رقم القيد', 'التاريخ', 'الوصف', 'رمز الحساب', 'مدين', 'دائن', 'اسم العميل/المورد'],
      ['1', '01/01/2024', 'بيع', '1206', 100, 0, 'شركة لام'],
      ['1', '01/01/2024', 'بيع', '4101', 0, 100, ''],
    ];
    expect(guessEntriesColumnMapping(rows).party).toBe(6);
  });

  it('ملف تصدير جهات الاتصال من قيود ("اسم الجهة" + "الرقم الضريبي") يُقبل كملف مرجعي', () => {
    const rows = [
      ['اسم الجهة', 'الرقم المرجعي', 'اسم المنشأة', 'الحالة', 'الرقم الضريبي'],
      ['مؤسسة لام', '12060001', '', 'Active', '300000000000003'],
      ['عميل نقدي', 'CUS001', '', 'Active', ''],
    ];
    expect(parseNameRefFile(rows)).toEqual([
      { name: 'مؤسسة لام', ref: '12060001', taxNumber: '300000000000003' },
      { name: 'عميل نقدي', ref: 'CUS001' },
    ]);
  });

  it('buildContactApiList: المعرّف + الاسم + الرقم الضريبي من رد API', () => {
    expect(buildContactApiList([{ id: 5, name: 'أ', tax_number: '3001' }, { id: null, name: 'ب' }, { id: 6, organization: 'ج' }]))
      .toEqual([{ id: 5, name: 'أ', taxNumber: '3001', ref: '' }, { id: 6, name: 'ج', taxNumber: '', ref: '' }]);
  });
});
