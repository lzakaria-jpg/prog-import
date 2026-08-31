import { describe, it, expect } from "vitest";
import { analyzeColumnShape, detectStockFormat, bestTemplateLocationFor } from "../columnShape.js";

describe("analyzeColumnShape — §6.9 (تمييز نسبة الخصم عن قيمة الخصم)", () => {
  it("مثال 1: قيم كسرية <1 ⇒ fractionLikeRatio=1", () => {
    const s = analyzeColumnShape(['0.10','0.15','0.05']);
    expect(s.fractionLikeRatio).toBe(1);
  });
  it("مثال 2: قيم مالية ≥1 (أغلبها) ⇒ moneyLikeRatio مرتفعة", () => {
    const s = analyzeColumnShape(['4518.26','680.87','0.00']);
    expect(s.moneyLikeRatio).toBeCloseTo(2/3, 5);
    expect(s.fractionLikeRatio).toBe(0);
  });
  it("مثال 3: كل القيم صفر ⇒ كل النسب صفر", () => {
    const s = analyzeColumnShape(['0.00','0.00']);
    expect(s.fractionLikeRatio).toBe(0);
    expect(s.moneyLikeRatio).toBe(0);
  });
});

describe("§6.10 فحص طبيعة القيم (shapeGuards) — 'Total (Tax inclusive)'", () => {
  it("عمود بقيم مبالغ (115.00, 241.50) لا يطابق شرط normalizeYesNo لأي منها", () => {
    // نفحص هنا فقط أن analyzeColumnShape يصنّفها كمبالغ (moneyLike) وليست نعم/لا نصية
    const s = analyzeColumnShape(['115.00','241.50']);
    expect(s.moneyLikeRatio).toBe(1);
  });
});

describe("§6.19 تقرير مواقع المنتجات بالصيغة العريضة", () => {
  it("يكتشف الصيغة wide عندما تطابق أعمدة الكميات مواقع القالب", () => {
    const headers = ['الرقم التسلسلي','اسم المنتج','المركز الرئيسي','فرع محلي-2','المجموع'];
    const rows = [['SKU-A','منتج','10','5','15']];
    const templateLocations = ['المركز الرئيسي','فرع محلي-2'];
    expect(detectStockFormat(headers, rows, templateLocations)).toBe('wide');
  });
  it("bestTemplateLocationFor يطابق 'المركز الرئيسي' حرفيًا", () => {
    expect(bestTemplateLocationFor('المركز الرئيسي', ['المركز الرئيسي','فرع محلي-2'])).toBe('المركز الرئيسي');
  });
  it("عمود المجموع (TOTAL_COL_RE) يُستبعد من مطابقة المواقع", () => {
    expect(bestTemplateLocationFor('المجموع', ['المركز الرئيسي'])).toBe('');
  });
});
