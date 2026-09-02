// @vitest-environment jsdom
//
// خطأان جوهريان حقيقيان شهدهما المستخدم فعلياً مع ملف قيود حقيقي (157,027 صفاً،
// رأسه: رقم القيد | التاريخ | البيان | رمز الحساب | مدين | دائن):
//
// 1) "Maximum call stack size exceeded" فعلياً عند رفع الملف — السبب: allRows.push(...rows)
//    بـreadWorkbookRows يتجاوز حد عدد معطيات نداء الدالة الواحد بمحرك V8 (~65,000+) مع
//    ملفات بعشرات آلاف الصفوف. الإصلاح: حلقة .push بسيطة بلا أي spread.
// 2) حتى بعد إصلاح (1)، الملف كان يُجمَّع بالكامل في "قيد واحد فقط" بدل آلاف القيود
//    الصحيحة المنفصلة — السبب: parseTemplateSchema (المخطط A) كان يتعرّف فقط على اسم
//    العمود "تسلسل القيد" لعمود رقم القيد، بينما findHeaderRowIndex (الذي يختار هذا
//    المخطط أصلاً) يقبل أيضًا "رقم القيد" كمرشح صالح — فيختار المخطط لملف حقيقي
//    عنوانه "رقم القيد"، ثم يفشل استخراج العمود بصمت (يبقى -1)، فتُقرأ كل الصفوف بلا
//    رقم قيد إطلاقًا فتُجمَّع في قيد واحد. نفس الشيء لعمود "البيان" (لم يكن معروفاً،
//    فقط "وصف القيد"). الإصلاح: توسيع المرادفات لتطابق ما يقبله findHeaderRowIndex.
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  readWorkbookRows, fixWorksheetRange, parseEntriesFile, guessEntriesColumnMapping, parseEntriesFileWithMapping, normalizeDateGuess,
  parseNameRefFile, applyAutoContactRules, findAccountCodesByExactName, findSystemAccountCodes,
} from "../excelCore.js";

function buildXlsxFile(aoa, filename = "test.xlsx") {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new File([buf], filename, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("readWorkbookRows — بلا انهيار مع ملفات ضخمة (عشرات/مئات آلاف الصفوف)", () => {
  it("ملف بعدد صفوف يتجاوز بوضوح حد معطيات نداء الدالة بـV8 (100,000 صف) يُقرأ بلا رمي أي خطأ", async () => {
    const N = 100000;
    const aoa = [["A", "B"]];
    for (let i = 0; i < N; i++) aoa.push([String(i), "x"]);
    const file = buildXlsxFile(aoa, "huge.xlsx");
    const rows = await readWorkbookRows(file);
    // +1 للعنوان
    expect(rows.length).toBe(N + 1);
    expect(rows[1]).toEqual(["0", "x"]);
    expect(rows[N]).toEqual([String(N - 1), "x"]);
  }, 30000);

  it("ملف صغير عادي: لا تغيير بالسلوك (نفس المحتوى بالضبط)", async () => {
    const file = buildXlsxFile([["الرمز", "الاسم"], ["1", "الأصول"], ["2", "الالتزامات"]]);
    const rows = await readWorkbookRows(file);
    expect(rows).toEqual([["الرمز", "الاسم"], ["1", "الأصول"], ["2", "الالتزامات"]]);
  });
});

describe("fixWorksheetRange — متوافقة مع نمطي القراءة (dense والمتفرّق)", () => {
  it("نمط dense (Array.isArray(ws[0])): تُحسَب !ref من فهارس الصفوف/الأعمدة مباشرة", () => {
    const ws = { 0: [{ v: "a" }, { v: "b" }], 2: [{ v: "c" }] }; // صف 1 مفقود عمداً (شائع بملفات حقيقية)
    const fixed = fixWorksheetRange(ws);
    expect(fixed["!ref"]).toBe(XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 2, c: 1 } }));
  });

  it("النمط المتفرّق الأصلي (كل خلية مفتاح 'A1' مستقل): يبقى كما كان بلا أي تغيير سلوك", () => {
    const ws = { A1: { v: "a" }, B1: { v: "b" }, A3: { v: "c" } };
    const fixed = fixWorksheetRange(ws);
    expect(fixed["!ref"]).toBe(XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 2, c: 1 } }));
  });
});

