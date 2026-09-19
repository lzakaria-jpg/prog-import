import {
  TYPE_TO_LEVEL2, LEVEL2_TO_LEVEL1, LEVEL3_MAP,
  matchExactLevel2Category, matchLevel1RootByKeyword, level3TypesForRoot, inferLevel3TypeFromText,
  DEFAULT_LEVEL2_BY_ROOT, DEFAULT_TYPE_BY_LEVEL2, LEVEL1_ROOT_TYPES,
} from "../MergeTool.jsx";

// Every one of Qoyod's fixed Level-3 types has one natural parent among the 12 Level-2 types.
//
// [إصلاح جذري 2026-09] كان هذا الجدول نسخة ثانية مستقلة من تصنيف قيود، ويناقض جدول
// المحرك (TYPE_TO_LEVEL2 في MergeTool.jsx — المستخدَم فعليًا بأداة الشجرة ومحرك
// التنظيم) في 8 أنواع، فينتج الحسابُ نفسه تحت فئة مختلفة حسب الأداة التي أنشأته:
//   مخصص الديون المشكوك في تحصيلها / مجمع الإطفاء / مجمع الاستهلاك ← حسابات مقابلة
//     (contra) تضعها قيود تحت "الالتزامات المتداولة" لا تحت الأصول
//   ترجمة عملات أجنبية، الزكاة ← "تكاليف غير تشغيلية"
//   ضمان حسن التنفيذ ← "الالتزامات غير المتداولة"
//   "ضرائب" ← لم يكن نوعًا موجودًا بقيود إطلاقًا؛ الصحيح "الضرائب" (تكاليف غير تشغيلية)
//   "الضريبة" ← ليس نوعًا حقيقيًا بل قيمة المحرك الدلالية لـ"غير مصنَّف"
//     (UNMAPPED_TYPE)، فحُذف من هذا الجدول ونُقلت مرادفاته لنوع ضريبة القيمة
//     المضافة المستحقة الحقيقي.
// وقد صُحِّحت هنا لتطابق المحرك حرفيًا، وأصبح level2ForType يسأل المحرك أولًا حتى لا
// يتكرر الانفصال بينهما مستقبلًا.
export const LEVEL3_TO_LEVEL2 = {
  "المدينون": "الأصول المتداولة",
  "حساب البنك": "الأصول المتداولة",
  "سلف موظفين": "الأصول المتداولة",
  "المخزون": "الأصول المتداولة",
  "مخزون قطع غيار أصول": "الأصول المتداولة",
  "النقدية ومافي حكمها": "الأصول المتداولة",
  "أصول متداولة أخرى": "الأصول المتداولة",
  "عهد نقدية": "الأصول المتداولة",
  "مصروفات مقدمة": "الأصول المتداولة",
  "مخصص الديون المشكوك في تحصيلها": "الالتزامات المتداولة", // حساب مقابل (contra) — قيود تضعه تحت الالتزامات المتداولة
  "أصول غير ملموسة": "الأصول غير المتداولة",
  "أصول غير متداولة أخرى": "الأصول غير المتداولة",
  "عقارات وآلات ومعدات": "الأصول غير المتداولة",
  "مجمع الإطفاء": "الالتزامات المتداولة", // حساب مقابل (contra)
  "مجمع الاستهلاك": "الالتزامات المتداولة", // حساب مقابل (contra)
  "استثمارات بشركة تابعة": "الأصول غير المتداولة",
  "مشاريع تحت التنفيذ": "الأصول غير المتداولة",
  "رأس المال الإضافي المدفوع": "رأس المال المصدر",
  "رأس المال": "رأس المال المصدر",
  "حقوق الموظفين": "حقوق الملاك الأخرى",
  "حقوق ملكية أخرى": "حقوق الملاك الأخرى",
  "الاحتياطيات": "حقوق الملاك الأخرى",
  "ترجمة عملات أجنبية": "تكاليف غير تشغيلية",
  "الأرباح المبقاة (أو الخسائر)": "الأرباح المبقاة",
  "توزيع الأرباح": "الأرباح المبقاة",
  "تكلفة المبيعات": "التكلفة المباشرة",
  "تكاليف مباشرة أخرى": "التكلفة المباشرة",
  "مصروف فوائد": "تكاليف غير تشغيلية",
  "الضرائب": "تكاليف غير تشغيلية", // الاسم الصحيح بقيود هو "الضرائب" — "ضرائب" لم يكن نوعًا موجودًا إطلاقًا
  "مصاريف الإطفاء": "تكاليف تشغيلية",
  "مصاريف الاستهلاك": "تكاليف تشغيلية",
  "مكافآت وحوافز": "تكاليف تشغيلية",
  "مصاريف عمومية وإدارية": "تكاليف تشغيلية",
  "مصاريف تسويقية": "تكاليف تشغيلية",
  "تكاليف تشغيلية أخرى": "تكاليف تشغيلية",
  "الرواتب": "تكاليف تشغيلية",
  "مصاريف تقنية واستشارية": "تكاليف تشغيلية",
  "مصاريف البحث والتطوير": "تكاليف تشغيلية",
  "الدائنون": "الالتزامات المتداولة",
  "مصاريف مستحقة": "الالتزامات المتداولة",
  "الرواتب والمبالغ المستحقة للموظفين": "الالتزامات المتداولة",
  "التزامات متداولة أخرى": "الالتزامات المتداولة",
  "مخصصات": "الالتزامات المتداولة",
  "قروض قصيرة الأجل": "الالتزامات المتداولة",
  "الضرائب المستحقة": "الالتزامات المتداولة",
  "الإيرادات المقدمة": "الالتزامات المتداولة",
  "الزكاة": "تكاليف غير تشغيلية",
  "الزكاة المستحقة": "الالتزامات المتداولة",
  "ضريبة القيمة المضافة المستحقة": "الالتزامات المتداولة",
  "فوائد مستحقة": "الالتزامات المتداولة",
  "الجزء المتداول من التزامات طويلة أجل": "الالتزامات المتداولة",
  "ضمان حسن التنفيذ": "الالتزامات غير المتداولة",
  "قروض طويلة الأجل": "الالتزامات غير المتداولة",
  "التزامات غير متداولة أخرى": "الالتزامات غير المتداولة",
  "مخصص مكافأة نهاية الخدمة": "الالتزامات غير المتداولة",
  "إيرادات أخرى": "الإيرادات الأخرى",
  "مكاسب/خسائر بيع أصول": "الإيرادات الأخرى",
  "مكاسب/خسائر بيع أصول غير ملموسة": "الإيرادات الأخرى",
  "المبيعات": "المبيعات",
};

