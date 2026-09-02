import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import * as d3 from "d3";
import {
  Upload, Download, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  FileSpreadsheet, Sparkles, Copy, Settings2, ArrowRight, Info, Loader2,
  Search, X, GitBranch, Pencil, Plus, Trash2, Wand2, Layers,
} from "lucide-react";
import { useLanguage } from "./language";
import { useAuth } from "./auth";
import { trackMergeImport, trackMergeExport, trackMergeError } from "./activityTracker";
import { SafeInput, SafeTextarea } from "./lib/SafeInput";

// Translate the known dynamic Arabic error/toast messages to English.
function localizeMergeError(msg) {
  if (!msg) return msg;
  if (msg.startsWith("تعذّرت قراءة الملف")) return msg.replace("تعذّرت قراءة الملف", "Failed to read the file");
  if (msg === "ما قدرت أستخرج أي حساب من ملف 1") return "Could not extract any account from File 1";
  if (msg === "ما قدرت أستخرج أي حساب من ملف 2") return "Could not extract any account from File 2";
  if (msg.startsWith("تم تصحيح المستوى لـ")) return msg.replace(/تم تصحيح المستوى لـ (\d+) حساب حسب مستوى الأب/, "Corrected the level for $1 account(s) based on parent level");
  if (msg === "كل المستويات متطابقة مع الآباء") return "All levels already match their parents";
  if (msg.startsWith("تم استبعاد")) {
    let r = msg.replace('تم استبعاد "', 'Excluded "').replace('" من ملف الرفع', '" from the upload file');
    r = r.replace(' مع ', ' with ').replace(' حساب فرعي', ' child account(s)');
    return r;
  }
  if (msg.includes("حساب أب مفقود")) return msg.replace('فيه ', 'There are ').replace(' حساب أب مفقود', ' missing parent account(s)').replace(' - اضغط "أنشئ الآباء المفقودة" قبل التنزيل', ' — click "Create missing parents" before downloading');
  return msg;
}

// =====================================================================================
// ثوابت وهيكل النظام المحاسبي
// =====================================================================================

export const LEVEL2_TO_LEVEL1 = {
  "الأصول المتداولة": "الأصول",
  "الأصول غير المتداولة": "الأصول",
  "الالتزامات المتداولة": "الالتزامات",
  "الالتزامات غير المتداولة": "الالتزامات",
  "رأس المال المصدر": "حقوق الملاك",
  "حقوق الملاك الأخرى": "حقوق الملاك",
  "الأرباح المبقاة": "حقوق الملاك",
  "المبيعات": "الإيرادات",
  "الإيرادات الأخرى": "الإيرادات",
  "التكلفة المباشرة": "المصاريف",
  "تكاليف تشغيلية": "المصاريف",
  "تكاليف غير تشغيلية": "المصاريف",
};

const LEVEL2_TYPES = Object.keys(LEVEL2_TO_LEVEL1);

export const LEVEL3_MAP = {
  "الأصول المتداولة": [
    "المدينون", "حساب البنك", "سلف موظفين", "المخزون", "النقدية ومافي حكمها",
    "أصول متداولة أخرى", "عهد نقدية", "مصروفات مقدمة", "مخزون قطع غيار أصول",
  ],
  "الأصول غير المتداولة": [
    "أصول غير ملموسة", "أصول غير متداولة أخرى", "عقارات وآلات ومعدات",
    "استثمارات بشركة تابعة", "مشاريع تحت التنفيذ",
  ],
  "الالتزامات المتداولة": [
    "الدائنون", "مصاريف مستحقة", "الرواتب والمبالغ المستحقة للموظفين",
    "مجمع الاستهلاك", "مجمع الإطفاء", "مخصص الديون المشكوك في تحصيلها",
    "التزامات متداولة أخرى", "مخصصات", "قروض قصيرة الأجل", "الضرائب المستحقة",
    "الإيرادات المقدمة", "الزكاة المستحقة", "ضريبة القيمة المضافة المستحقة",
    "فوائد مستحقة", "الجزء المتداول من التزامات طويلة أجل",
  ],
  "الالتزامات غير المتداولة": [
    "قروض طويلة الأجل", "التزامات غير متداولة أخرى", "مخصص مكافأة نهاية الخدمة",
    "ضمان حسن التنفيذ",
  ],
  "رأس المال المصدر": ["رأس المال", "رأس المال الإضافي المدفوع"],
  "حقوق الملاك الأخرى": ["حقوق ملكية أخرى", "حقوق الموظفين", "الاحتياطيات"],
  "الأرباح المبقاة": ["الأرباح المبقاة (أو الخسائر)", "توزيع الأرباح"],
  "المبيعات": ["المبيعات"],
  "الإيرادات الأخرى": [
    "إيرادات أخرى", "مكاسب/خسائر بيع أصول", "مكاسب/خسائر بيع أصول غير ملموسة",
  ],
  "التكلفة المباشرة": ["تكلفة المبيعات", "تكاليف مباشرة أخرى"],
  "تكاليف تشغيلية": [
    "الرواتب", "مكافآت وحوافز", "مصاريف عمومية وإدارية", "مصاريف تسويقية",
    "تكاليف تشغيلية أخرى", "مصاريف الاستهلاك", "مصاريف الإطفاء",
    "مصاريف تقنية واستشارية", "مصاريف البحث والتطوير",
  ],
  "تكاليف غير تشغيلية": ["الضرائب", "الزكاة", "مصروف فوائد", "ترجمة عملات أجنبية"],
};

const UNMAPPED_TYPE = "الضريبة";
export const LEVEL1_ROOT_TYPES = ["الاصول", "الالتزامات", "حقوق الملاك", "الايرادات", "المصاريف"];
const LEVEL1_TYPES_ALLOWING_NEW = ["الايرادات", "المصاريف"];

const LEVEL1_ROOT_KEYWORDS = {
  الاصول: ["اصول", "assets", "asset"],
  الالتزامات: ["التزام", "liabilit"],
  "حقوق الملاك": ["حقوق الملاك", "حقوق الملكيه", "equity", "owners equity"],
  الايرادات: ["ايراد", "تبرع", "دخل", "revenue"],
  المصاريف: ["مصروف", "مصاريف", "expense"],
};

const KEYWORD_SYNONYMS = {
  "النقدية ومافي حكمها": ["نقدية", "نقد", "كاش", "صندوق", "خزينة", "اموال", "ودائع بنكية", "ودائع", "أرصدة بنكية"],
  "حساب البنك": ["بنك", "مصرف", "حساب بنكي", "حساب جاري", "حسابات جارية", "الراجحي", "الأهلي", "الإنماء", "سامبا"],
  "المدينون": ["عملاء", "عميل", "مدينون", "ذمم مدينة", "مستحقات على عملاء"],
  "سلف موظفين": ["سلفة", "سلف", "سلفيات", "سلفة موظف", "سلف موظفين"],
  "المخزون": ["مخزون", "بضاعة", "مستودع", "خامات", "منتج تام", "مواد أولية"],
  "عهد نقدية": ["عهدة", "عهد", "عهدة نقدية", "عهدة موظف"],
  "مصروفات مقدمة": ["مدفوع مقدمًا", "مصروف مقدم", "مصروفات مقدمة", "مصاريف مقدمة", "مصروفات مدفوعة مقدما", "مصروف مدفوع مقدما", "مدفوعة مقدما", "مدفوعات مقدمة", "دفعات مقدمة", "دفعة مقدمة", "إيجار مقدم", "إيجارات مقدمة", "تأمين مقدم", "اشتراكات مقدمة"],
  "مخزون قطع غيار أصول": ["قطع غيار", "قطع الغيار"],
  "أصول غير ملموسة": ["برامج", "برمجيات", "شهرة", "علامة تجارية", "براءة اختراع", "تراخيص"],
  "عقارات وآلات ومعدات": ["أراضي", "مباني", "عقار", "سيارات", "آلات", "معدات", "أثاث", "أجهزة", "كمبيوتر", "سيارة", "أصول ثابتة", "الأصول الثابتة", "موجودات ثابتة", "ممتلكات ومعدات", "عدد وأدوات"],
  "استثمارات بشركة تابعة": ["استثمار", "استثمارات", "أسهم", "شركة تابعة"],
  "مشاريع تحت التنفيذ": ["مشروع تحت التنفيذ", "مشاريع تحت التنفيذ", "أعمال تحت التنفيذ", "تحت الانشاء", "تحت الإنشاء", "أعمال رأسمالية", "اعمال رأسمالية"],
  "الدائنون": ["موردون", "مورد", "دائنون", "ذمم دائنة", "مستحقات للموردين"],
  "مصاريف مستحقة": ["مصروف مستحق", "مصاريف مستحقة", "مصروفات مستحقة", "إيجار مستحق", "كهرباء مستحقة", "مستحقة", "مستحق"],
  "الرواتب والمبالغ المستحقة للموظفين": ["رواتب مستحقة", "أجور مستحقة", "مستحقات موظفين", "مكافأة مستحقة"],
  "مجمع الاستهلاك": ["مجمع استهلاك", "مجمع الإهلاك", "مجمعات الإهلاك", "مجمعات الاستهلاك", "مجمع إهلاك", "إهلاك تراكمي", "إهلاك متراكم"],
  "مجمع الإطفاء": ["مجمع إطفاء", "إطفاء تراكمي", "مجمع الاستنفاذ", "مجمعات الاستنفاذ", "استنفاذ متراكم"],
  "مخصص الديون المشكوك في تحصيلها": ["مخصص ديون", "ديون مشكوك في تحصيلها"],
  "مخصص مكافأة نهاية الخدمة": ["نهاية الخدمة", "مكافأة نهاية الخدمة", "منافع موظفين"],
  "قروض قصيرة الأجل": ["قرض قصير", "تمويل قصير", "تسهيلات بنكية"],
  "قروض طويلة الأجل": ["قرض طويل", "تمويل طويل", "تسهيلات طويلة"],
  "التزامات غير متداولة أخرى": ["صافي الأصول", "صافي أصول", "صافي الاصول", "صافي الأصول المقيدة", "صافي الأصول غير المقيدة"],
  "الضرائب المستحقة": ["ضريبة مستحقة", "الضرائب المستحقة", "ضريبة دخل مستحقة"],
  "ضريبة القيمة المضافة المستحقة": ["ضريبة قيمة مضافة", "فات", "vat", "ضريبة المبيعات"],
  "الزكاة المستحقة": ["زكاة مستحقة", "مخصص زكاة"],
  "رأس المال": ["راس المال", "رأس المال", "حصة الشريك", "رأس مال"],
  "الأرباح المبقاة (أو الخسائر)": ["أرباح مدورة", "أرباح مبقاة", "خسائر مدورة", "أرباح مرحلة"],
  "توزيع الأرباح": ["توزيعات أرباح", "مسحوبات شخصية", "مسحوبات شركاء"],
  "المبيعات": ["إيراد مبيعات", "مبيعات", "إيرادات خدمات", "إيراد نشاط", "مبيعات بضاعة"],
  "إيرادات أخرى": ["إيراد أوراق مالية", "إيرادات متنوعة", "إيراد استثمار", "فوائد دائنة", "إيراد تأجير"],
  "تكلفة المبيعات": ["تكلفة بضاعة", "تكلفة المبيعات", "تكلفة الخدمات", "تكلفة المشتريات"],
  "الرواتب": ["أجور", "رواتب", "مرتبات", "بدلات", "بدل سكن", "بدل نقل", "تكاليف العاملين", "تكاليف الموظفين", "تكلفة العاملين", "تكلفة الموظفين", "مصاريف العاملين", "مصاريف الموظفين", "أجور العاملين"],
  "مصاريف عمومية وإدارية": ["صيانة", "كهرباء", "ماء", "اتصالات", "إيجار", "ضيافة", "أدوات كتابية", "مطبوعات", "رسوم حكومية", "تأمين", "مصاريف إدارية", "مصاريف ادارية", "إدارية وعمومية", "عمومية وإدارية", "مصاريف عمومية"],
  "مصاريف تسويقية": ["تسويق", "دعاية", "إعلان", "ترويج", "عمولات مبيعات"],
  "مصاريف الاستهلاك": ["مصروف استهلاك", "مصروف إهلاك", "إهلاك السنة"],
  "مصاريف الإطفاء": ["مصروف إطفاء", "إطفاء أصول"],
  "الضرائب": ["مصروف ضريبة", "ضريبة الدخل"],
  "الزكاة": ["مصروف زكاة", "زكاة الشرعية"],
  "مصروف فوائد": ["فوائد مدينة", "عمولات بنكية", "رسوم بنكية", "مصاريف تمويلية"],
  "الإيرادات المقدمة": ["إيرادات مقدمة", "ايرادات مقدمة", "تبرعات مقدمة", "إيراد مقدم", "مقبوضة مقدمًا", "دفعات مقدمة من عملاء"],
  "التزامات متداولة أخرى": ["أوراق دفع", "اوراق دفع", "أمانات", "استقطاعات", "التزامات أخرى"],
  "مخصصات": ["مخصص", "مخصصات"],
  "أصول غير متداولة أخرى": ["موجودات حيوية", "أصول حيوية", "أصول أخرى غير متداولة"],
  "أصول متداولة أخرى": ["أرصدة مدينة أخرى", "حسابات جارية للفروع", "أطراف ذات علاقة", "ذمم موظفين"],
  "الاحتياطيات": ["احتياطي", "احتياطيات"],
  "ضمان حسن التنفيذ": ["ضمان حسن التنفيذ", "محتجزات ضمان"],
};

// مرادفات إنجليزية - كثير من ملفات العملاء أسماء حساباتها إنجليزية فقط
const KEYWORD_SYNONYMS_EN = {
  "النقدية ومافي حكمها": ["cash", "petty cash", "cash on hand", "cash in hand"],
  "حساب البنك": ["bank", "bank account", "current account", "checking account"],
  "المدينون": ["customer", "customers", "receivable", "receivables", "accounts receivable", "ar", "debtors", "trade receivable"],
  "سلف موظفين": ["employee advance", "employees advances", "staff advance", "advance to employee"],
  "المخزون": ["inventory", "stock", "raw material", "raw materials", "finished goods", "warehouse"],
  "عهد نقدية": ["custody", "imprest", "cash custody"],
  "مصروفات مقدمة": ["prepaid", "prepaid expense", "prepaid expenses", "prepayment", "prepaid rent", "prepaid insurance"],
  "مخزون قطع غيار أصول": ["spare part", "spare parts"],
  "أصول غير ملموسة": ["intangible", "intangible assets", "software", "goodwill", "trademark", "license", "licenses", "patent"],
  "عقارات وآلات ومعدات": ["vehicle", "vehicles", "car", "cars", "truck", "trucks", "bus", "property", "plant", "equipment", "equipments", "machinery", "machine", "machines", "furniture", "fixtures", "building", "buildings", "land", "lands", "computer", "computers", "laptop", "hardware", "ppe", "fixed asset", "fixed assets", "tools"],
  "استثمارات بشركة تابعة": ["investment", "investments", "subsidiary", "shares", "equity investment"],
  "مشاريع تحت التنفيذ": ["work in progress", "wip", "under construction", "capital work in progress", "cwip"],
  "الدائنون": ["supplier", "suppliers", "vendor", "vendors", "payable", "payables", "accounts payable", "ap", "creditors", "trade payable"],
  "مصاريف مستحقة": ["accrued", "accrued expense", "accrued expenses", "accruals"],
  "الرواتب والمبالغ المستحقة للموظفين": ["accrued salaries", "accrued payroll", "salaries payable", "payroll payable"],
  "مجمع الاستهلاك": ["accumulated depreciation"],
  "مجمع الإطفاء": ["accumulated amortization", "accumulated amortisation"],
  "مخصص الديون المشكوك في تحصيلها": ["doubtful", "bad debt provision", "allowance for doubtful accounts"],
  "مخصص مكافأة نهاية الخدمة": ["end of service", "eosb", "severance", "gratuity", "employee benefits"],
  "قروض قصيرة الأجل": ["short term loan", "short-term loan", "overdraft"],
  "قروض طويلة الأجل": ["long term loan", "long-term loan"],
  "الضرائب المستحقة": ["tax payable", "income tax payable"],
  "ضريبة القيمة المضافة المستحقة": ["vat", "value added tax", "output vat", "input vat"],
  "الزكاة المستحقة": ["zakat payable"],
  "رأس المال": ["capital", "share capital", "paid up capital", "partner capital", "owner capital"],
  "الأرباح المبقاة (أو الخسائر)": ["retained earnings", "accumulated profit", "accumulated losses"],
  "توزيع الأرباح": ["dividend", "dividends", "drawings", "withdrawals"],
  "المبيعات": ["sales", "revenue", "revenues", "sales revenue", "service revenue"],
  "إيرادات أخرى": ["other income", "other revenue", "interest income", "rental income", "misc income"],
  "تكلفة المبيعات": ["cost of sales", "cogs", "cost of goods sold", "cost of revenue", "direct cost"],
  "الرواتب": ["salary", "salaries", "wages", "payroll", "allowance", "allowances"],
  "مصاريف عمومية وإدارية": ["general and administrative", "administrative expenses", "admin expense", "rent", "electricity", "water", "maintenance", "utilities", "stationery", "insurance", "telephone", "internet", "government fees"],
  "مصاريف تسويقية": ["marketing", "advertising", "advertisement", "promotion", "sales commission"],
  "مصاريف الاستهلاك": ["depreciation expense", "depreciation"],
  "مصاريف الإطفاء": ["amortization expense", "amortization", "amortisation"],
  "الضرائب": ["income tax expense", "tax expense"],
  "الزكاة": ["zakat expense", "zakat"],
  "مصروف فوائد": ["interest expense", "bank charges", "bank fees", "finance cost", "finance charges"],
};

Object.entries(KEYWORD_SYNONYMS_EN).forEach(([type, kws]) => {
  KEYWORD_SYNONYMS[type] = [...(KEYWORD_SYNONYMS[type] || []), ...kws];
});

// يزيل "ال" التعريف من بداية كل كلمة - للمطابقة فقط
// "الذمم المدينة" -> "ذمم مدينه" حتى تطابق المرادف "ذمم مدينة"
function normalizeForMatch(str) {
  return normalizeArabic(str).replace(/(^|\s)ال(?=\S)/g, "$1");
}

