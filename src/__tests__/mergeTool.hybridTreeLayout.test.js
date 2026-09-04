import { describe, it, expect } from "vitest";
import { computeHybridTreeLayout } from "../MergeTool.jsx";

/**
 * [إصلاح 2026-09-04] طريقة عرض ثانية لمخطط شجرة الحسابات: مستوى1-2 يبقيان
 * بتخطيط شجري أفقي عادي (كالمخطط الحالي)، ومن مستوى3 إلى 7 كل فرع (تحت كل
 * حساب مستوى2) يتحول لقائمة عمودية مضغوطة (outline) - إزاحة أفقية ثابتة صغيرة
 * لكل تعمّق، بلا تفريع أفقي بين الإخوة. هذا الملف يغطي computeHybridTreeLayout
 * مباشرة (دالة نقية، بنفس شكل مخرجات المخطط الشجري الحالي: positioned/links/
 * canvasW/canvasH) بشجرة اختبار مصغّرة (بلا حاجة لبيانات صفوف حقيقية - الانقسام
 * شجري/مضغوط بنيوي بحت حسب عمق الشجرة الممررة نفسها).
 */
const leaf = (key) => ({ _key: key, _node: { code: key }, children: [] });
const node = (key, children = []) => ({ _key: key, _node: { code: key }, children });

describe("computeHybridTreeLayout", () => {
  it("يعيد نتيجة فارغة لجذر غير موجود", () => {
    expect(computeHybridTreeLayout(null)).toEqual({ positioned: [], links: [], canvasW: 0, canvasH: 0 });
  });

  it("مستوى1 ومستوى2: تخطيط شجري أفقي عادي (نفس الصف لإخوة مستوى2، متباعدون أفقياً)", () => {
    const tree = node("root", [node("l2a"), node("l2b")]);
    const { positioned } = computeHybridTreeLayout(tree);
    const byKey = Object.fromEntries(positioned.map((p) => [p.key, p]));
    expect(Object.keys(byKey).sort()).toEqual(["l2a", "l2b", "root"]);
    expect(byKey.l2a.y).toBe(byKey.l2b.y); // نفس العمق - نفس الصف
    expect(byKey.l2a.y).toBeGreaterThan(byKey.root.y); // تحت الجذر
    expect(byKey.l2a.x).not.toBe(byKey.l2b.x); // متباعدان أفقياً (تخطيط شجري عادي لا مضغوط)
  });

  it("مستوى3 فأعمق: قائمة عمودية مضغوطة لكل فرع - صفوف متتالية بفارق ثابت، بلا تفريع أفقي بين الإخوة", () => {
    const l2a = node("l2a", [leaf("l3a"), leaf("l3b"), leaf("l3c")]);
    const l2b = node("l2b", [leaf("l3d")]);
    const tree = node("root", [l2a, l2b]);
    const { positioned } = computeHybridTreeLayout(tree);
    const byKey = Object.fromEntries(positioned.map((p) => [p.key, p]));

    // كل أبناء l2a المباشرين بنفس الإزاحة الأفقية (عمق نسبي واحد للجميع) وأكثر من والدهم
    expect(byKey.l3a.x).toBe(byKey.l3b.x);
    expect(byKey.l3b.x).toBe(byKey.l3c.x);
    expect(byKey.l3a.x).toBeGreaterThan(byKey.l2a.x);

    // صفوف متتالية بفارق ثابت (y متزايد أحاديًا - لا انتشار أفقي)
    expect(byKey.l3b.y).toBeGreaterThan(byKey.l3a.y);
    expect(byKey.l3c.y).toBeGreaterThan(byKey.l3b.y);
    expect(byKey.l3c.y - byKey.l3b.y).toBeCloseTo(byKey.l3b.y - byKey.l3a.y, 5);

    // فرع l2b مستقل تماماً - عدّاد صفوفه يبدأ من جديد، لا يكمل عدّاد فرع l2a
    expect(byKey.l3d.y).toBeGreaterThan(byKey.l2b.y);
    expect(byKey.l3d.y).toBeLessThan(byKey.l3c.y);
  });

  it("تعمّق أعمق (مستوى4): إزاحة أفقية إضافية، وترتيب DFS يضع الحفيد مباشرة بعد أبيه (لا بعد كل إخوته)", () => {
    // l2a -> l3a, l3b(-> l4a), l3c  — ترتيب DFS المتوقع: l3a, l3b, l4a, l3c
    const l4a = leaf("l4a");
    const l3b = node("l3b", [l4a]);
    const l2a = node("l2a", [leaf("l3a"), l3b, leaf("l3c")]);
    const tree = node("root", [l2a]);
    const { positioned } = computeHybridTreeLayout(tree);
    const byKey = Object.fromEntries(positioned.map((p) => [p.key, p]));

    const indentUnit = byKey.l3a.x - byKey.l2a.x;
    expect(byKey.l4a.x - byKey.l2a.x).toBeCloseTo(indentUnit * 2, 5); // ضعف الإزاحة (مستوى4 لا 3)

    // DFS: l4a يقع بين صف l3b وصف l3c مباشرة (بعد أبيه، قبل عمّه)
    expect(byKey.l4a.y).toBeGreaterThan(byKey.l3b.y);
    expect(byKey.l4a.y).toBeLessThan(byKey.l3c.y);
  });

  it("جذر وهمي (عدة جذور مستوى1 مجمّعة): يُستبعد هو نفسه من positioned، وكل فرع يُبنى مستقلاً", () => {
    const rootA = node("rootA", [node("l2a", [leaf("l3a")])]);
    const rootB = node("rootB", [node("l2b", [leaf("l3b")])]);
    const virtualRoot = { _key: "__virtual__", _node: { isVirtual: true }, children: [rootA, rootB] };
    const { positioned } = computeHybridTreeLayout(virtualRoot);
    const keys = positioned.map((p) => p.key).sort();
    expect(keys).toEqual(["l2a", "l2b", "l3a", "l3b", "rootA", "rootB"]);
    const byKey = Object.fromEntries(positioned.map((p) => [p.key, p]));
    expect(byKey.rootA.x).not.toBe(byKey.rootB.x); // جذرا مستوى1 متباعدان أفقياً
  });

  it("canvasW/canvasH موجبان ويغطيان أقصى امتداد فعلي لكل العقد", () => {
    const tree = node("root", [node("l2a", [leaf("l3a"), leaf("l3b")])]);
    const { positioned, canvasW, canvasH } = computeHybridTreeLayout(tree);
    const maxX = Math.max(...positioned.map((p) => p.x));
    const maxY = Math.max(...positioned.map((p) => p.y));
    expect(canvasW).toBeGreaterThan(0);
    expect(canvasW).toBeGreaterThanOrEqual(maxX);
    expect(canvasH).toBeGreaterThanOrEqual(maxY);
  });

  it("كل رابط له مفتاح ثابت أب=>ابن (لازم لتحريك الخطوط بسلاسة عند تبديل طريقة العرض)", () => {
    const tree = node("root", [node("l2a", [leaf("l3a")])]);
    const { links } = computeHybridTreeLayout(tree);
    const keys = links.map((l) => l.key);
    expect(keys).toContain("root=>l2a");
    expect(keys).toContain("l2a=>l3a");
  });
});
