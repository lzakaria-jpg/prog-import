// ─────────────────────────────────────────────────────────────────────────
// طبقة الذكاء الاصطناعي (Claude) لتنظيم شجرة الحسابات — تتدخل فقط في الصفوف
// التي عجز المحرك الحتمي (chartOrganizerAgent.js) عن تصنيفها بثقة من اسمها.
//
// تصميم "المفردات المقفلة" (نفس نمط KNOWN_OPS في aiExcelAgent.js): لكل حساب
// غامض تُرسَل قائمة الأنواع المسموحة فقط (candidateTypes، محسوبة سلفاً من فئة
// الحساب الأب الثابتة بقيود) — Claude يختار من هذه القائمة فقط أو يرد null.
// أي رد خارج القائمة، أو استجابة غير صالحة، أو فشل الشبكة/المفتاح، يُرفض صمتاً
// من buildOrganizedChart نفسها (طبقة تحقق ثانية مستقلة تعيد فحص كل اختيار مقابل
// LEVEL3_MAP قبل قبوله) - هذه الدالة لا تكتب لأي حقل بيانات مباشرة إطلاقاً،
// فقط تقترح، والمحرك الحتمي هو من يقرر القبول النهائي.
import { callClaude, extractText } from "./claudeProxy";

// Haiku يكفي تماماً لهذه المهمة الضيقة (اختيار واحد من قائمة قصيرة مقفلة لكل
// حساب) - أسرع وأرخص من Sonnet بلا أي فرق دقة متوقع لمهمة مقفلة بهذا الشكل.
const MODEL = "claude-haiku-4-5-20251001";

function buildPrompt(items) {
  return [
    "أنت مساعد تصنيف محاسبي دقيق لنظام قيود (Qoyod) السعودي.",
    "لكل حساب أدناه: اسمه (وربما وصف)، وقائمة مقفلة \"candidates\" من أنواع الحسابات المسموحة فقط لموضعه في الشجرة.",
    "اختر لكل حساب النوع الأنسب من قائمة candidates الخاصة به فقط - ممنوع اختيار أي نوع غير موجود حرفياً في تلك القائمة لذلك الحساب مهما بدا مناسباً.",
    "إن لم يكن أي نوع من القائمة مناسباً بثقة معقولة، أعد type: null لذلك الحساب بدل التخمين العشوائي.",
    "أعد فقط مصفوفة JSON صالحة بهذا الشكل تماماً، بدون أي نص أو شرح قبلها أو بعدها:",
    '[{"id": "<نفس id المُعطى>", "type": "<نص من candidates حرفياً>" أو null}]',
    "",
    "الحسابات:",
    JSON.stringify(items),
  ].join("\n");
}

function parseChoices(text) {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  try {
    const data = JSON.parse(clean);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

/**
 * aiTypeResolver المتوقعة من buildOrganizedChart في chartOrganizerAgent.js.
 * @param {Array<{id:string, nameAr:string, nameEn:string, desc:string, candidateTypes:string[]}>} ambiguousRows
 * @returns {Promise<Map<string,string>>} id -> النوع المختار (فقط للصفوف التي رجع لها اختيار صالح)
 */
export async function resolveAmbiguousTypesWithClaude(ambiguousRows) {
  const decisions = new Map();
  if (!ambiguousRows || !ambiguousRows.length) return decisions;

  const items = ambiguousRows.map((r) => ({
    id: r.id,
    name: [r.nameAr, r.nameEn].filter(Boolean).join(" / "),
    desc: r.desc || "",
    candidates: r.candidateTypes || [],
  }));

  const response = await callClaude({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: buildPrompt(items) }],
  });
  const choices = parseChoices(extractText(response));

  choices.forEach((choice) => {
    if (choice && choice.id !== undefined && choice.id !== null && choice.type) {
      decisions.set(choice.id, choice.type);
    }
  });
  return decisions;
}

