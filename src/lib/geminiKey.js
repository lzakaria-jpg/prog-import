import { supabase } from "../supabase";

// مصدر واحد لقراءة/حفظ مفتاح Gemini — كانت نفس الدالتين مكررتين حرفياً بين
// aiAgent.js وaiService.js (كل ملف عنده نسخته الخاصة). أُخرجتا هنا بلا أي
// تغيير بالمنطق، وaiAgent.js/aiService.js يستوردانهما من هنا الآن.
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