// Keyword/synonym hints per type, built from common Arabic phrasings seen across real charts
// of accounts. Matching is substring-based over normalized (diacritics/spacing-insensitive) text.
const SYNONYMS = {
  "المدينون": ["مدين", "عملاء", "عميل", "ذمم مدينة", "ذمم العملاء"],
  "حساب البنك": ["بنك", "حساب جاري", "حساب بنكي", "راجحي", "أهلي", "الأهلي", "STC Pay", "مدى"],
  "سلف موظفين": ["سلفة", "سلف موظف", "سلفة موظف", "قرض موظف"],
  "المخزون": ["مخزون", "بضاعة", "بضائع", "مستودع"],
  "النقدية ومافي حكمها": ["نقدية", "صندوق", "كاش", "خزينة"],
  "عهد نقدية": ["عهدة", "عهد", "عهدة موظف", "عهدة مؤقتة"],
  "مصروفات مقدمة": ["مقدم", "مدفوعات مقدمة", "دفعة مقدمة", "إيجار مقدم", "تأمين مقدم"],
  "أصول غير ملموسة": ["غير ملموسة", "شهرة", "براءة اختراع", "علامة تجارية", "برمجيات مرخصة"],
  "عقارات وآلات ومعدات": ["أثاث", "معدات", "سيارات", "عقار", "مبنى", "آلات", "أجهزة", "مكيف", "حاسوب", "كمبيوتر"],
  "مجمع الإطفاء": ["مجمع إطفاء", "إطفاء متراكم"],
  "مجمع الاستهلاك": ["مجمع استهلاك", "استهلاك متراكم"],
  "استثمارات بشركة تابعة": ["استثمار", "شركة تابعة", "شركة زميلة"],
  "مشاريع تحت التنفيذ": ["تحت التنفيذ", "مشروع قيد الإنشاء", "أعمال قيد التنفيذ"],
  "رأس المال": ["رأس مال", "رأس المال", "رأسمال"],
  "رأس المال الإضافي المدفوع": ["رأس مال إضافي", "علاوة إصدار"],
  "حقوق الموظفين": ["حقوق موظفين", "حصة موظف"],
  "حقوق ملكية أخرى": ["حقوق ملكية", "حقوق ملاك"],
  "الاحتياطيات": ["احتياطي", "احتياطيات"],
  "ترجمة عملات أجنبية": ["ترجمة عملة", "فروق عملة", "فروقات صرف"],
  "الأرباح المبقاة (أو الخسائر)": ["أرباح مبقاة", "أرباح محتجزة", "خسائر متراكمة"],
  "توزيع الأرباح": ["توزيع أرباح", "توزيعات"],
  "تكلفة المبيعات": ["تكلفة مبيعات", "تكلفة البضاعة المباعة"],
  "مصروف فوائد": ["فوائد", "فائدة قرض", "مصروف فائدة"],
  "الضرائب": ["ضريبة الدخل", "ضريبة"],
  "مصاريف الإطفاء": ["إطفاء", "مصروف إطفاء"],
  "مصاريف الاستهلاك": ["استهلاك", "مصروف استهلاك", "إهلاك"],
  "مكافآت وحوافز": ["مكافأة", "حوافز", "بونص", "مكافآت"],
  "مصاريف عمومية وإدارية": ["إدارية", "عمومية", "مصاريف مكتب", "قرطاسية", "كهرباء", "ماء", "اتصالات", "إيجار مكتب"],
  "مصاريف تسويقية": ["تسويق", "إعلان", "دعاية", "ماركتينج"],
  "الرواتب": ["راتب", "رواتب", "أجور"],
  "مصاريف تقنية واستشارية": ["استشارات", "استشاري", "تقنية", "برمجة", "استضافة", "دومين", "DIGITALOCEAN", "AWS"],
  "مصاريف البحث والتطوير": ["بحث وتطوير", "تطوير منتج"],
  "الدائنون": ["دائن", "موردين", "مورد", "ذمم دائنة", "ذمم الموردين"],
  "مصاريف مستحقة": ["مستحقة", "مصروف مستحق"],
  "الرواتب والمبالغ المستحقة للموظفين": ["رواتب مستحقة", "مبالغ مستحقة للموظفين"],
  "قروض قصيرة الأجل": ["قرض قصير", "تمويل قصير الأجل"],
  "الضرائب المستحقة": ["ضريبة مستحقة"],
  "الإيرادات المقدمة": ["إيراد مقدم", "دفعات مقدمة من عملاء"],
  "الزكاة": ["زكاة"],
  "الزكاة المستحقة": ["زكاة مستحقة"],
  "ضريبة القيمة المضافة المستحقة": ["ضريبة مضافة مستحقة", "vat مستحق", "ضريبة القيمة المضافة", "قيمة مضافة", "VAT"],
  "فوائد مستحقة": ["فائدة مستحقة"],
  "قروض طويلة الأجل": ["قرض طويل", "تمويل طويل الأجل"],
  "مخصص مكافأة نهاية الخدمة": ["نهاية الخدمة", "مكافأة نهاية خدمة"],
  "إيرادات أخرى": ["إيراد آخر", "إيرادات متنوعة", "تبرعات", "دعم", "منحة"],
  "المبيعات": ["مبيعات", "بيع", "إيراد المبيعات", "دخل المبيعات"],
};

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u0652]/g, "") // strip Arabic diacritics
    .replace(/\s+/g, " ")
    .trim();
}

