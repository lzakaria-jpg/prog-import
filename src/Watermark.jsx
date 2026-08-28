import React from "react";

// Subtle, low-opacity watermark layers kept behind the readable application content.
const JOURNAL_PATTERN = encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'>
  <g fill='none' stroke='#CBD5E1' stroke-width='2' opacity='0.28'>
    <path d='M30 65h90M30 95h90M30 125h90M30 155h90'/>
    <path d='M48 50v120M82 50v120'/>
    <path d='M190 80h82M190 115h82M190 150h82'/>
    <path d='M210 65v105M246 65v105'/>
  </g>
  <text x='35' y='230' font-family='Cairo, Segoe UI, sans-serif' font-size='34' font-weight='700' fill='#CBD5E1' opacity='0.22'>مدين</text>
  <text x='190' y='230' font-family='Cairo, Segoe UI, sans-serif' font-size='34' font-weight='700' fill='#CBD5E1' opacity='0.22'>دائن</text>
</svg>`);

const TREE_PATTERN = encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'>
  <g fill='none' stroke='#CBD5E1' stroke-width='2' opacity='0.28'>
    <path d='M72 48v210M72 90h70M72 145h70M72 200h70'/>
    <path d='M142 90v30M142 145v30M142 200v30'/>
    <path d='M142 120h70M142 175h70M142 230h70'/>
    <circle cx='55' cy='48' r='9'/><circle cx='142' cy='90' r='8'/><circle cx='142' cy='145' r='8'/><circle cx='142' cy='200' r='8'/>
  </g>
  <text x='32' y='292' font-family='Cairo, Segoe UI, sans-serif' font-size='30' font-weight='700' fill='#CBD5E1' opacity='0.22'>شجرة الحسابات</text>
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
          opacity: 0.28,
        }}
      />
      {/* Decorative marks remain faint and sit behind .app-content. */}
      <svg
        width="320" height="320" viewBox="0 0 100 100"
        style={{ position: "absolute", right: "-40px", top: "8%", opacity: 0.025, color: "#162560" }}
        fill="currentColor"
      >
        <rect x="8" y="6" width="84" height="88" rx="12" fill="none" stroke="currentColor" strokeWidth="4" />
        <rect x="18" y="16" width="64" height="22" rx="4" fill="currentColor" opacity="0.5" />
        <circle cx="34" cy="52" r="6" /><circle cx="50" cy="52" r="6" /><circle cx="66" cy="52" r="6" />
        <circle cx="34" cy="68" r="6" /><circle cx="50" cy="68" r="6" /><circle cx="66" cy="68" r="6" />
      </svg>
      <svg
        width="280" height="280" viewBox="0 0 100 100"
        style={{ position: "absolute", left: "-30px", bottom: "4%", opacity: 0.025, color: "#4A90D9" }}
        fill="none" stroke="currentColor" strokeWidth="4"
      >
        <circle cx="50" cy="50" r="38" />
        <path d="M34 50h32" />
        <path d="M50 34v32" />
      </svg>
    </div>
  );
}

export default Watermark;