describe("parseEntriesFile — مرادفات عمود 'رقم القيد' و'البيان' (المخطط A)", () => {
  it("رأس 'رقم القيد' (لا 'تسلسل القيد') و'البيان' (لا 'وصف القيد') يُقسِّمان الصفوف لقيود منفصلة صحيحة", () => {
    const rows = [
      ["رقم القيد", "التاريخ", "البيان", "رمز الحساب", "مدين", "دائن"],
      ["1", "05/01/2025", "فاتورة مبيعات", "11301", "1000", "0"],
      ["1", "", "", "411017", "0", "1000"],
      ["2", "06/01/2025", "سند قبض", "11301", "500", "0"],
      ["2", "", "", "412000", "0", "500"],
    ];
    const groups = parseEntriesFile(rows);
    expect(groups.length).toBe(2);
    expect(groups[0].seq).toBe("1");
    expect(groups[0].desc).toBe("فاتورة مبيعات");
    expect(groups[0].rows.length).toBe(2);
    expect(groups[1].seq).toBe("2");
    expect(groups[1].desc).toBe("سند قبض");
    expect(groups[1].rows.length).toBe(2);
  });

  it("الصيغة الأصلية 'تسلسل القيد'/'وصف القيد' تبقى تعمل تماماً كما كانت (بلا أي كسر توافق خلفي)", () => {
    const rows = [
      ["تسلسل القيد", "التاريخ", "وصف القيد", "رمز الحساب", "مدين", "دائن"],
      ["1", "05/01/2025", "فاتورة مبيعات", "11301", "1000", "0"],
      ["1", "", "", "411017", "0", "1000"],
    ];
    const groups = parseEntriesFile(rows);
    expect(groups.length).toBe(1);
    expect(groups[0].seq).toBe("1");
    expect(groups[0].desc).toBe("فاتورة مبيعات");
  });
});