// Returns { type, confidence } — confidence is "high" (exact/synonym hit) or "none".
// Scores every candidate keyword/type-name that appears in the input and keeps the LONGEST
// match, so a specific phrase (e.g. "قرض طويل") wins over a shorter generic one (e.g. "بنك")
// that happens to also appear in the text.
//
// [إضافة] candidateTypes (اختياري): يقصر البحث على مجموعة فرعية من الأنواع الـ59 —
// يُستخدَم من classifyMissingAccount أدناه لإعادة محاولة مطابقة الاسم ضمن فئة
// مستوى2 استنتجها رمز الحساب فقط (بدل كل الأنواع)، حين يتعارض الاسم مطابَقاً
// بلا قيود مع فئة الرمز، أو حين لا يوجد له تطابق عام إطلاقاً. بلا هذا الوسيط
// (الحالة الافتراضية) السلوك مطابق تماماً لما كان عليه دوماً — كل مستدعٍ حالي
// (AccountsTool.jsx) يستدعيها بوسيط واحد فيبقى بلا أي تغيير.
export function matchAccountType(rawName, candidateTypes) {
  const name = normalize(rawName);
  if (!name) return { type: "", confidence: "none" };
  const allowed = candidateTypes ? new Set(candidateTypes) : null;

  let best = null; // { type, len }

  for (const type of Object.keys(LEVEL3_TO_LEVEL2)) {
    if (allowed && !allowed.has(type)) continue;
    const nType = normalize(type.replace(/\(.*?\)/g, ""));
    if (nType && (name.includes(nType) || nType.includes(name))) {
      const len = Math.min(nType.length, name.length) + (nType === name ? 1000 : 0);
      if (!best || len > best.len) best = { type, len };
    }
  }
  for (const [type, words] of Object.entries(SYNONYMS)) {
    if (allowed && !allowed.has(type)) continue;
    for (const w of words) {
      const nw = normalize(w);
      if (nw && name.includes(nw)) {
        if (!best || nw.length > best.len) best = { type, len: nw.length };
      }
    }
  }

  return best ? { type: best.type, confidence: "high" } : { type: "", confidence: "none" };
}

