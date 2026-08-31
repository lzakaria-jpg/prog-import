import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildRowXml, generateFinalXlsx, triggerXlsxDownload } from "../xmlExport.js";
import { createRow } from "../../engine/rows.js";

function baseTemplate(overrides) {
  return {
    colMap: { A: 'A', C: 'C', N: 'K' }, // N (منطقي) يُكتب فعليًا بالعمود K في القالب
    maxColIndex: 11, // يمتد حتى K لأن N تُكتب فعليًا هناك
    colStyles: { A: '5', C: '0', K: '2' },
    headerRow: 2,
    sheet2Xml: `<worksheet><dimension ref="A1:K2"/><sheetData><row r="1"></row><row r="2"><c r="A2" s="0" t="inlineStr"><is><t>مرجع الفاتورة</t></is></c></row></sheetData></worksheet>`,
    zip: new JSZip(),
    visiblePath: 'xl/worksheets/sheet2.xml',
    ...overrides,
  };
}

describe("buildRowXml — كتابة كل قيمة تحت عمودها الفعلي في القالب", () => {
  it("يكتب القيم تحت الأعمدة الفعلية المطابقة، ويترك الأعمدة غير المطابَقة فارغة بالنمط الأصلي", () => {
    const tpl = baseTemplate();
    const xml = buildRowXml(3, { A: 'INV-1', C: 'C-1', N: 'SKU-1' }, tpl);
    expect(xml).toContain('<c r="A3" s="5" t="inlineStr"><is><t>INV-1</t></is></c>');
    expect(xml).toContain('<c r="K3" s="2" t="inlineStr"><is><t>SKU-1</t></is></c>');
    // العمود B (غير مربوط بأي مفتاح منطقي هنا) يُكتب فارغًا بنمطه الافتراضي '0'
    expect(xml).toContain('<c r="B3" s="0"/>');
  });

  it("قيمة فارغة تُكتب كخلية بلا محتوى (<c .../>) لا كنص فاضي", () => {
    const tpl = baseTemplate();
    const xml = buildRowXml(3, { A: '', C: 'C-1' }, tpl);
    expect(xml).toContain('<c r="A3" s="5"/>');
  });

  it("يهرب أحرف XML الخاصة داخل القيمة (escapeXml)", () => {
    const tpl = baseTemplate();
    const xml = buildRowXml(3, { A: 'A & B < C' }, tpl);
    expect(xml).toContain('A &amp; B &lt; C');
  });
});

describe("generateFinalXlsx — تلاعب XML خام (لا SheetJS للكتابة)", () => {
  it("يحتفظ بصفوف القالب حتى صف العناوين ثم يكتب صفوف البيانات بعده مباشرة", async () => {
    const tpl = baseTemplate();
    tpl.zip.file('xl/worksheets/sheet2.xml', tpl.sheet2Xml);
    const rows = [createRow(1, { A: 'INV-1', C: 'C-1', N: 'SKU-1' })];
    const blob = await generateFinalXlsx(rows, tpl);
    expect(blob).toBeTruthy();
    const outZip = await JSZip.loadAsync(await blob.arrayBuffer());
    const newSheet2 = await outZip.file('xl/worksheets/sheet2.xml').async('string');
    expect(newSheet2).toContain('مرجع الفاتورة'); // صف العناوين المحفوظ حرفيًا
    expect(newSheet2).toContain('<row r="3"'); // صف البيانات الجديد يبدأ بعد صف العناوين (headerRow=2)
    expect(newSheet2).toMatch(/<dimension ref="A1:[A-Z]+3"\s*\/>/);
  });

  it("يستخدم compressHeaderFields قبل التصدير (تكرار متطابق لبيانات الرأس عبر صفوف نفس المرجع)", async () => {
    const tpl = baseTemplate();
    tpl.sheet2Xml = `<worksheet><sheetData><row r="1"></row><row r="2"></row></sheetData><dimension ref="A1:A1"/></worksheet>`;
    tpl.zip.file('xl/worksheets/sheet2.xml', tpl.sheet2Xml);
    const rows = [
      createRow(1, { A: 'INV-1', C: 'C-1' }),
      createRow(2, { A: 'INV-1', C: '' }),
    ];
    const blob = await generateFinalXlsx(rows, tpl);
    const outZip = await JSZip.loadAsync(await blob.arrayBuffer());
    const newSheet2 = await outZip.file('xl/worksheets/sheet2.xml').async('string');
    // الصف الثاني (r=4) يجب أن يحمل نفس C-1 بعد الضغط، لا فارغًا
    expect(newSheet2).toContain('<c r="C4" s="0" t="inlineStr"><is><t>C-1</t></is></c>');
  });
});

describe("triggerXlsxDownload", () => {
  it("يعيد {url, filename} صالحين للاستخدام كرابط تحميل، والاسم يحوي التاريخ الحالي", () => {
    const blob = new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const { url, filename } = triggerXlsxDownload(blob, '_valid');
    expect(url).toMatch(/^blob:/);
    expect(filename).toContain('qoyod_import_ready_valid_');
    expect(filename.endsWith('.xlsx')).toBe(true);
    URL.revokeObjectURL(url);
  });
});
