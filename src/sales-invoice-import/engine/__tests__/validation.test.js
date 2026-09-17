import { describe, it, expect } from "vitest";
import { runValidation, findInvoicesMissingLocation, getValidOnlyRows, getStockShortageDraftGroups, computeMissingEntitiesPlan, MISSING_CUSTOMER_CODE, MISSING_PRODUCT_CODE, MISSING_LOCATION_CODE } from "../validation.js";
import { createRow } from "../rows.js";

function validRow(overrides) {
  return createRow(overrides.id ?? 1, {
    A: 'INV-1', C: 'C-1', D: '01/01/2026', G: 'الرياض',
    N: 'SKU-1', P: '2', R: '50', S: 'نعم', V: '15%',
    ...overrides,
  });
}

describe("runValidation — الحقول الإلزامية على مستوى البند", () => {
  it("صف كامل صالح لا يولّد أي خطأ حاجب", () => {
    const { list } = runValidation([validRow({})]);
    expect(list.filter(i => i.sev === 'err')).toEqual([]);
  });
  it("N/P/R/S/V فارغة كل واحدة تولّد خطأ مستقل على نفس الحقل (بقالب مرفوع)", () => {
    const row = validRow({ N: '', P: '', R: '', S: '', V: '' });
    const refs = { template: { loaded: true, dropdowns: { G: ['الرياض'], V: ['15%'], H: [] } } };
    const { byRow } = runValidation([row], refs);
    ['N', 'P', 'R', 'S', 'V'].forEach(k => {
      expect(byRow[row.id][k].some(i => i.sev === 'err')).toBe(true);
    });
  });
  // [إضافة] بلا قالب مرفوع (مسار جلب المرجعيات عبر API — راجع تعليق رأس
  // lineItemRequiredCols بـvalidation.js)، الضريبة% (V) لم تعد إلزامية — لا توجد
  // فئات ضريبية حقيقية نتحقق مقابلها، والإرسال عبر API يتجاهلها عمدًا أصلًا.
  it("V غير إلزامية بلا قالب مرفوع، بينما N/P/R/S تبقى إلزامية كما هي", () => {
    const row = validRow({ N: '', P: '', R: '', S: '', V: '' });
    const { byRow } = runValidation([row]); // بلا refs — يعني template.loaded=false
    ['N', 'P', 'R', 'S'].forEach(k => {
      expect(byRow[row.id][k].some(i => i.sev === 'err')).toBe(true);
    });
    expect(byRow[row.id].V).toBeUndefined();
  });
  it("مرجع الفاتورة (A) فارغ ⇒ خطأ حاجب مستقل", () => {
    const row = validRow({ A: '' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].A.some(i => i.sev === 'err')).toBe(true);
  });
});

// [إضافة، طلب صريح من المستخدم 2026-09-17] تاريخ الاستحقاق (E) لا يصح أن
// يسبق تاريخ الإصدار (D) — خطأ حاجب صريح بلا code (بيانات خاطئة، لا كيان
// قابل للإنشاء التلقائي).
describe("runValidation — تاريخ الاستحقاق (E) لا يسبق تاريخ الإصدار (D)", () => {
  it("الاستحقاق قبل الإصدار ⇒ خطأ حاجب على عمود E", () => {
    const row = validRow({ D: '10/01/2026', E: '01/01/2026' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].E.some(i => i.sev === 'err' && i.msg.includes('لا يمكن أن يكون قبل تاريخ الإصدار'))).toBe(true);
  });
  it("الاستحقاق بنفس تاريخ الإصدار ⇒ لا خطأ (>= مقبول)", () => {
    const row = validRow({ D: '10/01/2026', E: '10/01/2026' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id]?.E).toBeUndefined();
  });
  it("الاستحقاق بعد الإصدار ⇒ لا خطأ", () => {
    const row = validRow({ D: '01/01/2026', E: '10/01/2026' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id]?.E).toBeUndefined();
  });
  it("الاستحقاق فارغ (اختياري) ⇒ لا خطأ إطلاقًا مهما كان تاريخ الإصدار", () => {
    const row = validRow({ D: '10/01/2026', E: '' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id]?.E).toBeUndefined();
  });
  it("أحد التاريخين غير قابل للقراءة أصلًا ⇒ لا تُطبَّق مقارنة السبق (خطأ صيغة التاريخ يكفي وحده)", () => {
    const row = validRow({ D: '10/01/2026', E: 'ليس تاريخًا' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].E.some(i => i.msg.includes('لا يمكن أن يكون قبل تاريخ الإصدار'))).toBe(false);
  });
  it("صف سند قبض (docType) ⇒ لا تُطبَّق هذي القاعدة إطلاقًا (D لسند القبض تاريخه هو، لا تاريخ إصدار فاتورة)", () => {
    const row = createRow(1, { A: 'INV-1', C: 'C-1', docType: 'سند قبض', D: '01/01/2026', E: '01/01/2020', paymentAmount: '500', paymentAccountCode: '1102' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].E?.some(i => i.msg.includes('لا يمكن أن يكون قبل تاريخ الإصدار'))).toBeFalsy();
  });
});

