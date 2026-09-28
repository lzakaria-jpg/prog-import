import React, { useMemo } from "react";
import { useLanguage } from "../../language.jsx";
import { matchKey, suggestLinks, describeBundleIssue } from "../engine/parsing.js";

/**
 * [إضافة 2026-09-28] مراجعة المنتجات المجمّعة (Recipe) ومكوّناتها قبل الرفع.
 * أي مكوّن لا يطابق حرفياً منتجاً بالملف أو بمنشأة العميل يُعرَض هنا ليربطه
 * المستخدم يدوياً (أو يُنشئه مادة أولية جديدة) — الرفع ممنوع لين تنحل كلها.
 * الاقتراحات للعرض فقط، لا يُطبَّق أي ربط إلا بضغطة صريحة.
 */
export default function BundleReviewCard({ eng }) {
  const { t } = useLanguage();
  const {
    excelData, bundlePlan, bomSheetName, bomLines, bomErrors, previewProducts,
    componentLinks, setComponentLink, fetchReferenceData, referenceDataLoading, apiKey,
  } = eng;

  const candidates = useMemo(() => {
    const out = [];
    excelData.forEach((p, i) => {
      out.push({
        name: p.name,
        label: `${p.name}${p.sku ? ` [${p.sku}]` : ""} · ${t({ ar: "بالملف", en: "in file" })} #${i + 1}`,
        link: { kind: "file", index: i },
      });
    });
    (previewProducts || []).forEach((p) => {
      const name = p.name_ar || p.name_en || "";
      out.push({
        name,
        label: `${name}${p.sku ? ` [${p.sku}]` : ""} · ${t({ ar: "موجود بقيود", en: "in Qoyod" })} #${p.id}`,
        link: { kind: "existing", id: p.id, unitTypeId: p.unit_type || null },
      });
    });
    return out;
  }, [excelData, previewProducts, t]);

  const byLabel = useMemo(() => new Map(candidates.map((c) => [c.label, c.link])), [candidates]);
  const existingById = useMemo(() => new Map((previewProducts || []).map((p) => [p.id, p])), [previewProducts]);

  if (!bundlePlan && !bomErrors.length) return null;

  const linkLabel = (link) => {
    if (!link) return t({ ar: "غير مربوط", en: "Unlinked" });
    if (link.kind === "file") return `${excelData[link.index]?.name || "?"} · ${t({ ar: "بالملف", en: "in file" })}`;
    if (link.kind === "existing") {
      const p = existingById.get(link.id);
      return `${p ? (p.name_ar || p.name_en) : `#${link.id}`} · ${t({ ar: "موجود بقيود", en: "in Qoyod" })}`;
    }
    if (link.kind === "create") return t({ ar: "مادة أولية جديدة", en: "New raw material" });
    return "?";
  };

  const unresolved = bundlePlan ? bundlePlan.unresolved : [];
  const issues = bundlePlan ? bundlePlan.issues : [];
  const recipes = bundlePlan ? [...bundlePlan.recipes.entries()] : [];
  const manualLinks = Object.entries(componentLinks);
  const ready = !unresolved.length && !issues.length && !bomErrors.length;

  return (
    <div className="qpu-panel">
      <div className="qpu-panel-title">{t({ ar: "المنتجات المجمّعة ومكوّناتها", en: "Bundled products & components" })}</div>
      <div className="qpu-hint" style={{ marginBottom: 10 }}>
        {bomSheetName
          ? t({ ar: `شيت المكوّنات: "${bomSheetName}" — ${bomLines.length} سطر، ${recipes.length} منتج مجمّع`, en: `Components sheet: "${bomSheetName}" — ${bomLines.length} line(s), ${recipes.length} bundle(s)` })
          : t({ ar: "لا يوجد شيت مكوّنات بالملف", en: "No components sheet in the file" })}
      </div>

      {previewProducts === null && (
        <div className="qpu-note-box warn" style={{ marginBottom: 10 }}>
          {t({ ar: "منتجات منشأة العميل الحالية لم تُجلَب بعد — مكوّن موجود مسبقاً بقيود سيظهر غير مربوط لين تجلبها.", en: "The customer's existing products haven't been fetched yet — components that already exist in Qoyod show as unlinked until you fetch them." })}
          {" "}
          <button type="button" className="qpu-btn secondary" onClick={() => fetchReferenceData()} disabled={referenceDataLoading || !apiKey.trim()}>
            {referenceDataLoading ? t({ ar: "جارٍ الجلب...", en: "Fetching..." }) : t({ ar: "جلب بيانات المنشأة", en: "Fetch company data" })}
          </button>
        </div>
      )}

      {ready ? (
        <div className="qpu-note-box" style={{ marginBottom: 10 }}>✅ {t({ ar: "كل المكوّنات مربوطة — جاهز للرفع", en: "All components linked — ready to upload" })}</div>
      ) : (
        <div className="qpu-note-box err" style={{ marginBottom: 10 }}>
          ⛔ {t({ ar: `الرفع موقوف: ${unresolved.length} مكوّن غير مربوط، ${issues.length + bomErrors.length} خطأ بنيوي`, en: `Upload blocked: ${unresolved.length} unlinked component(s), ${issues.length + bomErrors.length} structural issue(s)` })}
        </div>
      )}

      {(bomErrors.length > 0 || issues.length > 0) && (
        <ul style={{ margin: "0 0 12px", paddingInlineStart: 20 }}>
          {bomErrors.map((e, k) => (
            <li key={`b${k}`} className="qpu-hint">
              {e.reason === "bad_qty"
                ? t({ ar: `سطر ${e.rowNumber}: "${e.component}" في "${e.parent}" بلا كمية صالحة`, en: `Row ${e.rowNumber}: "${e.component}" in "${e.parent}" has no valid quantity` })
                : t({ ar: `سطر ${e.rowNumber}: ناقص المنتج المجمّع أو المكوّن`, en: `Row ${e.rowNumber}: missing bundle or component` })}
            </li>
          ))}
          {issues.map((x, k) => <li key={`i${k}`} className="qpu-hint">{describeBundleIssue(x, t)}</li>)}
        </ul>
      )}

      {unresolved.length > 0 && (
        <>
          <datalist id="qpu-component-candidates">
            {candidates.map((c) => <option key={c.label} value={c.label} />)}
          </datalist>
          <div className="qpu-table-wrap" style={{ maxHeight: "none", overflow: "visible", marginBottom: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>{t({ ar: "المكوّن كما بالملف", en: "Component as in file" })}</th>
                  <th>{t({ ar: "مستخدم في", en: "Used in" })}</th>
                  <th>{t({ ar: "اربطه بـ", en: "Link to" })}</th>
                </tr>
              </thead>
              <tbody>
                {unresolved.map((u) => {
                  const sugg = suggestLinks(u.ref, candidates);
                  return (
                    <tr key={u.key}>
                      <td><b>{u.ref}</b></td>
                      <td className="qpu-hint">{u.usedBy.join("، ")}</td>
                      <td>
                        <input
                          list="qpu-component-candidates"
                          className="qpu-map-select"
                          style={{ minWidth: 260 }}
                          placeholder={t({ ar: "ابحث عن منتج بالملف أو بقيود...", en: "Search a product in the file or Qoyod..." })}
                          onChange={(e) => { const link = byLabel.get(e.target.value); if (link) setComponentLink(u.key, link); }}
                        />
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                          {sugg.map((c) => (
                            <button key={c.label} type="button" className="qpu-btn ghost" onClick={() => setComponentLink(u.key, c.link)} title={c.label}>
                              {t({ ar: "اقتراح:", en: "Suggest:" })} {c.label}
                            </button>
                          ))}
                          <button type="button" className="qpu-btn secondary" onClick={() => setComponentLink(u.key, { kind: "create" })}>
                            ➕ {t({ ar: "إنشاؤه مادة أولية جديدة", en: "Create as new raw material" })}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {manualLinks.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="qpu-hint" style={{ fontWeight: 700, marginBottom: 6 }}>{t({ ar: "روابط يدوية", en: "Manual links" })}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {manualLinks.map(([key, link]) => (
              <span key={key} className="qpu-badge blue" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {key} ← {linkLabel(link)}
                <button type="button" className="qpu-btn ghost" style={{ padding: "0 6px" }} onClick={() => setComponentLink(key, null)} title={t({ ar: "إلغاء الربط", en: "Remove link" })}>✕</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {recipes.length > 0 && (
        <details>
          <summary className="qpu-hint" style={{ cursor: "pointer" }}>{t({ ar: `عرض الوصفات (${recipes.length})`, en: `Show recipes (${recipes.length})` })}</summary>
          <div className="qpu-table-wrap" style={{ maxHeight: "none", overflow: "visible", marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>{t({ ar: "المنتج المجمّع", en: "Bundle" })}</th>
                  <th>{t({ ar: "المكوّن", en: "Component" })}</th>
                  <th>{t({ ar: "الكمية", en: "Qty" })}</th>
                  <th>{t({ ar: "مربوط بـ", en: "Linked to" })}</th>
                </tr>
              </thead>
              <tbody>
                {recipes.flatMap(([pi, comps]) => comps.map((c, k) => (
                  <tr key={`${pi}-${k}`}>
                    <td>{k === 0 ? <b>{excelData[pi]?.name}</b> : ""}</td>
                    <td>{c.ref}</td>
                    <td>{c.qty}</td>
                    <td>{c.target ? linkLabel(c.target) : <span className="qpu-badge yellow">{t({ ar: "غير مربوط", en: "Unlinked" })}</span>}
                      {c.target && matchKey(c.ref) in componentLinks ? " ✋" : ""}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
