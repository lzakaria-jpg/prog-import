import { describe, it, expect } from "vitest";
import { guessInvoiceImportMapping, getMissingRequiredAfterDerivation, applyInvoiceImportMapping } from "../invoiceImportMapping.js";
import { createRow } from "../rows.js";

function rowFactory() {
  let n = 1;
  return () => createRow(n++);
}

describe("guessInvoiceImportMapping — التخمين الأساسي بالاسم مع فحوص الشكل", () => {
  it("يطابق كل الأعمدة الرئيسية بالاسم التام عندما تناسب قيمها شكل الحقل", () => {
    const headers = ['مرجع الفاتورة','الرقم المرجعي للعميل','تاريخ الإصدار','الموقع','كود المنتج','الكمية','سعر الوحدة','شامل الضريبة؟','الضريبة%'];
    const rawRows = [['INV-1','C-1','01/01/2026','الرياض','SKU-1','2','50','نعم','15%']];
    const { mainGuesses } = guessInvoiceImportMapping(headers, rawRows, {});
    expect(mainGuesses.A).toBe('مرجع الفاتورة');
    expect(mainGuesses.C).toBe('الرقم المرجعي للعميل');
    expect(mainGuesses.D).toBe('تاريخ الإصدار');
    expect(mainGuesses.G).toBe('الموقع');
    expect(mainGuesses.N).toBe('كود المنتج');
    expect(mainGuesses.P).toBe('الكمية');
    expect(mainGuesses.R).toBe('سعر الوحدة');
    expect(mainGuesses.S).toBe('شامل الضريبة؟');
    expect(mainGuesses.V).toBe('الضريبة%');
  });

  it("§6.10: عمود مسمّى 'Total (Tax inclusive)' يُسقَط من تخمين S لأن قيمه مبالغ لا نعم/لا", () => {
    const headers = ['Total (Tax inclusive)'];
    const rawRows = [['115.00'], ['241.50']];
    const { mainGuesses } = guessInvoiceImportMapping(headers, rawRows, {});
    expect(mainGuesses.S).toBe('');
  });

  it("عمود خصم عام واحد غير محدد الاسم يُصنَّف نسبة عند قيم كسرية <1", () => {
    const headers = ['اسم العميل', 'الخصم'];
    const rawRows = [['أحمد', '0.10']];
    const { mainGuesses } = guessInvoiceImportMapping(headers, rawRows, {});
    expect(mainGuesses.T).toBe('الخصم');
    expect(mainGuesses.U).toBe('');
  });

  it("نفس العمود العام يُصنَّف قيمة خصم عند قيم مالية ≥1", () => {
    const headers = ['اسم العميل', 'الخصم'];
    const rawRows = [['أحمد', '50.00']];
    const { mainGuesses } = guessInvoiceImportMapping(headers, rawRows, {});
    expect(mainGuesses.U).toBe('الخصم');
    expect(mainGuesses.T).toBe('');
  });

  it("استنتاج G بالقيم عند فشل الاسم: قيم عمود تطابق مواقع القالب المحمَّلة", () => {
    const headers = ['X1'];
    const rawRows = [['الرياض'], ['جدة'], ['الرياض']];
    const refs = { template: { loaded: true, dropdowns: { G: ['الرياض', 'جدة'], V: [], H: [] } } };
    const { mainGuesses } = guessInvoiceImportMapping(headers, rawRows, refs);
    expect(mainGuesses.G).toBe('X1');
  });

  it("استنتاج S بالقيم عند فشل الاسم: كل القيم نعم/لا قابلة للتطبيع", () => {
    const headers = ['X3'];
    const rawRows = [['Yes'], ['No'], ['Yes']];
    const { mainGuesses } = guessInvoiceImportMapping(headers, rawRows, {});
    expect(mainGuesses.S).toBe('X3');
  });
});

