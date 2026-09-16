import { describe, it, expect } from 'vitest';
import { isExactNameMatch, nameSimilarity, findDuplicateMatches, FUZZY_THRESHOLD } from '../duplicateMatch.js';

describe('nameSimilarity — مثال المستخدم الحقيقي', () => {
  it('"خميس محمد السندواي" (موجود) مقابل "شركة خميس محمد السنداوي" (بالملف) يجب أن يتطابقا ضبابياً (>= 0.85)', () => {
    const score = nameSimilarity('خميس محمد السندواي', 'شركة خميس محمد السنداوي');
    expect(score).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);
  });
});

describe('isExactNameMatch', () => {
  it('نفس الاسم بعد التطبيع = تطابق تام', () => {
    expect(isExactNameMatch('شركة النور', 'شركه النور')).toBe(true);
  });
  it('اسمان مختلفان كلياً = لا تطابق', () => {
    expect(isExactNameMatch('أحمد', 'محمد')).toBe(false);
  });
});

describe('findDuplicateMatches', () => {
  const existing = [
    { id: 1, name: 'خميس محمد السندواي' },
    { id: 2, name: 'مؤسسة الأمل التجارية' },
    { id: 3, name: 'شركة بعيدة تماماً عن أي شيء' },
  ];

  it('يجد تطابقاً تاماً عند تطابق الاسم حرفياً (بعد التطبيع)', () => {
    const { exact } = findDuplicateMatches('مؤسسه الامل التجاريه', existing);
    expect(exact).toEqual(existing[1]);
  });

  it('يجد مرشحاً ضبابياً واحداً على الأقل لمثال المستخدم، ولا يُدرجه أيضاً كتطابق تام', () => {
    const { exact, fuzzy } = findDuplicateMatches('شركة خميس محمد السنداوي', existing);
    expect(exact).toBeNull();
    expect(fuzzy.length).toBeGreaterThan(0);
    expect(fuzzy[0].contact.id).toBe(1);
    expect(fuzzy[0].score).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);
  });

  it('لا نتائج لاسم غير مرتبط بأي عنصر موجود', () => {
    const { exact, fuzzy } = findDuplicateMatches('عبدالله بن سالم القحطاني الجديد كلياً', existing);
    expect(exact).toBeNull();
    expect(fuzzy).toEqual([]);
  });

  it('اسم فارغ لا يُطابق شيئاً', () => {
    expect(findDuplicateMatches('', existing)).toEqual({ exact: null, fuzzy: [] });
  });
});