describe("runValidation — قواعد الأرقام", () => {
  it("الكمية صفر أو سالبة ⇒ خطأ", () => {
    const row = validRow({ P: '0' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].P[0].sev).toBe('err');
  });
  it("سعر الوحدة سالب ⇒ خطأ", () => {
    const row = validRow({ R: '-5' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].R[0].sev).toBe('err');
  });
  it("نسبة الخصم خارج 0-100 ⇒ خطأ", () => {
    const row = validRow({ T: '150' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].T.some(i => i.sev === 'err')).toBe(true);
  });
  it("تعبئة T وU معًا لنفس البند ⇒ خطآن على T وU", () => {
    const row = validRow({ T: '10', U: '5' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].T.some(i => i.sev === 'err')).toBe(true);
    expect(byRow[row.id].U.some(i => i.sev === 'err')).toBe(true);
  });
  it("S خارج نعم/لا ⇒ خطأ", () => {
    const row = validRow({ S: 'maybe' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].S.some(i => i.sev === 'err')).toBe(true);
  });
});

describe("runValidation — التواريخ", () => {
  it("تاريخ غير قابل للقراءة ⇒ خطأ حاجب", () => {
    const row = validRow({ D: 'مرحبا' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].D.some(i => i.sev === 'err')).toBe(true);
  });
  it("تاريخ صحيح لكنه سيُعاد تنسيقه ⇒ تحذير فقط لا خطأ", () => {
    const row = validRow({ D: '2026-01-01' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].D.every(i => i.sev === 'warn')).toBe(true);
  });
});

describe("runValidation — القوائم المنسدلة مقابل القالب", () => {
  const template = { loaded: true, dropdowns: { G: ['الرياض'], V: ['15%'], H: ['نقدي'] } };
  it("موقع غير موجود بالقالب ⇒ خطأ", () => {
    const row = validRow({ G: 'مدينة غير معروفة' });
    const { byRow } = runValidation([row], { template });
    expect(byRow[row.id].G[0].sev).toBe('err');
  });
  it("فئة ضريبية غير مطابقة ⇒ خطأ", () => {
    const row = validRow({ V: '20%' });
    const { byRow } = runValidation([row], { template });
    expect(byRow[row.id].V[0].sev).toBe('err');
  });
  it("طريقة دفع غير مطابقة ⇒ تحذير فقط", () => {
    const row = validRow({ H: 'شيك' });
    const { byRow } = runValidation([row], { template });
    expect(byRow[row.id].H[0].sev).toBe('warn');
  });
});

