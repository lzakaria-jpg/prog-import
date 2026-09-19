import { describe, it, expect } from "vitest";
import {
  isExpenseAccount, isRevenueAccount, isAssetAccount, isNonCurrentAssetAccount,
  isExpenseOrNonCurrentAssetAccount, filterAccountsWithFallback,
} from "../accountFilters.js";

describe("predicates أساسية (type الخشن من AccountResponse)", () => {
  it("isRevenueAccount/isExpenseAccount/isAssetAccount تطابق حقل type فقط", () => {
    expect(isRevenueAccount({ type: "Revenue" })).toBe(true);
    expect(isRevenueAccount({ type: "Expense" })).toBe(false);
    expect(isExpenseAccount({ type: "Expense" })).toBe(true);
    expect(isAssetAccount({ type: "Asset" })).toBe(true);
  });
});

describe("isNonCurrentAssetAccount — استدلال بالكلمات المفتاحية بـgroup_type/الاسم", () => {
  it("يطابق أصلاً بgroup_type يحوي 'Non-Current Assets'", () => {
    expect(isNonCurrentAssetAccount({ type: "Asset", group_type: "Non-Current Assets" })).toBe(true);
  });
  it("يطابق أصلاً بgroup_type عربي 'الأصول غير المتداولة'", () => {
    expect(isNonCurrentAssetAccount({ type: "Asset", group_type: "الأصول غير المتداولة" })).toBe(true);
  });
  it("لا يطابق أصل متداول عادي (Current Assets)", () => {
    expect(isNonCurrentAssetAccount({ type: "Asset", group_type: "Current Assets" })).toBe(false);
  });
  it("لا يطابق حساباً ليس من نوع Asset حتى لو النص يحوي كلمة مفتاحية", () => {
    expect(isNonCurrentAssetAccount({ type: "Expense", group_type: "Non-Current Assets" })).toBe(false);
  });
});

describe("isExpenseOrNonCurrentAssetAccount — لحقل تعديل حساب المصروف", () => {
  it("يطابق حساب مصروف عادي", () => {
    expect(isExpenseOrNonCurrentAssetAccount({ type: "Expense" })).toBe(true);
  });
  it("يطابق أصلاً غير متداول أيضاً", () => {
    expect(isExpenseOrNonCurrentAssetAccount({ type: "Asset", group_type: "Fixed Assets" })).toBe(true);
  });
  it("لا يطابق إيراداً ولا أصلاً متداولاً", () => {
    expect(isExpenseOrNonCurrentAssetAccount({ type: "Revenue" })).toBe(false);
    expect(isExpenseOrNonCurrentAssetAccount({ type: "Asset", group_type: "Current Assets" })).toBe(false);
  });
});

describe("filterAccountsWithFallback", () => {
  const accounts = [
    { id: 1, type: "Revenue" },
    { id: 2, type: "Expense" },
    { id: 3, type: "Asset", group_type: "Current Assets" },
  ];

  it("يُعيد المطابق فقط لو غير فارغ", () => {
    const r = filterAccountsWithFallback(accounts, isExpenseAccount, isAssetAccount);
    expect(r).toEqual([{ id: 2, type: "Expense" }]);
  });

  it("يتراجع لfallbackPredicate لو لم يُطابق الاستدلال شيئاً (مثال: لا أصول غير متداولة بهذي المنشأة)", () => {
    const r = filterAccountsWithFallback(accounts, isNonCurrentAssetAccount, isExpenseAccount);
    expect(r).toEqual([{ id: 2, type: "Expense" }]);
  });

  it("بلا fallbackPredicate: يُعيد القائمة كاملة لو لم يُطابق الاستدلال شيئاً", () => {
    const r = filterAccountsWithFallback(accounts, isNonCurrentAssetAccount);
    expect(r).toEqual(accounts);
  });

  it("قائمة فارغة/غير معرَّفة => قائمة فارغة بلا خطأ", () => {
    expect(filterAccountsWithFallback(null, isExpenseAccount)).toEqual([]);
    expect(filterAccountsWithFallback([], isExpenseAccount)).toEqual([]);
  });
});
