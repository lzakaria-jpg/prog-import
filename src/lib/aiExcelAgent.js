// ─────────────────────────────────────────────────────────────────────────
// AI Excel/file workflow — callable from chat via @AI when a file is attached.
//
// Design: the LLM's only job is turning a natural-language request into a
// small, validated JSON "plan" drawn from a fixed operation vocabulary. Every
// actual spreadsheet mutation is a pure, deterministic, unit-testable JS
// function — the AI never touches cell data directly, so a bad/hallucinated
// plan can only be rejected (unknown op, unknown column), never corrupt data
// in some way we can't reason about.
//
// Flow: user uploads a file + asks for changes → parseWorkbook() reads it
// generically → planWithAI() asks Gemini for an operation list against the
// sheet's real headers/sample rows → validatePlan() drops anything that
// doesn't check out → applyOperations() executes the (validated) plan →
// buildWorkbookBlob() writes a brand-new .xlsx — the original is never
// touched or overwritten.
// ─────────────────────────────────────────────────────────────────────────

import ExcelJS from "exceljs";
import { getGeminiKey } from "../aiAgent";
import { buildParentInfo } from "./excelCore";

/** أسماء العمليات المسموحة — أي شيء آخر يُرفض بأمان بدل تنفيذه */
export const KNOWN_OPS = new Set([
  "rename_column", "delete_column", "reorder_columns",
  "remove_duplicates", "remove_empty_rows", "trim_whitespace",
  "sort", "split_sheet", "merge_sheets",
  "add_formula_column", "add_report_sheet",
  "build_chart_of_accounts_from_trial_balance",
]);

// ═══════════════════════════════════════════════════════════════════════
// القراءة — أي ملف إلى تمثيل عام: [{ name, headers, rows: [{col: val}] }]
// ═══════════════════════════════════════════════════════════════════════
export async function parseWorkbookGeneric(file) {
  const buffer = await file.arrayBuffer();
  const name = file.name || "";

  if (/\.csv$/i.test(name)) {
    const text = new TextDecoder("utf-8").decode(buffer);
    return { sheets: [parseCsvSheet(text, "Sheet1")] };
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheets = [];
  wb.eachSheet((ws) => {
    if (ws.state === "hidden" || ws.state === "veryHidden") return;
    if (ws.rowCount < 1) return;
    const headerRow = ws.getRow(1);
    const headers = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, i) => {
      headers[i - 1] = cellText(cell.value) || `عمود ${i}`;
    });
    if (!headers.length) return;
    const rows = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rec = {};
      let any = false;
      headers.forEach((h, i) => {
        const v = cellText(row.getCell(i + 1).value);
        rec[h] = v;
        if (v !== "" && v !== null && v !== undefined) any = true;
      });
      if (any) rows.push(rec);
    }
    sheets.push({ name: ws.name, headers, rows });
  });
  return { sheets };
}

function cellText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("result" in v) return v.result ?? "";
    if ("text" in v) return v.text;
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("error" in v) return "";
  }
  return v;
}

function parseCsvSheet(text, name) {
  const rows = [];
  let field = "", row = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const clean = rows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (!clean.length) return { name, headers: [], rows: [] };
  const headers = clean[0].map((h, i) => String(h ?? "").trim() || `عمود ${i + 1}`);
  const dataRows = clean.slice(1).map((r) => {
    const rec = {};
    headers.forEach((h, i) => { rec[h] = r[i] ?? ""; });
    return rec;
  });
  return { name, headers, rows: dataRows };
}

