// @vitest-environment jsdom
//
// [إضافة 2026-10-08 — بلاغ حقيقي بفيديو] سحب حساب بمخطط الشجرة وإفلاته على أب
// جديد كان يُظهر "معاينة النقل" سليمة لكن لا يتم النقل إطلاقاً: handleDrop كان
// يستدعي blockedBySending غير المعرّفة بنطاق AccountsTreeView (ReferenceError
// صامت داخل مستمع pointerup). هذا الاختبار يعيد السيناريو نفسه من الفيديو:
// نقل "خسارة العام" (301403) تحت "الأرباح والخسائر" (3104).
import { describe, it, expect, afterEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import React from "react";
import { AccountsTreeView } from "../MergeTool.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
// البطاقة القابلة للسحب نفسها (العنصر الحامل لـonPointerDown) داخل غلاف العقدة
const card = (container, code) => container.querySelector(`[data-tree-node-code="${code}"] div.relative.flex.flex-col`);

const row = (id, code, nameAr, level, parent, type, level2Category = "") => ({
  id, status: "new", code, nameAr, nameEn: nameAr, level, parent, type, level2Category,
  deleted: false, autoParent: false, errors: [], warnings: [], payCollect: "No", desc: "", source: {},
});

const rows = [
  row("n-1", "3104", "الأرباح والخسائر", 3, "31", "حقوق ملكية أخرى", "حقوق الملاك الأخرى"),
  row("n-2", "310401", "ارباح العام", 4, "3104", "حقوق ملكية أخرى", "حقوق الملاك الأخرى"),
  { ...row("auto-3014", "3014", "حقوق الملكية.", 2, "3", "حقوق الملاك الأخرى"), autoParent: true },
  row("n-3", "301403", "خسارة العام", 3, "3014", "حقوق ملكية أخرى", "حقوق الملاك الأخرى"),
];
const treeMeta = {
  level1CodeMap: { "حقوق الملاك": "3" },
  level2CodeMap: { "حقوق الملاك الأخرى": "31" },
  tree1Index: [
    { code: "3", nameAr: "حقوق الملكية", parent: "", level: 1, type: "", level2Category: null },
    { code: "31", nameAr: "حقوق الملاك الأخرى", parent: "3", level: 2, type: "حقوق الملاك الأخرى", level2Category: "حقوق الملاك الأخرى" },
  ],
};

let mounted = [];
afterEach(() => {
  mounted.forEach(({ root, container }) => { act(() => root.unmount()); container.remove(); });
  mounted = [];
  delete document.elementFromPoint;
});

function fire(target, type, x = 10, y = 10) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  act(() => { target.dispatchEvent(ev); });
}

describe("مخطط الشجرة — السحب والإفلات ينقل الحساب فعلاً", () => {
  it("نقل 301403 تحت 3104 يستدعي updateRow بالأب والرمز الجديدين", () => {
    const updateRow = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    act(() => {
      root.render(React.createElement(AccountsTreeView, {
        rows, treeMeta, updateRow, setRowDeleted: vi.fn(), addChildAccount: vi.fn(), availableTypesFor: () => [],
      }));
    });

    const source = card(container, "301403");
    const target = container.querySelector('[data-tree-node-code="3104"]');
    expect(source).toBeTruthy();
    expect(target).toBeTruthy();

    document.elementFromPoint = () => target;
    fire(source, "pointerdown");
    fire(window, "pointermove", 50, 50);
    fire(window, "pointerup", 50, 50);

    const moveCall = updateRow.mock.calls.find(([id]) => id === "n-3");
    expect(moveCall).toBeTruthy();
    expect(moveCall[1]).toMatchObject({ parent: "3104", code: "310402", level: 4 });
  });

  it("أثناء الإرسال المباشر عبر API: لا نقل", () => {
    const updateRow = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    act(() => {
      root.render(React.createElement(AccountsTreeView, {
        rows, treeMeta, updateRow, blockedBySending: () => true,
        setRowDeleted: vi.fn(), addChildAccount: vi.fn(), availableTypesFor: () => [],
      }));
    });
    const source = card(container, "301403");
    const target = container.querySelector('[data-tree-node-code="3104"]');
    document.elementFromPoint = () => target;
    fire(source, "pointerdown");
    fire(window, "pointerup", 50, 50);
    expect(updateRow).not.toHaveBeenCalled();
  });
});
