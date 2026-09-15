import { describe, it, expect } from "vitest";
import { guessEntriesColumnMapping, parseEntriesFileWithMapping, parseEntriesFile } from "../excelCore.js";

/**
 * [إضافة 2026-09-15] المشروع والموقع على مستوى القيد أو مستوى السطر — طلب
 * المستخدم الصريح: ملفات العملاء أحيانًا تحمل عمودين منفصلين لكل منهما
 * (عمود "مستوى القيد" وعمود "مستوى السطر" بعناوين مختلفة)، وأحيانًا عمودًا
 * واحدًا فقط. مؤكَّد بمثال طلب POST /journal_entries حقيقي: inventory_id
 * (الموقع) حقل رسمي على مستوى القيد ذاته وعلى مستوى كل بند معًا.
 */
describe("لوحة تحديد الأعمدة يدويًا — المشروع والموقع", () => {
  it("guessEntriesColumnMapping يكتشف عمودي مشروع منفصلين: أول عمود = مستوى السطر، الثاني = مستوى القيد", () => {
    const rows = [["الرمز", "مدين", "دائن", "مشروع السطر", "مشروع القيد"]];
    const mapping = guessEntriesColumnMapping(rows);
    expect(mapping.projectLine).toBe(3);
    expect(mapping.projectEntry).toBe(4);
  });

  it("guessEntriesColumnMapping يكتشف عمودي موقع منفصلين بنفس الأسلوب", () => {
    const rows = [["الرمز", "مدين", "دائن", "الموقع", "موقع القيد"]];
    const mapping = guessEntriesColumnMapping(rows);
    expect(mapping.locationLine).toBe(3);
    expect(mapping.locationEntry).toBe(4);
  });

  it("عمود واحد فقط لكل من المشروع والموقع: يُخمَّن كمستوى سطر فقط (لا مستوى قيد)", () => {
    const rows = [["الرمز", "مدين", "دائن", "المشروع", "الموقع"]];
    const mapping = guessEntriesColumnMapping(rows);
    expect(mapping.projectLine).toBe(3);
    expect(mapping.projectEntry).toBe(-1);
    expect(mapping.locationLine).toBe(4);
    expect(mapping.locationEntry).toBe(-1);
  });

  it("لا عمود مشروع/موقع بالملف إطلاقًا: -1 للجميع بلا أي خطأ", () => {
    const rows = [["الرمز", "مدين", "دائن"]];
    const mapping = guessEntriesColumnMapping(rows);
    expect(mapping.projectLine).toBe(-1);
    expect(mapping.projectEntry).toBe(-1);
    expect(mapping.locationLine).toBe(-1);
    expect(mapping.locationEntry).toBe(-1);
  });

  it("parseEntriesFileWithMapping يقرأ عمودي المشروع (سطر+قيد) ويشتق افتراضي القيد من عمود القيد أولاً", () => {
    const rows = [
      ["الرمز", "مدين", "دائن", "مشروع السطر", "مشروع القيد"],
      ["11", "100", "", "", "مشروع أ"],
      ["21", "", "100", "مشروع ب", "مشروع أ"],
    ];
    const mapping = { headerRowIndex: 0, code: 0, debit: 1, credit: 2, projectLine: 3, projectEntry: 4 };
    const [entry] = parseEntriesFileWithMapping(rows, 0, mapping);
    expect(entry.project).toBe("مشروع أ"); // افتراضي القيد من عمود "مشروع القيد" نفسه
    expect(entry.rows[0].project).toBe(""); // بلا قيمة خاصة بالسطر - يعتمد على الافتراضي لاحقًا
    expect(entry.rows[1].project).toBe("مشروع ب"); // قيمة خاصة تتجاوز الافتراضي
  });

  it("parseEntriesFileWithMapping بلا عمود مستوى قيد منفصل: يشتق الافتراضي من أول قيمة غير فارغة بعمود مستوى السطر", () => {
    const rows = [
      ["الرمز", "مدين", "دائن", "الموقع"],
      ["11", "100", "", ""],
      ["21", "", "100", "الفرع الرئيسي"],
    ];
    const mapping = { headerRowIndex: 0, code: 0, debit: 1, credit: 2, locationLine: 3 };
    const [entry] = parseEntriesFileWithMapping(rows, 0, mapping);
    expect(entry.location).toBe("الفرع الرئيسي");
    expect(entry.rows[1].location).toBe("الفرع الرئيسي");
  });
});

