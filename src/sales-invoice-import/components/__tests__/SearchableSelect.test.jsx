// @vitest-environment jsdom
// [إضافة] نفس نمط اختبار المكوّنات الوحيد الموجود فعلًا بالمشروع
// (useTableVirtualization.test.jsx) — react-dom/client + act، بلا @testing-library
// (غير مُضافة كاعتمادية بهذا المشروع).
import { describe, it, expect } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import SearchableSelect from "../SearchableSelect.jsx";

function setup(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<SearchableSelect {...props} />); });
  return { container, root, input: container.querySelector("input") };
}

function typeInto(input, text) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("SearchableSelect — [إضافة] قائمة اختيار قابلة بالبحث بالكتابة (حسابات/فئات/وحدات كثيرة)", () => {
  const options = [
    { value: 101, label: "5101 — النقدية" },
    { value: 102, label: "5102 — البنك الأهلي" },
    { value: 200, label: "1001 — الإيرادات" },
  ];

  it("يعرض تسمية القيمة الحالية عند التحميل", () => {
    const { input } = setup({ options, value: 102, onChange: () => {} });
    expect(input.value).toBe("5102 — البنك الأهلي");
  });

  it("كتابة نص مطابق تمامًا لخيار حقيقي ⇒ onChange بمعرّفه الحقيقي", () => {
    let received;
    const { input } = setup({ options, value: "", onChange: (v) => { received = v; } });
    typeInto(input, "5101 — النقدية");
    expect(received).toBe(101);
  });

  it("كتابة نص جزئي/غير مطابق ⇒ onChange('') — لا معرّف وهمي أبدًا", () => {
    let received = "not-called";
    const { input } = setup({ options, value: "", onChange: (v) => { received = v; } });
    typeInto(input, "51"); // جزء من الكود فقط — بحث المتصفح الفرعي يُظهر الاقتراح، لكن لا مطابقة تامة بعد
    expect(received).toBe("");
  });

  it("كل الخيارات تظهر بـdatalist كنص بحث كامل (يشمل الكود كبادئة قابلة للبحث)", () => {
    const { container } = setup({ options, value: "", onChange: () => {} });
    const datalistOptions = Array.from(container.querySelectorAll("datalist option")).map((o) => o.value);
    expect(datalistOptions).toEqual(["5101 — النقدية", "5102 — البنك الأهلي", "1001 — الإيرادات"]);
  });
});