// خطأ جوهري حقيقي ثالث شهده المستخدم: ملف عميل حقيقي (344655 قيود.xls) رأسه
// القصير المعتاد "تسلسل القيود" | "تاريخ" | "الحساب" | "مدين" | "دائن" | "الوصف"
// — قُرئ المدين/الدائن بشكل صحيح 100% (تطابق حرفي) لكن الرمز والتاريخ والوصف
// طلعوا فارغين تمامًا بصمت لكل القيود (كل الحسابات "—"، كل التواريخ "بدون
// تاريخ"، كل الأوصاف "بدون وصف"). السبب: colIndex كانت مطابقة اتجاه واحد فقط
// (خلية_الرأس.includes(المرشح))، فتفشل بالضبط لما يكون عنوان العمود الحقيقي
// أقصر من اسم المرشح المتوقع ("تاريخ" لا يحوي "التاريخ"، "الحساب" لا يحوي "رمز
// الحساب"، "الوصف" لا يحوي "وصف القيد"/"البيان"). الإصلاح الجذري: مطابقة
// باتجاهين + إضافة "الوصف" كمرادف صريح (المرادف الوحيد الذي لا يحله اتجاها
// المطابقة معًا، لاختلاف الكلمة جذريًا عن "وصف القيد"/"البيان").
describe("parseEntriesFile — رؤوس أعمدة قصيرة حقيقية (ملف عميل: تسلسل القيود|تاريخ|الحساب|مدين|دائن|الوصف)", () => {
  const rows = [
    ["تسلسل القيود", "تاريخ", "الحساب", "مدين", "دائن", "الوصف"],
    ["00001", "31/10/2025", "520214", "3000", "0", "رسوم تاسيس حساب تمرن"],
    ["00001", "31/10/2025", "210201", "0", "3000", "رسوم تاسيس حساب تمرن"],
    ["00002", "01/11/2025", "110601", "5000", "0", "شراء معدات"],
    ["00002", "01/11/2025", "210101", "0", "5000", "شراء معدات"],
  ];

  it("الرمز والتاريخ والوصف كلها تُقرأ بشكل صحيح (لا تبقى فارغة رغم قصر أسماء الأعمدة)", () => {
    const groups = parseEntriesFile(rows);
    expect(groups.length).toBe(2);
    expect(groups[0].seq).toBe("00001");
    expect(groups[0].date).toBe("31/10/2025");
    expect(groups[0].desc).toBe("رسوم تاسيس حساب تمرن");
    expect(groups[0].rows[0].code).toBe("520214");
    expect(groups[0].rows[0].debit).toBe(3000);
    expect(groups[0].rows[1].code).toBe("210201");
    expect(groups[0].rows[1].credit).toBe(3000);
    expect(groups[1].seq).toBe("00002");
    expect(groups[1].rows[0].code).toBe("110601");
  });

  it("guessEntriesColumnMapping يخمّن كل الأعمدة الستة بشكل صحيح لنفس الملف", () => {
    const mapping = guessEntriesColumnMapping(rows);
    expect(mapping.headerRowIndex).toBe(0);
    expect(mapping.seq).toBe(0);
    expect(mapping.date).toBe(1);
    expect(mapping.code).toBe(2);
    expect(mapping.debit).toBe(3);
    expect(mapping.credit).toBe(4);
    expect(mapping.desc).toBe(5);
  });

  it("parseEntriesFileWithMapping (لوحة تحديد الأعمدة يدويًا) تنتج نفس النتيجة بالضبط عند تمرير تخطيط صحيح يدويًا", () => {
    const mapping = { seq: 0, date: 1, code: 2, debit: 3, credit: 4, desc: 5 };
    const groups = parseEntriesFileWithMapping(rows, 0, mapping);
    expect(groups.length).toBe(2);
    expect(groups[0].rows[0].code).toBe("520214");
    expect(groups[0].date).toBe("31/10/2025");
    expect(groups[0].desc).toBe("رسوم تاسيس حساب تمرن");
  });

  it("لا رجوع للخلف: الرؤوس الطويلة الأصلية ('رمز الحساب'/'التاريخ'/'وصف القيد') ما زالت تُطابَق بلا أي تغيير بالنتيجة", () => {
    const longRows = [
      ["تسلسل القيد", "التاريخ", "وصف القيد", "رمز الحساب", "مدين", "دائن"],
      ["1", "05/01/2025", "فاتورة مبيعات", "11301", "1000", "0"],
      ["1", "", "", "411017", "0", "1000"],
    ];
    const groups = parseEntriesFile(longRows);
    expect(groups[0].rows[0].code).toBe("11301");
    expect(groups[0].date).toBe("05/01/2025");
    expect(groups[0].desc).toBe("فاتورة مبيعات");
  });
});

// خطأ جوهري رابع، حقيقي هو أيضًا، بنفس الملف: SheetJS يُخرِج تاريخ هذا الملف
// بالضبط بصيغة "M/D/YY" (شهر/يوم/سنة برقمين، مثال حقيقي من الملف: "10/31/25"
// لتاريخ 31 أكتوبر 2025) — صيغة لم تكن مغطاة إطلاقًا فتُترَك كما هي حرفيًا
// (لا تطابق dd/mm/yyyy) فيفشل كل قيد بخطأ "تاريخ مفقود أو غير مطابق" رغم أن
// التاريخ صحيح وموجود فعليًا.
describe("normalizeDateGuess — صيغة M/D/YY بسنة رقمين (ملف عميل حقيقي)", () => {
  it("'10/31/25' (شهر=10، يوم=31، سنة رقمين) → '31/10/2025' — اليوم>12 يحسم الترتيب رغم وروده أولاً بالملف كشهر", () => {
    expect(normalizeDateGuess("10/31/25")).toBe("31/10/2025");
  });
  it("كل تواريخ الملف الحقيقي (نهايات أشهر متتالية) تُطابَق بشكل صحيح", () => {
    expect(normalizeDateGuess("11/30/25")).toBe("30/11/2025");
    expect(normalizeDateGuess("12/14/25")).toBe("14/12/2025");
    expect(normalizeDateGuess("1/31/26")).toBe("31/01/2026");
    expect(normalizeDateGuess("2/28/26")).toBe("28/02/2026");
  });
  it("سنة رقمين ≥70 تُفسَّر كـ19xx (قاعدة Excel القياسية)", () => {
    expect(normalizeDateGuess("6/15/95")).toBe("15/06/1995");
  });
  it("التنسيقات الأخرى الموجودة مسبقًا (ISO وd/m/yyyy بأربعة أرقام) تبقى بلا أي تغيير", () => {
    expect(normalizeDateGuess("2025-10-31")).toBe("31/10/2025");
    expect(normalizeDateGuess("05/01/2025")).toBe("05/01/2025");
  });
});