// [إضافة، إصلاح خطأ حقيقي] راجع تعليق فصل شرط G برأس validation.js — كان
// الموقع يُتحقَّق منه حصرًا مقابل template.dropdowns.G (لقطة ثابتة وقت رفع
// القالب) حتى مع توفر فهرس مواقع حقيقي حي مجلوب عبر API، بلا أي code يستثنيه
// من hardErr — يمنع الوصول للوحة الكيانات الناقصة بالخطوة 4 لأي موقع جديد
// فعليًا موجود أو قابل للإنشاء (بلاغ اختبار حي 2026-09-16: موقع حقيقي موجود
// بمنشأة العميل رُفض كـ"غير موجود بالقالب" فقط لأن القالب لم يتضمّنه وقت رفعه).
describe("runValidation — الموقع (G) مقابل locationIdByName الحقيقي (API) — [إضافة، إصلاح خطأ حقيقي]", () => {
  const template = { loaded: true, dropdowns: { G: ['الرياض'], V: ['15%'], H: [] } };

  it("locationIdByName حقيقي متاح وموقع غير مطابق ⇒ خطأ بكود missing_location (يُستبعَد من hardErr لاحقًا)", () => {
    const row = validRow({ G: 'فرع جديد' });
    const locationIdByName = new Map([['الرياض', 1]]); // لا يحوي "فرع جديد" — لكن هذا فهرس API حقيقي (غير فارغ)
    const { byRow } = runValidation([row], { template, locationIdByName });
    expect(byRow[row.id].G[0]).toMatchObject({ sev: 'err', code: MISSING_LOCATION_CODE });
  });

  it("locationIdByName حقيقي يحتوي الموقع فعليًا ⇒ لا خطأ إطلاقًا، حتى لو غائب عن قائمة القالب الثابتة", () => {
    // نفس السيناريو الحي بالضبط: موقع حقيقي بمنشأة العميل لكن غير مذكور بالقالب
    // الثابت (لم يكن موجودًا وقت تصدير/رفع ذلك الملف).
    const row = validRow({ G: 'موقع جديد غير موجود بالقالب' });
    const locationIdByName = new Map([['موقع جديد غير موجود بالقالب', 5]]);
    const { byRow } = runValidation([row], { template, locationIdByName });
    expect(byRow[row.id]?.G).toBeUndefined();
  });

  it("بلا locationIdByName إطلاقًا (لا جلب API) ⇒ يبقى التحقق مقابل القالب الثابت كما كان تمامًا (بلا code)", () => {
    const row = validRow({ G: 'مدينة غير معروفة' });
    const { byRow } = runValidation([row], { template });
    expect(byRow[row.id].G[0]).toEqual({ sev: 'err', msg: expect.stringContaining('غير موجود في قائمة المواقع المحمَّلة من القالب') });
    expect(byRow[row.id].G[0].code).toBeUndefined();
  });

  // [إصلاح خطأ حقيقي 2026-09-16] منشأة عميل حقيقية بلا أي موقع مُعرَّف بعد
  // (GET /inventories يرجع مصفوفة فارغة فعليًا — ليس خطأ جلب) ترجع Map فارغة
  // صالحة، لا "لا فهرس إطلاقًا". كان الشرط القديم (`.size > 0`) يعامل هذي الحالة
  // كـ"بلا API"، فيتراجع التحقق صمتًا للقالب الثابت (أو لا يتحقق شيء بلا قالب) —
  // الموقع لا يُرصَد كناقص إطلاقًا رغم كونه فعليًا غير موجود بقيود (بلاغ اختبار
  // حي: "لم يتعرف على الموقع نهائيًا رغم أنه من المفترض يتعرف عليه ويضيفه كجديد").
  it("locationIdByName فارغة (Map بلا عناصر، منشأة بلا أي موقع بعد) ⇒ تُعامَل كفهرس API حقيقي، خطأ بكود missing_location", () => {
    const row = validRow({ G: 'مدينة غير معروفة' });
    const { byRow } = runValidation([row], { template, locationIdByName: new Map() });
    expect(byRow[row.id].G[0]).toMatchObject({ sev: 'err', code: MISSING_LOCATION_CODE });
  });
});

describe("runValidation — المنتج والعميل", () => {
  it("كود منتج غير موجود بتقرير المنتجات ⇒ خطأ", () => {
    const row = validRow({ N: 'SKU-X' });
    const products = { loaded: true, bySku: new Map() };
    const { byRow } = runValidation([row], { products });
    expect(byRow[row.id].N[0].sev).toBe('err');
  });
  it("منتج غير قابل للبيع ⇒ خطأ", () => {
    const row = validRow({ N: 'SKU-1' });
    const products = { loaded: true, bySku: new Map([['SKU-1', { sellable: false, name: 'منتج' }]]) };
    const { byRow } = runValidation([row], { products });
    expect(byRow[row.id].N[0].sev).toBe('err');
  });
  it("رقم مرجعي عميل غير موجود ⇒ خطأ 'غير موجود'", () => {
    const row = validRow({ C: 'C-X' });
    const customers = { loaded: true, byRef: new Map(), byName: new Map() };
    const { byRow } = runValidation([row], { customers });
    expect(byRow[row.id].C[0].msg).toContain('غير موجود');
  });
  it("اسم عميل مكرر (بلا رقم مرجعي مطابق) ⇒ رسالة تسرد المرشحين", () => {
    const row = validRow({ C: 'اسم مكرر' });
    const customers = {
      loaded: true, byRef: new Map(),
      byName: new Map([['اسممكرر', [{ ref: 'C-1' }, { ref: 'C-2' }]]]),
    };
    const { byRow } = runValidation([row], { customers });
    expect(byRow[row.id].C[0].msg).toContain('مكرر');
  });
  it("عميل غير نشط ⇒ تحذير فقط", () => {
    const row = validRow({ C: 'C-1' });
    const customers = { loaded: true, byRef: new Map([['C-1', { active: false, name: 'عميل' }]]), byName: new Map() };
    const { byRow } = runValidation([row], { customers });
    expect(byRow[row.id].C[0].sev).toBe('warn');
  });
});

