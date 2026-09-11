import { describe, it, expect } from "vitest";
import { buildProductsRefRows, buildStockRefRows, buildCustomersRefRows } from "../referenceExport.js";

const t = ({ ar }) => ar; // بيئة الاختبار عربية فقط — يكفي لتغطية بناء الصفوف

describe("referenceExport — بناء صفوف تنزيل الفهارس المجلوبة عبر API", () => {
  it("buildProductsRefRows: صف لكل منتج بـbySku، مع دلالة sellable/stocked الصحيحة", () => {
    const productsRef = {
      bySku: new Map([
        ["S1", { sku: "S1", name: "منتج أ", sellable: true, stocked: true }],
        ["S2", { sku: "S2", name: "منتج ب", sellable: false, stocked: null }],
      ]),
    };
    const { header, rows } = buildProductsRefRows(productsRef, t);
    expect(header).toEqual(["رمز المنتج (SKU)", "الاسم", "يُباع؟", "مخزَّن؟"]);
    expect(rows).toEqual([
      ["S1", "منتج أ", "نعم", "نعم"],
      ["S2", "منتج ب", "لا", "غير معروف"],
    ]);
  });

  it("buildStockRefRows: يفكّ مفتاح sku+'||'+موقع ويستخرج اسم المنتج من productsRef", () => {
    const stockRef = {
      byKey: new Map([
        ["S1||الرياض", 10],
        ["S1||جدة", 3],
      ]),
    };
    const productsRef = { bySku: new Map([["S1", { sku: "S1", name: "منتج أ" }]]) };
    const { header, rows } = buildStockRefRows(stockRef, productsRef, t);
    expect(header).toEqual(["رمز المنتج (SKU)", "اسم المنتج", "الموقع", "الكمية"]);
    expect(rows).toEqual([
      ["S1", "منتج أ", "الرياض", 10],
      ["S1", "منتج أ", "جدة", 3],
    ]);
  });

  it("buildStockRefRows: منتج غير موجود بproductsRef.bySku يُصدَّر باسم فارغ لا يرمي خطأ", () => {
    const stockRef = { byKey: new Map([["S9||الرياض", 5]]) };
    const productsRef = { bySku: new Map() };
    const { rows } = buildStockRefRows(stockRef, productsRef, t);
    expect(rows).toEqual([["S9", "", "الرياض", 5]]);
  });

  it("buildCustomersRefRows: صف لكل عميل بـbyRef، مع دلالة active الصحيحة", () => {
    const customersRef = {
      byRef: new Map([
        ["101", { ref: "101", name: "عميل أ", active: true }],
        ["102", { ref: "102", name: "عميل ب", active: false }],
      ]),
    };
    const { header, rows } = buildCustomersRefRows(customersRef, t);
    expect(header).toEqual(["الرقم المرجعي", "الاسم", "الحالة"]);
    expect(rows).toEqual([
      ["101", "عميل أ", "نشط"],
      ["102", "عميل ب", "غير نشط"],
    ]);
  });
});
