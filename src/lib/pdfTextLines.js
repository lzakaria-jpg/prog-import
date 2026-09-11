// يستخرج نص PDF كأسطر (سطر لكل مجموعة عناصر نص متقاربة الإحداثي Y) — كانت نفس
// هذي الحلقة مكررة حرفياً بين excelCore.js (readAnyEntriesFileRows) و
// chatAttachmentText.js (readPdfLines)، بفارق وحيد: excelCore.js يفصل بين
// الكلمات بمسافتين (علشان lineToRow بعدها يعتمد على "مسافتين فأكثر" كفاصل
// أعمدة) بينما chatAttachmentText.js يحتاج نصاً عادياً بمسافة وحدة. الفاصل
// صار باراميتر (wordGap) بدل ما يتكرر، بلا أي تغيير على سلوك أي من الطرفين.
export async function extractPdfTextLines(file, { wordGap = " " } = {}) {
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
      currentLine += item.str + wordGap;
      lastY = y;
    });
    if (currentLine.trim()) lines.push(currentLine);
  }
  return lines;
}
