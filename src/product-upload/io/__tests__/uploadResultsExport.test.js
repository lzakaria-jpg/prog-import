import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { detectColumns, rowsToProducts, parseBomRows } from "../../engine/parsing.js";
import {
  UPLOAD_OUTCOME, countUploadOutcomes, buildFailedProductsWorkbook, buildCreatedProductsWorkbook,
} from "../uploadResultsExport.js";

const sheet = (wb, i = 0) => XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { header: 1, defval: "" });

const rawRows = [
  ["كود", "اسم المنتج", "الوحدة", "سعر البيع"],
  ["P1", "شاورما عربي", "حبة", 18],
  ["P2", "صوص ثوم", "جرام", ""],
  ["P3", "وجبة شاورما", "حبة", 30],
];
const colsMap = detectColumns(rawRows[0]);
const products = rowsToProducts(rawRows, 0, colsMap);
const bomLines = [
  { parent: "وجبة شاورما", component: "شاورما عربي", qty: 1 },
  { parent: "وجبة شاورما", component: "صوص ثوم", qty: 30 },
];

describe("تصدير نتيجة رفع المنتجات", () => {
  it("rowsToProducts تحفظ فهرس الصف الخام", () => {
    expect(products.map((p) => p._sheetRow)).toEqual([1, 2, 3]);
  });

  const extra = { name: "ملح", sku: "", product_type: "RawMaterial", _createKey: "ملح" };
  const list = [...products, extra];
  const outcomes = [
    { status: UPLOAD_OUTCOME.CREATED, id: 501, type: "Product" },
    { status: UPLOAD_OUTCOME.SKIPPED, reason: "الاسم موجود مسبقاً بالمنشأة" },
    { status: UPLOAD_OUTCOME.ERROR, reason: "مكوّنات لم تُنشأ بنجاح: صوص ثوم", type: "Recipe" },
    { status: UPLOAD_OUTCOME.NOT_SENT, reason: "أُوقف الرفع قبل الوصول له" },
  ];
  const snap = { headerRow: rawRows[0], rawRows, colsMap, list, outcomes, bomLines };

  it("العدّادات", () => {
    expect(countUploadOutcomes(outcomes)).toEqual({ created: 1, updated: 0, failed: 3 });
  });

  it("ملف المتخطّاة والأخطاء: نفس أعمدة ملف العميل + النتيجة والسبب، والفاشلة فقط", () => {
    const { workbook, count } = buildFailedProductsWorkbook(snap);
    expect(count).toBe(3);
    const rows = sheet(workbook);
    expect(rows[0]).toEqual(["كود", "اسم المنتج", "الوحدة", "سعر البيع", "نوع المنتج", "نتيجة الرفع", "سبب عدم الرفع"]);
    expect(rows[1].slice(0, 4)).toEqual(["P2", "صوص ثوم", "جرام", ""]);
    expect(rows[1].slice(5)).toEqual(["تم التخطي", "الاسم موجود مسبقاً بالمنشأة"]);
    expect(rows[2].slice(0, 4)).toEqual(["P3", "وجبة شاورما", "حبة", 30]);
    expect(rows[2][6]).toContain("صوص ثوم");
    // مادة أولية من ربط المكوّنات (بلا صف بالملف) — اسمها ونوعها صريح
    expect(rows[3][1]).toBe("ملح");
    expect(rows[3][4]).toBe("مادة أولية");
    expect(rows[3][5]).toBe("لم يُرسَل");
  });

  it("الملف المصدَّر يُعاد رفعه بنفس الأداة: الأعمدة الإضافية لا تُطابَق لحقل خطأ", () => {
    const rows = sheet(buildFailedProductsWorkbook(snap).workbook);
    const cols = detectColumns(rows[0]);
    ["sku", "name", "unit", "sellingPrice"].forEach((k) => expect(cols[k]).toBe(colsMap[k]));
    expect(cols.product_type).toBe(4);
    Object.entries(cols).forEach(([k, v]) => { if (k !== "product_type") expect([5, 6]).not.toContain(v); });
    const again = rowsToProducts(rows, 0, cols);
    expect(again.map((p) => p.name)).toEqual(["صوص ثوم", "وجبة شاورما", "ملح"]);
    expect(again[2].product_type).toBe("RawMaterial");
  });

  it("منتج مجمّع فاشل => شيت مكوّناته مرفق ويُكتشف تلقائياً", () => {
    const { workbook } = buildFailedProductsWorkbook(snap);
    expect(workbook.SheetNames.length).toBe(2);
    const bom = parseBomRows(sheet(workbook, 1));
    expect(bom.found).toBe(true);
    expect(bom.lines.map((l) => [l.parent, l.component, l.qty])).toEqual([["وجبة شاورما", "شاورما عربي", 1], ["وجبة شاورما", "صوص ثوم", 30]]);
  });

  it("ملف المُنشأة: المنتجات المُنشأة فعلاً فقط + رقمها بقيود", () => {
    const { workbook, count } = buildCreatedProductsWorkbook(snap);
    expect(count).toBe(1);
    const rows = sheet(workbook);
    expect(rows[0]).toEqual(["كود", "اسم المنتج", "الوحدة", "سعر البيع", "رقم قيود الداخلي (ID)", "النوع المرفوع"]);
    expect(rows[1]).toEqual(["P1", "شاورما عربي", "حبة", 18, 501, "منتج"]);
  });

  it("لا شيء للتصدير => null", () => {
    const allOk = { ...snap, outcomes: list.map(() => ({ status: UPLOAD_OUTCOME.UPDATED })) };
    expect(buildFailedProductsWorkbook(allOk)).toBeNull();
    expect(buildCreatedProductsWorkbook(allOk)).toBeNull();
  });
});
