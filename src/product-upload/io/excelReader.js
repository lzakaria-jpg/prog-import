/*
 ============================================================================
  قراءة ملف Excel — أداة رفع المنتجات إلى قيود
  المصدر: qoyod_uploader.html الأصلي، دالة handleFile (قسم القراءة فقط،
  سطر 293-350 بالوثيقة المرجعية) — منقول حرفياً، فقط أُعيد تغليفه بوعد
  (Promise) بدل onload/onerror مباشرة على DOM، ليستدعيه الهوك المركزي.

  ملاحظة تبعية: هذا المشروع يستخدم مكتبة "xlsx" (SheetJS) نفسها فعلياً في كل
  أدواته الأخرى (bill-import, AccountsTool, ...)، وهي نفس المكتبة والإصدار
  المستخدَمين بالأداة الأصلية (0.18.5 عبر CDN) — فلا حاجة لأي اعتمادية جديدة.
 ============================================================================
*/
import * as XLSX from "xlsx";

/**
 * يقرأ أول ورقة من ملف Excel ويحوّلها لمصفوفة صفوف خام (header:1, defval:null)
 * — نفس استدعاء XLSX.utils.sheet_to_json الحرفي بالأصل.
 * @param {File} file
 * @returns {Promise<any[][]>}
 */
export function readWorkbookRows(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Error reading file"));
    reader.readAsArrayBuffer(file);
  });
}
