/**
 * [إضافة 2026-10-08، طلب صريح من المستخدم] تصدير نتيجة الرفع بعد انتهائه:
 *  1) ملف "لم تُرفع": المنتجات المتخطّاة + التي فيها أخطاء (+ ما لم يُرسَل
 *     لإيقاف/خطأ فادح) — بنفس أعمدة ملف العميل الأصلي حرفياً + عمودي النتيجة
 *     والسبب بالآخر، فيُصحَّح ويُعاد رفعه مباشرة بنفس الأداة. لو فيه منتج مجمّع
 *     فاشل يُضاف شيت مكوّناته (بعناوين يكتشفها parseBomRows) حتى لا تضيع الوصفة.
 *  2) ملف "تم إنشاؤها": المنتجات التي أُنشئت فعلاً بهذه الدفعة + رقمها الداخلي
 *     بقيود ونوعها المرفوع.
 * طبقة نقية (بلا شبكة/DOM) — التنزيل الفعلي بالمستدعي.
 *
 * ‼️ عناوين الأعمدة المضافة مختارة عمداً بحيث لا يطابقها detectColumns عند إعادة
 * رفع الملف (لا "حالة"/"رمز"/"كود"/"وصف"/"نوع"...) — مثبَّت باختبار.
 */
import * as XLSX from "xlsx";
import { matchKey, PRODUCT_TYPE_LABELS } from "../engine/parsing.js";

export const UPLOAD_OUTCOME = {
  CREATED: "created",
  UPDATED: "updated",
  SKIPPED: "skipped",
  ERROR: "error",
  NOT_SENT: "not_sent",
};

const FAILED_STATUSES = new Set([UPLOAD_OUTCOME.SKIPPED, UPLOAD_OUTCOME.ERROR, UPLOAD_OUTCOME.NOT_SENT]);

const STATUS_LABELS = {
  [UPLOAD_OUTCOME.SKIPPED]: { ar: "تم التخطي", en: "Skipped" },
  [UPLOAD_OUTCOME.ERROR]: { ar: "خطأ", en: "Error" },
  [UPLOAD_OUTCOME.NOT_SENT]: { ar: "لم يُرسَل", en: "Not sent" },
};

export const RESULT_COLUMN_LABELS = {
  result: { ar: "نتيجة الرفع", en: "Upload result" },
  reason: { ar: "سبب عدم الرفع", en: "Failure reason" },
  qoyodId: { ar: "رقم قيود الداخلي (ID)", en: "Qoyod internal ID" },
  uploadedType: { ar: "النوع المرفوع", en: "Uploaded type" },
  addedType: { ar: "نوع المنتج", en: "Product type" },
};

export const BOM_EXPORT_HEADERS = { parent: "المنتج المجمّع", component: "المكوّن", qty: "الكمية" };

const tr = (t, label) => (typeof t === "function" ? t(label) : label.ar);

export function countUploadOutcomes(outcomes) {
  const counts = { created: 0, updated: 0, failed: 0 };
  (outcomes || []).forEach((o) => {
    if (!o) return;
    if (o.status === UPLOAD_OUTCOME.CREATED) counts.created++;
    else if (o.status === UPLOAD_OUTCOME.UPDATED) counts.updated++;
    else if (FAILED_STATUSES.has(o.status)) counts.failed++;
  });
  return counts;
}

// صف بنفس أعمدة الملف الأصلي: الصف الخام نفسه، أو صف مُركَّب لمادة أولية أُنشئت
// من ربط المكوّنات (لا صف لها بملف العميل)
function baseRowFor(p, { rawRows, headerLen, colsMap, typeColIndex, t }) {
  if (Number.isInteger(p._sheetRow) && rawRows[p._sheetRow]) {
    const raw = rawRows[p._sheetRow];
    return Array.from({ length: headerLen }, (_, c) => (raw[c] === null || raw[c] === undefined ? "" : raw[c]));
  }
  const row = Array(headerLen).fill("");
  if (colsMap && colsMap.name >= 0) row[colsMap.name] = p.name || "";
  if (colsMap && colsMap.sku >= 0 && p.sku) row[colsMap.sku] = p.sku;
  if (typeColIndex >= 0) row[typeColIndex] = tr(t, PRODUCT_TYPE_LABELS[p.product_type] || PRODUCT_TYPE_LABELS.Product);
  return row;
}