// أول رقم بالرمز = جذر الحساب بقيود (1 أصول، 2 التزامات، 3 حقوق ملاك، 4 إيرادات،
// 5 مصاريف) — نفس القاعدة المثبَّتة بالمحرك (CODE_ROOT_BY_FIRST_DIGIT). تُستخدَم
// لتوليد رموز الفئات (م2) داخل مدى جذرها الصحيح بدل أول رقم فارغ أيًا كان جذره.
const ROOT_NAME_TO_DIGIT = {
  "الأصول": "1", "الالتزامات": "2", "حقوق الملاك": "3", "الإيرادات": "4", "المصاريف": "5",
};
function normalizeRootName(name) {
  return String(name || "").replace(/[إأآ]/g, "ا").replace(/ة/g, "ه").trim();
}
export function rootDigitForLevel2(level2Type) {
  const rootName = LEVEL2_TO_LEVEL1[level2Type];
  if (!rootName) return "";
  const target = normalizeRootName(rootName);
  const hit = Object.keys(ROOT_NAME_TO_DIGIT).find((k) => normalizeRootName(k) === target);
  return hit ? ROOT_NAME_TO_DIGIT[hit] : "";
}

export function level2ForType(level3Type) {
  // المحرك (MergeTool.jsx) هو المصدر الوحيد للحقيقة في تصنيف قيود الثابت؛ الجدول
  // المحلي أعلاه يبقى كاحتياط فقط (ولمطابقة الأسماء بـmatchAccountType).
  return TYPE_TO_LEVEL2[level3Type] || LEVEL3_TO_LEVEL2[level3Type] || "";
}

