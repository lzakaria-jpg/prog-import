// @vitest-environment jsdom
/* يحتاج jsdom لأن الدالة تعتمد على FileReader/File — غير متاحين ببيئة node الافتراضية. */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { readGenericSpreadsheet } from "../readGenericSpreadsheet.js";

describe("readGenericSpreadsheet — ملف CSV", () => {
  it("يقرأ CSV كنص UTF-8 صريح، يحلّله يدويًا (لا XLSX.read)، ويحدد صف العناوين تلقائيًا", async () => {
    const file = new File(["sku,name\nSKU-1,منتج أ\nSKU-2,منتج ب\n"], "products.csv", { type: "text/csv" });
    const { headers, rows } = await readGenericSpreadsheet(file);
    expect(headers).toEqual(["sku", "name"]);
    expect(rows).toEqual([["SKU-1", "منتج أ"], ["SKU-2", "منتج ب"]]);
  });

  it("يزيل BOM في بداية الملف قبل التحليل", async () => {
    const file = new File(["﻿sku,name\nSKU-1,منتج أ\n"], "products.csv", { type: "text/csv" });
    const { headers } = await readGenericSpreadsheet(file);
    expect(headers[0]).toBe("sku");
  });

  it("لا يحوّل '15%' إلى رقم عشري (المشكلة التي يتجنبها المحلل اليدوي)", async () => {
    const file = new File(["sku,rate\nSKU-1,15%\n"], "x.csv", { type: "text/csv" });
    const { rows } = await readGenericSpreadsheet(file);
    expect(rows[0][1]).toBe("15%");
  });

  it("يتجاوز صفوف تمهيدية فارغة إلى أن يجد صف عناوين حقيقي (خليتان غير فارغتان فأكثر)", async () => {
    const file = new File([",\nsku,name\nSKU-1,منتج أ\n"], "x.csv", { type: "text/csv" });
    const { headers, rows } = await readGenericSpreadsheet(file);
    expect(headers).toEqual(["sku", "name"]);
    expect(rows).toEqual([["SKU-1", "منتج أ"]]);
  });

  it("يستثني صفوف بيانات فارغة تمامًا بعد صف العناوين", async () => {
    const file = new File(["sku,name\nSKU-1,منتج أ\n,\n"], "x.csv", { type: "text/csv" });
    const { rows } = await readGenericSpreadsheet(file);
    expect(rows.length).toBe(1);
  });
});

describe("readGenericSpreadsheet — ملف xlsx عام", () => {
  it("يقرأ أول ورقة عبر XLSX ويحدد صف العناوين تلقائيًا", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["sku", "name"], ["SKU-1", "منتج أ"]]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const file = new File([buf], "products.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const { headers, rows } = await readGenericSpreadsheet(file);
    expect(headers).toEqual(["sku", "name"]);
    expect(rows).toEqual([["SKU-1", "منتج أ"]]);
  });

  // [إصلاح 2026-09-07] كان يقرأ دائمًا wb.SheetNames[0] بلا اعتبار لحالة
  // الإخفاء — لو رفع المستخدم قالب قيود الرسمي نفسه بعد تعبئته (ورقته الأولى
  // فعليًا "do_not_edit" مخفية state="veryHidden")، تُقرأ قيم القائمة المخفية
  // كأنها صف عناوين/بيانات الفاتورة، ويفشل كل اكتشاف الأعمدة بصمت. سيناريو حقيقي
  // اكتُشف من ملف عميل فعلي (قالب قيود الرسمي معبّى ببيانات فواتير حقيقية).
  it("يتخطى ورقة أولى مخفية (veryHidden) ويقرأ أول ورقة ظاهرة بدلها", async () => {
    const wb = XLSX.utils.book_new();
    const hiddenWs = XLSX.utils.aoa_to_sheet([["المركز الرئيسي", 1], ["نعم", "نعم"]]);
    const visibleWs = XLSX.utils.aoa_to_sheet([["sku", "name"], ["SKU-1", "منتج أ"]]);
    XLSX.utils.book_append_sheet(wb, hiddenWs, "do_not_edit");
    XLSX.utils.book_append_sheet(wb, visibleWs, "Invoice Upload Template");
    wb.Workbook = wb.Workbook || {};
    wb.Workbook.Sheets = [{ Hidden: 2 }, { Hidden: 0 }]; // 2 = veryHidden، 0 = ظاهرة
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const file = new File([buf], "invoice.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const { headers, rows } = await readGenericSpreadsheet(file);
    expect(headers).toEqual(["sku", "name"]);
    expect(rows).toEqual([["SKU-1", "منتج أ"]]);
  });

  it("يسقط تلقائيًا على أول ورقة كالسابق حين لا تتوفر بيانات حالة الإخفاء إطلاقًا", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["sku", "name"], ["SKU-1", "منتج أ"]]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    delete wb.Workbook; // يحاكي ملفات لا تحمل بيانات Workbook.Sheets إطلاقًا
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const file = new File([buf], "no-meta.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const { headers, rows } = await readGenericSpreadsheet(file);
    expect(headers).toEqual(["sku", "name"]);
    expect(rows).toEqual([["SKU-1", "منتج أ"]]);
  });
});
