/*
 ============================================================================
  qoyodAccountPush — الإرسال الفعلي لصفوف شجرة الحسابات الجديدة إلى منشأة
  العميل الحقيقية عبر Qoyod API (بدل/بجانب تنزيل قالب الرفع اليدوي).
  ============================================================================
  يستخدم نفس طبقة الشبكة المُختبَرة فعليًا بأداة رفع المنتجات (io/network.js:
  api()/fetchAll()، عبر وكيل CORS المشترك functions/api/qoyod-proxy) — بلا أي
  تكرار لمنطق الاتصال، فقط منطق شجرة الحسابات الخاص هنا.

  قرارات صريحة من المستخدم (2026-09-08/09):
    - فحص التكرار قبل الإرسال: نعم، يُجلَب دليل حسابات العميل الحالي أولاً
      ويُتخطى أي صف يطابق كوده أو اسمه (EN أو AR) لحساب موجود فعلاً.
    - عند أي فشل (سواء فشل بناء الحمولة أو رفض API): تتوقف العملية بالكامل
      فورًا، لا يُكمَل لباقي الصفوف. (ملاحظة: هذا اختيار أمان صريح منه، رغم
      أن Qoyod الفعلي لا يفرضه تقنيًا — لا توجد تبعية parent_id تُكسَر، فقط
      قراره أن يفحص كل خطأ يدويًا قبل أي إرسال إضافي).
 ============================================================================
*/
import { api, fetchAll } from "../product-upload/io/network.js";
import { buildQoyodAccountPayload, buildQoyodDuplicateIndex, checkAccountDuplicate } from "./qoyodAccountSync.js";

const RATE_LIMIT_MS = 300; // نفس التأخير المستخدم فعليًا بأداة رفع المنتجات

/**
 * يرسل rows (شكل activeNewRows بـMergeTool.jsx) إلى Qoyod عبر API، صفًا صفًا.
 *
 * @param {Array} rows
 * @param {string} apiKey
 * @param {object} [opts]
 * @param {(entry:{code,nameAr,nameEn,status:'success'|'skip'|'error',reason?,id?}) => void} [opts.onEntry] يُستدعى بعد كل صف (نجاح/تخطٍّ/فشل)
 * @param {(current:number, total:number) => void} [opts.onProgress]
 * @param {{current:boolean}} [opts.stoppedRef] لدعم إيقاف يدوي من المستخدم أثناء الإرسال
 * @returns {Promise<{total:number, sent:number, skipped:number, failed:number, stoppedEarly:boolean, fatalError?:string, entries:Array}>}
 */
export async function pushAccountsToQoyod(rows, apiKey, opts = {}) {
  const { onEntry, onProgress, stoppedRef } = opts;
  const entries = [];
  const emit = (entry) => { entries.push(entry); if (onEntry) onEntry(entry); };

  const key = (apiKey || "").trim();
  if (!key) return { total: 0, sent: 0, skipped: 0, failed: 0, stoppedEarly: false, fatalError: "أدخل مفتاح API أولاً", entries };
  if (!rows || rows.length === 0) return { total: 0, sent: 0, skipped: 0, failed: 0, stoppedEarly: false, fatalError: "لا توجد حسابات جديدة للإرسال", entries };

  // 1) جلب حسابات العميل الحالية لفحص التكرار — فشل هذه الخطوة يُوقف العملية
  // كاملة قبل أي إرسال (بلا فحص تكرار، الإرسال غير آمن).
  let duplicateIndex;
  try {
    const existing = await fetchAll("/accounts", key);
    duplicateIndex = buildQoyodDuplicateIndex(existing);
  } catch (e) {
    return { total: rows.length, sent: 0, skipped: 0, failed: 0, stoppedEarly: false, fatalError: `تعذّر جلب حسابات العميل الحالية للتحقق من التكرار: ${e.message}`, entries };
  }

  let sent = 0, skipped = 0, failed = 0;
  let stoppedEarly = false;

  for (let i = 0; i < rows.length; i++) {
    if (stoppedRef && stoppedRef.current) { stoppedEarly = true; break; }
    const row = rows[i];
    if (onProgress) onProgress(i, rows.length);

    const dupReason = checkAccountDuplicate(row, duplicateIndex);
    if (dupReason) {
      skipped++;
      emit({ code: row.code, nameAr: row.nameAr, nameEn: row.nameEn, status: "skip", reason: dupReason === "code" ? "الرمز موجود مسبقًا بمنشأة العميل" : "الاسم موجود مسبقًا بمنشأة العميل" });
      continue;
    }

    const built = buildQoyodAccountPayload(row);
    if (!built.ok) {
      failed++;
      emit({ code: row.code, nameAr: row.nameAr, nameEn: row.nameEn, status: "error", reason: built.error });
      stoppedEarly = true;
      break; // توقف كامل عند أول فشل — قرار المستخدم الصريح
    }

    try {
      const res = await api("POST", "/accounts", built.payload, key);
      const created = res && res.account;
      if (created && created.id) {
        sent++;
        emit({ code: row.code, nameAr: row.nameAr, nameEn: row.nameEn, status: "success", id: created.id });
      } else {
        failed++;
        emit({ code: row.code, nameAr: row.nameAr, nameEn: row.nameEn, status: "error", reason: "رد غير متوقع من Qoyod (بلا معرّف حساب)" });
        stoppedEarly = true;
        break;
      }
    } catch (e) {
      failed++;
      emit({ code: row.code, nameAr: row.nameAr, nameEn: row.nameEn, status: "error", reason: e.message });
      stoppedEarly = true;
      break; // توقف كامل عند أول فشل — قرار المستخدم الصريح
    }

    if (i < rows.length - 1) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  if (onProgress) onProgress(entries.length, rows.length);
  return { total: rows.length, sent, skipped, failed, stoppedEarly, entries };
}
