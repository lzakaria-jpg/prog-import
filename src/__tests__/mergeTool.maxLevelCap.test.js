import { describe, it, expect } from "vitest";
import { maxRelativeDepth, wouldExceedMaxLevel, MAX_ACCOUNT_LEVEL } from "../MergeTool.jsx";

/**
 * [إصلاح 2026-09-04] شجرة حسابات قيود أقصى عمق لها 7 مستويات - لا يوجد مستوى
 * ثامن إطلاقاً. قبل هذا الإصلاح: إضافة حساب فرعي بالمخطط، أو نقل حساب بالسحب
 * تحت هدف عميق، كانا يحسبان level = أبوه + 1 بلا أي سقف فيُنشأ/يُنقَل حساب
 * لمستوى 8 بصمت. هذا الملف يغطي المحمولين النقيين المستخدَمين بكلا المسارين
 * (handleAddChild وhandleDrop بـ AccountsTreeView) لإنفاذ السقف.
 */
describe("MAX_ACCOUNT_LEVEL", () => {
  it("يساوي 7 - أقصى عمق مسموح به في شجرة حسابات قيود", () => {
    expect(MAX_ACCOUNT_LEVEL).toBe(7);
  });
});

describe("maxRelativeDepth — أقصى عمق نسبي لذرية عقدة معينة", () => {
  it("يُرجع 0 لعقدة بلا أبناء إطلاقاً (ورقة)", () => {
    expect(maxRelativeDepth({ children: [] })).toBe(0);
    expect(maxRelativeDepth({})).toBe(0);
    expect(maxRelativeDepth(null)).toBe(0);
  });

  it("يُرجع 1 لعقدة لها أبناء مباشرون فقط (بلا أحفاد)", () => {
    const node = { children: [{ children: [] }, { children: [] }] };
    expect(maxRelativeDepth(node)).toBe(1);
  });

  it("يحسب أعمق سلسلة صحيحة عبر عدة مستويات متتالية", () => {
    // node -> a -> b -> c (بلا أبناء) = عمق نسبي 3
    const node = { children: [{ children: [{ children: [{ children: [] }] }] }] };
    expect(maxRelativeDepth(node)).toBe(3);
  });

  it("يأخذ أعمق فرع بين عدة فروع متفرّعة بعمق مختلف (لا أول فرع فقط)", () => {
    const shallow = { children: [] }; // عمق 0
    const deep = { children: [{ children: [{ children: [] }] }] }; // عمق 2
    const node = { children: [shallow, deep] };
    expect(maxRelativeDepth(node)).toBe(3); // 1 (للانتقال لـdeep) + 2
  });
});

describe("wouldExceedMaxLevel — القاعدة المشتركة بين الإضافة والنقل", () => {
  it("[سيناريو الإضافة] يرفض إضافة حساب فرعي فوق حساب بالمستوى 7 بالضبط (extraDepth=1 يعني الابن المباشر)", () => {
    expect(wouldExceedMaxLevel(7, 1)).toBe(true);
  });

  it("[سيناريو الإضافة] يسمح بالإضافة فوق حساب بالمستوى 6 (الابن يصبح مستوى 7 - مسموح)", () => {
    expect(wouldExceedMaxLevel(6, 1)).toBe(false);
  });

  it("[سيناريو النقل] يرفض نقل حساب له ذرية عميقة إلى هدف يجعل أعمق حفيد يتجاوز 7", () => {
    // هدف مستوى 6 -> الحساب المنقول يصبح مستوى 7، لكن له حفيد بعمق نسبي 1 (مستوى 8) - مرفوض
    const draggedWithGrandchild = { children: [{ children: [] }] }; // maxRelativeDepth = 1
    const newLevel = 6 + 1; // 7
    expect(wouldExceedMaxLevel(newLevel, maxRelativeDepth(draggedWithGrandchild))).toBe(true);
  });

  it("[سيناريو النقل] يسمح بنقل حساب ورقة (بلا ذرية) حتى إلى هدف مستوى 6 (يصبح مستوى 7 - أقصى مسموح بالضبط)", () => {
    const leaf = { children: [] };
    const newLevel = 6 + 1;
    expect(wouldExceedMaxLevel(newLevel, maxRelativeDepth(leaf))).toBe(false);
  });

  it("يتعامل مع قيم نصية (level كسلسلة نصية كما تُخزَّن أحياناً بالصفوف)", () => {
    expect(wouldExceedMaxLevel("7", 1)).toBe(true);
    expect(wouldExceedMaxLevel("6", 1)).toBe(false);
  });
});
