// اختبارات انحدار لأخطاء حقيقية اكتُشفت بالفحص الشامل للمشروع (2026-09) — كل حالة
// هنا كانت تُنتج مخرجات خاطئة بصمت قبل الإصلاح، لا مجرد تحسين شكلي.
import { describe, it, expect } from "vitest";
import {
  normalizeDateGuess, normalizeCode, parseAmount, buildParentInfo,
  findSystemAccountCodes, validateEntryStructure,
} from "../excelCore.js";

describe("normalizeDateGuess — صيغة M/D/YYYY بأربعة أرقام", () => {
  it("يبدّل الشهر واليوم حين يكون الجزء الثاني > 12 (12/25/2025 ← 25/12/2025)", () => {
    expect(normalizeDateGuess("12/25/2025")).toBe("25/12/2025");
  });
  it("يبقي dd/mm كما هي حين يكون الجزء الأول > 12 (لا تغيير في السلوك الصحيح)", () => {
    expect(normalizeDateGuess("25/12/2025")).toBe("25/12/2025");
  });
  it("يبقي الافتراض dd/mm عند الغموض الحقيقي (كلاهما ≤ 12)", () => {
    expect(normalizeDateGuess("3/4/2025")).toBe("03/04/2025");
  });
});

describe("validateEntryStructure — تاريخ غير موجود بالتقويم", () => {
  const chartMap = { "1101": { code: "1101", name: "الصندوق" } };
  const parentInfo = { parentCodes: new Set(), childrenByParent: {} };
  const entry = (date) => ({
    seq: "1", date, desc: "قيد",
    rows: [
      { code: "1101", debit: 100, credit: null, _rowIndex: 0 },
      { code: "1101", debit: null, credit: 100, _rowIndex: 1 },
    ],
  });
  it("يرفع خطأ على شهر 25 (كان يعبر الفحص لأن الشكل dd/mm/yyyy مطابق شكليًا)", () => {
    const issues = validateEntryStructure(entry("12/25/2025"), chartMap, parentInfo);
    expect(issues.some((i) => i.type === "date_format")).toBe(true);
  });
  it("يرفع خطأ على 31 فبراير", () => {
    const issues = validateEntryStructure(entry("31/02/2025"), chartMap, parentInfo);
    expect(issues.some((i) => i.type === "date_format")).toBe(true);
  });
  it("لا يرفع أي خطأ تاريخ على تاريخ صحيح", () => {
    const issues = validateEntryStructure(entry("28/02/2025"), chartMap, parentInfo);
    expect(issues.some((i) => i.type === "date_format")).toBe(false);
  });
});

describe("normalizeCode — نص الخلية المنسَّق من SheetJS (raw:false)", () => {
  it("يحذف فاصل الآلاف (110,101 ← 110101) فلا يُعَدّ الرمز مفقودًا من الشجرة", () => {
    expect(normalizeCode("110,101")).toBe("110101");
  });
  it("يحذف الكسر العشري الصفري (110101.00 ← 110101)", () => {
    expect(normalizeCode("110101.00")).toBe("110101");
  });
  it("لا يلمس الرموز الهرمية المنقوطة (1.10 تبقى كما هي)", () => {
    expect(normalizeCode("1.10")).toBe("1.10");
  });
});

describe("parseAmount — صيغتا السالب المحاسبيتان", () => {
  it("السالب اللاحق: 1000- ← -1000 (كان يُقرأ 1000 موجَبًا بصمت)", () => {
    expect(parseAmount("1000-")).toBe(-1000);
  });
  it("بين قوسين: (1,000) ← -1000 (كان null أي «لا قيمة»)", () => {
    expect(parseAmount("(1,000)")).toBe(-1000);
  });
  it("يبقي الأرقام العادية كما هي", () => {
    expect(parseAmount("1,500.00")).toBe(1500);
    expect(parseAmount("0")).toBe(0);
  });
  it("يرفض النص غير الرقمي بدل قبول بادئته", () => {
    expect(parseAmount("12abc")).toBeNull();
  });
});

describe("buildParentInfo — شجرة حسابات بلا عمود «الحساب الأب»", () => {
  it("تبقى الحسابات الورقية قابلة للترحيل (كانت كل الحسابات تُعَدّ رئيسية فتتعطل الأداة)", () => {
    const chart = [
      { code: "1", name: "الأصول", parentCode: "" },
      { code: "11", name: "النقد", parentCode: "" },
      { code: "1101", name: "الصندوق", parentCode: "" },
      { code: "1102", name: "البنك", parentCode: "" },
    ];
    const { parentCodes } = buildParentInfo(chart);
    expect(parentCodes.has("1")).toBe(true);
    expect(parentCodes.has("11")).toBe(true);
    expect(parentCodes.has("1101")).toBe(false);
    expect(parentCodes.has("1102")).toBe(false);
  });
  it("شجرة مسطّحة بلا هرمية: كل حساباتها أوراق قابلة للترحيل", () => {
    const flat = [
      { code: "1101", name: "الصندوق", parentCode: "" },
      { code: "1102", name: "البنك", parentCode: "" },
    ];
    expect(buildParentInfo(flat).parentCodes.size).toBe(0);
  });
  it("مع عمود أب صريح: السلوك كما هو تمامًا", () => {
    const chart = [
      { code: "1", name: "الأصول", parentCode: "" },
      { code: "11", name: "النقد", parentCode: "1" },
      { code: "1101", name: "الصندوق", parentCode: "11" },
    ];
    const { parentCodes } = buildParentInfo(chart);
    expect([...parentCodes].sort()).toEqual(["1", "11"]);
  });
});

describe("findSystemAccountCodes — لا ترجيح بين حسابين مختلفين", () => {
  it("ضريبة المبيعات وضريبة المشتريات: لا يُختار أحدهما تخمينًا (كان يُرجَع الاثنان)", () => {
    const chart = [
      { code: "210201", name: "ضريبة القيمة المضافة المستحقة على المبيعات" },
      { code: "110301", name: "ضريبة القيمة المضافة المستحقة على المشتريات" },
    ];
    expect(findSystemAccountCodes(chart, "ضريبة القيمة المضافة المستحقة")).toEqual([]);
  });
  it("مطابقة ضبابية واحدة واضحة: تُعاد وحدها", () => {
    const chart = [
      { code: "210201", name: "ضريبة القيمة المضافة المستحقة على المبيعات" },
      { code: "1101", name: "الصندوق" },
    ];
    expect(findSystemAccountCodes(chart, "ضريبة القيمة المضافة المستحقة")).toEqual(["210201"]);
  });
  it("التطابق الحرفي التام يبقى مقدَّمًا كما هو", () => {
    const chart = [
      { code: "1201", name: "المدينون" },
      { code: "1202", name: "المدينون التجاريون" },
    ];
    expect(findSystemAccountCodes(chart, "المدينون")).toEqual(["1201"]);
  });
});
