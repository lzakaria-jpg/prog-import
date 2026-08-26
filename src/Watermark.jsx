import React from "react";

// Subtle, low-opacity accounting-themed watermark layer.
// Tiled pattern (calculators, coins, numbers, %) plus a couple of large
// floating glyphs in the corners for visual depth.
const PATTERN = encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'>
  <g fill='none' stroke='#CBD5E1' stroke-width='2' opacity='0.55'>
    <rect x='28' y='30' width='62' height='84' rx='9'/>
    <rect x='38' y='40' width='42' height='20' rx='3'/>
    <circle cx='50' cy='72' r='5'/><circle cx='66' cy='72' r='5'/><circle cx='82' cy='72' r='5'/>
    <circle cx='50' cy='92' r='5'/><circle cx='66' cy='92' r='5'/><circle cx='82' cy='92' r='5'/>
  </g>
  <g fill='none' stroke='#CBD5E1' stroke-width='2' opacity='0.5'>
    <circle cx='250' cy='70' r='32'/>
    <path d='M238 70h24'/>
    <path d='M250 58v24'/>
  </g>
  <text x='150' y='205' font-family='Cairo, Segoe UI, sans-serif' font-size='46' font-weight='700' fill='#CBD5E1' opacity='0.45'>1234</text>
  <text x='60' y='270' font-family='Cairo, Segoe UI, sans-serif' font-size='40' font-weight='700' fill='#CBD5E1' opacity='0.4'>%</text>
  <text x='235' y='265' font-family='Cairo, Segoe UI, sans-serif' font-size='34' font-weight='700' fill='#CBD5E1' opacity='0.4'>Σ</text>
</svg>`);

export function Watermark() {
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
          backgroundImage: `url("data:image/svg+xml,${PATTERN}")`,
          backgroundRepeat: "repeat",
          backgroundSize: "320px 320px",
          opacity: 0.5,
        }}
      />
      {/* Large faint floating glyphs for depth */}
      <svg
        width="320" height="320" viewBox="0 0 100 100"
        style={{ position: "absolute", right: "-40px", top: "8%", opacity: 0.05, color: "#162560" }}
        fill="currentColor"
      >
        <rect x="8" y="6" width="84" height="88" rx="12" fill="none" stroke="currentColor" strokeWidth="4" />
        <rect x="18" y="16" width="64" height="22" rx="4" fill="currentColor" opacity="0.5" />
        <circle cx="34" cy="52" r="6" /><circle cx="50" cy="52" r="6" /><circle cx="66" cy="52" r="6" />
        <circle cx="34" cy="68" r="6" /><circle cx="50" cy="68" r="6" /><circle cx="66" cy="68" r="6" />
      </svg>
      <svg
        width="280" height="280" viewBox="0 0 100 100"
        style={{ position: "absolute", left: "-30px", bottom: "4%", opacity: 0.05, color: "#4A90D9" }}
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