// ═══════════════════════════════════════════════════════════════════════
// التخطيط بالذكاء الاصطناعي — يحوّل طلب المستخدم إلى خطة JSON من المفردات المعروفة فقط
// ═══════════════════════════════════════════════════════════════════════
const PLAN_SYSTEM_PROMPT = `أنت محرّك تخطيط عمليات جداول بيانات. مهمتك الوحيدة: قراءة طلب المستخدم وبنية الجدول (أسماء الأعمدة وعيّنة صفوف)، ثم إعادة خطة JSON فقط — بلا أي نص خارج JSON — من هذه العمليات المعروفة حصراً:

- {"op":"rename_column","sheet":"...","from":"...","to":"..."}
- {"op":"delete_column","sheet":"...","column":"..."}
- {"op":"reorder_columns","sheet":"...","order":["...","..."]}
- {"op":"remove_duplicates","sheet":"...","keyColumns":["..."]}  // فارغة = كل الأعمدة
- {"op":"remove_empty_rows","sheet":"..."}
- {"op":"trim_whitespace","sheet":"...","columns":["..."]}  // فارغة = كل الأعمدة
- {"op":"sort","sheet":"...","column":"...","order":"asc"|"desc"}
- {"op":"split_sheet","sheet":"...","byColumn":"..."}  // ورقة جديدة لكل قيمة مختلفة في العمود
- {"op":"merge_sheets","sheets":["...","..."],"into":"..."}  // دمج أوراق بنفس الأعمدة تقريباً في ورقة واحدة
- {"op":"add_formula_column","sheet":"...","newColumn":"...","formula":"=A2*B2"}  // صيغة إكسل حقيقية، الصف الأول للبيانات مرجعاً؛ تُطبَّق نسبياً على كل صف
- {"op":"add_report_sheet","name":"...","rows":[["عنوان1","عنوان2"],["قيمة1","قيمة2"]]}  // تقرير/تحليل نصي كصفوف جاهزة
- {"op":"build_chart_of_accounts_from_trial_balance","sourceSheet":"...","newSheetName":"شجرة الحسابات"}

أعد الكائن بالشكل التالي فقط:
{"operations":[...],"summary":"جملة أو جملتان بالعربية تشرحان للمستخدم ماذا ستفعل الخطة"}

قواعد صارمة:
- لا تخترع اسم عمود أو ورقة غير موجود فعلاً في البيانات المرسلة إليك.
- إن كان الطلب "تحليل" أو "ماذا يوجد في الملف" بلا طلب تعديل فعلي، أعد operations فارغة و summary يحمل التحليل نصاً.
- إن تعذّر فهم الطلب أو كان غامضاً، أعد operations فارغة و summary يشرح لماذا.
- لا تُخرج أي نص أو شرح خارج كائن JSON نفسه.`;

function buildPlanUserPrompt(request, sheets) {
  const sheetsDesc = sheets.map((s) => ({
    name: s.name,
    headers: s.headers,
    sampleRows: s.rows.slice(0, 5),
    rowCount: s.rows.length,
  }));
  return `طلب المستخدم: "${request}"\n\nبنية الملف:\n${JSON.stringify(sheetsDesc, null, 2)}`;
}

/** يستدعي Gemini مباشرة (نفس مفتاح المساعد في الشات) لتوليد الخطة */
async function callGeminiForPlan(request, sheets) {
  const apiKey = await getGeminiKey();
  if (!apiKey) throw new Error("لا يوجد مفتاح Gemini API مُعد — أضفه من إدارة المستخدمين أولاً");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PLAN_SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: buildPlanUserPrompt(request, sheets) }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "خطأ من Gemini");
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("لم يصل رد من Gemini");

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const slice = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
  return JSON.parse(slice);
}

