import { describe, it, expect } from 'vitest';
import {
  MISSING_ENTITY_ISSUE_TYPES, issuesAreOnlyMissingEntities,
  computeMissingJournalEntitiesPlan, isMissingJournalEntitiesPlanEmpty,
} from '../journalMissingEntities.js';

describe('issuesAreOnlyMissingEntities', () => {
  it('true لقيد بأخطاء كلها من الأنواع الخمسة القابلة للحل التلقائي', () => {
    expect(issuesAreOnlyMissingEntities([{ type: 'unknown_code' }, { type: 'missing_location' }])).toBe(true);
  });
  it('false لو أي خطأ آخر مختلط معها (توازن مثلاً)', () => {
    expect(issuesAreOnlyMissingEntities([{ type: 'unknown_code' }, { type: 'unbalanced' }])).toBe(false);
  });
  it('false لقائمة فارغة (لا شيء ليُحَل)', () => {
    expect(issuesAreOnlyMissingEntities([])).toBe(false);
  });
  it('false لـ null/undefined', () => {
    expect(issuesAreOnlyMissingEntities(null)).toBe(false);
    expect(issuesAreOnlyMissingEntities(undefined)).toBe(false);
  });
});

describe('computeMissingJournalEntitiesPlan', () => {
  const entries = [{ seq: 1 }, { seq: 2 }, { seq: 3 }];

  it('يجمع حساباً ناقصاً واحداً يتكرر بأكثر من قيد تحت مجموعة واحدة', () => {
    const issuesBySeq = {
      1: [{ type: 'unknown_code', code: '5199', accountNameFromFile: 'مصروف متنوع' }],
      2: [{ type: 'unknown_code', code: '5199', accountNameFromFile: 'مصروف متنوع' }],
      3: [],
    };
    const plan = computeMissingJournalEntitiesPlan(entries, issuesBySeq);
    expect(plan.accounts).toHaveLength(1);
    expect(plan.accounts[0]).toMatchObject({ code: '5199', nameFromFile: 'مصروف متنوع', seqs: [1, 2] });
  });

  it('يجمع عميلاً/مورداً/مشروعاً/موقعاً ناقصين كل على حدة', () => {
    const issuesBySeq = {
      1: [{ type: 'missing_customer_ref', typedName: 'شركة الأمل' }],
      2: [{ type: 'missing_vendor_ref', typedName: 'مؤسسة النور' }],
      3: [{ type: 'missing_project', typedName: 'مشروع التوسعة' }, { type: 'missing_location', typedName: 'فرع جدة' }],
    };
    const plan = computeMissingJournalEntitiesPlan(entries, issuesBySeq);
    expect(plan.customers).toEqual([{ typedName: 'شركة الأمل', seqs: [1] }]);
    expect(plan.vendors).toEqual([{ typedName: 'مؤسسة النور', seqs: [2] }]);
    expect(plan.projects).toEqual([{ typedName: 'مشروع التوسعة', seqs: [3] }]);
    expect(plan.locations).toEqual([{ typedName: 'فرع جدة', seqs: [3] }]);
  });

  it('يتجاهل أنواع الأخطاء الأخرى تمامًا (توازن، تاريخ...)', () => {
    const issuesBySeq = { 1: [{ type: 'unbalanced' }, { type: 'date_format' }] };
    const plan = computeMissingJournalEntitiesPlan(entries, issuesBySeq);
    expect(isMissingJournalEntitiesPlanEmpty(plan)).toBe(true);
  });

  it('اسمان مختلفان بالتشكيل/المسافات فقط يُطبَّعان لنفس المجموعة (نفس أسلوب sales-invoice-import)', () => {
    const issuesBySeq = {
      1: [{ type: 'missing_customer_ref', typedName: 'شركة  الأمل' }],
      2: [{ type: 'missing_customer_ref', typedName: 'شركة الامل' }],
    };
    const plan = computeMissingJournalEntitiesPlan(entries, issuesBySeq);
    expect(plan.customers).toHaveLength(1);
    expect(plan.customers[0].seqs).toEqual([1, 2]);
  });

  it('خطة فارغة تمامًا بلا أي قيود/أخطاء', () => {
    expect(isMissingJournalEntitiesPlanEmpty(computeMissingJournalEntitiesPlan([], {}))).toBe(true);
  });

  // [إضافة — طلب صريح من المستخدم] أسماء العملاء/الموردين المكتوبة بأسطر
  // المدينون/الدائنون تصل الآن كـmissing_customer_ref/missing_vendor_ref حتى
  // حين تكون خانة "جهة اتصال" فارغة (راجع buildStructuralIssues بـJournalTool.jsx).
  // المطلوب صراحةً: "عميل نقدي ممكن تلاقيه مكرر في 200 صف, عادي هو عميل واحد".
  it('اسم واحد متكرر بمئات الأسطر/القيود يصير عميلًا واحدًا بقائمة قيوده كاملة', () => {
    const manyEntries = Array.from({ length: 200 }, (_, i) => ({ seq: i + 1 }));
    const issuesBySeq = {};
    manyEntries.forEach((e) => { issuesBySeq[e.seq] = [{ type: 'missing_customer_ref', typedName: 'عميل نقدي' }]; });
    const plan = computeMissingJournalEntitiesPlan(manyEntries, issuesBySeq);
    expect(plan.customers).toHaveLength(1);
    expect(plan.customers[0].typedName).toBe('عميل نقدي');
    expect(plan.customers[0].seqs).toHaveLength(200);
  });

  it('نفس الاسم على جانبي مدينون ودائنون يُنشأ عميلًا ومورّدًا منفصلين (لا خلط بين القائمتين)', () => {
    const issuesBySeq = {
      1: [{ type: 'missing_customer_ref', typedName: 'محمد فريد حسن' }],
      2: [{ type: 'missing_vendor_ref', typedName: 'محمد فريد حسن' }],
    };
    const plan = computeMissingJournalEntitiesPlan(entries, issuesBySeq);
    expect(plan.customers).toHaveLength(1);
    expect(plan.vendors).toHaveLength(1);
    expect(plan.customers[0].seqs).toEqual([1]);
    expect(plan.vendors[0].seqs).toEqual([2]);
  });

  it('نفس الاسم متكرر داخل القيد الواحد (أكثر من سطر) لا يُكرِّر رقم القيد بقائمة قيوده', () => {
    const issuesBySeq = {
      1: [
        { type: 'missing_customer_ref', typedName: 'عميل نقدي' },
        { type: 'missing_customer_ref', typedName: 'عميل نقدي' },
      ],
    };
    const plan = computeMissingJournalEntitiesPlan(entries, issuesBySeq);
    expect(plan.customers).toHaveLength(1);
    expect(plan.customers[0].seqs).toEqual([1]);
  });
});

describe('MISSING_ENTITY_ISSUE_TYPES', () => {
  it('يحوي الأنواع الخمسة المتوقَّعة بالضبط', () => {
    expect(Array.from(MISSING_ENTITY_ISSUE_TYPES).sort()).toEqual(
      ['missing_customer_ref', 'missing_location', 'missing_project', 'missing_vendor_ref', 'unknown_code'].sort()
    );
  });
});
