// ─────────────────────────────────────────────────────────────────────────
// منظّم شجرة الحسابات — يُستدعى من الشات عندما يرفق المستخدم ملف شجرة حسابات
// غير منظم (تصدير خام من نظام آخر) ويطلب تنظيمه لملف رفع قيود جاهز.
//
// تصميم "حتمي أولاً": كل قواعد التصنيف والترقيم والتوريث هنا هي بالحرف نفس
// محرك أداة "تحليل الشجرة واستيرادها" (src/MergeTool.jsx) — لا تُكرَّر ولا
// يُعاد اختراعها، فقط تُستدعى مباشرة (compareTrees/ensureParentsExist/
// repairLevels/enforceCategoryInheritance/orderRowsForUpload). المدخل هنا
// معاملة خاصة: بلا "ملف 1" (شجرة قيود الحالية) — أي حساب عميل جديد بالكامل،
// فكل صفوف ملف العميل تُعامَل كـ"جديدة" وتُصنَّف وتُرقَّم من الصفر بنفس
// منطق الأداة المُثبَت، بلا أي اختصار.
//
// الذكاء الاصطناعي (Claude، عبر aiTypeResolver) يتدخل فقط في الصفوف التي
// عجز المحرك الحتمي عن تصنيفها بثقة (تُعلَّم بتنويه "تعذّر تحديد النوع")،
// ومُقيَّد بقائمة الأنواع الصحيحة لفئة الأب فقط — أي إجابة خارج القائمة
// تُرفض تلقائياً ويبقى الوضع الافتراضي الحتمي كما هو.
// ─────────────────────────────────────────────────────────────────────────

import * as XLSX from "xlsx";
import { readWorkbookRows } from "./excelCore";
import {
  findHeaderRowIndex, autoDetectMapping, buildRecords, compareTrees,
  ensureParentsExist, repairLevels, enforceCategoryInheritance, orderRowsForUpload,
  resolveAccountTypeAndCategory,
  OUTPUT_COLUMNS, TYPE_TO_LEVEL2, LEVEL3_MAP, ALL_LEVEL3_TYPES, LEVEL2_TO_LEVEL1,
} from "../MergeTool.jsx";

// تطبيع عربي متسامح (تشكيل/تطويل/همزات/تاء مربوطة/مسافات) — مُستخدَم في أكثر من
// موضع هنا (كشف اسم الجذر، وكشف "المستوى المكرر" أسفل) فوُحِّد بدالة واحدة بدل
// تكراره حرفياً في كل مكان.
function normalizeArLoose(s) {
  return String(s || "").trim().toLowerCase()
    .replace(/[ً-ْ]/g, "") // تشكيل
    .replace(/ـ/g, "") // تطويل (kashida)
    .replace(/[إأآا]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/\s+/g, "");
}

// ترقيم جذر الشجرة (مستوى 1) ثابت بقيود بصريح الكود: أول رقم بالرمز 1=أصول،
// 2=التزامات، 3=حقوق ملاك، 4=إيرادات، 5=مصاريف — نفس القاعدة المستخدمة في
// resolveAccountTypeAndCategory (rootFromAccountCode) لقراءة الجذر من الرمز.
// أسماء الجذور والفئات هنا هي بالحرف ذاتها من LEVEL1_ROOT_TYPES/LEVEL2_TO_LEVEL1 —
// معرفة تصنيف ثابتة موجودة أصلاً بالكود، لا اجتهاد جديد. أرقام الفئات (م2) نفسها
// (11، 12، 21...) اختيار ترقيمي بسيط متسق مع رقم الجذر فقط — سقالة هيكلية لا قيمة
// محاسبية لرقمها بذاته، الحسابات الفعلية (م3 فأعلى) هي ما يُصنَّف ويُرقَّم بدقة.
const LEVEL1_ROOT_ORDER = ["الأصول", "الالتزامات", "حقوق الملاك", "الإيرادات", "المصاريف"];

function buildStandardSkeletonRecords() {
  const records = [];
  LEVEL1_ROOT_ORDER.forEach((root, i) => {
    const rootCode = String(i + 1);
    records.push({ code: rootCode, nameAr: root, nameEn: root, level: "1", parent: "", type: root, desc: "", payCollect: "" });
    const cats = Object.keys(LEVEL2_TO_LEVEL1).filter((cat) => LEVEL2_TO_LEVEL1[cat] === root);
    cats.forEach((cat, j) => {
      records.push({ code: `${rootCode}${j + 1}`, nameAr: cat, nameEn: cat, level: "2", parent: rootCode, type: cat, desc: "", payCollect: "" });
    });
  });
  return records;
}

// حسابات مقفلة نظامياً بقيود — لا يجوز إنشاء أي حساب فرعي تحتها مطلقاً؛
// عملاء/موردو العميل تُنشأ كسجلات (Contacts) داخل قيود، لا كحسابات بالشجرة.
// (هذه معرفة نطاق ثابتة من قواعد قيود، غير مشتقة من أي ملف — انظر ملاحظة
// المستخدم: "الحسابات المقفلة نظامياً مثل المدينون والدائنون")
export const LOCKED_NO_SUBDIVISION_TYPES = ["المدينون", "الدائنون"];

/** يكتشف طلب "تنظيم شجرة حسابات" داخل الشات (بدل أي طلب تحويل جدول بيانات عام
 *  آخر يمرّ عبر aiExcelAgent.js) — يكتفي بذِكر شجرة/حسابات/دليل الحسابات في
 *  النص، طالما هناك ملف جدول بيانات مرفَق فعلياً (هذا شرط منفصل يتحقق منه
 *  المستدعي الوحيد في chat.jsx قبل استدعاء هذه الدالة، لا هنا).
 *  ‼️ كانت الدالة سابقاً تشترط أيضاً وجود فعل تنظيم صريح (نظّم/رتّب/صنّف...)
 *  معاً مع الاسم بنفس الرسالة - وهذا سبب خطأ جوهري حقيقي: رسائل طبيعية جداً
 *  مثل "هذا الملف شجرة حسابات غير منظمة، بيانات قيود..." (وصف بلا فعل أمر
 *  صريح) كانت تفوّت هذا الشرط فتذهب بالخطأ لمسار الدردشة العام (Gemini
 *  النصي) الذي لا يستطيع توليد ملف حقيقي مطلقاً - فيردّ بجدول Markdown
 *  "منجَز" وهمي بلا أي ملف فعلي مرفَق (رآه المستخدم فعلياً وأكّد الخطأ).
 *  بما أن المستدعي الوحيد أصلاً يتحقق من وجود ملف جدول بيانات مرفَق قبل
 *  استدعاء هذه الدالة (انظر chat.jsx: `spreadsheetAtt && text && ...`)،
 *  فذِكر "شجرة/حسابات" في نص مرفَق معه جدول بيانات هو نية كافية بذاتها -
 *  لا حاجة لفعل أمر صريح إضافي معه. */