// خطأ جوهري خامس، حقيقي، شاهده المستخدم بملف تصدير حقيقي: عمود "نوع الحساب"
// طلع فيه رمز الحساب مكرراً (نفس قيمة عمود "رمز الحساب") بدل أحد القيم الثلاث
// المسموحة بقائمة قيود المنسدلة (حسابات دفتر الاستاذ / دفعة من العميل / دفعة
// للمورد) — السبب: Schema A تقرأ "نوع الحساب" حرفياً من أي عمود بالملف المصدر
// يطابق هذا الاسم بلا أي تحقق من القيمة. الإصلاح: أي قيمة مستخرجة لا تُطابق
// إحدى الثلاث بالضبط تُستبدَل بالقيمة الافتراضية الآمنة.
describe("parseEntriesFile — عمود 'نوع الحساب' (المخطط A): قيمة غير صالحة تُستبدَل بالافتراضي الآمن", () => {
  it("عمود 'نوع الحساب' بالملف المصدر يحمل كود الحساب خطأً → يُستبدَل بـ'حسابات دفتر الاستاذ'", () => {
    const rows = [
      ["تسلسل القيد", "التاريخ", "وصف القيد", "نوع الحساب", "رمز الحساب", "مدين", "دائن"],
      ["1", "05/01/2025", "فاتورة مبيعات", "520214", "520214", "1000", "0"],
      ["1", "", "", "210201", "210201", "0", "1000"],
    ];
    const groups = parseEntriesFile(rows);
    expect(groups.length).toBe(1);
    expect(groups[0].rows[0].accType).toBe("حسابات دفتر الاستاذ");
    expect(groups[0].rows[1].accType).toBe("حسابات دفتر الاستاذ");
  });

  it("قيمة صحيحة فعلياً من الثلاث المسموحة تبقى كما هي بلا استبدال", () => {
    const rows = [
      ["تسلسل القيد", "التاريخ", "وصف القيد", "نوع الحساب", "رمز الحساب", "مدين", "دائن"],
      ["1", "05/01/2025", "دفعة من عميل", "دفعة من العميل", "110601", "1000", "0"],
      ["1", "", "", "حسابات دفتر الاستاذ", "410101", "0", "1000"],
    ];
    const groups = parseEntriesFile(rows);
    expect(groups[0].rows[0].accType).toBe("دفعة من العميل");
    expect(groups[0].rows[1].accType).toBe("حسابات دفتر الاستاذ");
  });
});

describe("parseNameRefFile — ملف مرجعي اختياري (اسم عميل/مورد + رقم مرجعي)", () => {
  it("يستخرج اسم + رقم مرجعي، ويتجاهل الصفوف الناقصة", () => {
    const rows = [
      ["اسم العميل", "الرقم المرجعي"],
      ["مؤسسة الأخوات الثلاث", "1005"],
      ["", "1006"], // بلا اسم — يُتجاهَل
      ["شركة النور", ""], // بلا رقم مرجعي — يُتجاهَل
      ["مصنع الأمل", "1007"],
    ];
    const list = parseNameRefFile(rows);
    expect(list).toEqual([
      { name: "مؤسسة الأخوات الثلاث", ref: "1005" },
      { name: "مصنع الأمل", ref: "1007" },
    ]);
  });

  it("ملف بلا عمودي اسم/رقم مرجعي معروفين يُرجع مصفوفة فارغة بدل رمي خطأ", () => {
    expect(parseNameRefFile([["عمود أ", "عمود ب"], ["1", "2"]])).toEqual([]);
  });
});

