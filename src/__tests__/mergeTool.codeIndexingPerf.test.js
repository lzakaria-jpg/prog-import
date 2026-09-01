// اختبار إصلاحات الأداء بـMergeTool.jsx (بموافقة المستخدم الصريحة على تعديل هذا الملف تحديداً):
// nextAvailableCodeForParent (فهرسة usedCodes مرة واحدة بدل مسح كامل لكل تكرار من حلقة
// while)، وensureParentsExist/repairLevels (فهرسة code→row بدل .find() المتكرر). الهدف
// إثبات: النتيجة الصحيحة نفسها + بلا أي تعليق حتى مع شجرة كبيرة وأرقام حسابات متلاصقة.
import { describe, it, expect } from "vitest";
import { nextAvailableCodeForParent, ensureParentsExist, repairLevels } from "../MergeTool.jsx";

describe("nextAvailableCodeForParent — أول رمز متاح فعلياً، حتى مع مئات الرموز المتلاصقة المستخدمة", () => {
  it("يتخطى بلوك 500 رمز متلاصق مستخدم (1101..1600) ويعيد أول رمز فارغ فعلاً (1601)", () => {
    const tree1Index = [];
    for (let i = 1101; i <= 1600; i++) tree1Index.push({ code: String(i), parent: "11", level: 3 });
    // ضجيج: شجرة كبيرة من رموز غير متصلة بهذا النطاق إطلاقاً (محاكاة منشأة حقيقية كبيرة)
    for (let i = 0; i < 50000; i++) tree1Index.push({ code: `9${i}`, parent: "9", level: 3 });

    const start = Date.now();
    const result = nextAvailableCodeForParent("11", 2, [], tree1Index);
    const elapsed = Date.now() - start;

    expect(result).toBe("1601");
    expect(elapsed).toBeLessThan(1000);
  });

  it("لا رموز مستخدمة تحت الأب: يعيد أول رمز منطقي فوراً (1101)", () => {
    const result = nextAvailableCodeForParent("11", 2, [], []);
    expect(result).toBe("1101");
  });

  it("رموز جديدة (rows) أيضاً تُحسب كمستخدمة، لا فقط tree1Index", () => {
    const rows = [{ status: "new", deleted: false, code: "1101", parent: "11" }];
    const result = nextAvailableCodeForParent("11", 2, rows, []);
    expect(result).toBe("1102");
  });

  it("حساب محذوف بنفس الرمز لا يُحسب مستخدماً (يطابق isCodeInUse الأصلية: status==='new' && !deleted فقط)", () => {
    const rows = [{ status: "new", deleted: true, code: "1101", parent: "11" }];
    const result = nextAvailableCodeForParent("11", 2, rows, []);
    expect(result).toBe("1101");
  });
});

describe("ensureParentsExist/repairLevels — تعملان بلا تعليق مع شجرة كبيرة، بنفس النتيجة الصحيحة", () => {
  it("ينشئ أباً واحداً مفقوداً بشجرة فيها آلاف الحسابات غير ذات الصلة", () => {
    const bigTree1Index = [];
    for (let i = 0; i < 5000; i++) bigTree1Index.push({ code: `A${i}`, nameAr: `حساب ${i}`, parent: "", level: 3, type: "" });

    const rows = [{ id: "r1", status: "new", deleted: false, code: "1101", nameAr: "بند فرعي", nameEn: "", level: 3, parent: "11", type: "" }];
    const ctx = { existingCodes: [], file2ByCode: new Map(), tree1Index: bigTree1Index };

    const start = Date.now();
    const { rows: out, created } = ensureParentsExist(rows, ctx);
    const elapsed = Date.now() - start;

    expect(created).toContain("11");
    expect(out.some((r) => r.code === "11")).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });

  it("repairLevels يصحّح مستوى حساب فرعي بناءً على مستوى أبيه الفعلي، حتى مع شجرة كبيرة", () => {
    const bigTree1Index = [];
    for (let i = 0; i < 5000; i++) bigTree1Index.push({ code: `A${i}`, parent: "", level: 3 });
    bigTree1Index.push({ code: "11", parent: "", level: 2 });

    const rows = [{ status: "new", deleted: false, code: "1101", parent: "11", level: 5 }]; // مستوى خاطئ عمداً
    const { rows: out, changed } = repairLevels(rows, { tree1Index: bigTree1Index });

    expect(changed).toBe(1);
    expect(out[0].level).toBe(3); // مستوى الأب (2) + 1
  });
});