// ============================================================================
// [إضافة] طلب المستخدم الصريح: "رمز الحساب مهم جدًا بتحديد نوع الحساب بعد جلب
// شجرة حسابات العميل ومعرفة أرقام جميع أنواع الحسابات لإتمام المطابقة بشكل
// صحيح" — مثال حقيقي منه: عميل تُرقَّم عنده الأصول المتداولة/غير المتداولة
// 11/12 بالضبط كالمعتاد، لكن آخر يستخدم الجذر 2 (لا 4) لإيراداته — فلا يجوز
// افتراض ترقيم قياسي ثابت (1=أصول، 2=التزامات...) دومًا؛ التعلّم يكون من شجرة
// حسابات هذا العميل نفسه أولًا، لا من افتراض عام.
//
// [تحديث لاحق، طلب صريح آخر من المستخدم: "لسا مش شغال 100%"] الجولة الأولى
// استخدمت مطابقة اسمية محلية بسيطة (SYNONYMS أعلاه) بدل محرك التصنيف الحقيقي
// المستخدَم فعليًا بأداة استيراد شجرة الحسابات (MergeTool.jsx: KEYWORD_SYNONYMS
// الأشمل بكثير + matchLevel1RootByKeyword + inferLevel3TypeFromText)، فأخفقت
// بأمثلة حقيقية منه (حساب "حقوق الملكية" — تهجئة لا يطابقها SYNONYMS المحلي
// إطلاقًا رغم أنها مغطاة فعلاً بالمحرك الحقيقي كمرادف جذر معروف). الآن تُستخدَم
// دوال المحرك الحقيقي حصرًا لأي مطابقة نصية بهذا القسم — matchAccountType/
// SYNONYMS المحليان أعلاه يبقيان بلا أي تغيير (لا يزال يستخدمهما AccountsTool.jsx
// وحده، ولا علاقة لهما بهذا القسم بعد الآن).
// ============================================================================

/**
 * يبني فهرس {رمز الحساب الفعلي: {level2Category?, level1Root}} من شجرة حسابات
 * العميل الحقيقية (chartAccounts: يكفي منها code + name). لكل حساب:
 *  - مطابقة دقيقة فقط (matchExactLevel2Category — اسم الفئة الرسمي حرفيًا أو
 *    أحد مرادفاته الصريحة، لا تشابه تقريبي) → لافتة فئة (مستوى2) موثوقة.
 *  - وإلا، مطابقة كلمة مفتاحية لجذر مستوى1 فقط (matchLevel1RootByKeyword —
 *    يغطي "حقوق الملكية" كمرادف معروف لجذر "حقوق الملاك" مثلاً) → لافتة جذر
 *    فقط بلا فئة محددة (عمداً: تخمين الفئة الافتراضية من الجذر وحده هنا قد
 *    يقفل خطأً نطاق فئة كامل لحسابات فرعية تحتاج فئة مختلفة من نفس الجذر —
 *    راجع تعليق matchExactLevel2Category بـMergeTool.jsx لمثال حقيقي مؤكَّد).
 */
