import { supabase } from "./supabase";
import { buildSystemPrompt, buildContentParts } from "./lib/aiSystemPrompt";

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

// The AI analysis panel (src/AIPanel.jsx) was originally built against Claude, then the project
// standardized on a single locally-stored Gemini key for all AI features. These Claude-named
// helpers now read/write that same Gemini key so the panel keeps working with one shared key.
export function getClaudeKey() {
  try {
    return localStorage.getItem("gemini_api_key") || "";
  } catch (e) {
    return "";
  }
}

export function saveClaudeKey(key) {
  try {
    localStorage.setItem("gemini_api_key", key);
    if (supabase && supabase.supabaseUrl && !supabase.supabaseUrl.includes("YOUR_")) {
      supabase.from("app_settings").upsert({ key: "gemini_api_key", value: key }, { onConflict: "key" });
    }
    return true;
  } catch (e) {
    return false;
  }
}

export function hasClaudeKey() {
  return !!getClaudeKey();
}

// options.attachments: [{ name, mimeType, base64 }] — images/files sent as inlineData parts
// for Gemini's multimodal analysis. options.user: { id, email, name, role } — the logged-in
// user, folded into the system prompt so the assistant knows who it's replying to.
async function callGemini(prompt, options = {}) {
  const { attachments = [], user = null } = options;
  const apiKey = await getGeminiKey();
  if (!apiKey) throw new Error("يرجى إدخال مفتاح Gemini API من الإعدادات أولاً");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt(user) }] },
      contents: [{ parts: buildContentParts(prompt, attachments) }]
    })
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("لم يصل رد من Gemini");
  return text;
}

// Extracts a JSON object from a model reply, tolerating ```json fences or extra prose around it.
function parseJSONReply(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const jsonSlice = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
  return JSON.parse(jsonSlice);
}

export async function askAI(prompt, options = {}) {
  try {
    return await callGemini(prompt, options);
  } catch (err) {
    return `⚠️ ${err.message || "تعذر الاتصال بسيرفر الذكاء الاصطناعي."}`;
  }
}

export async function analyzeJournalEntries(entries, chartOfAccounts) {
  const prompt = `أنت محاسب خبير. راجع القيود المحاسبية التالية بحثاً عن أخطاء تصنيف الحسابات:
القيود: ${JSON.stringify(entries || [])}
شجرة الحسابات المتاحة: ${JSON.stringify(chartOfAccounts || [])}

أعد النتيجة بصيغة JSON فقط بدون أي نص إضافي، بالشكل التالي:
{
  "summary": "ملخص قصير للتحليل",
  "errors": [
    { "error_type": "نوع الخطأ", "description": "وصف الخطأ", "suggestion": { "account_code": "كود الحساب المقترح", "account_name": "اسم الحساب المقترح", "confidence": "high|medium|low" } }
  ]
}
إن لم توجد أخطاء أعد "errors" كمصفوفة فارغة.`;

  const reply = await callGemini(prompt);
  try {
    return parseJSONReply(reply);
  } catch (e) {
    return { summary: reply, errors: [] };
  }
}

export async function suggestAccount(entryDescription, chartOfAccounts) {
  const prompt = `أنت محاسب خبير. بناءً على وصف القيد التالي: "${entryDescription}"
اقترح أنسب حساب من شجرة الحسابات التالية: ${JSON.stringify(chartOfAccounts || [])}

أعد النتيجة بصيغة JSON فقط بالشكل: { "account_code": "...", "account_name": "...", "confidence": "high|medium|low" }`;

  const reply = await callGemini(prompt);
  return parseJSONReply(reply);
}

export async function generateTemplates(chartOfAccounts, lang) {
  const prompt = `أنت محاسب خبير. بناءً على شجرة الحسابات التالية: ${JSON.stringify(chartOfAccounts || [])}
اقترح 3 إلى 5 قوالب قيود محاسبية شائعة (${lang === "en" ? "in English" : "بالعربية"}).

أعد النتيجة بصيغة JSON فقط بالشكل التالي:
{
  "templates": [
    { "name": "اسم القالب", "description": "وصف قصير", "entries": [ { "account_code": "...", "account_name": "...", "debit": 0, "credit": 0 } ] }
  ]
}`;

  const reply = await callGemini(prompt);
  try {
    return parseJSONReply(reply);
  } catch (e) {
    return { templates: [] };
  }
}

export async function autoFixEntries(entries, chartOfAccounts) {
  const prompt = `أنت محاسب خبير. راجع القيود التالية وصحّح أي حساب مصنّف بشكل خاطئ:
القيود: ${JSON.stringify(entries || [])}
شجرة الحسابات المتاحة: ${JSON.stringify(chartOfAccounts || [])}

أعد النتيجة بصيغة JSON فقط بالشكل التالي:
{
  "fixed_entries": [
    { "original_account_code": "...", "new_account_code": "...", "new_account_name": "...", "reason": "سبب التصحيح" }
  ]
}
إن لم تحتج أي قيود لتصحيح أعد مصفوفة فارغة.`;

  const reply = await callGemini(prompt);
  try {
    return parseJSONReply(reply);
  } catch (e) {
    return { fixed_entries: [] };
  }
}
