import React, { createContext, useContext, useState, useEffect } from "react";

const LanguageContext = createContext({ lang: "ar", t: (d) => (d && d.ar) || "", dir: "rtl", toggle: () => {}, setLang: () => {} });

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState("ar");

  // t() accepts either:
  //  - a plain string (returned as-is)
  //  - an object { ar, en } and returns the value for the active language
  const t = (d) => {
    if (d == null) return "";
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => t(x)).join("");
    return d[lang] ?? d.ar ?? Object.values(d)[0] ?? "";
  };

  const toggle = () => setLang((l) => (l === "ar" ? "en" : "ar"));
  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [dir, lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggle, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

// Convenience: returns the appropriate text-direction class helpers
export const isRTL = (lang) => lang === "ar";
