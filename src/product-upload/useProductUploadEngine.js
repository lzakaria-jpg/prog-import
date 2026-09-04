/*
 ============================================================================
  useProductUploadEngine — الهوك المركزي لأداة رفع المنتجات إلى قيود
  المصدر: qoyod_uploader.html الأصلي (طبقة الواجهة ui.js من توثيق opencode)
  ============================================================================
  كل الحالة والمنطق هنا منقولان حرفياً من startUpload/handleFile/saveKey/...
  الأصلية، فقط أُعيد تغليفهما بـReact state/refs بدل document.getElementById
  المباشر، ونوافذ alert()/confirm() المتصفح استُبدلت برسائل/نافذة تأكيد داخل
  هوية الموقع (uploadAlert + ConfirmDialog) — تماماً كما فعلت أداة استيراد
  فواتير المبيعات مع نفس النوافذ الأصلية. النصوص الحرفية للرسائل لم تتغيّر.
 ============================================================================
*/
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildProductsFromRows, buildProductPayload, chooseTax, resolveAccountId } from "./engine/parsing.js";
import { api, fetchAll } from "./io/network.js";
import { getSavedKeys, saveKeysToStorage } from "./io/keyStorage.js";
import { readWorkbookRows } from "./io/excelReader.js";

const DEFAULT_REVENUE_ACCT = "4101";
const DEFAULT_EXPENSE_ACCT = "5101";

