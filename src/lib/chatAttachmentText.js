// ─── قراءة محتوى مرفقات الشات الفعلي قبل إرساله لـ@AI ──────────────────────
//
// المشكلة التي يحلّها هذا الملف: المسار العام لـ@AI في chat.jsx (عندما لا يكون
// الطلب "تنظيم شجرة حسابات" ولا تحويل جدول بيانات محدَّد) كان يرسل أي مرفق
// (Excel/PDF/Word/CSV/نص) كـ bytes خام (base64 + mimeType) مباشرة لـ Gemini
// عبر inlineData. مشكلة هذا: Gemini's inlineData يفهم فعلياً صور وPDF وملفات
// نصية بسيطة، لكن لا "يقرأ" جدول بيانات Excel/Word ثنائي كمحتوى منظّم من الـ
// bytes الخام - أحياناً يُخمِّن رداً غير مرتبط بالمحتوى الحقيقي (مثال حقيقي:
// أعاد نص خطأ JSZip الشائع حرفياً كأنه فعلاً حاول يفتحها كملف zip فاشل، مع أن
// الملف قابل للقراءة فعلياً ببرمجية SheetJS المستخدمة في باقي أدوات المشروع).
//
// الحل: نقرأ محتوى الملف فعلياً هنا محلياً (بنفس مكتبات SheetJS/pdfjs/mammoth
// المستخدمة أصلاً في chartOrganizerAgent.js وJournalTool.jsx)، ونحوّله لنص
// مقروء نُدرجه مباشرة ضمن نص الرسالة المُرسَلة لـ@AI - فيصل نص حقيقي بدل bytes
// غامضة، وهذا أسرع أيضاً (نص مضغوط بدل base64 كامل للملف) وأدق (Gemini يقرأ
// نصاً صريحاً بدل تخمين من bytes ثنائية).
//
// ملاحظة تصميم مهمة: هذا الملف مستقل تماماً عن src/lib/excelCore.js (ولا
// يعدّله بأي شكل) لتفادي أي تأثير جانبي على JournalTool.jsx الذي يعتمد على
// readAnyEntriesFileRows بسلوكها الحالي حرفياً - نطاق التعديل هنا محصور
// بالشات فقط (src/chat.jsx يستدعي هذا الملف حصرياً).

import * as XLSX from "xlsx";

const MAX_ROWS_IN_PROMPT = 300;
const MAX_CELL_CHARS = 120;
const MAX_TEXT_CHARS = 40000; // سقف واقٍ لطول أي نص مستخرَج (PDF/Word طويل جداً مثلاً)

function truncateCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s.length > MAX_CELL_CHARS ? s.slice(0, MAX_CELL_CHARS) + "…" : s;
}

function rowsToText(rows, { truncatedNote } = {}) {
  const clipped = rows.slice(0, MAX_ROWS_IN_PROMPT);
  const body = clipped.map((r) => (Array.isArray(r) ? r.map(truncateCell).join(" | ") : truncateCell(r))).join("\n");
  const extra = rows.length > MAX_ROWS_IN_PROMPT
    ? `\n… (تم اقتصاص العرض على أول ${MAX_ROWS_IN_PROMPT} سطر من إجمالي ${rows.length} — البيانات الكاملة أُرفِقت كملف أيضاً)`
    : "";
  return (truncatedNote ? truncatedNote + "\n" : "") + body + extra;
}

function clampText(s) {
  return s.length > MAX_TEXT_CHARS ? s.slice(0, MAX_TEXT_CHARS) + "\n… (تم اقتصاص النص لطوله)" : s;
}

async function readSpreadsheetRows(file) {
  // .csv نصي دائماً - نقرأه كنص UTF-8 صريح (file.text()) بدل ArrayBuffer خام:
  // XLSX.read مع {type:"array"} على buffer نصي يخمّن ترميزاً خاطئاً للعربي أحياناً
  // (يحوّلها لرموز مبعثرة)، بينما {type:"string"} يحافظ على النص كما فُكَّ بالفعل.
  const isCsv = /\.csv$/i.test(file.name || "");
  const wb = isCsv ? XLSX.read(await file.text(), { type: "string" }) : XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
    if (sheetRows.length) {
      if (wb.SheetNames.length > 1) rows.push([`── ورقة: ${sheetName} ──`]);
      rows.push(...sheetRows);
    }
  }
  return rows;
}

async function readPdfLines(file) {
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
      currentLine += item.str + " ";
      lastY = y;
    });
    if (currentLine.trim()) lines.push(currentLine);
  }
  return lines;
}

async function readDocxText(file) {
  const mammoth = (await import("mammoth")).default;
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value;
}

function readPlainText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * يستخرج نصاً مقروءاً فعلياً من ملف مرفَق بالشات، حسب صيغته، ليُدرَج ضمن نص
 * الرسالة المرسَلة لـ@AI (بدل إرسال bytes خام لا "يفهمها" فعلياً).
 * يُرجع null للصور (تبقى تُرسَل كـ inlineData multimodal كما هي - مسار يعمل
 * فعلياً وصحيح لـGemini) وللصيغ غير المدعومة هنا (يبقى مسار inlineData كحل
 * أخير بلا تغيير).
 * لا يرمي أبداً - أي فشل قراءة يُرجَع كرسالة عربية واضحة ضمن النص نفسه، حتى لا
 * يصل bytes خام مربكة للنموذج ويُخمِّن رداً غير مرتبط بالمحتوى الحقيقي.
 */
export async function extractAttachmentText(file) {
  const name = (file.name || "").toLowerCase();
  const isImage = (file.type || "").startsWith("image/");
  if (isImage) return null;

  try {
    if (/\.(xlsx|xls|csv)$/i.test(name)) {
      const rows = await readSpreadsheetRows(file);
      if (!rows.length) return `[ملف "${file.name}": جدول بيانات فارغ]`;
      return `[محتوى ملف "${file.name}" (${rows.length} سطر)]\n` + rowsToText(rows);
    }
    if (/\.pdf$/i.test(name)) {
      const lines = await readPdfLines(file);
      if (!lines.length) return `[ملف "${file.name}": PDF بلا نص قابل للاستخراج - قد يكون صوراً ممسوحة]`;
      return `[محتوى ملف "${file.name}" (PDF، ${lines.length} سطر)]\n` + clampText(lines.join("\n"));
    }
    if (/\.docx$/i.test(name)) {
      const text = await readDocxText(file);
      if (!text.trim()) return `[ملف "${file.name}": Word بلا نص]`;
      return `[محتوى ملف "${file.name}" (Word)]\n` + clampText(text);
    }
    if (/\.(txt|md)$/i.test(name)) {
      const text = await readPlainText(file);
      return `[محتوى ملف "${file.name}"]\n` + clampText(text);
    }
  } catch (err) {
    return `[تعذّرت قراءة محتوى ملف "${file.name}" تلقائياً: ${err?.message || "خطأ غير معروف"} - الملف نفسه مرفَق أعلاه]`;
  }
  return null; // صيغة غير مغطاة هنا (مثل .doc القديم) - يبقى مسار inlineData الاحتياطي
}
