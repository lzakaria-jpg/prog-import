// ─── Rule-Based Journal Entry Analyzer ─────────────────────────────────────
// No AI needed - pure logic for detecting and fixing accounting errors

// ─── Arabic Text Normalization ──────────────────────────────────────────────

function normalizeArabic(text) {
  return (text || "")
    .replace(/[ًٌٍَُِّْ]/g, "") // Remove tashkeel
    .replace(/[إأآا]/g, "ا")     // Normalize alef
    .replace(/ة/g, "ه")          // Normalize ta marbuta
    .replace(/ى/g, "ي")          // Normalize alef maqsura
    .replace(/\s+/g, " ")        // Normalize spaces
    .trim()
    .toLowerCase();
}

// ─── Levenshtein Distance ──────────────────────────────────────────────────

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ─── Build Tree Structure ──────────────────────────────────────────────────

export function buildAccountTree(chartOfAccounts) {
  const map = new Map();
  const roots = [];

  // Index all accounts by code
  for (const acc of chartOfAccounts) {
    const code = String(acc.code || acc.account_code || "").trim();
    if (!code) continue;
    map.set(code, { ...acc, code, children: [], parentCode: null });
  }

  // Build parent-child relationships
  for (const [code, node] of map) {
    // Find parent: longest prefix that exists in the map
    let parentCode = null;
    for (let len = code.length - 1; len >= 1; len--) {
      const prefix = code.substring(0, len);
      if (map.has(prefix)) {
        parentCode = prefix;
        break;
      }
    }
    if (parentCode) {
      node.parentCode = parentCode;
      map.get(parentCode).children.push(node);
    } else {
      roots.push(node);
    }
  }

  return { map, roots };
}

// Returns a Set of the codes that are posting leaves (accounts with no children).
// Parent/root accounts are not valid posting targets, so this is the set of codes
// that may appear in journal entries. Computed once and reused for performance.
export function buildLeafCodes(chartOfAccounts) {
  const leafCodes = new Set();
  const { map } = buildAccountTree(chartOfAccounts);
  map.forEach((node, code) => {
    if (!node.children || node.children.length === 0) leafCodes.add(code);
  });
  return leafCodes;
}

// ─── Detect Parent Account Entries ──────────────────────────────────────────

export function detectParentAccountEntries(entries, chartOfAccounts) {
  const { map } = buildAccountTree(chartOfAccounts);
  const errors = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const code = String(entry.code || entry.account_code || "").trim();
    if (!code) continue;

    const account = map.get(code);
    if (!account) continue;

    // Rule: Account has children = parent account
    if (account.children && account.children.length > 0) {
      // Find best matching child
      const description = entry.description || entry.name || entry.desc || "";
      const suggestion = findBestChildAccount(account, description, map);

      errors.push({
        entry_index: i,
        account_code: code,
        account_name: account.name || account.account_name || code,
        error_type: "parent_account_entry",
        description: `الحساب "${code} - ${account.name || account.account_name || ""}" حساب أب (${account.children.length} حساب فرعي)`,
        child_count: account.children.length,
        suggestion: suggestion,
      });
    }
  }

  return errors;
}

// ─── Find Best Matching Child Account ───────────────────────────────────────

function findBestChildAccount(parentAccount, entryDescription, map) {
  if (!parentAccount.children || parentAccount.children.length === 0) return null;

  const normalizedDesc = normalizeArabic(entryDescription);
  let bestMatch = null;
  let bestScore = 0;

  for (const child of parentAccount.children) {
    const childName = normalizeArabic(child.name || child.account_name || "");
    const childCode = child.code || "";

    // Score 1: Exact substring match in description
    let score = 0;
    if (normalizedDesc.includes(childName) || childName.includes(normalizedDesc)) {
      score += 0.8;
    }

    // Score 2: Word overlap
    const descWords = normalizedDesc.split(/\s+/);
    const childWords = childName.split(/\s+/);
    let wordMatches = 0;
    for (const dw of descWords) {
      for (const cw of childWords) {
        if (dw.length > 2 && cw.length > 2 && (dw.includes(cw) || cw.includes(dw))) {
          wordMatches++;
        }
      }
    }
    score += (wordMatches / Math.max(descWords.length, childWords.length)) * 0.5;

    // Score 3: Levenshtein similarity
    const sim = similarity(normalizedDesc, childName);
    score += sim * 0.3;

    // Bonus: if child name contains common accounting terms matching the description
    const commonTerms = ["مبيعات", "مشتريات", "مصروفات", "إيرادات", "رواتب", "إيجار", "مرافق", " بنك", "صندوق", "רום", "ضريبة", "مرتجع"];
    for (const term of commonTerms) {
      if (normalizedDesc.includes(term) && childName.includes(term)) {
        score += 0.4;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        account_code: childCode,
        account_name: child.name || child.account_name || childCode,
        confidence: score > 1.0 ? "high" : score > 0.5 ? "medium" : "low",
        score: Math.round(score * 100) / 100,
      };
    }
  }

  return bestMatch;
}

