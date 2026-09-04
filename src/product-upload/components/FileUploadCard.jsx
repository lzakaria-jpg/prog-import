import React, { useRef, useState } from "react";

/**
 * بطاقة رفع ملف Excel — منقولة من قسم "Excel File" الأصلي (سطر 164-172) بما
 * فيه السحب والإفلات (drag&drop، سطر 357-368 بالأصل).
 */
export default function FileUploadCard({ eng }) {
  const { fileName, handleFile } = eng;
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const onChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleFile(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="qpu-panel">
      <div className="qpu-panel-title">ملف Excel</div>
      <div
        className={"qpu-file-zone" + (dragOver ? " dragover" : "")}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current && inputRef.current.click()}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={onChange} style={{ display: "none" }} />
        <div className="qpu-file-icon">📊</div>
        <div className="qpu-file-text">اسحب ملف Excel هنا أو اضغط للاختيار</div>
        {fileName && <div className="qpu-file-name">{fileName}</div>}
      </div>
    </div>
  );
}
