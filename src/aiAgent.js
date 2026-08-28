import { supabase } from "./supabase";

// جلب المفتاح المحفوظ من الإعدادات أو قاعدة البيانات
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

// إرسال الرسالة إلى Gemini API
export async function generateAIResponse(prompt) {
  const apiKey = await getGeminiKey();
  if (!apiKey) {
    return "⚠️ لم يتم إدخال مفتاح Gemini API. يرجى إدخاله من لوحة التحكم ⚙️.";
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();
    if (data.error) {
      console.error("Gemini API Error:", data.error);
      return "⚠️ المفتاح المستخدَم غير صالح أو انتهت حصته المجانية. يرجى التأكد من المفتاح.";
    }

    return data.candidates[0].content.parts[0].text;
  } catch (err) {
    console.error("AI Error:", err);
    return "⚠️ حدث خطأ أثناء الاتصال بالذكاء الاصطناعي. تحقق من الاتصال بالإنترنت.";
  }
}