// [إصلاح خطأ حقيقي شهده المستخدم] matchExactLevel2Category تطابق الاسم الرسمي
// حرفيًا فقط، بما فيه أداة التعريف "ال" بأول كل كلمة ("الالتزامات المتداولة")
// — بينما حساب "لافتة" فعلي بشجرة عميل قد يُكتَب بلا "ال" على كلمة أو أكثر
// ("التزامات متداولة") وهو نفس الاسم محاسبيًا بلا أي لبس. المقارنة هنا كلمة
// بكلمة، تسمح بإضافة/حذف "ال" مرة واحدة بالضبط لكل كلمة — لا تجريدها العمياء
// (كانت تكسر كلمات جذرها يبدأ فعليًا بحرفي "ال" بلا علاقة بأداة التعريف، مثل
// "التزام" نفسها: تجريد "ال" منها يُنتِج "تزام" غير الكلمة الأصلية إطلاقًا،
// فتفشل المطابقة مع "الالتزامات" التي يُفتَرض أن تجريد "ال" منها ينتج "التزامات"
// بالضبط). الإضافة/الحذف مرة واحدة فقط تتفادى هذا الخلط تمامًا.
function alVariantsMatch(a, b) {
  return a === b || a === "ال" + b || b === "ال" + a;
}
const LEVEL2_CATEGORY_WORDS = Object.keys(LEVEL2_TO_LEVEL1).map((c) => ({ name: c, words: normalize(c).split(/\s+/).filter(Boolean) }));
function matchLevel2CategoryLenient(name) {
  const exact = matchExactLevel2Category(name);
  if (exact) return exact;
  const words = normalize(name).split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const hit = LEVEL2_CATEGORY_WORDS.find(
    (c) => c.words.length === words.length && c.words.every((cw, i) => alVariantsMatch(cw, words[i]))
  );
  return hit ? hit.name : "";
}

export function buildCodeCategoryHints(chartAccounts) {
  const hints = {};
  (chartAccounts || []).forEach((a) => {
    const code = String(a?.code || "").trim();
    const name = a?.name || "";
    if (!code || !name) return;
    const level2Hit = matchLevel2CategoryLenient(name);
    if (level2Hit) { hints[code] = { level2Category: level2Hit, level1Root: LEVEL2_TO_LEVEL1[level2Hit] }; return; }
    const level1Hit = matchLevel1RootByKeyword(name);
    if (level1Hit && !hints[code]) hints[code] = { level1Root: level1Hit };
  });
  return hints;
}

/**
 * أطول رمز موجود فعليًا بالفهرس (hints) يمثّل بادئة لـcode — نفس أسلوب
 * الاقتطاع من اليمين المعتمَد أصلاً بالمشروع لاستنتاج حساب الأب
 * (guessParentByCodeTruncation بـqoyodAccountSync.js/qoyodJournalRefFetch.js).
 */
export function lookupCodeCategoryHint(code, hints) {
  let current = String(code || "").trim();
  while (current.length > 0) {
    if (hints[current]) return hints[current];
    current = current.slice(0, -1);
  }
  return null;
}

// level1Root قد يصل بأي من التهجئتين المستخدَمتين فعليًا بـMergeTool.jsx
// ("الأصول" بهمزة من LEVEL2_TO_LEVEL1، أو "الاصول" بلا همزة من
// matchLevel1RootByKeyword/DEFAULT_LEVEL2_BY_ROOT) — طبّع قبل أي مقارنة أو
// استعلام بجداول الجذر الافتراضية تفاديًا لعدم تطابق بسبب الهمزة فقط.
const DEFAULT_LEVEL2_BY_ROOT_NORM = Object.fromEntries(
  Object.entries(DEFAULT_LEVEL2_BY_ROOT).map(([root, cat]) => [normalize(root), cat])
);
function defaultLevel2ForRoot(root) {
  return DEFAULT_LEVEL2_BY_ROOT_NORM[normalize(root)] || "";
}
function isRoot(root, standardName) {
  return normalize(root) === normalize(standardName);
}
// الترقيم القياسي المعتاد بقيود (1 أصول، 2 التزامات، 3 حقوق ملاك، 4 إيرادات،
// 5 مصاريف) — يُستخدَم فقط كملاذ أخير حين لا تملك شجرة حسابات العميل نفسها أي
// لافتة (فئة أو جذر) لهذا الرمز إطلاقًا؛ لافتات العميل الفعلية (hints) تتقدَّم
// عليه دومًا (راجع مثال المستخدم: عميل يستخدم الجذر 2 لإيراداته لا 4).
const STANDARD_ROOT_BY_DIGIT = {
  "1": LEVEL1_ROOT_TYPES[0], "2": LEVEL1_ROOT_TYPES[1], "3": LEVEL1_ROOT_TYPES[2],
  "4": LEVEL1_ROOT_TYPES[3], "5": LEVEL1_ROOT_TYPES[4],
};

