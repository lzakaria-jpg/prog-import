import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

/**
 * [إضافة 2026-10-08 — بلاغ حقيقي بفيديو] نقل الحسابات بمخطط الشجرة توقف تماماً
 * لأن مكوّناً فرعياً (AccountsTreeView) استدعى دالة معرّفة داخل المكوّن الأب
 * فقط — ReferenceError صامت عند التشغيل، لا يكتشفه البناء ولا أي اختبار. هذا
 * الحارس يفحص كل ملفات src بحثاً عن أي معرّف مستخدَم بلا تعريف بنطاقه.
 */
const traverse = traverseMod.default || traverseMod;
const BROWSER_GLOBALS = new Set([
  "window", "document", "navigator", "localStorage", "sessionStorage", "location", "history",
  "requestAnimationFrame", "cancelAnimationFrame", "alert", "confirm", "getComputedStyle", "matchMedia",
  "Image", "Audio", "Worker", "self", "File", "FileReader", "Blob", "FormData", "ResizeObserver",
  "IntersectionObserver", "MutationObserver", "HTMLElement", "Event", "CustomEvent", "KeyboardEvent",
  "DOMParser", "XMLSerializer", "__APP_VERSION__",
]);

function listSources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : listSources(p);
    return /\.(jsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe("لا معرّفات غير معرّفة بكود التطبيق", () => {
  it("كل معرّف مستخدَم له تعريف بنطاقه (أو متغيّر عام معروف)", () => {
    const srcDir = path.resolve(__dirname, "..");
    const problems = [];
    listSources(srcDir).forEach((file) => {
      const ast = parse(fs.readFileSync(file, "utf8"), { sourceType: "module", plugins: ["jsx"] });
      traverse(ast, {
        ReferencedIdentifier(p) {
          const n = p.node.name;
          if (p.isJSXIdentifier() && /^[a-z]/.test(n)) return;
          if (p.parentPath.isJSXMemberExpression() && p.parentPath.node.property === p.node) return;
          if (p.scope.hasBinding(n) || n in globalThis || BROWSER_GLOBALS.has(n)) return;
          problems.push(`${path.relative(srcDir, file)}:${p.node.loc.start.line} ${n}`);
        },
      });
    });
    expect(problems).toEqual([]);
  });
});
