import { describe, it, expect } from "vitest";
import { parseCsvText } from "../csvParser.js";

describe("parseCsvText — محلل يدوي بلا تخمين أنواع (لا يُفسد '15%' أو التواريخ)", () => {
  it("يفصل الحقول بالفاصلة العادية ويحافظ على '15%' كنص", () => {
    const rows = parseCsvText("SKU,Rate\nA-1,15%\n");
    expect(rows).toEqual([["SKU", "Rate"], ["A-1", "15%"]]);
  });

  it("يكتشف الفاصلة المنقوطة تلقائيًا عندما تكون أكثر شيوعًا من الفاصلة العادية", () => {
    const rows = parseCsvText("SKU;Rate\nA-1;15%\n");
    expect(rows).toEqual([["SKU", "Rate"], ["A-1", "15%"]]);
  });

  it("يعالج الحقول المقتبَسة بعلامات تنصيص تحوي فواصل داخلية", () => {
    const rows = parseCsvText('Name,Note\n"شركة, المحدودة","ملاحظة عادية"\n');
    expect(rows).toEqual([["Name", "Note"], ["شركة, المحدودة", "ملاحظة عادية"]]);
  });

  it("يعالج علامة تنصيص مكرَّرة \"\" داخل حقل مقتبَس كعلامة حرفية واحدة", () => {
    const rows = parseCsvText('Note\n"قال ""مرحبا"""\n');
    expect(rows).toEqual([["Note"], ['قال "مرحبا"']]);
  });

  it("يدعم حقلاً مقتبَسًا متعدد الأسطر (فاصلة سطر داخل علامات تنصيص)", () => {
    const rows = parseCsvText('Note\n"سطر أول\nسطر ثاني"\n');
    expect(rows).toEqual([["Note"], ["سطر أول\nسطر ثاني"]]);
  });

  it("يتجاهل \\r قبل \\n (CRLF) دون إضافتها للحقل", () => {
    const rows = parseCsvText("A,B\r\n1,2\r\n");
    expect(rows).toEqual([["A", "B"], ["1", "2"]]);
  });

  it("سطر أخير بلا فاصلة سطر لاحقة لا يُفقَد", () => {
    const rows = parseCsvText("A,B\n1,2");
    expect(rows).toEqual([["A", "B"], ["1", "2"]]);
  });

  it("لا يحوّل '15%' أو تواريخ أمريكية إلى أرقام/تنسيقات مختلفة — يبقيها نصًا خامًا", () => {
    const rows = parseCsvText("Rate,Date\n15%,2026-08-31\n");
    expect(rows[1][0]).toBe("15%");
    expect(rows[1][1]).toBe("2026-08-31");
  });
});
