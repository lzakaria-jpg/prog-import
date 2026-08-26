// ─── AI Agent Service (Google Gemini) ──────────────────────────────
// Free tier: 15 RPM, 1M tokens. No cost.

import { supabase } from "./supabase";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// ─── App Knowledge (System Prompt) ─────────────────────────────────

const SYSTEM_PROMPT = `أنت مساعد ذكي اسمك "مساعد قيود" (Qoyod Assistant). أنت تابع لتطبيق "مدقق استيراد القيود" وهو تطبيق محاسبي لتقييم وتجهيز القيود اليومية للاستيراد على نظام قيود.

## معلومات عن التطبيق:

### التبويب الأول: استيراد القيود (Journal Import)
- يدعم ملفات Excel (.xlsx, .xls), PDF, Word (.docx)
- يرفع شجرة الحسابات + ملف القيود
- يفحص: صيغة التاريخ dd/mm/yyyy، مدين = دائن لكل قيد، إجمالي القيد لا يجوز صفراً
- لا يجوز الترحيل على حساب رئيسي له حسابات فرعية
- فيه "تحليل ذكي" بدون إنترنت: يكشف حسابات الأب، يقترح الفرعية، يصحح تلقائياً
- فيه "قوالب جاهزة": فاتورة مبيعات، فاتورة مشتريات، رواتب، مصروفات
- فيه "مراجعة ذكية" (AI Review) تحتاج مفتاح Anthropic API (مدفوع)
- ي下行 ملف Excel جاهز للاستيراد على قيود

### التبويب الثاني: مطابقة الشجرة (Chart Merge)
- يدمج شجرتين حسابات أو يحدث حسابات موجودة
- يدعم: تحديث فقط، إضافة جديدة، إضافة + تحديث
- يشوف الفروقات بين الشجرتين ويعرضها
- يعرض الشجرة بشكل شجري تفاعلي

### الشات:
- شات عام بين كل المستخدمين
- رسائل خاصة بين المستخدمين
- إرفاق ملفات (Excel, PDF, صور)
- تعديل وحذف وأرشفة الرسائل
- إشعارات صوتية

### إدارة المستخدمين (للادمن فقط):
- إضافة/حذف مستخدمين من الـ whitelist
- تسجيل الدخول بالإيميل فقط (بدون كلمة مرور)

### التحديث التلقائي:
- التطبيق يتحقق من GitHub تلقائياً عند التشغيل
- لو في إصدار جديد → يظهر "تحديث متاح"
- يتنزّل ويُثبّت تلقائياً

## قواعد مهمة:
1. رد باللغة التي يكتب بها المستخدم (عربي أو إنجليزي)
2. كن مختصراً ومفيداً
3. لو سألوك عن شي خارج التطبيق، قول إنك مساعد للتطبيق فقط
4. لو أرسلوا لك ملف Excel، قارن الاسم وقل هل يناسب التطبيق (قيمود) أو لا
5. لا تعطي معلومات خاطئة عن وظائف التطبيق
6. لو ما تعرف الجواب، قول "ما عندي معلومات كافية عن هذا الموضوع"

## ردود نموذجية:
- سؤال: "كيف أرفع ملف القيود؟" → جواب: "من تبويب 'استيراد القيود'، اضغط على منطقة الرفع و اختار ملف Excel أو PDF أو Word"
- سؤال: "التطبيق يدعم PDF؟" → جواب: "نعم! يدعم Excel, PDF, و Word"
- سؤال: "كيف أسوي مطابقة شجرة؟" → جواب: "من تبويب 'مطابقة الشجرة'، ارفع شجرة الحسابات القديمة والجديدة، واختر نوع التحديث"
`;

// ─── API Key Management ────────────────────────────────────────────

export async function getGeminiKey() {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "gemini_api_key")
      .single();
    return data?.value || null;
  } catch { return null; }
}

export async function saveGeminiKey(key) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "gemini_api_key", value: key, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return !error;
}

export async function hasGeminiKey() {
  const key = await getGeminiKey();
  return !!key && key.length > 10;
}

// ─── Chat History (per conversation) ───────────────────────────────

const chatHistories = new Map();

function getHistory(channelKey) {
  if (!chatHistories.has(channelKey)) {
    chatHistories.set(channelKey, []);
  }
  return chatHistories.get(channelKey);
}

function addToHistory(channelKey, role, text) {
  const history = getHistory(channelKey);
  history.push({ role, parts: [{ text }] });
  // Keep last 20 messages for context
  if (history.length > 20) history.splice(0, history.length - 20);
}

// ─── Send Message to Gemini ─────────────────────────────────────────

export async function chatWithAgent(message, channelKey = "default", fileContext = null) {
  const apiKey = await getGeminiKey();
  if (!apiKey) {
    return { error: true, text: "⚠️ مفتاح Gemini API غير مُعد. يرجى إضافته من إعدادات الادمن." };
  }

  // Build user message
  let userText = message;
  if (fileContext) {
    userText += `\n\n📎 الملف المرفق: ${fileContext.name} (${fileContext.type}, ${fileContext.size})`;
  }

  // Add to history
  addToHistory(channelKey, "user", userText);

  // Build request
  const contents = [
    { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
    { role: "model", parts: [{ text: "أهلاً! أنا مساعد قيود الذكي. كيف أقدر أساعدك اليوم؟ 😊" }] },
    ...getHistory(channelKey),
  ];

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("[AI Agent] Gemini error:", err);
      const msg = err?.error?.message || `HTTP ${response.status}`;
      return { error: true, text: `⚠️ خطأ في الاتصال بالذكاء الاصطناعي: ${msg}` };
    }

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "لم أتمكن من إنشاء رد.";

    // Add to history
    addToHistory(channelKey, "model", reply);

    return { error: false, text: reply };
  } catch (err) {
    console.error("[AI Agent] Network error:", err);
    return { error: true, text: "⚠️ خطأ في الاتصال. تأكد من اتصالك بالإنترنت." };
  }
}

// ─── Detect if message is for AI Agent ─────────────────────────────

export const AI_AGENT_EMAIL = "ai-agent@qoyod.app";
export const AI_AGENT_NAME_AR = "مساعد قيود";
export const AI_AGENT_NAME_EN = "Qoyod Assistant";

export function isMessageForAgent(message, isPublicChannel) {
  if (!message) return false;
  const lower = message.toLowerCase();
  // Mentions in public chat
  if (isPublicChannel && (lower.startsWith("@ai") || lower.startsWith("@مساعد") || lower.startsWith("@المساعد"))) {
    return true;
  }
  return false;
}

export function cleanMessageForAgent(message) {
  return message
    .replace(/^@\w+\s*/, "")
    .replace(/^@[\u0600-\u06FF]+\s*/, "")
    .trim();
}

// ─── Check if AI Agent is available ────────────────────────────────

export async function isAgentAvailable() {
  return await hasGeminiKey();
}

// ─── Clear conversation history ─────────────────────────────────────

export function clearHistory(channelKey) {
  chatHistories.delete(channelKey);
}
