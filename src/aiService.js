import { supabase } from "./supabase";

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

export async function askAI(prompt) {
  const apiKey = await getGeminiKey();

  if (!apiKey) {
    return "🔑 يرجى الذهاب لإعدادات المدير وإدخال مفتاح Gemini API لتفعيل الشات.";
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await res.json();
    if (data.error) {
      return `⚠️ خطأ في مفتاح الذكاء الاصطناعي: ${data.error.message}`;
    }
    return data.candidates[0].content.parts[0].text;
  } catch (err) {
    return "⚠️ تعذر الاتصال بسيرفر الذكاء الاصطناعي.";
  }
}