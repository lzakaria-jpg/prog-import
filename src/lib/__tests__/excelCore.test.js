// @vitest-environment jsdom
//
// خطأان جوهريان حقيقيان شهدهما المستخدم فعلياً مع ملف قيود حقيقي (157,027 صفاً،
// رأسه: رقم القيد | التاريخ | البيان | رمز الحساب | مدين | دائن):
//
// 1) "Maximum call stack size exceeded" فعلياً عند رفع الملف — السبب: allRows.push(...rows)
//    بـreadWorkbookRows يتجاوز حد عدد معطيات نداء الدالة الواحد بمحرك V8 (~65,000+) مع
//    ملفات بعشرات آلاف الصفوف. الإصلاح: حلقة .push بسيطة بلا أي spread.
// 2) حتى بعد إصلاح (1)، الملف كان يُجمَّع بالكامل في "قيد واحد فقط" بدل آلاف القيود
//    الصحيحة المنفصلة — السبب: parseTemplateSchema (المخطط A) كان يتعرّف فقط على اسم
//    العمود "تسلسل القيد" لعمود رقم القيد، بينما findHeaderRowIndex (الذي يختار هذا
//    المخطط أصلاً) يقبل أيضًا "رقم القيد" كمرشح صالح — فيختار المخطط لملف حقيقي
//    عنوانه "رقم القيد"، ثم يفشل استخراج العمود بصمت (يبقى -1)، فتُقرأ كل الصفوف بلا
//    رقم قيد إطلاقًا فتُجمَّع في قيد واحد. نفس الشيء لعمود "البيان" (لم يكن معروفاً،
//    فقط "وصف القيد"). الإصلاح: توسيع المرادفات لتطابق ما يقبله findHeaderRowIndex.
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { readWorkbookRows, fixWorksheetRange, parseEntriesFile } from "../excelCore.js";

function buildXlsxFile(aoa, filename = "test.xlsx") {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new File([buf], filename, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("readWorkbookRows — بلا انهيار مع ملفات ضخمة (عشرات/مئات آلاف الصفوف)", () => {
  it("ملف بعدد صفوف يتجاوز بوضوح حد معطيات نداء الدالة بـV8 (100,000 صف) يُقرأ بلا رمي أي خطأ", async () => {
    const N = 100000;
    const aoa = [["A", "B"]];
    for (let i = 0; i < N; i++) aoa.push([String(i), "x"]);
    const file = buildXlsxFile(aoa, "huge.xlsx");
    const rows = await readWorkbookRows(file);
    // +1 للعنوان
    expect(rows.length).toBe(N + 1);
    expect(rows[1]).toEqual(["0", "x"]);
    expect(rows[N]).toEqual([String(N - 1), "x"]);
  }, 30000);

  it("ملف صغير عادي: لا تغيير بالسلوك (نفس المحتوى بالضبط)", async () => {
    const file = buildXlsxFile([["الرمز", "الاسم"], ["1", "الأصول"], ["2", "الالتزامات"]]);
    const rows = await readWorkbookRows(file);
    expect(rows).toEqual([["الرمز", "الاسم"], ["1", "الأصول"], ["2", "الالتزامات"]]);
  });
});

describe("fixWorksheetRange — متوافقة مع نمطي القراءة (dense والمتفرّق)", () => {
  it("نمط dense (Array.isArray(ws[0])): تُحسَب !ref من فهارس الصفوف/الأعمدة مباشرة", () => {
    const ws = { 0: [{ v: "a" }, { v: "b" }], 2: [{ v: "c" }] }; // صف 1 مفقود عمداً (شائع بملفات حقيقية)
    const fixed = fixWorksheetRange(ws);
    expect(fixed["!ref"]).toBe(XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 2, c: 1 } }));
  });

  it("النمط المتفرّق الأصلي (كل خلية مفتاح 'A1' مستقل): يبقى كما كان بلا أي تغيير سلوك", () => {
    const ws = { A1: { v: "a" }, B1: { v: "b" }, A3: { v: "c" } };
    const fixed = fixWorksheetRange(ws);
    expect(fixed["!ref"]).toBe(XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 2, c: 1 } }));
  });
});

describe("parseEntriesFile — مرادفات عمود 'رقم القيد' و'البيان' (المخطط A)", () => {
  it("رأس 'رقم القيد' (لا 'تسلسل القيد') و'البيان' (لا 'وصف القيد') يُقسِّمان الصفوف لقيود منفصلة صحيحة", () => {
    const rows = [
      ["رقم القيد", "التاريخ", "البيان", "رمز الحساب", "مدين", "دائن"],
      ["1", "05/01/2025", "فاتورة مبيعات", "11301", "1000", "0"],
      ["1", "", "", "411017", "0", "1000"],
      ["2", "06/01/2025", "سند قبض", "11301", "500", "0"],
      ["2", "", "", "412000", "0", "500"],
    ];
    const groups = parseEntriesFile(rows);
    expect(groups.length).toBe(2);
    expect(groups[0].seq).toBe("1");
    expect(groups[0].desc).toBe("فاتورة مبيعات");
    expect(groups[0].rows.length).toBe(2);
    expect(groups[1].seq).toBe("2");
    expect(groups[1].desc).toBe("سند قبض");
    expect(groups[1].rows.length).toBe(2);
  });

  it("الصيغة الأصلية 'تسلسل القيد'/'وصف القيد' تبقى تعمل تماماً كما كانت (بلا أي كسر توافق خلفي)", () => {
    const rows = [
      ["تسلسل القيد", "التاريخ", "وصف القيد", "رمز الحساب", "مدين", "دائن"],
      ["1", "05/01/2025", "فاتورة مبيعات", "11301", "1000", "0"],
      ["1", "", "", "411017", "0", "1000"],
    ];
    const groups = parseEntriesFile(rows);
    expect(groups.length).toBe(1);
    expect(groups[0].seq).toBe("1");
    expect(groups[0].desc).toBe("فاتورة مبيعات");
  });
});
