import { supabase } from "./supabase";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

function getApiKey() {
  return supabase._apiKey || null;
}

async function callClaude(systemPrompt, userMessage, maxTokens = 4096) {
  const key = localStorage.getItem("qoyod_claude_key");
  if (!key) throw new Error("Claude API key not configured");

  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// ─── Smart Analysis: Detect wrong account usage ───────────────────────────

export async function analyzeJournalEntries(entries, chartOfAccounts) {
  const systemPrompt = `أنت محلل محاسبي ذكي متخصص في الحسابات السعودية (قيود). مهمتك تحليل القيود اليومية واقتراح التصحيحات.

قواعد مهمة:
- الحسابات الأبوية (المستوى الأول والثاني) عادة لا تُسجل عليها قيود مباشرة
- إذا وجدت قيداً على حساب أب، اقترح الحسابات الفرعية المناسبة بناءً على تشابه الأسماء
- اكتشف الأخطاء الشائعة: قيود على حسابات بنكية بدون تفصيل، مصروفات عامة بدون تحليل، إلخ

أرجع النتيجة بصيغة JSON فقط (بدون markdown) بالشكل التالي:
{
  "errors": [
    {
      "entry_index": رقم,
      "account_code": "رمز الحساب",
      "account_name": "اسم الحساب",
      "error_type": "parent_account_entry" أو "wrong_category" أو "missing_detail",
      "description": "وصف المشكلة بالعربي",
      "suggestion": {
        "account_code": "الحساب البديل المقترح",
        "account_name": "اسم الحساب البديل",
        "confidence": عالloon_أو_متوسط_أو_منخفض
      }
    }
  ],
  "summary": "ملخص عام بالعربي",
  "total_errors": رقم
}`;

  const userMessage = `القيود:
${JSON.stringify(entries.slice(0, 100), null, 2)}

شجرة الحسابات:
${JSON.stringify(chartOfAccounts.slice(0, 200), null, 2)}

حلل القيود واقتصر على الأخطاء الفعلية فقط.`;

  const result = await callClaude(systemPrompt, userMessage);
  try {
    return JSON.parse(result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch {
    return { errors: [], summary: result, total_errors: 0 };
  }
}

// ─── Smart Account Suggestion ──────────────────────────────────────────────

export async function suggestAccount(codeOrName, chartOfAccounts) {
  const systemPrompt = `أنت محلل محاسبي ذكي. المستخدم يبحث عن حساب مناسب من شجرة الحسابات.
أعد أفضل 3 حسابات مناسبة بصيغة JSON فقط:
{
  "suggestions": [
    {
      "code": "الرمز",
      "name": "الاسم",
      "reason": "سبب الاختيار بالعربي",
      "confidence": "high" أو "medium" أو "low"
    }
  ]
}`;

  const userMessage = `البحث: ${codeOrName}

الحسابات المتاحة:
${JSON.stringify(chartOfAccounts.slice(0, 300), null, 2)}`;

  const result = await callClaude(systemPrompt, userMessage);
  try {
    return JSON.parse(result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch {
    return { suggestions: [] };
  }
}

// ─── Generate Templates ───────────────────────────────────────────────────

export async function generateTemplates(chartOfAccounts, language = "ar") {
  const systemPrompt = `أنت محلل محاسبي ذكي. قدم 10 قوالب قيود يومية شائعة بالعربي. قواعد:
- استخدم الحسابات الموجودة في شجرة الحسابات
- اكتب الأسماء بالعربي أو بالإنجليزي حسب اللغة المطلوبة
- اعترف بالفواتير الضريبية (VAT) إذا وجدت

أعد النتيجة بصيغة JSON فقط:
{
  "templates": [
    {
      "name": "اسم القالب",
      "description": "وصف مختصر",
      "entries": [
        {
          "account_code": "الرمز",
          "account_name": "الاسم",
          "debit": مبلغ_فرضي,
          "credit": 0,
          "description": "وصف القيد"
        }
      ]
    }
  ]
}`;

  const userMessage = `اللغة: ${language === "ar" ? "عربي" : "إنجليزي"}

شجرة الحسابات:
${JSON.stringify(chartOfAccounts.slice(0, 200), null, 2)}

ولّد قوالب مناسبة.`;

  const result = await callClaude(systemPrompt, userMessage);
  try {
    return JSON.parse(result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch {
    return { templates: [] };
  }
}

// ─── Quick Fix: Auto-fix parent account entries ───────────────────────────

export async function autoFixEntries(entries, chartOfAccounts) {
  const systemPrompt = `أنت محاسبي ذكي. مهمتك تصحيح القيود التي على حسابات أبوية (ليست بنوك/صندوق/髓子 direct).

القاعدة: إذا كان القيد على حساب أب (مثل "مصروفات" بدون تفصيل)، قارنه بأقرب حساب فرعي مناسب.

أعد JSON فقط:
{
  "fixed_entries": [
    {
      "original_index": رقم,
      "original_account_code": "الرمز الأصلي",
      "new_account_code": "الرقم الجديد",
      "new_account_name": "الاسم الجديد",
      "reason": "السبب بالعربي"
    }
  ],
  "skipped": [
    {
      "index": رقم,
      "reason": "لماذا ما تم تعديله"
    }
  ]
}`;

  const userMessage = `القيود:
${JSON.stringify(entries.slice(0, 80), null, 2)}

شجرة الحسابات:
${JSON.stringify(chartOfAccounts.slice(0, 200), null, 2)}

صحح القيود.`;

  const result = await callClaude(systemPrompt, userMessage);
  try {
    return JSON.parse(result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch {
    return { fixed_entries: [], skipped: [] };
  }
}

// ─── Settings: Save/Load API Key ──────────────────────────────────────────

export function saveClaudeKey(key) {
  localStorage.setItem("qoyod_claude_key", key);
}

export function getClaudeKey() {
  return localStorage.getItem("qoyod_claude_key") || "";
}

export function hasClaudeKey() {
  return !!localStorage.getItem("qoyod_claude_key");
}
