// @vitest-environment jsdom
// applyApprovedTypeOverrides (عبر buildOrganizedChart) — تصحيح نوع "غير صامت"
// يُطبَّق فقط عند تمرير overrides صريحة (اعتماد فعلي من المستخدم بعد مراجعته
// لرسالة "توافق النوع مع الأب" واقتراحها نوعاً من عائلة الأب الصحيحة).
//
// حالة حقيقية موثَّقة (allume.xls، بعد فصل حقوق الملكية ودمج الحسابات المقفلة):
// 3 حسابات تخرج فعلاً عن عائلة أبيها -
//   "مخصص نهاية الخدمة" (210402): النوع الحالي "مخصص مكافأة نهاية الخدمة" لا
//     يتبع عائلة الأب "الالتزامات المتداولة" - المقترح "مخصصات".
//   "اهتلاك الديكورات" (510301) و"اهتلاك اجهزة وتجهيزات مكتبية" (510302):
//     النوع الحالي "تكاليف مباشرة أخرى" لا يتبع عائلة الأب "تكاليف تشغيلية" -
//     المقترح "تكاليف تشغيلية أخرى".
// المستخدم اعتمد صراحة تطبيق الاقتراح الثلاثة على ملف allume نفسه.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { readAndMapChartFile, buildOrganizedChart } from "../chartOrganizerAgent.js";
import { buildRecords } from "../../MergeTool.jsx";

const APPROVED_OVERRIDES = [
  { code: "210402", type: "مخصصات" },
  { code: "510301", type: "تكاليف تشغيلية أخرى" },
  { code: "510302", type: "تكاليف تشغيلية أخرى" },
];

async function loadAllumeRecords() {
  const buf = fs.readFileSync(path.join(__dirname, "fixtures/allume_raw.xls"));
  const file = new File([buf], "allume_raw.xls");
  const { rows, mapping } = await readAndMapChartFile(file);
  const fullMapping = { ...mapping, nameAr: 2, nameEn: 1, level: 5 };
  return buildRecords(rows, fullMapping);
}

describe("applyApprovedTypeOverrides (عبر buildOrganizedChart)", () => {
  it("بلا overrides: الأخطاء الثلاثة تبقى كما هي - لا تصحيح صامت افتراضي", async () => {
    const records = await loadAllumeRecords();
    const built = await buildOrganizedChart(records);

    expect(built.errorCount).toBe(3);
    const eos = built.orderedRows.find((r) => r.code === "210402");
    expect(eos.errors.some((e) => e.startsWith("توافق النوع مع الأب:"))).toBe(true);
    expect(built.auditNotes.some((n) => n.type === "تصحيح معتمد من المستخدم")).toBe(false);
  });

  it("مع overrides معتمدة: الثلاثة تصير سليمة والنوع/الفئة يتحدّثان فعلياً بلا إخفاء", async () => {
    const records = await loadAllumeRecords();
    const built = await buildOrganizedChart(records, { approvedTypeOverrides: APPROVED_OVERRIDES });

    expect(built.errorCount).toBe(0);

    const eos = built.orderedRows.find((r) => r.code === "210402");
    expect(eos).toBeTruthy();
    expect(eos.nameAr).toBe("مخصص نهاية الخدمة");
    expect(eos.type).toBe("مخصصات");
    expect(eos.level2Category).toBe("الالتزامات المتداولة");
    expect(eos.errors).toHaveLength(0);

    const dep1 = built.orderedRows.find((r) => r.code === "510301");
    const dep2 = built.orderedRows.find((r) => r.code === "510302");
    [dep1, dep2].forEach((r) => {
      expect(r).toBeTruthy();
      expect(r.type).toBe("تكاليف تشغيلية أخرى");
      expect(r.level2Category).toBe("تكاليف تشغيلية");
      expect(r.errors).toHaveLength(0);
    });

    // ملاحظة تدقيق صريحة لكل تصحيح - التصحيح موثَّق لا مخفي
    const overrideNotes = built.auditNotes.filter((n) => n.type === "تصحيح معتمد من المستخدم");
    expect(overrideNotes).toHaveLength(3);
    expect(overrideNotes.some((n) => n.detail.includes("مخصصات"))).toBe(true);
  });

  it("override بنوع لا يتبع فعلاً عائلة الأب: يعود الخطأ من جديد بلا اختفاء صامت", async () => {
    const records = await loadAllumeRecords();
    const built = await buildOrganizedChart(records, {
      approvedTypeOverrides: [{ code: "210402", type: "رأس المال" }], // نوع من فئة حقوق الملاك - لا ينتمي لعائلة الأب هنا
    });
    const eos = built.orderedRows.find((r) => r.code === "210402");
    expect(eos.type).toBe("رأس المال");
    expect(eos.errors.some((e) => e.startsWith("توافق النوع مع الأب:"))).toBe(true);
  });
});
