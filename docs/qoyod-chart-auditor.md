---
name: qoyod-chart-auditor
description: Comprehensive validation and auditing for Qoyod chart of accounts integration. Use this skill whenever you need to verify account structures, validate Excel uploads, check API requests/responses, or review React code for Qoyod integration against the 59 account types and system-locked constraints. Triggers for code reviews, data imports, API integrations, or any modification to the chart of accounts workflow. Ensures zero tolerance for classification errors, hierarchy violations, or constraint breaches.
compatibility: Requires access to JSON reference file containing the 59 account types and locked account constraints from the Qoyod codebase.
---

# Qoyod Chart Auditor Skill

**Purpose**: Provide enterprise-grade validation for all Qoyod account structure operations. This skill ensures 100% compliance with Qoyod's 59 account type system, hierarchy rules, locked accounts, and classification constraints.

---

## 🔍 How to Use This Skill

### Step 1: Prepare Your Reference File

Create a JSON file in your project (e.g., `qoyod-account-types.json`) with this structure:

```json
{
  "accountTypes": [
    {
      "code": "1",
      "name_ar": "أصول متداولة",
      "name_en": "Current Assets",
      "category": "ASSET",
      "level": 1,
      "locked": false,
      "constraints": {
        "canHaveChildren": true,
        "allowedParents": [],
        "minLevel": 1,
        "maxLevel": 4,
        "requiresDetail": false
      }
    },
    {
      "code": "2",
      "name_ar": "المدينون",
      "name_en": "Accounts Receivable",
      "category": "ASSET",
      "level": 2,
      "locked": true,
      "constraints": {
        "canHaveChildren": false,
        "allowedParents": ["1"],
        "autoSystem": true,
        "description": "System-locked. Cannot be modified or deleted."
      }
    }
    // ... all 59 account types
  ],
  "hierarchyRules": {
    "maxDepth": 4,
    "assetTypes": ["1", "2", "3"],
    "liabilityTypes": ["4", "5"],
    "equityTypes": ["6", "7"],
    "incomeTypes": ["8", "9"],
    "expenseTypes": ["10", "11"]
  },
  "lockedAccounts": [
    "المدينون",
    "الدائنون",
    "البنك",
    "الصندوق"
  ],
  "validationRules": {
    "accountCodeFormat": "alphanumeric, 1-20 chars",
    "codeUniqueness": true,
    "nameUniqueness": false,
    "parentMustExist": true,
    "typeImmutable": true
  }
}
```

### Step 2: Use the Skill for Different Input Types

#### **A. Excel File Validation**

```
Upload Excel file + JSON reference → Auditor checks:
✓ All account codes exist in Qoyod
✓ Account types match reference
✓ Hierarchy is valid (no orphaned accounts)
✓ No locked accounts are being modified
✓ No duplicate codes
✓ Column mappings are correct
```

**Output**: Detailed report with line numbers and exact errors.

---

#### **B. API Response Validation**

```
Paste API JSON response → Auditor checks:
✓ Response schema matches Qoyod structure
✓ Account data conforms to type constraints
✓ Hierarchy relationships are valid
✓ No system-locked accounts in mutation attempts
✓ Field mappings are semantically correct
```

**Example API Response to validate**:
```json
{
  "accounts": [
    {
      "id": "123",
      "code": "1-1-1",
      "name": "Current Assets",
      "parent_code": "1",
      "type": "ASSET",
      "locked": false
    }
  ]
}
```

---

#### **C. React Code Review**

```
Paste React component code → Auditor checks:
✓ No hardcoded account codes (should use constants)
✓ Validation logic matches Qoyod rules
✓ Error messages are accurate and helpful
✓ Type checking is strict (no loose account matching)
✓ Locked accounts are handled correctly in UI
✓ Hierarchy traversal logic is correct
```

**Example to validate**:
```javascript
const validateAccountType = (code, type) => {
  if (!qoyodAccountTypes.includes(type)) {
    throw new Error(`Invalid account type: ${type}`);
  }
  if (lockedAccounts.includes(code)) {
    throw new Error(`Cannot modify system-locked account: ${code}`);
  }
  // ... more validation
};
```

---

## 📋 Validation Checklist

When you submit content for audit, the skill will check:

### For Excel Files:
- [ ] All rows have required columns (Code, Name_AR, Name_EN, Type, Parent)
- [ ] No blank cells in critical fields
- [ ] Account codes match allowed format
- [ ] Account types are from the 59 official types
- [ ] Parent codes exist in the same file
- [ ] No circular hierarchy (A → B → A)
- [ ] Hierarchy depth ≤ 4 levels
- [ ] No modifications to locked accounts
- [ ] No duplicate codes
- [ ] Names don't contain invalid characters

### For API Responses:
- [ ] Response contains all required fields
- [ ] Data types match schema (string, number, boolean)
- [ ] Account codes are valid
- [ ] Parent-child relationships exist
- [ ] Locked accounts are marked correctly
- [ ] No extra/unknown fields
- [ ] Date formats are ISO 8601
- [ ] No null values in required fields

### For React Code:
- [ ] No magic strings for account types (use constants)
- [ ] Validation functions call the reference rules
- [ ] Error messages are specific (not generic)
- [ ] Locked account checks are in place
- [ ] Type safety is enforced (TypeScript preferred)
- [ ] No bypassing of validation
- [ ] User feedback is clear
- [ ] Comments explain why constraints exist

---

## 🔴 Error Classification

The auditor categorizes errors by severity:

