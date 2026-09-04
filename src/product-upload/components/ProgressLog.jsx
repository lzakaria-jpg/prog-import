import React, { useEffect, useRef } from "react";

/**
 * بطاقة التقدّم والسجل — منقولة من قسم "progressCard" الأصلي (سطر 226-237)
 * ودوال log/setProgress/updateStats (سطر 497-518). كل رسائل السجل ونصوصها
 * الحرفية محفوظة كما هي (منقولة من useProductUploadEngine).
 */
export default function ProgressLog({ eng }) {
  const { showProgressCard, stats, progress, log } = eng;
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  if (!showProgressCard) return null;

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="qpu-panel">
      <div className="qpu-panel-title">التقدّم</div>

      <div className="qpu-stats-row">
        <div className="qpu-stat-box">
          <div className="qpu-stat-num" style={{ color: "#38bdf8" }}>{stats.total}</div>
          <div className="qpu-stat-label">الإجمالي</div>
        </div>
        <div className="qpu-stat-box">
          <div className="qpu-stat-num" style={{ color: "#22c55e" }}>{stats.uploaded}</div>
          <div className="qpu-stat-label">تم الرفع</div>
        </div>
        <div className="qpu-stat-box">
          <div className="qpu-stat-num" style={{ color: "#eab308" }}>{stats.skipped}</div>
          <div className="qpu-stat-label">تم التخطي</div>
        </div>
        <div className="qpu-stat-box">
          <div className="qpu-stat-num" style={{ color: "#ef4444" }}>{stats.errors}</div>
          <div className="qpu-stat-label">الأخطاء</div>
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
