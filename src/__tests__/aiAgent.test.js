// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { chatWithAgent } from "../aiAgent";

// aiAgent.js يُستخدَم حصرياً من src/chat.jsx (لا أي أداة أخرى) - انظر تعليق
// الملف نفسه: "Used directly by the chat UI (src/chat.jsx)". هذا يجعل تعديل
// systemInstruction/رسائل الخطأ هنا آمناً تماماً - لا يؤثر على aiService.js
// (أداة أخرى منفصلة تستدعي aiSystemPrompt.js المشترك مباشرة، لا هذا الملف).

function mockGeminiResponse(body, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  localStorage.setItem("gemini_api_key", "test-key");
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("chatWithAgent - قيد منع فبركة إنشاء ملف", () => {
  it("يضيف قيد 'ممنوع الزعم بإنشاء ملف' لتعليمات النظام المرسَلة لـGemini", async () => {
    mockGeminiResponse({ candidates: [{ content: { parts: [{ text: "رد عادي" }] } }] });
    await chatWithAgent("مرحبا", {});
    const [, requestInit] = global.fetch.mock.calls[0];
    const sentBody = JSON.parse(requestInit.body);
    const systemText = sentBody.systemInstruction.parts[0].text;
    expect(systemText).toContain("ممنوع منعاً باتاً الزعم بأنك");
    expect(systemText).toContain("لا تستطيع توليد الملف في رد نصي");
  });
});

describe("chatWithAgent - تمييز الازدحام المؤقت عن خطأ المفتاح الفعلي", () => {
  it("لا يسمي ازدحام Gemini المؤقت (503/high demand) 'خطأ في المفتاح' مضلِّلاً", async () => {
    mockGeminiResponse(
      { error: { code: 503, status: "UNAVAILABLE", message: "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later." } },
      503
    );
    const result = await chatWithAgent("نظّم شجرة الحسابات", {});
    expect(result.error).toBe(true);
    expect(result.text).not.toContain("خطأ في المفتاح");
    expect(result.text).toContain("مزدحمة مؤقتاً");
  });

  it("يبقي تسمية 'خطأ في المفتاح' لخطأ مفتاح/صلاحية فعلي", async () => {
    mockGeminiResponse(
      { error: { code: 403, status: "PERMISSION_DENIED", message: "API key not valid. Please pass a valid API key." } },
      403
    );
    const result = await chatWithAgent("مرحبا", {});
    expect(result.error).toBe(true);
    expect(result.text).toContain("خطأ في المفتاح");
  });
});
