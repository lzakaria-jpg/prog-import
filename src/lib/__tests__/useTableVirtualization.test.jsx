// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { useTableVirtualization } from "../useTableVirtualization.js";

function TestTable({ rowCount }) {
  const v = useTableVirtualization(rowCount, { threshold: 50 });
  const rows = Array.from({ length: rowCount }, (_, i) => i);
  const visible = v.shouldVirtualize ? rows.slice(v.startIndex, v.endIndex) : rows;
  return (
    <div ref={v.scrollRef} data-testid="scroller" style={{ height: "200px", overflow: "auto" }}>
      <table>
        <tbody>
          {v.shouldVirtualize && v.topSpacerHeight > 0 && (
            <tr data-testid="top-spacer" style={{ height: v.topSpacerHeight }}><td /></tr>
          )}
          {visible.map((i) => (
            <tr key={i} data-testid="row" data-idx={i}><td>{i}</td></tr>
          ))}
          {v.shouldVirtualize && v.bottomSpacerHeight > 0 && (
            <tr data-testid="bottom-spacer" style={{ height: v.bottomSpacerHeight }}><td /></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function mount(el) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(el); });
  return { container, root };
}

describe("useTableVirtualization", () => {
  it("جدول صغير (أقل من threshold): يُعرض كل الصفوف بلا أي حشو", () => {
    const { container } = mount(<TestTable rowCount={10} />);
    expect(container.querySelectorAll('[data-testid="row"]').length).toBe(10);
    expect(container.querySelector('[data-testid="top-spacer"]')).toBeNull();
  });

  it("جدول ضخم (50,000 صف): عدد عناصر DOM المرسومة محدود، لا يقارب 50,000", () => {
    const { container } = mount(<TestTable rowCount={50000} />);
    const rendered = container.querySelectorAll('[data-testid="row"]').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(200); // نافذة العرض + هامش overscan فقط، لا الملف كامل
  });
});
