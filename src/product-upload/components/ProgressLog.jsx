import React, { useEffect, useRef } from "react";
import { useLanguage } from "../../language.jsx";

/**
 * بطاقة التقدّم والسجل — منقولة من قسم "progressCard" الأصلي (سطر 226-237)
 * ودوال log/setProgress/updateStats (سطر 497-518). كل رسائل السجل ونصوصها
 * الحرفية محفوظة كما هي (منقولة من useProductUploadEngine).
 */
export default function ProgressLog({ eng }) {
  const { t } = useLanguage();
  const { showProgressCard, stats, progress, log } = eng;
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  if (!showProgressCard) return null;

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="qpu-panel">
      <div className="qpu-panel-title">{t({ ar: "التقدّم", en: "Progress" })}</div>

      <div className="qpu-stats-row">
        <div className="qpu-stat-box">
          <div className="qpu-stat-num" style={{ color: "#38bdf8" }}>{stats.total}</div>
          <div className="qpu-stat-label">{t({ ar: "الإجمالي", en: "Total" })}</div>
        </div>
        <div className="qpu-stat-box">
          <div className="qpu-stat-num" style={{ color: "#22c55e" }}>{stats.uploaded}</div>
          <div className="qpu-stat-label">{t({ ar: "تم الرفع", en: "Uploaded" })}</div>
        </div>
        {/* [إضافة 2026-09-07] عدّاد المنتجات المُحدَّثة (PUT) — يظهر فقط لو
            الإعداد الجديد "تحديث بدل تخطي" مفعَّل أو استُخدم بهذه الدفعة. */}
        <div className="qpu-stat-box">
          <div className="qpu-stat-num" style={{ color: "#0ea5e9" }}>{stats.updated}</div>
          <div className="qpu-stat-label">{t({ ar: "تم التحديث", en: "Updated" })}</div>
        </div>
        <div className="qpu-stat-box">
          <div className="qpu-stat-num" style={{ color: "#eab308" }}>{stats.skipped}</div>
          <div className="qpu-stat-label">{t({ ar: "تم التخطي", en: "Skipped" })}</div>
        </div>
        <div className="qpu-stat-box">
          <div className="qpu-stat-num" style={{ color: "#ef4444" }}>{stats.errors}</div>
          <div className="qpu-stat-label">{t({ ar: "الأخطاء", en: "Errors" })}</div>
        </div>
      </div>

      <div className="qpu-progress-bar"><div className="qpu-progress-fill" style={{ width: pct + "%" }} /></div>
      <div className="qpu-hint" style={{ marginBottom: 12 }}>{progress.current} / {progress.total} ({pct}%)</div>

      <div className="qpu-log-area" ref={logRef}>
        {log.map((line, i) => (
          <div key={i} className={"qpu-log-line qpu-log-" + line.cls}>{line.msg}</div>
        ))}
      </div>
    </div>
  );
}
