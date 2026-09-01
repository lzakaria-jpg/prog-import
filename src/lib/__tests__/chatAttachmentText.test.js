// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractAttachmentText } from "../chatAttachmentText";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// يبني File من مسار حقيقي على القرص - نفس ملف allume_raw.xls الحقيقي (BIFF/OLE2
// ثنائي، لا zip) المستخدم في اختبارات chartOrganizerAgent، لأنه بالضبط نوع
// الملف الذي فشل الشات العام سابقاً بإرساله كـ bytes خام لـGemini بدل قراءته.
function loadFile(fixtureName, mimeType) {
  const buf = fs.readFileSync(path.join(__dirname, "fixtures", fixtureName));
  return new File([buf], fixtureName, { type: mimeType });
}

describe("extractAttachmentText", () => {
  it("يستخرج صفوف حقيقية من ملف .xls ثنائي (BIFF/OLE2) بلا أي خطأ", async () => {
    const file = loadFile("allume_raw.xls", "application/vnd.ms-excel");
    const text = await extractAttachmentText(file);
    expect(text).toBeTruthy();
    expect(text).not.toMatch(/zip file|jszip|central directory/i); // الخطأ الذي كان يصل للمستخدم فعلياً
    expect(text).toContain("allume_raw.xls");
    expect(text).toMatch(/acc_code|الأصـ/); // من رؤوس/بيانات الملف الفعلية
  });

  it("يستخرج صفوف من .xlsx حديث أيضاً", async () => {
    const file = loadFile("allume_reference_v2.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const text = await extractAttachmentText(file);
    expect(text).toBeTruthy();
    expect(text).toContain("allume_reference_v2.xlsx");
  });

  it("يستخرج نص CSV صريحاً كجدول مقروء", async () => {
    const csv = "code,name,debit,credit\n101,نقدية,100,0\n201,بنك,0,50\n";
    const file = new File([csv], "sample.csv", { type: "text/csv" });
    const text = await extractAttachmentText(file);
    expect(text).toContain("sample.csv");
    expect(text).toContain("نقدية");
    expect(text).toContain("101 | نقدية | 100 | 0");
  });

  it("يستخرج نص .txt كما هو", async () => {
    const file = new File(["ملاحظة نصية بسيطة للتجربة"], "note.txt", { type: "text/plain" });
    const text = await extractAttachmentText(file);
    expect(text).toContain("note.txt");
    expect(text).toContain("ملاحظة نصية بسيطة للتجربة");
  });

  it("يرجع null للصور - تبقى تُرسَل كـ inlineData multimodal كما هي", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });
    const text = await extractAttachmentText(file);
    expect(text).toBeNull();
  });

  it("لا يرمي أبداً على ملف تالف فعلياً (zip signature مقطوعة) - يرجع رسالة عربية واضحة", async () => {
    // توقيع ZIP صحيح (PK\x03\x04) لكن محتوى مقطوع/تالف بعده - هذا فعلياً يجعل
    // XLSX.read يرمي خطأ حقيقياً (خلافاً لبايتات عشوائية صغيرة يتجاهلها SheetJS بصمت)
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const file = new File([corrupt], "corrupt.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const text = await extractAttachmentText(file);
    expect(text).toBeTruthy();
    expect(text).toContain("تعذّرت قراءة محتوى ملف");
    expect(text).toContain("corrupt.xlsx");
  });

  it("يرجع null لصيغة غير مغطاة (مثل .doc القديم) - يبقى مسار inlineData الاحتياطي", async () => {
    const file = new File(["x"], "old.doc", { type: "application/msword" });
    const text = await extractAttachmentText(file);
    expect(text).toBeNull();
  });
});
