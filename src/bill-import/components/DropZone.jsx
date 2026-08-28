import { useRef, useState } from 'react';

/** منطقة سحب وإفلات لملف واحد */
export default function DropZone({ accept, label, onFile }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`qbi-drop${over ? ' over' : ''}`}
      onClick={() => ref.current.click()}
      onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      {label}
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); }}
      />
    </div>
  );
}
