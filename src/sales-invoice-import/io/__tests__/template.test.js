// @vitest-environment jsdom
/* يحتاج بيئة jsdom لأن parseTemplateFile يستخدم DOMParser + querySelector على XML —
   غير متاحين في بيئة node الافتراضية لـ vitest. انظر ملاحظة الخطة §0.1. */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseTemplateFile } from "../template.js";

// نفس تخطيط الأعمدة الـ19 المستخدَم في مثال §6.1 (columnMatching.test.js) — يُعاد استخدامه هنا
// لأن نتيجته معروفة ومُتحقَّق منها مسبقًا: N->K، O->L، P->M، V->S، وK/L/M منطقية تبقى مفقودة.
const HEADER_CELLS = {
  A: 'مرجع الفاتورة', B: 'الوصف', C: 'الرقم المرجعي للعميل', D: 'تاريخ الإصدار',
  E: 'تاريخ الاستحقاق', F: 'تاريخ التوريد', G: 'الموقع', H: 'طريقة الدفع',
  I: 'الشروط والأحكام', J: 'الملاحظات',
  K: 'الرقم التسلسلي/الباركود للمنتج *', L: 'وصف المنتج',
  M: 'الكمية (بالوحدة الأساسية) *', N: 'وحدة التحويل', O: 'سعر الوحدة *',
  P: 'شامل الضريبية؟ *', Q: 'نسبة الخصم', R: 'قيمة الخصم', S: 'الضريبة% *',
};

async function buildTemplateZip() {
  const zip = new JSZip();

  zip.file('xl/workbook.xml',
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="do_not_edit" r:id="rId1"/><sheet name="Sheet2" r:id="rId2"/></sheets></workbook>`);

  zip.file('xl/_rels/workbook.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`);

  // الورقة المخفية: قائمة مواقع بالعمود A (صفوف 1-2)، وقائمة فئات ضريبية بالعمود B (صفوف 1-2)
  zip.file('xl/worksheets/sheet1.xml',
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
    `<row r="1"><c r="A1" t="inlineStr"><is><t>الرياض</t></is></c><c r="B1" t="inlineStr"><is><t>ضريبة القيمة المضافة 15%</t></is></c></row>` +
    `<row r="2"><c r="A2" t="inlineStr"><is><t>جدة</t></is></c><c r="B2" t="inlineStr"><is><t>معفى</t></is></c></row>` +
    `</sheetData></worksheet>`);

  const headerRowXml = Object.entries(HEADER_CELLS)
    .map(([col, val]) => `<c r="${col}2" t="inlineStr"><is><t>${val}</t></is></c>`).join('');
  const dataRowXml = Object.keys(HEADER_CELLS)
    .map(col => `<c r="${col}3" s="1"/>`).join('');

  zip.file('xl/worksheets/sheet2.xml',
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:S3"/><sheetData><row r="2">${headerRowXml}</row><row r="3">${dataRowXml}</row></sheetData>` +
    `<dataValidations count="2">` +
    `<dataValidation type="list" sqref="G3:G500"><formula1>do_not_edit!$A$1:$A$2</formula1></dataValidation>` +
    `<dataValidation type="list" sqref="S3:S500"><formula1>do_not_edit!$B$1:$B$2</formula1></dataValidation>` +
    `</dataValidations></worksheet>`);

  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return { arrayBuffer: async () => buf };
}

describe("parseTemplateFile — تخطيط 19 عمودًا (مطابق لمثال §6.1)", () => {
  it("يكتشف صف العناوين وموضع كل حقل فعليًا، ويترك K/L/M المنطقية بلا موضع", async () => {
    const tpl = await parseTemplateFile(await buildTemplateZip());
    expect(tpl.headerRow).toBe(2);
    expect(tpl.colMap.A).toBe('A');
    expect(tpl.colMap.N).toBe('K'); // كود المنتج يُكتب فعليًا بالعمود K لا N
    expect(tpl.colMap.O).toBe('L');
    expect(tpl.colMap.P).toBe('M');
    expect(tpl.colMap.V).toBe('S');
    expect(tpl.missingFields).toEqual(expect.arrayContaining(['K', 'L', 'M']));
  });

  it("يستخرج قوائم القوائم المنسدلة G وV من الورقة المخفية عبر dataValidation/formula1", async () => {
    const tpl = await parseTemplateFile(await buildTemplateZip());
    expect(tpl.dropdowns.G).toEqual(['الرياض', 'جدة']);
    expect(tpl.dropdowns.V).toEqual(['ضريبة القيمة المضافة 15%', 'معفى']);
  });

  it("S تبقى الافتراضي نعم/لا لغياب قائمة صريحة مطابقة له في هذا القالب", async () => {
    const tpl = await parseTemplateFile(await buildTemplateZip());
    expect(tpl.dropdowns.S).toEqual(['نعم', 'لا']);
  });

  it("يستخرج نمط أول صف بيانات (colStyles) بعد صف العناوين مباشرة، للحفاظ على تنسيق القالب", async () => {
    const tpl = await parseTemplateFile(await buildTemplateZip());
    expect(tpl.colStyles.A).toBe('1');
    expect(tpl.colStyles.S).toBe('1');
  });

  it("maxColIndex يعكس آخر عمود فعلي بالقالب (S = العمود 19)", async () => {
    const tpl = await parseTemplateFile(await buildTemplateZip());
    expect(tpl.maxColIndex).toBe(19);
  });

  it("visiblePath يشير للمسار الفعلي لملف الورقة الظاهرة داخل الأرشيف", async () => {
    const tpl = await parseTemplateFile(await buildTemplateZip());
    expect(tpl.visiblePath).toBe('xl/worksheets/sheet2.xml');
  });
});
