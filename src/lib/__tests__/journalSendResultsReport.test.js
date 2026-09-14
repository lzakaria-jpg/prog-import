import { describe, it, expect } from "vitest";
import { buildSendResultsReportRows } from "../journalSendResultsReport.js";

const t = ({ ar }) => ar;

function makeEntry(overrides) {
  return { seq: "1", date: "15/09/2026", desc: "قيد اختباري", ...overrides };
}

describe("buildSendResultsReportRows (journal)", () => {
  it("الترويسة = رقم القيد/التاريخ/الوصف/حالة الإرسال/التفاصيل", () => {
    const { header } = buildSendResultsReportRows([], [], t);
    expect(header).toEqual(["رقم القيد", "التاريخ", "الوصف", "حالة الإرسال", "التفاصيل"]);
  });

  it("قيد ناجح: حالة نجح، التفاصيل فارغة بلا response، isFailed=false", () => {
    const { dataRows } = buildSendResultsReportRows([makeEntry({ seq: "1" })], [{ seq: "1", status: "success", id: 5 }], t);
    expect(dataRows).toHaveLength(1);
    expect(dataRows[0].isFailed).toBe(false);
    expect(dataRows[0].values[3]).toBe("نجح");
    expect(dataRows[0].values[4]).toBe("");
  });

  it("قيد ناجح مع response من قيود: التفاصيل تعرض رقم القيد وإجمالي المدين/الدائن", () => {
    const response = { id: 555, total_debit: "100.00", total_credit: "100.00" };
    const { dataRows } = buildSendResultsReportRows([makeEntry({ seq: "1" })], [{ seq: "1", status: "success", id: 555, response }], t);
    expect(dataRows[0].values[4]).toContain("555");
    expect(dataRows[0].values[4]).toContain("100.00");
  });

  // [إصلاح خطأ حقيقي 2026-09-14] رد 200 ناجح بلا id (معالجة غير متزامنة محتملة
  // من قيود لدفعات كبيرة، راجع qoyodJournalEntryPush.js) — تفاصيل واضحة بدل
  // "null" أو خانة فارغة مضلِّلة.
  it("قيد ناجح بـresponse بلا id/مدين/دائن (رد فارغ): رسالة واضحة بدل فراغ أو 'null'", () => {
    const { dataRows } = buildSendResultsReportRows([makeEntry({ seq: "1" })], [{ seq: "1", status: "success", id: null, response: {} }], t);
    expect(dataRows[0].values[3]).toBe("نجح");
    expect(dataRows[0].values[4]).not.toBe("");
    expect(dataRows[0].values[4]).not.toContain("null");
    expect(dataRows[0].isFailed).toBe(false);
  });

  it("قيد فاشل: حالة فشل، التفاصيل = سبب الفشل، isFailed=true", () => {
    const { dataRows } = buildSendResultsReportRows([makeEntry({ seq: "2" })], [{ seq: "2", status: "error", reason: "تعذّر تحديد معرّف الحساب" }], t);
    expect(dataRows[0].isFailed).toBe(true);
    expect(dataRows[0].values[3]).toBe("فشل");
    expect(dataRows[0].values[4]).toBe("تعذّر تحديد معرّف الحساب");
  });

  it("قيد بلا نتيجة إطلاقًا (لم يُرسَل): حالة 'لم يُرسَل' بلا حدود", () => {
    const { dataRows } = buildSendResultsReportRows([makeEntry({ seq: "3" })], [], t);
    expect(dataRows[0].isFailed).toBe(false);
    expect(dataRows[0].values[3]).toBe("لم يُرسَل");
  });
});
