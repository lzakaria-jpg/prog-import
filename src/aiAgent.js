import { supabase } from "./supabase";

export const AI_AGENT_EMAIL = "ai-agent@system.local";
export const AI_AGENT_NAME_AR = "مساعد قيود (ذكاء اصطناعي)";
export const AI_AGENT_NAME_EN = "Qoyod Assistant (AI)";

// جلب المفتاح المخزن من localStorage أو app_settings
export async function getGeminiKey() {
  try {
    const localKey = localStorage.getItem("gemini_api_key");
    if (localKey) return localKey;

    if (supabase && supabase.supabaseUrl && !supabase.supabaseUrl.includes("YOUR_")) {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "gemini_api_key").maybeSingle();
      if (data?.value) return data.value;
    }
  } catch (e) {
    console.warn("Failed to get Gemini key:", e);
  }
  return null;
}

// حفظ المفتاح
export async function saveGeminiKey(key) {
  try {
    localStorage.setItem("gemini_api_key", key);
    if (supabase && supabase.supabaseUrl && !supabase.supabaseUrl.includes("YOUR_")) {
      await supabase.from("app_settings").upsert({ key: "gemini_api_key", value: key }, { onConflict: "key" });
    }
    return true;
  } catch (e) {
    console.error("Failed to save Gemini key:", e);
    return false;
  }
}

export async function isAgentAvailable() {
  const key = await getGeminiKey();
  return !!key;
}

export function isMessageForAgent(text, isPublicChannel) {
  if (!text) return false;
  if (!isPublicChannel) return true;
  return text.toLowerCase().includes("@ai") || text.includes("ذكاء") || text.includes("مساعد");
}

export function cleanMessageForAgent(text) {
  return text.replace(/@ai/gi, "").trim();
}

// إرسال الرسالة إلى Gemini API مباشرة
export async function chatWithAgent(userPrompt, channelKey = "default") {
  const apiKey = await getGeminiKey();

  if (!apiKey) {
    return {
      text: "⚠️ لم يتم حفظ مفتاح Gemini API في الإعدادات. يرجى فتح لوحة التحكم وإدخال المفتاح.",
      error: true
    };
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }]
      })
    });

    const data = await res.json();

    if (data.error) {
      return {
        text: `⚠️ خطأ في المفتاح: ${data.error.message || "تأكد من صحة المفتاح المُدخل في لوحة الإعدادات."}`,
        error: true
      };
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return {
      text: reply || "لم يتم استلام رد من الذكاء الاصطناعي.",
      error: false
    };

  } catch (err) {
    return {
      text: "⚠️ حدث خطأ في الاتصال بالسيرفر. تحقق من الاتصال بالإنترنت.",
      error: true
    };
  }
}