/** يرفض أي عملية بمفردات غير معروفة، أو تشير لعمود/ورقة غير موجودة فعلاً */
export function validatePlan(plan, sheets) {
  const sheetByName = new Map(sheets.map((s) => [s.name, s]));
  const valid = [];
  const rejected = [];

  for (const op of (plan?.operations || [])) {
    if (!op || !KNOWN_OPS.has(op.op)) { rejected.push({ op, reason: "عملية غير معروفة" }); continue; }

    if (op.op === "merge_sheets") {
      if (!Array.isArray(op.sheets) || op.sheets.some((s) => !sheetByName.has(s)) || !op.into) {
        rejected.push({ op, reason: "أوراق غير موجودة" }); continue;
      }
      valid.push(op); continue;
    }
    if (op.op === "add_report_sheet") {
      if (!op.name || !Array.isArray(op.rows)) { rejected.push({ op, reason: "بنية تقرير غير صحيحة" }); continue; }
      valid.push(op); continue;
    }

    const sheetKey = op.sheet || op.sourceSheet;
    const sheet = sheetByName.get(sheetKey);
    if (!sheet) { rejected.push({ op, reason: `الورقة "${sheetKey}" غير موجودة` }); continue; }

    if (["rename_column", "delete_column", "sort", "split_sheet", "add_formula_column"].includes(op.op)) {
      const col = op.from || op.column || op.byColumn || op.newColumn;
      const existingCol = op.op === "add_formula_column" ? op.newColumn : col;
      if (op.op !== "add_formula_column" && !sheet.headers.includes(col)) {
        rejected.push({ op, reason: `العمود "${col}" غير موجود في "${sheetKey}"` }); continue;
      }
    }
    if (op.op === "reorder_columns" && (!Array.isArray(op.order) || op.order.some((c) => !sheet.headers.includes(c)))) {
      rejected.push({ op, reason: "ترتيب أعمدة غير صحيح" }); continue;
    }
    if (op.op === "remove_duplicates" && op.keyColumns?.length && op.keyColumns.some((c) => !sheet.headers.includes(c))) {
      rejected.push({ op, reason: "عمود مفتاح غير موجود" }); continue;
    }

    valid.push(op);
  }

  return { operations: valid, rejected, summary: plan?.summary || "" };
}

export async function planWithAI(request, sheets) {
  const raw = await callGeminiForPlan(request, sheets);
  return validatePlan(raw, sheets);
}

// ═══════════════════════════════════════════════════════════════════════
// التنفيذ — دوال نقية بالكامل، قابلة للاختبار دون أي استدعاء شبكة
// ═══════════════════════════════════════════════════════════════════════
function getSheet(sheets, name) {
  return sheets.find((s) => s.name === name);
}