export default function useProductUploadEngine() {
  // ---- API key management (أصل: سطر 408-463) ----
  const [apiKey, setApiKey] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [savedKeys, setSavedKeys] = useState(() => getSavedKeys());
  const [removeKeyTarget, setRemoveKeyTarget] = useState(null); // اسم العميل المطلوب حذف مفتاحه (لتأكيد الحذف)

  const toggleKeyVisibility = useCallback(() => setKeyVisible((v) => !v), []);

  const saveKey = useCallback(() => {
    const key = apiKey.trim();
    const name = customerName.trim();
    if (!key) return "Enter API key";
    if (!name) return "Enter customer name";
    const keys = { ...getSavedKeys(), [name]: key };
    saveKeysToStorage(keys);
    setSavedKeys(keys);
    setCustomerName("");
    return null;
  }, [apiKey, customerName]);

  const loadKey = useCallback((name) => {
    const keys = getSavedKeys();
    if (keys[name]) setApiKey(keys[name]);
  }, []);

  const requestRemoveKey = useCallback((name) => setRemoveKeyTarget(name), []);
  const cancelRemoveKey = useCallback(() => setRemoveKeyTarget(null), []);
  const confirmRemoveKey = useCallback(() => {
    if (!removeKeyTarget) return;
    const keys = getSavedKeys();
    delete keys[removeKeyTarget];
    saveKeysToStorage(keys);
    setSavedKeys(keys);
    setRemoveKeyTarget(null);
  }, [removeKeyTarget]);

  // ---- Excel file (أصل: سطر 293-354) ----
  const [fileName, setFileName] = useState("");
  const [excelData, setExcelData] = useState([]);
  const [uploadAlert, setUploadAlert] = useState(null); // بديل alert() — نفس النص الحرفي

  const dismissAlert = useCallback(() => setUploadAlert(null), []);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setFileName(file.name);
    try {
      const rows = await readWorkbookRows(file);
      const parsed = buildProductsFromRows(rows);
      if (!parsed.headerFound) {
        setUploadAlert("Could not find a header row in the Excel file.");
        setExcelData([]);
        return;
      }
      setExcelData(parsed.data);
      setUploadAlert(null);
    } catch (err) {
      setUploadAlert("Error reading Excel: " + err.message);
    }
  }, []);

  // ---- Settings (أصل: revenueAcct/expenseAcct/taxToggle/dupToggle) ----
  const [revenueAcct, setRevenueAcct] = useState(DEFAULT_REVENUE_ACCT);
  const [expenseAcct, setExpenseAcct] = useState(DEFAULT_EXPENSE_ACCT);
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [skipDups, setSkipDups] = useState(true);
  const toggleTaxInclusive = useCallback(() => setTaxInclusive((v) => !v), []);
  const toggleSkipDups = useCallback(() => setSkipDups((v) => !v), []);

  // ---- Upload run state (أصل: سطر 242-250 و520-773) ----
  const [log, setLog] = useState([]);
  const [stats, setStats] = useState({ total: 0, uploaded: 0, skipped: 0, errors: 0 });
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [uploading, setUploading] = useState(false);
  const [showProgressCard, setShowProgressCard] = useState(false);
  const stoppedRef = useRef(false);

  const appendLog = useCallback((msg, cls = "info") => {
    setLog((prev) => [...prev, { msg, cls }]);
  }, []);

  const stopUpload = useCallback(() => {
    stoppedRef.current = true;
  }, []);

  const startUpload = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) { setUploadAlert("Enter API key"); return; }
    if (!excelData.length) { setUploadAlert("Upload an Excel file first"); return; }

    stoppedRef.current = false;
    setLog([]);
    setShowProgressCard(true);
    setUploading(true);
    let uploaded = 0, skipped = 0, errors = 0;
    setStats({ total: excelData.length, uploaded: 0, skipped: 0, errors: 0 });
    setProgress({ current: 0, total: excelData.length });

    const unitsCache = {};
    const accountsByName = {};
    const accountsByCode = {};
    const categoriesCache = {};
    let selectedTaxId = null;
    const existingProducts = { skus: new Set(), names: new Set() };

    const revCode = revenueAcct.trim() || DEFAULT_REVENUE_ACCT;
    const expCode = expenseAcct.trim() || DEFAULT_EXPENSE_ACCT;

    const updateStats = () => setStats({ total: excelData.length, uploaded, skipped, errors });
    const setProg = (current) => setProgress({ current, total: excelData.length });

    try {
      appendLog("=== Starting Upload ===", "header");

      // 1. Fetch accounts
      appendLog("Fetching chart of accounts...", "info");
      const accounts = await fetchAll("/accounts", key);
      accounts.forEach((a) => {
        const nameAr = (a.name_ar || "").toLowerCase();
        const nameEn = (a.name_en || "").toLowerCase();
        const code = String(a.code || "").trim();
        if (nameAr) accountsByName[nameAr] = a;
        if (nameEn) accountsByName[nameEn] = a;
        if (code) accountsByCode[code] = a;
      });
      appendLog(`  Found ${accounts.length} accounts`, "info");

      const defaultRev = accountsByCode[revCode];
      const defaultExp = accountsByCode[expCode];
      if (defaultRev) appendLog(`  Revenue account ${revCode}: ${defaultRev.name_ar} (ID: ${defaultRev.id})`, "success");
      else appendLog(`  WARNING: Account ${revCode} not found!`, "error");
      if (defaultExp) appendLog(`  Expense account ${expCode}: ${defaultExp.name_ar} (ID: ${defaultExp.id})`, "success");
      else appendLog(`  WARNING: Account ${expCode} not found!`, "error");

      // 2. Fetch taxes (required for product creation), prefer rate 15%
      appendLog("\nFetching taxes...", "header");
      try {
        const taxes = await fetchAll("/taxes", key);
        const chosen = chooseTax(taxes);
        if (chosen) selectedTaxId = chosen.id;
        const chosenRate = chosen
          ? chosen.rate !== undefined ? chosen.rate : chosen.percentage !== undefined ? chosen.percentage : chosen.percent !== undefined ? chosen.percent : ""
          : "";
        appendLog(
          `  Found ${taxes.length} taxes. Using tax: "${chosen ? chosen.name || chosen.id : "NONE"}"${chosen ? ` (rate ${chosenRate}, ID ${chosen.id})` : ""}`,
          chosen ? "success" : "error"
        );
        if (!chosen) appendLog("  WARNING: No taxes found - products will NOT be creatable without a tax!", "error");
      } catch (e) {
        appendLog(`  Failed to fetch taxes: ${e.message}`, "error");
      }

      // 2. Fetch units
      appendLog("Fetching product units...", "info");
      const units = await fetchAll("/product_unit_types", key);
      units.forEach((u) => { unitsCache[(u.unit_name || "").toLowerCase()] = u; });
      appendLog(`  Found ${units.length} units: ${units.map((u) => u.unit_name).join(", ")}`, "info");

      // 2b. Fetch categories and ensure the needed ones exist
      appendLog("\nProcessing product categories...", "header");
      const categories = await fetchAll("/categories", key);
      categories.forEach((c) => {
        const k = (c.name || "").trim().toLowerCase();
        if (k) categoriesCache[k] = c;
      });
      appendLog(`  Found ${categories.length} existing categories`, "info");

      const needed = new Map(); // key -> { name }
      excelData.forEach((p) => {
        const c = (p.category || "").trim();
        if (!c) return;
        const k = c.toLowerCase();
        if (!needed.has(k)) needed.set(k, { name: c });
      });

      if (needed.size > 0) {
        for (const [k, meta] of needed) {
          if (stoppedRef.current) break;
          if (categoriesCache[k]) continue;
          try {
            appendLog(`  Creating category: ${meta.name}`, "info");
            const res = await api("POST", "/categories", { category: { name: meta.name } }, key);
            if (res.category) {
              categoriesCache[k] = res.category;
              appendLog(`  Category created: ${meta.name} (ID: ${res.category.id})`, "success");
            } else {
              appendLog(`  FAILED to create category: ${meta.name}`, "error");
            }
          } catch (e) {
            appendLog(`  Failed to create category '${meta.name}': ${e.message}`, "error");
          }
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      appendLog(`  Categories ready: ${Object.keys(categoriesCache).length}`, "info");

      // 3. Fetch existing products
      if (skipDups) {
        appendLog("Fetching existing products...", "info");
        const products = await fetchAll("/products", key);
        products.forEach((p) => {
          if (p.sku) existingProducts.skus.add(p.sku.trim());
          if (p.name) existingProducts.names.add(p.name.trim().toLowerCase());
        });
        appendLog(`  Found ${products.length} existing products`, "info");
      }

      // 4. Upload products
      appendLog(`\nUploading ${excelData.length} products...`, "header");
      appendLog(`Tax inclusive: ${taxInclusive ? "Yes" : "No"}`, "info");

      for (let i = 0; i < excelData.length; i++) {
        if (stoppedRef.current) { appendLog("STOPPED by user", "error"); break; }

        const p = excelData[i];
        const nameLower = p.name.trim().toLowerCase();

        // Check duplicates
        if (skipDups) {
          if (p.sku && existingProducts.skus.has(p.sku)) {
            appendLog(`[${i + 1}/${excelData.length}] SKIP (SKU exists): ${p.sku} - ${p.name}`, "warn");
            skipped++;
            updateStats(); setProg(i + 1);
            continue;
          }
          if (existingProducts.names.has(nameLower)) {
            appendLog(`[${i + 1}/${excelData.length}] SKIP (name exists): ${p.name}`, "warn");
            skipped++;
            updateStats(); setProg(i + 1);
            continue;
          }
        }

        // Resolve unit
        let unitId = null;
        if (p.unit) {
          const uKey = p.unit.toLowerCase();
          if (unitsCache[uKey]) {
            unitId = unitsCache[uKey].id;
          } else {
            try {
              appendLog(`  Creating unit: ${p.unit}`, "info");
              const res = await api("POST", "/product_unit_types", {
                product_unit_type: { unit_name: p.unit, unit_representation: p.unit.substring(0, 3) },
              }, key);
              if (res.product_unit_type) {
                unitsCache[uKey] = res.product_unit_type;
                unitId = res.product_unit_type.id;
                appendLog(`  Unit created: ${p.unit} (ID: ${unitId})`, "success");
              }
            } catch (e) {
              appendLog(`  Failed to create unit '${p.unit}': ${e.message}`, "error");
            }
          }
        }

        // Resolve revenue account — [إصلاح] يطابق برقم الحساب أولاً ثم بالاسم
        // (راجع resolveAccountId بـengine/parsing.js)؛ عدم المطابقة يُسجَّل
        // تحذيراً بدل الاستبدال الصامت بالحساب الافتراضي.
        let revId = null;
        if (p.revenue_account_name) {
          const resolved = resolveAccountId(p.revenue_account_name, accountsByCode, accountsByName);
          if (resolved.matched) {
            revId = resolved.id;
          } else {
            appendLog(`  WARNING: revenue account '${p.revenue_account_name}' for '${p.name}' not found — using default ${revCode}`, "warn");
            revId = defaultRev ? defaultRev.id : null;
          }
        } else {
          revId = defaultRev ? defaultRev.id : null;
        }

        // Resolve expense account — نفس منطق المطابقة أعلاه.
        let expId = null;
        if (p.expense_account_name) {
          const resolved = resolveAccountId(p.expense_account_name, accountsByCode, accountsByName);
          if (resolved.matched) {
            expId = resolved.id;
          } else {
            appendLog(`  WARNING: expense account '${p.expense_account_name}' for '${p.name}' not found — using default ${expCode}`, "warn");
            expId = defaultExp ? defaultExp.id : null;
          }
        } else {
          expId = defaultExp ? defaultExp.id : null;
        }

        // Resolve category
        let categoryId = null;
        if (p.category) {
          const cat = categoriesCache[p.category.trim().toLowerCase()];
          if (cat) categoryId = cat.id;
        }

        const payload = buildProductPayload(p, { unitId, categoryId, revId, expId, selectedTaxId, taxInclusive });

        try {
          const res = await api("POST", "/products", { product: payload }, key);
          if (res.product) {
            appendLog(`[${i + 1}/${excelData.length}] CREATED: ${p.name} (ID: ${res.product.id})`, "success");
            uploaded++;
            existingProducts.names.add(nameLower);
            if (p.sku) existingProducts.skus.add(p.sku);
          } else {
            appendLog(`[${i + 1}/${excelData.length}] FAILED: ${p.name}`, "error");
            errors++;
          }
        } catch (e) {
          appendLog(`[${i + 1}/${excelData.length}] ERROR: ${p.name} - ${e.message}`, "error");
          errors++;
        }

        updateStats();
        setProg(i + 1);

        // Rate limit
        await new Promise((r) => setTimeout(r, 300));
      }

      appendLog("\n=== Upload Complete ===", "header");
      appendLog(`Total: ${excelData.length} | Uploaded: ${uploaded} | Skipped: ${skipped} | Errors: ${errors}`, "header");
    } catch (e) {
      appendLog(`FATAL: ${e.message}`, "error");
    }

    setUploading(false);
  }, [apiKey, excelData, revenueAcct, expenseAcct, taxInclusive, skipDups, appendLog]);

  const previewSummary = useMemo(() => {
    const catSet = new Set(excelData.map((p) => p.category).filter(Boolean));
    const unitSet = new Set(excelData.map((p) => p.unit).filter(Boolean));
    return { count: excelData.length, categories: catSet.size, units: unitSet.size };
  }, [excelData]);

  return {
    // key management
    apiKey, setApiKey, customerName, setCustomerName, keyVisible, toggleKeyVisibility,
    savedKeys, saveKey, loadKey, requestRemoveKey, removeKeyTarget, cancelRemoveKey, confirmRemoveKey,
    // file
    fileName, excelData, handleFile,
    // alerts
    uploadAlert, dismissAlert,
    // settings
    revenueAcct, setRevenueAcct, expenseAcct, setExpenseAcct,
    taxInclusive, toggleTaxInclusive, skipDups, toggleSkipDups,
    // preview
    previewSummary,
    // upload run
    log, stats, progress, uploading, showProgressCard, startUpload, stopUpload,
  };
}