// ─────────────────────────────────────────────────────────────────────────
// مطابقة أعمدة بالذكاء الاصطناعي — فقط للحقول التي عجز الاكتشاف الحتمي
// (autoDetectMapping في MergeTool.jsx) عن مطابقتها، وهذا يحدث فعلياً مع ملفات
// مُصدَّرة من أنظمة أخرى برؤوس أعمدة مختصرة غير معروفة (مثال حقيقي: acc_arab،
// acc_lati، acc_levl...). القيد الحتمي هنا: أي index يقترحه Claude يُتحقَّق من
// كونه ضمن نطاق أعمدة الملف الفعلي فقط ولا يتكرر بين حقلين - أي رد آخر يُرفض
// صمتاً (نفس نمط KNOWN_OPS/validatePlan)، ولا يُستبدَل أبداً بأي مطابقة حتمية
// واثقة أصلاً (يُستدعى فقط للحقول -1 المتبقية).
const FIELD_LABELS = {
  code: "رمز الحساب", nameAr: "الاسم العربي", nameEn: "الاسم الانجليزي (أو أي اسم بديل إن لم يوجد عمود عربي)",
  level: "مستوى الحساب في الشجرة (رقم صغير: 1 جذر، 2 فئة، 3 فأكثر تفاصيل)",
  parent: "رمز الحساب الرئيسي (الأب) لهذا الحساب", type: "نوع الحساب (نص صريح إن وجد عمود له)",
  desc: "وصف أو ملاحظات على الحساب", debit: "مدين", credit: "دائن",
  payCollect: "يمكن الدفع والتحصيل بهذا الحساب (نعم/لا)",
};

function buildColumnMappingPrompt(columns, missingFields) {
  return [
    "أدناه رؤوس أعمدة ملف إكسل خام لشجرة حسابات (تصدير من نظام محاسبي آخر غير قيود)، مع فهرس (index) كل عمود.",
    "وقائمة حقول مطلوبة لم يُكتشف عمودها المطابق تلقائياً.",
    "طابق كل حقل بعمود واحد فقط من الأعمدة المذكورة (بحسب index) إن وُجد ما يقابله بوضوح فعلاً - أو null إن لم يوجد عمود مناسب لذلك الحقل إطلاقاً (لا تخمين، الأفضل null من مطابقة خاطئة).",
    "ممنوع اختيار index غير موجود بالقائمة أدناه، وممنوع إسناد نفس index لأكثر من حقل واحد.",
    "أعد فقط JSON صالح على شكل: {\"code\": index أو null, \"nameAr\": ..., ...} بنفس أسماء الحقول المذكورة تماماً، بدون أي نص إضافي قبله أو بعده.",
    "",
    "الأعمدة المتاحة: " + JSON.stringify(columns),
    "الحقول المطلوبة: " + JSON.stringify(missingFields.map((f) => ({ field: f, meaning: FIELD_LABELS[f] || f }))),
  ].join("\n");
}

/**
 * aiColumnMappingResolver المتوقعة من organizeChartOfAccounts في chartOrganizerAgent.js.
 * @param {string[]} headerRow صف رؤوس الأعمدة الفعلي بالملف (بترتيبه الأصلي)
 * @param {Record<string, number>} currentMapping المطابقة الحتمية الحالية (-1 = غير مكتشف)
 * @returns {Promise<Record<string, number>>} فقط الحقول التي رجع لها index صالح ومؤكَّد
 */
export async function resolveColumnMappingWithClaude(headerRow, currentMapping) {
  const missingFields = Object.keys(FIELD_LABELS).filter((f) => (currentMapping || {})[f] === -1 || (currentMapping || {})[f] === undefined);
  if (!missingFields.length) return {};

  const columns = (headerRow || []).map((h, i) => ({ index: i, header: String(h || "").trim() })).filter((c) => c.header);
  if (!columns.length) return {};

  let response;
  try {
    response = await callClaude({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: buildColumnMappingPrompt(columns, missingFields) }],
    });
  } catch (err) {
    return {};
  }

  const clean = String(extractText(response) || "").replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (err) {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const usedIndices = new Set();
  const result = {};
  missingFields.forEach((field) => {
    const idx = parsed[field];
    if (
      Number.isInteger(idx) && idx >= 0 && idx < headerRow.length &&
      !usedIndices.has(idx)
    ) {
      result[field] = idx;
      usedIndices.add(idx);
    }
  });
  return result;
}