// مطابقة الكلمات اللاتينية بحدود كلمة، حتى لا يطابق "rent" داخل "current" أو "car" داخل "cargo"
const LATIN_KEYWORD_RE = /^[a-z0-9][a-z0-9 &/'-]*$/;
function textHasKeyword(normName, normKw) {
  if (!normName || !normKw) return false;
  if (LATIN_KEYWORD_RE.test(normKw)) {
    const esc = normKw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(normName);
  }
  return normName.includes(normKw);
}

export const ALL_LEVEL3_TYPES = [...new Set(Object.values(LEVEL3_MAP).flat()), UNMAPPED_TYPE];

export const TYPE_TO_LEVEL2 = {};
Object.entries(LEVEL3_MAP).forEach(([level2, types]) => {
  types.forEach((t) => { if (!TYPE_TO_LEVEL2[t]) TYPE_TO_LEVEL2[t] = level2; });
});

// =====================================================================================
// دوال تحليل النصوص والأنواع المحاسبية
// =====================================================================================

function normalizeArabic(str) {
  if (str === null || str === undefined) return "";
  return String(str).trim()
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .toLowerCase().trim();
}

// [إصلاح جذري] رمز الحساب أولاً وأخيرًا: أول رقم في رمز الحساب نفسه يحدد جذره
// حتماً - 1=أصول، 2=التزامات، 3=حقوق ملاك، 4=إيرادات، 5=مصاريف - قاعدة قيود
// الرقمية شبه العالمية. هذا أقوى مرجع هرمي متاح إطلاقاً: لا يعتمد على تفسير اسم
// ولا على توفر صف أب موثوق بياناته، فيُعتمد قبل أي استنتاج آخر ولا يجوز لاسم
// الحساب ولا لعمود النوع في ملف العميل أن يخالفاه. حساب برمز لا يبدأ برقم من
// 1-5 (ترقيم غير قياسي) يعيد "" فتستمر بقية طبقات الاستنتاج كما كانت.
const CODE_ROOT_BY_FIRST_DIGIT = {
  "1": "الاصول", "2": "الالتزامات", "3": "حقوق الملاك", "4": "الايرادات", "5": "المصاريف",
};
function rootFromAccountCode(code) {
  const d = String(code ?? "").trim().charAt(0);
  return CODE_ROOT_BY_FIRST_DIGIT[d] || "";
}

function matchLevel1RootByKeyword(text) {
  if (!text) return null;
  const n = normalizeArabic(text);
  for (const [root, keywords] of Object.entries(LEVEL1_ROOT_KEYWORDS)) {
    if (keywords.some((kw) => n.includes(normalizeArabic(kw)))) return root;
  }
  return null;
}

function typeNamesMatch(a, b) {
  const na = normalizeArabic(a), nb = normalizeArabic(b);
  if (na === nb) return true;
  return na.replace(/\s+/g, "") === nb.replace(/\s+/g, "");
}

// =====================================================================================
// توحيد أسماء الفئات وأنواع الحسابات القادمة من ملفات العملاء مع القوائم المعتمدة بقيود
// أي قيمة خارج القائمة كانت تُخزَّن كما هي، فتظهر القائمة المنسدلة فارغة ("اختر النوع")
// =====================================================================================

const LEVEL3_ALIAS_INDEX = (() => {
  const idx = new Map();
  const add = (alias, type) => {
    const k = normalizeArabic(alias);
    if (!k) return;
    if (!idx.has(k)) idx.set(k, type);
    const compact = k.replace(/\s+/g, "");
    if (!idx.has(compact)) idx.set(compact, type);
  };
  ALL_LEVEL3_TYPES.forEach((t) => add(t, t));
  Object.entries(KEYWORD_SYNONYMS).forEach(([type, kws]) => {
    if (!ALL_LEVEL3_TYPES.includes(type)) return;
    kws.forEach((kw) => add(kw, type));
  });
  return idx;
})();

// مرادفات إنجليزية لفئات المستوى 2
const LEVEL2_EN_ALIASES = {
  "الأصول المتداولة": ["current assets", "current asset"],
  "الأصول غير المتداولة": ["non current assets", "non-current assets", "noncurrent assets", "fixed assets", "long term assets", "أصول الأوقاف", "اصول الاوقاف", "أصول ثابتة", "الأصول الثابتة"],
  "الالتزامات المتداولة": ["current liabilities", "current liability", "short term liabilities"],
  "الالتزامات غير المتداولة": ["non current liabilities", "non-current liabilities", "noncurrent liabilities", "long term liabilities", "صافي الأصول", "صافي أصول", "صافي الاصول"],
  "رأس المال المصدر": ["share capital", "issued capital", "paid up capital"],
  "حقوق الملاك الأخرى": ["other equity", "owners equity", "shareholders equity", "equity"],
  "الأرباح المبقاة": ["retained earnings"],
  "المبيعات": ["sales", "sales revenue", "operating revenue"],
  "الإيرادات الأخرى": ["other income", "other revenue", "non operating income"],
  "التكلفة المباشرة": ["direct cost", "direct costs", "cost of sales", "cogs"],
  "تكاليف تشغيلية": ["operating expenses", "operating cost", "operating costs", "opex"],
  "تكاليف غير تشغيلية": ["non operating expenses", "non-operating expenses", "other expenses"],
};

const LEVEL2_ALIAS_INDEX = (() => {
  const idx = new Map();
  const add = (alias, cat) => {
    const k = normalizeArabic(alias);
    if (!k) return;
    if (!idx.has(k)) idx.set(k, cat);
    const compact = k.replace(/\s+/g, "");
    if (!idx.has(compact)) idx.set(compact, cat);
  };
  LEVEL2_TYPES.forEach((t) => add(t, t));
  Object.entries(LEVEL2_EN_ALIASES).forEach(([cat, aliases]) => aliases.forEach((a) => add(a, cat)));
  return idx;
})();

// جذر الشجرة (مستوى 1) الذي تتبعه فئة أو نوع معيّن - أساس التحقق من سلامة الهيكل
function rootOfCategory(category) {
  if (!category) return "";
  const root = LEVEL2_TO_LEVEL1[category];
  return root ? normalizeArabic(root) : "";
}

function rootOfType(type) {
  if (!type) return "";
  return rootOfCategory(TYPE_TO_LEVEL2[type]);
}

function sameRoot(a, b) {
  if (!a || !b) return true;
  return normalizeArabic(a) === normalizeArabic(b);
}

// أنواع موضعها في قيود ثابت نظاميًا - يُعتمد موضع قيود ويُتجاوز موضع العميل بصمت
// (حسابات مقابلة Contra: قيود يضعها كلها تحت الالتزامات المتداولة)
const QOYOD_FIXED_PLACEMENT_TYPES = [
  "مجمع الاستهلاك",
  "مجمع الإطفاء",
  "مخصص الديون المشكوك في تحصيلها",
];

// الفئة الافتراضية لكل جذر - تُستخدم لحسابات المستوى 2 التي لا يمكن تحديد فئتها من اسمها
export const DEFAULT_LEVEL2_BY_ROOT = {
  "الاصول": "الأصول المتداولة",
  "الالتزامات": "الالتزامات المتداولة",
  "حقوق الملاك": "حقوق الملاك الأخرى",
  "الايرادات": "الإيرادات الأخرى",
  "المصاريف": "تكاليف تشغيلية",
};

// النوع الأعم داخل كل فئة - يُستخدم كملاذ أخير حتى لا تبقى خانة النوع فارغة
export const DEFAULT_TYPE_BY_LEVEL2 = (() => {
  const out = {};
  Object.entries(LEVEL3_MAP).forEach(([cat, types]) => {
    out[cat] = types.find((t) => normalizeArabic(t).includes("اخري")) || types[0];
  });
  return out;
})();

// يستنتج الفئة (م2) من نص حر اعتمادًا على الجذر (أصول/التزامات/...) وكلمات التداول
function categoryFromRootKeywords(text) {
  const n = normalizeArabic(text);
  if (!n) return "";
  const root = matchLevel1RootByKeyword(n);
  if (!root) return "";
  const nonCurrent = /غير\s*(ال)?متداول/.test(n) || /طويل/.test(n);
  const current = /متداول/.test(n) || /قصير/.test(n);
  switch (root) {
    case "الاصول":
      if (nonCurrent) return "الأصول غير المتداولة";
      if (current) return "الأصول المتداولة";
      return "";
    case "الالتزامات":
      if (nonCurrent) return "الالتزامات غير المتداولة";
      if (current) return "الالتزامات المتداولة";
      return "";
    case "حقوق الملاك":
      if (/راس المال/.test(n)) return "رأس المال المصدر";
      if (/ارباح/.test(n)) return "الأرباح المبقاة";
      return "حقوق الملاك الأخرى";
    case "الايرادات":
      if (/مبيعات/.test(n)) return "المبيعات";
      return "الإيرادات الأخرى";
    case "المصاريف":
      if (/غير\s*تشغيل/.test(n)) return "تكاليف غير تشغيلية";
      if (/مباشر/.test(n) || /تكلفه المبيعات/.test(n)) return "التكلفة المباشرة";
      return "تكاليف تشغيلية";
    default:
      return "";
  }
}

// ذاكرة مؤقتة: نفس النص يتكرر آلاف المرات في ملفات شجرة الحسابات
const LEVEL3_CANON_CACHE = new Map();
const LEVEL2_CANON_CACHE = new Map();

// يرجّع اسم نوع الحساب (م3) كما هو معتمد في قيود، أو "" إذا تعذّر التعرف عليه
function canonicalizeLevel3Type(raw) {
  const n = normalizeArabic(raw);
  if (!n) return "";
  if (LEVEL3_CANON_CACHE.has(n)) return LEVEL3_CANON_CACHE.get(n);
  const result = computeCanonicalLevel3Type(raw, n);
  LEVEL3_CANON_CACHE.set(n, result);
  return result;
}

function computeCanonicalLevel3Type(raw, n) {
  const direct = LEVEL3_ALIAS_INDEX.get(n) || LEVEL3_ALIAS_INDEX.get(n.replace(/\s+/g, ""));
  if (direct) return direct;
  // صياغة مختلفة لنفس النوع ("النقد وما يعادله" / "الموردين") - نستنتج منها كما نستنتج من الاسم
  const inferred = inferLevel3TypeFromText(raw, "");
  if (inferred) return inferred;
  let best = "", bestScore = 0;
  ALL_LEVEL3_TYPES.forEach((t) => {
    const score = similarityNormalized(n, normalizeArabic(t));
    if (score > bestScore) { bestScore = score; best = t; }
  });
  return bestScore >= 0.82 ? best : "";
}

// يرجّع اسم الفئة (م2) كما هي معتمدة في قيود، أو "" إذا تعذّر التعرف عليها
function canonicalizeLevel2Category(raw) {
  const n = normalizeArabic(raw);
  if (!n) return "";
  if (LEVEL2_CANON_CACHE.has(n)) return LEVEL2_CANON_CACHE.get(n);
  const result = computeCanonicalLevel2Category(n);
  LEVEL2_CANON_CACHE.set(n, result);
  return result;
}

function computeCanonicalLevel2Category(n) {
  const direct = LEVEL2_ALIAS_INDEX.get(n) || LEVEL2_ALIAS_INDEX.get(n.replace(/\s+/g, ""));
  if (direct) return direct;
  let best = "", bestScore = 0;
  LEVEL2_TYPES.forEach((t) => {
    const score = similarityNormalized(n, normalizeArabic(t));
    if (score > bestScore) { bestScore = score; best = t; }
  });
  if (bestScore >= 0.82) return best;
  return categoryFromRootKeywords(n);
}

// =====================================================================================
// [إصلاح] قراءة الجذر (مستوى1) - نوع الحساب لا يحدد الجذر أبدًا
// أنواع مثل "مصروفات مقدمة" (أصول) و"مصاريف مستحقة" و"الإيرادات المقدمة" (التزامات)
// و"مكاسب/خسائر بيع أصول" (إيرادات) كانت تُقرأ كجذر بسبب كلمة مفتاحية داخل اسمها،
// فيُرمى النوع الصحيح ويظهر تنبيه تعارض وهمي. الجذر يُشتق من الجداول الثابتة أو من
// موقع الحساب في الشجرة - لا من نص اسم النوع.
// =====================================================================================

// هل النص اسم نوع (م3) أو فئة (م2) معتمد في قيود؟ إن كان كذلك فهو ليس اسم جذر
function isCanonicalTypeOrCategoryName(raw) {
  const n = normalizeArabic(raw);
  if (!n) return false;
  const c = n.replace(/\s+/g, "");
  return LEVEL3_ALIAS_INDEX.has(n) || LEVEL3_ALIAS_INDEX.has(c)
      || LEVEL2_ALIAS_INDEX.has(n) || LEVEL2_ALIAS_INDEX.has(c);
}

// صارم: لقراءة عمود "نوع الحساب" في صفوف المستوى 2 فأعلى
function canonicalizeLevel1Root(raw) {
  if (!raw) return "";
  const match = LEVEL1_ROOT_TYPES.find((t) => typeNamesMatch(t, raw));
  if (match) return match;
  if (isCanonicalTypeOrCategoryName(raw)) return "";
  return matchLevel1RootByKeyword(raw) || "";
}

// متساهل: لصفوف المستوى 1 فقط، لأن عمود النوع فيها يحمل اسم الجذر فعلاً
// (يخدم الجمعيات: "التبرعات والإيرادات" -> الايرادات)
function level1RootFromText(raw) {
  if (!raw) return "";
  const match = LEVEL1_ROOT_TYPES.find((t) => typeNamesMatch(t, raw));
  if (match) return match;
  return matchLevel1RootByKeyword(raw) || "";
}

// جذر أي نص حر: يحلّه كنوع أو فئة أولاً عبر الجداول الثابتة، والكلمات المفتاحية آخر ملاذ.
// يُستخدم لاستنتاج جذر الحساب الأب من نصّه مهما كان مستواه
function rootFromAnyText(raw) {
  if (!raw) return "";
  const match = LEVEL1_ROOT_TYPES.find((t) => typeNamesMatch(t, raw));
  if (match) return normalizeArabic(match);
  const n = normalizeArabic(raw), c = n.replace(/\s+/g, "");
  const asType = LEVEL3_ALIAS_INDEX.get(n) || LEVEL3_ALIAS_INDEX.get(c);
  if (asType) return rootOfType(asType);
  const asCat = LEVEL2_ALIAS_INDEX.get(n) || LEVEL2_ALIAS_INDEX.get(c);
  if (asCat) return rootOfCategory(asCat);
  const kw = matchLevel1RootByKeyword(raw);
  return kw ? normalizeArabic(kw) : "";
}

// كل أنواع الحسابات (م3) التي تقع تحت جذر معيّن - لتضييق دائرة الاستنتاج
function level3TypesForRoot(root) {
  if (!root) return null;
  const nRoot = normalizeArabic(root);
  const cats = Object.entries(LEVEL2_TO_LEVEL1)
    .filter(([, r]) => normalizeArabic(r) === nRoot)
    .map(([cat]) => cat);
  if (cats.length === 0) return null;
  return [...new Set(cats.flatMap((cat) => LEVEL3_MAP[cat] || []))];
}

function extractParentCode(raw) {
  if (raw === null || raw === undefined) return "";
  let s = String(raw).trim();
  const dashIdx = s.indexOf(" - ");
  if (dashIdx !== -1) s = s.slice(0, dashIdx).trim();
  // حماية جوهرية: رمز الحساب الأب يجب أن يكون أرقامًا فقط - أي نص (اسم حساب
  // تسرّب من عمود خاطئ مثلاً) يُرفض هنا فورًا بدل أن يتحول لاحقًا لحساب أب
  // مزيف بكود حروف عند "إنشاء الآباء المفقودة".
  return /^\d+$/.test(s) ? s : "";
}

function findParentByCodeTruncation(childCode, codeMap) {
  if (!childCode) return null;
  let current = String(childCode).trim();
  while (current.length > 1) {
    current = current.slice(0, -1);
    if (codeMap.has(current)) return codeMap.get(current);
  }
  return null;
}

// جديد: يرجّع أقرب رمز أب موجود فعليًا ضمن مجموعة رموز معطاة (بالاقتطاع من اليمين)
function guessAncestorCode(code, codesSet) {
  let current = String(code || "").trim();
  while (current.length > 1) {
    current = current.slice(0, -1);
    if (codesSet.has(current)) return current;
  }
  return "";
}

function inferLevel3TypeFromText(name, level2Category, candidateList) {
  if (!name) return null;
  const normName = normalizeForMatch(name);

  const candidates = candidateList && candidateList.length
    ? candidateList
    : (level2Category && LEVEL3_MAP[level2Category] ? LEVEL3_MAP[level2Category] : ALL_LEVEL3_TYPES);

  for (const t of candidates) {
    if (textHasKeyword(normName, normalizeForMatch(t))) return t;
  }

  let bestMatch = null;
  let maxScore = 0;

  candidates.forEach((t) => {
    const keywords = KEYWORD_SYNONYMS[t] || [];
    keywords.forEach((kw) => {
      const normKw = normalizeForMatch(kw);
      if (textHasKeyword(normName, normKw)) {
        const score = normKw.length;
        if (score > maxScore) {
          maxScore = score;
          bestMatch = t;
        }
      }
    });
  });

  return bestMatch;
}

/**
 * يحدّد "الفئة (م2)" و"نوع الحساب (م3)" لصف واحد بشكل حتمي:
 *  - أي نوع مكتوب في ملف العميل يمر أولاً على قائمة قيود المعتمدة (توحيد + مطابقة تقريبية)،
 *    فإذا كان خارجها لا يُخزَّن كما هو (كان يسبب ظهور "اختر النوع" فارغة) بل يُستنتج البديل.
 *  - الفئة تُشتق من سلسلة الآباء (رمز الأب مثل 11) قبل الاعتماد على نص الصف نفسه.
 *  - المستوى 1 و 2 لهما قوائم أنواع مختلفة تمامًا عن المستوى 3+.
 * @param {object} row صف ملف 2 مع level و parent
 * @param {object|null} parentRow صف الأب (سواء من الشجرة الحالية أو من الصفوف الجديدة)
 * @param {object} level2CodeMap خريطة الفئة -> رمز الحساب في الشجرة الحالية
 * @param {string} ancestorCategory الفئة المستنتجة من سلسلة الآباء في الشجرة الحالية
 * @returns {{level2Category: string, type: string, notes: string[]}}
 */
export function resolveAccountTypeAndCategory(row, parentRow, level2CodeMap, ancestorCategory) {
  const level = Number(row.level);
  const notes = [];
  const rawType = String(row.type || "").trim();
  const nameText = [row.nameAr, row.nameEn].filter(Boolean).join(" ").trim();
  const parentText = parentRow ? (parentRow.type || parentRow.nameAr || parentRow.nameEn || "") : "";

  // عمود "نوع الحساب" في ملفات كثيرة يحمل اسم الجذر (الأصول/الالتزامات/المصروفات/الدخل)
  // وليس نوع حساب - لازم يُقرأ كجذر لا كنوع، وإلا انهار الهيكل بالكامل.
  // ملاحظة: النسخة الصارمة لا تعتبر أسماء الأنواع/الفئات المعتمدة جذورًا (إصلاح "مصروفات مقدمة")
  const declaredRoot = canonicalizeLevel1Root(rawType);
  // رمز الحساب نفسه أولاً - أقوى مرجع هرمي متاح، انظر التعليق أعلى الدالة
  const codeRoot = rootFromAccountCode(row.code);

  // ===== المستوى 1: النوع هو جذر الشجرة (أصول / التزامات / ...) =====
  if (level === 1) {
    const root1 = codeRoot || level1RootFromText(rawType) || level1RootFromText(nameText);
    if (rawType && !root1) notes.push(`نوع الحساب "${rawType}" غير معتمد لحساب مستوى 1 - تم استنتاجه من الاسم`);
    return { level2Category: "", type: root1 || "", notes };
  }

  // ===== المستوى 2: النوع هو الفئة نفسها (أصول متداولة / تكاليف تشغيلية / ...) =====
  if (level === 2) {
    // رمز الحساب نفسه أولاً، فموقعه في الشجرة، فالجذر المصرّح بالملف، فالاسم
    const chainRoot = rootFromAnyText(parentText);
    const rootHint = codeRoot || chainRoot || declaredRoot || canonicalizeLevel1Root(nameText);
    if (codeRoot && chainRoot && !sameRoot(codeRoot, chainRoot)) {
      notes.push(`رمز الحساب "${row.code}" يشير إلى جذر "${codeRoot}" بينما موقعه في الشجرة يوحي بجذر مختلف - تم اعتماد رمز الحساب`);
    } else if (chainRoot && declaredRoot && !sameRoot(chainRoot, declaredRoot)) {
      notes.push(`عمود النوع بالملف يقول "${declaredRoot}" بينما الحساب واقع تحت "${chainRoot}" - تم اعتماد موقعه في الشجرة`);
    }

    // 1) النوع المكتوب بالملف إذا كان فئة (م2) معتمدة - ولا يُقرأ كفئة إذا كان اسم جذر
    let type = declaredRoot ? "" : canonicalizeLevel2Category(rawType);
    if (type && rootHint && !sameRoot(rootOfCategory(type), rootHint)) {
      notes.push(`الفئة "${type}" لا تتبع جذر "${rootHint}" - تم تجاهلها`);
      type = "";
    }

    // 2) إذا كتب العميل نوع مستوى-3 على صف مستوى 2 (مثل "عقارات وآلات ومعدات") نرفعه لفئته
    if (!type && rawType && !declaredRoot) {
      const asL3 = canonicalizeLevel3Type(rawType);
      const asCat = asL3 ? TYPE_TO_LEVEL2[asL3] : "";
      if (asCat && (!rootHint || sameRoot(rootOfCategory(asCat), rootHint))) type = asCat;
    }

    // 3) اسم الحساب نفسه إذا كان اسم فئة صريح ("أصول غير متداولة")
    if (!type) {
      const fromName = canonicalizeLevel2Category(nameText);
      if (fromName && (!rootHint || sameRoot(rootOfCategory(fromName), rootHint))) type = fromName;
    }

    // 4) استنتاج النوع من الاسم ثم رفعه لفئته: Vehicle -> عقارات وآلات ومعدات -> الأصول غير المتداولة
    if (!type) {
      const rootCandidates = level3TypesForRoot(rootHint);
      const guessedType = (rootCandidates ? inferLevel3TypeFromText(nameText, "", rootCandidates) : "")
        || inferLevel3TypeFromText(nameText, "");
      const guessedCat = guessedType ? TYPE_TO_LEVEL2[guessedType] : "";
      if (guessedCat && (!rootHint || sameRoot(rootOfCategory(guessedCat), rootHint))) type = guessedCat;
    }

    // 5) الملاذ الأخير: فئة افتراضية حسب جذر الحساب الأب، مع تنبيه للمراجعة
    if (!type) {
      const guess = rootHint ? DEFAULT_LEVEL2_BY_ROOT[rootHint] : "";
      if (guess) {
        type = guess;
        notes.push(`تعذّر تحديد فئة الحساب من اسمه - تم اختيار "${guess}" افتراضيًا حسب الحساب الأب، يرجى المراجعة`);
      }
    }

    return { level2Category: "", type: type || "", notes };
  }

  // ===== المستوى 3 فما فوق =====

  // 1) معلومات الأب بعد توحيدها (level قد يكون نصًا قادمًا من الملف)
  const parentLevel = parentRow ? Number(parentRow.level) : NaN;
  const parentType = parentRow ? canonicalizeLevel3Type(parentRow.type) : "";
  // ملاحظة حاسمة: لو الأب مستوى 2 فإن حقل type عنده يحمل الفئة نفسها،
  // فلازم يُقرأ كفئة قبل أي محاولة لقراءته كنوع مستوى 3
  const parentCategory = parentRow
    ? (canonicalizeLevel2Category(parentRow.level2Category)
      || (parentLevel === 2
        ? (canonicalizeLevel2Category(parentRow.type) || canonicalizeLevel2Category(parentRow.nameAr || parentRow.nameEn))
        : "")
      || (parentType ? TYPE_TO_LEVEL2[parentType] : ""))
    : "";

  // 2) الجذر المرجعي للصف - لا يجوز أبدًا خروج الفئة أو النوع عنه.
  //    رمز الحساب نفسه أولاً وأخيرًا (انظر تعليق rootFromAccountCode)، فموقع
  //    الحساب في الشجرة (سلسلة الآباء)، لأن ملفات العملاء كثيرًا ما تحمل جذرًا
  //    خاطئًا في عمود النوع على صفوف فرعية عميقة.
  const chainRoot =
    rootOfCategory(canonicalizeLevel2Category(ancestorCategory)) ||
    rootOfCategory(parentCategory) ||
    rootFromAnyText(parentText) ||
    "";
  const rowRoot = codeRoot || chainRoot || declaredRoot || canonicalizeLevel1Root(nameText) || "";
  if (codeRoot && chainRoot && !sameRoot(codeRoot, chainRoot)) {
    notes.push(`رمز الحساب "${row.code}" يشير إلى جذر "${codeRoot}" بينما موقعه في الشجرة يوحي بجذر مختلف - تم اعتماد رمز الحساب`);
  } else if (chainRoot && declaredRoot && !sameRoot(chainRoot, declaredRoot)) {
    notes.push(`عمود النوع بالملف يقول "${declaredRoot}" بينما الحساب واقع تحت "${chainRoot}" - تم اعتماد موقعه في الشجرة`);
  }

  // 3) النوع المصرّح به بالملف - يُتجاهل إذا كان اسم جذر أو خارج جذر الصف
  let type = declaredRoot ? "" : canonicalizeLevel3Type(rawType);
  if (type && rowRoot && !sameRoot(rootOfType(type), rowRoot)) {
    notes.push(`نوع الحساب "${type}" يتبع "${LEVEL2_TO_LEVEL1[TYPE_TO_LEVEL2[type]]}" بينما الحساب تحت "${rowRoot}" - تم تجاهله`);
    type = "";
  }
  // 4) الفئة "المقفلة": تأتي من الحساب الأب (م2) في الشجرة الفعلية ولا يجوز تغييرها
  //    قاعدة قيود: فئة حساب م3 يحددها موقعه تحت الأب، وليس اسمه أو النوع المستنتج
  let crossCategoryHint = null;
  const pickCategory = (cat) => (cat && (!rowRoot || sameRoot(rootOfCategory(cat), rowRoot)) ? cat : "");
  const lockedCategory =
    pickCategory(canonicalizeLevel2Category(ancestorCategory)) ||
    pickCategory(parentCategory) ||
    "";

  let category = lockedCategory || pickCategory(canonicalizeLevel2Category(row.level2Category)) || "";

  // تجاوز صامت: لو الاسم يدل على نوع موضعه ثابت بقيود، يُعتمد موضع قيود مباشرة
  // مثال: "مجمعات الإهلاك" وضعها العميل تحت الالتزامات غير المتداولة، وقيود يضعها تحت المتداولة
  const fixedType = inferLevel3TypeFromText(nameText, "", QOYOD_FIXED_PLACEMENT_TYPES);
  const fixedCategory = fixedType ? TYPE_TO_LEVEL2[fixedType] : "";
  if (fixedType && fixedCategory && (!rowRoot || sameRoot(rootOfCategory(fixedCategory), rowRoot))) {
    return { level2Category: fixedCategory, type: fixedType, notes };
  }

  // النوع المصرّح به لازم يكون ضمن أنواع الفئة المقفلة، وإلا يُرفض
  if (type && lockedCategory && !(LEVEL3_MAP[lockedCategory] || []).includes(type)) {
    notes.push(`النوع "${type}" لا يتبع فئة "${lockedCategory}" التي يقع تحتها الحساب - تم تجاهله`);
    type = "";
  }

  // 5) المستويات 3-7 تُعامل بنفس الطريقة: النوع يُستنتج من اسم الحساب داخل الفئة المقفلة،
  //    ونوع الأب يُستخدم كملاذ أخير فقط إذا فشل الاسم (وبشرط أن يكون ضمن نفس الفئة)
  if (!type) {
    const candidates = category ? (LEVEL3_MAP[category] || null) : level3TypesForRoot(rowRoot);
    type = (candidates ? inferLevel3TypeFromText(nameText, "", candidates) : "") || "";

    // لو فشل الاستنتاج داخل الفئة، نحفظ إشارة أوسع من الجذر - تُستخدم للتنبيه لاحقًا
    // فقط إذا انتهى بنا الأمر لنوع افتراضي، حتى لا يمتلئ التقرير بتنبيهات بلا فائدة
    if (!type && category && rowRoot) {
      const rootCandidates = level3TypesForRoot(rowRoot);
      const wider = rootCandidates ? inferLevel3TypeFromText(nameText, "", rootCandidates) : "";
      const widerCat = wider ? TYPE_TO_LEVEL2[wider] : "";
      if (wider && widerCat && widerCat !== category) crossCategoryHint = { wider, widerCat };
    }
  }

  // 5b) ملاذ أخير للمستويات 4+: نوع الأب، بشرط أن يكون ضمن نفس الفئة
  if (!type && level >= 4 && parentType && (!category || (LEVEL3_MAP[category] || []).includes(parentType))) {
    type = parentType;
  }

  // 6) فئة احتياطية إذا لم يوجد أب معروف: من النوع، ثم من الاسم، ثم افتراضي الجذر
  if (!category) {
    category = pickCategory(type ? TYPE_TO_LEVEL2[type] : "")
      || pickCategory(canonicalizeLevel2Category(nameText))
      || (rowRoot ? DEFAULT_LEVEL2_BY_ROOT[rowRoot] || "" : "");
  }

  // 7) ملاذ أخير: نوع افتراضي حسب الفئة حتى لا تبقى الخانة فارغة، مع تنبيه للمراجعة
  if (!type && category) {
    type = DEFAULT_TYPE_BY_LEVEL2[category] || (LEVEL3_MAP[category] || [])[0] || "";
    if (type && crossCategoryHint) {
      notes.push(`اسم الحساب يوحي بالنوع "${crossCategoryHint.wider}" التابع لفئة "${crossCategoryHint.widerCat}"، لكن الحساب واقع تحت "${category}" - تم اختيار "${type}"، راجع موقعه في الشجرة`);
    } else if (type) {
      notes.push(`تعذّر تحديد نوع الحساب من الاسم - تم اختيار "${type}" افتراضيًا حسب الفئة، يرجى المراجعة`);
    }
  }

  // 8) حارس نهائي: النوع لازم يكون ضمن أنواع الفئة، والفئة ضمن الجذر
  if (type && category && !(LEVEL3_MAP[category] || []).includes(type)) {
    const safeType = DEFAULT_TYPE_BY_LEVEL2[category] || (LEVEL3_MAP[category] || [])[0] || "";
    notes.push(`تعارض هيكلي: النوع "${type}" غير متاح تحت فئة "${category}" - تم استبداله بـ "${safeType}"، يرجى المراجعة`);
    type = safeType;
  }
  if (category && rowRoot && !sameRoot(rootOfCategory(category), rowRoot)) {
    const safeCat = DEFAULT_LEVEL2_BY_ROOT[rowRoot] || "";
    notes.push(`تعارض هيكلي: الفئة "${category}" خارج جذر "${rowRoot}" - تم استبدالها بـ "${safeCat}"، يرجى المراجعة`);
    category = safeCat;
    type = safeCat ? (DEFAULT_TYPE_BY_LEVEL2[safeCat] || (LEVEL3_MAP[safeCat] || [])[0] || "") : "";
  }

  return { level2Category: category, type, notes };
}

function deriveRootForRow(row) {
  if (!row || !row.type) return null;
  if (row.level === 1 || row.level === "1") {
    const m = LEVEL1_ROOT_TYPES.find((t) => typeNamesMatch(t, row.type));
    return m ? normalizeArabic(m) : null;
  }
  if (row.level === 2 || row.level === "2") {
    const root = LEVEL2_TO_LEVEL1[row.type];
    return root ? normalizeArabic(root) : null;
  }
  const cat = TYPE_TO_LEVEL2[row.type] || row.level2Category;
  const root = cat ? LEVEL2_TO_LEVEL1[cat] : null;
  return root ? normalizeArabic(root) : null;
}

function deriveRootForExternalCode(code, level1CodeMap, level2CodeMap) {
  for (const [rootNorm, c] of Object.entries(level1CodeMap || {})) { if (c === code) return rootNorm; }
  for (const [cat, c] of Object.entries(level2CodeMap || {})) {
    if (c === code) { const root = LEVEL2_TO_LEVEL1[cat]; return root ? normalizeArabic(root) : null; }
  }
  return null;
}

function labelForExternalCode(code, level1CodeMap, level2CodeMap) {
  for (const [cat, c] of Object.entries(level2CodeMap || {})) { if (c === code) return cat; }
  for (const [rootNorm, c] of Object.entries(level1CodeMap || {})) {
    if (c === code) { const match = LEVEL1_ROOT_TYPES.find((t) => normalizeArabic(t) === rootNorm); return match || rootNorm; }
  }
  return `حساب رقم ${code} (من الشجرة الحالية)`;
}

function getAnchorParentCode(code, level1CodeMap, level2CodeMap) {
  if (Object.values(level1CodeMap || {}).includes(code)) return null;
  const l2entry = Object.entries(level2CodeMap || {}).find(([, c]) => c === code);
  if (l2entry) {
    const rootName = LEVEL2_TO_LEVEL1[l2entry[0]];
    const rootCode = rootName ? level1CodeMap[normalizeArabic(rootName)] : null;
    return rootCode && rootCode !== code ? rootCode : null;
  }
  return null;
}

export const OUTPUT_COLUMNS = [
  "الرمز", "الاسم الانجليزي", "الاسم العربي", "المستوى",
  "الحساب الرئيسي (الرمز)", "نوع الحساب", "الوصف", "يمكن الدفع والتحصيل بهذا الحساب",
];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  let prev = new Array(n + 1), curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[n];
}

