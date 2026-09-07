import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildOpeningBalanceWorkbook } from "../openingBalanceExport.js";

// [مطابَق 2026-09-07 على نسخة حقيقية من قالب قيود الرسمي: download_sample_1.xlsx
// — creator: axlsx، ورقة وحيدة "1 - المركز الرئيسي" بترويسة حرفية بالضبط
// ["الرقم التسلسلي", "متوسط التكلفة", "الكمية"] وبلا أي عمود/صف آخر.]
describe("[2026-09-07] buildOpeningBalanceWorkbook — مطابقة القالب الرسمي الحقيقي", () => {
  it("يبني ورقة بترويسة حرفية مطابقة للقالب الرسمي (3 أعمدة فقط، بلا عمود اسم)", () => {
    const rows = [{ sku: "S1", name: "منتج أ", location: "المركز الرئيسي", quantity: 10, cost: 5 }];
    const { workbook } = buildOpeningBalanceWorkbook(rows);
    expect(workbook.SheetNames).toEqual(["1 - المركز الرئيسي"]);
    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets["1 - المركز الرئيسي"], { header: 1 });
    expect(sheet[0]).toEqual(["الرقم التسلسلي", "متوسط التكلفة", "الكمية"]);
    expect(sheet[1]).toEqual(["S1", 5, 10]);
    expect(sheet).toHaveLength(2); // ترويسة + صف واحد فقط، بلا صفوف تاريخ/وصف/موقع إضافية
  });

  it("يبني ورقة منفصلة لكل موقع مختلف، مرقّمة 1..n حسب ترتيب الظهور الأول", () => {
    const rows = [
      { sku: "S1", name: "منتج أ", location: "فرع جدة", quantity: 10, cost: 5 },
      { sku: "S2", name: "منتج ب", location: "فرع الرياض", quantity: 3, cost: 7 },
      { sku: "S3", name: "منتج ج", location: "فرع جدة", quantity: 1, cost: 2 },
    ];
    const { workbook } = buildOpeningBalanceWorkbook(rows);
    expect(workbook.SheetNames).toEqual(["1 - فرع جدة", "2 - فرع الرياض"]);

    const jeddahSheet = XLSX.utils.sheet_to_json(workbook.Sheets["1 - فرع جدة"], { header: 1 });
    expect(jeddahSheet[0]).toEqual(["الرقم التسلسلي", "متوسط التكلفة", "الكمية"]);
    expect(jeddahSheet[1]).toEqual(["S1", 5, 10]);
    expect(jeddahSheet[2]).toEqual(["S3", 2, 1]);
  });

  it("يستثني المنتجات بلا رمز/كود (لا عمود اسم بديل بالقالب الحقيقي)، ويُرجعها بـskippedNoSku", () => {
    const rows = [
      { sku: "S1", name: "منتج أ", location: "المركز الرئيسي", quantity: 10, cost: 5 },
      { sku: "", name: "منتج بلا رمز", location: "المركز الرئيسي", quantity: 4, cost: 1 },
    ];
    const { workbook, skippedNoSku } = buildOpeningBalanceWorkbook(rows);
    expect(skippedNoSku).toEqual(["منتج بلا رمز"]);
    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets["1 - المركز الرئيسي"], { header: 1 });
    expect(sheet).toHaveLength(2); // فقط منتج S1، منتج بلا رمز مستثنى
  });

  it("يجمع صفوف بلا موقع محدد بورقة واحدة باسم واضح مرقّم", () => {
    const rows = [{ sku: "S1", name: "منتج أ", location: "", quantity: 4, cost: 1 }];
    const { workbook } = buildOpeningBalanceWorkbook(rows);
    expect(workbook.SheetNames).toEqual(["1 - بلا موقع محدد"]);
  });

  it("يبني مصنّفاً بلا أوراق لمصفوفة صفوف فارغة", () => {
    const { workbook, skippedNoSku } = buildOpeningBalanceWorkbook([]);
    expect(workbook.SheetNames).toHaveLength(0);
    expect(skippedNoSku).toEqual([]);
  });

  it("يقصّ اسم الورقة عند تجاوز حد Excel (31 حرفاً) ويضمن عدم تكرار الأسماء", () => {
    const rows = [
      { sku: "S1", name: "أ", location: "موقع بمسمى طويل جداً يتجاوز الحد المسموح لاسم ورقة إكسل بوضوح", quantity: 1, cost: 1 },
    ];
    const { workbook } = buildOpeningBalanceWorkbook(rows);
    expect(workbook.SheetNames).toHaveLength(1);
    expect(workbook.SheetNames[0].length).toBeLessThanOrEqual(31);
  });
});
