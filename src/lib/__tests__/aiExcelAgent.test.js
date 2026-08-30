import { describe, it, expect } from "vitest";
import { applyOperations, validatePlan, buildChartFromTrialBalance, KNOWN_OPS } from "../aiExcelAgent.js";

function sheet(name, headers, rows) {
  return { name, headers, rows };
}

describe("applyOperations — pure spreadsheet transformations", () => {
  it("rename_column renames the header and re-keys every row", () => {
    const sheets = [sheet("S1", ["A", "B"], [{ A: 1, B: 2 }])];
    const { sheets: out } = applyOperations(sheets, [{ op: "rename_column", sheet: "S1", from: "A", to: "X" }]);
    expect(out[0].headers).toEqual(["X", "B"]);
    expect(out[0].rows[0]).toEqual({ X: 1, B: 2 });
  });

  it("delete_column removes the header and the key from every row", () => {
    const sheets = [sheet("S1", ["A", "B"], [{ A: 1, B: 2 }])];
    const { sheets: out } = applyOperations(sheets, [{ op: "delete_column", sheet: "S1", column: "B" }]);
    expect(out[0].headers).toEqual(["A"]);
    expect(out[0].rows[0]).toEqual({ A: 1 });
  });

  it("reorder_columns puts the given order first, keeping the rest after", () => {
    const sheets = [sheet("S1", ["A", "B", "C"], [{ A: 1, B: 2, C: 3 }])];
    const { sheets: out } = applyOperations(sheets, [{ op: "reorder_columns", sheet: "S1", order: ["C", "A"] }]);
    expect(out[0].headers).toEqual(["C", "A", "B"]);
  });

  it("remove_duplicates keeps only the first occurrence per key", () => {
    const sheets = [sheet("S1", ["code", "name"], [
      { code: "1", name: "a" }, { code: "1", name: "a-dup" }, { code: "2", name: "b" },
    ])];
    const { sheets: out, notes } = applyOperations(sheets, [{ op: "remove_duplicates", sheet: "S1", keyColumns: ["code"] }]);
    expect(out[0].rows).toHaveLength(2);
    expect(out[0].rows[0].name).toBe("a");
    expect(notes[0]).toMatch(/حُذف 1/);
  });

  it("remove_empty_rows drops rows where every column is blank", () => {
    const sheets = [sheet("S1", ["A", "B"], [{ A: "1", B: "" }, { A: "", B: "" }])];
    const { sheets: out } = applyOperations(sheets, [{ op: "remove_empty_rows", sheet: "S1" }]);
    expect(out[0].rows).toHaveLength(1);
  });

  it("trim_whitespace collapses internal spaces and trims edges", () => {
    const sheets = [sheet("S1", ["A"], [{ A: "  hello   world  " }])];
    const { sheets: out } = applyOperations(sheets, [{ op: "trim_whitespace", sheet: "S1", columns: ["A"] }]);
    expect(out[0].rows[0].A).toBe("hello world");
  });

  it("sort orders numerically when values are numeric, alphabetically otherwise", () => {
    const sheets = [sheet("S1", ["n"], [{ n: "10" }, { n: "2" }, { n: "1" }])];
    const { sheets: out } = applyOperations(sheets, [{ op: "sort", sheet: "S1", column: "n", order: "asc" }]);
    expect(out[0].rows.map((r) => r.n)).toEqual(["1", "2", "10"]);
  });

  it("split_sheet creates one new sheet per distinct value and removes the original", () => {
    const sheets = [sheet("S1", ["loc", "v"], [{ loc: "A", v: 1 }, { loc: "B", v: 2 }, { loc: "A", v: 3 }])];
    const { sheets: out } = applyOperations(sheets, [{ op: "split_sheet", sheet: "S1", byColumn: "loc" }]);
    expect(out.find((s) => s.name === "S1")).toBeUndefined();
    expect(out.map((s) => s.name).sort()).toEqual(["S1_A", "S1_B"]);
    expect(out.find((s) => s.name === "S1_A").rows).toHaveLength(2);
  });

  it("merge_sheets stacks rows from all listed sheets into one, union of headers", () => {
    const sheets = [sheet("S1", ["A", "B"], [{ A: 1, B: 2 }]), sheet("S2", ["A", "C"], [{ A: 3, C: 4 }])];
    const { sheets: out } = applyOperations(sheets, [{ op: "merge_sheets", sheets: ["S1", "S2"], into: "Merged" }]);
    expect(out.find((s) => s.name === "S1")).toBeUndefined();
    const merged = out.find((s) => s.name === "Merged");
    expect(merged.rows).toHaveLength(2);
    expect(merged.headers.sort()).toEqual(["A", "B", "C"]);
  });

  it("add_formula_column adds a formula-template cell on every row", () => {
    const sheets = [sheet("S1", ["A", "B"], [{ A: 1, B: 2 }])];
    const { sheets: out } = applyOperations(sheets, [{ op: "add_formula_column", sheet: "S1", newColumn: "Total", formula: "=A2*B2" }]);
    expect(out[0].headers).toContain("Total");
    expect(out[0].rows[0].Total.__formulaTemplate).toBe("=A2*B2");
  });

  it("add_report_sheet inserts a brand-new sheet from literal header+rows", () => {
    const sheets = [sheet("S1", ["A"], [{ A: 1 }])];
    const { sheets: out } = applyOperations(sheets, [{ op: "add_report_sheet", name: "Report", rows: [["Metric", "Value"], ["Count", "1"]] }]);
    const report = out.find((s) => s.name === "Report");
    expect(report.headers).toEqual(["Metric", "Value"]);
    expect(report.rows[0]).toEqual({ Metric: "Count", Value: "1" });
  });

  it("does not mutate the input sheets array/rows (pure)", () => {
    const original = sheet("S1", ["A"], [{ A: 1 }]);
    const sheets = [original];
    applyOperations(sheets, [{ op: "rename_column", sheet: "S1", from: "A", to: "X" }]);
    expect(original.headers).toEqual(["A"]);
    expect(original.rows[0]).toEqual({ A: 1 });
  });
});

