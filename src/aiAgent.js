import { supabase } from "./supabase";
import { buildSystemPrompt } from "./lib/aiSystemPrompt";
import { callClaude, extractText } from "./lib/claudeProxy";

export const AI_AGENT_EMAIL = "ai-agent@system.local";
export const AI_AGENT_NAME_AR = "مساعد قيود (ذكاء اصطناعي)";
export const AI_AGENT_NAME_EN = "Qoyod Assistant (AI)";

// [لا تُلمَس] لا تزالان مستخدَمتين فعلياً - src/lib/aiExcelAgent.js (تحويل ملفات
// إكسل عامة من الشات، مسار Gemini منفصل تماماً عن محادثة @AI النصية أدناه) وإعدادات
// المدير src/auth.jsx (حقل إدخال/حفظ مفتاح Gemini). مسار المحادثة النصية العادية
// (chatWithAgent/generateAIResponse أسفل) لم يعد يعتمد على مفتاح Gemini إطلاقاً بعد
// التحويل لـClaude عبر claudeProxy.js (مفتاح خادم Anthropic، بلا أي إعداد مستخدم).
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
// حتمي بالكود، لا بردّ نصي من الموديل. بلا هذا القيد كان الموديل يفبرك جدول
// Markdown "منجَز 100%" كامل بلا أي ملف مرفَق فعلاً - حالة حقيقية شهدها المستخدم.
const CHAT_NO_FABRICATION_ADDENDUM = `

## قيد صارم خاص بهذه المحادثة
أنت تردّ بنص محادثة فقط في هذه الرسالة، ولا تملك أي قدرة على توليد أو حفظ أو إرفاق ملف حقيقي هنا.
ممنوع منعاً باتاً الزعم بأنك "أنشأت"، "صحّحت"، "نظّمت"، "رفعت"، أو "أرفقت" ملفاً، أو أن ملفاً "جاهز"/"متاح بتبويب آخر"، ما لم يصلك تأكيد حقيقي أن ملفاً وُلِّد فعلياً في هذه المحادثة.
إن طلب المستخدم ملفاً منظَّماً أو مصحَّحاً ولم يصلك ملف ناتج فعلي معك الآن، وضّح له بصراحة أنك لا تستطيع توليد الملف في رد نصي، واطلب منه إرسال طلبه مع إرفاق الملف الأصلي مباشرة في نفس الرسالة (مثل: "نظّم لي شجرة الحسابات المرفقة") - هذا يُشغّل أداة التنظيم الفعلية تلقائياً ويولّد ملفاً حقيقياً جاهزاً للرفع.`;

// ─────────────────────────────────────────────────────────────────────────
// [2026-09] تحويل محادثة @AI العادية (chatWithAgent) من Gemini (مفتاح مستخدم/مدير
// محلي، يتعطل فعلياً بازدحام خدمة Gemini كما شهده المستخدم: "⚠️ الخدمة مزدحمة
// مؤقتاً... This model is currently experiencing high demand") إلى Claude عبر
// نفس الوسيط الموثوق أصلاً بالمشروع (src/lib/claudeProxy.js -> Cloudflare Pages
// Function -> Anthropic API مباشرة بمفتاح خادم، بلا أي إعداد مطلوب من المستخدم) -
// نفس البنية المستخدمة فعلاً وبنجاح لتنظيم شجرة الحسابات (chartOrganizerAiResolver.js).
// aiService.js/AIPanel.jsx (لوحة تحليل منفصلة غير مستخدَمة حالياً بأي أداة) تبقى
// Gemini كما هي بلا أي تعديل - خارج نطاق هذا التغيير تماماً.
const CHAT_MODEL = "claude-sonnet-4-5-20250929";
const MAX_TOKENS = 2048;

function isTransientError(message) {
  return /overloaded|rate.?limit|429|529|502|503|too many requests|capacity|unavailable|مزدحم/i.test(String(message || ""));
}

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

// يبني content blocks بصيغة Anthropic Messages API (لا Gemini inlineData). المرفقات
// النصية (Excel/PDF/Word/CSV/txt) تُستخرَج نصياً مسبقاً بـchat.jsx عبر
// extractAttachmentText وتُدمَج ضمن userPrompt نفسه قبل الوصول لهنا - فلا تصل هذه
// الدالة إلا صور فعلية (أو صيغة نادرة غير مغطاة محلياً مثل .doc القديم، تُهمَل
// بصمت هنا بلا فقدان فعلي: لم تكن مفهومة فعلياً من Gemini's inlineData أيضاً).
function buildClaudeContent(text, attachments) {
  const content = [];
  for (const att of attachments || []) {
    if (!att || !att.base64) continue;
    const mime = att.mimeType || "";
    if (SUPPORTED_IMAGE_TYPES.has(mime)) {
      content.push({ type: "image", source: { type: "base64", media_type: mime, data: att.base64 } });
    }
  }
  content.push({ type: "text", text: text || "" });
  return content;
}

// options.attachments: [{ name, mimeType, base64 }] — صور فقط عملياً (انظر تعليق
// buildClaudeContent أعلاه)، تُرسَل كـimage content blocks لتحليل Claude متعدد الوسائط.
// options.user: { id, email, name, role } — المستخدم الحالي المسجّل دخوله، يُدمَج
// ضمن system prompt ليعرف المساعد من يخاطب.
export async function chatWithAgent(userPrompt, options = {}) {
  const { attachments = [], user = null } = options;

  try {
    const response = await callClaude({
      model: CHAT_MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(user) + CHAT_NO_FABRICATION_ADDENDUM,
      messages: [{ role: "user", content: buildClaudeContent(userPrompt, attachments) }],
    });
    const reply = extractText(response);
    if (!reply) {
      return { text: "⚠️ لم يصل رد. حاول مرة أخرى.", error: true };
    }
    return { text: reply, error: false };
  } catch (err) {
    // نفرّق بين ازدحام مؤقت بخدمة Anthropic (429/529/"overloaded"/"rate limit") وأي
    // خطأ آخر (إعداد خادم ناقص، مفتاح غير صالح...) - بدل تسمية كل شيء بنفس الرسالة
    // المضلِّلة كما كان يحدث سابقاً مع Gemini.
    const msg = err?.message || "";
    const transient = isTransientError(msg);
    const label = transient
      ? "⚠️ الخدمة مزدحمة مؤقتاً، جرّب مرة أخرى بعد لحظات"
      : "⚠️ تعذر الحصول على رد";
    return { text: `${label}${msg ? `: ${msg}` : ""}`, error: true };
  }
}

// Used directly by the chat UI (src/chat.jsx): sends the user's message (plus any pasted/
// attached images, and the current user's profile) to Claude via the server-side proxy,
// and returns plain reply text.
export async function generateAIResponse(userPrompt, options = {}) {
  const { text } = await chatWithAgent(userPrompt, options);
  return text;
}
