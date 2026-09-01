// @vitest-environment jsdom
//
// خطأ جوهري حقيقي شهده المستخدم: نداء organizeChartOfAccounts الحقيقي (نفس ما
// يستدعيه chat.jsx) كان يرمي "تعذّر تحديد عمودي الرمز والاسم" على ملف عميل
// حقيقي جداً (allume_raw.xls برؤوس أعمدة acc_code/acc_arab/acc_lati/acc_levl...)
// بالرغم من أن الملف صحيح وقابل للقراءة تماماً - السبب: COLUMN_CANDIDATES في
// MergeTool.jsx لا يعرف رموز الأعمدة acc_arab (الاسم بالعربي)، acc_lati (الاسم
// بالإنجليزي/اللاتيني)، acc_levl (المستوى) - رموز شائعة بأنظمة محاسبية قديمة.
// كان هذا يعمل بالاختبارات السابقة فقط لأنها كانت تُصحِّح mapping يدوياً بعد
// القراءة (bypass كامل لـautoDetectMapping)، لا عبر organizeChartOfAccounts
// الفعلي كما يستدعيه الشات - فلم يُكتشف الخطأ إلا بتجربة حقيقية من المستخدم.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readAndMapChartFile, organizeChartOfAccounts } from "../chartOrganizerAgent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadFixture(name) {
  const buf = fs.readFileSync(path.join(__dirname, "fixtures", name));
  return new File([buf], name, { type: "application/vnd.ms-excel" });
}

describe("autoDetectMapping - مرادفات رموز أعمدة أنظمة محاسبية قديمة (acc_arab/acc_lati/acc_levl)", () => {
  it("يكتشف acc_arab كاسم عربي، acc_lati كاسم إنجليزي، acc_levl كمستوى - بلا حاجة لأي تعيين يدوي", async () => {
    const file = loadFixture("allume_raw.xls");
    const { mapping, needsColumnHelp } = await readAndMapChartFile(file);
    expect(mapping.code).toBe(0);
    expect(mapping.nameAr).toBe(2);
    expect(mapping.nameEn).toBe(1);
    expect(mapping.level).toBe(5);
    expect(needsColumnHelp).toBe(false);
  });

  // الحالة الحقيقية الأصلية التي فشلت فعلياً بالشات (بلا أي aiColumnMappingResolver
  // - أي بلا اعتماد على استجابة الذكاء الاصطناعي، ليبقى المسار الحتمي وحده كافياً)
  it("organizeChartOfAccounts لا يرمي 'تعذّر تحديد عمودي الرمز والاسم' على allume_raw.xls بلا أي مساعِد ذكاء اصطناعي", async () => {
    const file = loadFixture("allume_raw.xls");
    const result = await organizeChartOfAccounts(file); // بلا opts.aiColumnMappingResolver عمداً
    expect(result.blob).toBeTruthy();
    expect(result.stats.orderedRows.length).toBeGreaterThan(0);
  });

  it("ملف عميل آخر برؤوس عربية صريحة (الرمز/الاسم) بلا عمود مستوى إطلاقاً - أيضاً لا يرمي", async () => {
    const file = loadFixture("customer_arabic_headers_no_level.xls");
    const result = await organizeChartOfAccounts(file);
    expect(result.blob).toBeTruthy();
    expect(result.stats.orderedRows.length).toBeGreaterThan(0);
  });
});
