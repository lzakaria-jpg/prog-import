// @vitest-environment jsdom
/* اختبار تكامل شامل (دخان) يشغّل الأداة الكاملة عبر واجهة React الفعلية — من رفع القالب
   وملفات العملاء/المنتجات/المخزون الحقيقية المرفقة من المستخدم، مرورًا برفع ملف فواتير خام
   وحسم تعارض اسم عميل مكرر، وحتى توليد الملف النهائي في الخطوة 4 — قبل استبدال الأداة القديمة
   بهذه النسخة في التطبيق الفعلي (المهمة #8 من الخطة المعتمدة). */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import JSZip from 'jszip';
import React from 'react';
import InvoiceImportTool from '../InvoiceImportTool.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SAMPLES_DIR = '/home/claude/new-sales-tool';

function readSampleFile(name, type) {
  const buf = fs.readFileSync(path.join(SAMPLES_DIR, name));
  return new File([buf], name, { type });
}

async function buildTemplateZip() {
  const zip = new JSZip();
  zip.file('xl/workbook.xml',
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="do_not_edit" r:id="rId1"/><sheet name="Sheet2" r:id="rId2"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`);
  zip.file('xl/worksheets/sheet1.xml',
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
    `<row r="1"><c r="A1" t="inlineStr"><is><t>المركز الرئيسي</t></is></c><c r="B1" t="inlineStr"><is><t>ضريبة القيمة المضافة 15%</t></is></c></row>` +
    `<row r="2"><c r="A2" t="inlineStr"><is><t>فرع محلي-2</t></is></c><c r="B2" t="inlineStr"><is><t>معفى</t></is></c></row>` +
    `<row r="3"><c r="A3" t="inlineStr"><is><t>فرع محلي-31</t></is></c></row>` +
    `</sheetData></worksheet>`);
  const HEADER_CELLS = {
    A: 'مرجع الفاتورة', B: 'الوصف', C: 'الرقم المرجعي للعميل', D: 'تاريخ الإصدار',
    E: 'تاريخ الاستحقاق', F: 'تاريخ التوريد', G: 'الموقع', H: 'طريقة الدفع',
    I: 'الشروط والأحكام', J: 'الملاحظات', K: 'قيمة خصم المستند', L: 'حساب خصم المستند',
    M: 'الفئة الضريبية لخصم المستند', N: 'كود/باركود المنتج', O: 'وصف المنتج',
    P: 'الكمية', Q: 'وحدة التحويل', R: 'سعر الوحدة', S: 'شامل الضريبة؟',
    T: 'نسبة الخصم', U: 'قيمة الخصم', V: 'الضريبة%',
  };
  const headerRowXml = Object.entries(HEADER_CELLS).map(([col, val]) => `<c r="${col}2" t="inlineStr"><is><t>${val}</t></is></c>`).join('');
  const dataRowXml = Object.keys(HEADER_CELLS).map((col) => `<c r="${col}3" s="0"/>`).join('');
  zip.file('xl/worksheets/sheet2.xml',
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:V3"/><sheetData><row r="2">${headerRowXml}</row><row r="3">${dataRowXml}</row></sheetData>` +
    `<dataValidations count="2">` +
    `<dataValidation type="list" sqref="G3:G500"><formula1>do_not_edit!$A$1:$A$3</formula1></dataValidation>` +
    `<dataValidation type="list" sqref="V3:V500"><formula1>do_not_edit!$B$1:$B$2</formula1></dataValidation>` +
    `</dataValidations></worksheet>`);
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buf], 'template.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function setInputFiles(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function flush() {
  return act(async () => {
    for (let i = 0; i < 10; i++) await new Promise((res) => setTimeout(res, 0));
  });
}

