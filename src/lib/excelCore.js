import * as XLSX from "xlsx";

// ---------- low-level helpers ----------
export function normalizeDateGuess(raw) {
  if (raw === null || raw === undefined || raw === "") return "";
  const s = String(raw).trim();
  const twoDigit = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (twoDigit) {
    // [إصلاح] هذا المسار كان يُعيد النص كما هو لأنه مطابق شكليًا لـdd/mm/yyyy، لكن
    // "12/25/2025" (M/D/YYYY من تصدير إنجليزي) مطابق للشكل أيضًا وشهره 25! فيمر
    // حتى فحص التاريخ ويُصدَّر تاريخ مستحيل. لو الجزء الثاني > 12 فهو اليوم قطعًا.
    const d1 = Number(twoDigit[1]), d2 = Number(twoDigit[2]);
    if (d2 > 12 && d1 <= 12) return `${twoDigit[2]}/${twoDigit[1]}/${twoDigit[3]}`;
    return s;
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[1]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    // [إصلاح] نفس قاعدة الغموض المطبَّقة أدناه للسنة برقمين، كانت غائبة هنا للسنة
    // بأربعة أرقام: لو الجزء الثاني > 12 فهو اليوم قطعًا (لا يوجد شهر 13+)، أي أن
    // الملف بصيغة M/D/YYYY لا dd/mm/yyyy، فيجب تبديلهما. بلا هذا التبديل كان
    // "12/25/2025" يُمرَّر حرفيًا كما هو (شهر 25!) ويعبر فحص صيغة التاريخ لأنه
    // مطابق للشكل dd/mm/yyyy شكليًا، فيُصدَّر تاريخ مستحيل ترفضه قيود عند الرفع.
    // لو كلاهما ≤ 12 (غموض حقيقي مثل "3/4/2025") يبقى الافتراض dd/mm كما كان
    // تمامًا — لا تغيير في أي حالة تعمل حاليًا بشكل صحيح.
    const first = Number(m[1]), second = Number(m[2]);
    if (second > 12 && first <= 12) return `${m[2].padStart(2, "0")}/${m[1].padStart(2, "0")}/${m[3]}`;
    return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`;
  }
  /*
   * [إصلاح] خطأ حقيقي شاهده المستخدم: ملف عميل حقيقي (344655 قيود.xls) تُخرِج
   * فيه SheetJS التاريخ بصيغة "M/D/YY" حرفيًا (شهر/يوم/سنة برقمين، مثال:
   * "10/31/25" لتاريخ 31 أكتوبر 2025) — هذه الصيغة لم تكن مغطاة إطلاقًا (لا
   * تطابق dd/mm/yyyy ولا d/m/yyyy بأربعة أرقام أعلاه)، فتُترَك كما هي حرفيًا
   * وتفشل بعدها بصمت بفحص "تاريخ القيد مفقود أو غير مطابق لصيغة dd/mm/yyyy"
   * رغم أن التاريخ الحقيقي صحيح وموجود بالملف. القاعدة: لو أحد الرقمين > 12
   * فهو اليوم قطعًا (لا يوجد شهر 13+) بغض النظر عن ترتيبه، فتُستخدَم القيمة
   * الأخرى شهرًا تلقائيًا؛ لو كلاهما ≤ 12 (غموض حقيقي، مثال "05/06/25") يُفترض
   * ترتيب شهر/يوم (M/D) المطابق للتهيئة القصيرة الإنجليزية الافتراضية
   * بExcel/SheetJS التي تُنتج هذه الصيغة أصلًا. السنة برقمين: 00-69 ← 2000-2069،
   * 70-99 ← 1970-1999 (نفس قاعدة Excel القياسية بالتعامل مع سنة رقمين).
   */
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), yy = Number(m[3]);
    const year = yy < 70 ? 2000 + yy : 1900 + yy;
    let month = a, day = b;
    if (a > 12 && b <= 12) { month = b; day = a; }
    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  }
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000 && Number(s) < 80000) {
    const d = XLSX.SSF.parse_date_code(Number(s));
    if (d) return `${String(d.d).padStart(2, "0")}/${String(d.m).padStart(2, "0")}/${d.y}`;
  }
  return s;
}

export function normalizeCode(raw) {
  if (raw === null || raw === undefined || raw === "") return "";
  if (typeof raw === "number") return String(raw);
  let s = String(raw).trim();
  // [إصلاح] readWorkbookRows تقرأ بـraw:false، أي أن SheetJS يعيد نص الخلية
  // *المنسَّق* لا قيمتها الخام — فرمز حساب رقمي بخلية تنسيقها "#,##0" يصل
  // كنص "110,101" ورمز بتنسيق "0.00" يصل "110101.00". شجرة الحسابات عادةً
  // نصية فتصل "110101"، فيفشل التطابق ويُرفَع خطأ "رمز الحساب غير موجود في
  // شجرة الحسابات" على أرقام موجودة فعلًا بالشجرة. نحذف فاصل الآلاف والكسر
  // العشري الصفري فقط (لا نلمس الأرقام الهرمية المنقوطة مثل "1.10").
  s = s.replace(/[,\u066C]/g, "");
  s = s.replace(/^(\d+)\.0+$/, "$1");
  return s;
}

export function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return raw;
  let s = String(raw).replace(/[,\u066C\s\u00A0]/g, "").trim();
  if (s === "" || s === "-") return null;
  // [إصلاح] صيغتا السالب الشائعتان بتصدير الأنظمة المحاسبية لم تكونا مغطاتين:
  // إشارة السالب اللاحقة "1000-" كانت تُقرأ 1000 موجَبًا (parseFloat يتوقف عند
  // الإشارة فيفقدها) — خطأ جوهري بالاتجاه يمر بفحص التوازن بصمت؛ والقيمة بين
  // قوسين "(1,000)" كانت تُقرأ null أي "لا توجد قيمة" فيختل القيد بلا سبب واضح.
  let negative = false;
  const parenthesised = s.match(/^\((.+)\)$/);
  if (parenthesised) { negative = true; s = parenthesised[1]; }
  if (/-$/.test(s)) { negative = true; s = s.replace(/-+$/, ""); }
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); }
  if (s === "") return null;
  // نرفض أي بقايا غير رقمية بدل قبول بادئة رقمية فقط (parseFloat يقبل "12abc")
  if (!/^\d*(\.\d+)?$/.test(s) || s === ".") return null;
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return negative ? -n : n;
}

function cellText(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

// Reads an uploaded file into a plain array-of-arrays (1 row = 1 array, 0-indexed columns).
// Uses SheetJS rather than ExcelJS here: real-world exports (e.g. some accounting-system
// reports) sometimes use non-default XML namespace prefixes in workbook.xml, which ExcelJS's
// parser fails on (throws "Cannot read properties of undefined (reading 'sheets')") but SheetJS
// handles fine. ExcelJS is used later only for writing the final file (see excelExport.js),
// where we control the source template and don't hit this issue.
// Some exported files declare a stale/wrong '!ref' range (e.g. claiming only column A is used
// when columns B-E actually contain real data) — SheetJS's sheet_to_json trusts that declared
// range and silently truncates anything outside it. Recomputing the range from the real cell
// addresses present in the sheet avoids this silent data loss.
export function fixWorksheetRange(ws) {
  // ورقة "dense" (خيار XLSX.read({dense:true}) — أسرع بمرتين تقريباً على ملفات كبيرة
  // جداً، مستخدَم في readWorkbookRows أدناه فقط) تُمثِّل كل صف كمصفوفة ws[r] مباشرة
  // بدل مفتاح "A1" مستقل لكل خلية — decode_cell("0") غير صالح إطلاقاً هنا، فنحسب
  // الحدود من فهارس الصفوف/الأعمدة الفعلية مباشرة بدل فك أي عنوان. الاستدعاءات
  // الأخرى لهذه الدالة (AccountsTool.jsx) لا تستخدم dense إطلاقاً فتبقى بالمسار
  // المتفرّق الأصلي بلا أي تغيير في السلوك.
  if (Array.isArray(ws[0])) {
    let maxRow = -1;
    let maxCol = -1;
    let hasAny = false;
    Object.keys(ws).forEach((k) => {
      if (!/^\d+$/.test(k)) return;
      const rowArr = ws[k];
      if (!Array.isArray(rowArr)) return;
      const r = Number(k);
      if (r > maxRow) maxRow = r;
      rowArr.forEach((cell, c) => {
        if (cell !== undefined && cell !== null) {
          hasAny = true;
          if (c > maxCol) maxCol = c;
        }
      });
    });
    if (hasAny) {
      ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
    }
    return ws;
  }

  let maxRow = 0;
  let maxCol = 0;
  let hasAny = false;
  Object.keys(ws).forEach((addr) => {
    if (addr[0] === "!") return;
    const cell = XLSX.utils.decode_cell(addr);
    hasAny = true;
    if (cell.r > maxRow) maxRow = cell.r;
    if (cell.c > maxCol) maxCol = cell.c;
  });
  if (hasAny) {
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
  }
  return ws;
}

export async function readWorkbookRows(file) {
  const buf = await file.arrayBuffer();
  // dense:true — أسرع بمرتين تقريباً على ملفات ضخمة حقيقية (قيست: ~6.8 ثانية بدلاً من
  // ~13 ثانية على ملف قيود حقيقي 157,027 صفاً) بلا أي تغيير بشكل المخرجات من
  // sheet_to_json — fixWorksheetRange أعلاه متوافقة مع الشكلين (dense والمتفرّق).
  const wb = XLSX.read(buf, { type: "array", dense: true });
  const allRows = [];
  for (const sheetName of wb.SheetNames) {
    const ws = fixWorksheetRange(wb.Sheets[sheetName]);
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
    if (rows.length > 0) {
      if (allRows.length > 0) {
        const lastRow = allRows[allRows.length - 1];
        const isEmpty = lastRow.every((c) => !c || String(c).trim() === "");
        if (!isEmpty) allRows.push([]);
      }
      // ملاحظة: لا نستخدم allRows.push(...rows) — لو تجاوز عدد صفوف الملف حد عدد
      // المعطيات المسموح بها لأي نداء دالة واحد في V8 (~65,000+، يختلف حسب الحالة)
      // يرمي "Maximum call stack size exceeded" فعليًا مع ملفات قيود كبيرة حقيقية
      // (شوهد هذا الخطأ بالضبط مع ملف عميل حقيقي بعشرات آلاف الصفوف). حلقة .push
      // بسيطة تتجنب هذا الحد نهائيًا مهما كان عدد الصفوف.
      for (let i = 0; i < rows.length; i++) allRows.push(rows[i]);
    }
  }
  return allRows;
}

// Splits a line of extracted text (PDF/docx) into pseudo-columns on runs of 2+ spaces or a tab —
// this is how columnar layouts usually come out once you strip visual table borders, so the
// same header-keyword column mapping used for spreadsheets can also work on these.
function lineToRow(line) {
  return line.split(/\t|\s{2,}/).map((c) => c.trim()).filter((c) => c !== "");
}

export async function readAnyEntriesFileRows(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return readWorkbookRows(file);
  }
  if (name.endsWith(".pdf")) {
    const pdfjsLib = await import("pdfjs-dist");
    const pdfjsWorker = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      let currentLine = "";
      let lastY = null;
      content.items.forEach((item) => {
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          if (currentLine.trim()) lines.push(currentLine);
          currentLine = "";
        }
        currentLine += item.str + "  ";
        lastY = y;
      });
      if (currentLine.trim()) lines.push(currentLine);
    }
    return lines.map(lineToRow).filter((r) => r.length > 0);
  }
  if (name.endsWith(".docx")) {
    const mammoth = (await import("mammoth")).default;
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value.split(/\r?\n/).map(lineToRow).filter((r) => r.length > 0);
  }
  throw new Error("صيغة الملف غير مدعومة. الصيغ المدعومة: Excel (.xlsx)، PDF، أو Word (.docx)");
}

// ---------- AI semantic review (journal entries) ----------
export function buildChartText(chartAccounts, parentCodes) {
  return chartAccounts
    .map((a) => {
      const flag = parentCodes.has(a.code) ? " | [حساب رئيسي - غير قابل للترحيل المباشر]" : "";
      return `${a.code} | ${a.name} | نوع: ${a.type}${a.parentCode ? " | تابع لـ: " + a.parentCode : ""}${flag}`;
    })
    .join("\n");
}

export function buildEntriesPromptText(entries) {
  return entries
    .map((e) => {
      const rowsText = e.rows
        .map((r, i) => `  سطر ${i}: رمز=${r.code || "فارغ"} مدين=${r.debit ?? ""} دائن=${r.credit ?? ""} تعليق=${r.comment || ""}`)
        .join("\n");
      return `قيد رقم ${e.seq} — التاريخ: ${e.date || ""} — الوصف: ${e.desc || ""}\n${rowsText}`;
    })
    .join("\n\n");
}

export function buildSemanticsPrompt(entriesBatch, chartAccounts, parentCodes) {
  return `أنت محاسب خبير بنظام "قيود" (Qoyod) تراجع قيود يومية مقابل شجرة حسابات عميل معيّن.
مهمتك: افحص كل سطر في كل قيد، وحدد إن كان رمز الحساب المستخدم يتوافق منطقياً مع وصف القيد وطبيعة العملية — حتى لو كان الرمز موجوداً فعلياً في الشجرة.
مهم جداً: الحسابات المعلّمة بـ "[حساب رئيسي - غير قابل للترحيل المباشر]" ممنوع نهائياً اقتراحها كبديل.
إن لم تجد بديلاً مناسباً بثقة، لا تقترح شيئاً واترك hasIssue بقيمة true مع suggestedCode فارغ.
لا تُبلغ عن الأخطاء الهيكلية (رمز غير موجود، عدم توازن، ترحيل على حساب رئيسي) فهذه تُفحص برمجياً بشكل منفصل.

شجرة الحسابات (رمز | اسم | نوع):
${buildChartText(chartAccounts, parentCodes)}

القيود المطلوب مراجعتها (رقم السطر يبدأ من صفر داخل كل قيد):
${buildEntriesPromptText(entriesBatch)}

أجب بصيغة JSON فقط بدون أي نص أو Markdown إضافي، وفق الشكل التالي بالضبط (مصفوفة فارغة إن لم تجد أي مشكلة):
[{"seq": "1", "rowIndex": 0, "hasIssue": true, "currentCode": "110103", "suggestedCode": "110402", "suggestedName": "إيجار مقدم", "reason": "سبب موجز بالعربي"}]`;
}

function findHeaderRowIndex(rows, ...mustIncludeCandidates) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const rowTexts = row.map((c) => cellText(c).trim().toLowerCase());
    const hasMatch = mustIncludeCandidates.some((candidate) =>
      rowTexts.some((t) => t.includes(candidate.toLowerCase()))
    );
    if (hasMatch) return i;
  }
  return -1;
}

/*
 * [إصلاح جذري] خطأ حقيقي شاهده المستخدم: ملف عميل رأسه القصير المعتاد
 * "الحساب" | "تاريخ" | "الوصف" (بدل "رمز الحساب" | "التاريخ" | "وصف القيد"
 * المتوقعة بقوائم المرادفات) — فقرأ المدين والدائن بشكل صحيح (تطابق حرفي) لكن
 * الرمز والتاريخ والوصف طلعوا فارغين تمامًا بصمت لكل القيود. السبب: المطابقة
 * كانت اتجاه واحد فقط (خلية_الرأس.includes(المرشح)) فتفشل بالضبط لما يكون
 * عنوان عمود الملف الحقيقي أقصر من اسم المرشح المتوقع ("تاريخ" لا يحوي
 * "التاريخ" كسلسلة فرعية لاختلاف "ال" بالبداية، وبالمثل "الحساب" لا يحوي "رمز
 * الحساب"، و"الوصف" لا يحوي "وصف القيد"). هذا نفس نمط الخطأ الذي شهده
 * المستخدم سابقًا مع "تسلسل القيد"/"البيان" (انظر اختبارات excelCore.test.js)
 * — لكن ذلك الإصلاح أضاف مرادفًا واحدًا يدويًا في كل مرة (حل ترقيعي)، بينما
 * هذا الإصلاح يعالج السبب الجذري: المطابقة الآن باتجاهين (كل طرف يُقبل لو
 * كان سلسلة فرعية من الآخر)، فتُغطّى تلقائيًا كل الصيغ الأقصر/الأطول لنفس اسم
 * العمود بلا حاجة لسرد كل احتمال بقائمة المرادفات يدويًا. القيد الوحيد: خلية
 * رأس بحرف أو حرفين فقط (نادرة الحدوث كاسم عمود حقيقي) لا تُفعِّل اتجاه
 * "المرشح يحوي الخلية" تجنبًا لتطابقات زائفة عشوائية مع اختصارات قصيرة جدًا.
 */
function colIndex(headerRow, ...candidates) {
  for (const cand of candidates) {
    const candNorm = cellText(cand).trim();
    if (!candNorm) continue;
    const idx = headerRow.findIndex((h) => {
      const cellNorm = cellText(h).trim();
      if (!cellNorm) return false;
      if (cellNorm.includes(candNorm)) return true;
      if (cellNorm.length >= 2 && candNorm.includes(cellNorm)) return true;
      return false;
    });
    if (idx !== -1) return idx;
  }
  return -1;
}

// أفضل تخمين لصف الرأس عندما تفشل كل مخططات التعرّف المتخصصة (لا رأس معروف
// مطابق) — الصف الأكثر خلايا غير فارغة ضمن أول ~20 صفًا، تُستخدَم كنقطة بداية
// معقولة للوحة "تحديد الأعمدة يدويًا" بدل ترك المستخدم يختار من صفر.
export function guessHeaderRowIndex(rows) {
  let best = 0, bestCount = -1;
  const scan = Math.min(rows.length, 20);
  for (let i = 0; i < scan; i++) {
    const r = rows[i] || [];
    const count = (Array.isArray(r) ? r : []).filter((c) => cellText(c).trim() !== "").length;
    if (count > bestCount) { bestCount = count; best = i; }
  }
  return best;
}

// تخمين شامل لكل أعمدة القيود دفعة واحدة (اتحاد كل مرادفات كل المخططات أعلاه)
// — يُستخدَم لتعبئة لوحة "تحديد الأعمدة يدويًا" بقيم افتراضية معقولة، سواء
// نجح parseEntriesFile تلقائيًا أو فشل. يُرجع فهارس أعمدة (أو -1) لا بيانات
// مُستخرَجة فعليًا.
export function guessEntriesColumnMapping(rows) {
  const headerRowIndex = guessHeaderRowIndex(rows);
  const header = (rows[headerRowIndex] || []).map(cellText);
  return {
    headerRowIndex,
    seq: colIndex(header, "تسلسل القيد", "تسلسل القيود", "تسلسل", "رقم القيد", "رقم القيود", "رقم العملية", "رقم السند", "رقم الدفتر", "رقم المستند", "VouchNumber", "VoucherNumber", "Reference"),
    date: colIndex(header, "تاريخ العملية", "التاريخ", "تاريخ", "Date", "VouchDate", "TransDate", "TransactionDate"),
    desc: colIndex(header, "وصف القيد", "البيان", "الوصف", "تعريف", "Description", "Narration", "VouchDescription"),
    code: colIndex(header, "رمز الحساب", "رقم الحساب", "الحساب", "رمز", "AccountNumber", "AccountCode", "account code", "acc_no"),
    name: colIndex(header, "اسم الحساب", "الحساب", "اسم", "AccountName", "Account Name"),
    debit: colIndex(header, "مدين", "Debit", "DBAmount", "DebitAmount", "DR"),
    credit: colIndex(header, "دائن", "Credit", "CRAmount", "CreditAmount", "CR"),
    comment: colIndex(header, "التعليقات", "ملاحظات", "ملاحظ", "Notes", "Remark"),
  };
}

// يبني القيود من صفوف خام باستخدام تخطيط أعمدة اختاره المستخدم يدويًا (لوحة
// "تحديد الأعمدة") — بديل عن الاكتشاف التلقائي (parseEntriesFile) حين يفشل أو
// حين يريد المستخدم فرض تخطيط معيّن بنفسه. `mapping` فهارس أعمدة صفرية
// الأساس (أو -1/undefined لعمود غير موجود بالملف). يعيد استخدام groupEntries
// نفسها تمامًا حتى يبقى سلوك التجميع (بما فيه صف بلا "تسلسل" = يُلحَق بالقيد
// الحالي، وصف فارغ = فاصل قيود) متطابقًا 100% مع بقية المخططات أعلاه.
export function parseEntriesFileWithMapping(rows, headerRowIndex, mapping) {
  const get = (key) => {
    const idx = mapping[key];
    return idx === undefined || idx === null || idx === -1 || idx === "" ? -1 : Number(idx);
  };
  const cSeq = get("seq"), cDate = get("date"), cDesc = get("desc"), cCode = get("code"),
    cName = get("name"), cDebit = get("debit"), cCredit = get("credit"), cComment = get("comment");
  const flat = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    flat.push({
      seq: cSeq !== -1 ? cellText(r[cSeq]).trim() : "",
      date: cDate !== -1 ? normalizeDateGuess(r[cDate]) : "",
      desc: cDesc !== -1 ? cellText(r[cDesc]).trim() : "",
      accType: "حسابات دفتر الاستاذ",
      code: cCode !== -1 ? normalizeCode(r[cCode]) : "",
      name: cName !== -1 ? cellText(r[cName]).trim() : "",
      contact: "",
      debit: cDebit !== -1 ? parseAmount(r[cDebit]) : null,
      credit: cCredit !== -1 ? parseAmount(r[cCredit]) : null,
      comment: cComment !== -1 ? cellText(r[cComment]).trim() : "",
    });
  }
  return groupEntries(flat);
}

// ---------- chart of accounts ----------
export function parseChartFile(rows) {
  const hIdx = findHeaderRowIndex(rows, "الرمز", "رقم الحساب", "رمز الحساب", "الرقم", "code", "account code", "account number");
  if (hIdx === -1) throw new Error("لم يتم العثور على عمود 'الرمز' في ملف شجرة الحسابات — تأكد من وجود عمود للرمز أو رقم الحساب");
  const header = rows[hIdx].map(cellText);
  const cCode = colIndex(header, "الرمز", "رقم الحساب", "رمز الحساب", "الرقم", "code", "account code", "account number", "رقم", "الرقمLEncoder");
  const cName = colIndex(header, "اسم الحساب", "الاسم", "الحساب", "name", "account name", "account_name", "اسم");
  const cType = colIndex(header, "النوع", "type", "account type", "نوع الحساب");
  const cDesc = colIndex(header, "الوصف", "description", "desc", "ملاحظات");
  const cParent = colIndex(header, "Parent", "الحساب الأب", "الأب", "الحساب الرئيسي", "الحساب الرئيسي", "parent", "parent code", "المستوى الأعلى");
  const cPay = colIndex(header, "الدفع والتحصيل", "يمكن الدفع", "pay", "collect");

  const accounts = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const code = normalizeCode(r[cCode]);
    if (!code) continue;
    accounts.push({
      code,
      name: cName !== -1 ? cellText(r[cName]).trim() : "",
      type: cType !== -1 ? cellText(r[cType]).trim() : "",
      description: cDesc !== -1 ? cellText(r[cDesc]).trim() : "",
      parentCode: cParent !== -1 ? cellText(r[cParent]).trim() : "",
      canPay: cPay !== -1 ? cellText(r[cPay]).trim() : "",
    });
  }
  return accounts;
}

// ---------- ملفات مرجعية اختيارية: أسماء العملاء/الموردين وأرقامهم المرجعية ----------
// اختيارية بالكامل — تُستخدَم فقط حين توجد قيود ترحّل على حساب "المدينون" أو
// "الدائنون" الافتراضي، حيث يتطلب قيود كتابة الرقم المرجعي للعميل/المورد (لا
// اسمه) بعمود "جهة اتصال/ضريبة/موظف". عمودان فقط: اسم + رقم مرجعي.
export function parseNameRefFile(rows) {
  const hIdx = findHeaderRowIndex(rows, "اسم العميل", "اسم المورد", "الاسم", "name", "الرقم المرجعي", "رقم مرجعي", "مرجعي", "reference");
  if (hIdx === -1) return [];
  const header = rows[hIdx].map(cellText);
  const cName = colIndex(header, "اسم العميل", "اسم المورد", "الاسم", "name");
  const cRef = colIndex(header, "الرقم المرجعي", "رقم مرجعي", "مرجعي", "reference", "ref");
  if (cName === -1 || cRef === -1) return [];
  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = cellText(r[cName]).trim();
    const ref = cellText(r[cRef]).trim();
    if (!name || !ref) continue;
    out.push({ name, ref });
  }
  return out;
}

export function extractParentCode(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";
  return s.split(/\s+/)[0].replace(/\.0$/, "");
}

export function buildParentInfo(chartAccounts) {
  const parentCodes = new Set();
  const childrenByParent = {};
  const knownCodes = new Set(chartAccounts.map((account) => account.code));
  chartAccounts.forEach((a) => {
    let pc = extractParentCode(a.parentCode);
    if (!pc) {
      for (let length = a.code.length - 1; length > 0; length -= 1) {
        const candidate = a.code.slice(0, length);
        if (knownCodes.has(candidate)) {
          pc = candidate;
          break;
        }
      }
    }
    if (!pc) return;
    parentCodes.add(pc);
    if (!childrenByParent[pc]) childrenByParent[pc] = [];
    childrenByParent[pc].push(a);
  });
  // [إصلاح جذري] كان هنا مرور إضافي يضيف *كل* حساب خانة الأب فيه فارغة إلى
  // parentCodes بحجة أنه "عنوان فئة". أثره الحقيقي كارثي: شجرة حسابات بلا عمود
  // "الحساب الأب" إطلاقًا (شائعة جدًا بملفات العملاء) تجعل كل حساباتها بلا
  // استثناء "حسابات رئيسية" غير قابلة للترحيل، فيرفع الفحص خطأ "لا يمكن الترحيل
  // على حساب رئيسي" على كل سطر بالملف وتصبح الأداة غير قابلة للاستخدام مع ذلك
  // الملف نهائيًا (وكذلك خانة اختيار الحساب تظهر فارغة تمامًا). وهو مرور زائد
  // أصلًا: أي حساب له أبناء فعليًا أضافته الحلقة أعلاه بالفعل (إما لأن ابنه يصرّح
  // بكوده كأب، أو لأنه يُشتق منه بالبادئة)، فبقي أثره الوحيد هو حجب الترحيل عن
  // حسابات بلا أب وبلا أبناء — وهي أوراق ترحيل سليمة بقيود.
  return { parentCodes, childrenByParent };
}

// يبحث في شجرة الحسابات المرفقة عن كود الحساب الذي اسمه (بعد التطبيع) يطابق
// تمامًا اسمًا معطى — لتحديد حساب افتراضي مقفل نظاميًا بقيود (مثل "المدينون"،
// "الدائنون"، أو "ضريبة القيمة المضافة المستحقة") عبر اسمه لا عبر كود ثابت،
// لأن كود هذه الحسابات نفسه يختلف من عميل لعميل حسب ترتيب إنشاء شجرته.
export function findAccountCodesByExactName(chartAccounts, targetName) {
  const target = normalizeAccountName(targetName);
  if (!target) return [];
  return (chartAccounts || [])
    .filter((a) => normalizeAccountName(a.name) === target)
    .map((a) => a.code);
}

export function normalizeAccountName(value) {
  return String(value || "").trim().toLowerCase()
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

export function accountNameSimilarity(left, right) {
  const a = normalizeAccountName(left);
  const b = normalizeAccountName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const aWords = new Set(a.split(" "));
  const bWords = new Set(b.split(" "));
  const intersection = [...aWords].filter((word) => bWords.has(word)).length;
  const wordScore = intersection / Math.max(aWords.size, bWords.size);
  const width = Math.max(a.length, b.length);
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = a[i - 1] === b[j - 1]
        ? diagonal
        : 1 + Math.min(previous[j], previous[j - 1], diagonal);
      diagonal = above;
    }
  }
  return Math.max(wordScore, 1 - previous[b.length] / width);
}

// [إصلاح جذري] المطابقة بالاسم الحرفي المطابق تمامًا (findAccountCodesByExactName)
// هشة أمام فروقات حقيقية بنص الاسم المعروض بشجرة حسابات كل عميل — شوهد فعليًا:
// حساب ضريبة القيمة المضافة المستحقة (كود 210201 بمثال عميل حقيقي) ظهر بملف
// الشجرة الحقيقي باسم مختصر لا يطابق حرفيًا الاسم النظامي الكامل المتوقَّع، فبقيت
// خانة "جهة اتصال/ضريبة/موظف" فارغة رغم أن الحساب موجود فعليًا بالشجرة بنفس الكود.
// الحل: تطابق حرفي أولاً (الأسرع والأدق)، وإن لم يوجد نطبّق نفس دالة التشابه
// الضبابي المستخدمة بالفعل باقتراحات الترحيل (accountNameSimilarity) بعتبة ثقة
// مرتفعة جدًا (0.85 فأعلى — تطابق كامل أو احتواء نص أحدهما بالآخر أساسًا) تكفي
// لتفادي مطابقة حساب مختلف تمامًا خطأً، وهي أساسية لحسابات النظام المقفلة هذه.
export function findSystemAccountCodes(chartAccounts, targetName) {
  const exact = findAccountCodesByExactName(chartAccounts, targetName);
  if (exact.length) return exact;
  const list = chartAccounts || [];
  const matches = list
    .map((a) => ({ code: a.code, score: accountNameSimilarity(targetName, a.name) }))
    .filter(({ score }) => score >= 0.85)
    .sort((x, y) => y.score - x.score);
  if (!matches.length) return [];
  // [إصلاح] كانت الدالة تُعيد *كل* المطابقات الضبابية ≥ 0.85، وبما أن احتواء نص
  // أحد الاسمين بالآخر يمنح 0.9 فإن حسابين مختلفين تمامًا يُصنَّفان معًا كنفس
  // حساب النظام: مثال حقيقي مؤكَّد — "ضريبة القيمة المضافة المستحقة على المبيعات"
  // (التزام) و"…على المشتريات" (أصل) كلاهما يطابق "ضريبة القيمة المضافة المستحقة"،
  // فيُكتَب رمز نوع الضريبة تلقائيًا بخانة الجهة لسطور ضريبة المشتريات أيضًا. نأخذ
  // الأفضل وحده، وعند تعادل الأفضل مع غيره لا نُرجّح شيئًا (تبقى الحالة "لم يُكتشف
  // تلقائيًا — اختره يدويًا" الموجودة أصلًا بالواجهة) بدل تخمين قد يكون خاطئًا.
  const best = matches[0].score;
  const top = matches.filter((m) => m.score === best);
  if (top.length > 1) return [];
  return [top[0].code];
}

export function getPostingSuggestions(code, accountName, chartAccounts, parentInfo, limit = 5) {
  const accounts = (chartAccounts || [])
    .filter((account) => !parentInfo.parentCodes.has(account.code))
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  if (!accounts.length) return [];
  const rawCode = normalizeCode(code);
  for (let end = rawCode.length - 1; end > 0; end -= 1) {
    const parentCode = rawCode.slice(0, end);
    const exactParent = (chartAccounts || []).find((account) => account.code === parentCode);
    if (!exactParent) continue;
    const children = getPostingDescendants(parentCode, accounts, parentInfo.childrenByParent);
    const prefixedPostingAccounts = accounts.filter((account) => account.code.startsWith(parentCode));
    const postingChildren = children.length ? children : prefixedPostingAccounts;
    if (postingChildren.length) {
      const rankedChildren = postingChildren
        .map((account) => ({ account, nameScore: accountNameSimilarity(accountName, account.name) }))
        .sort((left, right) => right.nameScore - left.nameScore || left.account.code.localeCompare(right.account.code, undefined, { numeric: true }));
      return rankedChildren.slice(0, limit).map(({ account, nameScore }, index) => ({
        ...account,
        confidence: index === 0 && nameScore >= 0.5 ? "high" : "medium",
        score: Math.max(0.75, nameScore),
      }));
    }
    if (accounts.some((account) => account.code === parentCode)) return [exactParent];
  }

  // [أداء] كانت مطابقة الأسماء تُحسَب مسبقًا قبل حلقة البادئة أعلاه ثم تُهمَل
  // كليًا في الحالة الشائعة (رمز مكتوب خطأً تُحَل بادئته لأب معروف فترجع الدالة
  // من داخل الحلقة). حسابها هنا فقط — عند الحاجة إليها فعلًا — يوفّر مرور
  // Levenshtein كامل على شجرة الحسابات لكل رمز مجهول: على ملف كبير حقيقي
  // (آلاف الرموز المجهولة × آلاف الحسابات) كان هذا وحده يجمّد الواجهة ثوانٍ
  // بكل دفعة تدقيق. لا تغيير في المخرجات إطلاقًا — نفس القيم بنفس الترتيب.
  const nameMatches = accounts
    .map((account) => ({ account, score: accountNameSimilarity(accountName, account.name) }))
    .filter(({ score }) => score >= 0.5)
    .sort((a, b) => b.score - a.score || a.account.code.localeCompare(b.account.code, undefined, { numeric: true }));
  if (nameMatches.length) return nameMatches.slice(0, limit).map(({ account, score }) => ({ ...account, confidence: score >= 0.8 ? "high" : "medium", score }));

  return accounts
    .map((account) => ({ account, distance: numericCodeDistance(rawCode, account.code) }))
    .sort((a, b) => a.distance - b.distance || a.account.code.localeCompare(b.account.code, undefined, { numeric: true }))
    .slice(0, limit)
    .map(({ account }) => account);
}

export function getPostingDescendants(parentCode, postingAccounts, childrenByParent) {
  const result = [];
  const postingCodes = new Set(postingAccounts.map((account) => account.code));
  const visit = (code) => {
    (childrenByParent[code] || []).forEach((child) => {
      if (postingCodes.has(child.code)) result.push(child);
      visit(child.code);
    });
  };
  visit(parentCode);
  return result;
}

function numericCodeDistance(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  const lengthPenalty = Math.abs(a.length - b.length) * 10;
  const width = Math.max(a.length, b.length);
  let differences = 0;
  for (let i = 0; i < width; i += 1) if (a[i] !== b[i]) differences += 1;
  return lengthPenalty + differences;
}

// ---------- تعبية تلقائية لعمود "جهة اتصال/ضريبة/موظف" ----------
// قاعدتان محاسبيتان صرفتان بنظام قيود، حسب أسماء الحسابات المرفقة (لا أكوادها
// الثابتة، لأنها تختلف من عميل لعميل):
//  1) أي سطر يُرحَّل على حساب اسمه "ضريبة القيمة المضافة المستحقة" بالضبط:
//     يُكتَب رمز ضريبة 15% إن كان للسطر قيمة (مدين أو دائن > 0)، أو رمز
//     الضريبة الصفرية إن كانت القيمتان صفراً معاً — الرمزان قابلان للتغيير من
//     المستخدم (افتراضياً "1" و"2"، وهما ثابتان نظامياً بقيود لكل منشأة جديدة).
//  2) أي سطر يُرحَّل على حساب "المدينون" أو "الدائنون" الافتراضي: يجب أن يحمل
//     رقم العميل/المورد المرجعي لا اسمه — نحاول إيجاده تلقائياً من ملف مرجعي
//     اختياري (اسم + رقم مرجعي) بمطابقة الاسم مع ما هو متاح بالسطر (عمود جهة
//     اتصال، أو التفصيل/التعليق كبديل).
// السطور التي عدّلها المستخدم يدويًا بنفسه (_userEdited) لا تُلمَس إطلاقًا.
export const VAT_PAYABLE_ACCOUNT_NAME = "ضريبة القيمة المضافة المستحقة";
export const DEBTORS_ACCOUNT_NAME = "المدينون";
export const CREDITORS_ACCOUNT_NAME = "الدائنون";

export function applyAutoContactRules(entries, chartAccounts, options = {}) {
  if (!entries || !chartAccounts) return entries;
  const vat15Code = String(options.vat15Code ?? "1").trim() || "1";
  const vatZeroCode = String(options.vatZeroCode ?? "2").trim() || "2";
  const customersRef = options.customersRef || [];
  const suppliersRef = options.suppliersRef || [];

  // [ميزة جديدة] تحديد يدوي اختياري لأي من الحسابات الثلاثة (من قائمة حسابات
  // الشجرة المرفوعة) يتجاوز الاكتشاف التلقائي بالاسم عندما يُحدَّد صراحةً —
  // يبقى الاكتشاف التلقائي يعمل كاملاً بلا أي تغيير حين لا يُحدَّد المستخدم شيئاً.
  const manualVat = normalizeCode(options.vatAccountCode || "");
  const manualDebtors = normalizeCode(options.debtorsAccountCode || "");
  const manualCreditors = normalizeCode(options.creditorsAccountCode || "");

  const vatCodes = new Set(manualVat ? [manualVat] : findSystemAccountCodes(chartAccounts, VAT_PAYABLE_ACCOUNT_NAME));
  const debtorsCodes = new Set(manualDebtors ? [manualDebtors] : findSystemAccountCodes(chartAccounts, DEBTORS_ACCOUNT_NAME));
  const creditorsCodes = new Set(manualCreditors ? [manualCreditors] : findSystemAccountCodes(chartAccounts, CREDITORS_ACCOUNT_NAME));
  if (!vatCodes.size && !debtorsCodes.size && !creditorsCodes.size) return entries;

  const resolveRef = (candidateName, refList) => {
    const name = String(candidateName || "").trim();
    if (!name || !refList.length) return null;
    let best = null;
    for (const item of refList) {
      const score = accountNameSimilarity(name, item.name);
      if (score >= 0.6 && (!best || score > best.score)) best = { ...item, score };
    }
    return best;
  };

  let changed = false;
  const nextEntries = entries.map((entry) => {
    let entryChanged = false;
    const nextRows = entry.rows.map((row) => {
      if (row._userEdited) return row;

      if (vatCodes.has(row.code)) {
        const hasAmount = (Number(row.debit) || 0) > 0 || (Number(row.credit) || 0) > 0;
        const nextContact = hasAmount ? vat15Code : vatZeroCode;
        if (row.contact === nextContact && row._autoRef) return row;
        entryChanged = true;
        return { ...row, contact: nextContact, _autoRef: true };
      }

      const isDebtors = debtorsCodes.has(row.code);
      const isCreditors = creditorsCodes.has(row.code);
      if (isDebtors || isCreditors) {
        // نتذكّر اسم العميل/المورد الأصلي (_refCandidate) حتى بعد استبدال
        // contact برقمه المرجعي، لأن المطابقة اللاحقة (لو تغيّر الملف المرجعي)
        // يجب أن تظل تبحث بالاسم لا بالرقم المرجعي المكتوب حاليًا.
        const candidateName = row._autoRef ? (row._refCandidate ?? row.contact) : (row.contact || row.comment || "");
        const match = resolveRef(candidateName, isDebtors ? customersRef : suppliersRef);
        if (!match) return row;
        if (row.contact === match.ref && row._autoRef) return row;
        entryChanged = true;
        return { ...row, contact: match.ref, _autoRef: true, _refCandidate: candidateName };
      }

      // [إصلاح] سطر عُبِّي تلقائياً سابقاً (_autoRef) بإحدى القواعد أعلاه، ثم لم
      // يعد كود حسابه يقع ضمن أي من مجموعات الضريبة/المدينون/الدائنون الحالية —
      // مثال حقيقي: المستخدم غيّر التحديد اليدوي لحساب الضريبة/المدينون/الدائنون
      // من هذا الحساب لحساب آخر. القيمة القديمة لم تعد صحيحة تحت الإعداد الحالي
      // إطلاقاً، فيجب تفريغها فوراً لا تركها كأنها ما زالت سارية (خطأ تصنيف حقيقي).
      if (row._autoRef) {
        entryChanged = true;
        const cleared = { ...row, contact: "", _autoRef: false };
        delete cleared._refCandidate;
        return cleared;
      }

      return row;
    });
    if (!entryChanged) return entry;
    changed = true;
    return { ...entry, rows: nextRows };
  });
  return changed ? nextEntries : entries;
}

// ---------- journal entries: two supported input schemas ----------
// [إصلاح] خطأ حقيقي شاهده المستخدم: عمود "نوع الحساب" بملف التصدير النهائي طلع
// فيه رمز الحساب مكررًا (نفس قيمة عمود "رمز الحساب") بدل أحد القيم الثلاث
// المسموحة بقائمة قيود المنسدلة. السبب: Schema A (ملفات مصدرها بالفعل قالب
// الاستيراد أو شبيه به) تقرأ "نوع الحساب" حرفيًا من أي عمود بالملف المصدر
// يطابق هذا الاسم — فلو كان ذلك العمود بالملف المصدر (لأي سبب: تسمية عرضية
// متطابقة، أو تصدير غريب من نظام آخر) لا يحمل فعليًا أحد القيم الثلاث
// الصحيحة، يُمرَّر محتواه كما هو بلا أي تحقق فيفسد قالب الاستيراد. الإصلاح:
// نتحقق أن القيمة المستخرجة إحدى القيم الثلاث المعروفة فقط، وإلا نُرجع القيمة
// الافتراضية الآمنة "حسابات دفتر الاستاذ" (وهي الحالة الشائعة الساحقة لقيود
// اليومية العادية) — بدل تمرير أي نص غريب كما هو.
const ACCOUNT_TYPE_VALUES = ["حسابات دفتر الاستاذ", "دفعة من العميل", "دفعة للمورد"];
function normalizeAccType(raw) {
  const v = cellText(raw).trim();
  return ACCOUNT_TYPE_VALUES.includes(v) ? v : "حسابات دفتر الاستاذ";
}

function parseTemplateSchema(rows, hIdx) {
  const header = rows[hIdx].map(cellText);
  // خطأ جوهري حقيقي شهده المستخدم: هذا العمود كان يُتعرَّف عليه فقط باسم "تسلسل القيد"
  // — بينما findHeaderRowIndex أعلاه (الذي يختار هذا المخطط أصلاً) يقبل أيضًا "رقم
  // القيد"/"تسلسل"/"رقم التسلسل" كمرشحات صالحة لاختيار المخطط A، فيختاره لملف حقيقي
  // بعشرات آلاف الصفوف عنوانه "رقم القيد" لا "تسلسل القيد"، فيفشل استخراج cSeq (يبقى
  // -1) بصمت، فتُقرأ كل الصفوف بلا رقم قيد إطلاقًا، فيُجمَّع الملف كامله في قيد واحد
  // (بدل آلاف القيود المنفصلة الصحيحة) — بلا أي خطأ ظاهر يُنبّه المستخدم. توسيع قائمة
  // المرادفات هنا لتطابق ما يقبله findHeaderRowIndex بالضبط يحل المشكلة عند جذرها.
  const cSeq = colIndex(header, "تسلسل القيد", "تسلسل", "رقم التسلسل", "رقم القيد");
  const cDate = colIndex(header, "التاريخ");
  // نفس خطأ cSeq أعلاه بالضبط: "البيان" اسم شائع جداً لعمود الوصف بأنظمة محاسبية
  // كثيرة (وهو اسم عمود الوصف الحقيقي بالملف الذي شهد الخطأ) ولم يكن مُتعرَّفاً عليه.
  const cDesc = colIndex(header, "وصف القيد", "البيان", "الوصف");
  const cAccType = colIndex(header, "نوع الحساب");
  const cCode = colIndex(header, "رمز الحساب");
  const cName = colIndex(header, "اسم الحساب", "اسم", "AccountName", "Account Name");
  const cContact = colIndex(header, "جهة اتصال");
  const cDebit = colIndex(header, "مدين");
  const cCredit = colIndex(header, "دائن");
  const cComment = colIndex(header, "التعليقات");

  const flat = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    flat.push({
      seq: cellText(r[cSeq]).trim(),
      date: cDate !== -1 ? normalizeDateGuess(r[cDate]) : "",
      desc: cDesc !== -1 ? cellText(r[cDesc]).trim() : "",
      accType: cAccType !== -1 ? normalizeAccType(r[cAccType]) : "حسابات دفتر الاستاذ",
      code: cCode !== -1 ? normalizeCode(r[cCode]) : "",
      name: cName !== -1 ? cellText(r[cName]).trim() : "",
      contact: cContact !== -1 ? cellText(r[cContact]).trim() : "",
      debit: cDebit !== -1 ? parseAmount(r[cDebit]) : null,
      credit: cCredit !== -1 ? parseAmount(r[cCredit]) : null,
      comment: cComment !== -1 ? cellText(r[cComment]).trim() : "",
    });
  }
  return groupEntries(flat);
}

function parseRawLedgerSchema(rows, hIdx) {
  const header = rows[hIdx].map(cellText);
  const cOp = colIndex(header, "رقم العملية", "رقم القيد");
  const cDate = colIndex(header, "تاريخ");
  const cCode = colIndex(header, "رمز الحساب");
  const cDesc = colIndex(header, "تعريف", "وصف القيد", "البيان");
  const cDebit = colIndex(header, "مدين");
  const cCredit = colIndex(header, "دائن");
  const cNotes = colIndex(header, "ملاحظ");
  const cCCCode = colIndex(header, "رمز مركز");
  const cCCName = colIndex(header, "اسم مركز");

  const groups = [];
  let current = null;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const op = cOp !== -1 ? cellText(r[cOp]).trim() : "";
    const code = cCode !== -1 ? normalizeCode(r[cCode]) : "";
    const descRaw = cDesc !== -1 ? cellText(r[cDesc]).trim() : "";

    if (descRaw.includes("اجمالي")) continue;
    if (!op && !code) continue;
    if (!op) continue;

    if (!current || current.seq !== op) {
      current = { seq: op, date: cDate !== -1 ? normalizeDateGuess(r[cDate]) : "", desc: descRaw, rows: [] };
      groups.push(current);
    }
    if (!current.date && cDate !== -1) {
      const d = normalizeDateGuess(r[cDate]);
      if (d) current.date = d;
    }
    if (!current.desc && descRaw) current.desc = descRaw;

    const ccCode = cCCCode !== -1 ? cellText(r[cCCCode]).trim() : "";
    const ccName = cCCName !== -1 ? cellText(r[cCCName]).trim() : "";
    const notes = cNotes !== -1 ? cellText(r[cNotes]).trim() : "";
    let comment = notes;
    if (ccCode) comment = (comment ? comment + " | " : "") + `مركز التكلفة: ${ccCode}${ccName ? " - " + ccName : ""}`;

    current.rows.push({
      seq: op,
      date: current.date,
      desc: current.desc,
      accType: "حسابات دفتر الاستاذ",
      code,
      contact: "",
      debit: cDebit !== -1 ? parseAmount(r[cDebit]) : null,
      credit: cCredit !== -1 ? parseAmount(r[cCredit]) : null,
      comment,
      _rowIndex: i,
    });
  }
  return groups;
}

// Schema C: Qoyod's "دفتر القيود" (Journal Report) export. Each entry is a block starting
// with a line like: 'ID 335 فاتورة مبيعات - INV37 ( أنشئ بواسطة طه شومان في 2024-12-30 )',
// followed by a sub-header + account lines, and a closing 'المجموع' totals row.
// Some exports split the ID line across cells (date in separate cell), so we try
// matching on first cell, then on full concatenated row.
const QOYOD_REPORT_ID_RE = /^ID\s+(\d+)\s+(.+?)\s*\(\s*أنشئ بواسطة\s+.+?\s+في\s+([\d-]+)\s*\)/;

function matchQoyodId(row) {
  const c0 = (row || [])[0];
  if (typeof c0 !== "string") return null;
  let m = QOYOD_REPORT_ID_RE.exec(c0.trim());
  if (m) return m;
  const joined = (Array.isArray(row) ? row : []).map(c => c != null ? String(c).trim() : "").filter(c => c).join(" ");
  return QOYOD_REPORT_ID_RE.exec(joined);
}

function findQoyodReportStart(rows) {
  for (let i = 0; i < rows.length; i++) {
    if (matchQoyodId(rows[i])) return i;
  }
  return -1;
}

function parseQoyodJournalReportSchema(rows) {
  const groups = [];
  let current = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const c0 = row[0];
    if (typeof c0 === "string") {
      const trimmed = c0.trim();
      const m = matchQoyodId(row);
      if (m) {
        current = { seq: m[1], desc: m[2].trim(), date: normalizeDateGuess(m[3]), rows: [] };
        groups.push(current);
        continue;
      }
      if (trimmed.startsWith("الحساب")) continue;
      if (trimmed === "المجموع" || trimmed.startsWith("المجموع")) { current = null; continue; }
    }
    if (!current) continue;
    if (c0 === null || c0 === undefined || String(c0).trim() === "") continue;

    const accountRaw = String(c0).trim();
    const detail = row[1];
    const debit = parseAmount(row[2]);
    const credit = parseAmount(row[3]);
    const comment = row[4];
    const m2 = /^([^\s-]+)\s*-\s*(.+)/.exec(accountRaw);
    const code = m2 ? normalizeCode(m2[1]) : normalizeCode(accountRaw);
    const accName = m2 ? m2[2].trim() : "";
    const finalComment = (comment && String(comment).trim()) || (detail && String(detail).trim()) || accName;

    current.rows.push({
      seq: current.seq,
      date: current.date,
      desc: current.desc,
      accType: "حسابات دفتر الاستاذ",
      code,
      contact: "",
      debit,
      credit,
      comment: finalComment,
      _rowIndex: i,
    });
  }
  return groups.filter((g) => g.rows.length > 0);
}

// Schema D (universal fallback): finds the meaning of each column by matching header
// keywords — case/spacing-insensitive, Arabic or English, works regardless of column order —
// rather than expecting one fixed layout. Handles two structures:
//   (a) repeating blocks: a title/description line followed by a small sub-header + a few
//       account rows, repeated per entry (e.g. Qoyod's own "دفتر القيود" report, or a PDF where
//       each voucher prints as its own mini-table)
//   (b) one flat table with a sequence/voucher column identifying which rows belong together
// This is the last resort tried after the three named schemas above fail to match.
const COLUMN_KEYWORDS = {
  account: ["رمز الحساب", "الحساب", "account", "acc code", "acc no", "رقم الحساب", "رقم", "code", "account code", "account number", "account_name", "الرمز"],
  debit: ["مدين", "debit", " dr"],
  credit: ["دائن", "credit", " cr"],
  date: ["تاريخ", "date"],
  desc: ["التفصيل", "الوصف", "تعريف", "البيان", "التعليقات", "description", "details", "notes", "comment", "narration"],
  seq: ["رقم القيد", "رقم العملية", "تسلسل القيد", "voucher", "reference", "رقم المستند", "entry no", "jv no"],
};
const TOTALS_MARKERS = ["المجموع", "الاجمالي", "الإجمالي", "اجمالي", "total", "sum"];
const DATE_PATTERNS = [
  /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
  /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
  /\b(\d{1,2})-(\d{1,2})-(\d{4})\b/,
];

function matchColumnMeaning(headerCell) {
  const t = cellText(headerCell).trim().toLowerCase();
  if (!t) return null;
  for (const [meaning, keywords] of Object.entries(COLUMN_KEYWORDS)) {
    for (const kw of keywords) {
      if (t.includes(kw.toLowerCase())) return meaning;
    }
  }
  return null;
}

// A row counts as a "sub-header" if it identifies at least an account column and one of
// debit/credit — everything else (date, description, seq) is a bonus if present.
function tryMapHeaderRow(row) {
  const map = {};
  row.forEach((cell, i) => {
    const meaning = matchColumnMeaning(cell);
    if (meaning && map[meaning] === undefined) map[meaning] = i;
  });
  if (map.account !== undefined && (map.debit !== undefined || map.credit !== undefined)) return map;
  return null;
}

function extractDateFromText(text) {
  const t = cellText(text);
  for (const re of DATE_PATTERNS) {
    const m = re.exec(t);
    if (m) return normalizeDateGuess(m[0]);
  }
  return "";
}

function isTotalsRow(row) {
  return row.some((c) => TOTALS_MARKERS.some((marker) => cellText(c).trim() === marker));
}

function isRowBlank(row) {
  return !row || row.every((c) => cellText(c).trim() === "");
}

function parseGenericFlexibleSchema(rows) {
  // Find every row that looks like a column sub-header, in case the file has repeating blocks.
  const headerRowIndexes = [];
  rows.forEach((row, i) => {
    if (Array.isArray(row) && tryMapHeaderRow(row)) headerRowIndexes.push(i);
  });
  if (headerRowIndexes.length === 0) return null;

  const groups = [];
  let seqCounter = 1;

  for (let h = 0; h < headerRowIndexes.length; h++) {
    const hIdx = headerRowIndexes[h];
    const map = tryMapHeaderRow(rows[hIdx]);
    const nextHeaderIdx = h + 1 < headerRowIndexes.length ? headerRowIndexes[h + 1] : rows.length;

    // Title/description line: the row immediately above this sub-header, if it has meaningful
    // text but doesn't itself look like a data or header row.
    let blockTitle = "";
    let blockDate = "";
    if (hIdx > 0) {
      const titleRow = rows[hIdx - 1];
      if (Array.isArray(titleRow) && !isRowBlank(titleRow) && !tryMapHeaderRow(titleRow)) {
        const titleText = titleRow.map(cellText).find((c) => c.trim()) || "";
        blockTitle = titleText.trim();
        blockDate = extractDateFromText(titleText);
      }
    }

    let current = null;
    const localGroups = [];
    for (let i = hIdx + 1; i < nextHeaderIdx; i++) {
      const row = rows[i] || [];
      if (isRowBlank(row) || isTotalsRow(row)) {
        current = null;
        continue;
      }
      const accountRaw = cellText(row[map.account]).trim();
      if (!accountRaw) continue;

      const seqVal = map.seq !== undefined ? cellText(row[map.seq]).trim() : "";
      const rowDate = map.date !== undefined ? normalizeDateGuess(row[map.date]) : "";
      const rowDesc = map.desc !== undefined ? cellText(row[map.desc]).trim() : "";

      // Grouping key: prefer an explicit seq/voucher column; otherwise treat this whole
      // block (between two sub-headers, or the one flat table) as a single entry.
      const key = seqVal || `block-${h}`;
      if (!current || current._key !== key) {
        current = {
          _key: key,
          seq: String(seqCounter),
          date: rowDate || blockDate,
          desc: blockTitle || rowDesc,
          rows: [],
        };
        localGroups.push(current);
        seqCounter++;
      }

      const m2 = /^([^\s-]+)\s*-\s*(.+)/.exec(accountRaw);
      const code = normalizeCode(m2 ? m2[1] : accountRaw);
      const accName = m2 ? m2[2].trim() : "";

      current.rows.push({
        seq: current.seq,
        date: current.date,
        desc: current.desc,
        accType: "حسابات دفتر الاستاذ",
        code,
        contact: "",
        debit: map.debit !== undefined ? parseAmount(row[map.debit]) : null,
        credit: map.credit !== undefined ? parseAmount(row[map.credit]) : null,
        comment: rowDesc || accName,
        _rowIndex: i,
      });
    }
    // نفس سبب الإصلاح بـreadWorkbookRows أعلاه — بلا حلقة .push بسيطة، localGroups
    // الكبيرة (ملف بعشرات آلاف القيود) تتجاوز حد معطيات نداء الدالة وترمي
    // "Maximum call stack size exceeded" فعليًا.
    for (let i = 0; i < localGroups.length; i++) groups.push(localGroups[i]);
  }

  return groups.filter((g) => g.rows.length > 0);
}

// Schema D: English accounting system exports (DBAmount/CRAmount format)
function parseEnglishExportSchema(rows, hIdx) {
  const header = rows[hIdx].map(cellText);
  const cCode = colIndex(header, "AccountNumber", "Account Number", "account_number", "acc_no", "acc_number", "AccountCode", "account code");
  const cName = colIndex(header, "AccountName", "Account Name", "account_name", "Account Description", "Account", "GLAccount");
  const cDate = colIndex(header, "VouchDate", "VoucherDate", "Vouch_Date", "Date", "TransDate", "TransactionDate", "JEDate");
  const cDesc = colIndex(header, "VouchDescription", "Description", "Narration", "LineDescription", "TransactionDescription", "Memo", "Remark", "Notes");
  const cDebit = colIndex(header, "DBAmount", "DebitAmount", "Debit", "DR", "DrAmount", "Debit_Amount");
  const cCredit = colIndex(header, "CRAmount", "CreditAmount", "Credit", "CR", "CrAmount", "Credit_Amount");
  const cVouchNum = colIndex(header, "VouchNumber", "VoucherNumber", "Vouch_Number", "JE_Number", "JournalNumber", "Reference", "DocNumber");
  const cMonth = colIndex(header, "Month");
  const cYear = colIndex(header, "Year");
  const cSource = colIndex(header, "Source");
  const cVouchType = colIndex(header, "VouchTypeName", "VoucherType", "Type");

  const groups = [];
  let current = null;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const code = cCode !== -1 ? normalizeCode(r[cCode]) : "";
    const name = cName !== -1 ? cellText(r[cName]).trim() : "";
    if (!code && !name) continue;

    const op = cVouchNum !== -1 ? cellText(r[cVouchNum]).trim() : "";
    const dateRaw = cDate !== -1 ? normalizeDateGuess(r[cDate]) : "";
    const desc = cDesc !== -1 ? cellText(r[cDesc]).trim() : "";
    const debit = cDebit !== -1 ? parseAmount(r[cDebit]) : null;
    const credit = cCredit !== -1 ? parseAmount(r[cCredit]) : null;

    const key = op || `row-${i}`;
    if (!current || current.seq !== key) {
      current = { seq: key, date: dateRaw, desc: desc || name, rows: [] };
      groups.push(current);
    }
    if (!current.date && dateRaw) current.date = dateRaw;
    if (!current.desc && desc) current.desc = desc;

    const month = cMonth !== -1 ? cellText(r[cMonth]).trim() : "";
    const year = cYear !== -1 ? cellText(r[cYear]).trim() : "";
    const source = cSource !== -1 ? cellText(r[cSource]).trim() : "";
    const vouchType = cVouchType !== -1 ? cellText(r[cVouchType]).trim() : "";
    let comment = desc || name;
    if (source) comment = (comment ? comment + " | " : "") + source;
    if (vouchType && vouchType !== "Journal") comment = (comment ? comment + " | " : "") + vouchType;

    current.rows.push({
      seq: current.seq,
      date: current.date,
      desc: current.desc,
      accType: "حسابات دفتر الاستاذ",
      code: code || normalizeCode(name),
      contact: "",
      debit,
      credit,
      comment,
      _rowIndex: i,
    });
  }
  return groups.filter((g) => g.rows.length > 0);
}

// Schema E: Arabic Qoyod journal entries with flexible columns
function parseArabicFlexibleSchema(rows, hIdx) {
  const header = rows[hIdx].map(cellText);
  const cCode = colIndex(header, "رمز الحساب", "رقم الحساب", "رمز", "رقم الصرف", "AccountCode", "account", "code", "acc_no");
  const cName = colIndex(header, "اسم الحساب", "الحساب", "AccountName", "Account Name", "account_name");
  const cDate = colIndex(header, "تاريخ العملية", "التاريخ", "Date", "VouchDate", "تاريخ");
  const cDesc = colIndex(header, "تعريف", "البيان", "وصف القيد", "ملاحظات", "التعليقات", "Description", "Narration", "VouchDescription", "الوصف");
  const cDebit = colIndex(header, "مدين", "Debit", "DBAmount", "DebitAmount", "DR");
  const cCredit = colIndex(header, "دائن", "Credit", "CRAmount", "CreditAmount", "CR");
  const cOp = colIndex(header, "رقم العملية", "رقم القيد", "رقم القيود", "رقم السند", "رقم الدفتر", "VouchNumber", "VoucherNumber", "Reference", "رقم المستند");
  const cCCCode = colIndex(header, "رمز مركز", " مركز التكلفة", "CostCenter", "cost_center");
  const cCCName = colIndex(header, "اسم مركز", "اسم مركز التكلفة", "CostCenterName");

  const groups = [];
  let current = null;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const code = cCode !== -1 ? normalizeCode(r[cCode]) : "";
    const name = cName !== -1 ? cellText(r[cName]).trim() : "";
    if (!code && !name) continue;

    const op = cOp !== -1 ? cellText(r[cOp]).trim() : "";
    const dateRaw = cDate !== -1 ? normalizeDateGuess(r[cDate]) : "";
    const desc = cDesc !== -1 ? cellText(r[cDesc]).trim() : "";
    const debit = cDebit !== -1 ? parseAmount(r[cDebit]) : null;
    const credit = cCredit !== -1 ? parseAmount(r[cCredit]) : null;

    if (desc.includes("اجمالي") || desc.includes("إجمالي")) continue;

    const key = op || `row-${i}`;
    if (!current || current.seq !== key) {
      current = { seq: key, date: dateRaw, desc: desc || name, rows: [] };
      groups.push(current);
    }
    if (!current.date && dateRaw) current.date = dateRaw;
    if (!current.desc && desc) current.desc = desc;

    const ccCode = cCCCode !== -1 ? cellText(r[cCCCode]).trim() : "";
    const ccName = cCCName !== -1 ? cellText(r[cCCName]).trim() : "";
    let comment = desc || name;
    if (ccCode) comment = (comment ? comment + " | " : "") + `مركز التكلفة: ${ccCode}${ccName ? " - " + ccName : ""}`;

    current.rows.push({
      seq: current.seq,
      date: current.date,
      desc: current.desc,
      accType: "حسابات دفتر الاستاذ",
      code: code || normalizeCode(name),
      contact: "",
      debit,
      credit,
      comment,
      _rowIndex: i,
    });
  }
  return groups.filter((g) => g.rows.length > 0);
}

export const _parseDebug = { info: "" };

export function parseEntriesFile(rows) {
  const dbg = [];
  dbg.push(`صفوف: ${rows.length}`);
  if (rows.length > 0) {
    rows.slice(0, 5).forEach((r, i) => {
      const cells = (Array.isArray(r) ? r : []).map(c => c != null ? String(c).trim().substring(0, 40) : "∅");
      dbg.push(`  صف ${i}: [${cells.join(" | ")}]`);
    });
  }

  // Try each schema; if it matches but returns 0 groups, continue to the next.
  // This prevents a false-positive header match (e.g. "تسلسل القيد" appearing deep
  // inside a Qoyod Journal Report) from short-circuiting the whole parse.

  // Schema A: bulk-import template
  let hIdx = findHeaderRowIndex(rows, "تسلسل القيد", "تسلسل", "serial", "seq", "رقم التسلسل", "رقم القيد");
  dbg.push(`Schema A hIdx=${hIdx}`);
  if (hIdx !== -1) {
    const result = parseTemplateSchema(rows, hIdx);
    dbg.push(`Schema A => ${result.length} groups`);
    if (result.length > 0) { _parseDebug.info = dbg.join("\n"); return result; }
  }

  // Schema B/E: Arabic tabular with "رقم العملية" header
  hIdx = findHeaderRowIndex(rows, "رقم العملية", "رقم القيد", "رقم القيود", "operation", "journal", "رقم قيد", "VouchNumber", "VoucherNumber");
  dbg.push(`Schema B/E hIdx=${hIdx}`);
  if (hIdx !== -1) {
    const header = rows[hIdx].map(cellText);
    dbg.push(`Header: [${header.map(c => c.substring(0, 30)).join(" | ")}]`);
    const acctIdx = colIndex(header, "رمز الحساب", "رقم الحساب", "رمز", "code", "account", "AccountNumber");
    dbg.push(`Account col=${acctIdx}`);
    if (acctIdx !== -1) {
      const hasEngDebit = colIndex(header, "DBAmount", "DebitAmount", "Debit", "DR") !== -1;
      const hasEngCredit = colIndex(header, "CRAmount", "CreditAmount", "Credit", "CR") !== -1;
      if (hasEngDebit || hasEngCredit) {
        const result = parseEnglishExportSchema(rows, hIdx);
        dbg.push(`Schema B English => ${result.length} groups`);
        if (result.length > 0) { _parseDebug.info = dbg.join("\n"); return result; }
      } else {
        const result = parseRawLedgerSchema(rows, hIdx);
        dbg.push(`Schema B Arabic => ${result.length} groups`);
        if (result.length > 0) { _parseDebug.info = dbg.join("\n"); return result; }
      }
    }
  }

  // Schema D: English export
  hIdx = findHeaderRowIndex(rows, "AccountNumber", "Account Number", "account_number", "acc_no", "VouchDate", "VoucherDate", "DBAmount", "CRAmount");
  dbg.push(`Schema D hIdx=${hIdx}`);
  if (hIdx !== -1) {
    const result = parseEnglishExportSchema(rows, hIdx);
    dbg.push(`Schema D => ${result.length} groups`);
    if (result.length > 0) { _parseDebug.info = dbg.join("\n"); return result; }
  }

  // Schema E: Arabic flexible
  hIdx = findHeaderRowIndex(rows, "رمز الحساب", "رقم الحساب", "اسم الحساب", "AccountNumber", "AccountName");
  dbg.push(`Schema E hIdx=${hIdx}`);
  if (hIdx !== -1) {
    const header = rows[hIdx].map(cellText);
    if (colIndex(header, "مدين", "دائن", "Debit", "Credit", "DBAmount", "CRAmount") !== -1) {
      const result = parseArabicFlexibleSchema(rows, hIdx);
      dbg.push(`Schema E => ${result.length} groups`);
      if (result.length > 0) { _parseDebug.info = dbg.join("\n"); return result; }
    }
  }

  // Schema C: Qoyod Journal Report (ID blocks)
  if (findQoyodReportStart(rows) !== -1) {
    dbg.push(`Schema C (Qoyod Journal Report) matched`);
    const result = parseQoyodJournalReportSchema(rows);
    dbg.push(`Schema C => ${result.length} groups`);
    _parseDebug.info = dbg.join("\n");
    return result;
  }

  // Generic flexible fallback
  const generic = parseGenericFlexibleSchema(rows);
  dbg.push(`Generic: ${generic ? generic.length : "null"}`);
  _parseDebug.info = dbg.join("\n");
  if (generic && generic.length > 0) return generic;

  const candidateRow =
    rows.find((r) => Array.isArray(r) && r.some((c) => cellText(c).includes("رمز الحساب") || cellText(c).includes("AccountNumber"))) ||
    rows.slice(0, 8).find((r) => Array.isArray(r) && r.filter((c) => cellText(c).trim() !== "").length >= 3) ||
    rows[0] ||
    [];
  const foundCols = candidateRow.map(cellText).filter((c) => c.trim() !== "").join("، ");
  throw new Error(
    `لم يتم التعرف على تنسيق ملف القيود.` +
      (foundCols ? ` الأعمدة الموجودة بالملف: ${foundCols}.` : "") +
      ` تأكد من وجود عمود واضح لرمز الحساب وعمود واحد على الأقل للمدين أو الدائن.`
  );
}

function groupEntries(flatRows) {
  const groups = [];
  let current = null;
  flatRows.forEach((r, idx) => {
    const isFullyEmpty = !r.seq && !r.date && !r.desc && !r.code && r.debit === null && r.credit === null && !r.comment;
    if (isFullyEmpty) {
      current = null;
      return;
    }
    if (r.seq) {
      if (!current || current.seq !== r.seq) {
        current = { seq: r.seq, date: r.date, desc: r.desc, rows: [] };
        groups.push(current);
      }
    }
    if (!current) {
      current = { seq: `?${idx}`, date: r.date, desc: r.desc, rows: [] };
      groups.push(current);
    }
    if (!current.date && r.date) current.date = r.date;
    if (!current.desc && r.desc) current.desc = r.desc;
    current.rows.push({ ...r, _rowIndex: idx });
  });
  return groups;
}

// ---------- validation ----------
export function validateEntryStructure(entry, chartMap, parentInfo) {
  const issues = [];
  const totalDebit = entry.rows.reduce((s, r) => s + (parseFloat(r.debit) || 0), 0);
  const totalCredit = entry.rows.reduce((s, r) => s + (parseFloat(r.credit) || 0), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    const difference = Math.abs(totalDebit - totalCredit);
    const side = totalDebit > totalCredit ? "المدين" : "الدائن";
    issues.push({
      id: `${entry.seq}-balance`,
      type: "unbalanced",
      severity: "error",
      message: `القيد غير متزن: مجموع المدين ${totalDebit.toLocaleString()} ومجموع الدائن ${totalCredit.toLocaleString()}، الفرق ${difference.toLocaleString()} لصالح ${side}`,
    });
  }
  // Both sides of a journal entry must have a non-zero total. Individual lines may legitimately
  // be 0, but an entry with either side totaling 0 cannot be imported.
  if (Math.abs(totalDebit) < 0.005 || Math.abs(totalCredit) < 0.005) {
    issues.push({
      id: `${entry.seq}-zero-total`,
      type: "zero_total",
      severity: "error",
      message: `القيد غير صالح: إجمالي المدين ${totalDebit.toLocaleString()} وإجمالي الدائن ${totalCredit.toLocaleString()} — يجب ألا يكون مجموع أي طرف صفراً (يُسمح بسطر قيمته صفر داخل قيد ذي إجماليين غير صفريين)`,
    });
  }
  const dateMatch = entry.date ? String(entry.date).match(/^(\d{2})\/(\d{2})\/(\d{4})$/) : null;
  if (!dateMatch) {
    issues.push({
      id: `${entry.seq}-date`,
      type: "date_format",
      severity: "error",
      message: `تاريخ القيد مفقود أو غير مطابق لصيغة dd/mm/yyyy (القيمة الحالية: "${entry.date || "فارغ"}")`,
    });
  } else {
    // [إصلاح] كان الفحص شكليًا فقط (dd/mm/yyyy كنمط)، فيمر تاريخ مستحيل مثل
    // "12/25/2025" (شهر 25) أو "31/02/2025" (31 فبراير) بلا أي خطأ، ثم يرفضه
    // قيود عند الرفع فيرجع العميل بالملف كاملًا. نتحقق فعليًا من النطاقات.
    const dd = Number(dateMatch[1]), mm = Number(dateMatch[2]), yyyy = Number(dateMatch[3]);
    const daysInMonth = mm >= 1 && mm <= 12 ? new Date(yyyy, mm, 0).getDate() : 0;
    if (mm < 1 || mm > 12 || dd < 1 || dd > daysInMonth) {
      issues.push({
        id: `${entry.seq}-date`,
        type: "date_format",
        severity: "error",
        message: `تاريخ القيد غير موجود فعليًا بالتقويم (القيمة الحالية: "${entry.date}") — الصيغة المطلوبة dd/mm/yyyy (يوم/شهر/سنة)`,
      });
    }
  }
  if (!entry.desc) {
    issues.push({ id: `${entry.seq}-desc`, type: "missing_desc", severity: "error", message: "وصف القيد مفقود في السطر الأول" });
  }
  if (entry.rows.length < 2) {
    issues.push({
      id: `${entry.seq}-rows`,
      type: "too_few_rows",
      severity: "error",
      message: "القيد يحتوي على سطر واحد فقط، يجب أن يحتوي على سطرين على الأقل (مدين ودائن)",
    });
  }

  entry.rows.forEach((r, i) => {
    // A line may legitimately carry a value of 0; what's invalid is leaving both amount fields
    // entirely blank (no value entered at all).
    const debitEntered = r.debit !== null && r.debit !== undefined && !isNaN(r.debit);
    const creditEntered = r.credit !== null && r.credit !== undefined && !isNaN(r.credit);
    const hasDebit = debitEntered && r.debit > 0;
    const hasCredit = creditEntered && r.credit > 0;
    if (hasDebit && hasCredit) {
      issues.push({
        id: `${entry.seq}-row${i}-both`,
        type: "both_amounts",
        severity: "error",
        rowIndex: r._rowIndex,
        message: `السطر ${i + 1}: لا يمكن تعبئة خانتي مدين ودائن معاً بنفس السطر`,
      });
    }
    if (!debitEntered && !creditEntered) {
      issues.push({
        id: `${entry.seq}-row${i}-none`,
        type: "no_amount",
        severity: "error",
        rowIndex: r._rowIndex,
        message: `السطر ${i + 1}: خانتا المدين والدائن فارغتان تماماً (يُسمح بقيمة صفر، لكن لا يجوز ترك الخانتين فارغتين)`,
      });
    }
    if (!r.code || !chartMap[r.code]) {
      issues.push({
        id: `${entry.seq}-row${i}-unknown`,
        type: "unknown_code",
        severity: "error",
        rowIndex: r._rowIndex,
        code: r.code,
        message: `السطر ${i + 1}: رمز الحساب "${r.code || "فارغ"}" غير موجود في شجرة الحسابات المرفقة`,
      });
    } else if (parentInfo.parentCodes.has(r.code)) {
      const children = (parentInfo.childrenByParent[r.code] || []).slice(0, 6);
      const childrenText = children.map((c) => `${c.code} ${c.name}`).join("، ");
      issues.push({
        id: `${entry.seq}-row${i}-parent`,
        type: "parent_account",
        severity: "error",
        rowIndex: r._rowIndex,
        code: r.code,
        message: `السطر ${i + 1}: الحساب "${r.code} — ${chartMap[r.code].name}" حساب رئيسي وله حسابات فرعية، لا يمكن ترحيل قيد عليه مباشرة في قيود.${
          childrenText ? ` اختر أحد الحسابات الفرعية: ${childrenText}` : ""
        }`,
      });
    }
  });

  return issues;
}