describe("getMissingRequiredAfterDerivation", () => {
  it("C يُستثنى من المفقود عندما تتوفر _customerName وعملاء محمَّلون", () => {
    const missing = getMissingRequiredAfterDerivation(
      { _customerName: 'اسم العميل' },
      { customers: { loaded: true } },
    );
    expect(missing.some(c => c.key === 'C')).toBe(false);
  });
  it("C يبقى مفقودًا بلا _customerName أو بلا عملاء محمَّلين", () => {
    const missing = getMissingRequiredAfterDerivation({}, {});
    expect(missing.some(c => c.key === 'C')).toBe(true);
  });
  it("R يُستثنى عندما تتوفر _lineTotal وP معًا", () => {
    const missing = getMissingRequiredAfterDerivation({ _lineTotal: 'Total', P: 'Qty' }, {});
    expect(missing.some(c => c.key === 'R')).toBe(false);
  });
  it("S يُستثنى عندما تتوفر _lineTotal أو _grandTotal", () => {
    const missing = getMissingRequiredAfterDerivation({ _grandTotal: 'Grand' }, {});
    expect(missing.some(c => c.key === 'S')).toBe(false);
  });
  it("N يُستثنى عندما تتوفر O ومنتجات محمَّلة", () => {
    const missing = getMissingRequiredAfterDerivation({ O: 'Product Desc' }, { products: { loaded: true } });
    expect(missing.some(c => c.key === 'N')).toBe(false);
  });
});

describe("applyInvoiceImportMapping — §6.4 اشتقاق السعر من إجمالي البند", () => {
  it("R يُشتق من _lineTotal÷P عند غياب عمود سعر صريح، وS لا تُستنتَج لأن السعر مُشتق", () => {
    const headers = ['Ref', 'Qty', 'LineTotal', 'Date', 'Cust', 'Loc', 'SKU'];
    const rawRows = [['INV-1', '2', '100', '01/01/2026', 'C-1', 'الرياض', 'SKU-1']];
    const mapping = { A: 'Ref', P: 'Qty', D: 'Date', C: 'Cust', G: 'Loc', N: 'SKU', _lineTotal: 'LineTotal' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[0].R).toBe('50');
    expect(importedRows[0].S).toBe('');
  });
});

describe("applyInvoiceImportMapping — استنتاج شامل الضريبة عند سعر صريح", () => {
  it("totalForS=115 وbase=100 (بلا rate) ⇒ S='لا' (الافتراضي عند عدم مطابقة أي حد تسامح)", () => {
    const headers = ['Ref', 'Qty', 'Price', 'LineTotal', 'Date', 'Cust', 'Loc', 'SKU'];
    const rawRows = [['INV-2', '2', '50', '115', '01/01/2026', 'C-1', 'الرياض', 'SKU-1']];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', D: 'Date', C: 'Cust', G: 'Loc', N: 'SKU', _lineTotal: 'LineTotal' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[0].S).toBe('لا');
  });

  it("totalForS=100 وbase=100 ⇒ S='نعم' (شامل الضريبة أصلًا)", () => {
    const headers = ['Ref', 'Qty', 'Price', 'LineTotal', 'Date', 'Cust', 'Loc', 'SKU'];
    const rawRows = [['INV-3', '2', '50', '100', '01/01/2026', 'C-1', 'الرياض', 'SKU-1']];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', D: 'Date', C: 'Cust', G: 'Loc', N: 'SKU', _lineTotal: 'LineTotal' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[0].S).toBe('نعم');
  });
});

describe("applyInvoiceImportMapping — تفريغ الخصم الصفري وتوحيد نسبة الخصم", () => {
  it("T/U/K بقيمة صفر تُفرَّغ لا تُكتب 0.00", () => {
    const headers = ['Ref', 'Qty', 'Price', 'Date', 'Cust', 'Loc', 'SKU', 'Disc'];
    const rawRows = [['INV-4', '2', '50', '01/01/2026', 'C-1', 'الرياض', 'SKU-1', '0']];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', D: 'Date', C: 'Cust', G: 'Loc', N: 'SKU', U: 'Disc' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[0].U).toBe('');
  });

  it("نسبة خصم كسرية <1 (0.05) تُوحَّد إلى 5", () => {
    const headers = ['Ref', 'Qty', 'Price', 'Date', 'Cust', 'Loc', 'SKU', 'Disc'];
    const rawRows = [['INV-5', '2', '50', '01/01/2026', 'C-1', 'الرياض', 'SKU-1', '0.05']];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', D: 'Date', C: 'Cust', G: 'Loc', N: 'SKU', T: 'Disc' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[0].T).toBe('5');
  });
});

