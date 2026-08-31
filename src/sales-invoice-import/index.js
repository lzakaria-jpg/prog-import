/**
 * نقطة التصدير العامة للأداة.
 *
 * الدمج في تطبيق آخر يتم عبر هذا الملف وحده:
 *   import InvoiceImportTool from './sales-invoice-import';
 *
 * المحرك مُصدَّر أيضًا لمن أراد استخدامه بلا واجهة (سكربت، اختبار، خادم) — كل دالة هنا نقية
 * بلا أي اعتماد على React أو DOM.
 */

export { default } from './InvoiceImportTool.jsx';
export { default as InvoiceImportTool } from './InvoiceImportTool.jsx';
export { default as useSalesInvoiceImportEngine } from './useSalesInvoiceImportEngine.js';

// المحرك — ثوابت
export { COLUMNS, COL_KEYS, HEADER_COLS, ITEM_COLS, MAPPING_DEFS, TEMPLATE_HEADER_SYNONYMS, MONTH_NAMES } from './engine/constants.js';
// المحرك — أدوات نصية وتواريخ
export { escapeXml, norm, stripArabicMarks, normKey, isBlank, round2 } from './engine/text.js';
export { parseDateParts, formatDateParts, toDMY, fromDMY, expandYear, setDateSep, getDateSep, reformatAllDates } from './engine/dates.js';
// المحرك — مطابقة الأعمدة وتحليل شكلها
export { colLetterToIndex, indexToColLetter, guessColumnsBatch, detectTemplateLayout, similarity } from './engine/columnMatching.js';
export { analyzeColumnShape, columnValues, sampleValuesFor, columnStats, refineReferenceGuesses, bestTemplateLocationFor, detectStockFormat, normalizeDateToDMY, dateLikeRatio } from './engine/columnShape.js';
// المحرك — الضريبة والخصم
export { normalizeYesNo, normalizePercentValue, normalizeDiscountPercentNumber, parseRateFromDropdownLabel, matchNearestTaxRate, snapTaxCategory, snapTaxCategoriesInRows, deriveTaxInclusive, deriveTaxRate } from './engine/taxAndDiscount.js';
// المحرك — الصفوف والتجميع والفهارس
export { createRow, fillDownHeaderFields, compressHeaderFields } from './engine/rows.js';
export { groupRowsByInvoiceRef } from './engine/grouping.js';
export { rowGet, buildProductsIndex, buildStockIndex, buildCustomersIndex } from './engine/referenceIndexes.js';
export { resolveNamesToRefs } from './engine/resolveNames.js';
export { guessInvoiceImportMapping, getMissingRequiredAfterDerivation, applyInvoiceImportMapping } from './engine/invoiceImportMapping.js';
export { checkStockSequential } from './engine/stockSimulation.js';
export { runValidation, findInvoicesMissingLocation, getValidOnlyRows } from './engine/validation.js';
export { applyPastedGrid, isMultiCellPaste } from './engine/paste.js';

// إدخال وإخراج الملفات
export { parseCsvText } from './io/csvParser.js';
export { readGenericSpreadsheet } from './io/readGenericSpreadsheet.js';
export { parseTemplateFile } from './io/template.js';
export { buildRowXml, generateFinalXlsx, triggerXlsxDownload } from './io/xmlExport.js';
