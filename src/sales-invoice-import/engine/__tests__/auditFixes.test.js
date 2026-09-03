// اختبارات انحدار لأخطاء حقيقية اكتُشفت بالفحص الشامل (2026-09) بأداة فواتير المبيعات.
import { describe, it, expect } from "vitest";
import { normalizeNumericText } from "../text.js";
import { bestTemplateLocationFor, analyzeColumnShape } from "../columnShape.js";
import { applyInvoiceImportMapping } from "../invoiceImportMapping.js";
import { createRow } from "../rows.js";

function rowFactory() { let n = 1; return () => createRow(`r${n++}`); }
const template = (V) => ({ loaded: true, dropdowns: { G: [], H: [], S: ["نعم", "لا"], L: [], V } });

describe("normalizeNumericText — فاصل الآلاف", () => {
  it("يحذف فاصل الآلاف: 1,200.00 ← 1200.00 (كان parseFloat يقرأها 1)", () => {
    expect(normalizeNumericText("1,200.00")).toBe("1200.00");
    expect(parseFloat(normalizeNumericText("1,200.00"))).toBe(1200);
  });
  it("يعامل الفاصلة المفردة كفاصلة عشرية (صيغة أوروبية): 12,5 ← 12.5", () => {
    expect(normalizeNumericText("12,5")).toBe("12.5");
  });
  it("يحافظ على علامة النسبة", () => {
    expect(normalizeNumericText("15%")).toBe("15%");
  });
});

describe("analyzeColumnShape — أعمدة رقمية بفاصل آلاف", () => {
  it("عمود سعر بقيم 1,200.00 يُعَدّ رقميًا (كانت النسبة تهبط لصفر فيُرفَض العمود الصحيح)", () => {
    const shape = analyzeColumnShape(["1,200.00", "3,450.00", "980.00"]);
    expect(shape.numericRatio).toBeGreaterThan(0.9);
  });
});

describe("bestTemplateLocationFor — عنوان عمود فارغ", () => {
  const locs = ["الفرع الرئيسي", "فرع جدة"];
  it("عنوان فارغ لا يُطابق أي موقع (كان يُطابق أول موقع فيُعطَّل فحص المخزون بصمت)", () => {
    expect(bestTemplateLocationFor("", locs)).toBe("");
    expect(bestTemplateLocationFor("   ", locs)).toBe("");
  });
  it("المطابقة الصحيحة تبقى تعمل كما هي", () => {
    expect(bestTemplateLocationFor("الفرع الرئيسي", locs)).toBe("الفرع الرئيسي");
  });
});

describe("applyInvoiceImportMapping — استنتاج الضريبة", () => {
  const headers = ["مرجع الفاتورة", "الكمية", "سعر الوحدة", "الإجمالي شامل الضريبة"];
  const mapping = { A: "مرجع الفاتورة", P: "الكمية", R: "سعر الوحدة", _grandTotal: "الإجمالي شامل الضريبة" };

  it("فاتورة متعددة السطور بسعر شامل: تُستنتَج S='نعم' بمقارنة مجموع الفاتورة لا سطر واحد", () => {
    // سطران 1×115.00 شاملة الضريبة، وإجمالي الفاتورة 230.00 مكرَّر بكل سطر.
    const rawRows = [["INV-1", "1", "115.00", "230.00"], ["INV-1", "1", "115.00", "230.00"]];
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, { template: template(["15%", "معفى"]) }, rowFactory());
    expect(importedRows).toHaveLength(2);
    importedRows.forEach((r) => expect(r.S).toBe("نعم"));
  });

  it("سعر شامل للضريبة: لا تُستنتَج نسبة ضريبة صفرية/معفاة من الإجمالي", () => {
    const rawRows = [["INV-2", "2", "57.50", "115.00"]];
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, { template: template(["15%", "معفى"]) }, rowFactory());
    expect(importedRows[0].S).toBe("نعم");
    expect(importedRows[0].V).not.toBe("معفى"); // كانت تُصدَّر "معفى" فتُحتسب الضريبة صفرًا
  });

  it("مبالغ بفاصل آلاف تُخزَّن رقمية سليمة (كانت تُقرأ 1 بصمت)", () => {
    const rawRows = [["INV-3", "1", "1,200.00", "1,380.00"]];
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, { template: template(["15%"]) }, rowFactory());
    expect(parseFloat(importedRows[0].R)).toBe(1200);
  });
});