describe("runValidation — تطابق/تفريغ بيانات الرأس داخل مجموعة المرجع", () => {
  it("قيمتان مختلفتان غير فارغتين لحقل رأس بنفس المرجع ⇒ خطأ على الصف الثاني", () => {
    const rows = [
      validRow({ id: 1, G: 'الرياض' }),
      validRow({ id: 2, G: 'جدة' }),
    ];
    const { byRow } = runValidation(rows);
    expect(byRow[2].G.some(i => i.sev === 'err')).toBe(true);
    expect(byRow[1]?.G).toBeUndefined();
  });
  it("الحقول الإلزامية على مستوى الفاتورة (C/D/G) تُفحص من أول قيمة غير فارغة بالمجموعة كاملة", () => {
    const rows = [
      validRow({ id: 1, C: '' }),
      validRow({ id: 2, C: 'C-9' }),
    ];
    const { byRow } = runValidation(rows);
    // الصف الأول C فارغة لكن مغطاة على مستوى البند (إلزامي) — لا خطأ إضافي على مستوى المجموعة لأن C موجودة بالمجموعة
    expect(byRow[1]?.C?.some(i => i.msg.includes('لم يُعبَّأ في أي سطر'))).toBeFalsy();
  });
  it("فاتورة مفردة (سطر واحد) بمرجع فارغ تحتاج فحص C/D/G مباشرة", () => {
    const row = validRow({ A: '', C: '', D: '', G: '' });
    const { byRow } = runValidation([row]);
    ['C', 'D', 'G'].forEach(k => expect(byRow[row.id][k].some(i => i.sev === 'err')).toBe(true));
  });
});

describe("runValidation — الخصم أكبر من قيمة البند/الفاتورة", () => {
  it("قيمة خصم البند (U) أعلى من الإجمالي (P×R) ⇒ خطأ", () => {
    const row = validRow({ P: '2', R: '50', U: '200' }); // gross=100
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].U[0].sev).toBe('err');
  });
  it("خصم مستند (K) أعلى من إجمالي الفاتورة بعد خصومات البنود ⇒ خطأ", () => {
    const row = validRow({ P: '2', R: '50', K: '500' }); // net=100
    const { byRow } = runValidation([row]);
    expect(byRow[row.id].K[0].sev).toBe('err');
  });
  it("خصم مستند مساوٍ للإجمالي (±0.005) ⇒ لا خطأ", () => {
    const row = validRow({ P: '2', R: '50', K: '100' });
    const { byRow } = runValidation([row]);
    expect(byRow[row.id]?.K).toBeUndefined();
  });
});

describe("runValidation — عمود إلزامي غائب من القالب", () => {
  it("يمنع التصدير برسالة موحدة على الصف الأول فقط", () => {
    const row = validRow({});
    const template = { loaded: true, dropdowns: { G: ['الرياض'], V: ['15%'], H: [] }, missingFields: ['N'] };
    const { byRow } = runValidation([row], { template });
    expect(byRow[row.id].N.some(i => i.msg.includes('غير موجود في القالب المرفوع'))).toBe(true);
  });
});

describe("findInvoicesMissingLocation", () => {
  it("يرصد الفواتير التي كل صفوفها بلا موقع (G)", () => {
    const rows = [validRow({ id: 1, A: 'INV-A', G: '' }), validRow({ id: 2, A: 'INV-B', G: 'الرياض' })];
    const missing = findInvoicesMissingLocation(rows);
    expect(missing.length).toBe(1);
    expect(missing[0].key).toBe('INV-A');
  });
});

describe("getValidOnlyRows — معياره الفاتورة كاملة لا السطر المفرد", () => {
  it("فاتورة بها سطر واحد به خطأ حاجب تُستثنى كاملة", () => {
    const rows = [validRow({ id: 1, A: 'INV-OK' }), validRow({ id: 2, A: 'INV-BAD', N: '' })];
    const { byRow } = runValidation(rows);
    const validOnly = getValidOnlyRows(rows, byRow);
    expect(validOnly.map(r => r.id)).toEqual([1]);
  });
});

