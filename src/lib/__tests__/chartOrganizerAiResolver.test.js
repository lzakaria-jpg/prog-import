import { describe, it, expect, vi } from "vitest";

vi.mock("../claudeProxy", () => ({
  callClaude: vi.fn(),
  extractText: (data) => data.__text,
}));

import { callClaude } from "../claudeProxy";
import { resolveAmbiguousTypesWithClaude } from "../chartOrganizerAiResolver.js";

describe("resolveAmbiguousTypesWithClaude", () => {
  it("يرجع خريطة فارغة بلا أي استدعاء شبكة لو لم توجد صفوف غامضة", async () => {
    const decisions = await resolveAmbiguousTypesWithClaude([]);
    expect(decisions.size).toBe(0);
    expect(callClaude).not.toHaveBeenCalled();
  });

  it("يبني الخريطة من رد Claude الصالح فقط، ويرسل candidateTypes ضمن الطلب", async () => {
    callClaude.mockResolvedValueOnce({
      __text: '[{"id":"n-1","type":"الرواتب"},{"id":"n-2","type":null}]',
    });

    const decisions = await resolveAmbiguousTypesWithClaude([
      { id: "n-1", nameAr: "رواتب الاداره", nameEn: "", desc: "", candidateTypes: ["الرواتب", "تكاليف تشغيلية أخرى"] },
      { id: "n-2", nameAr: "شيء غامض", nameEn: "", desc: "", candidateTypes: ["نوع أ", "نوع ب"] },
    ]);

    expect(decisions.get("n-1")).toBe("الرواتب");
    expect(decisions.has("n-2")).toBe(false); // type: null - لا يُدرج بالخريطة إطلاقاً

    const sentPayload = callClaude.mock.calls[0][0];
    expect(sentPayload.model).toMatch(/^claude-haiku/);
    expect(sentPayload.messages[0].content).toContain("رواتب الاداره");
    expect(sentPayload.messages[0].content).toContain("الرواتب");
    expect(sentPayload.messages[0].content).toContain("تكاليف تشغيلية أخرى");
  });

  it("يتجاهل رداً غير JSON صالح فيرجع خريطة فارغة (لا يرمي استثناء)", async () => {
    callClaude.mockResolvedValueOnce({ __text: "هذا ليس JSON" });
    const decisions = await resolveAmbiguousTypesWithClaude([
      { id: "n-1", nameAr: "حساب ما", nameEn: "", desc: "", candidateTypes: ["نوع أ"] },
    ]);
    expect(decisions.size).toBe(0);
  });

  it("يتجاهل عناصر بلا id أو بلا type بصمت", async () => {
    callClaude.mockResolvedValueOnce({
      __text: '[{"id":"n-1"},{"type":"بلا id"},{"id":"n-2","type":"نوع ب"}]',
    });
    const decisions = await resolveAmbiguousTypesWithClaude([
      { id: "n-1", nameAr: "أ", nameEn: "", desc: "", candidateTypes: ["x"] },
      { id: "n-2", nameAr: "ب", nameEn: "", desc: "", candidateTypes: ["نوع ب"] },
    ]);
    expect(decisions.size).toBe(1);
    expect(decisions.get("n-2")).toBe("نوع ب");
  });
});