export function isChartOrganizeRequest(text) {
  const s = text || "";
  // "شجر" (لا "شجرة" فقط) ليطابق أيضاً صيغ الإضافة/الملكية الشائعة مثل "شجرتي"،
  // "شجرته"، "شجرتك" (تاء الجمع/الإضافة تستبدل التاء المربوطة، فلا تحوي الكلمة
  // الحرفية "شجرة" كسلسلة فرعية إطلاقاً).
  return /(شجر|دليل\s*الحسابات|حسابات|حساب)/u.test(s);
}

function isBareNumberOrEmpty(name) {
  const s = String(name || "").trim();
  return s === "" || /^\d+$/.test(s);
}

/** يقرأ الملف الخام ويحاول تحديد الأعمدة تلقائياً — يُرجع أيضاً درجة اكتمال المطابقة */
export async function readAndMapChartFile(file) {
  const rows = await readWorkbookRows(file);
  if (!rows.length) throw new Error("الملف فارغ أو تعذّرت قراءته");
  const headerIdx = findHeaderRowIndex(rows);
  const headerRow = (rows[headerIdx] || []).map((c) => (c === undefined ? "" : c));
  const mapping = autoDetectMapping(headerRow);
  const criticalMissing = ["code", "nameAr"].filter((f) => mapping[f] === -1 && mapping.nameEn === -1);
  return { rows, headerIdx, headerRow, mapping, needsColumnHelp: criticalMissing.length > 0 || mapping.level === -1 };
}

/**
 * يبني الشجرة المنظمة الكاملة من سجلات ملف العميل (بلا شجرة حالية للمقارنة).
 * aiTypeResolver: (ambiguousRows) => Promise<Map<rowId,type>> اختياري — لو غاب
 * تبقى هذه الصفوف بوضعها الحتمي الافتراضي مع تنويه "يحتاج مراجعة".
 */
// قاعدة قيود شبه العالمية (مُثبَّتة بالكود في resolveAccountTypeAndCategory):
// أول رقم بالرمز 1=أصول، 2=التزامات، 3=حقوق ملاك، 4=إيرادات، 5=مصاريف — ويُعتمد
// فوق اسم الحساب نفسه عند التعارض. ملفات عملاء آتية من نظام غير قيود غالباً لا
// تلتزم بهذا الترقيم (جذرها الخاص أرقام داخلية عشوائية لا علاقة لها بقيود) —
// فيُصنَّف الحساب حسب جذر خاطئ صمتاً لو مُرِّر رمزها كما هو. هذا التصحيح يُعيد
// ترقيم رقم الجذر (الخانة الأولى فقط، وما يتبعه من نفس المجموعة) ليطابق الاسم
// الفعلي لصف المستوى-1 في كل مجموعة، دون أي تغيير لبقية الرمز أو للتسلسل الهرمي.
const ROOT_NAME_TO_DIGIT = [
  { digit: "1", re: /^(ال)?اصول$/ },
  { digit: "2", re: /^(ال)?(التزامات|خصوم)$/ },
  { digit: "3", re: /^حقوق(ال| )?(ملاك|ملكيه)$/ },
  { digit: "4", re: /^(ال)?(ايرادات|دخل)$/ },
  { digit: "5", re: /^(ال)?(مصاريف|مصروفات)$/ },
];
function digitForRootName(name) {
  const n = normalizeArLoose(name);
  const hit = ROOT_NAME_TO_DIGIT.find((r) => r.re.test(n));
  return hit ? hit.digit : null;
}