// ─── Auto-Fix Parent Account Entries ────────────────────────────────────────

export function autoFixEntries(entries, chartOfAccounts) {
  const { map } = buildAccountTree(chartOfAccounts);
  const fixes = [];
  const skipped = [];

  const flat = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry && Array.isArray(entry.rows) && entry.rows.length > 0) {
      for (const r of entry.rows) {
        flat.push({
          entryIndex: i,
          rowIndex: r._rowIndex != null ? r._rowIndex : flat.length,
          code: (r.code || "").trim(),
          desc: entry.desc || r.comment || "",
        });
      }
    } else {
      flat.push({
        entryIndex: i,
        rowIndex: i,
        code: String(entry.code || entry.account_code || "").trim(),
        desc: entry.description || entry.name || entry.desc || "",
      });
    }
  }

  flat.forEach((row) => {
    const code = row.code;
    if (!code) { skipped.push({ index: row.entryIndex, reason: "No account code" }); return; }

    const account = map.get(code);

    // Unknown account -> suggest nearest matching accounts by code + name
    if (!account) {
      const similar = findSimilarAccounts(code, chartOfAccounts, 4);
      const best = similar && similar[0];
      if (best && best.score >= 0.45) {
        fixes.push({
          original_index: row.entryIndex,
          row_index: row.rowIndex,
          original_account_code: code,
          original_account_name: "",
          new_account_code: best.code,
          new_account_name: best.name,
          confidence: best.score >= 0.7 ? "high" : "medium",
          score: best.score,
          reason: `الحساب "${code}" غير موجود في شجرة العميل. أقرب تطابق: "${best.code} - ${best.name}" (${Math.round(best.score * 100)}%)`,
          alternatives: similar.map((s) => ({ code: s.code, name: s.name, score: s.score })),
        });
      } else {
        skipped.push({ index: row.entryIndex, reason: `Account "${code}" not found in chart, no confident suggestion` });
      }
      return;
    }

    if (account.children && account.children.length > 0) {
      const suggestion = findBestChildAccount(account, row.desc, map);
      if (suggestion && suggestion.confidence !== "low") {
        fixes.push({
          original_index: row.entryIndex,
          row_index: row.rowIndex,
          original_account_code: code,
          original_account_name: account.name || account.account_name || code,
          new_account_code: suggestion.account_code,
          new_account_name: suggestion.account_name,
          confidence: suggestion.confidence,
          score: suggestion.score,
          reason: `تم نقل القيد من الحساب الأب "${code}" إلى الحساب الفرعي المناسب "${suggestion.account_code}"`,
        });
      } else {
        skipped.push({
          index: row.entryIndex,
          reason: `Parent account "${code}" but no confident child match found (best: ${suggestion?.account_code || "none"} at ${suggestion?.score || 0})`,
        });
      }
    }
  });

  return { fixes, skipped };
}

// ─── Validate Account Types ─────────────────────────────────────────────────