// مؤشرات اسم منشأة/جهة (لا شخص) — استبعاد قبل تخمين "اسم شخص" أدناه (الأصول
// المتداولة فقط: طرف منشأة هناك أمر غير معتاد كفاية لتفادي التخمين).
const ENTITY_NAME_MARKERS = [
  "شركة", "شركه", "مؤسسة", "مؤسسه", "مصنع", "مجموعة", "مجموعه", "مكتب", "معرض",
  "مصرف", "بنك", "عيادة", "عياده", "مستشفى", "مدرسة", "مدرسه", "جمعية", "جمعيه",
  "صندوق", "هيئة", "هيئه", "وزارة", "وزاره", "إدارة", "اداره", "مقاولات", "تجارة", "تجاره",
];
// [تخمين احتياطي أخير، مُصرَّح به صراحةً] مثال حقيقي من المستخدم: حسابات
// برموز تندرج تحت "الأصول المتداولة" (بحكم رمزها) وأسماؤها أسماء أشخاص —
// عادة عُهد/سلف نقدية بحوزة موظف بعينه، لا نوع آخر من الأصول المتداولة. يُطبَّق
// فقط حين لا يوجد أي تطابق كلمة مفتاحية إطلاقاً ضمن الفئة، ويبقى اقتراحًا
// قابلاً للتعديل الكامل كباقي الاقتراحات — لا قرارًا نهائيًا.
function looksLikePersonName(name) {
  const n = String(name || "").trim();
  if (!n || /\d/.test(n)) return false;
  const norm = normalize(n);
  if (ENTITY_NAME_MARKERS.some((m) => norm.includes(normalize(m)))) return false;
  const words = n.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 5;
}
// [إضافة، طلب صريح من المستخدم] حسابات برموز تندرج تحت "الالتزامات المتداولة"
// واسمها اسم فرد أو شركة أو "أطراف ذات علاقة" أو ما شابه → دائنون (المورّد أو
// الطرف المستحق له المبلغ). بخلاف عهد نقدية أعلاه، هنا اسم منشأة يُحتسَب طرفًا
// بنفس درجة اسم الفرد (كلاهما مورِّد محتمل) — لا استبعاد لمؤشرات المنشأة.
function looksLikePartyName(name) {
  const n = String(name || "").trim();
  if (!n || /\d/.test(n)) return false;
  const words = n.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 6;
}

/**
 * تصنيف حساب ناقص اعتمادًا على اسمه *ورمزه* معًا — رمز الحساب (بعد مطابقته
 * بشجرة حسابات العميل المجلوبة فعليًا عبر hints من buildCodeCategoryHints)
 * يحسم فئة الحساب (مستوى2) حين يتعارض مع مطابقة الاسم العامة، أو حين لا يوجد
 * للاسم أي تطابق أصلاً — تمامًا كطلب المستخدم الصريح. تستخدم نفس محرك المطابقة
 * الحقيقي المعتمَد بأداة استيراد شجرة الحسابات (inferLevel3TypeFromText بكامل
 * قاموسه — لا نسخة محلية أضعف). لا تترك الفئة/النوع فارغين أبدًا ما دام هناك أي
 * دليل (رمز أو اسم) — طلب صريح من المستخدم: "يطبق ويضيف كل حساب في مكانه
 * الصحيح" — عبر احتياطيات المحرك نفسها (DEFAULT_LEVEL2_BY_ROOT/DEFAULT_TYPE_BY_LEVEL2)
 * حين تفشل كل المطابقات الأدق. تُرجع {type, level2Category, confidence}:
 * "name" = الاسم وحده كافٍ ومتوافق مع الرمز (أو لا رمز موثوق أصلاً)، "code" =
 * الرمز حسم الفئة (بمطابقة أدق أو باحتياط الفئة الافتراضي)، "guess" = لا رمز
 * ولا اسم أفادا، الترقيم القياسي المعتاد فقط، "none" = لا شيء إطلاقاً (لا رمز
 * صالح حتى لتخمين الجذر القياسي).
 */
