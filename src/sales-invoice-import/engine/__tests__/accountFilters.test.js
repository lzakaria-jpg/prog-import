import { describe, it, expect } from 'vitest';
import { isExpenseAccount, isRevenueAccount, isEquityAccount, isRevenueOrEquityAccount, isExpenseOrEquityAccount, isCashOrBankAccount, isInventoryAccount, filterAccountsWithFallback } from '../accountFilters.js';

const expenseAcc = { id: 1, type: 'Expense', group_type: 'Cost of Sales', name_ar: 'تكلفة البضاعة المباعة' };
const revenueAcc = { id: 2, type: 'Revenue', group_type: 'Sales', name_ar: 'إيرادات المبيعات' };
const bankAcc = { id: 3, type: 'Asset', group_type: 'Current Assets', name_ar: 'البنك الأهلي' };
const cashAcc = { id: 4, type: 'Asset', group_type: 'Current Assets', name_ar: 'النقدية الصغيرة' };
const inventoryAcc = { id: 5, type: 'Asset', group_type: 'Current Assets', name_ar: 'مخزون البضائع' };
const receivableAcc = { id: 6, type: 'Asset', group_type: 'Current Assets', name_ar: 'العملاء' };
const liabilityAcc = { id: 7, type: 'Liability', group_type: 'Current Liabilities', name_ar: 'الموردون' };
const equityAcc = { id: 8, type: 'Equity', group_type: 'Equity', name_ar: 'الأرباح المُحتجزة' };

describe('isExpenseAccount / isRevenueAccount', () => {
  it('يعتمد على type فقط (طلب صريح: مصروف/إيراد عام، لا تكلفة مبيعات تحديدًا)', () => {
    expect(isExpenseAccount(expenseAcc)).toBe(true);
    expect(isExpenseAccount(revenueAcc)).toBe(false);
    expect(isRevenueAccount(revenueAcc)).toBe(true);
    expect(isRevenueAccount(expenseAcc)).toBe(false);
  });
});

describe('isEquityAccount / isRevenueOrEquityAccount / isExpenseOrEquityAccount', () => {
  it('يميّز حساب حقوق الملكية بمفرده', () => {
    expect(isEquityAccount(equityAcc)).toBe(true);
    expect(isEquityAccount(revenueAcc)).toBe(false);
  });

  // [إضافة، طلب صريح من المستخدم 2026-09-17] تسوية جرد مخزون افتتاحي تُرحَّل
  // غالبًا لحقوق الملكية لا إيراد/مصروف تشغيلي فعلي — حساب حقوق الملكية يظهر
  // بكلا قائمتَي الإيراد والمصروف الخاصتين بتسوية المخزون.
  it('حساب حقوق الملكية يُقبَل ضمن قائمة الإيراد وقائمة المصروف معًا', () => {
    expect(isRevenueOrEquityAccount(equityAcc)).toBe(true);
    expect(isExpenseOrEquityAccount(equityAcc)).toBe(true);
  });

  it('حساب إيراد عادي لا يُقبَل ضمن قائمة المصروف رغم الدمج مع حقوق الملكية', () => {
    expect(isExpenseOrEquityAccount(revenueAcc)).toBe(false);
  });
});

describe('isCashOrBankAccount', () => {
  it('يطابق حساب بنك أو نقدية (كلمة مفتاحية بالاسم)', () => {
    expect(isCashOrBankAccount(bankAcc)).toBe(true);
    expect(isCashOrBankAccount(cashAcc)).toBe(true);
  });
  it('لا يطابق حساب أصل متداول آخر (عملاء) رغم كونه Asset أيضًا', () => {
    expect(isCashOrBankAccount(receivableAcc)).toBe(false);
  });
  it('لا يطابق حسابًا ليس من نوع Asset إطلاقًا', () => {
    expect(isCashOrBankAccount(liabilityAcc)).toBe(false);
  });
});

describe('isInventoryAccount', () => {
  it('يطابق حساب مخزون بالاسم', () => {
    expect(isInventoryAccount(inventoryAcc)).toBe(true);
  });
  it('لا يطابق حساب أصل متداول آخر (بنك)', () => {
    expect(isInventoryAccount(bankAcc)).toBe(false);
  });
});

describe('filterAccountsWithFallback', () => {
  const accounts = [expenseAcc, revenueAcc, bankAcc, cashAcc, inventoryAcc, receivableAcc, liabilityAcc];

  it('يرجّع المطابقات فقط عند وجودها', () => {
    const result = filterAccountsWithFallback(accounts, isInventoryAccount);
    expect(result).toEqual([inventoryAcc]);
  });

  it('بلا أي تطابق إطلاقًا (استدلال خاطئ لدليل حسابات هذي المنشأة تحديدًا) ⇒ تراجع لكل حسابات Asset بدل قائمة فارغة', () => {
    const noInventoryHere = [expenseAcc, revenueAcc, bankAcc, liabilityAcc];
    const result = filterAccountsWithFallback(noInventoryHere, isInventoryAccount);
    expect(result).toEqual([bankAcc]); // الوحيد من نوع Asset بهذي القائمة
  });

  it('بلا أي حساب Asset حتى بالتراجع ⇒ مصفوفة فارغة (لا شيء لتعطيله أكثر)', () => {
    const result = filterAccountsWithFallback([expenseAcc, revenueAcc], isInventoryAccount);
    expect(result).toEqual([]);
  });
});