describe("getStockShortageDraftGroups — [إضافة] فواتير نقص الكمية القابلة للإرسال كمسودة (مسار API)", () => {
  it("يرصد فقط الفواتير التي فيها تحذير stock_shortage_draft، بلا الفواتير السليمة", () => {
    const rows = [
      validRow({ id: 1, A: 'INV-OK', N: 'SKU-1', G: 'الرياض', P: '2' }),
      validRow({ id: 2, A: 'INV-SHORT', N: 'SKU-1', G: 'الرياض', P: '20' }),
    ];
    const refs = { stock: { loaded: true, raw: null, byKey: new Map([['SKU-1||الرياض', 10]]) } };
    const { byRow } = runValidation(rows, refs);
    const groups = getStockShortageDraftGroups(rows, byRow);
    expect(groups.map(g => g.ref)).toEqual(['INV-SHORT']);
    expect(groups[0].messages.length).toBe(1);
  });

  it("مخزون مرفوع يدويًا (raw فعلي لا null) ⇒ لا مجموعات (تبقى أخطاء حاجبة عادية)", () => {
    const rows = [validRow({ id: 1, A: 'INV-SHORT', N: 'SKU-1', G: 'الرياض', P: '20' })];
    const refs = { stock: { loaded: true, raw: [['SKU-1', 'الرياض', 10]], byKey: new Map([['SKU-1||الرياض', 10]]) } };
    const { byRow } = runValidation(rows, refs);
    expect(getStockShortageDraftGroups(rows, byRow)).toEqual([]);
  });

  // [إضافة، إصلاح خطأ حقيقي] راجع تعليق checkStockSequential بـstockSimulation.js
  // — runValidation يجب أن يُمرِّر refs.newSkus/newLocations فعليًا لـ
  // checkStockSequential (لا يتجاهلهما)، وإلا منتج/موقع أُنشئ للتو هذه الجلسة
  // لا يظهر ضمن stockShortageGroups فتُرسَل فاتورته مباشرة كمسودة صامتة بلا
  // عرض خيار تغذية المخزون على المستخدم — بلاغ اختبار حي بالضبط.
  it("منتج جديد ضمن refs.newSkus (بلا أي بيانات مخزون سابقة) ⇒ يظهر ضمن stockShortageGroups", () => {
    const rows = [validRow({ id: 1, A: 'INV-NEW', N: 'SKU-NEW', G: 'الرياض', P: '5' })];
    const refs = { stock: { loaded: true, raw: null, byKey: new Map() }, newSkus: new Set(['SKU-NEW']) };
    const { byRow } = runValidation(rows, refs);
    expect(getStockShortageDraftGroups(rows, byRow).map((g) => g.ref)).toEqual(['INV-NEW']);
  });

  it("موقع جديد ضمن refs.newLocations (منتج قديم بلا بيانات مخزون بذلك الموقع) ⇒ يظهر ضمن stockShortageGroups أيضًا", () => {
    const rows = [validRow({ id: 1, A: 'INV-NEW-LOC', N: 'SKU-OLD', G: 'فرع جديد', P: '3' })];
    const refs = { stock: { loaded: true, raw: null, byKey: new Map() }, newLocations: new Set(['فرع جديد']) };
    const { byRow } = runValidation(rows, refs);
    expect(getStockShortageDraftGroups(rows, byRow).map((g) => g.ref)).toEqual(['INV-NEW-LOC']);
  });
});