describe("findAccountCodesByExactName — تحديد حساب افتراضي مقفل نظاميًا عبر اسمه", () => {
  const chart = [
    { code: "120101", name: "المدينون", type: "" },
    { code: "210201", name: "ضريبة القيمة المضافة المستحقة", type: "" },
    { code: "210301", name: "الدائنون", type: "" },
    { code: "520202", name: "الإيجارات", type: "" },
  ];
  it("يطابق الاسم تماماً (بعد التطبيع) بغض النظر عن الكود", () => {
    expect(findAccountCodesByExactName(chart, "المدينون")).toEqual(["120101"]);
    expect(findAccountCodesByExactName(chart, "الدائنون")).toEqual(["210301"]);
    expect(findAccountCodesByExactName(chart, "ضريبة القيمة المضافة المستحقة")).toEqual(["210201"]);
  });
  it("لا يطابق اسماً مشابهاً جزئياً فقط (تطابق تام لا احتواء)", () => {
    expect(findAccountCodesByExactName(chart, "ضريبة القيمة المضافة")).toEqual([]);
  });
});

/*
 * [إصلاح جذري] خطأ حقيقي شاهده المستخدم: رفع شجرة حسابات حقيقية (129 حساباً)
 * وملف "دفتر القيود" الحقيقي معاً، وبقيت خانة "جهة اتصال/ضريبة/موظف" فارغة لكل
 * سطور حساب الضريبة (210201) رغم وجود الحساب فعلياً بالشجرة بنفس الكود — السبب:
 * findAccountCodesByExactName يتطلب تطابقاً حرفياً تاماً للاسم بعد التطبيع، بينما
 * الاسم المعروض الحقيقي بشجرة هذا العميل لحساب 210201 لم يطابق حرفياً الاسم
 * النظامي الكامل "ضريبة القيمة المضافة المستحقة" (فرق نص حقيقي — اسم مختصر أو
 * مع إضافة، حسب شجرة كل عميل). الإصلاح: findSystemAccountCodes تجرّب التطابق
 * الحرفي أولاً، وإن لم يوجد تطابق تلجأ لنفس دالة التشابه الضبابي المستخدمة أصلاً
 * باقتراحات الترحيل (accountNameSimilarity) بعتبة ثقة مرتفعة (0.85) — تطابق كامل
 * أو احتواء نص أحدهما بالآخر — تكفي عملياً لتفادي مطابقة حساب مختلف تماماً خطأً.
 */