function similarityNormalized(na, nb) {
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (Math.abs(na.length - nb.length) > 6) return 0;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length) || 1;
  return 1 - dist / maxLen;
}
function similarity(a, b) { return similarityNormalized(normalizeArabic(a), normalizeArabic(b)); }

function matchesSearch(values, query) {
  if (!query) return true;
  const nq = normalizeArabic(query);
  return values.some((v) => v !== null && v !== undefined && normalizeArabic(String(v)).includes(nq));
}

const COLUMN_CANDIDATES = {
  code: ["الرمز", "رمز الحساب", "كود", "code", "account code", "رقم الحساب"],
  // "acc_arab"/"acc_lati"/"acc_levl" — رموز أعمدة شائعة بملفات بعض أنظمة
  // المحاسبة القديمة (acc_arab = الاسم بالعربي، acc_lati = الاسم بالحروف
  // اللاتينية، acc_levl = المستوى) — إضافة مرادفات فقط، بلا حذف أو تعديل لأي
  // مرادف موجود مسبقاً.
  nameAr: ["الاسم العربي", "اسم الحساب بالعربي", "الاسم", "اسم الحساب", "acc_arab"],
  nameEn: ["الاسم الانجليزي", "الاسم الإنجليزي", "english name", "name (en)", "name", "acc_lati"],
  level: ["المستوى", "مستوى", "level", "acc_levl"],
  parent: ["رقم الحساب الرئيسي", "رقم الحساب الاب", "رقم الحساب الأب", "كود الحساب الرئيسي", "رمز الحساب الرئيسي", "parent code", "parent account code", "الحساب الرئيسي", "رئيسي", "parent", "الحساب الاب", "الحساب الأب"],
  type: ["نوع الحساب", "النوع", "type", "account type"],
  desc: ["الوصف", "وصف", "description", "ملاحظات"],
  debit: ["مدين", "debit"],
  credit: ["دائن", "credit"],
  payCollect: ["يمكن الدفع", "دفع وتحصيل", "payment"],
};

export function autoDetectMapping(headerRow) {
  const norm = headerRow.map((h) => normalizeArabic(h));
  const mapping = {}; const claimed = new Set();
  const fields = Object.keys(COLUMN_CANDIDATES);
  fields.forEach((field) => {
    mapping[field] = -1;
    for (const k of COLUMN_CANDIDATES[field]) {
      const nk = normalizeArabic(k);
      const idx = norm.findIndex((h, i) => h === nk && !claimed.has(i));
      if (idx !== -1) { mapping[field] = idx; claimed.add(idx); break; }
    }
  });
  fields.filter((field) => mapping[field] === -1).forEach((field) => {
    const sortedKeys = [...COLUMN_CANDIDATES[field]].sort((a, b) => b.length - a.length);
    for (const k of sortedKeys) {
      const nk = normalizeArabic(k);
      let bestIdx = -1, bestLen = -1;
      norm.forEach((h, i) => { if (claimed.has(i) || !h) return; if ((h.includes(nk) || nk.includes(h)) && nk.length > bestLen) { bestIdx = i; bestLen = nk.length; } });
      if (bestIdx !== -1) { mapping[field] = bestIdx; claimed.add(bestIdx); break; }
    }
  });
  return mapping;
}

export function findHeaderRowIndex(rows) {
  let bestIdx = 0, bestScore = -1;
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const mapping = autoDetectMapping(rows[i].map((c) => (c === undefined ? "" : c)));
    const score = Object.values(mapping).filter((v) => v !== -1).length;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return bestIdx;
}

async function readWorkbookFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "csv") { const text = await file.text(); return XLSX.read(text, { type: "string" }); }
  const buf = await file.arrayBuffer();
  // dense:true: تمثيل أسرع بمكتبة SheetJS لملفات إكسل كبيرة (تسريع مقيس ~2x بملف حقيقي 157
  // ألف صف بأداة القيود). آمن هنا: sheetToRows أدناه يستخدم sheet_to_json فقط (متوافقة مع
  // الوضعين تلقائياً)، ولا يوجد بهذا الملف أي مسح يدوي لمفاتيح خلايا الورقة على مسار القراءة.
  return XLSX.read(buf, { type: "array", dense: true });
}

export function sheetToRows(workbook) {
  const sheetName = workbook.SheetNames.includes("Accounts Upload Template") ? "Accounts Upload Template" : workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

export function buildRecords(rows, mapping) {
  const headerIdx = findHeaderRowIndexFromMapping(rows, mapping);
  const headerRow = rows[headerIdx] || [];
  const usedIdx = new Set(Object.values(mapping).filter((v) => v !== -1));
  const records = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (field) => { const idx = mapping[field]; if (idx === undefined || idx === -1) return ""; return row[idx] !== undefined ? String(row[idx]).trim() : ""; };
    const extra = {};
    row.forEach((val, idx) => {
      if (usedIdx.has(idx)) return;
      const h = headerRow[idx] !== undefined ? String(headerRow[idx]).trim() : "";
      const v = val !== undefined ? String(val).trim() : "";
      if (h && v) extra[h] = v;
    });
    const rec = { code: get("code"), nameAr: get("nameAr"), nameEn: get("nameEn"), level: get("level"), parent: extractParentCode(get("parent")), type: get("type"), desc: get("desc"), debit: get("debit"), credit: get("credit"), payCollect: get("payCollect"), extra, _rowIndex: i };
    if (rec.nameAr || rec.nameEn || rec.code) records.push(rec);
  }
  return records;
}

function findHeaderRowIndexFromMapping(rows, mapping) {
  const usedCols = Object.values(mapping).filter((v) => v !== -1);
  if (usedCols.length === 0) return 0;
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const matches = usedCols.filter((c) => {
      const cell = normalizeArabic(rows[i][c]);
      return Object.values(COLUMN_CANDIDATES).flat().some((cand) => cell.includes(normalizeArabic(cand)));
    });
    if (matches.length >= Math.max(1, Math.floor(usedCols.length * 0.4))) return i;
  }
  return 0;
}

function buildTree(records) {
  const byCode = {};
  records.forEach((r) => { if (r.code) byCode[String(r.code).trim()] = r; });
  return byCode;
}

// =====================================================================================
// المحرك الرئيسي لمقارنة واشتقاق الشجرة
// =====================================================================================

export function compareTrees(file1Records, file2Records, useFile2Codes) {
  const tree1 = buildTree(file1Records);
  const codes1 = new Set(Object.keys(tree1));

  const BUCKET_PREFIX_LEN = 4, LENGTH_BUCKET_WIDTH = 8;
  const exactNameMap = new Map(), nameBuckets = new Map();
  const bucketKeyOf = (normStr) => normStr.slice(0, BUCKET_PREFIX_LEN) + "|" + Math.floor(normStr.length / LENGTH_BUCKET_WIDTH);
  file1Records.forEach((r) => {
    const key = r.nameAr || r.nameEn;
    if (!key) return;
    const normKey = normalizeArabic(key);
    const entry = { normKey, record: r };
    if (!exactNameMap.has(normKey)) exactNameMap.set(normKey, r);
    const bucket = bucketKeyOf(normKey);
    if (!nameBuckets.has(bucket)) nameBuckets.set(bucket, []);
    nameBuckets.get(bucket).push(entry);
  });

  const siblingsByParent = new Map();
  file1Records.forEach((r) => {
    if (!r.parent || !r.code) return;
    const p = String(r.parent).trim();
    if (!siblingsByParent.has(p)) siblingsByParent.set(p, []);
    siblingsByParent.get(p).push(r.code);
  });

  const runningMaxByParent = new Map();
  function nextSiblingCode(parentCode) {
    let maxCodeStr = runningMaxByParent.get(parentCode);
    if (maxCodeStr === undefined) {
      const initial = siblingsByParent.get(parentCode);
      if (initial && initial.length > 0) {
        maxCodeStr = initial.reduce((a, b) => (a > b ? a : b));
      } else {
        // لا يوجد أي ابن سابق لهذا الأب إطلاقًا (لا بالشجرة الحالية ولا بين
        // حسابات جديدة سابقة) - نبني أول رمز منطقي له حسب قاعدة الأرقام بدل
        // إرجاع فراغ، وإلا خرج الحساب الجديد بلا رمز نهائي إطلاقًا.
        const firstCandidate = firstChildCodeForParent(parentCode, getLevel(parentCode));
        if (!firstCandidate) return "";
        let numeric = parseInt(firstCandidate, 10);
        const width = firstCandidate.length;
        let candidate = firstCandidate;
        let guard = 0;
        while ((codes1.has(candidate) || newCodesUsed.has(candidate)) && guard < 100000) {
          numeric += 1; candidate = String(numeric).padStart(width, "0"); guard++;
        }
        runningMaxByParent.set(parentCode, candidate);
        return candidate;
      }
    }
    const numeric = parseInt(maxCodeStr, 10);
    if (isNaN(numeric)) return "";
    const width = maxCodeStr.length;
    const next = String(numeric + 1).padStart(width, "0");
    runningMaxByParent.set(parentCode, next);
    return next;
  }

  const file2ByCode = new Map();
  file2Records.forEach((r) => { if (r.code) file2ByCode.set(String(r.code).trim(), r); });

  // ===== جديد: مجموعة الرموز التي لها فروع داخل ملف 2 (حسابات آباء) =====
  const parentCodesInFile2 = new Set();
  file2Records.forEach((r) => {
    const p = r.parent ? String(r.parent).trim() : "";
    if (p) parentCodesInFile2.add(p);
    // اعتبار العلاقة بالاقتطاع أيضًا (ملفات بدون عمود أب)
    const trunc = findParentByCodeTruncation(r.code, file2ByCode);
    if (trunc && trunc.code) parentCodesInFile2.add(String(trunc.code).trim());
  });

  function findRecordByCode(code) { return tree1[code] || file2ByCode.get(code) || null; }

  const levelCache = new Map();
  function getLevel(code, guard = new Set()) {
    if (!code || guard.has(code)) return null;
    if (levelCache.has(code)) return levelCache.get(code);
    guard.add(code);
    const rec = findRecordByCode(code);
    if (!rec) return null;
    // الأولوية لسلسلة الآباء وليس للمستوى المكتوب بالملف (لأنه أحيانًا يكون خاطئًا)
    const parentRaw = rec.parent ? String(rec.parent).trim() : "";
    if (parentRaw && parentRaw !== code) {
      const parentLevel = getLevel(parentRaw, guard);
      if (parentLevel !== null) { const lvl = parentLevel + 1; levelCache.set(code, lvl); return lvl; }
    }
    if (rec.level !== undefined && rec.level !== "") { const lvl = parseInt(rec.level, 10); if (!isNaN(lvl)) { levelCache.set(code, lvl); return lvl; } }
    const lvl = String(code).length === 1 ? 1 : 2;
    levelCache.set(code, lvl); return lvl;
  }

  const catCache = new Map();
  function getLevel2Cat(code, guard = new Set()) {
    if (!code || guard.has(code)) return null;
    if (catCache.has(code)) return catCache.get(code);
    guard.add(code);
    // حساب جديد سبقت معالجته (متاح بفضل الترتيب الهرمي أعلاه) يحمل فئة محسوبة
    // فعليًا بالفعل - أولى بالثقة من نصه الخام في ملف 2 غير المصنَّف بعد.
    // ملاحظة حاسمة: حساب مستوى 2 يحمل فئته في حقل type نفسه لا level2Category
    // (نفس القاعدة في كل موضع آخر بالملف) - يجب قراءته منه أولًا وإلا فاتت الفئة صمتًا
    const processed = processedRowsMap.get(code);
    if (processed) {
      const t = Number(processed.level) === 2
        ? canonicalizeLevel2Category(processed.type)
        : (canonicalizeLevel2Category(processed.level2Category)
          || (processed.type ? TYPE_TO_LEVEL2[canonicalizeLevel3Type(processed.type)] : ""));
      if (t) { catCache.set(code, t); return t; }
    }
    const rec = findRecordByCode(code);
    if (!rec) return null;
    const lvl = getLevel(code);
    if (lvl === 2) {
      const t = canonicalizeLevel2Category(rec.type) || canonicalizeLevel2Category(rec.nameAr || rec.nameEn);
      if (t) { catCache.set(code, t); return t; }
      return null;
    }
    // مستوى 3 فأعلى: لو نوع الحساب معروف نستخرج الفئة منه مباشرة
    const ownType = canonicalizeLevel3Type(rec.type);
    if (ownType && TYPE_TO_LEVEL2[ownType]) { catCache.set(code, TYPE_TO_LEVEL2[ownType]); return TYPE_TO_LEVEL2[ownType]; }
    const parentRaw = rec.parent ? String(rec.parent).trim() : "";
    if (parentRaw) { const cat = getLevel2Cat(parentRaw, guard); if (cat) catCache.set(code, cat); return cat; }
    return null;
  }

  const level1CodeMap = {};
  Object.values(tree1).forEach((rec) => {
    if (!rec.code) return;
    const lvl = getLevel(rec.code);
    if (lvl !== 1) return;
    const t = matchLevel1RootByKeyword(rec.type) || matchLevel1RootByKeyword(rec.nameAr) || matchLevel1RootByKeyword(rec.nameEn);
    if (t && !level1CodeMap[normalizeArabic(t)]) level1CodeMap[normalizeArabic(t)] = rec.code;
  });

  const level2CodeMap = {};
  Object.values(tree1).forEach((rec) => {
    if (!rec.code) return;
    const lvl = getLevel(rec.code);
    if (lvl !== 2) return;
    const t = canonicalizeLevel2Category(rec.type) || canonicalizeLevel2Category(rec.nameAr || rec.nameEn);
    if (t && !level2CodeMap[t]) level2CodeMap[t] = rec.code;
  });

  const results = [];
  const newCodesUsed = new Set();
  const processedRowsMap = new Map();
  // [إصلاح تكرار الآباء] رمز أصلي (من ملف 2) -> الرمز النهائي الحقيقي الذي
  // حصل عليه فعليًا (يختلف عن الأصلي فقط حين "استخدام أرقام ملف 2" غير مفعّل).
  // بدونه، حساب أب له بيانات كاملة بملف 2 لكنه غير موجود بالشجرة الحالية كان
  // يظهر مرتين: مرة كـ"حساب جديد" برمز عشوائي متولّد، ومرة ثانية كـ"أب مُنشأ
  // تلقائيًا" برمزه الأصلي - لأن حقل .parent لأبنائه بقي يشير لرمزه القديم.
  const codeRemap = new Map();

  /*
   * [إصلاح جذري] الرمز الهرمي أولاً: تُعالَج صفوف ملف 2 بترتيب هرمي (الآباء قبل
   * أبنائها) لا بترتيب ورودها في الملف. بدون هذا، حساب فرعي وارد قبل أبيه في
   * الملف كان يقرأ processedRowsMap فارغة لأبيه فيسقط على بيانات الأب الخام غير
   * المصنَّفة بعد (لا فئتها المحسوبة الصحيحة)، فيخرج بفئة/نوع من عائلة مختلفة
   * تمامًا عن عائلة الأب الفعلية - وهذا هو سبب ظهور حساب مثل "1103" (الأصول
   * المتداولة) وابنه "110301" مصنَّفًا افتراضيًا ضمن "تكاليف تشغيلية" رغم عدم
   * انتمائه لهذه العائلة إطلاقًا. طول الرمز (فالمستوى الصريح) أوثق مرجع هرمي
   * متاح لترتيب المعالجة؛ ترتيب الصفوف في النتيجة النهائية لا يتغيّر - يُعاد فقط
   * لترتيبه الأصلي بعد اكتمال التصنيف (انظر أسفل الحلقة).
   */
  const hierarchyRank = (r2) => {
    const code = r2.code ? String(r2.code).trim() : "";
    if (code) return code.length;
    const lvl = parseInt(r2.level, 10);
    return Number.isFinite(lvl) ? lvl : 99;
  };
  const processingOrder = file2Records
    .map((r2, idx) => idx)
    .sort((a, b) => (hierarchyRank(file2Records[a]) - hierarchyRank(file2Records[b])) || (a - b));

  processingOrder.forEach((idx) => {
    const r2 = file2Records[idx];
    const nameKey = r2.nameAr || r2.nameEn;
    const normNameKey = normalizeArabic(nameKey);
    let matched = null, matchType = null;

    const r2Code = r2.code ? String(r2.code).trim() : "";
    // ===== جديد: هل هذا الحساب أب لحسابات ثانية داخل ملف 2؟ =====
    const isParentInFile2 = r2Code && parentCodesInFile2.has(r2Code);

    if (r2Code && codes1.has(r2Code)) {
      const candidate = tree1[r2Code];
      const candidateName = candidate.nameAr || candidate.nameEn;
      const nameScore = nameKey && candidateName ? similarity(candidateName, nameKey) : 1;
      if (nameScore >= 0.35 || !nameKey || !candidateName) { matched = candidate; matchType = "code"; }
    }

    // المطابقة بالاسم مسموحة فقط للحسابات التي ليس لها فروع داخل ملف 2،
    // لأن إسقاط حساب أب بالاسم يكسر الهيكل ويولّد "أب مفقود" عند الرفع.
    if (!matched && normNameKey && !isParentInFile2) {
      const exact = exactNameMap.get(normNameKey);
      if (exact) { matched = exact; matchType = "exact-name"; }
    }

    let bestScore = 0, bestCandidate = null;
    if (!matched && normNameKey && !isParentInFile2) {
      const prefix = normNameKey.slice(0, BUCKET_PREFIX_LEN);
      const lenBucket = Math.floor(normNameKey.length / LENGTH_BUCKET_WIDTH);
      let scanned = 0;
      outer: for (const lb of [lenBucket, lenBucket - 1, lenBucket + 1]) {
        const candidates = nameBuckets.get(prefix + "|" + lb);
        if (!candidates) continue;
        for (let i = 0; i < candidates.length; i++) {
          if (scanned >= 150) break outer;
          scanned++;
          const s = similarityNormalized(normNameKey, candidates[i].normKey);
          if (s > bestScore) { bestScore = s; bestCandidate = candidates[i].record; }
        }
      }
      if (bestScore >= 0.85) { matched = bestCandidate; matchType = "fuzzy"; }
    }

    if (matched) {
      results.push({ id: `m-${idx}`, status: "existing", matchType, matchScore: matchType === "fuzzy" ? bestScore : 1, source: r2, matchedWith: matched, errors: [], warnings: [], _origIdx: idx });
      return;
    }

    // حساب جديد
    const errors = [], warnings = [];
    let parentCode = "";
    const truncationParent = findParentByCodeTruncation(r2.code, file2ByCode);

    if (truncationParent) {
      parentCode = truncationParent.code;
    } else if (r2.parent) {
      parentCode = String(r2.parent).trim();
    }

    let level = null;
    const hierarchyLevel = parentCode ? getLevel(parentCode) : null;
    if (hierarchyLevel !== null) {
      level = hierarchyLevel + 1;
    } else if (r2.level) {
      const explicitLevel = parseInt(r2.level, 10);
      if (!isNaN(explicitLevel)) level = explicitLevel;
    } else if (!parentCode && r2.code) {
      level = String(r2.code).trim().length === 1 ? 1 : 2;
    }

    const parentRowRaw = parentCode ? (processedRowsMap.get(parentCode) || findRecordByCode(parentCode)) : null;
    /*
     * [إصلاح] resolveAccountTypeAndCategory يقرأ parentRow.level حرفيًا ليقرر
     * إن كان الأب مستوى 2 (حيث الفئة تُخزَّن في حقل type نفسه لا level2Category) -
     * لكن حساب الشجرة الحالية (ملف 1) عادةً لا يحمل عمود "المستوى" أصلاً، فيصل
     * .level فارغًا رغم أن الحساب مستوى 2 فعليًا حسب سلسلة آبائه. hierarchyLevel
     * أعلاه محسوب بأسلوب موثوق (getLevel: سلسلة الآباء ثم طول الرمز)، فيُفرَض هنا
     * بدل الاعتماد على حقل قد يكون غائبًا - وإلا فشلت قراءة فئة الأب لحسابات
     * الشجرة الحالية تحديدًا، وتسرّبت أبناؤها لعائلة عشوائية (مثال: أب "51" مستوى
     * 2 صحيح "تكاليف تشغيلية"، لكن قراءته بلا هذا الإصلاح تفشل فيخرج الابن بفئة
     * إيرادات لا علاقة لها بعائلة الأب إطلاقًا).
     */
    const parentRow = parentRowRaw && hierarchyLevel !== null
      ? { ...parentRowRaw, level: hierarchyLevel }
      : parentRowRaw;

    // الفئة المستنتجة من سلسلة الآباء (مثال: 1101 -> أبوه 11 -> الأصول المتداولة)
    const ancestorCategory = parentCode ? getLevel2Cat(parentCode) : null;

    // استدعاء منطق توريث واستنتاج نوع الحساب المحسن والمربوط تلقائياً
    const { level2Category, type, notes: typeNotes } = resolveAccountTypeAndCategory(
      { ...r2, level, parent: parentCode },
      parentRow,
      level2CodeMap,
      ancestorCategory
    );
    (typeNotes || []).forEach((n) => warnings.push(n));

    let proposedCode = "";
    if (useFile2Codes) {
      proposedCode = r2.code || "";
      if (!proposedCode) errors.push("لا يوجد رمز مقترح من ملف 2 - يرجى إدخاله يدويًا");
      else if (codes1.has(proposedCode) || newCodesUsed.has(proposedCode)) errors.push(`الرمز "${proposedCode}" مستخدم مسبقًا - يحتاج تعديل يدوي`);
    } else {
      if (parentCode) proposedCode = nextSiblingCode(parentCode);
      if (!proposedCode) warnings.push("تعذّر توليد رقم تلقائي - يرجى إدخال الرمز يدويًا");
    }

    if (proposedCode && newCodesUsed.has(proposedCode)) errors.push(`الرمز "${proposedCode}" مكرر بين أكثر من حساب جديد`);
    if (proposedCode) newCodesUsed.add(proposedCode);

    if (!type) warnings.push("تعذّر تحديد نوع الحساب تلقائيًا - اختره يدويًا");
    else if (Number(level) >= 3 && !level2Category) warnings.push("تعذّر تحديد الفئة تلقائيًا - اخترها يدويًا");
    if (!r2.nameAr) warnings.push("الاسم العربي فارغ");
    if (!level) warnings.push("المستوى غير محدد");
    if (!parentCode && level > 1) warnings.push("الحساب الرئيسي (الرمز) غير محدد");
    if (isParentInFile2 && bestScore >= 0.85) warnings.push("يشبه حسابًا موجودًا بالشجرة لكنه أب لحسابات فرعية - تم إبقاؤه كحساب مستقل");

    // رمز الأب الحقيقي النهائي (بعد أي إعادة ترقيم لأبيه) - يُستخدم فقط في
    // القيمة المكتوبة أخيرًا لحقل .parent؛ كل التصنيف أعلاه ظل يعتمد على
    // parentCode الأصلي كما هو (بدون أي تغيير في منطقه).
    const finalParentCode = parentCode && codeRemap.has(parentCode) ? codeRemap.get(parentCode) : parentCode;

    const newRowObj = {
      id: `n-${idx}`, status: "new", source: r2, code: proposedCode,
      nameAr: r2.nameAr || "", nameEn: r2.nameEn || r2.nameAr || "",
      level: level || "", parent: finalParentCode, level2Category: level2Category || "",
      type: type || "", desc: r2.desc || "", payCollect: r2.payCollect || "No",
      deleted: false, autoParent: false, errors, warnings, _origIdx: idx
    };

    if (proposedCode) processedRowsMap.set(proposedCode, newRowObj);
    const originalOwnCode = r2.code ? String(r2.code).trim() : "";
    if (originalOwnCode && proposedCode && proposedCode !== originalOwnCode) {
      codeRemap.set(originalOwnCode, proposedCode);
    }
    results.push(newRowObj);
  });

  // إعادة النتائج إلى ترتيب ورودها الأصلي في الملف - المعالجة وحدها كانت هرمية
  results.sort((a, b) => a._origIdx - b._origIdx);
  results.forEach((r) => { delete r._origIdx; });

  const tree1Index = Object.values(tree1).filter((rec) => rec.code).map((rec) => ({
    code: rec.code, nameAr: rec.nameAr || "", nameEn: rec.nameEn || "",
    parent: rec.parent ? String(rec.parent).trim() : "",
    level: getLevel(rec.code), type: rec.type || "", level2Category: getLevel2Cat(rec.code) || null
  }));

  const { rows: inheritedResults } = enforceCategoryInheritance(results, tree1Index);

  return {
    results: inheritedResults, level2CodeMap, level1CodeMap, tree1Index,
    siblingCodesByParent: Object.fromEntries(siblingsByParent),
    existingCodes: Array.from(codes1),
    file2ByCode,
  };
}