describe('InvoiceImportTool — تكامل شامل بملفات العيّنة الحقيقية', () => {
  let container, root;

  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
    root = null; container = null;
  });

  it('يمرّ بكل الخطوات 1→4 وينتج ملفًا نهائيًا صالحًا للتحميل', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(React.createElement(InvoiceImportTool, { showHeader: false })); });
    await flush();

    // ---------- الخطوة 1: رفع الملفات المرجعية ----------
    const templateFile = await buildTemplateZip();
    const templateInput = container.querySelector('#card-template input[type=file]');
    expect(templateInput).toBeTruthy();
    await act(async () => { setInputFiles(templateInput, templateFile); await flush(); });
    expect(container.querySelector('#card-template').className).toContain('loaded');

    const productsInput = container.querySelector('#card-products input[type=file]');
    await act(async () => { setInputFiles(productsInput, readSampleFile('sample_products.csv', 'text/csv')); await flush(); });
    // تأكيد مطابقة المنتجات (التخمين الافتراضي صحيح لهذا الملف)
    const confirmProductsBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('تأكيد المطابقة وبناء الفهرس'));
    expect(confirmProductsBtn).toBeTruthy();
    await act(async () => { confirmProductsBtn.click(); await flush(); });
    expect(container.querySelector('#card-products').className).toContain('loaded');

    const stockInput = container.querySelector('#card-stock input[type=file]');
    await act(async () => { setInputFiles(stockInput, readSampleFile('sample_stock_locations.csv', 'text/csv')); await flush(); });
    const confirmStockBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('تأكيد المطابقة وبناء الفهرس'));
    expect(confirmStockBtn).toBeTruthy();
    await act(async () => { confirmStockBtn.click(); await flush(); });
    expect(container.querySelector('#card-stock').className).toContain('loaded');

    const customersInput = container.querySelector('#card-customers input[type=file]');
    await act(async () => { setInputFiles(customersInput, readSampleFile('sample_customers.csv', 'text/csv')); await flush(); });
    const confirmCustomersBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('تأكيد المطابقة وبناء الفهرس'));
    expect(confirmCustomersBtn).toBeTruthy();
    await act(async () => { confirmCustomersBtn.click(); await flush(); });
    expect(container.querySelector('#card-customers').className).toContain('loaded');

    // ---------- الانتقال للخطوة 2 ----------
    const step2Tab = Array.from(container.querySelectorAll('.qsv-step-tab')).find((b) => b.textContent.includes('إدخال بيانات الفواتير'));
    await act(async () => { step2Tab.click(); await flush(); });

    const invoiceFileInput = container.querySelector('#card-invoice-import input[type=file]');
    await act(async () => { setInputFiles(invoiceFileInput, readSampleFile('sample_raw_invoices.csv', 'text/csv')); await flush(); });

    const confirmMappingBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('تأكيد المطابقة وتعبئة الجدول'));
    expect(confirmMappingBtn).toBeTruthy();
    await act(async () => { confirmMappingBtn.click(); await flush(); });

    // الجدول يجب أن يحتوي 4 صفوف (نفس عدد صفوف ملف العيّنة)
    const dataGridRows = container.querySelectorAll('#data-grid tbody tr');
    expect(dataGridRows.length).toBe(4);

    // ---------- حسم تعارض اسم العميل المكرر (مؤسسة النور) ----------
    const ambiguitySelect = container.querySelector('.qsv-ambiguity-box select');
    expect(ambiguitySelect).toBeTruthy();
    await act(async () => {
      ambiguitySelect.value = ambiguitySelect.options[1].value; // أول مرشح فعلي (بعد "— اختر —")
      ambiguitySelect.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    const applyAmbiguityBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('تطبيق الاختيارات'));
    await act(async () => { applyAmbiguityBtn.click(); await flush(); });
    expect(container.querySelector('.qsv-ambiguity-box')).toBeFalsy();

    // ---------- الانتقال للخطوة 3 (يشغّل تسلسل goStep(3) الكامل) ----------
    const step3Tab = Array.from(container.querySelectorAll('.qsv-step-tab')).find((b) => b.textContent.includes('التحقق والتحليل'));
    await act(async () => { step3Tab.click(); await flush(); });

    const errCard = container.querySelector('.qsv-scard.err .qsv-n');
    expect(errCard).toBeTruthy();
    expect(errCard.textContent).toBe('0'); // كل الأسطر يجب أن تصبح صحيحة بعد حسم التعارض

    // ---------- الانتقال للخطوة 4 (يولّد الملف تلقائيًا لعدم وجود أخطاء) ----------
    const step4Tab = Array.from(container.querySelectorAll('.qsv-step-tab')).find((b) => b.textContent.includes('تحميل الملف الجاهز'));
    await act(async () => { step4Tab.click(); await flush(); await flush(); });

    const downloadLink = Array.from(container.querySelectorAll('a')).find((a) => a.textContent.includes('تحميل الملف'));
    expect(downloadLink).toBeTruthy();
    expect(downloadLink.getAttribute('href')).toMatch(/^blob:/);
    expect(downloadLink.getAttribute('download')).toMatch(/^qoyod_import_ready.*\.xlsx$/);
  });
});