describe("runValidation — code:'missing_customer'/'missing_product'", () => {
  it("منتج غير موجود بفهرس مجلوب عبر API (raw===null) ⇒ code:'missing_product'", () => {
    const row = validRow({ N: 'SKU-GHOST' });
    const refs = { products: { loaded: true, raw: null, bySku: new Map(), byName: new Map() } };
    const { byRow } = runValidation([row], refs);
    expect(byRow[row.id].N.some((i) => i.code === MISSING_PRODUCT_CODE)).toBe(true);
  });

  // [تصحيح 2026-09-16، بلاغ اختبار حي ثانٍ] كان مقصورًا على راجعت API فقط
  // بحجة أن منتجًا مصدره ملف يدوي لا يملك معرّف Qoyod حقيقي — صحيح لمنتج
  // *مطابَق* فعلًا بالملف اليدوي (buildProductsIndex لا يحمل id، فمسار
  // الإرسال عبر API يبقى معطَّلًا لاحقًا لتلك الحالة تحديدًا)، لكن غير صحيح
  // لمنتج *ناقص*: يُنشأ عبر POST /products الحقيقي (resolveMissingEntities)
  // ويحصل على id حقيقي من رد قيود بغض النظر عن مصدر فهرس المطابقة نفسه. مستخدم
  // رفع ملف منتجات يدويًا (بجانب عملاء/مواقع مجلوبة عبر API) لم يكن يستطيع
  // إكمال الاستيراد إطلاقًا — كل منتج ناقص يبقى حاجبًا صلبًا بلا أي مسار إنشاء.
  it("منتج غير موجود بملف مرجعي مرفوع يدويًا (raw غير null) ⇒ يحمل code أيضًا الآن (نفس منطق العميل)", () => {
    const row = validRow({ N: 'SKU-GHOST' });
    const refs = { products: { loaded: true, raw: [['x']], bySku: new Map(), byName: new Map() } };
    const { byRow } = runValidation([row], refs);
    expect(byRow[row.id].N.some((i) => i.code === MISSING_PRODUCT_CODE)).toBe(true);
    expect(byRow[row.id].N[0].msg).toContain('تقرير المنتجات المرفوع');
  });

  it("عميل غير موجود بفهرس مجلوب عبر API (raw===null) ⇒ code:'missing_customer'", () => {
    const row = validRow({ C: 'CUST-GHOST' });
    const refs = { customers: { loaded: true, raw: null, byRef: new Map(), byName: new Map() } };
    const { byRow } = runValidation([row], refs);
    expect(byRow[row.id].C.some((i) => i.code === MISSING_CUSTOMER_CODE)).toBe(true);
  });

  // [تصحيح 2026-09-16، بلاغ اختبار حي] العميل يعمل بلا مشكلة حتى لو فهرسه مصدره
  // ملف مرفوع يدويًا — buildCustomersIndex (اليدوي) ينتج نفس شكل {ref, name, active}
  // تمامًا مثل المسار عبر API، وcontact_id بالإرسال أصلًا رقم صريح بعمود C لا
  // يعتمد على مصدر الفهرس. جلسة مختلطة حقيقية (عملاء مرفوعون يدويًا + بقية
  // البيانات مجلوبة عبر API) كانت تُحجَب عن الإنشاء التلقائي للعميل رغم توفر
  // مفتاح API فعليًا وقابلية الإنشاء الحقيقية — لا مبرر لتقييدها بمصدر الفهرس.
  // (المنتج وُسِّع لاحقًا بنفس المنطق — راجع اختبار missing_product أعلاه؛ يبقى
  // فرق واحد متبقٍّ بينهما: منتج *مطابَق* بملف يدوي يفتقد id حقيقي فيفشل لاحقًا
  // عند الإرسال رغم عدم وجود أي خطأ تحقق عليه، بخلاف عميل مطابَق بملف يدوي.)
  it("عميل غير موجود بملف مرجعي مرفوع يدويًا (raw غير null) ⇒ يحمل code أيضًا", () => {
    const row = validRow({ C: 'CUST-GHOST' });
    const refs = { customers: { loaded: true, raw: [['x']], byRef: new Map(), byName: new Map() } };
    const { byRow } = runValidation([row], refs);
    expect(byRow[row.id].C.some((i) => i.code === MISSING_CUSTOMER_CODE)).toBe(true);
    expect(byRow[row.id].C[0].msg).toContain('ملف العملاء المرفوع');
  });

  it("اسم عميل مكرر (تعارض، لا 'غير موجود') ⇒ بلا code حتى بمسار API", () => {
    const row = validRow({ C: 'اسم مكرر' });
    const refs = {
      customers: {
        loaded: true, raw: null, byRef: new Map(),
        byName: new Map([[normKeyLike('اسم مكرر'), [{ ref: 'C-1', name: 'اسم مكرر' }, { ref: 'C-2', name: 'اسم مكرر' }]]]),
      },
    };
    const { byRow } = runValidation([row], refs);
    expect(byRow[row.id].C.some((i) => i.code)).toBe(false);
    expect(byRow[row.id].C[0].sev).toBe('err');
  });
});

// مساعد صغير محليًا لبناء نفس مفتاح normKey المستخدَم فعليًا بـbyName (بلا استيراده
// مباشرة هنا لإبقاء الاختبار مستقلًا عن تفاصيل normKey الداخلية بقدر الإمكان؛ يكفي
// أن يكون مطابقًا لنفس السلوك: إزالة الفراغات وتوحيد الحالة، وهو ما يفعله المصدر).
function normKeyLike(s) {
  return String(s).replace(/\s+/g, '').toLowerCase();
}