describe("buildChartFromTrialBalance — infers a parent/child hierarchy from account codes alone", () => {
  it("builds levels from numeric code prefixes without any explicit parent column", () => {
    const trialBalance = sheet("TB", ["كود الحساب", "اسم الحساب", "مدين", "دائن"], [
      { "كود الحساب": "1", "اسم الحساب": "الأصول", "مدين": "", "دائن": "" },
      { "كود الحساب": "11", "اسم الحساب": "أصول متداولة", "مدين": "", "دائن": "" },
      { "كود الحساب": "111", "اسم الحساب": "النقدية", "مدين": "1000", "دائن": "" },
    ]);
    const { headers, rows } = buildChartFromTrialBalance(trialBalance);
    expect(headers).toEqual(["الكود", "الاسم", "الحساب الأب", "المستوى", "نوع الحساب"]);
    const byCode = Object.fromEntries(rows.map((r) => [r["الكود"], r]));
    expect(byCode["111"]["الحساب الأب"]).toBe("11");
    expect(byCode["11"]["الحساب الأب"]).toBe("1");
    expect(byCode["111"]["المستوى"]).toBeGreaterThan(byCode["11"]["المستوى"]);
  });
});

describe("validatePlan — rejects anything not grounded in the real sheet", () => {
  const sheets = [sheet("S1", ["A", "B"], [{ A: 1, B: 2 }])];

  it("accepts a valid, grounded operation", () => {
    const { operations, rejected } = validatePlan({ operations: [{ op: "rename_column", sheet: "S1", from: "A", to: "X" }] }, sheets);
    expect(operations).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it("rejects an operation naming a column that does not exist", () => {
    const { operations, rejected } = validatePlan({ operations: [{ op: "delete_column", sheet: "S1", column: "Ghost" }] }, sheets);
    expect(operations).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it("rejects an operation naming a sheet that does not exist", () => {
    const { operations, rejected } = validatePlan({ operations: [{ op: "sort", sheet: "Nope", column: "A", order: "asc" }] }, sheets);
    expect(operations).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it("rejects an op key outside the known vocabulary", () => {
    const { operations, rejected } = validatePlan({ operations: [{ op: "drop_database", sheet: "S1" }] }, sheets);
    expect(operations).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/غير معروفة/);
  });

  it("every known op referenced by validatePlan actually exists in KNOWN_OPS", () => {
    expect(KNOWN_OPS.has("rename_column")).toBe(true);
    expect(KNOWN_OPS.has("build_chart_of_accounts_from_trial_balance")).toBe(true);
  });
});