### **CRITICAL** (Block Immediately)
- Locked account modification attempts
- Invalid account type (not in 59 types)
- Circular hierarchy
- Duplicate account codes
- Parent doesn't exist

### **HIGH** (Fix Required)
- Hierarchy depth > 4 levels
- Invalid account code format
- Missing required fields
- Type mismatch with constraint

### **MEDIUM** (Review Required)
- Naming inconsistencies (Arabic/English)
- Unusual parent-child relationships
- Non-standard code patterns

### **LOW** (Recommendations)
- Code comments missing
- Inconsistent naming conventions
- Performance optimization suggestions

---

## 📊 Report Format

After validation, you get a structured report:

```
AUDIT REPORT: [Filename / Code Section]
═══════════════════════════════════════

SUMMARY
  Total Items Checked: 45
  Passed: 43
  Errors: 2
  Warnings: 0

CRITICAL ISSUES
  ❌ Line 12: Account code "1-1-1" exists twice
     → Fix: Use unique code format
  
  ❌ Line 18: Cannot modify locked account "المدينون"
     → Fix: Remove this row or change to view-only mode

HIGH PRIORITY
  ⚠ Line 8: Parent code "5-2" doesn't exist
     → Fix: Verify parent code or add parent first

RECOMMENDATIONS
  💡 Consider consolidating accounts 2-5 through 2-8
     → Reduces hierarchy depth from 4 to 3

NEXT STEPS
  1. Fix critical issues immediately
  2. Address high-priority warnings
  3. Re-run audit after changes
  4. Only proceed to import when report is clean
```

---

## ⚙️ How to Supply Reference File

**Option A: Upload with Each Request**
```
User: "Here's my Excel file. Validate against this reference."
[Attach: chart.xlsx + qoyod-account-types.json]
Auditor: Reads both files and validates
```

**Option B: Store Reference in Project**
```
Your project structure:
  /src
    /config
      qoyod-account-types.json  ← Reference file
    /components
      AccountUpload.jsx
Auditor: Can reference the stored config
```

**Option C: API-Sourced Reference**
```
Auditor reads from your environment:
const reference = await fetch('/api/config/account-types')
Then validates against live config
```

---

## 🛡️ Quality Gates

The skill enforces these non-negotiable gates:

1. **Type Immutability**: Once an account is created as type X, it cannot change to type Y
2. **Locked Account Protection**: System accounts (Receivables, Payables, Bank, Cash) are read-only
3. **Hierarchy Integrity**: Every account except root must have a valid parent
4. **Depth Constraint**: Maximum 4 levels in any branch
5. **Code Uniqueness**: No duplicate codes across the chart
6. **Constraint Respect**: All custom constraints from reference file are enforced

---

## 📝 Example: Complete Validation Flow

### Input (Excel):
| Code | Name_AR | Name_EN | Type | Parent |
|------|---------|---------|------|--------|
| 1 | أصول | Assets | ASSET | |
| 1-1 | متداولة | Current | ASSET | 1 |
| 1-1-1 | نقدية | Cash | ASSET | 1-1 |
| 2 | المدينون | AR | ASSET | 1 |

### Audit Process:
```
1. Check type "ASSET" → Valid ✓
2. Check parent "1" exists → Yes ✓
3. Check code "1-1-1" unique → Yes ✓
4. Check account "2" → System-locked, flag for review
5. Check hierarchy depth → 3 levels, OK ✓
```

### Output:
```
✓ All validations passed
⚠ Note: Account "2" (المدينون) is system-locked
  → View-only mode recommended during import
✓ Ready for import
```

---

## 🚀 Integration with Your Workflow

**Before Upload to Qoyod**:
```
User uploads Excel → Skill validates → 
  If clean: "Proceed to import"
  If errors: "Fix these 3 items before retry"
```

**During API Integration**:
```
React component sends POST request → 
  Skill intercepts validates response → 
  If valid: "Accepted, data synced"
  If invalid: "Rejected, reason: [X]"
```

**Before Code Merge**:
```
PR includes account logic → Skill reviews → 
  "All validations correct, safe to merge"
  OR "This code bypasses [constraint], fix before merge"
```

---

## 📞 Questions to Ask When Using This Skill

1. **For Excel**: "Is this a new chart setup or updating existing accounts?"
2. **For APIs**: "Which direction is this data going (inbound or outbound)?"
3. **For Code**: "Are these hardcoded types or dynamic from config?"
4. **General**: "Do you want a quick pass or deep audit?"

---

## ⚡ Quick Reference: The 59 Account Types

Your reference file should include all 59 types. Common categories:

- **Assets (14)**: Current, Fixed, Investments, etc.
- **Liabilities (11)**: Current, Long-term, Loans, etc.
- **Equity (7)**: Capital, Retained Earnings, etc.
- **Income (14)**: Sales, Services, Other, etc.
- **Expenses (13)**: COGS, Salaries, Rent, etc.

The exact list lives in your `qoyod-account-types.json` reference file.

---

## 🔐 Never Bypass These Rules

✋ This skill will **always** block:
- Modifications to locked accounts
- Invalid account types
- Hierarchy violations
- Duplicate codes
- Circular relationships

Even if "it worked before" — the skill enforces the standard. This is intentional.

---

## 📌 Last Notes

- **Reference file is the source of truth** — Keep it updated as Qoyod rules evolve
- **Errors must be fixed** — No warnings-as-errors policy; warnings are hints
- **Diffs matter** — The skill tracks what changed and why
- **Audit trails** — Every validation is logged for compliance