describe("findSystemAccountCodes — نفس المطابقة الحرفية + مطابقة ضبابية بثقة عالية كخط دفاع ثانٍ", () => {
  it("تطابق حرفي تام: نفس نتيجة findAccountCodesByExactName", () => {
    const chart = [{ code: "210201", name: "ضريبة القيمة المضافة المستحقة", type: "" }];
    expect(findSystemAccountCodes(chart, "ضريبة القيمة المضافة المستحقة")).toEqual(["210201"]);
  });

  it("[الخطأ الحقيقي] اسم الشجرة مختصر (بلا 'المستحقة') — يطابق ضبابياً عبر الاحتواء", () => {
    const chart = [{ code: "210201", name: "ضريبة القيمة المضافة", type: "" }];
    expect(findSystemAccountCodes(chart, "ضريبة القيمة المضافة المستحقة")).toEqual(["210201"]);
  });

  it("اسم الشجرة بإضافة لاحقة (مثال: تخصيص فرع/نوع) — يطابق ضبابياً عبر الاحتواء", () => {
    const chart = [{ code: "210201", name: "ضريبة القيمة المضافة المستحقة (مبيعات)", type: "" }];
    expect(findSystemAccountCodes(chart, "ضريبة القيمة المضافة المستحقة")).toEqual(["210201"]);
  });

  it("المدينون/الدائنون بإضافة كلمة وصفية — يطابقان ضبابياً أيضاً", () => {
    const chart = [
      { code: "120101", name: "حساب المدينون التجاري", type: "" },
      { code: "210301", name: "الدائنون - تجاري", type: "" },
    ];
    expect(findSystemAccountCodes(chart, "المدينون")).toEqual(["120101"]);
    expect(findSystemAccountCodes(chart, "الدائنون")).toEqual(["210301"]);
  });

  it("لا مطابقة إطلاقاً لحساب مختلف تماماً (لا تخمين خاطئ حتى بالمطابقة الضبابية)", () => {
    const chart = [{ code: "555", name: "مصروفات الكهرباء والماء", type: "" }];
    expect(findSystemAccountCodes(chart, "ضريبة القيمة المضافة المستحقة")).toEqual([]);
    expect(findSystemAccountCodes([{ code: "777", name: "إيرادات متنوعة" }], "المدينون")).toEqual([]);
  });
});