describe("computeMissingEntitiesPlan — [إضافة] خطة الكيانات الناقصة القابلة للإنشاء التلقائي", () => {
  it("يجمع العملاء/المنتجات الناقصين من issuesByRow، مُجمَّعين حسب القيمة المكتوبة", () => {
    const rows = [
      validRow({ id: 1, A: 'INV-1', C: 'CUST-X', N: 'SKU-X' }),
      validRow({ id: 2, A: 'INV-1', C: 'CUST-X', N: 'SKU-Y' }), // نفس العميل الناقص، منتج ناقص آخر
    ];
    const refs = {
      customers: { loaded: true, raw: null, byRef: new Map(), byName: new Map() },
      products: { loaded: true, raw: null, bySku: new Map(), byName: new Map() },
    };
    const { byRow } = runValidation(rows, refs);
    const plan = computeMissingEntitiesPlan(rows, byRow, {});
    expect(plan.customers).toHaveLength(1);
    expect(plan.customers[0]).toMatchObject({ typedName: 'CUST-X', rowIds: [1, 2] });
    expect(plan.products.map((p) => p.typedSku).sort()).toEqual(['SKU-X', 'SKU-Y']);
  });

  it("يلتقط categoryFromFile/unitFromFile من row.categoryRef/row.unitRef عند وجودها", () => {
    const row = validRow({ id: 1, N: 'SKU-X' });
    row.categoryRef = 'إلكترونيات';
    row.unitRef = 'قطعة';
    const refs = { products: { loaded: true, raw: null, bySku: new Map(), byName: new Map() } };
    const { byRow } = runValidation([row], refs);
    const plan = computeMissingEntitiesPlan([row], byRow, {});
    expect(plan.products[0].categoryFromFile).toBe('إلكترونيات');
    expect(plan.products[0].unitFromFile).toBe('قطعة');
  });

  // [إضافة، إصلاح خطأ حقيقي] راجع تعليق رأس buildProductCreatePayload بـ
  // qoyodEntityCreate.js — منشأة عميل حقيقية رفضت إنشاء منتج بلا selling_price/
  // tax_id حقيقيين؛ هذان الحقلان يأتيان من أول ظهور للمنتج بالملف (R/V).
  it("يلتقط sellingPriceFromFile/taxLabelFromFile من R/V لأول ظهور للمنتج فقط", () => {
    const rows = [
      validRow({ id: 1, N: 'SKU-X', R: '99.5', V: '15%' }),
      validRow({ id: 2, N: 'SKU-X', R: '999', V: '0%' }), // نفس المنتج بسعر/ضريبة مختلفين — يُتجاهَل (ليس أول ظهور)
    ];
    const refs = { products: { loaded: true, raw: null, bySku: new Map(), byName: new Map() } };
    const { byRow } = runValidation(rows, refs);
    const plan = computeMissingEntitiesPlan(rows, byRow, {});
    expect(plan.products[0].sellingPriceFromFile).toBe(99.5);
    expect(plan.products[0].taxLabelFromFile).toBe('15%');
  });

  it("مسار ملف مرجعي مرفوع يدويًا: العميل والمنتج كلاهما يُلتقطان الآن (يحملان code)", () => {
    const row = validRow({ C: 'CUST-X', N: 'SKU-X' });
    const refs = {
      customers: { loaded: true, raw: [['x']], byRef: new Map(), byName: new Map() },
      products: { loaded: true, raw: [['x']], bySku: new Map(), byName: new Map() },
    };
    const { byRow } = runValidation([row], refs);
    const plan = computeMissingEntitiesPlan([row], byRow, {});
    expect(plan.customers).toHaveLength(1);
    expect(plan.products).toHaveLength(1);
  });

  it("مواقع: يرصد أي row.G غير موجود بـlocationIdByName، فقط لو الفهرس محمَّل وغير فارغ", () => {
    const rows = [validRow({ id: 1, G: 'موقع غير معروف' })];
    const { byRow } = runValidation(rows, {});
    const locationIdByName = new Map([['الرياض', 1]]);
    const plan = computeMissingEntitiesPlan(rows, byRow, { locationIdByName });
    expect(plan.locations).toHaveLength(1);
    expect(plan.locations[0].typedName).toBe('موقع غير معروف');
  });

  it("مواقع: بلا locationIdByName محمَّل (بمسار الرفع اليدوي) ⇒ لا مواقع ناقصة تُرصَد إطلاقًا", () => {
    const rows = [validRow({ id: 1, G: 'موقع غير معروف' })];
    const { byRow } = runValidation(rows, {});
    const plan = computeMissingEntitiesPlan(rows, byRow, {});
    expect(plan.locations).toEqual([]);
  });

  // [إصلاح خطأ حقيقي 2026-09-16] راجع تعليق اختبار runValidation المقابل —
  // منشأة بلا أي موقع مُعرَّف بعد ترجع locationIdByName كـMap فارغة صالحة (ليس
  // null)، ويجب أن تُرصَد المواقع الناقصة بنفس منطق الفهرس غير الفارغ تمامًا.
  it("مواقع: locationIdByName فارغة (منشأة بلا أي موقع بعد) ⇒ تُرصَد كموقع ناقص أيضًا", () => {
    const rows = [validRow({ id: 1, G: 'موقع غير معروف' })];
    const { byRow } = runValidation(rows, { locationIdByName: new Map() });
    const plan = computeMissingEntitiesPlan(rows, byRow, { locationIdByName: new Map() });
    expect(plan.locations).toHaveLength(1);
    expect(plan.locations[0].typedName).toBe('موقع غير معروف');
  });

  it("موقع صحيح موجود بالفهرس ⇒ لا يظهر بقائمة المواقع الناقصة", () => {
    const rows = [validRow({ id: 1, G: 'الرياض' })];
    const { byRow } = runValidation(rows, {});
    const locationIdByName = new Map([['الرياض', 1]]);
    const plan = computeMissingEntitiesPlan(rows, byRow, { locationIdByName });
    expect(plan.locations).toEqual([]);
  });
});