// =====================================================================================
// جديد: إنشاء الحسابات الأب المفقودة + ترتيب الرفع + تصحيح المستويات
// =====================================================================================

/**
 * فهرسا code→row لتسريع levelOfCode/nameOfCode أدناه (اختياريان — بدونهما تعملان
 * بالمسح الكامل الأصلي كما كانت دائمًا، لأي مستدعٍ آخر لا يمرّرهما).
 * anyMap: أول صف غير محذوف بهذا الرمز (بصرف النظر عن status) — بمعيار nameOfCode.
 * activeMap: أول صف status==="new" وغير محذوف بهذا الرمز — بمعيار levelOfCode.
 * "أول" بالضبط بترتيب المصفوفة الأصلي، كـ.find() تمامًا.
 */
function buildCodeLookupMaps(rowsList) {
  const anyMap = new Map();
  const activeMap = new Map();
  rowsList.forEach((r) => {
    if (r.deleted) return;
    const c = String(r.code || "").trim();
    if (!c) return;
    if (!anyMap.has(c)) anyMap.set(c, r);
    if (r.status === "new" && !activeMap.has(c)) activeMap.set(c, r);
  });
  return { anyMap, activeMap };
}

function levelOfCode(code, rowsList, tree1Index, maps) {
  if (!code) return NaN;
  const fromNew = maps ? maps.activeMap.get(code) : rowsList.find((r) => r.status === "new" && !r.deleted && String(r.code).trim() === code);
  if (fromNew) { const l = Number(fromNew.level); if (Number.isFinite(l) && l > 0) return l; }
  const fromOld = (tree1Index || []).find((r) => String(r.code).trim() === code);
  if (fromOld) { const l = Number(fromOld.level); if (Number.isFinite(l) && l > 0) return l; }
  return NaN;
}

/** اسم حساب موجود (جديد أو من الشجرة الحالية) عبر رمزه - يُستخدم لتسمية أب مُنشأ تلقائيًا بدون بيانات */
function nameOfCode(code, rowsList, tree1Index, maps) {
  if (!code) return { ar: "", en: "" };
  const fromNew = maps ? maps.anyMap.get(code) : rowsList.find((r) => !r.deleted && String(r.code || "").trim() === code);
  if (fromNew) return { ar: fromNew.nameAr || fromNew.nameEn || "", en: fromNew.nameEn || fromNew.nameAr || "" };
  const fromOld = (tree1Index || []).find((r) => String(r.code).trim() === code);
  if (fromOld) return { ar: fromOld.nameAr || fromOld.nameEn || "", en: fromOld.nameEn || fromOld.nameAr || "" };
  return { ar: "", en: "" };
}

/**
 * يمر على كل الحسابات الجديدة، ويكتشف أي "حساب رئيسي" مذكور ولا وجود له
 * لا في الشجرة الحالية (ملف 1) ولا ضمن الحسابات الجديدة، ثم ينشئه تلقائيًا.
 * يعمل بشكل تكراري حتى يكتمل السلسلة كاملة حتى تصل لحساب موجود فعليًا.
 */
export function ensureParentsExist(rows, ctx) {
  const existing = new Set(ctx.existingCodes || []);
  const file2ByCode = ctx.file2ByCode || new Map();
  const tree1Index = ctx.tree1Index || [];
  let out = rows.slice();
  const created = [];
  // فهرسا code→row يُحدَّثان تزامنياً مع كل out.push/splice أدناه (نقطة الإدراج الوحيدة
  // بهذه الدالة) — بدل نameOfCode/levelOfCode لمسح out كاملة من جديد لكل حساب أب مفقود
  // يُنشأ، بطء يتضاعف مع كبر الشجرة وعدد الحسابات الأب المفقودة. التحديث التزامني (لا
  // إعادة بناء لكل تكرار) يحافظ حرفياً على نفس سلوك .find() الأصلي: يرى أي حساب أب أُنشئ
  // ضمن نفس الدورة (pass) قبل الوصول لحفيده، لأن out نفسها كانت تُمسح لحظيًا كذلك.
  const lookupMaps = buildCodeLookupMaps(out);

  for (let pass = 0; pass < 25; pass++) {
    const active = out.filter((r) => r.status === "new" && !r.deleted);
    const codes = new Set(existing);
    active.forEach((r) => { const c = String(r.code || "").trim(); if (c) codes.add(c); });

    const missing = [];
    const seen = new Set();
    active.forEach((r) => {
      const p = String(r.parent || "").trim();
      if (!p || codes.has(p) || seen.has(p)) return;
      seen.add(p);
      missing.push({ parentCode: p, child: r });
    });
    if (missing.length === 0) break;

    // الأهم: إنشاء الجدّ قبل الحفيد داخل نفس الدورة (الرمز الأقصر أولاً)
    missing.sort((a, b) => a.parentCode.length - b.parentCode.length || (a.parentCode < b.parentCode ? -1 : 1));

    missing.forEach(({ parentCode, child }) => {
      const src = file2ByCode.get(parentCode);
      const warnings = [], errors = [];
      let nameAr, nameEn, type, desc, ownParent;

      if (src) {
        nameAr = src.nameAr || src.nameEn || `حساب ${parentCode}`;
        nameEn = src.nameEn || src.nameAr || nameAr;
        type = src.type || child.type || "";
        desc = src.desc || "";
        ownParent = extractParentCode(src.parent) || "";
        warnings.push("أُنشئ تلقائيًا لأن الحساب الأب كان مفقودًا (بياناته مأخوذة من ملف 2)");
      } else {
        type = child.type || "";
        desc = "";
        ownParent = "";
      }

      // نحتفظ بالأب الأصلي من ملف 2 حتى لو لم يُنشأ بعد، لأنه سيُنشأ ضمن نفس العملية
      const ownParentWillExist = ownParent && (codes.has(ownParent) || file2ByCode.has(ownParent));
      if (!ownParentWillExist) {
        const guessed = guessAncestorCode(parentCode, codes);
        ownParent = guessed || "";
      }

      if (!src) {
        // بدون بيانات من ملف 2: نسمي الحساب المُنشأ باسم أبيه (الجد) + نقطة، حسب الطلب
        const grandParentName = nameOfCode(ownParent, out, tree1Index, lookupMaps);
        if (grandParentName.ar) {
          nameAr = `${grandParentName.ar}.`;
          nameEn = `${grandParentName.en || grandParentName.ar}.`;
        } else {
          nameAr = `حساب رئيسي ${parentCode}`;
          nameEn = `Parent Account ${parentCode}`;
        }
        warnings.push("أُنشئ تلقائيًا بدون بيانات من ملف 2 - راجع اسمه ونوعه يدويًا");
      }

      // المستوى = مستوى الأب + 1 (أدق من المستوى المكتوب بالملف)
      let level = NaN;
      if (ownParent) {
        const pl = levelOfCode(ownParent, out, tree1Index, lookupMaps);
        if (Number.isFinite(pl)) level = pl + 1;
      }
      if (!Number.isFinite(level)) {
        const cl = Number(child.level);
        if (Number.isFinite(cl) && cl >= 2) level = cl - 1;
      }
      if (!Number.isFinite(level) && src && src.level) {
        const sl = Number(src.level);
        if (Number.isFinite(sl)) level = sl;
      }

      // توحيد نوع الحساب حسب مستوى الأب المُنشأ (لكل مستوى قائمة أنواع مختلفة)
      let level2Category = "";
      if (Number.isFinite(level) && level <= 2) {
        const canonical = level === 1
          ? (level1RootFromText(type) || level1RootFromText(nameAr) || level1RootFromText(nameEn))
          : (canonicalizeLevel2Category(type) || canonicalizeLevel2Category(nameAr) || canonicalizeLevel2Category(nameEn)
            || canonicalizeLevel2Category(child.level2Category)
            || TYPE_TO_LEVEL2[canonicalizeLevel3Type(child.type)] || "");
        if (type && !canonical) warnings.push(`نوع الحساب "${type}" غير معتمد لهذا المستوى - تم استنتاج البديل`);
        type = canonical || "";
      } else {
        const canonical = canonicalizeLevel3Type(type)
          || canonicalizeLevel3Type(child.type)
          || inferLevel3TypeFromText(nameAr || nameEn, canonicalizeLevel2Category(child.level2Category))
          || "";
        if (type && !canonicalizeLevel3Type(type)) warnings.push(`نوع الحساب "${type}" غير موجود في أنواع قيود - تم استنتاج البديل`);
        type = canonical || "";
        level2Category = TYPE_TO_LEVEL2[type] || canonicalizeLevel2Category(child.level2Category) || "";
        if (!type && level2Category) {
          type = DEFAULT_TYPE_BY_LEVEL2[level2Category] || "";
          if (type) warnings.push(`تعذّر تحديد نوع الحساب - تم اختيار "${type}" افتراضيًا، يرجى المراجعة`);
        }
      }

      if (!ownParent) errors.push("الحساب الرئيسي غير محدد - حدده يدويًا");
      if (!Number.isFinite(level)) warnings.push("المستوى غير محدد");
      if (!type) warnings.push("نوع الحساب غير محدد");

      const newRow = {
        id: `auto-${parentCode}`,
        status: "new",
        autoParent: true,
        source: src || {},
        matchType: null,
        code: parentCode,
        nameAr, nameEn,
        level: Number.isFinite(level) ? level : "",
        parent: ownParent,
        level2Category,
        type,
        desc,
        payCollect: "No",
        deleted: false,
        errors, warnings,
      };

      // إدراج الأب قبل أول ابن له مباشرة ليظهر بترتيب منطقي
      const idx = out.findIndex((r) => r.id === child.id);
      if (idx === -1) out.push(newRow); else out.splice(idx, 0, newRow);
      codes.add(parentCode);
      created.push(parentCode);
      // تحديث الفهرسين تزامنياً مع الإدراج أعلاه (newRow غير محذوف وstatus="new" دائمًا هنا)
      if (!lookupMaps.anyMap.has(parentCode)) lookupMaps.anyMap.set(parentCode, newRow);
      if (!lookupMaps.activeMap.has(parentCode)) lookupMaps.activeMap.set(parentCode, newRow);
    });
  }

  return { rows: out, created };
}

/** ترتيب طوبولوجي: الأب دائمًا قبل أبنائه في ملف الرفع */
export function orderRowsForUpload(rows) {
  const byCode = new Map();
  rows.forEach((r) => { const c = String(r.code || "").trim(); if (c && !byCode.has(c)) byCode.set(c, r); });
  const visited = new Set();
  const out = [];
  const visit = (row, guard) => {
    const c = String(row.code || "").trim();
    const key = c || row.id;
    if (visited.has(key) || guard.has(key)) return;
    guard.add(key);
    const p = String(row.parent || "").trim();
    if (p && byCode.has(p) && p !== c) visit(byCode.get(p), guard);
    if (visited.has(key)) return;
    visited.add(key);
    out.push(row);
  };
  rows.forEach((r) => visit(r, new Set()));
  return out;
}

/**
 * قاعدة قيود (بعد التحديث): المستويات 4-7 تُعامل معاملة المستوى 3.
 * النوع لا يجب أن يطابق الأب، لكن يجب أن يكون من نفس **الفئة** (م2).
 * هذه التمريرة تفرض وراثة الفئة فقط، وتعيد اختيار النوع من اسم الحساب
 * إذا كان النوع الحالي خارج أنواع تلك الفئة.
 */
/**
 * توافق النوع مع الأب (أولوية قصوى) — كل حساب فرعي مستوى 3-7 يجب أن يبقى ضمن
 * عائلة أبيه المباشر (نفس الفئة م2)، مطابقة عائلة لا مطابقة صارمة: يكفي أن يكون
 * نوعه ضمن أنواع فئة الأب (LEVEL3_MAP[category])، بصرف النظر عن اسم النوع الدقيق.
 *
 * خرج الابن عن عائلة أبيه = "خطأ يحتاج تعديل" (errors، لا warnings) مع اقتراح
 * نوع صحيح من عائلة الأب في نص الرسالة — لا يُصحَّح تلقائيًا وبصمت، بل يُترك
 * للمستخدم ليعدّله من القائمة المنسدلة، فالتصحيح الصامت كان يُخفي المشكلة تمامًا
 * (كانت النتيجة "سليم" رغم الخطأ الفعلي).
 *
 * تصنيف صحيح فعلاً (النوع فعلاً ضمن عائلة الأب) يبقى "سليم" بلا أي خطأ أو تنبيه؛
 * لا يُلمَس سوى حقل "الفئة" التجميلي إن اختلف شكليًا عن فئة الأب رغم توافق النوع.
 */
export function enforceCategoryInheritance(rows, tree1Index) {
  const oldByCode = new Map();
  (tree1Index || []).forEach((r) => {
    const c = String(r.code || "").trim();
    if (!c) return;
    // نفس ملاحظة infoOfCode أدناه: حساب مستوى 2 في الشجرة الحالية يحمل الفئة في
    // حقل النوع نفسه، لا في level2Category - يُقرأ منه أولًا وإلا فاتت الفئة صمتًا
    const cat = Number(r.level) === 2
      ? (canonicalizeLevel2Category(r.type) || canonicalizeLevel2Category(r.nameAr) || canonicalizeLevel2Category(r.nameEn))
      : (canonicalizeLevel2Category(r.level2Category) || TYPE_TO_LEVEL2[canonicalizeLevel3Type(r.type)]);
    oldByCode.set(c, cat || "");
  });

  const out = rows.slice();
  const idxByCode = new Map();
  out.forEach((r, i) => {
    if (r.status !== "new" || r.deleted) return;
    const c = String(r.code || "").trim();
    if (c && !idxByCode.has(c)) idxByCode.set(c, i);
  });

  // إصلاح جوهري: في المستوى 2 فحقل "النوع" نفسه هو الفئة (لا يوجد level2Category
  // منفصل لصف مستوى 2 أصلًا - انظر resolveAccountTypeAndCategory). كانت هذه الدالة
  // تقرأ level2Category فقط، فترجع فئة فارغة لأي أبٍ مستوى-2 لم يُطابَق بعد في
  // ملف 1 (لا يزال "new")، فيتخطّى الفحص كل أبنائه بصمت — وهذا بالضبط ما سمح لحساب
  // مثل 540102 تحت الأب 54 ("تكاليف تشغيلية") بالبقاء مصنّفًا "التكلفة المباشرة"
  // ويظهر "سليم" رغم خروجه التام عن عائلة أبيه.
  const infoOfCode = (code) => {
    const i = idxByCode.get(code);
    if (i !== undefined) {
      const r = out[i];
      const category = Number(r.level) === 2 ? (r.type || "") : (r.level2Category || "");
      return { category, type: r.type || "" };
    }
    return { category: oldByCode.get(code) || "", type: "" };
  };

  let flagged = 0;
  for (let lvl = 3; lvl <= 7; lvl++) {
    out.forEach((r, i) => {
      if (r.status !== "new" || r.deleted) return;
      if (Number(r.level) !== lvl) return;
      const parentCode = String(r.parent || "").trim();
      if (!parentCode) return;

      const parent = infoOfCode(parentCode);
      const category = parent.category;
      if (!category) return; // فئة الأب نفسها غير معروفة بعد - لا شيء نقارن به

      // نوع غير محدد أصلًا: يبقى ضمن التنبيه القائم "تعذّر تحديد نوع الحساب" -
      // ليس هذا الفحص، حتى لا يُصنَّف "خطأ" ما هو أصلًا "تنويه" غير محتسب
      if (!r.type) return;

      const allowed = LEVEL3_MAP[category] || [];
      if (allowed.includes(r.type)) {
        // النوع فعلًا ضمن عائلة الأب: سليم تمامًا بلا أي خطأ أو تنبيه.
        // "الفئة" حقل مشتق ميكانيكيًا من الأب فقط - تصحيحه هنا تزيين لا يخفي شيئًا
        if (r.level2Category !== category) out[i] = { ...r, level2Category: category };
        return;
      }

      // خرج فعلًا عن عائلة الأب: خطأ يحتاج تعديل + اقتراح نوع صحيح من نفس العائلة
      const already = (r.errors || []).some((e) => e.startsWith("توافق النوع مع الأب:"));
      if (already) return;

      const nameText = [r.nameAr, r.nameEn].filter(Boolean).join(" ").trim();
      const suggested =
        inferLevel3TypeFromText(nameText, "", allowed) ||
        (allowed.includes(parent.type) ? parent.type : "") ||
        DEFAULT_TYPE_BY_LEVEL2[category] || allowed[0] || "";

      const msg = `توافق النوع مع الأب: النوع الحالي "${r.type}" لا يتبع عائلة الحساب الأب "${parentCode}" (${category})${suggested ? ` - النوع المقترح: "${suggested}"` : ""}`;
      out[i] = { ...r, errors: [...(r.errors || []), msg] };
      flagged++;
    });
  }
  return { rows: out, flagged };
}

/** إعادة احتساب المستوى لكل حساب جديد بناءً على مستوى أبيه الفعلي */
export function repairLevels(rows, ctx) {
  const tree1Index = ctx.tree1Index || [];
  let out = rows.slice();
  let changed = 0;
  for (let pass = 0; pass < 10; pass++) {
    let passChanged = 0;
    // فهرس مرة واحدة لكل دورة (pass) بدل levelOfCode.find() لكل صف بكل دورة — out هنا ثابتة
    // طوال تنفيذ .map() أدناه (لا تُعاد كتابة out إلا بعد اكتمال .map() كاملاً)، فبناء
    // الفهرس قبلها مباشرة يطابق تمامًا ما كان .find() يراه لكل صف بهذه الدورة بعينها.
    const lookupMaps = buildCodeLookupMaps(out);
    out = out.map((r) => {
      if (r.status !== "new" || r.deleted) return r;
      const p = String(r.parent || "").trim();
      if (!p) return r;
      const pl = levelOfCode(p, out, tree1Index, lookupMaps);
      if (!Number.isFinite(pl)) return r;
      const expected = pl + 1;
      if (Number(r.level) === expected) return r;
      passChanged++;
      return { ...r, level: expected };
    });
    changed += passChanged;
    if (passChanged === 0) break;
  }
  return { rows: out, changed };
}

// =====================================================================================
// المكوّن الرئيسي للتطبيق
// =====================================================================================