export function classifyMissingAccount(name, code, hints) {
  const codeHint = code ? lookupCodeCategoryHint(code, hints || {}) : null;
  const nameMatch = inferLevel3TypeFromText(name, "");

  if (nameMatch) {
    const nameLevel2 = TYPE_TO_LEVEL2[nameMatch] || "";
    const nameRoot = LEVEL2_TO_LEVEL1[nameLevel2] || "";
    const conflict = codeHint?.level2Category
      ? codeHint.level2Category !== nameLevel2
      : (codeHint?.level1Root ? !isRoot(nameRoot, codeHint.level1Root) : false);
    if (!conflict) return { type: nameMatch, level2Category: nameLevel2, confidence: "name" };
    // تعارض بين الاسم والرمز — الرمز يفوز (طلب المستخدم الصريح)، يُتابَع تحت.
  }

  if (codeHint?.level2Category) {
    const scoped = inferLevel3TypeFromText(name, codeHint.level2Category);
    if (scoped) return { type: scoped, level2Category: codeHint.level2Category, confidence: "code" };
    if (codeHint.level2Category === "الأصول المتداولة" && looksLikePersonName(name)) {
      return { type: "عهد نقدية", level2Category: "الأصول المتداولة", confidence: "code" };
    }
    if (codeHint.level2Category === "الالتزامات المتداولة" && looksLikePartyName(name)) {
      return { type: "الدائنون", level2Category: "الالتزامات المتداولة", confidence: "code" };
    }
    return { type: DEFAULT_TYPE_BY_LEVEL2[codeHint.level2Category] || "", level2Category: codeHint.level2Category, confidence: "code" };
  }

  if (codeHint?.level1Root) {
    const candidates = level3TypesForRoot(codeHint.level1Root) || [];
    const scoped = inferLevel3TypeFromText(name, "", candidates);
    if (scoped) return { type: scoped, level2Category: TYPE_TO_LEVEL2[scoped] || "", confidence: "code" };
    if (isRoot(codeHint.level1Root, "الاصول") && looksLikePersonName(name)) {
      return { type: "عهد نقدية", level2Category: "الأصول المتداولة", confidence: "code" };
    }
    if (isRoot(codeHint.level1Root, "الالتزامات") && looksLikePartyName(name)) {
      return { type: "الدائنون", level2Category: "الالتزامات المتداولة", confidence: "code" };
    }
    const fallbackCategory = defaultLevel2ForRoot(codeHint.level1Root);
    return { type: fallbackCategory ? (DEFAULT_TYPE_BY_LEVEL2[fallbackCategory] || "") : "", level2Category: fallbackCategory, confidence: "code" };
  }

  // لا لافتة إطلاقًا بشجرة العميل لأي جزء من رمز هذا الحساب، ولا اسم مطابق —
  // الملاذ الأخير: الترقيم القياسي المعتاد بقيود لجذر رمزه الأول فقط.
  const digit = code ? String(code).trim()[0] : "";
  const standardRoot = STANDARD_ROOT_BY_DIGIT[digit];
  if (standardRoot) {
    const cat = defaultLevel2ForRoot(standardRoot);
    return { type: cat ? (DEFAULT_TYPE_BY_LEVEL2[cat] || "") : "", level2Category: cat, confidence: "guess" };
  }
  return { type: "", level2Category: "", confidence: "none" };
}
