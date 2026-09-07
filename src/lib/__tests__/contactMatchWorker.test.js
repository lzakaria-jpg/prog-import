import { describe, it, expect } from "vitest";
import { computeContactMatch } from "../contactMatchWorker.js";

describe("computeContactMatch — منطق Worker مطابقة جهة الاتصال (بلا Worker حقيقي)", () => {
  const chartAccounts = [
    { code: "1102", name: "المدينون", type: "" },
    { code: "2101", name: "الدائنون", type: "" },
  ];

  function entry(rows) {
    return { seq: "1", date: "05/01/2025", desc: "قيد", rows: rows.map((r, i) => ({ _rowIndex: i, contact: "", comment: "", ...r })) };
  }

  it("يعيد changed=true ونتيجة مطابقة صحيحة عند وجود مطابقة فعلية", () => {
    const entries = [entry([{ code: "1102", debit: 500, credit: null, detail: "شركة تجريبية" }])];
    const { changed, result } = computeContactMatch({
      entries,
      chartAccounts,
      options: { customersRef: [{ name: "شركة تجريبية", ref: "CUS001" }] },
    });
    expect(changed).toBe(true);
    expect(result[0].rows[0].contact).toBe("CUS001");
  });

  it("يعيد changed=false ونفس مرجع entries حرفيًا لو لم يتغيّر شيء فعليًا (لا مطابقة تنطبق)", () => {
    const entries = [entry([{ code: "999999", debit: 500, credit: null }])];
    const { changed, result } = computeContactMatch({ entries, chartAccounts, options: {} });
    expect(changed).toBe(false);
    // نفس المرجع حرفيًا (===) — هذا بالضبط ما يعتمد عليه self.onmessage لتقرير
    // عدم إرسال result بالـpostMessage (انظر تعليق الملف)، وما تعتمد عليه
    // JournalTool.jsx لتفادي setEntries على نتيجة لم تتغيّر فعليًا.
    expect(result).toBe(entries);
  });

  it("لا يربط self.onmessage عند الاستيراد ببيئة اختبار عادية (بلا أي استثناء)", async () => {
    // مجرد استيراد الملف بالأعلى بلا رمي أي خطأ (self غير معرَّف ببيئة Node)
    // يكفي دليلاً أن الحارس يعمل — نتحقق هنا فقط أن الدالة المصدَّرة قابلة
    // للاستدعاء طبيعيًا كدالة عادية.
    expect(typeof computeContactMatch).toBe("function");
  });
});
