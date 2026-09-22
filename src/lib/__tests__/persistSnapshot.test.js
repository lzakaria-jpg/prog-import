import { describe, it, expect, beforeEach } from "vitest";
import { loadSnapshot, saveSnapshot, clearSnapshot } from "../persistSnapshot.js";

// localStorage وهمي بالذاكرة — persistSnapshot لا يعتمد على بيئة DOM، فنوفّره هنا
function makeMemoryStorage(failSet = false) {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (failSet) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; } map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
}

describe("persistSnapshot", () => {
  beforeEach(() => {
    global.localStorage = makeMemoryStorage();
  });

  it("saveSnapshot ثم loadSnapshot يرجّع نفس الكائن", () => {
    const obj = { file1Rows: [{ code: "1", name: "الأصول" }], useFile2Codes: true, customerName: "لؤي" };
    expect(saveSnapshot("merge_tabA", obj)).toBe(true);
    expect(loadSnapshot("merge_tabA")).toEqual(obj);
  });

  it("loadSnapshot لمفتاح غير موجود يرجّع null", () => {
    expect(loadSnapshot("nope")).toBeNull();
  });

  it("key فارغ: لا يحفظ ولا يقرأ (يرجّع false/null)", () => {
    expect(saveSnapshot("", { a: 1 })).toBe(false);
    expect(loadSnapshot("")).toBeNull();
  });

  it("clearSnapshot يمسح اللقطة", () => {
    saveSnapshot("k", { a: 1 });
    clearSnapshot("k");
    expect(loadSnapshot("k")).toBeNull();
  });

  it("تجاوز حد التخزين (quota) يُلتقط بصمت ويرجّع false بلا رمي خطأ", () => {
    global.localStorage = makeMemoryStorage(true);
    expect(() => saveSnapshot("big", { huge: "x".repeat(10) })).not.toThrow();
    expect(saveSnapshot("big", { a: 1 })).toBe(false);
  });

  it("JSON تالف بالتخزين لا يكسر loadSnapshot (يرجّع null)", () => {
    global.localStorage.setItem("qoyod_snap_bad", "{not json");
    expect(loadSnapshot("bad")).toBeNull();
  });
});
