// خطأ جوهري حقيقي شهده المستخدم فعلياً بالمتصفح: نفس ملف العميل الذي نجح بكل
// اختبارات chartOrganizerAgent.columnSynonyms.test.js (عبر vitest/Node) فشل فعلياً
// عند تجربته من المستخدم بالموقع الحقيقي (Cloudflare)، مع ظهور رؤوس الأعمدة كحروف
// مشوَّهة تماماً: "ÇáÑãÒ، acc_lati، ÇáÇÓã" بدل "الرمز، acc_lati، الاسم".
//
// السبب الجوهري: مكتبة xlsx لها بنيتان — بنية Node (xlsx.js) تُحمِّل جدول الترميزات
// القديمة (codepages، مثل Windows-1256 العربي المستخدَم داخل ملفات .xls القديمة)
// تلقائياً بنفسها. بنية المتصفح (xlsx.mjs، وهي ما يستخدمه تطبيق الموقع الفعلي عبر
// Vite) لا تُحمِّله تلقائياً إطلاقاً — تحتاج استدعاء XLSX.set_cptable() يدوياً، وإلا
// تُقرَأ أي نصوص مُشفَّرة بغير UTF-16/UTF-8 بحروف مشوَّهة. لهذا بالضبط نجحت اختبارات
// Node (تلقائياً تحمّل الترميز) بينما فشل المتصفح فعلياً (لا تحميل تلقائي) — خطأ لم
// يكن بالإمكان اكتشافه إلا بمحاكاة بنية xlsx.mjs الحقيقية مباشرة كما بهذا الملف.
//
// الإصلاح: src/lib/xlsxCodepage.js يستدعي XLSX.set_cptable() مرة واحدة من
// main.jsx (أول نقطة بالتطبيق) — يكفي لتصحيح كل قراءات XLSX.read بكل الأدوات لأن
// المرجع الداخلي لجدول الترميزات مُشترَك بين كل استيرادات "xlsx" بالتطبيق الواحد.
// هذا الاختبار يحاكي بنية xlsx.mjs (بنية المتصفح/Vite الحقيقية) مباشرة بمسارها
// الصريح، لا بنية Node التلقائية، ليكتشف هذا الصنف من الأخطاء مستقبلاً.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx/xlsx.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadFixtureBuffer(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name));
}

function firstRows(buf, n = 3) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(0, n);
}

describe("بنية xlsx.mjs (المتصفح) — قراءة ملفات .xls عربية قديمة الترميز (Windows-1256)", () => {
  it("بلا تسجيل جدول الترميزات: النص العربي يظهر مشوَّهاً (mojibake) — هذا هو الخطأ الحقيقي الذي شهده المستخدم", () => {
    const buf = loadFixtureBuffer("customer_arabic_headers_no_level.xls");
    const [header] = firstRows(buf, 1);
    // بالضبط نفس الحروف المشوَّهة التي ظهرت للمستخدم فعلياً بالمحادثة
    expect(header[0]).toBe("ÇáÑãÒ");
    expect(header[2]).toBe("ÇáÇÓã");
    expect(header[0]).not.toBe("الرمز");
  });

  it("بعد تسجيل جدول الترميزات (نفس ما يفعله src/lib/xlsxCodepage.js من main.jsx): النص العربي يُقرَأ صحيحاً", async () => {
    // نفس التسجيل الذي يقوم به src/lib/xlsxCodepage.js فعلياً — بنفس المسار الصريح
    // لبنية xlsx.mjs المتصفحية، لضمان أن الإصلاح يُختبَر مقابل نفس البنية الحقيقية.
    const cptable = await import("xlsx/dist/cpexcel.full.mjs");
    XLSX.set_cptable(cptable);

    const headerRow = firstRows(loadFixtureBuffer("customer_arabic_headers_no_level.xls"), 1)[0];
    expect(headerRow[0]).toBe("الرمز");
    expect(headerRow[2]).toBe("الاسم");

    const allumeRows = firstRows(loadFixtureBuffer("allume_raw.xls"), 2);
    // اسم الحساب بالعربي بالصف الثاني (acc_arab) يجب أن يُقرَأ نصاً عربياً حقيقياً
    // لا حروفاً مشوَّهة، حتى لو كانت رؤوس الأعمدة نفسها لاتينية (acc_code/acc_arab...)
    expect(allumeRows[1][2]).toContain("الأص");
  });
});