export function MergeTool() {
  const { t, dir, lang } = useLanguage();
  const { currentUser } = useAuth();
  const [file1, setFile1] = useState(null);
  const treeMetaRef = useRef({ level2CodeMap: {}, level1CodeMap: {}, tree1Index: [], siblingCodesByParent: {}, existingCodes: [], file2ByCode: new Map() });
  const [file2, setFile2] = useState(null);
  const [file1Rows, setFile1Rows] = useState(null);
  const [file2Rows, setFile2Rows] = useState(null);
  const [mapping1, setMapping1] = useState(null);
  const [mapping2, setMapping2] = useState(null);
  const [showMap1, setShowMap1] = useState(false);
  const [showMap2, setShowMap2] = useState(false);
  const [useFile2Codes, setUseFile2Codes] = useState(false);
  const [results, setResults] = useState(null);
  const resultsRef = useRef(null);
  useEffect(() => { resultsRef.current = results; }, [results]);
  // نافذة تأكيد الحذف داخل التطبيق - بديل window.prompt الذي يحجبه المتصفح
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [exportText, setExportText] = useState("");
  const [toast, setToast] = useState(null);
  const ROWS_PER_PAGE = 100;
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);
  const [activeFilter, setActiveFilter] = useState("all");

  const selectFilter = (f) => {
    setActiveFilter((prev) => (prev === f ? "all" : f));
    setVisibleCount(ROWS_PER_PAGE);
    setSearchInput("");
    setSearchQuery("");
  };

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => { const t = setTimeout(() => setSearchQuery(searchInput), 250); return () => clearTimeout(t); }, [searchInput]);
  const [showPreCompareConfirm, setShowPreCompareConfirm] = useState(false);
  const fileInput1Ref = useRef(null);
  const fileInput2Ref = useRef(null);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const handleFile = async (file, which) => {
    setError("");
    try {
      const wb = await readWorkbookFile(file);
      const rows = sheetToRows(wb);
      const headerIdx = findHeaderRowIndex(rows);
      const headerRow = rows[headerIdx].map((c) => (c === undefined ? "" : c));
      const mapping = autoDetectMapping(headerRow);
      if (which === 1) { setFile1(file); setFile1Rows(rows); setMapping1(mapping); }
      else { setFile2(file); setFile2Rows(rows); setMapping2(mapping); }
      setResults(null);
      if (currentUser) trackMergeImport(currentUser, { filename: file.name, file_number: which });
    } catch (e) {
      setError(`تعذّرت قراءة الملف: ${e.message || e}`);
      if (currentUser) trackMergeError(currentUser, { filename: file.name, error: e.message });
    }
  };

  const headerRow1 = file1Rows ? file1Rows[findHeaderRowIndex(file1Rows)] : null;
  const headerRow2 = file2Rows ? file2Rows[findHeaderRowIndex(file2Rows)] : null;

  const runCompare = () => {
    if (!file1Rows || !file2Rows || !mapping1 || !mapping2) return;
    setBusy(true); setError("");
    setTimeout(() => {
      try {
        const rec1 = buildRecords(file1Rows, mapping1);
        const rec2 = buildRecords(file2Rows, mapping2);
        if (rec1.length === 0) throw new Error("ما قدرت أستخرج أي حساب من ملف 1");
        if (rec2.length === 0) throw new Error("ما قدرت أستخرج أي حساب من ملف 2");
        const meta = compareTrees(rec1, rec2, useFile2Codes);
        treeMetaRef.current = meta;

        // تشغيل تلقائي: إنشاء الآباء المفقودة ثم مطابقة المستويات مع سلسلة الآباء
        const { rows: fixedRows, created } = ensureParentsExist(meta.results, meta);
        const { rows: leveledRows, changed } = repairLevels(fixedRows, meta);
        setResults(leveledRows);

        const notes = [];
        if (created.length > 0) notes.push(`تم إنشاء ${created.length} حساب أب مفقود تلقائيًا (${created.slice(0, 6).join("، ")}${created.length > 6 ? " ..." : ""})`);
        if (changed > 0) notes.push(`تم تصحيح مستوى ${changed} حساب ليطابق مستوى أبيه`);
        if (notes.length > 0) setToast({ type: "success", text: notes.join(" — ") });

        setVisibleCount(ROWS_PER_PAGE); setActiveFilter("all"); setExportText(""); setSearchInput(""); setSearchQuery("");
      } catch (e) { setError(e.message || String(e)); }
      finally { setBusy(false); }
    }, 30);
  };

  const newRows = useMemo(() => (results || []).filter((r) => r.status === "new"), [results]);
  const existingRows = useMemo(() => (results || []).filter((r) => r.status === "existing"), [results]);
  const activeNewRows = useMemo(() => newRows.filter((r) => !r.deleted), [newRows]);
  const deletedRows = useMemo(() => newRows.filter((r) => r.deleted), [newRows]);
  const autoParentRows = useMemo(() => activeNewRows.filter((r) => r.autoParent), [activeNewRows]);
  const errorCount = useMemo(() => activeNewRows.filter((r) => r.errors.length > 0).length, [activeNewRows]);
  const warningCount = useMemo(() => activeNewRows.filter((r) => r.warnings.length > 0 && r.errors.length === 0).length, [activeNewRows]);
  const cleanCount = activeNewRows.length - errorCount - warningCount;

  // ===== جديد: كشف الآباء المفقودة بشكل حي =====
  const activeNewCodes = useMemo(() => {
    const s = new Set();
    activeNewRows.forEach((r) => { const c = String(r.code || "").trim(); if (c) s.add(c); });
    return s;
  }, [activeNewRows]);

  const missingParentCodes = useMemo(() => {
    const existing = new Set(treeMetaRef.current.existingCodes || []);
    const s = new Set();
    activeNewRows.forEach((r) => {
      const p = String(r.parent || "").trim();
      if (!p) return;
      if (!existing.has(p) && !activeNewCodes.has(p)) s.add(p);
    });
    return s;
  }, [activeNewRows, activeNewCodes]);

  const fixMissingParents = () => {
    if (!results) return;
    const { rows, created } = ensureParentsExist(results, treeMetaRef.current);
    setResults(enforceCategoryInheritance(rows, treeMetaRef.current.tree1Index).rows);
    setToast(created.length > 0
      ? { type: "success", text: `تم إنشاء ${created.length} حساب أب: ${created.slice(0, 6).join("، ")}${created.length > 6 ? " ..." : ""}` }
      : { type: "success", text: "ما فيه آباء مفقودة - الشجرة مترابطة بالكامل" });
  };

  const runRepairLevels = () => {
    if (!results) return;
    const { rows, changed } = repairLevels(results, treeMetaRef.current);
    setResults(enforceCategoryInheritance(rows, treeMetaRef.current.tree1Index).rows);
    setToast({ type: changed > 0 ? "success" : "info", text: changed > 0 ? `تم تصحيح المستوى لـ ${changed} حساب حسب مستوى الأب` : "كل المستويات متطابقة مع الآباء" });
  };

  const searchActive = searchQuery.trim().length > 0;
  const searchedActiveNewRows = useMemo(() => {
    if (!searchActive) return [];
    return activeNewRows.filter((r) => matchesSearch([r.code, r.nameAr, r.nameEn, r.type, r.level2Category, r.parent, r.level, r.desc], searchQuery));
  }, [activeNewRows, searchQuery, searchActive]);
  const searchedExistingRows = useMemo(() => {
    if (!searchActive) return [];
    return existingRows.filter((r) => matchesSearch([r.source?.code, r.source?.nameAr, r.source?.nameEn, r.matchedWith?.code, r.matchedWith?.nameAr, r.matchedWith?.nameEn], searchQuery));
  }, [existingRows, searchQuery, searchActive]);
  const searchedDeletedRows = useMemo(() => {
    if (!searchActive) return [];
    return deletedRows.filter((r) => matchesSearch([r.code, r.nameAr, r.nameEn, r.type, r.level2Category, r.parent, r.level, r.desc], searchQuery));
  }, [deletedRows, searchQuery, searchActive]);

  const tableRows = useMemo(() => {
    switch (activeFilter) {
      case "error": return activeNewRows.filter((r) => r.errors.length > 0);
      case "warning": return activeNewRows.filter((r) => r.warnings.length > 0 && r.errors.length === 0);
      case "clean": return activeNewRows.filter((r) => r.errors.length === 0 && r.warnings.length === 0);
      case "autoParent": return autoParentRows;
      default: return activeNewRows;
    }
  }, [activeNewRows, autoParentRows, activeFilter]);

  // يجمع كل ذرية حساب (أبناء + أبناء الأبناء) من الصفوف الجديدة غير المستبعدة
  const collectDescendantIds = useCallback((rows, id, targetCode) => {
    const ids = new Set();
    if (!targetCode) return ids;
    const activeNew = rows.filter((r) => r.status === "new" && !r.deleted && r.id !== id);
    let frontier = new Set([String(targetCode).trim()]);
    while (frontier.size) {
      const next = new Set();
      for (const r of activeNew) {
        if (ids.has(r.id)) continue;
        if (frontier.has(String(r.parent || "").trim())) {
          ids.add(r.id);
          const c = String(r.code || "").trim();
          if (c) next.add(c);
        }
      }
      frontier = next;
    }
    return ids;
  }, []);

  // ينفّذ الحذف فعليًا - دالة نقية تمامًا، بدون أي حوار داخل الـ updater
  const applyDelete = useCallback((idSet) => {
    setResults((prev) => (prev ? prev.map((r) => (idSet.has(r.id) ? { ...r, deleted: true } : r)) : prev));
  }, []);

  /**
   * mode: "self" = الأب فقط | "cascade" = الأب وكل ذريته | undefined = اسأل إذا له أبناء
   */
  const setRowDeleted = useCallback((id, deletedValue, mode) => {
    const rows = resultsRef.current;
    if (!rows) return;

    // إلغاء الاستبعاد (استرجاع)
    if (!deletedValue) {
      setResults((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, deleted: false } : r)) : prev));
      return;
    }

    const target = rows.find((r) => r.id === id);
    if (!target) return;
    const targetCode = String(target.code || "").trim();
    const descendants = collectDescendantIds(rows, id, targetCode);

    if (mode === "self" || descendants.size === 0) {
      applyDelete(new Set([id]));
      setToast({ type: "success", text: `تم استبعاد "${target.nameAr || targetCode}" من ملف الرفع` });
      return;
    }

    if (mode === "cascade") {
      const all = new Set([id, ...descendants]);
      applyDelete(all);
      setToast({ type: "success", text: `تم استبعاد "${target.nameAr || targetCode}" مع ${descendants.size} حساب فرعي` });
      return;
    }

    // له ذرية ولم يُحدَّد الخيار → افتح نافذة التأكيد داخل التطبيق
    setPendingDelete({
      id,
      name: target.nameAr || target.nameEn || targetCode,
      code: targetCode,
      count: descendants.size,
    });
  }, [collectDescendantIds, applyDelete]);

  const addChildAccount = (parent) => {
    const newId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setResults((prev) => {
      const fromTree = treeMetaRef.current.siblingCodesByParent?.[parent.code] || [];
      const fromCurrent = prev.filter((r) => r.status === "new" && !r.deleted && String(r.parent).trim() === parent.code && r.code).map((r) => r.code);
      const all = [...fromTree, ...fromCurrent];
      let code;
      if (all.length === 0) code = `${parent.code}01`;
      else { const maxCode = all.reduce((a, b) => (a > b ? a : b)); const numeric = parseInt(maxCode, 10); code = isNaN(numeric) ? `${parent.code}01` : String(numeric + 1).padStart(maxCode.length, "0"); }
      const level = Number(parent.level) + 1;
      const level2Category = Number(parent.level) === 2
        ? (canonicalizeLevel2Category(parent.type) || canonicalizeLevel2Category(parent.name) || "")
        : (canonicalizeLevel2Category(parent.category) || TYPE_TO_LEVEL2[canonicalizeLevel3Type(parent.type)] || "");
      const type = Number(parent.level) >= 3
        ? (canonicalizeLevel3Type(parent.type) || "")
        : (level2Category ? (DEFAULT_TYPE_BY_LEVEL2[level2Category] || LEVEL3_MAP[level2Category]?.[0] || "") : "");

      return [...prev, { id: newId, status: "new", autoParent: false, code, nameAr: "حساب جديد", nameEn: "New Account", level, parent: parent.code, level2Category: level2Category || "", type, desc: "", payCollect: "No", deleted: false, source: {}, matchType: null, errors: [], warnings: [] }];
    });
    return newId;
  };

  const exportDeletedExcel = () => {
    const finalRows = deletedRows.map((r) => [r.code, r.nameEn, r.nameAr, r.level, r.parent, r.type, r.desc, r.payCollect || "No"]);
    const aoa = [OUTPUT_COLUMNS, ...finalRows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الحسابات المستبعدة");
    XLSX.writeFile(wb, "qoyod_excluded_accounts.xlsx");
  };

  const updateRow = (id, patch) => {
    setResults((prev) => {
      const nextPatch = { ...patch };
      if (nextPatch.type && TYPE_TO_LEVEL2[nextPatch.type]) {
        nextPatch.level2Category = TYPE_TO_LEVEL2[nextPatch.type];
      }

      const mapped = prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...nextPatch };
        const errors = [], warnings = [];
        if (!updated.code) errors.push("الرمز فارغ");
        if (!updated.level) warnings.push("المستوى غير محدد");
        if (!updated.type) warnings.push("نوع الحساب غير محدد");
        if (updated.autoParent) warnings.push("حساب أب أُنشئ تلقائيًا - تأكد من اسمه ونوعه");
        return { ...updated, errors, warnings };
      });

      // تغيير النوع/الأب/المستوى ينزل تلقائيًا على كل الذرية
      if (nextPatch.type || nextPatch.parent || nextPatch.level || nextPatch.level2Category) {
        return enforceCategoryInheritance(mapped, treeMetaRef.current.tree1Index).rows;
      }
      return mapped;
    });
  };

  const availableTypesFor = (level2Category) => { if (!level2Category) return ALL_LEVEL3_TYPES; return LEVEL3_MAP[level2Category] || ALL_LEVEL3_TYPES; };

  const exportQuickExcel = () => {
    if (missingParentCodes.size > 0) {
      setToast({ type: "error", text: `فيه ${missingParentCodes.size} حساب أب مفقود (${Array.from(missingParentCodes).slice(0, 4).join("، ")}) - اضغط "أنشئ الآباء المفقودة" قبل التنزيل` });
      return;
    }
    const ordered = orderRowsForUpload(activeNewRows);
    const finalRows = ordered.map((r) => [r.code, r.nameEn, r.nameAr, r.level, r.parent, r.type, r.desc, r.payCollect || "No"]);
    const aoa = [["", "", "", "", "يرجى تعبئة البيانات بدون تعديل قالب الملف", "", "", ""], OUTPUT_COLUMNS, ...finalRows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 14.4 }, { wch: 32.4 }, { wch: 27 }, { wch: 18 }, { wch: 30 }, { wch: 23.4 }, { wch: 14.4 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Accounts Upload Template");
    XLSX.writeFile(wb, "qoyod_new_accounts_ready.xlsx");
    if (currentUser) trackMergeExport(currentUser, { filename: "qoyod_new_accounts_ready.xlsx" });
  };

  const copyJsonForFinalExport = async () => {
    const ordered = orderRowsForUpload(activeNewRows);
    const finalRows = ordered.map((r) => ({ الرمز: r.code, "الاسم الانجليزي": r.nameEn, "الاسم العربي": r.nameAr, المستوى: r.level, "الحساب الرئيسي (الرمز)": r.parent, "نوع الحساب": r.type, الوصف: r.desc, "يمكن الدفع والتحصيل بهذا الحساب": r.payCollect || "No" }));
    const text = JSON.stringify(finalRows, null, 2);
    setExportText(text);
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 4000); } catch (e) { setCopied(false); }
  };

  const downloadExportFile = () => {
    const blob = new Blob([exportText], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "qoyod_final_export_data.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const ColumnMapEditor = ({ headerRow, mapping, setMapping, label }) => {
    if (!headerRow) return null;
    return (
      <div className="mt-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs">
        <div className="mb-2 font-semibold text-[#64748B]">{label}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.keys(COLUMN_CANDIDATES).map((field) => (
            <div key={field} className="flex items-center gap-1">
              <span className="w-20 shrink-0 text-[#64748B]">{fieldLabel(field, lang)}</span>
              <select className="w-full rounded border border-[#233152] bg-[#0E1830] text-[#E6EDF6] px-1 py-1 text-xs" value={mapping[field]} onChange={(e) => setMapping({ ...mapping, [field]: parseInt(e.target.value, 10) })}>
                <option value={-1}>—</option>
                {headerRow.map((h, i) => (<option key={i} value={i}>{String(h).slice(0, 20) || (lang === "en" ? `Column ${i + 1}` : `عمود ${i + 1}`)}</option>))}
              </select>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const resetAll = () => {
    setFile1(null); setFile2(null); setFile1Rows(null); setFile2Rows(null); setMapping1(null); setMapping2(null);
    setShowMap1(false); setShowMap2(false); setUseFile2Codes(false); setResults(null); setBusy(false); setError("");
    setCopied(false); setExportText(""); setActiveFilter("all"); setSearchInput(""); setSearchQuery(""); setShowPreCompareConfirm(false); setToast(null);
    treeMetaRef.current = { level2CodeMap: {}, level1CodeMap: {}, tree1Index: [], siblingCodesByParent: {}, existingCodes: [], file2ByCode: new Map() };
    if (fileInput1Ref.current) fileInput1Ref.current.value = "";
    if (fileInput2Ref.current) fileInput2Ref.current.value = "";
  };

  return (
    <div dir={dir} className="h-full w-full overflow-auto bg-[#F1F5F9] font-cairo text-[#0F172A]">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: "#162560" }}><FileSpreadsheet size={22} /></div>
            <div>
              <h1 className="text-xl font-bold text-[#0F172A]">{t({ ar: "تحليل الشجرة واستيرادها", en: "Analyze & Import Chart of Accounts" })}</h1>
              <p className="text-sm text-[#64748B]">{t({ ar: "استخراج الحسابات الجديدة الناقصة وتحديد الأنواع والفئات تلقائيًا", en: "Extract missing new accounts and auto-assign types & categories" })}</p>
            </div>
          </div>
           <button onClick={resetAll} title={t({ ar: "إعادة التعيين والبدء من الصفر", en: "Reset and start over" })} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-2 text-xs font-semibold text-[#64748B] shadow-sm transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"><RefreshCw size={14} /> {t({ ar: "إعادة تعيين", en: "Reset" })}</button>
        </div>

        {pendingDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 px-4" onClick={() => setPendingDelete(null)}>
            <div dir="rtl" className="w-full max-w-md rounded-2xl bg-[#FFFFFF] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 flex items-center gap-2 text-[#0F172A]">
                <AlertTriangle size={18} className="text-amber-500" />
                <h3 className="text-base font-bold">{t({ ar: "تأكيد الاستبعاد", en: "Confirm exclusion" })}</h3>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-[#64748B]">
                {t({ ar: "الحساب", en: "The account" })} <span className="font-bold text-[#0F172A]">"{pendingDelete.name}"</span>
                {pendingDelete.code ? <span className="font-mono text-[#64748B]"> ({pendingDelete.code})</span> : null}
                {" "}{t({ ar: "تحته", en: "has" })} <span className="font-bold text-[#0F172A]">{pendingDelete.count}</span> {t({ ar: "حساب فرعي جديد بملف الرفع.", en: "new child accounts in the upload file." })}
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { const p = pendingDelete; setPendingDelete(null); setRowDeleted(p.id, true, "self"); }}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-2.5 text-right text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC]">
                  {t({ ar: "استبعد الأب فقط", en: "Exclude parent only" })}
                  <span className="mt-0.5 block text-[11px] font-normal text-[#64748B]">{t({ ar: "موجود مسبقًا بقيود - الأبناء يبقون ويرتبطون به تلقائيًا", en: "Already exists in Qoyod — children stay and link to it automatically" })}</span>
                </button>
                <button
                  onClick={() => { const p = pendingDelete; setPendingDelete(null); setRowDeleted(p.id, true, "cascade"); }}
                  className="w-full rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-right text-sm font-semibold text-red-300 hover:bg-red-500/25">
                  {t({ ar: "استبعد الأب وكل أبنائه", en: "Exclude parent and all its children" })} ({pendingDelete.count})
                  <span className="mt-0.5 block text-[11px] font-normal text-red-400">{t({ ar: "يخرجون كلهم من ملف الرفع", en: "All removed from the upload file" })}</span>
                </button>
                <button
                  onClick={() => setPendingDelete(null)}
                  className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-[#64748B] hover:bg-[#F8FAFC]">
                  {t({ ar: "إلغاء", en: "Cancel" })}
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className={`fixed bottom-5 left-1/2 z-50 flex w-[min(92vw,560px)] -translate-x-1/2 items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-xs font-semibold shadow-lg ${toast.type === "error" ? "border-red-500/30 bg-red-500/10 text-red-300" : toast.type === "info" ? "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
            <span>{lang === "en" ? localizeMergeError(toast.text) : toast.text}</span>
            <button onClick={() => setToast(null)} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} /></button>
          </div>
        )}

        {results && (
          <div className="relative mb-6">
            <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            {/* [إصلاح أقوى] SafeInput يطبّق type="search" + readOnly حتى أول focus (المانع
                الفعلي لتعبية Chrome بإيميل محفوظ) + كل attributes المنع أدناه، بنفس النمط
                المعمَّم الآن على كل حقول الإدخال بالتطبيق. */}
            <SafeInput
              name="qoyod-tree-search-no-autofill"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t({ ar: "ابحث برمز الحساب أو اسمه (عربي/انجليزي) أو نوعه...", en: "Search by account code, name (AR/EN) or type..." })}
              className="w-full rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] py-2.5 pl-9 pr-9 text-sm shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
            {searchInput && (<button onClick={() => { setSearchInput(""); setSearchQuery(""); }} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]" title={t({ ar: "مسح البحث", en: "Clear search" })}><X size={16} /></button>)}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <UploadCard title={t({ ar: "ملف 1 — الشجرة الحالية بقيود", en: "File 1 — Current Qoyod chart of accounts" })} hint={t({ ar: "التصدير الحالي لشجرة حسابات العميل من نظام قيود", en: "The client's current chart of accounts exported from Qoyod" })} file={file1} onPick={() => fileInput1Ref.current?.click()} inputRef={fileInput1Ref} onChange={(f) => handleFile(f, 1)}>
            {headerRow1 && mapping1 && (<><MappingSummary mapping={mapping1} headerRow={headerRow1} onToggle={() => setShowMap1((s) => !s)} />{showMap1 && <ColumnMapEditor headerRow={headerRow1} mapping={mapping1} setMapping={setMapping1} label={t({ ar: "تأكيد/تعديل الأعمدة - ملف 1", en: "Confirm/edit columns — File 1" })} />}</>)}
          </UploadCard>
          <UploadCard title={t({ ar: "ملف 2 — شجرة العميل الجديدة", en: "File 2 — Client's new chart of accounts" })} hint={t({ ar: "أسماء + أرقام، أو ميزان مراجعة، أو أسماء بدون ترقيم", en: "Names + numbers, a trial balance, or names without numbering" })} file={file2} onPick={() => fileInput2Ref.current?.click()} inputRef={fileInput2Ref} onChange={(f) => handleFile(f, 2)}>
            {headerRow2 && mapping2 && (<><MappingSummary mapping={mapping2} headerRow={headerRow2} onToggle={() => setShowMap2((s) => !s)} />{showMap2 && <ColumnMapEditor headerRow={headerRow2} mapping={mapping2} setMapping={setMapping2} label={t({ ar: "تأكيد/تعديل الأعمدة - ملف 2", en: "Confirm/edit columns — File 2" })} />}</>)}
          </UploadCard>
        </div>

        <div className="mt-5 flex flex-col items-stretch justify-between gap-4 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-4 shadow-sm sm:flex-row sm:items-center">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#0F172A]">
            <input type="checkbox" checked={useFile2Codes} onChange={(e) => setUseFile2Codes(e.target.checked)} className="h-4 w-4 rounded border-[#E2E8F0] accent-blue-700" />
            {t({ ar: "اعتماد أرقام الحسابات من ملف 2 (بدل ملف 1)", en: "Use account codes from File 2 (instead of File 1)" })}
          </label>
          <button onClick={() => setShowPreCompareConfirm(true)} disabled={!file1Rows || !file2Rows || busy} className="flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} {t({ ar: "قارن الشجرتين", en: "Compare the two trees" })}
          </button>
        </div>

        {showPreCompareConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div dir="rtl" className="w-full max-w-md rounded-2xl bg-[#FFFFFF] p-6 shadow-xl">
              <div className="mb-3 flex items-center gap-2 text-amber-400"><AlertTriangle size={22} /><h3 className="text-base font-bold text-[#0F172A]">{t({ ar: "تأكيد قبل بدء المقارنة", en: "Confirmation before starting comparison" })}</h3></div>
              <p className="text-sm leading-relaxed text-[#64748B]">{t({ ar: "يرجى التحقق من عدم حذف الحسابات الخمسة الرئيسية بالمستوى الأول (الأصول، الالتزامات، حقوق الملكية، الإيرادات، المصاريف)", en: "Please make sure the five main level-1 accounts (Assets, Liabilities, Equity, Revenue, Expenses)" })} <span className="font-semibold">{t({ ar: "من داخل النظام", en: "have not been deleted in the system" })}</span> {t({ ar: "قبل ما تبدأ المقارنة.", en: "before you start the comparison." })}</p>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setShowPreCompareConfirm(false)} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-semibold text-[#64748B] hover:bg-[#F8FAFC]">{t({ ar: "إلغاء", en: "Cancel" })}</button>
                <button onClick={() => { setShowPreCompareConfirm(false); runCompare(); }} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">{t({ ar: "استمر", en: "Continue" })}</button>
              </div>
            </div>
          </div>
        )}

        {error && (<div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><XCircle size={18} className="mt-0.5 shrink-0" /><span>{lang === "en" ? localizeMergeError(error) : error}</span></div>)}

        {results && (
          <div className="mt-8">
            {missingParentCodes.size > 0 && (
              <div className="mb-4 flex flex-col gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs leading-relaxed text-red-300">
                  <div className="mb-1 flex items-center gap-1.5 font-bold"><XCircle size={15} /> {t({ ar: `فيه ${missingParentCodes.size} حساب رئيسي مفقود من الشجرة`, en: `There are ${missingParentCodes.size} missing parent accounts in the tree` })}</div>
                  <div className="font-mono">{Array.from(missingParentCodes).slice(0, 10).join("، ")}{missingParentCodes.size > 10 ? " ..." : ""}</div>
                  <div className="mt-1">{t({ ar: "رفع الملف بهالحالة راح يُرفض من قيود لأن الحسابات الفرعية تشير لأب غير موجود.", en: "Uploading the file in this state will be rejected by Qoyod because child accounts point to a non-existent parent." })}</div>
                </div>
                <button onClick={fixMissingParents} className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"><Wand2 size={14} /> {t({ ar: "أنشئ الآباء المفقودة الآن", en: "Create missing parents now" })}</button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <SummaryCard label={t({ ar: "الكل", en: "All" })} value={existingRows.length + newRows.length} tone="teal" active={activeFilter === "all"} onClick={() => selectFilter("all")} />
              <SummaryCard label={t({ ar: "مطابق موجود مسبقًا", en: "Already matched" })} value={existingRows.length} tone="slate" active={activeFilter === "existing"} onClick={() => selectFilter("existing")} />
              <SummaryCard label={t({ ar: "حسابات جديدة سليمة", en: "New valid accounts" })} value={cleanCount} tone="green" active={activeFilter === "clean"} onClick={() => selectFilter("clean")} />
              <SummaryCard label={t({ ar: "تحتاج تنبيه", en: "Need attention" })} value={warningCount} tone="amber" active={activeFilter === "warning"} onClick={() => selectFilter("warning")} />
              <SummaryCard label={t({ ar: "أخطاء تحتاج تعديل", en: "Errors to fix" })} value={errorCount} tone="red" active={activeFilter === "error"} onClick={() => selectFilter("error")} />
              <SummaryCard label={t({ ar: "آباء أُنشئوا تلقائيًا", en: "Auto-created parents" })} value={autoParentRows.length} tone="violet" active={activeFilter === "autoParent"} onClick={() => selectFilter("autoParent")} />
              <SummaryCard label={t({ ar: "مستبعدة (محذوفة)", en: "Excluded (deleted)" })} value={deletedRows.length} tone="slate" active={activeFilter === "deleted"} onClick={() => selectFilter("deleted")} />
            </div>
            {activeFilter !== "all" && activeFilter !== "tree" && (<button onClick={() => selectFilter("all")} className="mt-2 text-xs font-semibold text-blue-700 hover:underline">{t({ ar: "✕ إلغاء الفلتر وعرض الكل", en: "✕ Clear filter and show all" })}</button>)}

            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => selectFilter("tree")} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${activeFilter === "tree" ? "border-blue-700 bg-blue-700 text-white" : "border-[#E2E8F0] bg-[#FFFFFF] text-[#0F172A] hover:border-blue-700 hover:text-blue-700"}`}><GitBranch size={16} /> {t({ ar: "مخطط شجرة الحسابات التفاعلي", en: "Interactive accounts tree diagram" })}</button>
              <button onClick={fixMissingParents} className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-4 py-2.5 text-sm font-semibold text-[#0F172A] transition hover:border-violet-500 hover:text-violet-300"><Wand2 size={16} /> {t({ ar: "فحص وإنشاء الآباء المفقودة", en: "Check and create missing parents" })}</button>
              <button onClick={runRepairLevels} className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-4 py-2.5 text-sm font-semibold text-[#0F172A] transition hover:border-blue-700 hover:text-blue-700"><Layers size={16} /> {t({ ar: "تصحيح المستويات حسب الأب", en: "Repair levels based on parent" })}</button>
            </div>

            {activeFilter === "tree" ? (
              /* [إصلاح] مخطط الشجرة أولوية مطلقة على البحث - كان أي بحث (حتى
                 لو تعبّى تلقائيًا بالخطأ) يقفل المخطط فورًا ويرجّع لنتائج
                 البحث بدون أي تفاعل حقيقي من المستخدم. */
              <AccountsTreeView rows={activeNewRows} treeMeta={treeMetaRef.current} updateRow={updateRow} setRowDeleted={setRowDeleted} addChildAccount={addChildAccount} availableTypesFor={availableTypesFor} />
            ) : searchActive ? (
              <SearchResultsView query={searchQuery} newRows={searchedActiveNewRows} existingRows={searchedExistingRows} deletedRows={searchedDeletedRows} updateRow={updateRow} setRowDeleted={setRowDeleted} availableTypesFor={availableTypesFor} missingParentCodes={missingParentCodes} />
            ) : activeFilter === "existing" ? (
              <ExistingMatchesTable rows={existingRows} />
            ) : activeFilter === "deleted" ? (
              <DeletedAccountsTable rows={deletedRows} onRestore={setRowDeleted} onExportDeleted={exportDeletedExcel} />
            ) : (
              <>
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-3">
                  <button onClick={exportQuickExcel} className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC]"><Download size={14} /> {t({ ar: "تنزيل نسخة أولية Excel", en: "Download draft Excel" })}</button>
                  <button onClick={copyJsonForFinalExport} className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC]"><Copy size={14} /> {copied ? t({ ar: "تم النسخ ✓", en: "Copied ✓" }) : t({ ar: "نسخ للتصدير النهائي", en: "Copy for final export" })}</button>
                </div>

                {exportText && (
                  <div className="mt-3 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#64748B]">{copied ? t({ ar: "✅ انتسخ تلقائيًا", en: "✅ Copied automatically" }) : t({ ar: "⚠️ انسخ يدويًا من الصندوق أو نزّله كملف", en: "⚠️ Copy manually from the box or download as a file" })}</span>
                      <div className="flex gap-2">
                        <button onClick={downloadExportFile} className="flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-2 py-1 text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC]"><Download size={12} /> {t({ ar: "تنزيل", en: "Download" })}</button>
                        <button onClick={() => setExportText("")} className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-xs font-semibold text-[#64748B] hover:bg-[#F8FAFC]">{t({ ar: "✕ إغلاق", en: "✕ Close" })}</button>
                      </div>
                    </div>
                    <textarea readOnly value={exportText} onFocus={(e) => e.target.select()} className="h-40 w-full resize-y rounded border border-[#E2E8F0] bg-[#F1F5F9] p-2 font-mono text-[10px] leading-tight text-[#0F172A]" />
                  </div>
                )}

                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300"><Info size={15} className="mt-0.5 shrink-0" /><span>{t({ ar: "تم اختيار جميع أنواع الحسابات وتحديث فئاتها التابعة تلقائيًا، وترتيب ملف الرفع بحيث يسبق كل حساب أب أبناءه.", en: "All account types have been assigned and their sub-categories updated automatically, and the upload file is ordered so each parent precedes its children." })}</span></div>

                <div className="mt-5 overflow-x-auto rounded-xl border border-[#E2E8F0] bg-[#FFFFFF]">
                  <table className="w-full text-right text-xs" style={{ minWidth: 960 }}>
                    <thead className="bg-[#F8FAFC] text-[#64748B]">
                      <tr>
                         <th className="px-3 py-2">{t({ ar: "الحالة", en: "Status" })}</th><th className="px-3 py-2">{t({ ar: "الرمز", en: "Code" })}</th><th className="px-3 py-2">{t({ ar: "الاسم العربي", en: "Arabic name" })}</th>
                         <th className="px-3 py-2">{t({ ar: "المستوى", en: "Level" })}</th><th className="px-3 py-2">{t({ ar: "الحساب الرئيسي", en: "Parent account" })}</th><th className="px-3 py-2">{t({ ar: "الفئة الرئيسية (م2)", en: "Main category (L2)" })}</th>
                         <th className="px-3 py-2">{t({ ar: "نوع الحساب", en: "Account type" })}</th><th className="px-3 py-2">{t({ ar: "ملاحظات", en: "Notes" })}</th><th className="px-3 py-2">{t({ ar: "حذف", en: "Delete" })}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.slice(0, visibleCount).map((r) => (<NewAccountRow key={r.id} row={r} updateRow={updateRow} setRowDeleted={setRowDeleted} availableTypesFor={availableTypesFor} parentMissing={!!r.parent && missingParentCodes.has(String(r.parent).trim())} />))}
                      {tableRows.length === 0 && (<tr><td colSpan={9} className="px-3 py-6 text-center text-[#94A3B8]">{newRows.length === 0 ? t({ ar: "ما فيه حسابات جديدة - كل حسابات ملف 2 مطابقة 🎉", en: "No new accounts — all of File 2 already matches 🎉" }) : t({ ar: "ما فيه حسابات ضمن هذا الفلتر", en: "No accounts in this filter" })}</td></tr>)}
                    </tbody>
                  </table>
                </div>

                {tableRows.length > visibleCount && (<button onClick={() => setVisibleCount((c) => c + ROWS_PER_PAGE)} className="mt-3 w-full rounded-lg border border-dashed border-[#E2E8F0] py-2 text-xs font-semibold text-[#64748B] hover:border-blue-700 hover:text-blue-700">{t({ ar: `تحميل ${Math.min(ROWS_PER_PAGE, tableRows.length - visibleCount)} حساب إضافي`, en: `Load ${Math.min(ROWS_PER_PAGE, tableRows.length - visibleCount)} more accounts` })}</button>)}

                {activeFilter === "all" && (<><div className="mb-2 mt-6 text-sm font-semibold text-[#64748B]">{t({ ar: `الحسابات المطابقة موجودة مسبقًا (${existingRows.length})`, en: `Already-matched accounts (${existingRows.length})` })}</div><ExistingMatchesTable rows={existingRows} compact /></>)}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================================
// مكوّنات فرعية صغيرة
// =====================================================================================

function fieldLabel(field, lang) {
  const ar = { code: "الرمز", nameAr: "اسم عربي", nameEn: "اسم انجليزي", level: "المستوى", parent: "الحساب الرئيسي", type: "النوع", desc: "الوصف", debit: "مدين", credit: "دائن", payCollect: "دفع/تحصيل" };
  const en = { code: "Code", nameAr: "Arabic name", nameEn: "English name", level: "Level", parent: "Parent", type: "Type", desc: "Description", debit: "Debit", credit: "Credit", payCollect: "Pay/Collect" };
  const labels = lang === "en" ? en : ar;
  return labels[field] || field;
}

function UploadCard({ title, hint, file, onPick, inputRef, onChange, children }) {
  const { t } = useLanguage();
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-4 shadow-sm">
      <div className="mb-1 text-sm font-semibold text-[#0F172A]">{title}</div>
      <div className="mb-3 text-xs text-[#94A3B8]">{hint}</div>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files[0] && onChange(e.target.files[0])} />
      <button onClick={onPick} className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#E2E8F0] py-4 text-sm text-[#64748B] transition hover:border-blue-700 hover:text-blue-700"><Upload size={16} />{file ? file.name : t({ ar: "اختر ملف Excel أو CSV", en: "Choose an Excel or CSV file" })}</button>
      {children}
    </div>
  );
}

function MappingSummary({ mapping, headerRow, onToggle }) {
  const { t } = useLanguage();
  const detected = Object.values(mapping).filter((v) => v !== -1).length;
  return (
    <button onClick={onToggle} className="mt-3 flex w-full items-center justify-between rounded-lg bg-[#F8FAFC] px-3 py-2 text-xs text-[#64748B] hover:bg-[#F8FAFC]">
      <span className="flex items-center gap-1"><Settings2 size={13} /> {t({ ar: `تم التعرّف على ${detected} من ${Object.keys(mapping).length} أعمدة تلقائيًا`, en: `Detected ${detected} of ${Object.keys(mapping).length} columns automatically` })}</span>
      <span className="text-blue-700">{t({ ar: "تأكيد/تعديل", en: "Confirm/edit" })}</span>
    </button>
  );
}

function SummaryCard({ label, value, tone, active, onClick }) {
  const tones = {
    slate: "bg-[#F8FAFC] text-[#0F172A] border-[#E2E8F0]",
    green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    red: "bg-red-500/10 text-red-300 border-red-500/30",
    teal: "bg-blue-500/10 text-blue-300 border-blue-500/30",
    violet: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  };
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border p-4 text-start transition ${tones[tone]} ${onClick ? "cursor-pointer hover:shadow-md" : ""} ${active ? "ring-2 ring-blue-700 ring-offset-1" : ""}`}>
      <div className="text-2xl font-bold">{value}</div><div className="mt-1 text-xs">{label}</div>
    </button>
  );
}

const NewAccountRow = React.memo(function NewAccountRow({ row: r, updateRow, setRowDeleted, availableTypesFor, parentMissing }) {
  const { t } = useLanguage();
  const isExistingCodeConflict = r.errors.some((e) => e.includes("مستخدم مسبقًا"));

  // القراءة المباشرة والديناميكية للفئة من نوع الحساب لضمان عدم ظهور "اختر الفئة"
  const computedCategory = (r.type && TYPE_TO_LEVEL2[r.type])
    ? TYPE_TO_LEVEL2[r.type]
    : (canonicalizeLevel2Category(r.level2Category) || r.level2Category || "");
  const isTopLevel = r.level === 1 || r.level === "1" || r.level === 2 || r.level === "2";
  // لو القيمة المخزّنة خارج القائمة المعتمدة نعرضها كخيار إضافي بدل ما تظهر الخانة فارغة
  const categoryOptions = computedCategory && !LEVEL2_TYPES.includes(computedCategory)
    ? [computedCategory, ...LEVEL2_TYPES]
    : LEVEL2_TYPES;
  const baseTypeOptions = r.level === 1 || r.level === "1"
    ? LEVEL1_TYPES_ALLOWING_NEW
    : r.level === 2 || r.level === "2"
      ? LEVEL2_TYPES
      : availableTypesFor(computedCategory);
  const typeOptions = r.type && !baseTypeOptions.includes(r.type) ? [r.type, ...baseTypeOptions] : baseTypeOptions;

  return (
    <tr className={`border-t border-[#E2E8F0] align-top hover:bg-[#F8FAFC]/60 ${r.autoParent ? "bg-violet-500/10" : ""}`}>
      <td className="px-3 py-2">
        <StatusBadge row={r} />
        {r.autoParent && (<div className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-500/25 px-2 py-0.5 text-[10px] font-semibold text-violet-300"><Wand2 size={10} /> {t({ ar: "أب تلقائي", en: "Auto parent" })}</div>)}
      </td>
      <td className="px-3 py-2"><EditableCell value={r.code} onChange={(v) => updateRow(r.id, { code: v })} mono /></td>
      {/* الاسم الانجليزي غير معروض عمدًا - يبقى محفوظًا في بيانات الصف ويُصدَّر كما هو،
          حُذف فقط من هذا العرض لإتاحة عرض التنبيهات وباقي الأعمدة بلا تمرير أفقي */}
      <td className="px-3 py-2" style={{ minWidth: 260 }}><EditableCell value={r.nameAr} onChange={(v) => updateRow(r.id, { nameAr: v })} wrap /></td>
      <td className="px-3 py-2">
        <select value={r.level} onChange={(e) => updateRow(r.id, { level: e.target.value })} className="w-16 rounded border border-[#233152] bg-[#0E1830] text-[#E6EDF6] px-1 py-1">
          <option value="">—</option>{[2,3,4,5,6,7].map((l) => (<option key={l} value={l}>{l}</option>))}
        </select>
      </td>
      <td className="px-3 py-2">
        <EditableCell value={r.parent} onChange={(v) => updateRow(r.id, { parent: v })} mono />
        {parentMissing && (<div className="mt-0.5 text-[10px] font-semibold text-red-400">⚠ {t({ ar: "هذا الأب غير موجود بالشجرة", en: "This parent does not exist in the tree" })}</div>)}
      </td>
      <td className="px-3 py-2">
        {isTopLevel ? (<span className="text-[#94A3B8]">— (لا ينطبق)</span>) : (
          <select value={computedCategory} onChange={(e) => updateRow(r.id, { level2Category: e.target.value, type: "" })} className={`w-40 rounded border bg-[#0E1830] text-[#E6EDF6] px-1 py-1 ${computedCategory ? "border-[#233152]" : "border-amber-400 text-amber-300"}`}>
            <option value="">{t({ ar: "اختر الفئة", en: "Select category" })}</option>{categoryOptions.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
        )}
      </td>
      <td className="px-3 py-2">
        <select value={r.type || ""} onChange={(e) => updateRow(r.id, { type: e.target.value })} className={`w-44 rounded border bg-[#0E1830] text-[#E6EDF6] px-1 py-1 ${r.type ? "border-[#233152]" : "border-amber-400 text-amber-300"}`}>
          <option value="">{t({ ar: "اختر النوع", en: "Select type" })}</option>
          {typeOptions.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
      </td>
      <td className="px-3 py-2" style={{ maxWidth: 220 }}><NotesCell row={r} /></td>
      <td className="px-3 py-2" style={{ maxWidth: 170 }}>
        {isExistingCodeConflict ? (
          <button onClick={() => setRowDeleted(r.id, true)} title={t({ ar: "هذا الرمز موجود أصلاً بشجرة قيود", en: "This code already exists in the Qoyod chart of accounts" })} className="flex w-full flex-col items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-center text-[11px] font-semibold leading-snug text-amber-300 hover:bg-amber-500/25">
            <span className="flex items-center gap-1"><AlertTriangle size={12} /> {t({ ar: "احذف من ملف الاستيراد", en: "Remove from import file" })}</span>
            <span className="font-normal text-amber-300">{t({ ar: "لأنه تم التعديل في شجرة الحسابات الموجودة", en: "Because it was modified in the existing chart of accounts" })}</span>
          </button>
        ) : (
          <button onClick={() => setRowDeleted(r.id, true)} title={t({ ar: "استبعاد هذا الحساب من الرفع", en: "Exclude this account from the upload" })} className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/25">{t({ ar: "حذف", en: "Delete" })}</button>
        )}
      </td>
    </tr>
  );
}, (prev, next) => prev.row === next.row && prev.parentMissing === next.parentMissing);

function StatusBadge({ row, compact, reviewed }) {
  const { t } = useLanguage();
  if (compact) {
    // "reviewed" (تم المراجعة من مخطط الشجرة فقط) يُظهر الحساب سليمًا بصريًا هنا
    // فقط - بدون أي تغيير على row.errors/row.warnings الحقيقية نفسها.
    if (reviewed) return <span title={t({ ar: "تمت مراجعته ✓", en: "Reviewed ✓" })} className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />;
    const color = row.errors.length > 0 ? "bg-red-500" : row.autoParent ? "bg-violet-500" : row.warnings.length > 0 ? "bg-amber-500" : "bg-emerald-500";
    const title = row.errors.length > 0 ? t({ ar: "خطأ", en: "Error" }) : row.autoParent ? t({ ar: "أب أُنشئ تلقائيًا", en: "Auto-created parent" }) : row.warnings.length > 0 ? t({ ar: "تنبيه", en: "Warning" }) : t({ ar: "سليم", en: "OK" });
    return <span title={title} className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
  }
  if (row.errors.length > 0) return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-xs font-medium text-red-300"><XCircle size={12} /> {t({ ar: "خطأ", en: "Error" })}</span>;
  if (row.warnings.length > 0) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300"><AlertTriangle size={12} /> {t({ ar: "تنبيه", en: "Warning" })}</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300"><CheckCircle2 size={12} /> {t({ ar: "سليم", en: "OK" })}</span>;
}

function NotesCell({ row }) {
  if (row.errors.length === 0 && row.warnings.length === 0) return <span className="text-[#94A3B8]">—</span>;
  return (
    <ul className="space-y-1">
      {row.errors.map((e, i) => (<li key={`e${i}`} className="text-red-400">• {e}</li>))}
      {row.warnings.map((w, i) => (<li key={`w${i}`} className="text-amber-400">• {w}</li>))}
    </ul>
  );
}

/**
 * `wrap`: يُستخدم لحقول قد تحمل نصًا طويلًا (اسم الحساب تحديدًا) - textarea
 * يلتف على أكثر من سطر بدل input أحادي السطر يُخفي أغلب النص خلف تمرير أفقي
 * غير ظاهر. title يعرض النص كاملاً كتلميح أيضًا حتى قبل النقر للتحرير.
 */
function EditableCell({ value, onChange, mono, wrap }) {
  const cls = `w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-[#E2E8F0] focus:border-blue-700 focus:bg-[#F1F5F9] focus:outline-none ${mono ? "font-mono" : ""}`;
  if (wrap) {
    return (
      <SafeTextarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        title={value || ""}
        rows={2}
        className={`${cls} resize-y leading-snug`}
        style={{ minWidth: 200, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      />
    );
  }
  // [إصلاح أقوى] SafeInput (نفس نمط type="search" + readOnly حتى أول focus + كل
  // attributes المنع) - autoComplete="off" وحده كان غير كافٍ لمنع تعبية بيانات محفوظة
  // غير متعلقة في حقل يحرر بيانات حساب حقيقية (رمز/اسم).
  return <SafeInput value={value || ""} onChange={(e) => onChange(e.target.value)} title={value || ""} className={cls} />;
}

function ExistingMatchesTable({ rows, compact }) {
  const { t } = useLanguage();
  const ROWS_PER_PAGE = 100;
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);
  const visibleRows = rows.slice(0, visibleCount);
  return (
    <div>
      <div className={`overflow-x-auto rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] ${compact ? "" : "mt-5"}`}>
        <table className="w-full text-start text-xs">
          <thead className="bg-[#F8FAFC] text-[#64748B]">
            <tr><th className="px-3 py-2">{t({ ar: "اسم ملف 2", en: "File 2 name" })}</th><th className="px-3 py-2">{t({ ar: "طابق مع (ملف 1)", en: "Matched with (File 1)" })}</th><th className="px-3 py-2">{t({ ar: "نوع المطابقة", en: "Match type" })}</th><th className="px-3 py-2">{t({ ar: "تنبيه", en: "Warning" })}</th></tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.id} className="border-t border-[#E2E8F0]">
                <td className="px-3 py-2">{r.source.nameAr || r.source.nameEn}</td>
                <td className="px-3 py-2">{r.matchedWith.nameAr || r.matchedWith.nameEn} ({r.matchedWith.code})</td>
                <td className="px-3 py-2">{r.matchType === "code" ? t({ ar: "بالرمز", en: "By code" }) : r.matchType === "exact-name" ? t({ ar: "بالاسم (تام)", en: "By name (exact)" }) : t({ ar: `بالاسم (تقريبي ${Math.round(r.matchScore * 100)}%)`, en: `By name (fuzzy ${Math.round(r.matchScore * 100)}%)` })}</td>
                <td className="px-3 py-2 text-amber-400">{r.warnings.join(" / ")}</td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td colSpan={4} className="px-3 py-6 text-center text-[#94A3B8]">{t({ ar: "ما فيه حسابات مطابقة مسبقًا", en: "No previously-matched accounts" })}</td></tr>)}
          </tbody>
        </table>
      </div>
      {rows.length > visibleCount && (<button onClick={() => setVisibleCount((c) => c + ROWS_PER_PAGE)} className="mt-3 w-full rounded-lg border border-dashed border-[#E2E8F0] py-2 text-xs font-semibold text-[#64748B] hover:border-blue-700 hover:text-blue-700">{t({ ar: `تحميل ${Math.min(ROWS_PER_PAGE, rows.length - visibleCount)} حساب إضافي`, en: `Load ${Math.min(ROWS_PER_PAGE, rows.length - visibleCount)} more accounts` })}</button>)}
    </div>
  );
}

function DeletedAccountsTable({ rows, onRestore, onExportDeleted, compact }) {
  const { t } = useLanguage();
  const ROWS_PER_PAGE = 100;
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);
  const visibleRows = rows.slice(0, visibleCount);
  return (
    <div className={compact ? "" : "mt-5"}>
      {!compact && rows.length > 0 && onExportDeleted && (<button onClick={onExportDeleted} className="mb-3 flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-2 text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC]"><Download size={14} /> {t({ ar: "تنزيل الحسابات المستبعدة Excel", en: "Download excluded accounts (Excel)" })}</button>)}
      <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-[#FFFFFF]">
        <table className="w-full text-start text-xs" style={{ minWidth: 700 }}>
          <thead className="bg-[#F8FAFC] text-[#64748B]">
            <tr><th className="px-3 py-2">{t({ ar: "الرمز", en: "Code" })}</th><th className="px-3 py-2">{t({ ar: "الاسم العربي", en: "Arabic name" })}</th><th className="px-3 py-2">{t({ ar: "المستوى", en: "Level" })}</th><th className="px-3 py-2">{t({ ar: "الحساب الرئيسي", en: "Parent account" })}</th><th className="px-3 py-2">{t({ ar: "نوع الحساب", en: "Account type" })}</th><th className="px-3 py-2">{t({ ar: "استرجاع", en: "Restore" })}</th></tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.id} className="border-t border-[#E2E8F0] text-[#94A3B8]">
                <td className="px-3 py-2 font-mono">{r.code}</td><td className="px-3 py-2">{r.nameAr}</td><td className="px-3 py-2">{r.level}</td>
                <td className="px-3 py-2 font-mono">{r.parent}</td><td className="px-3 py-2">{r.type}</td>
                <td className="px-3 py-2"><button onClick={() => onRestore(r.id, false)} className="flex items-center gap-1 rounded-lg border border-blue-700/30 bg-blue-700/5 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-700/10"><RefreshCw size={12} /> {t({ ar: "استرجاع", en: "Restore" })}</button></td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td colSpan={6} className="px-3 py-6 text-center text-[#94A3B8]">{t({ ar: "ما فيه حسابات مستبعدة", en: "No excluded accounts" })}</td></tr>)}
          </tbody>
        </table>
      </div>
      {rows.length > visibleCount && (<button onClick={() => setVisibleCount((c) => c + ROWS_PER_PAGE)} className="mt-3 w-full rounded-lg border border-dashed border-[#E2E8F0] py-2 text-xs font-semibold text-[#64748B] hover:border-blue-700 hover:text-blue-700">{t({ ar: `تحميل ${Math.min(ROWS_PER_PAGE, rows.length - visibleCount)} حساب إضافي`, en: `Load ${Math.min(ROWS_PER_PAGE, rows.length - visibleCount)} more accounts` })}</button>)}
    </div>
  );
}

function SearchResultsView({ query, newRows, existingRows, deletedRows, updateRow, setRowDeleted, availableTypesFor, missingParentCodes }) {
  const { t } = useLanguage();
  const total = newRows.length + existingRows.length + deletedRows.length;
  const ROWS_PER_PAGE = 100;
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);
  useEffect(() => { setVisibleCount(ROWS_PER_PAGE); }, [newRows]);
  return (
    <div className="mt-5">
      <div className="mb-3 text-sm text-[#64748B]">{t({ ar: `نتائج البحث عن "${query}" — ${total} نتيجة`, en: `Search results for "${query}" — ${total} result(s)` })}</div>
      {total === 0 && (<div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#FFFFFF] py-8 text-center text-sm text-[#94A3B8]">{t({ ar: "ما فيه أي حساب يطابق بحثك", en: "No account matches your search" })}</div>)}
      {newRows.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 text-sm font-semibold text-[#64748B]">{t({ ar: `حسابات جديدة (${newRows.length})`, en: `New accounts (${newRows.length})` })}</div>
          <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-[#FFFFFF]">
            <table className="w-full text-start text-xs" style={{ minWidth: 960 }}>
              <thead className="bg-[#F8FAFC] text-[#64748B]"><tr><th className="px-3 py-2">{t({ ar: "الحالة", en: "Status" })}</th><th className="px-3 py-2">{t({ ar: "الرمز", en: "Code" })}</th><th className="px-3 py-2">{t({ ar: "الاسم العربي", en: "Arabic name" })}</th><th className="px-3 py-2">{t({ ar: "المستوى", en: "Level" })}</th><th className="px-3 py-2">{t({ ar: "الحساب الرئيسي", en: "Parent account" })}</th><th className="px-3 py-2">{t({ ar: "الفئة", en: "Category" })}</th><th className="px-3 py-2">{t({ ar: "نوع الحساب", en: "Account type" })}</th><th className="px-3 py-2">{t({ ar: "ملاحظات", en: "Notes" })}</th><th className="px-3 py-2">{t({ ar: "حذف", en: "Delete" })}</th></tr></thead>
              <tbody>{newRows.slice(0, visibleCount).map((r) => (<NewAccountRow key={r.id} row={r} updateRow={updateRow} setRowDeleted={setRowDeleted} availableTypesFor={availableTypesFor} parentMissing={!!r.parent && !!missingParentCodes && missingParentCodes.has(String(r.parent).trim())} />))}</tbody>
            </table>
          </div>
          {newRows.length > visibleCount && (<button onClick={() => setVisibleCount((c) => c + ROWS_PER_PAGE)} className="mt-3 w-full rounded-lg border border-dashed border-[#E2E8F0] py-2 text-xs font-semibold text-[#64748B] hover:border-blue-700 hover:text-blue-700">{t({ ar: `تحميل ${Math.min(ROWS_PER_PAGE, newRows.length - visibleCount)} حساب إضافي`, en: `Load ${Math.min(ROWS_PER_PAGE, newRows.length - visibleCount)} more accounts` })}</button>)}
        </div>
      )}
      {existingRows.length > 0 && (<div className="mb-6"><div className="mb-2 text-sm font-semibold text-[#64748B]">{t({ ar: `حسابات مطابقة (${existingRows.length})`, en: `Matched accounts (${existingRows.length})` })}</div><ExistingMatchesTable rows={existingRows} compact /></div>)}
      {deletedRows.length > 0 && (<div className="mb-6"><div className="mb-2 text-sm font-semibold text-[#64748B]">{t({ ar: `حسابات مستبعدة (${deletedRows.length})`, en: `Excluded accounts (${deletedRows.length})` })}</div><DeletedAccountsTable rows={deletedRows} onRestore={setRowDeleted} compact /></div>)}
    </div>
  );
}

function getNodeLevelAndCategory(node, level1CodeMap, level2CodeMap) {
  if (!node.isAnchor) {
    const lvl = Number(node.row.level);
    const cat = lvl === 2
      ? (canonicalizeLevel2Category(node.row.type) || node.row.type)
      : (TYPE_TO_LEVEL2[node.row.type] || canonicalizeLevel2Category(node.row.level2Category) || node.row.level2Category || null);
    return { level: isNaN(lvl) ? null : lvl, category: cat };
  }
  if (Object.values(level1CodeMap || {}).includes(node.code)) return { level: 1, category: null };
  const l2entry = Object.entries(level2CodeMap || {}).find(([, c]) => c === node.code);
  if (l2entry) return { level: 2, category: l2entry[0] };
  return { level: null, category: null };
}

function isDescendantCode(node, targetCode) {
  for (const child of node.children) {
    const childCode = child.isAnchor ? child.code : child.row.code;
    if (childCode === targetCode) return true;
    if (isDescendantCode(child, targetCode)) return true;
  }
  return false;
}

/**
 * [نقل حساب من المخطط] الرمز التالي المتاح لحساب فرعي تحت أب معيّن، بنفس منطق
 * nextSiblingCode في compareTrees بالضبط (أعلى رمز شقيق موجود + 1 بنفس عرض
 * الأرقام) - من الشجرة الحالية (tree1Index) ومن حسابات هذا الملف الجديدة معًا،
 * حتى يُبنى الترقيم الهرمي تلقائيًا بعد أي نقل بنفس قاعدة الآباء والأبناء
 * المعتمدة في بقية الأداة، لا بمنطق منفصل.
 */
export function nextChildCodeForParent(parentCode, rows, tree1Index) {
  const siblings = new Set();
  (rows || []).forEach((r) => {
    if (r.status === "new" && !r.deleted && String(r.parent || "").trim() === parentCode) {
      const c = String(r.code || "").trim();
      if (c) siblings.add(c);
    }
  });
  (tree1Index || []).forEach((r) => {
    if (String(r.parent || "").trim() === parentCode) {
      const c = String(r.code || "").trim();
      if (c) siblings.add(c);
    }
  });
  if (siblings.size === 0) return "";
  const maxCodeStr = [...siblings].reduce((a, b) => (a > b ? a : b));
  const numeric = parseInt(maxCodeStr, 10);
  if (isNaN(numeric)) return "";
  const width = maxCodeStr.length;
  return String(numeric + 1).padStart(width, "0");
}

/** هل هذا الرمز مستخدم فعليًا (بالشجرة الحالية أو ضمن الحسابات الجديدة)؟ */
function isCodeInUse(code, rows, tree1Index) {
  if (!code) return false;
  const inNew = (rows || []).some((r) => r.status === "new" && !r.deleted && String(r.code || "").trim() === code);
  if (inNew) return true;
  return (tree1Index || []).some((r) => String(r.code || "").trim() === code);
}

/** فهرس كل الرموز المستخدمة فعلياً (rows + tree1Index) — نفس معيار isCodeInUse أعلاه، لكن
 * مبني مرة واحدة بدل مسح كامل المصفوفتين بكل تكرار من حلقة while بـnextAvailableCodeForParent
 * (قد تصل 100,000 تكرار — بطء كارثي مع شجرة كبيرة وأرقام حسابات متلاصقة). */
function buildUsedCodesSet(rows, tree1Index) {
  const used = new Set();
  (rows || []).forEach((r) => {
    if (r.status === "new" && !r.deleted) {
      const c = String(r.code || "").trim();
      if (c) used.add(c);
    }
  });
  (tree1Index || []).forEach((r) => {
    const c = String(r.code || "").trim();
    if (c) used.add(c);
  });
  return used;
}

/** أول رمز فرعي منطقي تحت أب لا يوجد له أبناء بعد، حسب قاعدة أرقام قيود
 * الثابتة: مستوى 2 يضيف رقمًا واحدًا فقط على أبيه (1 -> 11)، وما بعده يضيف
 * رقمين يبدآن من 01 (11 -> 1101، 1101 -> 110101). */
function firstChildCodeForParent(parentCode, parentLevel) {
  const p = String(parentCode || "").trim();
  if (!p) return "";
  return Number(parentLevel) === 1 ? `${p}1` : `${p}01`;
}

/**
 * الرمز التالي المتاح تحت أب معيّن - بضمان مطلق عدم التعارض مع أي رمز
 * موجود فعليًا (سواء بالشجرة الحالية أو بين الحسابات الجديدة)، مع دعم حالة
 * الأب الذي لا يوجد له أبناء بعد أصلًا (لا يعيد رمزًا فارغًا كما كان سابقًا).
 */
export function nextAvailableCodeForParent(parentCode, parentLevel, rows, tree1Index) {
  let candidate = nextChildCodeForParent(parentCode, rows, tree1Index) || firstChildCodeForParent(parentCode, parentLevel);
  if (!candidate) return "";
  const width = candidate.length;
  let numeric = parseInt(candidate, 10);
  // فهرس مرة واحدة (usedCodes) بدل استدعاء isCodeInUse (يمسح rows+tree1Index كاملتين) بكل
  // تكرار — انظر تعليق buildUsedCodesSet أعلاه. نفس معيار isCodeInUse تماماً، فقط أسرع.
  const usedCodes = buildUsedCodesSet(rows, tree1Index);
  let guard = 0;
  while (usedCodes.has(candidate) && guard < 100000) {
    numeric += 1;
    candidate = String(numeric).padStart(width, "0");
    guard += 1;
  }
  return candidate;
}

/**
 * كل صفوف الحسابات الجديدة (لا الأساسات/الحسابات الموجودة) الواقعة تحت عقدة معيّنة، بأي عمق.
 * بلا acc.push(...collectNewDescendantRows(child)) عمداً: شجرة حسابات عميقة/كبيرة تُرجع
 * مصفوفة تتجاوز حد عدد معطيات نداء الدالة بمحرك V8 فترمي "Maximum call stack size
 * exceeded" فعلياً — نفس الخطأ الجوهري المُصلَح بـexcelCore.js.readWorkbookRows، وهذا نفس
 * الحل (حلقة .push بسيطة بلا أي spread) بلا أي تغيير في القيم أو ترتيبها.
 */
function collectNewDescendantRows(node) {
  const acc = [];
  for (const child of node.children) {
    if (!child.isAnchor) acc.push(child.row);
    const childRows = collectNewDescendantRows(child);
    for (let i = 0; i < childRows.length; i++) acc.push(childRows[i]);
  }
  return acc;
}

const NODE_W = 172, NODE_H = 56;

const TreeNodeBox = React.memo(function TreeNodeBox({
  node, nodeKey, x, y, isOpen, isBeingDragged, isDragOverTarget, isRecentlyMoved, isEditing, isIssueOpen,
  onToggle, onDragStart, onOpenIssue, onCloseIssue, onAddChild, onDeleteNode, onToggleEditing, updateRow, availableTypesFor,
}) {
  const { t } = useLanguage();
  const code = node.isAnchor ? node.code : node.row.code;
  const name = node.isAnchor ? node.label : node.row.nameAr || node.row.nameEn || t({ ar: "(بدون اسم)", en: "(no name)" });
  const hasChildren = node.children.length > 0;
  const isDraggable = !node.isAnchor && Number(node.row.level) >= 3;
  const isAutoParent = !node.isAnchor && node.row.autoParent;
  const isReviewed = !node.isAnchor && !!node.row.reviewed;
  const issueList = !node.isAnchor ? [...(node.row.errors || []), ...(node.row.warnings || [])] : [];
  const [isHovering, setIsHovering] = useState(false);
  const showIssuePopover = isIssueOpen && !isReviewed && issueList.length > 0;
  return (
    <div className="absolute flex flex-col items-center" data-tree-node-code={code} style={{ left: x - NODE_W / 2, top: y - NODE_H / 2, width: NODE_W, transition: isBeingDragged ? "none" : "left 200ms ease, top 200ms ease", zIndex: isEditing ? 30 : (isHovering || showIssuePopover) ? 25 : isBeingDragged ? 20 : 1 }}
      onMouseEnter={() => { setIsHovering(true); if (!isReviewed && issueList.length > 0) onOpenIssue(); }} onMouseLeave={() => setIsHovering(false)}>
      {showIssuePopover && (
        <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
          className="absolute z-40 w-56 rounded-lg border border-[#E2E8F0] bg-white/95 p-2 text-start text-[10.5px] leading-relaxed text-[#475569] shadow-lg backdrop-blur-sm"
          style={{ bottom: NODE_H + 8 }}>
          <ul className="space-y-0.5">
            {(node.row.errors || []).map((e, i) => (<li key={`e${i}`} className="text-red-500">• {e}</li>))}
            {(node.row.warnings || []).map((w, i) => (<li key={`w${i}`} className="text-amber-600">• {w}</li>))}
          </ul>
          <button
            onClick={(e) => { e.stopPropagation(); updateRow(node.row.id, { reviewed: true }); onCloseIssue(); }}
            className="mt-1.5 w-full rounded-md bg-emerald-500/10 px-2 py-1 text-[10.5px] font-semibold text-emerald-600 hover:bg-emerald-500/20"
          >
            {t({ ar: "تم المراجعة", en: "Reviewed" })}
          </button>
          <div className="absolute right-6 top-full h-2 w-2 -translate-y-1 rotate-45 border-b border-r border-[#E2E8F0] bg-white/95" />
        </div>
      )}
      <div
        onPointerDown={(e) => { if (!isDraggable) return; e.stopPropagation(); onToggleEditing(null); onDragStart(code, e.clientX, e.clientY); }}
        style={{ width: NODE_W, height: NODE_H }}
        className={`relative flex flex-col justify-center rounded-lg border px-2.5 py-1.5 text-[11px] shadow-sm transition-all ${
          node.isAnchor ? "border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-[#64748B]" :
          isBeingDragged ? "border-blue-400 bg-blue-500/10 opacity-40 ring-2 ring-blue-300" :
          isDragOverTarget ? "scale-105 border-blue-600 bg-blue-500/10 ring-2 ring-blue-500 shadow-lg" :
          isRecentlyMoved ? "border-emerald-400 bg-emerald-500/10 ring-2 ring-emerald-300" :
          isAutoParent ? "border-violet-500/40 bg-violet-500/10 hover:border-violet-500 hover:shadow-md" :
          "border-[#E2E8F0] bg-[#FFFFFF] hover:border-blue-400 hover:shadow-md"
        } ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""}`}>
        {isBeingDragged && (<span className="absolute -top-2.5 right-1 rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">{t({ ar: "جاري النقل...", en: "Moving..." })}</span>)}
        {isRecentlyMoved && (<span className="absolute -top-2.5 right-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">{t({ ar: "تم النقل ✓", en: "Moved ✓" })}</span>)}
        {!isBeingDragged && !isRecentlyMoved && isAutoParent && (<span className="absolute -top-2.5 right-1 rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">{t({ ar: "أب تلقائي", en: "Auto parent" })}</span>)}
        <div className="flex items-center justify-between gap-1">
          <span className="truncate font-mono text-[10px] text-[#94A3B8]">{code}</span>
          <div className="flex items-center gap-1">
            {!node.isAnchor && <StatusBadge row={node.row} compact reviewed={isReviewed} />}
            <button onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAddChild(node); }} title={t({ ar: "إضافة حساب فرعي", en: "Add child account" })} className="text-[#94A3B8] hover:text-blue-700"><Plus size={12} /></button>
            {!node.isAnchor && (<button onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onToggleEditing((c) => (c === code ? null : code)); }} title={t({ ar: "تعديل", en: "Edit" })} className="text-[#94A3B8] hover:text-blue-700"><Pencil size={11} /></button>)}
            {!node.isAnchor && (<button onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDeleteNode(node); }} title={t({ ar: "استبعاد", en: "Exclude" })} className="text-[#94A3B8] hover:text-red-400"><Trash2 size={11} /></button>)}
          </div>
        </div>
        <div className={`truncate ${node.isAnchor ? "italic" : "font-semibold text-[#0F172A]"}`}>{name}</div>
      </div>
      {hasChildren && (<button onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onToggle(nodeKey); }} title={isOpen ? t({ ar: "طيّ", en: "Collapse" }) : t({ ar: "عرض", en: "Expand" })} className="z-10 -mt-2.5 flex h-5 w-5 items-center justify-center rounded-full border border-[#E2E8F0] bg-[#FFFFFF] text-[10px] text-[#64748B] shadow-sm hover:border-blue-600 hover:text-blue-700">{isOpen ? "−" : "+"}</button>)}
      {isEditing && (
        <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="absolute right-0 z-30 w-60 rounded-xl border border-blue-500/40 bg-[#FFFFFF] p-3 text-start shadow-xl" style={{ top: NODE_H + 6 }}>
          <div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-bold text-[#64748B]">{t({ ar: "تعديل الحساب", en: "Edit account" })}</span><button onClick={() => onToggleEditing(null)} className="text-[#94A3B8] hover:text-[#0F172A]"><X size={13} /></button></div>
          <label className="mb-0.5 block text-[10px] text-[#94A3B8]">{t({ ar: "الرمز", en: "Code" })}</label><EditableCell value={node.row.code} onChange={(v) => updateRow(node.row.id, { code: v })} mono />
          <label className="mb-0.5 mt-2 block text-[10px] text-[#94A3B8]">{t({ ar: "الاسم العربي", en: "Arabic name" })}</label><EditableCell value={node.row.nameAr} onChange={(v) => updateRow(node.row.id, { nameAr: v })} />
          <label className="mb-0.5 mt-2 block text-[10px] text-[#94A3B8]">{t({ ar: "الاسم الانجليزي", en: "English name" })}</label><EditableCell value={node.row.nameEn} onChange={(v) => updateRow(node.row.id, { nameEn: v })} />
          {(node.row.level === 1 || node.row.level === "1") && (<><label className="mb-0.5 mt-2 block text-[10px] text-[#94A3B8]">{t({ ar: "النوع", en: "Type" })}</label><select value={node.row.type} onChange={(e) => updateRow(node.row.id, { type: e.target.value })} className="w-full rounded border border-[#233152] bg-[#0E1830] text-[#E6EDF6] px-1 py-1 text-[11px]"><option value="">{t({ ar: "اختر", en: "Select" })}</option>{LEVEL1_TYPES_ALLOWING_NEW.map((t) => (<option key={t} value={t}>{t}</option>))}</select></>)}
          {(node.row.level === 2 || node.row.level === "2") && (<><label className="mb-0.5 mt-2 block text-[10px] text-[#94A3B8]">{t({ ar: "النوع (م2)", en: "Type (L2)" })}</label><select value={node.row.type} onChange={(e) => updateRow(node.row.id, { type: e.target.value })} className="w-full rounded border border-[#233152] bg-[#0E1830] text-[#E6EDF6] px-1 py-1 text-[11px]"><option value="">{t({ ar: "اختر", en: "Select" })}</option>{LEVEL2_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}</select></>)}
          {Number(node.row.level) >= 3 && (() => {
            const cat = TYPE_TO_LEVEL2[node.row.type] || canonicalizeLevel2Category(node.row.level2Category) || node.row.level2Category || "";
            const catOptions = cat && !LEVEL2_TYPES.includes(cat) ? [cat, ...LEVEL2_TYPES] : LEVEL2_TYPES;
            const baseTypes = availableTypesFor(cat);
            const typeOptions = node.row.type && !baseTypes.includes(node.row.type) ? [node.row.type, ...baseTypes] : baseTypes;
            return (<><label className="mb-0.5 mt-2 block text-[10px] text-[#94A3B8]">{t({ ar: "الفئة (م2)", en: "Category (L2)" })}</label><select value={cat} onChange={(e) => updateRow(node.row.id, { level2Category: e.target.value, type: "" })} className="w-full rounded border border-[#233152] bg-[#0E1830] text-[#E6EDF6] px-1 py-1 text-[11px]"><option value="">{t({ ar: "اختر", en: "Select" })}</option>{catOptions.map((t) => (<option key={t} value={t}>{t}</option>))}</select><label className="mb-0.5 mt-2 block text-[10px] text-[#94A3B8]">{t({ ar: "نوع الحساب", en: "Account type" })}</label><select value={node.row.type || ""} onChange={(e) => updateRow(node.row.id, { type: e.target.value })} className="w-full rounded border border-[#233152] bg-[#0E1830] text-[#E6EDF6] px-1 py-1 text-[11px]"><option value="">{t({ ar: "اختر", en: "Select" })}</option>{typeOptions.map((t) => (<option key={t} value={t}>{t}</option>))}</select></>);
          })()}
        </div>
      )}
    </div>
  );
}, (p, n) => p.node === n.node && p.x === n.x && p.y === n.y && p.isOpen === n.isOpen && p.isBeingDragged === n.isBeingDragged && p.isDragOverTarget === n.isDragOverTarget && p.isRecentlyMoved === n.isRecentlyMoved && p.isEditing === n.isEditing && p.isIssueOpen === n.isIssueOpen && p.node.children.length === n.node.children.length);