export function buildFailedProductsWorkbook({ headerRow, rawRows, colsMap, list, outcomes, bomLines, t }) {
  const header = (headerRow || []).map((h) => (h === null || h === undefined ? "" : h));
  const failedIdx = list.map((_, i) => i).filter((i) => outcomes[i] && FAILED_STATUSES.has(outcomes[i].status));
  if (!failedIdx.length) return null;

  // مادة أولية مُركَّبة بلا عمود نوع بملف العميل => عمود "نوع المنتج" يُضاف
  // حتى لا تُعاد رفعها كـ"منتج" عادي
  const needsTypeCol = failedIdx.some((i) => !Number.isInteger(list[i]._sheetRow)) && !(colsMap && colsMap.product_type >= 0);
  const typeColIndex = colsMap && colsMap.product_type >= 0 ? colsMap.product_type : (needsTypeCol ? header.length : -1);
  const headerLen = header.length + (needsTypeCol ? 1 : 0);
  const outHeader = [...header, ...(needsTypeCol ? [tr(t, RESULT_COLUMN_LABELS.addedType)] : []),
    tr(t, RESULT_COLUMN_LABELS.result), tr(t, RESULT_COLUMN_LABELS.reason)];

  const aoa = [outHeader];
  failedIdx.forEach((i) => {
    const o = outcomes[i];
    const row = baseRowFor(list[i], { rawRows, headerLen, colsMap, typeColIndex, t });
    aoa.push([...row, tr(t, STATUS_LABELS[o.status]), o.reason || ""]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = outHeader.map((h, c) => ({ wch: c >= outHeader.length - 1 ? 60 : Math.max(12, String(h).length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, tr(t, { ar: "لم تُرفع", en: "Not uploaded" }));

  // شيت المكوّنات للمنتجات المجمّعة الفاشلة فقط
  const failedKeys = new Set();
  failedIdx.forEach((i) => {
    const p = list[i];
    [p.name, p.sku].forEach((v) => { const k = matchKey(v); if (k) failedKeys.add(k); });
  });
  const bomForFailed = (bomLines || []).filter((l) => failedKeys.has(matchKey(l.parent)));
  if (bomForFailed.length) {
    const bomAoa = [[BOM_EXPORT_HEADERS.parent, BOM_EXPORT_HEADERS.component, BOM_EXPORT_HEADERS.qty],
      ...bomForFailed.map((l) => [l.parent, l.component, l.qty])];
    const bws = XLSX.utils.aoa_to_sheet(bomAoa);
    bws["!cols"] = [{ wch: 36 }, { wch: 36 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, bws, "المكونات");
  }
  return { workbook: wb, count: failedIdx.length };
}

export function buildCreatedProductsWorkbook({ headerRow, rawRows, colsMap, list, outcomes, t }) {
  const header = (headerRow || []).map((h) => (h === null || h === undefined ? "" : h));
  const createdIdx = list.map((_, i) => i).filter((i) => outcomes[i] && outcomes[i].status === UPLOAD_OUTCOME.CREATED);
  if (!createdIdx.length) return null;
  const outHeader = [...header, tr(t, RESULT_COLUMN_LABELS.qoyodId), tr(t, RESULT_COLUMN_LABELS.uploadedType)];
  const aoa = [outHeader];
  createdIdx.forEach((i) => {
    const o = outcomes[i];
    const p = list[i];
    const row = baseRowFor(p, { rawRows, headerLen: header.length, colsMap, typeColIndex: -1, t });
    const typeLabel = tr(t, PRODUCT_TYPE_LABELS[o.type || p.product_type] || PRODUCT_TYPE_LABELS.Product);
    aoa.push([...row, o.id ?? "", typeLabel]);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = outHeader.map((h) => ({ wch: Math.max(12, String(h).length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, tr(t, { ar: "تم إنشاؤها", en: "Created" }));
  return { workbook: wb, count: createdIdx.length };
}
