import React from "react";

// Subtle, low-opacity watermark layers kept behind the readable application content.
const JOURNAL_PATTERN = encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'>
  <g fill='none' stroke='#CBD5E1' stroke-width='2' opacity='0.14'>
    <path d='M30 65h90M30 95h90M30 125h90M30 155h90'/>
    <path d='M48 50v120M82 50v120'/>
    <path d='M190 80h82M190 115h82M190 150h82'/>
    <path d='M210 65v105M246 65v105'/>
  </g>
  <text x='35' y='230' font-family='Cairo, Segoe UI, sans-serif' font-size='34' font-weight='700' fill='#CBD5E1' opacity='0.12'>مدين</text>
  <text x='190' y='230' font-family='Cairo, Segoe UI, sans-serif' font-size='34' font-weight='700' fill='#CBD5E1' opacity='0.12'>دائن</text>
</svg>`);

const TREE_PATTERN = encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'>
  <g fill='none' stroke='#7DD3FC' stroke-width='2' opacity='0.34'>
    <path d='M48 42v228M48 82h72M48 142h72M48 202h72'/>
    <path d='M120 82v28M120 142v28M120 202v28'/>
    <path d='M120 110h88M120 170h88M120 230h88'/>
    <path d='M208 110v22M208 170v22M208 230v22'/>
    <circle cx='48' cy='42' r='10'/><circle cx='120' cy='82' r='9'/><circle cx='120' cy='142' r='9'/><circle cx='120' cy='202' r='9'/>
    <circle cx='208' cy='110' r='7'/><circle cx='208' cy='170' r='7'/><circle cx='208' cy='230' r='7'/>
  </g>
  <g fill='none' stroke='#12B886' stroke-width='2' opacity='0.28'>
    <rect x='245' y='42' width='42' height='34' rx='5'/><path d='M249 42l6-7h14l6 7'/>
    <rect x='245' y='142' width='42' height='34' rx='5'/><path d='M249 142l6-7h14l6 7'/>
  </g>
  <text x='32' y='292' font-family='Cairo, Segoe UI, sans-serif' font-size='30' font-weight='700' fill='#7DD3FC' opacity='0.18'>شجرة الحسابات</text>
</svg>`);

export function Watermark({ type = "journal" }) {
  const pattern = type === "tree" ? TREE_PATTERN : JOURNAL_PATTERN;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url("data:image/svg+xml,${pattern}")`,
          backgroundRepeat: "repeat",
          backgroundSize: "320px 320px",
          opacity: type === "tree" ? 0.42 : 0.12,
        }}
      />
      {type === "tree" && <svg
        width="360" height="360" viewBox="0 0 100 100"
        style={{ position: "absolute", right: "4%", top: "18%", opacity: 0.035, color: "#7DD3FC" }}
        fill="none" stroke="currentColor" strokeWidth="2.5"
      >
        <path d="M50 10v80M50 30h28M50 52h28M50 74h28" />
        <path d="M78 30v10M78 52v10M78 74v10" />
        <circle cx="50" cy="10" r="5" /><circle cx="50" cy="30" r="4" /><circle cx="50" cy="52" r="4" /><circle cx="50" cy="74" r="4" />
        <circle cx="78" cy="40" r="3" /><circle cx="78" cy="62" r="3" /><circle cx="78" cy="84" r="3" />
      </svg>}
      {type === "journal" && <svg
        width="320" height="320" viewBox="0 0 100 100"
        style={{ position: "absolute", right: "-40px", top: "8%", opacity: 0.012, color: "#162560" }}
        fill="currentColor"
      >
        <rect x="8" y="6" width="84" height="88" rx="12" fill="none" stroke="currentColor" strokeWidth="4" />
        <rect x="18" y="16" width="64" height="22" rx="4" fill="currentColor" opacity="0.5" />
        <circle cx="34" cy="52" r="6" /><circle cx="50" cy="52" r="6" /><circle cx="66" cy="52" r="6" />
        <circle cx="34" cy="68" r="6" /><circle cx="50" cy="68" r="6" /><circle cx="66" cy="68" r="6" />
      </svg>}
      {type === "journal" && <svg
        width="280" height="280" viewBox="0 0 100 100"
        style={{ position: "absolute", left: "-30px", bottom: "4%", opacity: 0.012, color: "#4A90D9" }}
        fill="none" stroke="currentColor" strokeWidth="4"
      >
        <circle cx="50" cy="50" r="38" />
        <path d="M34 50h32" />
        <path d="M50 34v32" />
      </svg>}
    </div>
  );
}

export default Watermark;
