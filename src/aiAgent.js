import { supabase } from "./supabase";

export const AI_AGENT_EMAIL = "ai-agent@system.local";
export const AI_AGENT_NAME_AR = "مساعد قيود (ذكاء اصطناعي)";
export const AI_AGENT_NAME_EN = "Qoyod Assistant (AI)";

export async function getGeminiKey() {
  try {
    const localKey = localStorage.getItem("gemini_api_key");
    if (localKey) return localKey;
    if (supabase && supabase.supabaseUrl && !supabase.supabaseUrl.includes("YOUR_")) {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "gemini_api_key").maybeSingle();
      if (data?.value) return data.value;
    }
  } catch (e) {}
  return null;
}

export async function saveGeminiKey(key) {
  try {
    localStorage.setItem("gemini_api_key", key);
    if (supabase && supabase.supabaseUrl && !supabase.supabaseUrl.includes("YOUR_")) {
      await supabase.from("app_settings").upsert({ key: "gemini_api_key", value: key }, { onConflict: "key" });
    }
    return true;
  } catch (e) {
    return false;
  }
}

export async function isAgentAvailable() {
  return true;
}

export function isMessageForAgent(text, isPublicChannel) {
  return true;
}

export function cleanMessageForAgent(text) {
  return text;
}

export async function chatWithAgent(userPrompt) {
  const apiKey = await getGeminiKey();

  if (!apiKey) {
    return {
      text: "🔑 يرجى الذهاب لإعدادات المدير وإدخال مفتاح Gemini API لتفعيل الشات.",
      error: true
    };
  }

  try {
    // Direct call to Gemini's API using the locally stored key — no Supabase Edge Function involved.
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: userPrompt }] }] })
    });

    const data = await res.json();
    if (data.error) {
      return { text: `⚠️ خطأ في المفتاح: ${data.error.message}`, error: true };
    }
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      return { text: "⚠️ لم يصل رد من Gemini. حاول مرة أخرى.", error: true };
    }
    return { text: reply, error: false };
  } catch (err) {
    return { text: "⚠️ تعذر الاتصال بسيرفر Gemini.", error: true };
  }
}

// Used directly by the chat UI (src/chat.jsx): sends the user's message straight to Gemini
// with the locally configured API key and returns plain reply text.
export async function generateAIResponse(userPrompt) {
  const { text } = await chatWithAgent(userPrompt);
  return text;
}