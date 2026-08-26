import React from "react";

// Qoyod brand logo: "QOYOD" in white on dark navy (#162560) background with teal dot under Q
export function QoyodLogo({ width = 130, variant = "light" }) {
  const bg = variant === "light" ? "#162560" : "#FFFFFF";
  const textColor = variant === "light" ? "#FFFFFF" : "#162560";
  const dotColor = "#4A90D9";
  const h = width * 0.32;
  return (
    <svg width={width} height={h} viewBox="0 0 220 70" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Qoyod">
      {/* Q letter */}
      <text x="0" y="52" fontFamily="'Segoe UI', Arial, Helvetica, sans-serif" fontSize="60" fontWeight="700" fill={textColor} letterSpacing="2">Q</text>
      {/* Blue dot under Q */}
      <circle cx="48" cy="62" r="5" fill={dotColor} />
      {/* OYOD */}
      <text x="60" y="52" fontFamily="'Segoe UI', Arial, Helvetica, sans-serif" fontSize="60" fontWeight="700" fill={textColor} letterSpacing="2">OYOD</text>
    </svg>
  );
}

export default QoyodLogo;
