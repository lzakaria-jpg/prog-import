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

  // [إضافة، إصلاح خطأ حقيقي 2026-09-17] راجع تعليق رأس groupBaseUsable —
  // فاتورة بأكثر من سطر (بلا _lineTotal، فقط _grandTotal للفاتورة كاملة)
  // تعتمد استنتاج S على مقارنة *مجموع* (كمية×سعر) لكل سطورها بالإجمالي —
  // سند قبض بنفس المرجع (كمية/سعر فارغَين دومًا) كان يُسقِط هذا المجموع
  // بالكامل (groupBaseUsable=false)، فيرتد كل سطر فاتورة لمقارنة سطره
  // المفرد وحده بالإجمالي الكامل، فيُستنتَج 'لا' خطأً رغم تطابق المجموع الحقيقي.
  it("سند قبض بنفس مرجع فاتورة متعددة السطور لا يُفسِد استنتاج شامل الضريبة (لا يُسقِط groupBaseUsable)", () => {
    const headers = ['Type', 'Ref', 'Qty', 'Price', 'Grand', 'Date', 'Cust', 'Loc', 'SKU'];
    const rawRows = [
      ['فاتورة', 'INV-1', '2', '50', '115', '01/01/2026', 'C-1', 'الرياض', 'SKU-1'], // 2×50=100
      ['فاتورة', 'INV-1', '1', '15', '115', '01/01/2026', 'C-1', 'الرياض', 'SKU-2'], // 1×15=15، المجموع=115
      ['سند قبض', 'INV-1', '', '', '', '01/01/2026', 'C-1', '', ''],
    ];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', D: 'Date', C: 'Cust', G: 'Loc', N: 'SKU', _grandTotal: 'Grand', _docType: 'Type' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    const invoiceRows = importedRows.filter((r) => r.docType !== 'سند قبض');
    expect(invoiceRows).toHaveLength(2);
    expect(invoiceRows[0].S).toBe('نعم');
    expect(invoiceRows[1].S).toBe('نعم');
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

describe("applyInvoiceImportMapping — [إضافة، غير مؤكَّد ميدانيًا] عمود المشروع (mapping._project)", () => {
  it("يُخزَّن خامًا (بلا مطابقة هنا) على row.projectRef، ويُنشَر لبقية صفوف نفس المرجع", () => {
    const headers = ['Ref', 'Qty', 'Price', 'SKU', 'Proj'];
    const rawRows = [
      ['INV-1', '2', '50', 'SKU-1', 'مشروع الرياض'],
      ['INV-1', '1', '30', 'SKU-2', ''],
    ];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', N: 'SKU', _project: 'Proj' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[0].projectRef).toBe('مشروع الرياض');
    expect(importedRows[1].projectRef).toBe('مشروع الرياض'); // مُعبَّأ من fillDownHeaderFields
  });

  it("بلا mapping._project أصلًا: لا projectRef على أي صف", () => {
    const headers = ['Ref', 'Qty'];
    const rawRows = [['INV-1', '2']];
    const mapping = { A: 'Ref', P: 'Qty' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[0].projectRef).toBeUndefined();
  });
});

describe("applyInvoiceImportMapping — [إضافة] فئة/وحدة المنتج (mapping._category/._unit)", () => {
  it("يُخزَّنان خامًا (بلا مطابقة هنا) على row.categoryRef/row.unitRef لكل بند على حدة", () => {
    const headers = ['Ref', 'Qty', 'Price', 'SKU', 'Cat', 'Unit'];
    const rawRows = [
      ['INV-1', '2', '50', 'SKU-1', 'إلكترونيات', 'قطعة'],
      ['INV-1', '1', '30', 'SKU-2', 'أثاث', 'كرتون'],
    ];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', N: 'SKU', _category: 'Cat', _unit: 'Unit' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[0].categoryRef).toBe('إلكترونيات');
    expect(importedRows[0].unitRef).toBe('قطعة');
    expect(importedRows[1].categoryRef).toBe('أثاث');
    expect(importedRows[1].unitRef).toBe('كرتون');
  });

  it("[تمييز مهم] لا علاقة لـ_unit بعمود القالب الرسمي Q (وحدة التحويل) — كلاهما مستقلان تمامًا", () => {
    const headers = ['Ref', 'Qty', 'Price', 'SKU', 'ConvUnit', 'BaseUnit'];
    const rawRows = [['INV-1', '2', '50', 'SKU-1', 'كرتون', 'قطعة']];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', N: 'SKU', Q: 'ConvUnit', _unit: 'BaseUnit' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[0].Q).toBe('كرتون'); // وحدة تحويل بند فاتورة — عمود قالب رسمي عادي
    expect(importedRows[0].unitRef).toBe('قطعة'); // الوحدة الأساسية للمنتج عند إنشائه — حقل مساعد مستقل
  });

  it("بلا mapping._category/._unit أصلًا: لا categoryRef/unitRef على أي صف", () => {
    const headers = ['Ref', 'Qty'];
    const rawRows = [['INV-1', '2']];
    const mapping = { A: 'Ref', P: 'Qty' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[0].categoryRef).toBeUndefined();
    expect(importedRows[0].unitRef).toBeUndefined();
  });

  it("لا تُنشَر عبر fillDownHeaderFields — كل بند يحمل فئته/وحدته الخاصة فقط (بخلاف projectRef)", () => {
    const headers = ['Ref', 'Qty', 'Price', 'SKU', 'Cat'];
    const rawRows = [
      ['INV-1', '2', '50', 'SKU-1', 'إلكترونيات'],
      ['INV-1', '1', '30', 'SKU-2', ''],
    ];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', N: 'SKU', _category: 'Cat' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[0].categoryRef).toBe('إلكترونيات');
    expect(importedRows[1].categoryRef).toBeUndefined();
  });
});

// [إضافة] سندات القبض المرتبطة بفواتير (mapping._docType/._paymentAmount/
// ._paymentAccountCode) — راجع تعليق رأس engine/receipts.js.
describe("applyInvoiceImportMapping — [إضافة] سند القبض (mapping._docType/._paymentAmount/._paymentAccountCode)", () => {
  it("يُخزَّن كل حقل خامًا على row.docType/paymentAmount/paymentAccountCode لكل صف على حدة", () => {
    const headers = ['Type', 'Ref', 'Cust', 'Amount', 'AccCode'];
    const rawRows = [
      ['فاتورة', 'INV-1', 'عميل تجريبي', '', ''],
      ['سند قبض', 'INV-1', 'عميل تجريبي', '500', '1102'],
    ];
    const mapping = { A: 'Ref', C: 'Cust', _docType: 'Type', _paymentAmount: 'Amount', _paymentAccountCode: 'AccCode' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[0].docType).toBe('فاتورة');
    expect(importedRows[0].paymentAmount).toBeUndefined();
    expect(importedRows[1].docType).toBe('سند قبض');
    expect(importedRows[1].paymentAmount).toBe('500');
    expect(importedRows[1].paymentAccountCode).toBe('1102');
  });

  it("قيمة الدفعة برقم يحوي فاصل آلاف ⇒ تُطبَّع رقميًا (normalizeNumericText)، نفس معاملة أي حقل رقمي آخر", () => {
    const headers = ['Type', 'Ref', 'Amount'];
    const rawRows = [['سند قبض', 'INV-1', '1,200.50']];
    const mapping = { A: 'Ref', _docType: 'Type', _paymentAmount: 'Amount' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[0].paymentAmount).toBe('1200.50');
  });

  it("بلا mapping._docType أصلًا (ملف قديم): لا docType على أي صف — يُعامَل كفاتورة دومًا", () => {
    const headers = ['Ref', 'Qty'];
    const rawRows = [['INV-1', '2']];
    const mapping = { A: 'Ref', P: 'Qty' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[0].docType).toBeUndefined();
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

  // [إصلاح 2026-09-05] السيناريو الحقيقي الذي أبلغ عنه المستخدم: ملف العميل يكتب مرجع الفاتورة
  // بأول سطر فقط ويترك خانة المرجع نفسها فارغة بباقي سطور بنودها (خلايا مدمجة بإكسل) - قبل
  // forwardFillInvoiceRef كان الصف الثاني هنا يبقى بمرجع فارغ للأبد (لا يدخل أي مجموعة تجميع
  // بالأساس)، فيظهر بالملف النهائي كصف بمرجع فاتورة فارغ.
  it("مرجع الفاتورة (A) فارغ فعليًا بملف المصدر بسطر بند تالٍ لنفس الفاتورة يُنشَر تلقائيًا قبل التجميع", () => {
    const headers = ['Ref', 'Qty', 'Price', 'Date', 'Cust', 'Loc', 'SKU'];
    const rawRows = [
      ['INV-10', '2', '50', '01/01/2026', 'C-1', 'الرياض', 'SKU-1'],
      ['', '1', '30', '', '', '', 'SKU-2'], // خانة المرجع فارغة فعليًا بالملف الخام - لا "INV-10" مكرر يدويًا
    ];
    const mapping = { A: 'Ref', P: 'Qty', R: 'Price', D: 'Date', C: 'Cust', G: 'Loc', N: 'SKU' };
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, mapping, {}, rowFactory());
    expect(importedRows[1].A).toBe('INV-10');
    expect(importedRows[1].D).toBe('01/01/2026');
    expect(importedRows[1].C).toBe('C-1');
    expect(importedRows[1].G).toBe('الرياض');
  });
});

// [إضافة، طلب صريح من المستخدم 2026-09-17] راجع تعليق رأس normalizeDueDate
// بـengine/dates.js — يُطبَّق بعد fillDownHeaderFields على القيم النهائية.
describe("applyInvoiceImportMapping — [إضافة] تطبيع تاريخ الاستحقاق (E) مقابل الإصدار (D)", () => {
  const baseMapping = { A: 'Ref', P: 'Qty', R: 'Price', D: 'Date', E: 'Due', C: 'Cust', G: 'Loc', N: 'SKU' };
  const headers = ['Ref', 'Qty', 'Price', 'Date', 'Due', 'Cust', 'Loc', 'SKU'];

  it("استحقاق فارغ ⇒ يُملأ بتاريخ الإصدار", () => {
    const rawRows = [['INV-1', '2', '50', '10/01/2026', '', 'C-1', 'الرياض', 'SKU-1']];
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, baseMapping, {}, rowFactory());
    expect(importedRows[0].E).toBe('10/01/2026');
  });

  it("استحقاق بعد الإصدار ⇒ يُقصَر على تاريخ الإصدار", () => {
    const rawRows = [['INV-1', '2', '50', '01/01/2026', '10/01/2026', 'C-1', 'الرياض', 'SKU-1']];
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, baseMapping, {}, rowFactory());
    expect(importedRows[0].E).toBe('01/01/2026');
  });

  it("استحقاق قبل الإصدار ⇒ يبقى كما هو تمامًا (يُحتَرم)", () => {
    const rawRows = [['INV-1', '2', '50', '10/01/2026', '01/01/2026', 'C-1', 'الرياض', 'SKU-1']];
    const { importedRows } = applyInvoiceImportMapping(rawRows, headers, baseMapping, {}, rowFactory());
    expect(importedRows[0].E).toBe('01/01/2026');
  });

  it("صف سند قبض (_docType) ⇒ لا يُطبَّق التطبيع عليه إطلاقًا", () => {
    const rcHeaders = [...headers, 'Type'];
    const mapping = { ...baseMapping, _docType: 'Type' };
    const rawRows = [['INV-1', '', '', '15/01/2026', '01/01/2020', 'C-1', '', '', 'سند قبض']];
    const { importedRows } = applyInvoiceImportMapping(rawRows, rcHeaders, mapping, {}, rowFactory());
    expect(importedRows[0].E).toBe('01/01/2020'); // كما كُتب بالملف، بلا أي تعديل
  });
});
