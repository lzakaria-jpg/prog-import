/*
 ============================================================================
  تخزين مفاتيح API لكل عميل — أداة رفع المنتجات إلى قيود
  المصدر: qoyod_uploader.html الأصلي (سطر 408-463 بالوثيقة المرجعية)
  ============================================================================
  منقول حرفياً: نفس مفتاح localStorage ("qoyod_keys")، نفس شكل القيمة
  (JSON: اسم العميل -> مفتاح Qoyod)، نصي غير مشفَّر — تماماً كالأصل. راجع
  05_Security_Audit.md من التوثيق: القرار الحالي إبقاؤه كما هو بلا تعديل.
 ============================================================================
*/

const STORAGE_KEY = "qoyod_keys";

export function getSavedKeys() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveKeysToStorage(keys) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}