describe("applyInvoiceImportMapping — الفئة الضريبية: توحيد صريح ومطابقة القالب", () => {
  it("V صريح 0.15 يُوحَّد إلى '15%' ثم يُطابَق لأقرب فئة بالقالب", () => {
    const headers = ['Ref', 'Qty', 'Price', 'Date', 'Cust', 'Loc', 'SKU', 'Tax'];
    const rawRows = [['INV-6', '2', '50', '01/01/2026', 'C-1', 'الرياض', 'SKU-1', '0.15']];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', D: 'Date', C: 'Cust', G: 'Loc', N: 'SKU', V: 'Tax' };
    const refs = { template: { loaded: true, dropdowns: { V: ['ضريبة القيمة المضافة 15%'] } } };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, refs, rowFactory());
    expect(importedRows[0].V).toBe('ضريبة القيمة المضافة 15%');
  });

  it("V غير صريح يُستنتَج من _grandTotal مقابل (الكمية×السعر) عند توفر قالب محمَّل", () => {
    const headers = ['Ref', 'Qty', 'Price', 'Date', 'Cust', 'Loc', 'SKU', 'Grand'];
    const rawRows = [['INV-7', '20', '5', '01/01/2026', 'C-1', 'الرياض', 'SKU-1', '115']];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', D: 'Date', C: 'Cust', G: 'Loc', N: 'SKU', _grandTotal: 'Grand' };
    const refs = { template: { loaded: true, dropdowns: { V: ['ضريبة القيمة المضافة 15%'] } } };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, refs, rowFactory());
    expect(importedRows[0].V).toBe('ضريبة القيمة المضافة 15%');
  });
});

describe("applyInvoiceImportMapping — مطابقة الاسم عند غياب الرقم المرجعي/الكود", () => {
  it("اسم عميل صريح (_customerName) يُطابَق عميل واحد فيُستبدل C بالرقم المرجعي", () => {
    const headers = ['Ref', 'Qty', 'Price', 'Date', 'Loc', 'SKU', 'CustName'];
    const rawRows = [['INV-8', '2', '50', '01/01/2026', 'الرياض', 'SKU-1', 'عميل واحد']];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', D: 'Date', G: 'Loc', N: 'SKU', _customerName: 'CustName' };
    const refs = { customers: { loaded: true, byName: new Map([['عميلواحد', [{ ref: 'C-1', name: 'عميل واحد' }]]]) } };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, refs, rowFactory());
    expect(importedRows[0].C).toBe('C-1');
  });

  it("اسم منتج مطابق لأكثر من منتج يُسجَّل كتعارض ولا يُستبدل N", () => {
    const headers = ['Ref', 'Qty', 'Price', 'Date', 'Cust', 'Loc', 'ProdName'];
    const rawRows = [['INV-9', '2', '50', '01/01/2026', 'C-1', 'الرياض', 'منتج مشترك']];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', D: 'Date', C: 'Cust', G: 'Loc', _productName: 'ProdName' };
    const refs = { products: { loaded: true, byName: new Map([['منتجمشترك', [{ sku: 'SKU-A' }, { sku: 'SKU-B' }]]]) } };
    const { importedRows, ambiguities } = applyInvoiceImportMapping(rawRows, headers, mapping, refs, rowFactory());
    expect(importedRows[0].N).toBe('');
    expect(ambiguities.some(a => a.field === 'N')).toBe(true);
  });
});

describe("applyInvoiceImportMapping — تعبئة رأس الفاتورة وتصفية الصفوف الفارغة", () => {
  it("يُطبَّق fillDownHeaderFields على النتيجة النهائية عبر صفوف نفس المرجع", () => {
    const headers = ['Ref', 'Qty', 'Price', 'Date', 'Cust', 'Loc', 'SKU'];
    const rawRows = [
      ['INV-10', '2', '50', '01/01/2026', 'C-1', 'الرياض', 'SKU-1'],
      ['INV-10', '1', '30', '', '', '', 'SKU-2'],
    ];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', D: 'Date', C: 'Cust', G: 'Loc', N: 'SKU' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[1].D).toBe('01/01/2026');
    expect(importedRows[1].C).toBe('C-1');
    expect(importedRows[1].G).toBe('الرياض');
  });

  it("صف مصدر بلا أي قيمة في كل أعمدة COLUMNS يُستثنى من النتيجة", () => {
    const headers = ['Ref', 'Qty'];
    const rawRows = [['', '']];
    const mapping = { A: 'Ref', P: 'Qty' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows.length).toBe(0);
  });
});