describe("التعرّف التلقائي (بلا تدخل يدوي) على أعمدة المشروع/الموقع", () => {
  it("قالب الأداة (Schema A - 'تسلسل القيد') يقرأ عمود مشروع واحد كمستوى سطر", () => {
    const rows = [
      ["تسلسل القيد", "التاريخ", "وصف القيد", "رمز الحساب", "مدين", "دائن", "المشروع"],
      ["1", "15/09/2026", "قيد اختباري", "11", "100", "", "مشروع أ"],
      ["1", "15/09/2026", "قيد اختباري", "21", "", "100", ""],
    ];
    const [entry] = parseEntriesFile(rows);
    expect(entry.rows[0].project).toBe("مشروع أ");
    expect(entry.project).toBe("مشروع أ"); // اشتُقّ من أول قيمة غير فارغة بالسطر
  });

  it("قالب الأداة (Schema A) يقرأ عمودي مشروع منفصلين (مستوى قيد ومستوى سطر) معًا", () => {
    const rows = [
      ["تسلسل القيد", "التاريخ", "وصف القيد", "رمز الحساب", "مدين", "دائن", "مشروع السطر", "مشروع القيد"],
      ["1", "15/09/2026", "قيد اختباري", "11", "100", "", "", "مشروع افتراضي"],
      ["1", "15/09/2026", "قيد اختباري", "21", "", "100", "مشروع خاص", "مشروع افتراضي"],
    ];
    const [entry] = parseEntriesFile(rows);
    expect(entry.project).toBe("مشروع افتراضي");
    expect(entry.rows[0].project).toBe("");
    expect(entry.rows[1].project).toBe("مشروع خاص");
  });

  it("جدول عربي مرن (Schema E - 'رقم العملية') يقرأ عمود الموقع تلقائيًا", () => {
    const rows = [
      ["رقم العملية", "تاريخ العملية", "رمز الحساب", "اسم الحساب", "البيان", "مدين", "دائن", "الموقع"],
      ["1", "15/09/2026", "11", "النقدية", "قيد اختباري", "100", "", "الفرع الرئيسي"],
      ["1", "15/09/2026", "21", "الدائنون", "قيد اختباري", "", "100", ""],
    ];
    const [entry] = parseEntriesFile(rows);
    expect(entry.rows[0].location).toBe("الفرع الرئيسي");
    expect(entry.location).toBe("الفرع الرئيسي");
  });

  it("[البلاغ الحي] قالب 'دفتر القيود' مع 4 أعمدة صريحة (F-I): الموقع/المشروع (افتراضي) والموقع/المشروع (خاص بالسطر) — يُكتشَفان تلقائيًا من نص صف الرأس الفرعي المتكرر، بصرف النظر عن أي سطر حمل القيمة فعليًا", () => {
    const rows = [
      ["دفتر القيود"],
      ["ID 2719 جرد المخزون - ( أنشئ بواسطة mohammad zaid elshikhdeeb في 2026-09-10 ) "],
      ["الحساب", "التفصيل", "مدين", "دائن", "التعليقات", "الموقع (افتراضي)", "المشروع (افتراضي)", "موقع (خاص بالسطر)", "مشروع (خاص بالسطر)"],
      ["1106 - المخزون 1", "مشمن", 0, 2265661.95, "", "موقع اختبار الذكاء", "", "", ""],
      ["3201 - أرصدة افتتاحية", "مشمن", 2265661.95, 0, "", "", "احمد مشروع البرج", "", "مشروع خاص بالسطر الثاني"],
      ["المجموع", "", "2,265,661.95", "2,265,661.95", "", "", "", "", ""],
    ];
    const [entry] = parseEntriesFile(rows);
    expect(entry.location).toBe("موقع اختبار الذكاء"); // من عمود "الموقع (افتراضي)"، مهما كان السطر
    expect(entry.project).toBe("احمد مشروع البرج"); // من عمود "المشروع (افتراضي)"
    expect(entry.rows[0].project).toBe(""); // بلا قيمة خاصة بالسطر الأول
    expect(entry.rows[1].project).toBe("مشروع خاص بالسطر الثاني"); // قيمة خاصة بالسطر الثاني تتجاوز الافتراضي
  });

  it("ملف بلا أي عمود مشروع/موقع: project/location تبقى فارغة بلا أي خطأ (سلوك قديم بلا تغيير)", () => {
    const rows = [
      ["تسلسل القيد", "التاريخ", "وصف القيد", "رمز الحساب", "مدين", "دائن"],
      ["1", "15/09/2026", "قيد اختباري", "11", "100", ""],
      ["1", "15/09/2026", "قيد اختباري", "21", "", "100"],
    ];
    const [entry] = parseEntriesFile(rows);
    expect(entry.rows[0].project).toBe("");
    expect(entry.rows[0].location).toBe("");
    expect(entry.project).toBe("");
    expect(entry.location).toBe("");
  });
});
