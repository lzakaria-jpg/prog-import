import { describe, it, expect } from "vitest";
import { checkStockSequential, getStockTopUpNeeds } from "../stockSimulation.js";
import { createRow } from "../rows.js";

function stockIndex(map) {
  return { byKey: new Map(Object.entries(map)) };
}
function productsIndex(map) {
  return { bySku: new Map(Object.entries(map)) };
}

describe("checkStockSequential — §6.15 (محاكاة استهلاك تسلسلية تعتمد ترتيب الصفوف)", () => {
  it("مثال 1: فاتورتان متتاليتان لنفس المنتج/الموقع تستهلكان من نفس المخزون تراكميًا — الثانية تكفي", () => {
    const rows = [
      createRow(1, { N: 'SKU-1', G: 'الرياض', P: '6' }),
      createRow(2, { N: 'SKU-1', G: 'الرياض', P: '4' }),
    ];
    const issues = checkStockSequential(rows, { stockIndex: stockIndex({ 'SKU-1||الرياض': 10 }) });
    expect(issues.length).toBe(0);
  });

  it("مثال 2: الصف الثاني يتجاوز المتبقي بعد استهلاك الأول ⇒ خطأ حاجب على الثاني فقط", () => {
    const rows = [
      createRow(1, { N: 'SKU-1', G: 'الرياض', P: '8' }),
      createRow(2, { N: 'SKU-1', G: 'الرياض', P: '5' }),
    ];
    const issues = checkStockSequential(rows, { stockIndex: stockIndex({ 'SKU-1||الرياض': 10 }) });
    expect(issues.length).toBe(1);
    expect(issues[0].rowId).toBe(2);
    expect(issues[0].sev).toBe('err');
    expect(issues[0].msg).toContain('المتبقي المتوقع بعد الفواتير السابقة في هذا الملف: 2');
  });

  it("عكس ترتيب الصفوف يغيّر النتيجة (الاعتماد الحقيقي على ترتيب rows، ممنوع الفرز)", () => {
    const rowsAsc = [
      createRow(1, { N: 'SKU-1', G: 'الرياض', P: '8' }),
      createRow(2, { N: 'SKU-1', G: 'الرياض', P: '5' }),
    ];
    const rowsDesc = [
      createRow(2, { N: 'SKU-1', G: 'الرياض', P: '5' }),
      createRow(1, { N: 'SKU-1', G: 'الرياض', P: '8' }),
    ];
    const idx = () => stockIndex({ 'SKU-1||الرياض': 10 });
    const issuesAsc = checkStockSequential(rowsAsc, { stockIndex: idx() });
    const issuesDesc = checkStockSequential(rowsDesc, { stockIndex: idx() });
    expect(issuesAsc[0].rowId).toBe(2);
    expect(issuesDesc.length).toBe(1);
    expect(issuesDesc[0].rowId).toBe(1); // نفس الكمية الكبيرة لكن الآن هي الثانية في الترتيب
  });

  it("منتج/موقع غير موجود في تقرير المخزون ⇒ تحذير 'لا تتوفر بيانات كمية' لا خطأ حاجب", () => {
    const rows = [createRow(1, { N: 'SKU-9', G: 'جدة', P: '1' })];
    const issues = checkStockSequential(rows, { stockIndex: stockIndex({}) });
    expect(issues.length).toBe(1);
    expect(issues[0].sev).toBe('warn');
  });

  it("منتج 'غير مخزَّن' (stocked===false) لا يُفحص له مخزون مطلقًا", () => {
    const rows = [createRow(1, { N: 'SKU-SVC', G: 'الرياض', P: '999' })];
    const issues = checkStockSequential(rows, {
      productsIndex: productsIndex({ 'SKU-SVC': { stocked: false } }),
      stockIndex: stockIndex({}),
    });
    expect(issues.length).toBe(0);
  });

  it("[إضافة] مخزون مجلوب عبر API (stockIndex.raw===null) ⇒ نقص الكمية تحذير قابل للإرسال كمسودة لا خطأ حاجب", () => {
    const rows = [
      createRow(1, { N: 'SKU-1', G: 'الرياض', P: '8' }),
      createRow(2, { N: 'SKU-1', G: 'الرياض', P: '5' }),
    ];
    const apiStockIndex = { raw: null, byKey: new Map(Object.entries({ 'SKU-1||الرياض': 10 })) };
    const issues = checkStockSequential(rows, { stockIndex: apiStockIndex });
    expect(issues.length).toBe(1);
    expect(issues[0].rowId).toBe(2);
    expect(issues[0].sev).toBe('warn');
    expect(issues[0].code).toBe('stock_shortage_draft');
    expect(issues[0].msg).toContain('مسودة');
  });

  it("بلا stockIndex أصلاً ⇒ لا فحص ولا أخطاء", () => {
    const rows = [createRow(1, { N: 'SKU-1', G: 'الرياض', P: '5' })];
    expect(checkStockSequential(rows, {})).toEqual([]);
  });

  // [إضافة، إصلاح خطأ حقيقي] راجع تعليق getStockTopUpNeeds بـstockSimulation.js —
  // بلا newSkus هنا، منتج/موقع أُنشئ للتو هذه الجلسة كان يُصدر تحذير "لا تتوفر
  // بيانات" العام (لا code) بدل stock_shortage_draft، فـstockShortageGroups
  // (المبني من هذا الـcode بالضبط) يخرج فارغًا ولوحة تغذية المخزون لا تظهر أصلًا
  // — الفاتورة تُرسَل مباشرة وتُنشأ كمسودة صامتة بلا أي تنبيه للمستخدم.
  it("[إضافة] منتج جديد ضمن newSkus بلا أي مدخل بالفهرس ⇒ تحذير stock_shortage_draft (لا 'لا تتوفر بيانات' العام)", () => {
    const rows = [createRow(1, { N: 'SKU-NEW', G: 'الرياض', P: '7' })];
    const apiStockIndex = { raw: null, byKey: new Map() };
    const issues = checkStockSequential(rows, { stockIndex: apiStockIndex, newSkus: new Set(['SKU-NEW']) });
    expect(issues.length).toBe(1);
    expect(issues[0].code).toBe('stock_shortage_draft');
  });

  it("[إضافة] موقع جديد ضمن newLocations (منتج قديم) ⇒ نفس المعاملة — stock_shortage_draft لا 'لا تتوفر بيانات'", () => {
    const rows = [createRow(1, { N: 'SKU-OLD', G: 'فرع جديد', P: '3' })];
    const apiStockIndex = { raw: null, byKey: new Map() };
    const issues = checkStockSequential(rows, { stockIndex: apiStockIndex, newLocations: new Set(['فرع جديد']) });
    expect(issues.length).toBe(1);
    expect(issues[0].code).toBe('stock_shortage_draft');
  });

  it("صف بلا منتج أو موقع أو كمية غير صالحة يُتجاهَل بلا فحص", () => {
    const rows = [
      createRow(1, { N: '', G: 'الرياض', P: '5' }),
      createRow(2, { N: 'SKU-1', G: '', P: '5' }),
      createRow(3, { N: 'SKU-1', G: 'الرياض', P: '0' }),
    ];
    const issues = checkStockSequential(rows, { stockIndex: stockIndex({ 'SKU-1||الرياض': 1 }) });
    expect(issues.length).toBe(0);
  });
});