describe("applyAutoContactRules — تعبية 'جهة اتصال/ضريبة/موظف' تلقائياً", () => {
  const chart = [
    { code: "120101", name: "المدينون", type: "" },
    { code: "210301", name: "الدائنون", type: "" },
    { code: "210201", name: "ضريبة القيمة المضافة المستحقة", type: "" },
    { code: "520202", name: "الإيجارات", type: "" },
  ];

  function entry(rows) {
    return { seq: "1", date: "05/01/2025", desc: "قيد", rows: rows.map((r, i) => ({ _rowIndex: i, contact: "", comment: "", ...r })) };
  }

  it("حساب الضريبة المستحق: مدين/دائن > 0 → رمز 15% (افتراضي '1')؛ صفر بالطرفين → رمز الصفرية (افتراضي '2')", () => {
    const entries = [entry([
      { code: "210201", debit: 450, credit: null },
      { code: "210201", debit: 0, credit: 0 },
      { code: "520202", debit: 0, credit: 450 },
    ])];
    const out = applyAutoContactRules(entries, chart, {});
    expect(out[0].rows[0].contact).toBe("1");
    expect(out[0].rows[1].contact).toBe("2");
    expect(out[0].rows[2].contact).toBe(""); // ليس حساب ضريبة — لا يُلمَس
  });

  it("رموز الضريبة قابلة للتخصيص (vat15Code/vatZeroCode)", () => {
    const entries = [entry([{ code: "210201", debit: 450, credit: null }])];
    const out = applyAutoContactRules(entries, chart, { vat15Code: "7", vatZeroCode: "9" });
    expect(out[0].rows[0].contact).toBe("7");
  });

  it("حساب المدينون: يطابق اسم العميل من عمود 'contact' مع ملف العملاء المرجعي ويستبدله برقمه المرجعي", () => {
    const entries = [entry([{ code: "120101", debit: 1000, credit: null, contact: "مؤسسة الأخوات الثلاث" }])];
    const out = applyAutoContactRules(entries, chart, { customersRef: [{ name: "مؤسسة الأخوات الثلاث", ref: "1005" }] });
    expect(out[0].rows[0].contact).toBe("1005");
    expect(out[0].rows[0]._autoRef).toBe(true);
  });

  it("حساب المدينون بلا عمود contact: يطابق من التفصيل/التعليق كبديل", () => {
    const entries = [entry([{ code: "120101", debit: 1000, credit: null, comment: "مصنع الأمل" }])];
    const out = applyAutoContactRules(entries, chart, { customersRef: [{ name: "مصنع الأمل", ref: "2010" }] });
    expect(out[0].rows[0].contact).toBe("2010");
  });

  it("حساب الدائنون: يُطابَق مع ملف الموردين لا ملف العملاء", () => {
    const entries = [entry([{ code: "210301", debit: null, credit: 500, contact: "شركة النور للمقاولات" }])];
    const out = applyAutoContactRules(entries, chart, {
      customersRef: [{ name: "شركة النور للمقاولات", ref: "9999" }], // عميل بنفس الاسم تقريباً — لا يجب استخدامه
      suppliersRef: [{ name: "شركة النور للمقاولات", ref: "3300" }],
    });
    expect(out[0].rows[0].contact).toBe("3300");
  });

  it("لا مطابقة موثوقة ولا ملف مرجعي: تبقى الخانة كما هي (بلا تخمين خاطئ)", () => {
    const entries = [entry([{ code: "120101", debit: 1000, credit: null, contact: "عميل غير معروف تماماً" }])];
    const out = applyAutoContactRules(entries, chart, { customersRef: [{ name: "مؤسسة الأخوات الثلاث", ref: "1005" }] });
    expect(out[0].rows[0].contact).toBe("عميل غير معروف تماماً");
    expect(out[0].rows[0]._autoRef).toBeUndefined();
  });

  it("سطر عدّله المستخدم يدوياً (_userEdited) لا يُلمَس إطلاقاً حتى لو طابق قاعدة الضريبة أو المدينون", () => {
    const entries = [entry([
      { code: "210201", debit: 450, credit: null, contact: "قيمة يدوية", _userEdited: true },
      { code: "120101", debit: 1000, credit: null, contact: "قيمة يدوية أخرى", _userEdited: true },
    ])];
    const out = applyAutoContactRules(entries, chart, { customersRef: [{ name: "قيمة يدوية أخرى", ref: "1" }] });
    expect(out[0].rows[0].contact).toBe("قيمة يدوية");
    expect(out[0].rows[1].contact).toBe("قيمة يدوية أخرى");
  });

  it("إعادة التشغيل بعد تغيّر الملف المرجعي: تبحث بالاسم الأصلي المحفوظ (_refCandidate) لا بالرقم المرجعي الحالي", () => {
    const entries = [entry([{ code: "120101", debit: 1000, credit: null, contact: "مؤسسة الأخوات الثلاث" }])];
    const pass1 = applyAutoContactRules(entries, chart, { customersRef: [{ name: "مؤسسة الأخوات الثلاث", ref: "1005" }] });
    expect(pass1[0].rows[0].contact).toBe("1005");
    // الملف المرجعي تغيّر (رقم مرجعي مختلف لنفس العميل) — يجب أن يُعاد التطابق بالاسم المحفوظ لا بـ"1005"
    const pass2 = applyAutoContactRules(pass1, chart, { customersRef: [{ name: "مؤسسة الأخوات الثلاث", ref: "8800" }] });
    expect(pass2[0].rows[0].contact).toBe("8800");
  });

  it("[الخطأ الحقيقي] اسم حساب الضريبة بالشجرة مختصر (بلا 'المستحقة'): يجب أن تُعبَّى الخانة رغم ذلك", () => {
    const chartShortName = [
      { code: "120101", name: "المدينون", type: "" },
      { code: "210301", name: "الدائنون", type: "" },
      { code: "210201", name: "ضريبة القيمة المضافة", type: "" }, // اسم مختصر حقيقي، لا يطابق الاسم النظامي الكامل حرفياً
    ];
    const entries = [entry([{ code: "210201", debit: 450, credit: null }])];
    const out = applyAutoContactRules(entries, chartShortName, {});
    expect(out[0].rows[0].contact).toBe("1");
  });

  it("بلا حسابات مدينون/دائنون/ضريبة مطابقة بالشجرة أصلاً: يُرجع نفس entries بلا أي تغيير (نفس المرجع)", () => {
    const plainChart = [{ code: "520202", name: "الإيجارات", type: "" }];
    const entries = [entry([{ code: "520202", debit: 100, credit: null }])];
    const out = applyAutoContactRules(entries, plainChart, {});
    expect(out).toBe(entries);
  });
});
