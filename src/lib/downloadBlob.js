// كانت نفس الدالة معرَّفة حرفياً بملفين مختلفين (lib/excelExport.js
// وproduct-upload/io/openingBalanceExport.js) — أُخرجت هنا بلا أي تغيير
// بالمنطق، والملفان يستوردانها من هنا ويعيدان تصديرها للحفاظ على كل مسارات
// الاستيراد الحالية بلا تغيير.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