/** يعيد ترقيم الخانة الأولى فقط من رموز كل مجموعة جذر لتطابق اسم صفها المستوى-1 الفعلي */
export function remapForeignRootDigits(records) {
  const byOldDigit = new Map();
  records.forEach((r) => {
    const code = String(r.code || "").trim();
    if (!code) return;
    const d = code.charAt(0);
    if (!byOldDigit.has(d)) byOldDigit.set(d, []);
    byOldDigit.get(d).push(r);
  });

  const remap = new Map(); // oldDigit -> newDigit
  byOldDigit.forEach((group, oldDigit) => {
    const rootRow = group.find((r) => String(r.level).trim() === "1");
    if (!rootRow) return; // بلا صف جذر واضح بهذه المجموعة — لا نخمّن، تُترك كما هي
    const newDigit = digitForRootName(rootRow.nameAr || rootRow.nameEn);
    if (newDigit && newDigit !== oldDigit) remap.set(oldDigit, newDigit);
  });
  if (!remap.size) return records;

  return records.map((r) => {
    const code = String(r.code || "").trim();
    if (!code) return r;
    const newDigit = remap.get(code.charAt(0));
    if (!newDigit) return r;
    return { ...r, code: newDigit + code.slice(1) };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// دمج المستويات الوسيطة المكرِّرة اسم أبيها حرفياً — قرار معتمد من المستخدم
// ("دمج تلقائي عند تطابق الاسم مع الأب"). ملفات مُصدَّرة من أنظمة أخرى كثيراً
// ما تكرر اسم الجذر نفسه ("المصاريف") على 2-3 مستويات متتالية بلا أي معنى
// محاسبي إضافي؛ إبقاؤها كما هي يجعل enforceCategoryInheritance يقفل كل
// الحسابات الحقيقية تحتها على فئة واحدة (فئة المستوى المكرر نفسه، غالباً
// خاطئة) بدل تصنيف كل حساب فعلي من اسمه الخاص.
//
// المعالجة: (1) أي صف "جديد" اسمه المُطبَّع = اسم أبيه المباشر المُطبَّع
// يُعتبر "مستوى مكرر" ويُحذف نهائياً (تُختصر السلسلة حتى لو تكررت 3 مرات
// متتالية، بتخطي كل مكرر تصاعدياً). (2) كل حساب حقيقي كان أبوه المباشر
// مستوى مكرراً يُعاد تصنيفه من اسمه فقط عبر resolveAccountTypeAndCategory
// نفسها (المحرك الحتمي الموحّد، بلا منطق جديد) مع تحرير قفل الفئة الموروث
// تماماً (parentRow=null، ancestorCategory=null) ليُستنتَج نوعه وفئته من
// اسمه وجذر رمزه فقط، ثم يُنقَل مباشرة تحت رمز فئة (م2) الثابتة الصحيحة —
// لا يجوز أبداً أن يبقى حساب حقيقي معلّقاً مباشرة تحت الجذر (م1) لأن م2
// يجب أن تكون دائماً واحدة من الفئات الـ12 الثابتة.
function collapseRedundantWrapperLevels(rows, cmp) {
  const infoByCode = new Map();
  (cmp.tree1Index || []).forEach((r) => {
    const c = String(r.code || "").trim();
    if (c) infoByCode.set(c, { nameAr: r.nameAr, nameEn: r.nameEn, level: Number(r.level) });
  });
  rows.forEach((r) => {
    const c = String(r.code || "").trim();
    if (c) infoByCode.set(c, { nameAr: r.nameAr, nameEn: r.nameEn, level: Number(r.level) });
  });

  const skeletonCategoryCodeByName = new Map();
  (cmp.tree1Index || []).forEach((r) => {
    if (Number(r.level) === 2 && r.nameAr) skeletonCategoryCodeByName.set(r.nameAr, r.code);
  });

  const nameOf = (info) => (info ? normalizeArLoose(info.nameAr || info.nameEn) : "");

  // 1) كشف رموز "المستوى المكرر": صف جديد اسمه = اسم أبيه المباشر (تطابق مُطبَّع)
  const wrapperCodes = new Set();
  rows.forEach((r) => {
    if (r.status !== "new" || r.deleted) return;
    // حارس حاسم: صف حُسب له فعلاً نوع مقفل نظامياً (المدينون/الدائنون) يحمل معنى
    // محاسبياً حقيقياً - لا يُحذف أبداً كـ"مستوى مكرر" حتى لو تطابق اسمه صدفة مع
    // اسم أبيه (حالة حقيقية موجودة: "الدائنون" يتكرر مرتين بالاسم، والمستوى
    // الأعمق منهما هو من يحمل التصنيف الحقيقي type="الدائنون" فعلياً؛ حذفه كان
    // يُفقد إشارة القفل فيهرب دفتر العملاء/الموردين المساعد من الاستبعاد).
    if (LOCKED_NO_SUBDIVISION_TYPES.includes(r.type)) return;
    const p = String(r.parent || "").trim();
    if (!p) return;
    const parentInfo = infoByCode.get(p);
    const ownName = normalizeArLoose(r.nameAr || r.nameEn);
    if (ownName && parentInfo && ownName === nameOf(parentInfo)) {
      const c = String(r.code || "").trim();
      if (c) wrapperCodes.add(c);
    }
  });
  if (!wrapperCodes.size) return { rows, collapsedNotes: [] };

  // فهرس code→row مرة واحدة بدل rows.find() داخل map() تحت (كان O(n²) فعلياً: لكل صف
  // "ابن مستوى مكرر" مسح كامل rows مرتين — نادر التأثير مع شجرة حسابات عادية، لكن يتضخم
  // بسرعة مع أشجار عملاء ضخمة مستوردة من أنظمة أخرى بعشرات آلاف الأسطر). أول تطابق فقط
  // (كما .find())، فلا يتغيّر أي رمز مكرر احتمالياً.
  const rowByCode = new Map();
  rows.forEach((r) => {
    const c = String(r.code || "").trim();
    if (c && !rowByCode.has(c)) rowByCode.set(c, r);
  });

  // 2) أقرب جدّ غير مكرر لأي رمز، بتخطي كل حلقة المستويات المكررة المتتالية
  const nearestRealAncestorCode = (startCode) => {
    let cur = startCode;
    const guard = new Set();
    while (cur && wrapperCodes.has(cur) && !guard.has(cur)) {
      guard.add(cur);
      const r = rowByCode.get(cur);
      cur = r ? String(r.parent || "").trim() : "";
    }
    return cur;
  };

  const collapsedNotes = [];
  const out = rows
    .map((r) => {
      if (r.status !== "new" || r.deleted) return r;
      const ownCode = String(r.code || "").trim();
      if (wrapperCodes.has(ownCode)) return r; // يُحذف أدناه
      const p = String(r.parent || "").trim();
      if (!p || !wrapperCodes.has(p)) return r; // ليس ابناً مباشراً لمستوى مكرر

      const realAncestorCode = nearestRealAncestorCode(p);
      const realAncestorRow = rowByCode.get(realAncestorCode);
      // حارس حاسم: لو الجدّ الحقيقي (بعد تخطي كل المستويات المكررة) حساب مقفل
      // نظامياً (المدينون/الدائنون) فهذا يعني أن الاسم المكرر كان غلافاً حول
      // دفتر مساعد عملاء/موردين قديم - لا يجوز إطلاقاً إعادة تصنيف الابن بحرية
      // هنا (قد "يهرب" من القفل لو تشابه اسمه صدفة مع نوع آخر)؛ يُعاد ربطه بأبيه
      // الحقيقي المقفل كما هو فقط، ليُستبعد بالمرحلة المخصصة أدناه كسجل عميل/مورد.
      if (realAncestorRow && LOCKED_NO_SUBDIVISION_TYPES.includes(realAncestorRow.type)) {
        return { ...r, parent: realAncestorCode };
      }
      // تصنيف حر تماماً من اسم الحساب نفسه وجذر رمزه فقط - بلا أي قفل فئة موروث.
      // [مهم] لا يُمرَّر r.type القديم كما هو: هو نفسه نتيجة التصنيف الخاطئ
      // القديم (المقفل على فئة المستوى المكرر المحذوف) - تمريره كـ"نوع مصرَّح به
      // بالملف" يجعل الدالة تعتمده مباشرة (نوع مصرَّح أولى من الاستنتاج من الاسم)
      // فيتجمد كل الأوراق على نفس النوع القديم الواحد تماماً كما كانت، فيُفشِل
      // الإصلاح بالكامل بصمت. النوع الحقيقي "المصرَّح به" غير معروف هنا أصلاً -
      // فارغ عمداً ليُستنتَج النوع من الاسم فقط (الهدف الوحيد من هذه الخطوة).
      const { level2Category, type, notes } = resolveAccountTypeAndCategory(
        { code: r.code, nameAr: r.nameAr, nameEn: r.nameEn, desc: r.desc, type: "", level: 3, parent: realAncestorCode || r.parent },
        null, {}, null
      );
      const resolvedCategory = level2Category || (type ? TYPE_TO_LEVEL2[type] : "");
      const targetParentCode =
        (resolvedCategory && skeletonCategoryCodeByName.get(resolvedCategory)) || realAncestorCode || r.parent;

      collapsedNotes.push(
        `دُمج مستوى مكرر الاسم فوق حساب "${r.nameAr || r.nameEn}" (${r.code}) وأُعيد تصنيفه من اسمه مباشرة` +
        (resolvedCategory ? ` ضمن فئة "${resolvedCategory}"` : "") + " — يرجى المراجعة"
      );

      return {
        ...r,
        level: 3,
        parent: targetParentCode,
        level2Category: resolvedCategory || "",
        type: type || r.type,
        warnings: [
          ...(notes || []),
          ...(r.warnings || []).filter(
            (w) => !w.includes("تعذّر تحديد نوع الحساب") && !w.includes("تعذّر تحديد فئة الحساب")
          ),
        ],
        errors: (r.errors || []).filter((e) => !e.startsWith("توافق النوع مع الأب")),
      };
    })
    .filter((r) => !(r.status === "new" && wrapperCodes.has(String(r.code || "").trim())));

  return { rows: out, collapsedNotes };
}

// ─────────────────────────────────────────────────────────────────────────
// إعادة ربط حساب جديد "بلا أب" بفئة السقالة الثابتة مباشرة — يحدث حتماً حين
// لا يوجد عمود "الحساب الرئيسي" أصلاً بالملف المصدر (حالة حقيقية موثَّقة:
// allume.xls) والاعتماد الوحيد على اقتطاع الرمز (compareTrees) يفشل لأن سلسلة
// آباء الحساب بالرمز الأصلي لم تعد صحيحة - أبرز مثال: بند حقوق ملكية أُعيد
// ترقيم جذره (فصل حقوق الملكية عن "الخصوم" الغامضة أسفل) فصار رمزه يبدأ بـ3
// بينما أبوه الحقيقي (بالرمز) بقي يبدأ بـ2 عمداً (لأنه يحوي إخوة التزامات
// حقيقية أيضاً) - فينكسر الاقتطاع الرمزي تماماً، ويحدث عندها أحد أمرين كلاهما
// خطأ جوهري بلا هذا الإصلاح:
// 1) الحساب اليتيم نفسه (compareTrees مع useFile2Codes=false يُولِّد رمزاً
//    جديداً فقط عبر nextSiblingCode(parentCode) - وبلا أب معروف يبقى رمزه
//    فارغاً تماماً) يحتاج رمزاً وأباً معاً.
// 2) لو أحد أبناء هذا اليتيم طابق رمزه الأصلي (كسلسلة نصية) بالاقتطاع رغم
//    ذلك، تكتشفه ensureParentsExist "أباً مفقوداً" وتُنشئ له بديلاً تلقائياً
//    بنفس الرمز الأصلي - لكنها تُخمِّن أبا هذا البديل رقمياً بالاقتطاع فقط
//    (guessAncestorCode) بلا أي علاقة هرمية فعلية، فيصطدم غالباً بأقرب رمز
//    سقالة قصير رقمياً (مثال حقيقي: "3102" يُخمَّن أبوه "31" لمجرد الاقتطاع
//    الرقمي، بينما فئته الحقيقية المحسومة من نوعه فئة أخرى كلياً) وتظهر أخطاء
//    "تعارض النوع مع الأب" الوهمية. الإصلاح: يُصحَّح أب الحساب الحقيقي (اليتيم
//    نفسه: رمز+أب) أو أب البديل التلقائي (autoParent: أب فقط، رمزه سليم أصلاً)
//    - كلاهما إلى فئة السقالة الثابتة المطابقة لفئته/نوعه المعروف أصلاً، ويُحذف
//    اليتيم الفارغ الرمز إن استُبدِل ببديل تلقائي مطابق لنفس الحساب المصدر.
function reattachOrphanNewRows(rows, cmp) {
  const skeletonCategoryCodeByName = new Map();
  (cmp.tree1Index || []).forEach((r) => {
    if (Number(r.level) === 2 && r.nameAr) skeletonCategoryCodeByName.set(r.nameAr, r.code);
  });

  const usedCodes = new Set(cmp.existingCodes || []);
  rows.forEach((r) => { const c = String(r.code || "").trim(); if (c) usedCodes.add(c); });
  const genCode = (parentCode) => {
    for (let i = 1; i <= 999; i++) {
      const candidate = parentCode + String(i).padStart(2, "0");
      if (!usedCodes.has(candidate)) { usedCodes.add(candidate); return candidate; }
    }
    return "";
  };

  // رموز كل "بديل تلقائي" (autoParent) حالياً - أي يتيم فارغ الرمز يطابق رمز
  // مصدره الأصلي أحد هذه الرموز فهو مكرَّر تماماً بحساب البديل التلقائي (نفس
  // الحساب المصدر بالضبط) ويُحذَف بدل أن يُولَّد له رمز مستقل ثانٍ (تكرار).
  const ghostCodeSet = new Set(
    rows.filter((r) => r.status === "new" && !r.deleted && r.autoParent).map((r) => String(r.code || "").trim())
  );

  const stripStaleParentConflict = (arr) =>
    (arr || []).filter((e) => !e.startsWith("توافق النوع مع الأب:"));

  const reattachNotes = [];
  const toDelete = new Set();

  const out = rows.map((r) => {
    if (r.status !== "new" || r.deleted) return r;
    const category = r.level2Category || (r.type ? TYPE_TO_LEVEL2[r.type] : "");
    const targetParentCode = category ? skeletonCategoryCodeByName.get(category) : null;

    if (r.autoParent) {
      // بديل تلقائي رمزه سليم (هو رمز الحساب المصدر الأصلي نفسه) لكن أبوه
      // تخمين رقمي عابر بالاقتطاع - يُصحَّح فقط، لا يُولَّد له رمز جديد
      if (!targetParentCode || targetParentCode === String(r.parent || "").trim()) return r;
      reattachNotes.push(
        `صُحِّح أب حساب "${r.nameAr || r.nameEn}" (${r.code}) من تخمين رقمي عابر بالاقتطاع إلى فئته الصحيحة "${category}" — يرجى المراجعة`
      );
      return { ...r, level: 3, parent: targetParentCode, errors: stripStaleParentConflict(r.errors) };
    }

    // يتيم بلا رمز مطابق لحساب مصدره لبديل تلقائي موجود فعلاً - مكرَّر، يُحذف
    if (!String(r.code || "").trim() && r.source && ghostCodeSet.has(String(r.source.code || "").trim())) {
      toDelete.add(r.id);
      return r;
    }

    if (String(r.parent || "").trim()) return r; // له أب فعلاً - لا تغيير
    if (!targetParentCode) return r; // فئته غير معروفة أيضاً - يبقى بتنويه "الأب غير محدد" القائم

    let code = String(r.code || "").trim();
    if (!code) code = genCode(targetParentCode);
    if (!code) return r; // تعذّر توليد رمز فريد (نادر جداً) - يبقى كما هو بتنويهه القائم

    reattachNotes.push(
      `أُعيد ربط حساب "${r.nameAr || r.nameEn}" (${code}) مباشرة بفئة "${category}" لعدم توفر رمز أب واضح أو عمود حساب رئيسي بالملف المصدر — يرجى المراجعة`
    );
    return {
      ...r,
      code,
      level: 3,
      parent: targetParentCode,
      warnings: (r.warnings || []).filter(
        (w) => !w.includes("الحساب الرئيسي (الرمز) غير محدد") && !w.includes("تعذّر توليد رقم تلقائي")
      ),
    };
  }).filter((r) => !toDelete.has(r.id));

  return { rows: out, reattachNotes };
}

// ─────────────────────────────────────────────────────────────────────────
// دمج الحسابات المكرِّرة معنى (لا اسماً بالضرورة) لحساب مقفل نظامياً واحد -
// تأكيد صريح من المستخدم: قيود لا تعرف حساب "موردين" مستقل إطلاقاً؛ المورد
// يُضاف من مديول المشتريات ويُربَط تلقائياً بحساب "الدائنون" الافتراضي المقفل
// نظامياً نفسه (لا يُحذف، يمكن تعديل اسمه/رقمه، لا يُفرَّع تحته) - تماماً
// كالمدينون (عملاء) والمخزون (مواقع). حالة حقيقية موثَّقة (allume.xls): ملف
// العميل يفصل "الموردون" عن "الدائنون" كجذرين مستقلين على نفس المستوى، وكذلك
// يكرِّر اسم "الدائنون" حرفياً على مستويين متتاليين (الأعمق فقط يحمل النوع
// المؤكَّد؛ هذه الحالة الثانية أصلاً محفوظة بحارس collapseRedundantWrapperLevels
// أعلاه لكنه لا يحذف الغلاف الخارجي - فيبقى ظاهراً بلا نوع مؤكَّد أيضاً).
// القاعدة: أي حساب (بأي مستوى) اسمه مرادف صريح محفوظ سلفاً بجدول مرادفات
// المحرك (MergeTool.jsx) لحساب مقفل، أو نوعه فعلاً مؤكَّد كذلك، يُدمَج جميعه في
// حساب "محور" واحد فقط (يُفضَّل من نوعه مؤكَّد فعلاً)، وتُعاد أبناء كل نسخة
// أخرى إليه مباشرة، ثم تُحذف بقية النسخ - فلا يظهر الحساب المقفل مكرَّراً.
// ملاحظة حاسمة: "... أخرى" (كـ"ذمم دائنة أخرى") ليس مرادفاً إطلاقاً - نوع
// مستقل تماماً بقيود (تأكيد صريح من المستخدم)، ويُستبعَد من المطابقة عمداً.
const LOCKED_TYPE_ALIASES = {
  "الدائنون": ["الدائنون", "موردون", "مورد", "دائنون", "ذمم دائنة", "مستحقات للموردين"],
  "المدينون": ["المدينون", "عملاء", "عميل", "مدينون", "ذمم مدينة", "مستحقات على عملاء"],
};
const LOCKED_TYPE_CATEGORY = { "الدائنون": "الالتزامات المتداولة", "المدينون": "الأصول المتداولة" };
function matchLockedAliasType(name) {
  const n = normalizeArLoose(name);
  if (!n) return null;
  if (/اخر[ىي]/.test(n)) return null; // "... أخرى" نوع مستقل - لا يُدمَج بالحساب المقفل الأساسي أبداً
  for (const [type, aliases] of Object.entries(LOCKED_TYPE_ALIASES)) {
    if (aliases.some((a) => n.includes(normalizeArLoose(a)))) return type;
  }
  return null;
}

function mergeDuplicateLockedTypeNodes(rows, cmp) {
  const skeletonCategoryCodeByName = new Map();
  (cmp.tree1Index || []).forEach((r) => {
    if (Number(r.level) === 2 && r.nameAr) skeletonCategoryCodeByName.set(r.nameAr, r.code);
  });

  const mergeNotes = [];
  const toDelete = new Set();
  const reparentChildTo = new Map(); // كود النسخة المحذوفة -> كود المحور الباقي
  const keeperFixById = new Map(); // id المحور -> {parent, type, level2Category, level}

  LOCKED_NO_SUBDIVISION_TYPES.forEach((lockedType) => {
    const candidates = rows.filter((r) => {
      if (r.status !== "new" || r.deleted) return false;
      const lvl = Number(r.level);
      // النوع الحقيقي المؤكَّد فقط على مستواه الصحيح (م3) - لا مستوى 4+ (قد يكون
      // موروثاً كملاذ أخير من الأب لحساب فرعي عادي كاسم عميل/مورد حقيقي، انظر
      // القاعدة "5b" بدالة resolveAccountTypeAndCategory - هذا ليس تكراراً للحساب
      // المقفل نفسه، والدمج هنا يقصد فقط أغلفة/تصنيفات مكرِّرة لذات المفهوم).
      if (r.type === lockedType && lvl === 3) return true;
      // مطابقة بالاسم (مرادف أو مطابقة حرفية) تُقبَل فقط لغلاف علوي (م1/م2) -
      // لا لحساب عميق قد يكون اسم عميل/مورد حقيقي يحوي الكلمة صدفة.
      if ((lvl === 1 || lvl === 2) && matchLockedAliasType(r.nameAr || r.nameEn) === lockedType) return true;
      return false;
    });
    if (!candidates.length) return;

    const alreadyTyped = candidates.find((r) => r.type === lockedType);
    if (candidates.length === 1 && alreadyTyped) return; // الحالة السليمة الشائعة - بلا أي تكرار، لا تغيير

    const exactNamed = candidates.filter((r) => normalizeArLoose(r.nameAr || r.nameEn) === normalizeArLoose(lockedType));
    const keeper = alreadyTyped || exactNamed[0] || candidates[0];
    const targetParentCode = skeletonCategoryCodeByName.get(LOCKED_TYPE_CATEGORY[lockedType]);
    if (!targetParentCode) return; // فئة السقالة غير متاحة (نادر جداً) - لا نخمّن بديلاً

    candidates.forEach((r) => {
      if (r.id === keeper.id) return;
      const code = String(r.code || "").trim();
      if (code) reparentChildTo.set(code, String(keeper.code || "").trim());
      toDelete.add(r.id);
      mergeNotes.push(
        `دُمج حساب "${r.nameAr || r.nameEn}" (${r.code}) في الحساب المقفل نظامياً "${keeper.nameAr || keeper.nameEn}" (${keeper.code}) - كلاهما يمثّلان نفس الحساب الافتراضي بقيود ولا يجوز تكراره`
      );
    });

    keeperFixById.set(keeper.id, {
      parent: targetParentCode, type: lockedType, level2Category: LOCKED_TYPE_CATEGORY[lockedType], level: 3,
    });
  });

  if (!toDelete.size && !keeperFixById.size) return { rows, mergeNotes: [] };

  const out = rows
    .map((r) => {
      if (r.status !== "new" || r.deleted) return r;
      const fix = keeperFixById.get(r.id);
      if (fix) return { ...r, ...fix };
      const p = String(r.parent || "").trim();
      if (reparentChildTo.has(p)) return { ...r, parent: reparentChildTo.get(p) };
      return r;
    })
    .filter((r) => !toDelete.has(r.id));

  return { rows: out, mergeNotes };
}

// ─────────────────────────────────────────────────────────────────────────
// فصل حقوق الملكية عن "الخصوم" الغامضة — بعض الأنظمة غير قيود تجمع الالتزامات
// وحقوق الملكية تحت جذر واحد بمصطلح عام غامض "الخصوم" (بدل جذرين منفصلين كما
// يتطلب قيود: 2=الالتزامات، 3=حقوق الملاك). حالة حقيقية موثَّقة (allume.xls):
// "الخصوم" يحوي جذراً فرعياً مُسمّى خطأً "حقوق الملكية" يحوي بدوره مزيجاً من
// بنود حقيقية لحقوق الملكية (رأس المال، الأرباح المرحّلة، احتياطي نظامي) وبنود
// التزامات فعلية (جاري الشركاء، شركات شقيقة، مخصصات) بلا أي تمييز.
// القرار المعتمد من المستخدم صريحاً: يُعامَل "الخصوم" (حرفياً، لا "الالتزامات"
// الصريحة غير الغامضة) كأنه التزامات + حقوق ملكية مدمجة، ويُفصَل كل بند منه
// حسب اسمه الخاص فقط - أي بند يطابق مفردات حقوق الملكية الدقيقة (رأس المال/
// الأرباح المبقاة أو المرحّلة حتى لو بسنوات/احتياطي) يُنقَل لجذر حقوق الملاك
// (3)، وكل ما تبقى (الدائنون، جاري الشركاء، شركات شقيقة، مخصصات غير الاحتياطي)
// يبقى التزامات كما هو - بلا أي تخمين آخر خارج هذه المفردات المحدَّدة صراحةً.
const AMBIGUOUS_LIABILITIES_ROOT_NAME = "الخصوم";
// كل قاعدة تُختبَر مقابل نص طُبِّع بـnormalizeArLoose (يوحّد كل صور الألف مع
// الهمزة إلى ألف عادية بلا همزة) - فالنمط يكتب "راس"/"ارباح" بلا همزة عمداً،
// وإلا لم يطابق أبداً حتى مع وجود الكلمة حرفياً بالاسم (خطأ حقيقي وقع هنا سابقاً؛
// الاسم الفعلي بملف allume.xls "راس المال" و"حساب الارباح والخسائر" بلا همزة).
// كل قاعدة تحمل أيضاً نوع الحساب (م3) الدقيق المعتمد بقيود حرفياً - يُفرَض على
// السجل مباشرة بدل ترك التصنيف الحتمي العام يخمّنه من الاسم: أنواع حقوق الملاك
// نادراً ما تُطابَق تلقائياً (اسم النوع الرسمي "الأرباح المبقاة (أو الخسائر)"
// لا يظهر حرفياً أبداً بملفات العملاء - عادة "أرباح وخسائر مرحّلة" أو مشابه)،
// وبلا هذا الفرض يخرج الحساب بفئة عشوائية (رأس المال المصدر مثلاً) ويتعارض مع
// فئة أبيه الحقيقية - خطأ هيكلي حقيقي رُصِد ويُتحقَّق منه في اختبار تراجع.
const EQUITY_TYPE_RULES = [
  { re: /راس\s*ال?مال/, type: "رأس المال" },
  { re: /الارباح\s*ال?(مبقا|مرحل)|ارباح\s*(و)?(ال)?خسائر/, type: "الأرباح المبقاة (أو الخسائر)" },
  { re: /احتياطي/, type: "الاحتياطيات" },
];
function matchEquityRule(name) {
  const n = normalizeArLoose(name);
  if (!n) return null;
  return EQUITY_TYPE_RULES.find((rule) => rule.re.test(n)) || null;
}

function splitEquityFromAmbiguousLiabilitiesRoot(records) {
  const byDigit = new Map();
  records.forEach((r) => {
    const code = String(r.code || "").trim();
    if (!code) return;
    const d = code.charAt(0);
    if (!byDigit.has(d)) byDigit.set(d, []);
    byDigit.get(d).push(r);
  });

  const renameCodes = new Set(); // جذر المجموعة نفسه فقط - يُعاد تسميته "الالتزامات"
  const remapTypeByCode = new Map(); // البنود المنقولة لحقوق الملاك -> نوعها الصريح الدقيق

  byDigit.forEach((group) => {
    const rootRow = group.find((r) => String(r.level).trim() === "1");
    if (!rootRow) return;
    if (normalizeArLoose(rootRow.nameAr || rootRow.nameEn) !== normalizeArLoose(AMBIGUOUS_LIABILITIES_ROOT_NAME)) return;

    const rootCode = String(rootRow.code || "").trim();
    if (rootCode) renameCodes.add(rootCode);

    const anchors = group
      .map((r) => ({ code: String(r.code || "").trim(), rule: matchEquityRule(r.nameAr || r.nameEn) }))
      .filter((x) => x.code && x.rule)
      // الرموز الأطول أولاً: لو حساب مطابق لعدة أصول بالاقتطاع (نادر) يفوز أقربها فعلياً
      .sort((a, b) => b.code.length - a.code.length);
    if (!anchors.length) return;

    group.forEach((r) => {
      const code = String(r.code || "").trim();
      if (!code) return;
      const ownRule = matchEquityRule(r.nameAr || r.nameEn);
      if (ownRule) { remapTypeByCode.set(code, ownRule.type); return; }
      // بلا كلمة مفتاحية باسمه الخاص - يرث نوع أقرب أصل مطابق بسلسلة الرمز فقط
      const ancestor = anchors.find((a) => code !== a.code && code.startsWith(a.code));
      if (ancestor) remapTypeByCode.set(code, ancestor.rule.type);
    });
  });

  if (!renameCodes.size && !remapTypeByCode.size) return records;
  return records.map((r) => {
    const code = String(r.code || "").trim();
    if (!code) return r;
    if (remapTypeByCode.has(code)) return { ...r, code: "3" + code.slice(1), type: remapTypeByCode.get(code) };
    if (renameCodes.has(code)) return { ...r, nameAr: "الالتزامات", nameEn: r.nameEn || "الالتزامات" };
    return r;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// تصحيح نوع معتمد صراحة من المستخدم — enforceCategoryInheritance (بالمزج
// الأصلي src/MergeTool.jsx) تفرض عمداً عدم التصحيح التلقائي الصامت لخطأ
// "توافق النوع مع الأب" (تُبقيه "خطأ يحتاج تعديل" مع اقتراح نوع بالنص فقط)
// لأن التصحيح الصامت جرّب سابقاً وأخفى الخطأ الفعلي (النتيجة تظهر "سليم"
// رغم الخطأ). هذا الحارس لا يُغيَّر هنا مطلقاً (لا تُلمَس MergeTool.jsx).
//
// هذه الدالة تطبّق تصحيحاً **غير صامت**: فقط الحسابات التي راجعها المستخدم
// بنفسه فعلياً (بالشات، بدل القائمة المنسدلة بالأداة) واعتمد نوعها المقترح
// صريحاً - تُمرَّر هنا كقائمة overrides واضحة، ويُسجَّل كل تغيير بملاحظة
// تدقيق صريحة تذكر النوع القديم والجديد لكل حساب، فلا يبقى الخطأ مخفياً
// بصمت بل موثَّقاً كتصحيح معتمد. لا تُستدعى تلقائياً بلا overrides.
function applyApprovedTypeOverrides(rows, overrides) {
  if (!overrides || !overrides.length) return { rows, overrideNotes: [] };
  const byCode = new Map(
    overrides.filter((o) => o && o.code && o.type).map((o) => [String(o.code).trim(), o.type])
  );
  if (!byCode.size) return { rows, overrideNotes: [] };

  const overrideNotes = [];
  const out = rows.map((r) => {
    if (r.status !== "new" || r.deleted) return r;
    const code = String(r.code || "").trim();
    if (!code || !byCode.has(code)) return r;
    const newType = byCode.get(code);
    if (r.type === newType) return r;
    overrideNotes.push(
      `اعتمد المستخدم تصحيح نوع حساب "${r.nameAr || r.nameEn}" (${code}) من "${r.type || "بلا نوع"}" إلى "${newType}" بناءً على مراجعته لتنويه توافق النوع مع الأب`
    );
    return {
      ...r,
      type: newType,
      errors: (r.errors || []).filter((e) => !e.startsWith("توافق النوع مع الأب:")),
    };
  });
  return { rows: out, overrideNotes };
}

export async function buildOrganizedChart(recordsIn, { aiTypeResolver, approvedTypeOverrides } = {}) {
  const records = splitEquityFromAmbiguousLiabilitiesRoot(remapForeignRootDigits(recordsIn));
  // بلا شجرة حالية فعلية (عميل جديد كلياً) — تُبنى مقارنةً بسقالة الجذور
  // والفئات الثابتة فقط (5 جذور + 12 فئة، أسماء معتمدة أصلاً بالكود)، فتُطابَق
  // عليها أي صفوف م1/م2 يذكرها العميل بالاسم بدل أن تُترك بلا رمز.
  const cmp = compareTrees(buildStandardSkeletonRecords(), records, false);
  let { rows } = ensureParentsExist(cmp.results, cmp);
  ({ rows } = repairLevels(rows, cmp));
  ({ rows } = enforceCategoryInheritance(rows, cmp.tree1Index));

  // ── إعادة ربط أي حساب جديد بلا أب واضح (انظر تعليق الدالة) بفئته المعروفة ──
  const { rows: reattachedRows, reattachNotes } = reattachOrphanNewRows(rows, cmp);
  rows = reattachedRows;
  if (reattachNotes.length) {
    ({ rows } = repairLevels(rows, cmp));
    ({ rows } = enforceCategoryInheritance(rows, cmp.tree1Index));
  }

  // ── دمج المستويات المكرِّرة اسم أبيها (مثال: "المصاريف" مكرر 2-3 مستويات) ──
  const { rows: collapsedRows, collapsedNotes } = collapseRedundantWrapperLevels(rows, cmp);
  rows = collapsedRows;
  if (collapsedNotes.length) {
    ({ rows } = repairLevels(rows, cmp));
    ({ rows } = enforceCategoryInheritance(rows, cmp.tree1Index));
  }

  // ── دمج أي تكرار معنى (لا اسماً بالضرورة) لحساب مقفل نظامياً (المدينون/الدائنون) ──
  const { rows: mergedLockedRows, mergeNotes } = mergeDuplicateLockedTypeNodes(rows, cmp);
  rows = mergedLockedRows;
  if (mergeNotes.length) {
    ({ rows } = repairLevels(rows, cmp));
    ({ rows } = enforceCategoryInheritance(rows, cmp.tree1Index));
  }

  // ── حارس: أسماء رقمية بحتة أو فارغة — لا يجوز تخمين اسم حساب، تُعلَّم للعميل ──
  rows = rows.map((r) => {
    if (r.status !== "new" || r.deleted) return r;
    if (isBareNumberOrEmpty(r.nameAr) && isBareNumberOrEmpty(r.nameEn)) {
      return { ...r, warnings: [...r.warnings, "اسم الحساب بالملف المصدر رقم فقط أو فارغ — لا يمكن تخمين اسم حقيقي، يحتاج تسمية من العميل قبل الرفع"] };
    }
    return r;
  });

  // ── الذكاء الاصطناعي: فقط للصفوف التي فشل المحرك الحتمي بتصنيفها ──
  const needsType = rows.filter((r) =>
    r.status === "new" && !r.deleted && r.errors.length === 0 &&
    r.warnings.some((w) => w.includes("تعذّر تحديد نوع الحساب")) &&
    !isBareNumberOrEmpty(r.nameAr) && !isBareNumberOrEmpty(r.nameEn)
  );
  const aiNotes = [];
  if (aiTypeResolver && needsType.length) {
    let decisions;
    try {
      decisions = await aiTypeResolver(needsType.map((r) => ({
        id: r.id, nameAr: r.nameAr, nameEn: r.nameEn, desc: r.desc,
        candidateTypes: r.level2Category ? (LEVEL3_MAP[r.level2Category] || ALL_LEVEL3_TYPES) : ALL_LEVEL3_TYPES,
      })));
    } catch (e) {
      decisions = new Map();
    }
    rows = rows.map((r) => {
      const chosen = decisions && decisions.get ? decisions.get(r.id) : null;
      if (!chosen) return r;
      const allowed = r.level2Category ? (LEVEL3_MAP[r.level2Category] || []) : ALL_LEVEL3_TYPES;
      if (!allowed.includes(chosen)) return r; // إجابة خارج القائمة المقيّدة — تُرفض بصمت، لا يُغيَّر شيء
      aiNotes.push(`صنّف الذكاء الاصطناعي حساب "${r.nameAr || r.nameEn}" (${r.code}) كنوع "${chosen}" بناءً على الاسم — راجعه`);
      return {
        ...r, type: chosen, level2Category: r.level2Category || TYPE_TO_LEVEL2[chosen] || "",
        warnings: r.warnings.filter((w) => !w.includes("تعذّر تحديد نوع الحساب")),
      };
    });
    ({ rows } = enforceCategoryInheritance(rows, cmp.tree1Index));
  }

  // ── تصحيحات نوع اعتمدها المستخدم صراحة (بعد مراجعة اقتراح "توافق النوع مع الأب") ──
  const { rows: overriddenRows, overrideNotes } = applyApprovedTypeOverrides(rows, approvedTypeOverrides);
  rows = overriddenRows;
  if (overrideNotes.length) {
    ({ rows } = repairLevels(rows, cmp));
    ({ rows } = enforceCategoryInheritance(rows, cmp.tree1Index));
  }

  // ── استبعاد أي حساب (وكل ذريته) واقع تحت حساب مقفل نظامياً (المدينون/الدائنون) ──
  const byCode = new Map();
  rows.forEach((r) => { const c = String(r.code || "").trim(); if (c) byCode.set(c, r); });
  const lockedAncestorType = (row, guard = new Set()) => {
    const p = String(row.parent || "").trim();
    if (!p || guard.has(p)) return null;
    const parentRow = byCode.get(p);
    if (!parentRow) return null;
    if (LOCKED_NO_SUBDIVISION_TYPES.includes(parentRow.type)) return parentRow.type;
    return lockedAncestorType(parentRow, new Set(guard).add(p));
  };

  const excluded = [];
  const kept = [];
  rows.forEach((r) => {
    const lockedType = r.status === "new" && !r.deleted ? lockedAncestorType(r) : null;
    if (lockedType) {
      excluded.push({ ...r, _lockedUnder: lockedType });
    } else {
      kept.push(r);
    }
  });

  const activeNewRows = kept.filter((r) => r.status === "new" && !r.deleted);
  const ordered = orderRowsForUpload(activeNewRows);

  const auditNotes = [];
  excluded.forEach((r) => {
    auditNotes.push({
      type: "استُبعد", account: `${r.nameAr || r.nameEn} (${r.code})`,
      detail: `تابع لحساب "${r._lockedUnder}" المقفل نظامياً — يُنشأ كسجل عميل/مورد داخل قيود، لا كحساب في الشجرة`,
    });
  });
  ordered.forEach((r) => {
    if (r.autoParent) auditNotes.push({ type: "حساب أب أُنشئ تلقائياً", account: `${r.nameAr || r.nameEn} (${r.code})`, detail: "لم يكن موجوداً بملف العميل — أُنشئ لأن أحد أبنائه احتاجه، راجع اسمه ونوعه" });
    (r.errors || []).forEach((e) => auditNotes.push({ type: "خطأ يحتاج تعديل", account: `${r.nameAr || r.nameEn} (${r.code})`, detail: e }));
    (r.warnings || []).forEach((w) => auditNotes.push({ type: "تنويه للمراجعة", account: `${r.nameAr || r.nameEn} (${r.code})`, detail: w }));
  });
  aiNotes.forEach((n) => auditNotes.push({ type: "صنّفه الذكاء الاصطناعي", account: "", detail: n }));
  collapsedNotes.forEach((n) => auditNotes.push({ type: "دمج مستوى مكرر", account: "", detail: n }));
  reattachNotes.forEach((n) => auditNotes.push({ type: "إعادة ربط بلا أب", account: "", detail: n }));
  mergeNotes.forEach((n) => auditNotes.push({ type: "دمج حساب مقفل مكرر", account: "", detail: n }));
  overrideNotes.forEach((n) => auditNotes.push({ type: "تصحيح معتمد من المستخدم", account: "", detail: n }));

  return {
    orderedRows: ordered,
    excludedRows: excluded,
    auditNotes,
    errorCount: ordered.filter((r) => r.errors.length > 0).length,
    reviewCount: ordered.filter((r) => r.errors.length === 0 && r.warnings.length > 0).length,
    cleanCount: ordered.filter((r) => r.errors.length === 0 && r.warnings.length === 0).length,
  };
}

/** يبني ملف xlsx بنفس شكل "Accounts Upload Template" الرسمي + ورقة ملاحظات تدقيق */
export function buildOrganizedChartWorkbook(orderedRows, auditNotes) {
  const finalRows = orderedRows.map((r) => [r.code, r.nameEn, r.nameAr, r.level, r.parent, r.type, r.desc, r.payCollect || "No"]);
  const aoa = [["", "", "", "", "يرجى تعبئة البيانات بدون تعديل قالب الملف", "", "", ""], OUTPUT_COLUMNS, ...finalRows];
  const wsMain = XLSX.utils.aoa_to_sheet(aoa);
  wsMain["!cols"] = [{ wch: 14.4 }, { wch: 32.4 }, { wch: 27 }, { wch: 18 }, { wch: 30 }, { wch: 23.4 }, { wch: 14.4 }, { wch: 50 }];

  const auditAoa = [["النوع", "الحساب/الكود", "التفصيل"], ...auditNotes.map((n) => [n.type, n.account, n.detail])];
  const wsAudit = XLSX.utils.aoa_to_sheet(auditAoa);
  wsAudit["!cols"] = [{ wch: 22 }, { wch: 30 }, { wch: 70 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsMain, "Accounts Upload Template");
  XLSX.utils.book_append_sheet(wb, wsAudit, "ملاحظات التدقيق");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/**
 * نقطة الدخول الكاملة — تُستدعى من الشات.
 * @param {File} file ملف شجرة الحسابات الخام المرفَق
 * @param {{aiTypeResolver?: Function}} opts
 */
export async function organizeChartOfAccounts(file, opts = {}) {
  const { rows, headerIdx, mapping: autoMapping, needsColumnHelp: autoNeedsColumnHelp } = await readAndMapChartFile(file);
  // mappingOverride: تعيين أعمدة إضافي (يدوي) — يُدمَج فوق المطابقة الحتمية فقط
  // للحقول غير المكتشفة، لا يُستبدَل به أي اكتشاف حتمي واثق أصلاً.
  const mapping = { ...autoMapping };
  if (opts.mappingOverride) {
    Object.entries(opts.mappingOverride).forEach(([field, idx]) => {
      if (autoMapping[field] === -1 && typeof idx === "number" && idx >= 0) mapping[field] = idx;
    });
  }

  // ── مساعدة الذكاء الاصطناعي لمطابقة الأعمدة: فقط لو بقيت حقول جوهرية غير
  // مكتشفة بعد الاكتشاف الحتمي + أي تعيين يدوي، ولم يُطلَب تعيين يدوي كامل أصلاً.
  // كل index يقترحه aiColumnMappingResolver يُتحقَّق منه هناك مقابل رؤوس الأعمدة
  // الفعلية قبل قبوله (نفس نمط aiTypeResolver أدناه: اقتراح مقيَّد، لا قرار نهائي).
  let aiColumnMappingUsed = false;
  const missingCritical = () => mapping.code === -1 || (mapping.nameAr === -1 && mapping.nameEn === -1);
  if (missingCritical() && !opts.mappingOverride && opts.aiColumnMappingResolver) {
    const headerRow = (rows[headerIdx] || []).map((c) => (c === undefined ? "" : String(c)));
    try {
      const suggested = await opts.aiColumnMappingResolver(headerRow, mapping);
      Object.entries(suggested || {}).forEach(([field, idx]) => {
        if (
          mapping[field] === -1 &&
          Number.isInteger(idx) && idx >= 0 && idx < headerRow.length &&
          !Object.values(mapping).includes(idx)
        ) {
          mapping[field] = idx;
          aiColumnMappingUsed = true;
        }
      });
    } catch (err) {
      // أفضل جهد - لو فشل يبقى الخطأ الحتمي أدناه كما هو (لا تخمين بديل)
    }
  }

  const needsColumnHelp = (autoNeedsColumnHelp || aiColumnMappingUsed) && !opts.mappingOverride;
  if (missingCritical()) {
    throw new Error(
      "تعذّر تحديد عمودي الرمز والاسم في الملف تلقائياً — أعمدة الملف: " +
      ((rows[headerIdx] || []).filter(Boolean).join("، ") || "غير معروفة")
    );
  }
  const records = buildRecords(rows, mapping);
  const built = await buildOrganizedChart(records, opts);
  const blob = buildOrganizedChartWorkbook(built.orderedRows, built.auditNotes);

  const base = (file.name || "شجرة_حسابات").replace(/\.[^.]+$/, "");
  const filename = `${base}_منظمة_${Date.now()}.xlsx`;
  const summary =
    `تم تنظيم ${built.orderedRows.length} حساب — ${built.cleanCount} سليم بالكامل، ` +
    `${built.reviewCount} يحتاج مراجعة (تنويه غير حاسم)، ${built.errorCount} يحتاج تعديل قبل الرفع` +
    (built.excludedRows.length ? `، و${built.excludedRows.length} حساب استُبعد لأنه تابع لحساب مقفل نظامياً (سيُنشأ كسجل عميل/مورد لا كحساب)` : "") +
    (aiColumnMappingUsed
      ? ". تنبيه: بعض أعمدة الملف لم تُعرَف تلقائياً فطابقها الذكاء الاصطناعي بالاسم (راجعها قبل الاعتماد النهائي)"
      : needsColumnHelp ? ". تنبيه: بعض أعمدة الملف لم تُطابَق تلقائياً بثقة كاملة، راجع ورقة \"ملاحظات التدقيق\"" : "") +
    ".";

  return { blob, filename, summary, auditNotes: built.auditNotes, stats: built };
}
