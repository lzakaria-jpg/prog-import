/**
 * نقطة التصدير العامة للأداة.
 *
 * الدمج في تطبيق آخر يتم عبر هذا الملف وحده:
 *   import InvoiceImportTool from './invoice-import';
 *
 * المحرك مُصدَّر أيضاً لمن أراد استخدامه بلا واجهة (سكربت، اختبار، خادم).
 */

export { default } from './InvoiceImportTool.jsx';
export { default as InvoiceImportTool } from './InvoiceImportTool.jsx';

// المحرك — دوال نقية بلا اعتماد على React
export { readTemplate, buildTemplateFile } from './engine/template.js';
export { detectMapping, parseSource, normalizeSourceHeader, SOURCE_FIELD_ALIASES } from './engine/parseSource.js';
export { collectDecisions, runPipeline } from './engine/pipeline.js';
export { transformAll, buildInvoiceRows, computeLineFields } from './engine/transform.js';
export { validateAll } from './engine/validate.js';
export {
  buildCustomerIndex, buildProductIndex, matchCustomer, matchProduct,
  matchListValue, matchTaxByRate, resolveInvoiceTaxes, checkStock,
} from './engine/resolve.js';
export { ENGINE_DEFAULTS, TEMPLATE_FIELDS, REQUIRED_FIELDS, DOC_DISCOUNT_FIELDS } from './engine/constants.js';
export { round, toNum, toStr, parseDate, formatDate, normalizeAr, normalizeCode } from './engine/num.js';

// إدخال وإخراج الملفات
export { readWorkbook, mapReferenceRecords, detectReferenceMapping } from './io/readWorkbook.js';
export { exportInvoiceTemplate, exportReturns, exportReport, downloadBlob } from './io/exportFiles.js';