export function applyOperations(sheetsIn, operations) {
  // نسخة عميقة كافية (مصفوفات وكائنات مسطّحة فقط) كي لا نُعدِّل مدخلات الاستدعاء
  let sheets = sheetsIn.map((s) => ({ name: s.name, headers: [...s.headers], rows: s.rows.map((r) => ({ ...r })) }));
  const notes = [];

  for (const op of operations) {
    // [إصلاح] getSheet تُعيد undefined لو سمّى الموديل ورقةً غير موجودة (يحدث فعليًا:
    // اسم ورقة مترجَم أو بمسافة زائدة)، ثم يرمي s.headers خطأ TypeError يُفشِل
    // التحويل كاملاً برسالة غامضة بلا أي ناتج. نتخطى العملية ونُسجّل ملاحظة صريحة
    // بدل الانهيار — نفس نمط التسامح المطبَّق أصلاً بباقي خطوات المحرك.
    if (op && typeof op.sheet === "string" && !getSheet(sheets, op.sheet)) {
      notes.push(`تم تخطي عملية "${op.op}" — لا توجد ورقة باسم "${op.sheet}" في الملف.`);
      continue;
    }
    switch (op.op) {
      case "rename_column": {
        const s = getSheet(sheets, op.sheet);
        s.headers = s.headers.map((h) => (h === op.from ? op.to : h));
        s.rows.forEach((r) => { if (op.from in r) { r[op.to] = r[op.from]; delete r[op.from]; } });
        break;
      }
      case "delete_column": {
        const s = getSheet(sheets, op.sheet);
        s.headers = s.headers.filter((h) => h !== op.column);
        s.rows.forEach((r) => { delete r[op.column]; });
        break;
      }
      case "reorder_columns": {
        const s = getSheet(sheets, op.sheet);
        const rest = s.headers.filter((h) => !op.order.includes(h));
        s.headers = [...op.order, ...rest];
        break;
      }
      case "remove_duplicates": {
        const s = getSheet(sheets, op.sheet);
        const keys = op.keyColumns?.length ? op.keyColumns : s.headers;
        const seen = new Set();
        const before = s.rows.length;
        s.rows = s.rows.filter((r) => {
          const sig = keys.map((k) => String(r[k] ?? "")).join("␟");
          if (seen.has(sig)) return false;
          seen.add(sig);
          return true;
        });
        notes.push(`إزالة التكرار في "${s.name}": حُذف ${before - s.rows.length} صف مكرَّر`);
        break;
      }
      case "remove_empty_rows": {
        const s = getSheet(sheets, op.sheet);
        const before = s.rows.length;
        s.rows = s.rows.filter((r) => s.headers.some((h) => String(r[h] ?? "").trim() !== ""));
        notes.push(`حُذف ${before - s.rows.length} صف فارغ من "${s.name}"`);
        break;
      }
      case "trim_whitespace": {
        const s = getSheet(sheets, op.sheet);
        const cols = op.columns?.length ? op.columns : s.headers;
        s.rows.forEach((r) => { cols.forEach((c) => { if (typeof r[c] === "string") r[c] = r[c].trim().replace(/\s+/g, " "); }); });
        break;
      }
      case "sort": {
        const s = getSheet(sheets, op.sheet);
        const dir = op.order === "desc" ? -1 : 1;
        s.rows.sort((a, b) => {
          const av = a[op.column], bv = b[op.column];
          const an = Number(av), bn = Number(bv);
          if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== "") return (an - bn) * dir;
          return String(av ?? "").localeCompare(String(bv ?? ""), "ar") * dir;
        });
        break;
      }
      case "split_sheet": {
        const s = getSheet(sheets, op.sheet);
        const groups = new Map();
        s.rows.forEach((r) => {
          const key = String(r[op.byColumn] ?? "بلا_قيمة");
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(r);
        });
        const newSheets = [...groups.entries()].map(([key, rows]) => ({
          name: `${s.name}_${key}`.slice(0, 31), headers: [...s.headers], rows,
        }));
        sheets = sheets.filter((sh) => sh !== s).concat(newSheets);
        notes.push(`قُسِّمت "${s.name}" إلى ${newSheets.length} ورقة حسب "${op.byColumn}"`);
        break;
      }
      case "merge_sheets": {
        const parts = op.sheets.map((n) => getSheet(sheets, n)).filter(Boolean);
        const headers = [...new Set(parts.flatMap((p) => p.headers))];
        const rows = parts.flatMap((p) => p.rows);
        sheets = sheets.filter((sh) => !op.sheets.includes(sh.name)).concat([{ name: op.into, headers, rows }]);
        notes.push(`دُمجت ${parts.length} أوراق في "${op.into}" (${rows.length} صف)`);
        break;
      }
      case "add_formula_column": {
        const s = getSheet(sheets, op.sheet);
        if (!s.headers.includes(op.newColumn)) s.headers.push(op.newColumn);
        s.rows.forEach((r) => { r[op.newColumn] = { __formulaTemplate: op.formula }; });
        break;
      }
      case "add_report_sheet": {
        const headers = op.rows[0] || [];
        const rows = op.rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
        sheets.push({ name: op.name.slice(0, 31), headers, rows });
        break;
      }
      case "build_chart_of_accounts_from_trial_balance": {
        const s = getSheet(sheets, op.sourceSheet);
        const built = buildChartFromTrialBalance(s);
        sheets.push({ name: (op.newSheetName || "شجرة الحسابات").slice(0, 31), headers: built.headers, rows: built.rows });
        notes.push(`بُنيت شجرة حسابات بـ ${built.rows.length} حساب من "${s.name}"`);
        break;
      }
      default: break;
    }
  }

  return { sheets, notes };
}

/**
 * يبني شجرة حسابات مبسَّطة من ميزان مراجعة: يحزر عمودَي الكود والاسم بأسماء
 * شائعة، ثم يستنتج الأب/الفرع بمطابقة أقصر بادئة رقمية موجودة فعلاً ضمن نفس
 * مجموعة الأكواد (يعيد استخدام نفس منطق buildParentInfo المُثبَت في أداة
 * استيراد القيود، فلا يُعاد اختراعه هنا).
 */