function AccountsTreeView({ rows, treeMeta, updateRow, setRowDeleted, addChildAccount, availableTypesFor }) {
  const { t, dir, lang } = useLanguage();
  const level1CodeMap = treeMeta?.level1CodeMap || {};
  const level2CodeMap = treeMeta?.level2CodeMap || {};
  const { buckets, nodesByCode } = useMemo(() => {
    const nodesByCode = new Map();
    rows.forEach((r) => { if (r.code) nodesByCode.set(r.code, { row: r, children: [], isAnchor: false }); });
    const anchors = new Map(), topLevel = [];
    const getOrCreateAnchor = (code, guard = new Set()) => {
      const existing = anchors.get(code);
      if (existing) return existing;
      const anchor = { isAnchor: true, code, label: labelForExternalCode(code, level1CodeMap, level2CodeMap), root: deriveRootForExternalCode(code, level1CodeMap, level2CodeMap), children: [] };
      anchors.set(code, anchor);
      if (guard.has(code)) { topLevel.push(anchor); return anchor; }
      guard.add(code);
      const parentCode = getAnchorParentCode(code, level1CodeMap, level2CodeMap);
      if (parentCode && parentCode !== code) { const parentAnchor = getOrCreateAnchor(parentCode, guard); parentAnchor.children.push(anchor); }
      else topLevel.push(anchor);
      return anchor;
    };
    rows.forEach((r) => {
      const node = nodesByCode.get(r.code); if (!node) return;
      const parentCode = r.parent ? String(r.parent).trim() : "";
      if (!parentCode) { topLevel.push(node); return; }
      const parentNode = nodesByCode.get(parentCode);
      if (parentNode) parentNode.children.push(node);
      else { const anchor = getOrCreateAnchor(parentCode); anchor.children.push(node); }
    });
    const buckets = {};
    LEVEL1_ROOT_TYPES.forEach((r) => { buckets[normalizeArabic(r)] = { label: r, items: [] }; });
    const unknownKey = "__unknown__";
    buckets[unknownKey] = { label: "جذر غير محدد (راجع الأب يدويًا)", items: [] };
    topLevel.forEach((node) => { const root = node.isAnchor ? node.root : deriveRootForRow(node.row); if (root && buckets[root]) buckets[root].items.push(node); else buckets[unknownKey].items.push(node); });
    return { buckets, nodesByCode };
  }, [rows, level1CodeMap, level2CodeMap]);

  const [expanded, setExpanded] = useState(() => new Set());
  const nodeKeyOf = (node) => (node.isAnchor ? `a-${node.code}` : node.isVirtual ? node.code : node.row.id);
  const toggleExpand = useCallback((key) => { setExpanded((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }, []);
  // كل مفاتيح العقد التي "لها أبناء" ضمن شجرة معيّنة (تُستخدم بزر توسيع/طي
  // الكل أدناه) - لا تلمس أي عقدة خارج الشجرة المعروضة حاليًا فعليًا.
  const collectExpandableKeys = (node) => {
    let keys = node.children.length > 0 ? [nodeKeyOf(node)] : [];
    node.children.forEach((c) => { keys = keys.concat(collectExpandableKeys(c)); });
    return keys;
  };
  const [allExpanded, setAllExpanded] = useState(false);
  const [draggedCode, setDraggedCode] = useState(null);
  const [dragOverCode, setDragOverCode] = useState(null);
  const [dropMessage, setDropMessage] = useState(null);
  const [recentlyMovedCode, setRecentlyMovedCode] = useState(null);
  const [editingCode, setEditingCode] = useState(null);
  const draggedNode = draggedCode ? nodesByCode.get(draggedCode) : null;
  const draggedRoot = draggedNode ? deriveRootForRow(draggedNode.row) : null;

  /*
   * [نظام نقل جديد بالكامل بنمط "موشن"] استبدال drag & drop الأصلي بالمتصفح
   * (draggable + onDragStart/Over/Drop) بنظام مبني على Pointer Events خالص:
   * الحساب يتبع مؤشر الماوس مباشرة (ghostPos) بلا أي اعتماد على سلوك المتصفح
   * الافتراضي (الذي كان يتيح لحاوية اللوحة نفسها أن "تخطف" onPointerDown
   * فتتحرك اللوحة كاملة بدل نقل الحساب - e.stopPropagation() بالأسفل على
   * onPointerDown للحساب القابل للسحب يمنع هذا التعارض جذريًا). العنصر
   * العائم (الغوست) للعرض فقط ولا يمس منطق handleDrop أدناه بحرف واحد - هو
   * نفسه بالضبط كما كان، فقط يُستدعى الآن من نقطة إفلات محسوبة عبر
   * document.elementFromPoint بدل onDrop الأصلي.
   */
  const [ghostPos, setGhostPos] = useState(null);
  const handleDragStart = useCallback((code, clientX, clientY) => {
    setDraggedCode(code);
    setDragOverCode(null);
    setDropMessage(null);
    setEditingCode(null);
    setGhostPos({ x: clientX, y: clientY });
  }, []);

  /*
   * [إصلاح] تنويه الأخطاء/التحذيرات فوق الحساب كان يعتمد بالكامل على
   * onMouseEnter/onMouseLeave (isHovering) - أي حركة ماوس عابرة (حتى لو
   * لحظية) خارج مساحة الحساب أثناء التوجّه نحو زر "تم المراجعة" كانت تُطفئه
   * فورًا قبل ما يصل المستخدم للزر. الحل: التنويه الآن "مثبّت" (openIssueCode)
   * بمجرد ما يفتح بالهوفر، ولا يُطفأ إلا بالضغط على "تم المراجعة" نفسه أو
   * بالضغط في أي مكان آخر بالشاشة (مستمع نقر عام على document يتحقق من
   * data-tree-node-code القريب من نقطة الضغط).
   */
  const [openIssueCode, setOpenIssueCode] = useState(null);
  useEffect(() => {
    if (!openIssueCode) return;
    const handler = (e) => {
      const hitEl = e.target && e.target.closest ? e.target.closest("[data-tree-node-code]") : null;
      const hitCode = hitEl ? hitEl.getAttribute("data-tree-node-code") : null;
      if (hitCode !== openIssueCode) setOpenIssueCode(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openIssueCode]);

  const handleDrop = (targetNode) => {
    setDropMessage(null); setDragOverCode(null);
    if (!draggedCode || !draggedNode) return;
    const targetCode = targetNode.isAnchor ? targetNode.code : targetNode.row.code;
    if (targetCode === draggedCode) return;
    if (draggedNode.row.parent === targetCode) return;
    const targetRoot = targetNode.isAnchor ? targetNode.root : deriveRootForRow(targetNode.row);
    if (!targetRoot || targetRoot !== draggedRoot) { setDropMessage({ type: "error", text: "ما تقدر تنقل الحساب هون - النقل مسموح بس بين حسابات نفس الفئة الرئيسية" }); return; }
    if (isDescendantCode(draggedNode, targetCode)) { setDropMessage({ type: "error", text: "ما تقدر تنقل حساب تحت أحد فروعه نفسه" }); return; }
    const { level: targetLevel, category: targetCategory } = getNodeLevelAndCategory(targetNode, level1CodeMap, level2CodeMap);
    if (!targetLevel || targetLevel < 2) { setDropMessage({ type: "error", text: "تعذّر تحديد مستوى هذا الحساب - عدّل الأب يدويًا" }); return; }
    const newLevel = targetLevel + 1;
    const patch = { parent: targetCode, level: newLevel, level2Category: targetCategory || "" };

    const targetType = targetNode.isAnchor ? (LEVEL3_MAP[targetCategory]?.[0] || "") : targetNode.row.type;
    patch.type = targetType;

    /*
     * [رمز الحساب يُعاد ترقيمه تلقائيًا عند النقل] الاسم يُتجاهل هنا عمدًا -
     * موضع الحساب الجديد تحت أبيه هو ما يحدد رمزه، لا اسمه: يأخذ أول رمز شاغر
     * تالٍ لأبناء الأب الجديد فعليًا (بنفس قاعدة الآباء والأبناء الهرمية
     * المعتمدة في كل الأداة)، بدل إبقاء رمزه القديم الذي كان يعكس موضعه في
     * الفئة السابقة. أي حساب فرعي تحته (من حسابات هذا الملف) يُعاد ترقيمه معه
     * بنفس الإزاحة حتى تبقى الشجرة متّسقة (الرمز القديم لم يعد له معنى أصلًا).
     */
    const oldCode = draggedNode.row.code;
    const newCode = nextAvailableCodeForParent(targetCode, targetLevel, rows, treeMeta?.tree1Index);
    const descendantRows = newCode && newCode !== oldCode ? collectNewDescendantRows(draggedNode) : [];
    if (newCode && newCode !== oldCode) patch.code = newCode;

    setDropMessage({
      type: "success",
      text: newCode && newCode !== oldCode
        ? `تم نقل "${draggedNode.row.nameAr}" بنجاح - رمزه الجديد ${newCode}`
        : `تم نقل "${draggedNode.row.nameAr}" بنجاح`,
    });
    updateRow(draggedNode.row.id, patch);
    if (newCode && newCode !== oldCode) {
      // كل ذرية الحساب المنقول تُعاد ترقيمها بنفس الإزاحة - الرمز نفسه، وحقل
      // "الحساب الرئيسي" أيضًا لأنه قد يشير لرمز الحساب المنقول القديم مباشرة
      // (أبناؤه المباشرون) أو لرمز حفيد آخر أُعيد ترقيمه للتو (أحفاده الأعمق)
      descendantRows.forEach((childRow) => {
        const childPatch = {};
        const childCode = String(childRow.code || "").trim();
        if (childCode && childCode.startsWith(oldCode)) childPatch.code = newCode + childCode.slice(oldCode.length);
        const childParent = String(childRow.parent || "").trim();
        if (childParent && childParent.startsWith(oldCode)) childPatch.parent = newCode + childParent.slice(oldCode.length);
        if (Object.keys(childPatch).length) updateRow(childRow.id, childPatch);
      });
    }
    setExpanded((prev) => new Set(prev).add(nodeKeyOf(targetNode)));
    setDraggedCode(null); setRecentlyMovedCode(newCode && newCode !== oldCode ? newCode : draggedCode);
    setTimeout(() => setRecentlyMovedCode((c) => (c === (newCode || draggedCode) ? null : c)), 1800);
  };

  const handleAddChild = (node) => {
    const info = getNodeLevelAndCategory(node, level1CodeMap, level2CodeMap);
    if (!info.level) { setDropMessage({ type: "error", text: "تعذّر تحديد مستوى هذا الحساب" }); return; }
    const parentCode = node.isAnchor ? node.code : node.row.code;
    const parentType = node.isAnchor ? info.category || "" : node.row.type;
    addChildAccount({ code: parentCode, level: info.level, category: info.category, type: parentType });
    setExpanded((prev) => new Set(prev).add(nodeKeyOf(node)));
    setDropMessage({ type: "success", text: `تمت إضافة حساب فرعي جديد` });
  };

  const handleDeleteNode = (node) => {
    if (node.isAnchor) return;
    const childCount = node.children.length;
    if (childCount > 0) { setDropMessage({ type: "error", text: `ما تقدر تستبعد "${node.row.nameAr}" وتحته ${childCount} حساب فرعي` }); return; }
    setRowDeleted(node.row.id, true); setEditingCode(null);
    setDropMessage({ type: "success", text: `تم استبعاد "${node.row.nameAr}"` });
  };

  const bucketEntries = Object.entries(buckets).filter(([, b]) => b.items.length > 0);
  const [fullView, setFullView] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const treeViewportRef = useRef(null);
  const panRef = useRef(null);
  const [activeRootKey, setActiveRootKey] = useState(null);
  useEffect(() => { if ((!activeRootKey || !buckets[activeRootKey] || buckets[activeRootKey].items.length === 0) && bucketEntries.length > 0) setActiveRootKey(bucketEntries[0][0]); }, [bucketEntries.map(([k]) => k).join(","), rows]);
  const activeBucket = activeRootKey ? buckets[activeRootKey] : null;
  const rootForLayout = useMemo(() => {
    if (fullView) {
      const allItems = bucketEntries.flatMap(([, b]) => b.items);
      if (allItems.length === 0) return null;
      if (allItems.length === 1) return allItems[0];
      return { isVirtual: true, code: "__all_roots__", children: allItems };
    }
    if (!activeBucket || activeBucket.items.length === 0) return null; if (activeBucket.items.length === 1) return activeBucket.items[0]; return { isVirtual: true, code: "__virtual__", children: activeBucket.items };
  }, [activeBucket, fullView, bucketEntries]);
  useEffect(() => { if (!rootForLayout) return; setExpanded((prev) => { const next = new Set(prev); next.add(nodeKeyOf(rootForLayout)); rootForLayout.children.forEach((child) => next.add(nodeKeyOf(child))); return next; }); }, [activeRootKey, fullView]);
  // تبديل العرض (توسيع الكل ⇄ طي الكل) يتغيّر بتغيّر الفئة/وضع العرض الكامل -
  // حتى لا يبقى الزر عالقًا على "طي الكل" بعد الانتقال لفئة جديدة موسّعة جزئيًا فقط.
  useEffect(() => { setAllExpanded(false); }, [activeRootKey, fullView]);
  const handleToggleExpandAll = useCallback(() => {
    if (!rootForLayout) return;
    const keys = collectExpandableKeys(rootForLayout);
    if (allExpanded) {
      setExpanded((prev) => { const next = new Set(prev); keys.forEach((k) => next.delete(k)); return next; });
      setAllExpanded(false);
    } else {
      setExpanded((prev) => { const next = new Set(prev); keys.forEach((k) => next.add(k)); return next; });
      setAllExpanded(true);
    }
  }, [rootForLayout, allExpanded]);

  const pruneForDisplay = (node) => { const key = nodeKeyOf(node); const isOpen = node.isVirtual || expanded.has(key); return { _node: node, _key: key, children: isOpen ? node.children.map(pruneForDisplay) : [] }; };
  const { positioned, links, canvasW, canvasH } = useMemo(() => {
    if (!rootForLayout) return { positioned: [], links: [], canvasW: 0, canvasH: 0 };
    const pruned = pruneForDisplay(rootForLayout);
    const root = d3.hierarchy(pruned, (d) => d.children);
    d3.tree().nodeSize([NODE_W + 28, NODE_H + 54])(root);
    const descendants = root.descendants();
    let minX = Infinity, maxX = -Infinity, maxY = 0;
    descendants.forEach((d) => { minX = Math.min(minX, d.x); maxX = Math.max(maxX, d.x); maxY = Math.max(maxY, d.y); });
    const offsetX = -minX + NODE_W / 2 + 24, offsetY = NODE_H / 2 + 24;
    const positioned = descendants.filter((d) => !d.data._node.isVirtual).map((d) => ({ node: d.data._node, key: d.data._key, x: d.x + offsetX, y: d.y + offsetY }));
    const links = root.links().filter((l) => !l.source.data._node.isVirtual).map((l) => ({ sx: l.source.x + offsetX, sy: l.source.y + offsetY, tx: l.target.x + offsetX, ty: l.target.y + offsetY }));
    return { positioned, links, canvasW: (isFinite(maxX) ? maxX - minX : 0) + NODE_W + 48, canvasH: maxY + NODE_H + 48 };
  }, [rootForLayout, expanded]);

  // خريطة رمز← عقدة لكل ما هو معروض حاليًا فقط (نفس ما يراه المستخدم فعليًا) -
  // تُستخدم لتحديد هدف الإفلات الحقيقي (حساب حقيقي أو "أب تلقائي" آنكور) عند
  // رفع الماوس فوقه، بدل onDrop الأصلي بكل عقدة.
  const positionedByCode = useMemo(() => {
    const map = new Map();
    positioned.forEach((p) => {
      const c = p.node.isAnchor ? p.node.code : p.node.row.code;
      if (c) map.set(c, p.node);
    });
    return map;
  }, [positioned]);

  // مرجع يحمل أحدث نسخة من الدوال/الخرائط التي يحتاجها مستمع pointerup على
  // window - بلا هذا المرجع كانت الدالة المُسجَّلة عند بدء السحب (draggedCode
  // يتحول من null لقيمة) تبقى حاملة لقيمًا قديمة (rows/treeMeta وقت ذاك)
  // طوال السحب حتى لو تغيّرت الحالة أثناءه (dragOverCode مثلاً يعيد رسم
  // AccountsTreeView مرارًا خلال حركة الماوس نفسها).
  const dragRuntimeRef = useRef({ positionedByCode, handleDrop });
  dragRuntimeRef.current.positionedByCode = positionedByCode;
  dragRuntimeRef.current.handleDrop = handleDrop;

  useEffect(() => {
    if (!draggedCode) return;
    const handleMove = (e) => {
      setGhostPos({ x: e.clientX, y: e.clientY });
      const hitEl = document.elementFromPoint(e.clientX, e.clientY);
      const nodeEl = hitEl && hitEl.closest ? hitEl.closest("[data-tree-node-code]") : null;
      const hitCode = nodeEl ? nodeEl.getAttribute("data-tree-node-code") : null;
      setDragOverCode(hitCode && hitCode !== draggedCode ? hitCode : null);
    };
    const handleUp = (e) => {
      const hitEl = document.elementFromPoint(e.clientX, e.clientY);
      const nodeEl = hitEl && hitEl.closest ? hitEl.closest("[data-tree-node-code]") : null;
      const hitCode = nodeEl ? nodeEl.getAttribute("data-tree-node-code") : null;
      const { positionedByCode: pbc, handleDrop: doDrop } = dragRuntimeRef.current;
      const targetNode = hitCode && hitCode !== draggedCode ? pbc.get(hitCode) : null;
      if (targetNode) doDrop(targetNode);
      // شبكة أمان: أيًا كان مصير الإفلات (نجح/فشل/بلا هدف)، تنظيف كامل لحالة
      // السحب هنا دائمًا - تمامًا كضمان onDragEnd الأصلي بالمتصفح سابقًا.
      setDraggedCode(null);
      setDragOverCode(null);
      setGhostPos(null);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [draggedCode]);

  const [zoom, setZoom] = useState(1);
  const treeScrollRef = useRef(null);
  const zoomRef = useRef(1);
  const MIN_ZOOM = 0.2, MAX_ZOOM = 2;
  const fitToPage = useCallback(() => {
    const el = treeScrollRef.current;
    if (!el) return;
    const fitW = el.clientWidth / (canvasW || 1);
    const fitH = el.clientHeight / (canvasH || 1);
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(fitW, fitH)));
    zoomRef.current = z;
    setZoom(z);
    el.scrollLeft = 0;
    el.scrollTop = 0;
  }, [canvasW, canvasH]);
  const resetZoom = useCallback(() => { zoomRef.current = 1; setZoom(1); const el = treeScrollRef.current; if (el) { el.scrollLeft = 0; el.scrollTop = 0; } }, []);
  const fittedRef = useRef(null);
  useEffect(() => {
    const key = fullView ? "__all_roots__" : (activeRootKey || "");
    if (fittedRef.current === key) return;
    fittedRef.current = key;
    const id = requestAnimationFrame(fitToPage);
    return () => cancelAnimationFrame(id);
  }, [activeRootKey, fullView]);
  // الدخول أو الخروج من ملء الشاشة يغيّر حجم الحاوية فعليًا - أعد ملاءمة التكبير
  // للمساحة الجديدة تلقائيًا بدل بقاء نسبة التكبير القديمة المحسوبة للحجم الصغير
  useEffect(() => {
    const id = requestAnimationFrame(fitToPage);
    return () => cancelAnimationFrame(id);
  }, [isFullscreen]);

  useEffect(() => {
    const el = treeScrollRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current + (e.deltaY < 0 ? 0.1 : -0.1)));
      zoomRef.current = z;
      setZoom(z);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  /*
   * [إصلاح] وضع ملء الشاشة أصبح يعتمد فقط على حالة isFullscreen (overlay
   * بCSS يغطي الشاشة كاملة عبر fixed inset-0 z-[9999]) - وأُلغي استدعاء
   * Fullscreen API الحقيقي من المتصفح (requestFullscreen/exitFullscreen)
   * كليًا. كان هذا الاستدعاء يفشل صامتًا في بعض السياقات (iframe بلا
   * allow="fullscreen"، بعض إعدادات الأمان)، وفي متصفحات أخرى يسبب وميض/تأثير
   * بصري لحظي غريب (حدود متصلة/منقطة تظهر وتختفي) لأنه يُستدعى على عنصر فرعي
   * (مربّع التمرير) لا على الصفحة كاملة. حالة isFullscreen وحدها كافية تمامًا
   * لعرض المخطط بحجمه الكامل بشكل موثوق 100% في كل المتصفحات، فلا حاجة لأي
   * طلب إذن حقيقي من المتصفح إطلاقًا.
   */
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);
  const handlePanStart = (event) => {
    if (event.button !== 0) return;
    const element = treeViewportRef.current;
    panRef.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
    element.setPointerCapture(event.pointerId);
  };
  const handlePanMove = (event) => {
    if (!panRef.current) return;
    const element = treeViewportRef.current;
    element.scrollLeft = panRef.current.left - (event.clientX - panRef.current.x);
    element.scrollTop = panRef.current.top - (event.clientY - panRef.current.y);
  };
  const handlePanEnd = () => { panRef.current = null; };

  return (
    <div className={isFullscreen ? "fixed inset-0 z-[9999] flex flex-col bg-[#FFFFFF] p-4" : "mt-5"} dir={dir}>
      {!isFullscreen && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-300"><GitBranch size={15} className="mt-0.5 shrink-0" /><span>{t({ ar: "اسحب أي حساب (مستوى3+) وأفلته فوق حساب تاني تحت نفس الفئة. يتم توارث نوع الحساب تلقائيًا. الحسابات البنفسجية آباء أُنشئوا تلقائيًا لأنهم كانوا مفقودين.", en: "Drag any account (level 3+) and drop it onto another account under the same category. The account type is inherited automatically. Violet accounts are parents created automatically because they were missing." })}</span></div>
      )}
      {dropMessage && (<div className={`mb-3 shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold ${dropMessage.type === "error" ? "border-red-500/30 bg-red-500/10 text-red-300" : dropMessage.type === "warning" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>{lang === "en" ? localizeMergeError(dropMessage.text) : dropMessage.text}</div>)}
      {bucketEntries.length === 0 ? (<div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#FFFFFF] py-8 text-center text-sm text-[#94A3B8]">{t({ ar: "ما فيه حسابات جديدة لعرضها", en: "No new accounts to display" })}</div>) : (
        <>
          <div className="mb-3 flex shrink-0 flex-wrap gap-2">
            {bucketEntries.map(([key, bucket]) => (
              <button key={key} onClick={() => { setFullView(false); setActiveRootKey(key); }} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${!fullView && activeRootKey === key ? "border-[#12B886] bg-[#12B886] text-[#04120C]" : "border-[#E2E8F0] bg-[#FFFFFF] text-[#64748B] hover:border-[#12B886] hover:text-[#15803D]"}`}>{bucket.label} ({bucket.items.length})</button>
            ))}
          </div>
          <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2">
            {bucketEntries.length > 1 && (
              <button onClick={() => setFullView((v) => !v)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${fullView ? "border-[#12B886] bg-[#12B886] text-[#04120C]" : "border-[#CBD5E1] bg-[#F8FAFC] text-[#64748B] hover:border-[#12B886] hover:text-[#15803D]"}`}>{t({ ar: "☰ العرض الكامل للشجرة", en: "☰ View Entire Tree" })}</button>
            )}
              <button onClick={toggleFullscreen} className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${isFullscreen ? "border-[#12B886] bg-[#12B886] text-[#04120C]" : "border-[#E2E8F0] bg-[#FFFFFF] text-[#64748B] hover:border-[#12B886] hover:text-[#15803D]"}`}>{isFullscreen ? t({ ar: "✕ إلغاء ملء الشاشة", en: "✕ Exit full screen" }) : t({ ar: "⛶ ملء الشاشة", en: "⛶ Full screen" })}</button>
            <button onClick={handleToggleExpandAll} className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${allExpanded ? "border-[#12B886] bg-[#12B886] text-[#04120C]" : "border-[#E2E8F0] bg-[#FFFFFF] text-[#64748B] hover:border-[#12B886] hover:text-[#15803D]"}`}>{allExpanded ? t({ ar: "− طي الكل", en: "− Collapse All" }) : t({ ar: "+ توسيع الكل", en: "+ Expand All" })}</button>
            <button onClick={resetZoom} className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold text-[#64748B] hover:border-[#12B886] hover:text-[#15803D] transition">{t({ ar: "100%", en: "100%" })}</button>
            <button onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))} className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-2 py-1.5 text-xs font-bold text-[#64748B] hover:border-[#12B886]">+</button>
            <button onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))} className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-2 py-1.5 text-xs font-bold text-[#64748B] hover:border-[#12B886]">−</button>
            <span className="text-xs text-[#94A3B8]">{Math.round(zoom * 100)}%</span>
            {isFullscreen && (
              <span className="text-xs text-[#94A3B8]">{t({ ar: "(Esc للخروج)", en: "(Esc to exit)" })}</span>
            )}
          </div>
          <div
            ref={(element) => { treeScrollRef.current = element; treeViewportRef.current = element; }}
            className={`overflow-auto rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] ${isFullscreen ? "min-h-0 flex-1" : ""}`}
            style={{ maxHeight: isFullscreen ? "none" : 640, cursor: panRef.current ? "grabbing" : "grab" }}
            onPointerDown={handlePanStart} onPointerMove={handlePanMove} onPointerUp={handlePanEnd} onPointerCancel={handlePanEnd}
          >
            <div className="relative" style={{ width: canvasW * zoom, height: canvasH * zoom, minWidth: "100%", transition: "width 0.15s, height 0.15s" }}>
              <div className="absolute inset-0 origin-top-left" style={{ transform: `scale(${zoom})`, width: canvasW, height: canvasH }}>
              <svg width={canvasW} height={canvasH} className="absolute inset-0" style={{ pointerEvents: "none" }}>
                {links.map((l, i) => { const midY = (l.sy + l.ty) / 2; return (<path key={i} d={`M ${l.sx} ${l.sy + NODE_H / 2} V ${midY} H ${l.tx} V ${l.ty - NODE_H / 2}`} fill="none" stroke="#2A3A5C" strokeWidth={1.5} />); })}
              </svg>
              {positioned.map(({ node, key, x, y }) => {
                const code = node.isAnchor ? node.code : node.row.code;
                return (<TreeNodeBox key={key} node={node} nodeKey={key} x={x} y={y} isOpen={expanded.has(key)} isBeingDragged={draggedCode === code} isDragOverTarget={!!draggedCode && draggedCode !== code && dragOverCode === code} isRecentlyMoved={recentlyMovedCode === code} isEditing={editingCode === code && !node.isAnchor} isIssueOpen={openIssueCode === code} onToggle={toggleExpand} onDragStart={handleDragStart} onOpenIssue={() => setOpenIssueCode(code)} onCloseIssue={() => setOpenIssueCode(null)} onAddChild={handleAddChild} onDeleteNode={handleDeleteNode} onToggleEditing={setEditingCode} updateRow={updateRow} availableTypesFor={availableTypesFor} />);
              })}
              </div>
            </div>
          </div>
          {draggedCode && ghostPos && draggedNode && (
            <div
              className="pointer-events-none fixed z-[10000] flex flex-col justify-center rounded-lg border-2 border-blue-500 bg-white px-2.5 py-1.5 text-[11px] shadow-2xl"
              style={{ left: ghostPos.x - NODE_W / 2, top: ghostPos.y - NODE_H / 2, width: NODE_W, height: NODE_H, opacity: 0.97, transform: "scale(1.04)" }}
            >
              <span className="truncate font-mono text-[10px] text-[#94A3B8]">{draggedNode.row.code}</span>
              <div className="truncate font-semibold text-[#0F172A]">{draggedNode.row.nameAr || draggedNode.row.nameEn}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
