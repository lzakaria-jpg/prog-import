import { supabase } from "./supabase";
import { buildSystemPrompt, buildContentParts } from "./lib/aiSystemPrompt";

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

// إضافة خاصة بهذا الشات فقط (لا تُعدَّل aiSystemPrompt.js المشترك مع aiService.js
// - أداة أخرى منفصلة تماماً - حتى لا يتأثر أي شيء خارج الشات). تمنع الموديل من
// الزعم بأنه "أنشأ/صحّح/أرفق" ملفاً فعلياً في رد نصي محادثة عادي، مع أن هذا
// المسار (chatWithAgent) لا يملك أي قدرة توليد ملفات إطلاقاً - توليد الملف
// الحقيقي يتم فقط عبر chartOrganizerAgent.js/aiExcelAgent.js في مسار منفصل
// حتمي بالكود، لا بردّ Gemini النصي. بلا هذا القيد كان الموديل يفبرك جدول
// Markdown "منجَز 100%" كامل بلا أي ملف مرفَق فعلاً - حالة حقيقية شهدها المستخدم.
const CHAT_NO_FABRICATION_ADDENDUM = `

## قيد صارم خاص بهذه المحادثة
أنت تردّ بنص محادثة فقط في هذه الرسالة، ولا تملك أي قدرة على توليد أو حفظ أو إرفاق ملف حقيقي هنا.
ممنوع منعاً باتاً الزعم بأنك "أنشأت"، "صحّحت"، "نظّمت"، "رفعت"، أو "أرفقت" ملفاً، أو أن ملفاً "جاهز"/"متاح بتبويب آخر"، ما لم يصلك تأكيد حقيقي أن ملفاً وُلِّد فعلياً في هذه المحادثة.
إن طلب المستخدم ملفاً منظَّماً أو مصحَّحاً ولم يصلك ملف ناتج فعلي معك الآن، وضّح له بصراحة أنك لا تستطيع توليد الملف في رد نصي، واطلب منه إرسال طلبه مع إرفاق الملف الأصلي مباشرة في نفس الرسالة (مثل: "نظّم لي شجرة الحسابات المرفقة") - هذا يُشغّل أداة التنظيم الفعلية تلقائياً ويولّد ملفاً حقيقياً جاهزاً للرفع.`;

// options.attachments: [{ name, mimeType, base64 }] — images/files pasted or attached in
// chat.jsx, sent as inlineData parts for Gemini's multimodal analysis.
// options.user: { id, email, name, role } — the logged-in user, folded into the system
// prompt so the assistant knows who it's replying to.
export async function chatWithAgent(userPrompt, options = {}) {
  const { attachments = [], user = null } = options;
  const apiKey = await getGeminiKey();

  if (!apiKey) {
    return {
      text: "🔑 يرجى الذهاب لإعدادات المدير وإدخال مفتاح Gemini API لتفعيل الشات.",
      error: true
    };
  }

  try {
    // Direct call to Gemini's API using the locally stored key — no Supabase Edge Function involved.
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt(user) + CHAT_NO_FABRICATION_ADDENDUM }] },
        contents: [{ parts: buildContentParts(userPrompt, attachments) }]
      })
    });

    const data = await res.json();
    if (data.error) {
      // نفرّق بين ازدحام مؤقت بالخدمة (503/429 - "high demand"، "overloaded"،
      // "quota"، "rate limit") وخطأ فعلي بالمفتاح - كانت كل الحالات تُعرَض
      // بنفس تسمية "خطأ في المفتاح" المضلِّلة حتى لو المفتاح سليم تماماً
      // والمشكلة مجرد ازدحام عابر بسيرفرات Gemini.
      const status = data.error.status || "";
      const msg = data.error.message || "";
      const isTransient = res.status === 503 || res.status === 429 ||
        /overloaded|high demand|quota|rate limit|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(`${status} ${msg}`);
      const label = isTransient
        ? "⚠️ الخدمة مزدحمة مؤقتاً، جرّب مرة أخرى بعد لحظات"
        : "⚠️ خطأ في المفتاح";
      return { text: `${label}: ${msg}`, error: true };
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

// Used directly by the chat UI (src/chat.jsx): sends the user's message (plus any pasted/
// attached images or files, and the current user's profile) straight to Gemini with the
// locally configured API key, and returns plain reply text.
export async function generateAIResponse(userPrompt, options = {}) {
  const { text } = await chatWithAgent(userPrompt, options);
  return text;
}