export function buildChartFromTrialBalance(sheet) {
  const codeKey = sheet.headers.find((h) => /كود|رمز|code/i.test(h)) || sheet.headers[0];
  const nameKey = sheet.headers.find((h) => /اسم|بيان|name/i.test(h)) || sheet.headers[1] || sheet.headers[0];

  const accounts = sheet.rows
    .map((r) => ({ code: String(r[codeKey] ?? "").trim(), name: String(r[nameKey] ?? "").trim(), parentCode: "" }))
    .filter((a) => a.code);

  const { parentCodes, childrenByParent } = buildParentInfo(accounts);
  const parentOf = new Map();
  Object.entries(childrenByParent).forEach(([parent, kids]) => kids.forEach((k) => parentOf.set(k.code, parent)));

  const levelOf = (code, seen = new Set()) => {
    if (seen.has(code)) return 0; // حماية من حلقة دائرية بالخطأ
    const p = parentOf.get(code);
    if (!p || p === code) return parentCodes.has(code) ? 1 : 1;
    return 1 + levelOf(p, new Set(seen).add(code));
  };

  const rows = accounts
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }))
    .map((a) => ({
      "الكود": a.code,
      "الاسم": a.name,
      "الحساب الأب": parentOf.get(a.code) || "",
      "المستوى": levelOf(a.code),
      "نوع الحساب": parentCodes.has(a.code) ? "رئيسي" : "فرعي",
    }));

  return { headers: ["الكود", "الاسم", "الحساب الأب", "المستوى", "نوع الحساب"], rows };
}

// ═══════════════════════════════════════════════════════════════════════
// الكتابة — تمثيل عام إلى ملف .xlsx فعلي (Blob)
// ═══════════════════════════════════════════════════════════════════════
export async function buildWorkbookBlob(sheets) {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31) || "Sheet");
    ws.addRow(s.headers);
    ws.getRow(1).font = { bold: true };
    for (const r of s.rows) {
      const targetRow = ws.rowCount + 1; // الصف الذي ستُكتَب فيه هذه القيم فعلياً
      const rowValues = s.headers.map((h) => {
        const v = r[h];
        if (v && typeof v === "object" && "__formulaTemplate" in v) {
          // الصيغة نموذج يشير إلى الصف 2 (أول صف بيانات) كمرجع — كل إشارة خلية
          // بالشكل حرف(أحرف)+2 تُستبدَل برقم الصف الفعلي، لا أول "2" يصادفه النص فقط
          const adjusted = v.__formulaTemplate.replace(/([A-Za-z]+)2\b/g, (_, col) => `${col}${targetRow}`);
          return { formula: adjusted };
        }
        return v ?? "";
      });
      ws.addRow(rowValues);
    }
    ws.columns.forEach((c) => { c.width = 18; });
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ═══════════════════════════════════════════════════════════════════════
// التنسيق الكامل — يُستدعى من الشات
// ═══════════════════════════════════════════════════════════════════════
/**
 * @param {File} file الملف المرفَق في الشات
 * @param {string} request طلب المستخدم بالنص الحر
 * @returns {{ blob:Blob, filename:string, summary:string, notes:string[], rejected:object[] }}
 */
export async function runAIExcelWorkflow(file, request) {
  const { sheets } = await parseWorkbookGeneric(file);
  if (!sheets.length) throw new Error("تعذّرت قراءة الملف — تأكد أنه Excel أو CSV صالح");

  const plan = await planWithAI(request, sheets);
  const { sheets: outSheets, notes } = applyOperations(sheets, plan.operations);
  const blob = await buildWorkbookBlob(outSheets);

  const base = (file.name || "output").replace(/\.[^.]+$/, "");
  const filename = `${base}_معدَّل_${Date.now()}.xlsx`;

  return { blob, filename, summary: plan.summary, notes, rejected: plan.rejected, appliedCount: plan.operations.length };
}
