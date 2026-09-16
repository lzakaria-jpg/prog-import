import { describe, it, expect } from 'vitest';
import { isExactNameMatch, nameSimilarity, findDuplicateMatches, findDuplicateMatchesIndexed, buildContactIndex, FUZZY_THRESHOLD } from '../duplicateMatch.js';

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

/**
 * [إصلاح بطء مبلَّغ ميدانياً 2026-09-16] النسخة المفهرسة تتخطى حساب Levenshtein
 * للمرشّحين الذين يستحيل رياضياً بلوغهم العتبة. هذه الاختبارات تحرس الشرط
 * الرياضي نفسه: المخرجات يجب أن تبقى مطابقة حرفياً للمقارنة الشاملة (المرجع
 * البطيء) على حالات حدّية متنوعة — أي خطأ بالتقليم سيُسقط مطابقة حقيقية.
 */
describe('findDuplicateMatchesIndexed — تطابق المخرجات مع المقارنة الشاملة', () => {
  /** المرجع البطيء: يقارن كل الأسماء بلا أي تقليم (منطق ما قبل التحسين حرفياً) */
  function bruteForce(name, contacts) {
    const n = String(name || '').trim();
    if (!n || !contacts.length) return { exact: null, fuzzy: [] };
    const exact = contacts.find((c) => isExactNameMatch(c.name, n)) || null;
    const fuzzy = contacts
      .filter((c) => c !== exact)
      .map((c) => ({ contact: c, score: nameSimilarity(c.name, n) }))
      .filter((x) => x.score >= FUZZY_THRESHOLD)
      .sort((a, b) => b.score - a.score);
    return { exact, fuzzy };
  }

  const contacts = [
    { id: 1, name: 'خميس محمد السندواي' },
    { id: 2, name: 'مؤسسة الأمل التجارية' },
    { id: 3, name: 'شركة راف لتجارة الازياء' },
    { id: 4, name: 'شركة أدال الرياضية' },
    { id: 5, name: 'مصنع النور للبلاستيك' },
    { id: 6, name: 'النور' },
    { id: 7, name: 'شركة مستقبل عظيم لتنظيم المعارض والمؤتمرات' },
    { id: 8, name: 'عبدالله سالم' },
  ];
  const index = buildContactIndex(contacts);

  const probes = [
    'شركة خميس محمد السنداوي',      // تشابه ضبابي بعد تجريد "شركة"
    'مؤسسه الامل التجاريه',          // تطابق تام بعد التطبيع
    'النور للبلاستيك',                // احتواء نصي (0.9)
    'شركة النور',                     // فرق طول كبير مع مرشّح قصير
    'راف لتجارة الأزياء',             // اختلاف بالهمزة فقط
    'مستقبل عظيم لتنظيم المعارض',    // اسم طويل جداً مقابل أطول منه
    'عبدالله بن سالم القحطاني',       // كلمات مشتركة مع فرق طول
    'شيء غير مرتبط إطلاقاً بأي اسم',  // بلا أي مطابقة
    '',                               // فارغ
  ];

  probes.forEach((p) => {
    it(`نفس نتيجة المقارنة الشاملة لـ«${p || '(فارغ)'}»`, () => {
      const fast = findDuplicateMatchesIndexed(p, index);
      const slow = bruteForce(p, contacts);
      expect(fast.exact).toEqual(slow.exact);
      expect(fast.fuzzy.map((x) => [x.contact.id, x.score.toFixed(6)]))
        .toEqual(slow.fuzzy.map((x) => [x.contact.id, x.score.toFixed(6)]));
    });
  });

  it('الفهرس يتجاهل جهات الاتصال بلا اسم صالح بلا أي خطأ', () => {
    const idx = buildContactIndex([{ id: 1, name: '' }, { id: 2, name: null }, { id: 3, name: 'شركة الأمل' }]);
    const { exact } = findDuplicateMatchesIndexed('شركه الامل', idx);
    expect(exact.id).toBe(3);
  });
});
