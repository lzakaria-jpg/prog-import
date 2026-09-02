// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

// aiAgent.js يُستخدَم حصرياً من src/chat.jsx (لا أي أداة أخرى) - انظر تعليق
// الملف نفسه. محادثة @AI النصية العادية (chatWithAgent) تعتمد على
// src/lib/claudeProxy.js (Claude عبر الوسيط الخادمي) منذ [2026-09]، لا Gemini
// - هذا آمن تماماً على أدوات المشروع الأربعة (JournalTool/MergeTool/
// AccountsTool/sales-invoice-import): لا أي منها يستدعي aiAgent.js إطلاقاً.
vi.mock("../lib/claudeProxy", () => ({
  callClaude: vi.fn(),
  extractText: (data) => (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""),
}));

import { callClaude } from "../lib/claudeProxy";
import { chatWithAgent } from "../aiAgent";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("chatWithAgent - قيد منع فبركة إنشاء ملف", () => {
  it("يضيف قيد 'ممنوع الزعم بإنشاء ملف' ضمن system المرسَل لـClaude", async () => {
    callClaude.mockResolvedValueOnce({ content: [{ type: "text", text: "رد عادي" }] });
    await chatWithAgent("مرحبا", {});
    const sentPayload = callClaude.mock.calls[0][0];
    expect(sentPayload.system).toContain("ممنوع منعاً باتاً الزعم بأنك");
    expect(sentPayload.system).toContain("لا تستطيع توليد الملف في رد نصي");
  });
});

describe("chatWithAgent - إرسال الرسالة والمرفقات لـClaude", () => {
  it("يرسل نص الرسالة كـcontent block من نوع text ضمن رسالة user واحدة", async () => {
    callClaude.mockResolvedValueOnce({ content: [{ type: "text", text: "رد" }] });
    await chatWithAgent("كيف أستورد شجرة الحسابات؟", {});
    const sentPayload = callClaude.mock.calls[0][0];
    expect(sentPayload.messages).toHaveLength(1);
    expect(sentPayload.messages[0].role).toBe("user");
    expect(sentPayload.messages[0].content).toContainEqual({ type: "text", text: "كيف أستورد شجرة الحسابات؟" });
  });

  it("يحوّل مرفق صورة (mimeType image/*) إلى image content block بصيغة Anthropic", async () => {
    callClaude.mockResolvedValueOnce({ content: [{ type: "text", text: "رد" }] });
    await chatWithAgent("وش بهذي الصورة؟", {
      attachments: [{ name: "shot.png", mimeType: "image/png", base64: "AAAA" }],
    });
    const sentPayload = callClaude.mock.calls[0][0];
    expect(sentPayload.messages[0].content).toContainEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "AAAA" },
    });
  });

  it("يتجاهل مرفقاً بصيغة غير مدعومة (لا صورة) بصمت بلا رمي خطأ", async () => {
    callClaude.mockResolvedValueOnce({ content: [{ type: "text", text: "رد" }] });
    await chatWithAgent("نص", {
      attachments: [{ name: "old.doc", mimeType: "application/msword", base64: "AAAA" }],
    });
    const sentPayload = callClaude.mock.calls[0][0];
    expect(sentPayload.messages[0].content).toHaveLength(1); // text block فقط
  });
});

describe("chatWithAgent - تمييز الازدحام المؤقت عن أي خطأ آخر", () => {
  it("لا يسمي ازدحام Anthropic المؤقت (overloaded/rate limit) 'تعذر الحصول على رد' العام", async () => {
    callClaude.mockRejectedValueOnce(new Error("Overloaded"));
    const result = await chatWithAgent("نظّم شجرة الحسابات", {});
    expect(result.error).toBe(true);
    expect(result.text).toContain("مزدحمة مؤقتاً");
  });

  it("يبقي رسالة عامة (لا 'مزدحم') لخطأ غير مؤقت (مثال: مفتاح غير مُعد بالخادم)", async () => {
    callClaude.mockRejectedValueOnce(new Error("ANTHROPIC_API_KEY غير مُعد على الخادم."));
    const result = await chatWithAgent("مرحبا", {});
    expect(result.error).toBe(true);
    expect(result.text).not.toContain("مزدحمة مؤقتاً");
    expect(result.text).toContain("ANTHROPIC_API_KEY غير مُعد على الخادم.");
  });

  it("رد فارغ من extractText (بلا استثناء): يُعامَل كخطأ بلا فشل صامت", async () => {
    callClaude.mockResolvedValueOnce({ content: [] });
    const result = await chatWithAgent("سؤال", {});
    expect(result.error).toBe(true);
  });
});

describe("generateAIResponse - غلاف نصي بسيط فوق chatWithAgent", () => {
  it("يرجع نص الرد فقط (لا الكائن الكامل)", async () => {
    callClaude.mockResolvedValueOnce({ content: [{ type: "text", text: "الجواب" }] });
    const { generateAIResponse } = await import("../aiAgent");
    const text = await generateAIResponse("سؤال", {});
    expect(text).toBe("الجواب");
  });
});