// [إضافة] سندات القبض المرتبطة بفواتير (عمود "النوع") — راجع تعليق رأس
// engine/receipts.js وbلاغ اختبار حي: ملف عميل فيه صفوف "فاتورة" وصفوف "سند
// قبض" بنفس مرجع الفاتورة، تُنشئ دفعة مرتبطة بها عند الإرسال عبر API فقط.
function receiptRow(overrides) {
  return createRow(overrides.id ?? 'rc1', {
    A: 'INV-1', C: 'C-1', docType: 'سند قبض',
    D: '07/01/2026', paymentAmount: '500', paymentAccountCode: '1102',
    ...overrides,
  });
}

describe("runValidation — صفوف سند القبض (عمود النوع)", () => {
  it("فاتورة + سند قبض بنفس المرجع، كلاهما صحيح ⇒ لا أي خطأ حاجب إطلاقًا", () => {
    const invRow = validRow({ id: 1 });
    const rc = receiptRow({ id: 2 });
    const { list } = runValidation([invRow, rc]);
    expect(list.filter((i) => i.sev === 'err')).toEqual([]);
  });

  it("سند قبض بلا N/P/R/S/G إطلاقًا ⇒ لا تُطبَّق عليه أي فحوصات بند/موقع فاتورة عادية", () => {
    const invRow = validRow({ id: 1 });
    const rc = receiptRow({ id: 2 });
    const { byRow } = runValidation([invRow, rc]);
    ['N', 'P', 'R', 'S', 'G'].forEach((k) => {
      expect(byRow[rc.id]?.[k]).toBeUndefined();
    });
  });

  it("سند قبض بلا تاريخ/قيمة دفعة/حساب دفع ⇒ ثلاثة أخطاء حاجبة مستقلة على حقوله الخاصة", () => {
    const invRow = validRow({ id: 1 });
    const rc = receiptRow({ id: 2, D: '', paymentAmount: '', paymentAccountCode: '' });
    const { byRow } = runValidation([invRow, rc]);
    expect(byRow[rc.id].D.some((i) => i.sev === 'err')).toBe(true);
    expect(byRow[rc.id].paymentAmount.some((i) => i.sev === 'err')).toBe(true);
    expect(byRow[rc.id].paymentAccountCode.some((i) => i.sev === 'err')).toBe(true);
  });

  it("قيمة الدفعة صفرية أو سالبة ⇒ خطأ حاجب", () => {
    const invRow = validRow({ id: 1 });
    const rc = receiptRow({ id: 2, paymentAmount: '0' });
    const { byRow } = runValidation([invRow, rc]);
    expect(byRow[rc.id].paymentAmount.some((i) => i.sev === 'err')).toBe(true);
  });

  it("تاريخ سند القبض يختلف عن تاريخ إصدار الفاتورة (D) بنفس المجموعة ⇒ ليس خطأ تعارض رأس (كل واحد بتاريخه الحقيقي)", () => {
    const invRow = validRow({ id: 1, D: '01/01/2026' });
    const rc = receiptRow({ id: 2, D: '15/02/2026' });
    const { byRow } = runValidation([invRow, rc]);
    expect(byRow[rc.id]?.D?.some((i) => i.sev === 'err' && i.msg.includes('تختلف عن السطر الأول'))).toBeFalsy();
    expect(byRow[invRow.id]?.D?.some((i) => i.sev === 'err')).toBeFalsy();
  });

  it("سند قبض بمرجع لا يقابله أي سطر فاتورة فعلي بالملف ⇒ خطأ حاجب صريح", () => {
    const rc = receiptRow({ id: 1, A: 'INV-ORPHAN' });
    const { byRow } = runValidation([rc]);
    expect(byRow[rc.id].A.some((i) => i.sev === 'err' && i.msg.includes('لا يقابله أي سطر فاتورة'))).toBe(true);
  });

  it("عمود النوع فارغ بكل الصفوف (ملف قديم بلا سندات) ⇒ لا تغيير إطلاقًا بالسلوك", () => {
    const row = validRow({});
    const { list } = runValidation([row]);
    expect(list.filter((i) => i.sev === 'err')).toEqual([]);
  });
});