describe("getStockTopUpNeeds — [إضافة] احتياج تغذية المخزون الفعلي (POST /inventory_adjustments)", () => {
  it("بلا نقص إطلاقًا ⇒ مصفوفة فارغة", () => {
    const rows = [createRow(1, { N: 'SKU-1', G: 'الرياض', P: '6' })];
    const apiStockIndex = { raw: null, byKey: new Map(Object.entries({ 'SKU-1||الرياض': 10 })) };
    expect(getStockTopUpNeeds(rows, { stockIndex: apiStockIndex })).toEqual([]);
  });

  it("نقص بسطر واحد ⇒ shortfall = qty - rem بالضبط", () => {
    const rows = [
      createRow(1, { N: 'SKU-1', G: 'الرياض', P: '8' }),
      createRow(2, { N: 'SKU-1', G: 'الرياض', P: '5' }),
    ];
    const apiStockIndex = { raw: null, byKey: new Map(Object.entries({ 'SKU-1||الرياض': 10 })) };
    const needs = getStockTopUpNeeds(rows, { stockIndex: apiStockIndex });
    expect(needs).toEqual([{ sku: 'SKU-1', loc: 'الرياض', shortfall: 3 }]); // rem بعد السطر الأول = 2، والمطلوب 5 ⇒ نقص 3
  });

  it("نقص متكرر لنفس المنتج/الموقع بأكثر من سطر ⇒ يُجمَع (لا آخر قيمة فقط)", () => {
    const rows = [
      createRow(1, { N: 'SKU-1', G: 'الرياض', P: '15' }), // يستهلك كل الـ10 المتاحة، نقص 5
      createRow(2, { N: 'SKU-1', G: 'الرياض', P: '3' }),  // لا شيء متبقٍ، نقص 3 إضافي
    ];
    const apiStockIndex = { raw: null, byKey: new Map(Object.entries({ 'SKU-1||الرياض': 10 })) };
    const needs = getStockTopUpNeeds(rows, { stockIndex: apiStockIndex });
    expect(needs).toEqual([{ sku: 'SKU-1', loc: 'الرياض', shortfall: 8 }]);
  });

  it("مخزون مرفوع يدويًا (raw غير null) ⇒ مصفوفة فارغة دومًا (لا معنى للتغذية بلا API)", () => {
    const rows = [createRow(1, { N: 'SKU-1', G: 'الرياض', P: '20' })];
    const manualStockIndex = { raw: [['x']], byKey: new Map(Object.entries({ 'SKU-1||الرياض': 10 })) };
    expect(getStockTopUpNeeds(rows, { stockIndex: manualStockIndex })).toEqual([]);
  });

  it("بلا stockIndex أصلًا ⇒ مصفوفة فارغة", () => {
    const rows = [createRow(1, { N: 'SKU-1', G: 'الرياض', P: '5' })];
    expect(getStockTopUpNeeds(rows, {})).toEqual([]);
  });

  it("منتج 'غير مخزَّن' لا يُحسَب له أي نقص", () => {
    const rows = [createRow(1, { N: 'SKU-SVC', G: 'الرياض', P: '999' })];
    const apiStockIndex = { raw: null, byKey: new Map() };
    const needs = getStockTopUpNeeds(rows, {
      productsIndex: { bySku: new Map([['SKU-SVC', { stocked: false }]]) },
      stockIndex: apiStockIndex,
    });
    expect(needs).toEqual([]);
  });

  it("منتج/موقع بلا بيانات كمية أصلًا (rem===null) ⇒ لا يُحسَب نقص (تحذير 'لا تتوفر بيانات' فقط، لا تغذية)", () => {
    const rows = [createRow(1, { N: 'SKU-9', G: 'جدة', P: '1' })];
    const apiStockIndex = { raw: null, byKey: new Map() };
    expect(getStockTopUpNeeds(rows, { stockIndex: apiStockIndex })).toEqual([]);
  });

  // [إصلاح خطأ حقيقي] منتج أُنشئ للتو هذه الجلسة (resolveMissingEntities) لا يملك
  // أي مدخل بـstockIndex.byKey (بُني قبل إنشائه) — بلا هذا الإصلاح كان يقع بنفس
  // فرع "لا بيانات كمية" أعلاه فيُستبعَد من التغذية كليًا، فتبقى فاتورته معتمدة على
  // draft_if_out_of_stock الصامت بدل تغذية فعلية — يناقض هدف الميزة بالضبط لأهم
  // حالة تخدمها (منتج جديد كليًا، لا منتج قديم ناقص الكمية فقط).
  it("منتج جديد ضمن newSkus بلا أي مدخل بالفهرس ⇒ يُعامَل كصفر، والنقص = الكمية المطلوبة كاملة", () => {
    const rows = [createRow(1, { N: 'SKU-NEW', G: 'الرياض', P: '7' })];
    const apiStockIndex = { raw: null, byKey: new Map() };
    const needs = getStockTopUpNeeds(rows, { stockIndex: apiStockIndex, newSkus: new Set(['SKU-NEW']) });
    expect(needs).toEqual([{ sku: 'SKU-NEW', loc: 'الرياض', shortfall: 7 }]);
  });

  it("منتج قديم بلا بيانات كمية (ليس ضمن newSkus) ⇒ يبقى مستبعدًا كما كان — لا نفترض صفرًا لمنتج قائم فعليًا", () => {
    const rows = [createRow(1, { N: 'SKU-OLD', G: 'جدة', P: '4' })];
    const apiStockIndex = { raw: null, byKey: new Map() };
    const needs = getStockTopUpNeeds(rows, { stockIndex: apiStockIndex, newSkus: new Set(['SKU-OTHER']) });
    expect(needs).toEqual([]);
  });

  // [إضافة، إصلاح خطأ حقيقي] بلاغ اختبار حي: منتجات وموقع أُنشئوا جميعًا بنفس
  // الجلسة، ومع ذلك أُرسلت الفواتير كمسودة صامتة بدل عرض خيار تغذية المخزون —
  // السبب: newLocations لم تكن موجودة أصلًا (فقط newSkus)، فمنتج قديم موجود
  // مسبقًا لكن بموقع جديد كليًا (رصيده هناك صفر يقينًا) كان لا يزال يُعامَل
  // كـ"لا بيانات" (مستبعَد) بدل "نقص كامل".
  it("موقع جديد ضمن newLocations (منتج قديم لكن بموقع جديد كليًا) ⇒ يُعامَل كصفر، والنقص = الكمية المطلوبة كاملة", () => {
    const rows = [createRow(1, { N: 'SKU-OLD', G: 'فرع جديد', P: '9' })];
    const apiStockIndex = { raw: null, byKey: new Map() };
    const needs = getStockTopUpNeeds(rows, { stockIndex: apiStockIndex, newLocations: new Set(['فرع جديد']) });
    expect(needs).toEqual([{ sku: 'SKU-OLD', loc: 'فرع جديد', shortfall: 9 }]);
  });

  it("منتجات/مواقع مختلفة تُحسَب بشكل مستقل عن بعضها", () => {
    const rows = [
      createRow(1, { N: 'SKU-1', G: 'الرياض', P: '15' }),
      createRow(2, { N: 'SKU-2', G: 'جدة', P: '12' }),
    ];
    const apiStockIndex = { raw: null, byKey: new Map(Object.entries({ 'SKU-1||الرياض': 10, 'SKU-2||جدة': 10 })) };
    const needs = getStockTopUpNeeds(rows, { stockIndex: apiStockIndex });
    expect(needs.sort((a, b) => a.sku.localeCompare(b.sku))).toEqual([
      { sku: 'SKU-1', loc: 'الرياض', shortfall: 5 },
      { sku: 'SKU-2', loc: 'جدة', shortfall: 2 },
    ]);
  });
});