export function validateAccountTypes(entries, chartOfAccounts) {
  const { map } = buildAccountTree(chartOfAccounts);
  const errors = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const code = String(entry.code || entry.account_code || "").trim();
    if (!code) continue;

    const account = map.get(code);
    if (!account) continue;

    const accountType = (account.type || account.account_type || "").toLowerCase();
    const debit = parseFloat(entry.debit || entry.debit_amount || 0);
    const credit = parseFloat(entry.credit || entry.credit_amount || 0);

    // Rule: Asset/Liability accounts - check for unusual entries
    if ((accountType.includes("asset") || accountType.includes("أصول") || accountType.includes("asset")) && credit > 0 && debit === 0) {
      // Credits on asset accounts decrease the balance - valid but worth noting
    }

    // Rule: Revenue/Expense accounts - check for unusual balances
    if ((accountType.includes("revenue") || accountType.includes("إيراد")) && debit > 0 && credit === 0) {
      // Debits on revenue accounts are unusual (returns/reversals)
    }
  }

  return errors;
}

// ─── Find Similar Accounts ──────────────────────────────────────────────────

export function findSimilarAccounts(searchTerm, chartOfAccounts, maxResults = 5, leafCodes = null) {
  const normalizedSearch = normalizeArabic(searchTerm);
  const numericSearch = normalizedSearch.replace(/[^0-9]/g, "");
  const results = [];

  // Build the set of posting leaves ONCE (reused across calls for performance).
  // Posting targets are LEAVES (no children). Parent/root accounts are NOT
  // valid posting targets, so they are excluded from suggestions entirely.
  if (!leafCodes) {
    leafCodes = buildLeafCodes(chartOfAccounts);
  }
  const isLeaf = (code) => leafCodes.has(code);

  for (const acc of chartOfAccounts) {
    const code = String(acc.code || acc.account_code || "").trim();
    const codeNum = code.replace(/[^0-9]/g, "");
    const name = normalizeArabic(acc.name || acc.account_name || "");

    // EXCLUDE parent/root accounts (not valid posting targets)
    if (code && !isLeaf(code)) continue;
    if (!code) continue;

    let score = 0;
    let matchedBy = null;

    // 1) Exact code / exact numeric key — strongest match
    if (code === normalizedSearch || code === String(searchTerm).trim()) {
      score += 1.6;
      matchedBy = "code-exact";
    } else if (numericSearch && codeNum && numericSearch === codeNum) {
      score += 1.5;
      matchedBy = "num-exact";
    }

    // 2) Numeric proximity: shared prefix or close numeric strings
    if (score === 0 && numericSearch && codeNum) {
      let prefixLen = 0;
      const minLen = Math.min(codeNum.length, numericSearch.length);
      for (let k = 0; k < minLen; k++) {
        if (codeNum[k] === numericSearch[k]) prefixLen++;
        else break;
      }
      if (codeNum.startsWith(numericSearch) || numericSearch.startsWith(codeNum)) {
        score += 0.95;
        matchedBy = "num-prefix";
      } else if (prefixLen >= Math.max(1, Math.floor(minLen * 0.5))) {
        // Near-match codes sharing a strong leading run (e.g. 1100 vs 1101)
        const ratio = codeNum.length === numericSearch.length
          ? similarity(numericSearch, codeNum)
          : prefixLen / Math.max(codeNum.length, numericSearch.length);
        score += 0.75 * ratio;
        matchedBy = "num-near";
      }
    }

    // 3) Name similarity (Levenshtein) — captures typo'd/mis-typed account names
    const sim = similarity(normalizedSearch, name);
    if (sim > 0.45) {
      score += sim * 0.95;
      matchedBy = matchedBy || "name";
    }

    // 4) Substring / containment on the name
    if (name.includes(normalizedSearch) || normalizedSearch.includes(name)) {
      score += 0.6;
      matchedBy = matchedBy || "name-substr";
    }

    // 5) Word overlap on the name
    const searchWords = normalizedSearch.split(/\s+/);
    const nameWords = name.split(/\s+/);
    for (const sw of searchWords) {
      for (const nw of nameWords) {
        if (sw.length > 2 && nw.length > 2 && (sw.includes(nw) || nw.includes(sw))) {
          score += 0.25;
          matchedBy = matchedBy || "word";
        }
      }
    }

    if (score > 0.25) {
      results.push({
        code,
        name: acc.name || acc.account_name || code,
        type: acc.type || acc.account_type || "",
        score: Math.round(score * 100) / 100,
        matchedBy,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

// ─── Detect Common Errors ──────────────────────────────────────────────────

export function detectCommonErrors(entries, chartOfAccounts) {
  const { map } = buildAccountTree(chartOfAccounts);
  const errors = [];

  // Build index of used accounts
  const usedAccounts = new Map();
  for (let i = 0; i < entries.length; i++) {
    const code = String(entries[i].code || entries[i].account_code || "").trim();
    if (!usedAccounts.has(code)) usedAccounts.set(code, []);
    usedAccounts.get(code).push(i);
  }

  // Rule 1: Entries on non-existent accounts
  for (let i = 0; i < entries.length; i++) {
    const code = String(entries[i].code || entries[i].account_code || "").trim();
    if (code && !map.has(code)) {
      // Try to find a similar account
      const similar = findSimilarAccounts(code, chartOfAccounts, 1);
      errors.push({
        entry_index: i,
        account_code: code,
        error_type: "unknown_account",
        description: `الحساب "${code}" غير موجود في شجرة الحسابات`,
        suggestion: similar.length > 0 ? {
          account_code: similar[0].code,
          account_name: similar[0].name,
          confidence: similar[0].score > 0.7 ? "high" : "medium",
        } : null,
      });
    }
  }

  // Rule 2: Debit/Credit balance check per entry
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const debit = parseFloat(entry.debit || entry.debit_amount || 0);
    const credit = parseFloat(entry.credit || entry.credit_amount || 0);

    if (debit > 0 && credit > 0) {
      errors.push({
        entry_index: i,
        account_code: String(entry.code || entry.account_code || ""),
        error_type: "both_debit_credit",
        description: "القيد فيه مدين ودائن معاً على نفس الحساب - تأكد من صحة المبلغ",
        suggestion: null,
      });
    }
  }

  // Rule 3: Duplicate entries (same account, same amount, same description)
  const seen = new Map();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const key = `${entry.code || entry.account_code}_${entry.debit || entry.debit_amount || 0}_${entry.credit || entry.credit_amount || 0}_${entry.description || ""}`;
    if (seen.has(key)) {
      errors.push({
        entry_index: i,
        account_code: String(entry.code || entry.account_code || ""),
        error_type: "duplicate_entry",
        description: `قيد مكرر (موجود أيضاً في السطر ${seen.get(key) + 1})`,
        suggestion: null,
      });
    } else {
      seen.set(key, i);
    }
  }

  return errors;
}

// ─── Full Analysis ──────────────────────────────────────────────────────────

export function fullAnalysis(entries, chartOfAccounts) {
  const parentErrors = detectParentAccountEntries(entries, chartOfAccounts);
  const commonErrors = detectCommonErrors(entries, chartOfAccounts);
  const allErrors = [...parentErrors, ...commonErrors];

  const highConfidence = allErrors.filter(e => e.suggestion?.confidence === "high");
  const mediumConfidence = allErrors.filter(e => e.suggestion?.confidence === "medium");
  const noSuggestion = allErrors.filter(e => !e.suggestion);

  return {
    total_errors: allErrors.length,
    parent_account_errors: parentErrors.length,
    common_errors: commonErrors.length,
    high_confidence_fixes: highConfidence.length,
    medium_confidence_fixes: mediumConfidence.length,
    needs_manual_review: noSuggestion.length,
    errors: allErrors,
    summary: `تم العثور على ${allErrors.length} مشكلة: ${parentErrors.length} حسابات أب، ${commonErrors.length} أخطاء أخرى. ${highConfidence.length} تصحيح عالي الثقة.`,
  };
}

// ─── Generate Templates (rule-based) ────────────────────────────────────────

export function generateTemplates(chartOfAccounts) {
  const { map, roots } = buildAccountTree(chartOfAccounts);
  const templates = [];

  // Find common account categories
  const categories = {
    sales: { name: "إيرادات المبيعات", accounts: [] },
    purchases: { name: "المشتريات", accounts: [] },
    expenses: { name: "المصروفات", accounts: [] },
    bank: { name: "البنوك", accounts: [] },
    cash: { name: "الصندوق", accounts: [] },
    receivables: { name: "العملاء (المدينون)", accounts: [] },
    payables: { name: "الموردون (الدائنون)", accounts: [] },
  };

  for (const [code, node] of map) {
    const name = normalizeArabic(node.name || node.account_name || "");
    if (name.includes("مبيع") || name.includes("sale")) categories.sales.accounts.push(node);
    if (name.includes("شر") || name.includes("purchase")) categories.purchases.accounts.push(node);
    if (name.includes("صرف") || name.includes("expense")) categories.expenses.accounts.push(node);
    if (name.includes("بنك") || name.includes("bank")) categories.bank.accounts.push(node);
    if (name.includes("صندوق") || name.includes("cash")) categories.cash.accounts.push(node);
    if (name.includes("عمل") || name.includes(" receivable") || name.includes("ع.م")) categories.receivables.accounts.push(node);
    if (name.includes("مور") || name.includes("payable") || name.includes("د.م")) categories.payables.accounts.push(node);
  }

  // Template 1: Sales Invoice
  if (categories.receivables.accounts.length > 0 && categories.sales.accounts.length > 0) {
    templates.push({
      name: "فاتورة مبيعات",
      description: "قيد فاتورة مبيعات على عميل",
      entries: [
        { account_code: categories.receivables.accounts[0].code, account_name: categories.receivables.accounts[0].name || categories.receivables.accounts[0].account_name, debit: 1150, credit: 0, description: "مدين - العميل" },
        { account_code: categories.sales.accounts[0].code, account_name: categories.sales.accounts[0].name || categories.sales.accounts[0].account_name, debit: 0, credit: 1000, description: "دائن - إيراد المبيعات" },
        { account_code: "20101", account_name: "ضريبة القيمة المضافة - مستحقة", debit: 0, credit: 150, description: "دائن - VAT 15%" },
      ],
    });
  }

  // Template 2: Purchase Invoice
  if (categories.payables.accounts.length > 0 && categories.purchases.accounts.length > 0) {
    templates.push({
      name: "فاتورة مشتريات",
      description: "قيد فاتورة مشتريات من مورد",
      entries: [
        { account_code: categories.purchases.accounts[0].code, account_name: categories.purchases.accounts[0].name || categories.purchases.accounts[0].account_name, debit: 1150, credit: 0, description: "مدين - مشتريات" },
        { account_code: "10301", account_name: "ضريبة القيمة المضافة - مسترد", debit: 150, credit: 0, description: "مدين - VAT المسترد" },
        { account_code: categories.payables.accounts[0].code, account_name: categories.payables.accounts[0].name || categories.payables.accounts[0].account_name, debit: 0, credit: 1300, description: "دائن - المورد" },
      ],
    });
  }

  // Template 3: Salary Payment
  if (categories.bank.accounts.length > 0 || categories.cash.accounts.length > 0) {
    const payAccount = categories.bank.accounts[0] || categories.cash.accounts[0];
    templates.push({
      name: "دفع رواتب",
      description: "قيد صرف رواتب الموظفين",
      entries: [
        { account_code: "40101", account_name: "رواتب وأجور", debit: 10000, credit: 0, description: "مدين - رواتب" },
        { account_code: "20201", account_name: "إجازات مستحقة", debit: 0, credit: 800, description: "دائن - إجازات" },
        { account_code: "20202", account_name: "تأمينات اجتماعية", debit: 0, credit: 200, description: "دائن - GOSI" },
        { account_code: payAccount.code, account_name: payAccount.name || payAccount.account_name, debit: 0, credit: 9000, description: "دائن - بنك/صندوق" },
      ],
    });
  }

  // Template 4: Expense Payment
  if (categories.bank.accounts.length > 0 && categories.expenses.accounts.length > 0) {
    templates.push({
      name: "دفع مصروفات",
      description: "قيد دفع مصروفات نقدية",
      entries: [
        { account_code: categories.expenses.accounts[0].code, account_name: categories.expenses.accounts[0].name || categories.expenses.accounts[0].account_name, debit: 500, credit: 0, description: "مدين - مصروفات" },
        { account_code: categories.bank.accounts[0].code, account_name: categories.bank.accounts[0].name || categories.bank.accounts[0].account_name, debit: 0, credit: 500, description: "دائن - بنك" },
      ],
    });
  }

  return { templates };
}
