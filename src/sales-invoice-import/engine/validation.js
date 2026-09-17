/* محرك التحقق الكامل (26 قاعدة) — نسخ حرفي من qoyod_validator_core.js (أسطر 1672-1873،
   1911-1921، 2002-2012). بلا أي DOM (renderValidationUI/renderMissingLocationUI تنتقلان
   لمكوّنات React). تبديل معماري: state.rows/template/products/customers/stock العامة
   تصبح وسائط rows/refs، وaddIssue(...) الداخلية تبقى كما هي (تبني issuesByRow/summary
   محليًا ثم تُعاد) — كل شرط ومعادلة ورسالة خطأ حرفية 100% بلا أي تغيير. */

import { COLUMNS, COL_KEYS, HEADER_COLS } from './constants.js';
import { norm, isBlank, round2 } from './text.js';
import { parseDateParts, formatDateParts, getDateSep } from './dates.js';
import { normKey } from './text.js';
import { groupRowsByInvoiceRef } from './grouping.js';
import { checkStockSequential } from './stockSimulation.js';
import { isReceiptRow } from './receipts.js';

// [إضافة] أكواد addIssue لتمييز "منتج/عميل غير موجود لكن قابل للإنشاء تلقائيًا عبر API"
// (فقط بمسار الفهارس المجلوبة عبر API — راجع تعليقات الاستخدام أدناه) عن باقي
// الأخطاء الحاجبة العادية غير القابلة للإصلاح التلقائي — تُستخدَم من stats.hardErr
// وcomputeMissingEntitiesPlan بالهوك (useSalesInvoiceImportEngine.js).
export const MISSING_PRODUCT_CODE = 'missing_product';
export const MISSING_CUSTOMER_CODE = 'missing_customer';
export const MISSING_LOCATION_CODE = 'missing_location';

// refs: {template:{loaded,dropdowns,missingFields}, products:{loaded,bySku,byName}, customers:{loaded,byRef,byName}, stock:{loaded,byKey}}
export function runValidation(rows, refs = {}){
  // [أداء] أرقام الصفوف بالرسائل كانت تُستخرَج بـrows.indexOf داخل حلقات تمرّ على
  // كل مجموعة فاتورة — أي مسح خطي لكل صف بكل رسالة (ملف 5000 صف ≈ ملايين
  // المقارنات بكل إعادة تحقق، وإعادة التحقق تجري بكل ضغطة مفتاح بالخطوة 3).
  // خريطة id←فهرس تُبنى مرة واحدة: نفس الأرقام بالضبط، بلا أي تغيير بالمخرجات.
  const rowIndexById = new Map();
  (rows || []).forEach((r, i) => { if(r && r.id !== undefined) rowIndexById.set(r.id, i); });
  const issuesByRow = {}; // id -> {colKey: [{sev,msg}]}
  const summary = []; // {sev, msg, rowId, colKey}

  // [إضافة] code باراميتر اختياري خامس — يُستخدَم فقط لتمييز نوع مُلاحَظ برمجيًا
  // (مثل 'stock_shortage_draft' من checkStockSequential) بلا الاعتماد على نص msg
  // نفسه بأي منطق. بلا code (كل نداءات addIssue الأصلية)، السلوك والمخرجات كما
  // كانت تمامًا — {sev,msg} فقط.
  function addIssue(rowId, colKey, sev, msg, code){
    if(!issuesByRow[rowId]) issuesByRow[rowId] = {};
    if(!issuesByRow[rowId][colKey]) issuesByRow[rowId][colKey] = [];
    const entry = code ? {sev,msg,code} : {sev,msg};
    issuesByRow[rowId][colKey].push(entry);
    summary.push({...entry, rowId, colKey});
  }

  const template = refs.template || {loaded:false};
  const products = refs.products || {loaded:false};
  const customers = refs.customers || {loaded:false};
  const stock = refs.stock || {loaded:false};
  // [إضافة] فهرس المواقع الحقيقي المجلوب عبر API (نفس locationIdByName المُستخدَم
  // فعليًا بقيمة الإرسال/computeMissingEntitiesPlan) — راجع تعليق الاستخدام أدناه.
  const locationIdByName = refs.locationIdByName || null;
  const DATE_SEP = getDateSep();

  // تجميع حسب مرجع الفاتورة (A) بالترتيب
  const groups = groupRowsByInvoiceRef(rows);

  // [إضافة] عمود الضريبة% (V) إلزامي فقط لو فيه قالب قيود مرفوع — بلا قالب، لا
  // توجد فئات ضريبية حقيقية نتحقق مقابلها أصلًا (dropdowns.V فارغة)، والمسار
  // الوحيد الممكن بلا قالب هو الإرسال المباشر عبر API الذي يتجاهل V عمدًا أصلًا
  // (قيود تطبّق ضريبة المنتج نفسه تلقائيًا — راجع تعليق رأس qoyodSalesInvoicePush.js).
  // بقالب مرفوع، السلوك يبقى بلا أي تغيير (V إلزامي كما كان دومًا).
  const lineItemRequiredCols = template.loaded ? ['N','P','R','S','V'] : ['N','P','R','S'];

  rows.forEach((row, idx)=>{
    const rn = idx+1;
    const isReceipt = isReceiptRow(row);
    if(isBlank(row.A)) addIssue(row.id,'A','err',`السطر ${rn}: "مرجع الفاتورة" إلزامي.`);
    if(row.A && norm(row.A).length>191) addIssue(row.id,'A','warn',`السطر ${rn}: مرجع الفاتورة يتجاوز 191 حرفًا (تنبيه فقط، ليس مانعًا فعليًا من الخادم).`);

    // التواريخ: يجب أن تكون مقروءة وبصيغة القالب المختارة — يشمل صف "سند قبض"
    // أيضًا (D هنا هو تاريخ السند نفسه لذلك الصف، لا تاريخ إصدار الفاتورة).
    COLUMNS.filter(c=>c.type==='date').forEach(c=>{
      if(isBlank(row[c.key])) return;
      const p = parseDateParts(row[c.key]);
      if(!p){ addIssue(row.id,c.key,'err',`السطر ${rn}: تعذر قراءة "${c.name}" كتاريخ صحيح ("${row[c.key]}") — استخدم صيغة يوم${DATE_SEP}شهر${DATE_SEP}سنة.`); return; }
      const expected = formatDateParts(p);
      if(norm(row[c.key]) !== expected) addIssue(row.id,c.key,'warn',`السطر ${rn}: سيتم كتابة "${c.name}" في الملف النهائي بصيغة ${expected}.`);
    });

    // [إضافة] صف "سند قبض" (عمود النوع، راجع تعليق رأس engine/receipts.js) لا
    // يحمل أي بند منتج (N/P/R/S/V/T/U/K) ولا موقعًا (G) إطلاقًا بطبيعته — تطبيق
    // كل الفحوصات أدناه عليه كان يولّد أخطاء حاجبة وهمية (كل حقل بند "إلزامي
    // وفارغ") حتى مع بلاغ حي أن الصف صحيح تمامًا. الفحوصات الخاصة بسند القبض
    // نفسه (قيمة الدفعة/حساب الدفع) أدناه بعد فحص العميل المشترك.
    if(!isReceipt){
    // إلزامي على مستوى البند
    lineItemRequiredCols.forEach(k=>{
      if(isBlank(row[k])) addIssue(row.id,k,'err',`السطر ${rn}: حقل "${COLUMNS.find(c=>c.key===k).name}" إلزامي ولا يمكن تركه فارغًا.`);
    });

    // أرقام
    const P = parseFloat(row.P), R = parseFloat(row.R), T = row.T?parseFloat(row.T):null, U = row.U?parseFloat(row.U):null, K = row.K?parseFloat(row.K):null;
    if(row.P!=='' && (isNaN(P) || P<=0)) addIssue(row.id,'P','err',`السطر ${rn}: الكمية يجب أن تكون رقمًا أكبر من صفر.`);
    if(row.R!=='' && (isNaN(R) || R<0)) addIssue(row.id,'R','err',`السطر ${rn}: سعر الوحدة لا يمكن أن يكون سالبًا.`);
    if(T!==null && (isNaN(T) || T<0 || T>100)) addIssue(row.id,'T','err',`السطر ${rn}: نسبة الخصم يجب أن تكون بين 0 و100.`);
    if(U!==null && (isNaN(U) || U<0)) addIssue(row.id,'U','err',`السطر ${rn}: قيمة الخصم لا يمكن أن تكون سالبة.`);
    if(K!==null && (isNaN(K) || K<=0)) addIssue(row.id,'K','err',`السطر ${rn}: قيمة خصم المستند يجب أن تكون أكبر من صفر إن أُدخلت.`);
    if(!isBlank(row.T) && !isBlank(row.U)) { addIssue(row.id,'T','err',`السطر ${rn}: لا يجوز تعبئة نسبة الخصم وقيمة الخصم معًا لنفس البند.`); addIssue(row.id,'U','err',`السطر ${rn}: لا يجوز تعبئة نسبة الخصم وقيمة الخصم معًا لنفس البند.`); }

    if(!isBlank(row.S) && !['نعم','لا'].includes(norm(row.S))) addIssue(row.id,'S','err',`السطر ${rn}: "شامل الضريبة؟" يجب أن تكون نعم أو لا فقط.`);

    // [إضافة، طلب صريح من المستخدم 2026-09-17] تاريخ الاستحقاق (E) لا يصح أن
    // يسبق تاريخ الإصدار (D) — لا معنى محاسبيًا لفاتورة "مستحقة" قبل إصدارها
    // أصلًا. خطأ حاجب صريح بلا code (بيانات خاطئة بالملف، لا كيان قابل للإنشاء
    // التلقائي) يمنع الوصول للخطوة 4 حتى تُصحَّح القيمة بالملف/الجدول.
    if(!isBlank(row.D) && !isBlank(row.E)){
      const pD = parseDateParts(row.D), pE = parseDateParts(row.E);
      if(pD && pE){
        const dVal = pD.y*10000 + pD.m*100 + pD.d, eVal = pE.y*10000 + pE.m*100 + pE.d;
        if(eVal < dVal) addIssue(row.id,'E','err',`السطر ${rn}: تاريخ الاستحقاق (${row.E}) لا يمكن أن يكون قبل تاريخ الإصدار (${row.D}).`);
      }
    }

    // القوائم المنسدلة مقابل القالب
    if(template.loaded){
      if(!isBlank(row.V) && !template.dropdowns.V.includes(norm(row.V))) addIssue(row.id,'V','err',`السطر ${rn}: قيمة الضريبة "${row.V}" غير مطابقة لأي فئة ضريبية في القالب.`);
      if(!isBlank(row.H) && template.dropdowns.H.length && !template.dropdowns.H.includes(norm(row.H))) addIssue(row.id,'H','warn',`السطر ${rn}: طريقة الدفع "${row.H}" غير مطابقة للقائمة المحمَّلة (تحقق من كتابتها).`);
    }
    // [إصلاح خطأ حقيقي] الموقع (G) — فُصل عمدًا عن كتلة template.loaded أعلاه.
    // القالب اليدوي إلزامي دومًا بالأداة (راجع readyForStep2 بالهوك)، فقائمة
    // مواقعه (template.dropdowns.G) تبقى لقطة ثابتة وقت تصدير/رفع ذلك الملف —
    // أي موقع حقيقي أُضيف لاحقًا بمنشأة العميل (أو أُنشئ للتو عبر لوحة الكيانات
    // الناقصة بالخطوة 4) لن يظهر بها أبدًا. كان هذا الشرط الوحيد يفرض خطأً
    // حاجبًا صلبًا (بلا code) يمنع الوصول لتلك اللوحة أصلًا لأي موقع جديد فعليًا
    // موجود أو قابل للإنشاء — يُلزم المستخدم باختيار موقع خاطئ فقط ليتجاوز
    // التحقق (بلاغ اختبار حي 2026-09-16). الآن: لو فهرس مواقع حقيقي مجلوب عبر
    // API متاح (locationIdByName)، هو المصدر المعتمَد (أحدث/أدق من قالب ثابت)
    // والخطأ يحمل code:'missing_location' (يُستبعَد من stats.hardErr — نفس فلسفة
    // missing_customer/missing_product بالضبط، فيصل الصف لخطوة المراجعة/الإنشاء
    // التلقائي). بلا فهرس API (لا جلب أصلاً) يبقى التحقق مقابل القالب الثابت
    // كما كان تمامًا (خطأ حاجب صلب بلا code — لا مسار إنشاء تلقائي بلا API).
    // [إصلاح خطأ حقيقي 2026-09-16] الشرط كان `locationIdByName.size > 0`: منشأة
    // عميل حقيقية بلا أي موقع مُعرَّف بعد أصلاً (GET /inventories يرجع مصفوفة
    // فارغة فعليًا، ليس خطأ جلب) كانت تُعامَل كأنها "لا فهرس API إطلاقًا"،
    // فيتراجع التحقق صمتًا لقائمة القالب الثابتة (أو لا يتحقق شيء بلا قالب
    // مرفوع أصلاً) — الموقع المكتوب بالملف لا يُرصَد كناقص إطلاقًا ولا يظهر
    // بلوحة الإنشاء التلقائي رغم كونه فعليًا غير موجود بقيود. الفارق الصحيح هو
    // "أُجلِب الفهرس عبر API؟" (locationIdByName !== null، بصرف النظر عن حجمه)
    // لا "هل حجمه > 0؟" — نفس نمط stockIndex.raw===null بـstockSimulation.js.
    if(!isBlank(row.G)){
      const locName = norm(row.G);
      if(locationIdByName){
        if(!locationIdByName.has(locName)) addIssue(row.id,'G','err',`السطر ${rn}: الموقع "${row.G}" غير موجود بمنشأة العميل الحقيقية.`, MISSING_LOCATION_CODE);
      } else if(template.loaded && !template.dropdowns.G.includes(locName)){
        addIssue(row.id,'G','err',`السطر ${rn}: الموقع "${row.G}" غير موجود في قائمة المواقع المحمَّلة من القالب.`);
      }
    }

    // المنتج
    if(!isBlank(row.N) && products.loaded){
      const p = products.bySku.get(norm(row.N));
      // [تصحيح 2026-09-16، بلاغ اختبار حي] code:'missing_product' كان مقصورًا على
      // products.raw===null (فهرس منتجات مجلوب عبر API) بحجة أن منتجًا "يُنشأ" من
      // لوحة الكيانات الناقصة يحتاج نتيجة POST /products الحقيقية لا أي شيء من
      // الملف اليدوي — لكن هذا صحيح فقط لمنتج يُنشأ فعليًا (المنشِئ نفسه يخزّن id
      // الحقيقي من رد قيود دومًا — راجع resolveMissingEntities بالهوك)، لا لأصل
      // فهرس المطابقة نفسه. نفس فلسفة إصلاح missing_customer أعلاه بالضبط: مستخدم
      // رفع ملف منتجات يدويًا (بجانب عملاء/مواقع عبر API) لم يكن يستطيع إكمال
      // الاستيراد إطلاقًا لأن كل منتج ناقص يبقى خطأً حاجبًا صلبًا بلا مسار إنشاء.
      // الآن code:'missing_product' يُطبَّق دومًا؛ رسالة النص فقط تبقى تفرّق المصدر.
      if(!p){
        const msg = products.raw===null
          ? `السطر ${rn}: كود المنتج "${row.N}" غير موجود بمنشأة العميل الحقيقية.`
          : `السطر ${rn}: كود المنتج "${row.N}" غير موجود في تقرير المنتجات المرفوع.`;
        addIssue(row.id,'N','err',msg, MISSING_PRODUCT_CODE);
      }
      else if(p.sellable===false) addIssue(row.id,'N','err',`السطر ${rn}: المنتج "${p.name||row.N}" غير قابل للبيع (حالته "لا" في تقرير المنتجات) ولا يمكن اعتماده ضمن الاستيراد.`);
    }
    } // !isReceipt — نهاية فحوصات بند/موقع الفاتورة العادية، لا تُطبَّق على صف سند قبض.

    // العميل — يُطبَّق على الصفين معًا (فاتورة/سند قبض): سند القبض يحتاج نفس
    // مطابقة العميل الحقيقي (contact_id يُشتق من الفاتورة فعليًا وقت الإرسال،
    // لكن فحص وجود العميل هنا مفيد بذاته لسند مستقل قد يُكتَب بعميل خاطئ).
    if(!isBlank(row.C) && customers.loaded){
      const c = customers.byRef.get(norm(row.C));
      if(!c){
        const dup = customers.byName.get(normKey(row.C)) || [];
        if(dup.length>1){
          // [ملاحظة] بلا code هنا عمدًا — تعارض اسم مكرر يحتاج حسمًا يدويًا (AmbiguityPanel)
          // لا إنشاء تلقائي، مشكلة مختلفة تمامًا عن "غير موجود إطلاقًا".
          addIssue(row.id,'C','err',`السطر ${rn}: الاسم "${row.C}" مكرر لأكثر من عميل — اختر الرقم المرجعي الصحيح من: ${dup.map(x=>x.ref).join('، ')}`);
        } else {
          // [تصحيح 2026-09-16، بلاغ اختبار حي] code:'missing_customer' كان مقصورًا
          // على customers.raw===null (فهرس عملاء مجلوب عبر API) — لكن الإنشاء
          // التلقائي فعليًا لا يعتمد على مصدر فهرس العملاء إطلاقًا، بل على وجود
          // مفتاح API حقيقي بالخطوة 4 (المُستخدَم دومًا لإرسال الفواتير بغض النظر
          // عن مصدر أي فهرس بالخطوة 1) — جلسة مختلطة حقيقية (عملاء مرفوعون يدويًا
          // + بقية البيانات مجلوبة عبر API) كانت تُحجَب عن الإنشاء التلقائي
          // للعميل رغم توفر مفتاح API فعليًا وقابلية الإنشاء الحقيقية. الآن
          // code:'missing_customer' يُطبَّق دومًا؛ رسالة النص فقط تبقى تفرّق
          // المصدر (ملف مرفوع/منشأة حقيقية) لتوضيح السبب للمستخدم لا لمنع الإنشاء.
          const msg = customers.raw===null
            ? `السطر ${rn}: العميل "${row.C}" غير موجود بمنشأة العميل الحقيقية.`
            : `السطر ${rn}: الرقم المرجعي للعميل "${row.C}" غير موجود في ملف العملاء المرفوع.`;
          addIssue(row.id,'C','err',msg, MISSING_CUSTOMER_CODE);
        }
      }
      else if(c.active===false) addIssue(row.id,'C','warn',`السطر ${rn}: العميل "${c.name||row.C}" مُسجَّل كغير نشط.`);
    }

    // [إضافة] حقول سند القبض الإلزامية (تاريخه، قيمته، حساب الدفع) — راجع
    // تعليق رأس engine/receipts.js. مطابقة حساب الدفع بحساب حقيقي (كود مقابل
    // id) لا تحدث هنا — تحدث بلوحة مراجعة مخصَّصة قبل الإرسال الفعلي (نفس فلسفة
    // "الأخطاء الحاجبة" هنا مقصورة على "هل القيمة موجودة وصالحة الشكل؟" فقط).
    if(isReceipt){
      if(isBlank(row.D)) addIssue(row.id,'D','err',`السطر ${rn}: تاريخ سند القبض إلزامي.`);
      const amt = parseFloat(row.paymentAmount);
      if(isBlank(row.paymentAmount) || isNaN(amt) || amt<=0) addIssue(row.id,'paymentAmount','err',`السطر ${rn}: قيمة الدفعة (سند القبض) يجب أن تكون رقمًا أكبر من صفر.`);
      if(isBlank(row.paymentAccountCode)) addIssue(row.id,'paymentAccountCode','err',`السطر ${rn}: حساب الدفع إلزامي لسند القبض.`);
    }
  });

  // قاعدة تطابق/تفريغ بيانات الرأس داخل كل مجموعة مرجع
  groups.forEach((rowsInGroup, key)=>{
    if(key.startsWith('__blank__')) return; // الفواتير بمرجع فارغ لها تحقق مستقل أدناه
    // [إضافة] صفوف "سند قبض" (راجع engine/receipts.js) تُستبعَد من فحصَي تطابق/
    // إلزامية حقول الرأس أدناه — D لسند القبض هو تاريخه هو (يختلف طبيعيًا عن
    // تاريخ إصدار الفاتورة نفسها بنفس المرجع)، وG لا معنى له إطلاقًا لسند قبض
    // (لا موقع/مخزون لسند مالي). فحوصها الخاصة تمت أعلاه (كتلة isReceipt).
    const invoiceRowsInGroup = rowsInGroup.filter(r=>!isReceiptRow(r));
    if(invoiceRowsInGroup.length>=2){
      HEADER_COLS.forEach(hk=>{
        const values = invoiceRowsInGroup.map(r=>norm(r[hk]));
        const nonBlank = values.filter(v=>v!=='');
        if(nonBlank.length===0) return;
        const allBlankAfterFirst = values.slice(1).every(v=>v==='');
        const allIdentical = values.every(v=>v===values[0]);
        if(!allBlankAfterFirst && !allIdentical){
          invoiceRowsInGroup.forEach((r,i)=>{
            if(i===0) return;
            if(norm(r[hk]) !== '' && norm(r[hk]) !== norm(invoiceRowsInGroup[0][hk])){
              const rn = (rowIndexById.get(r.id) ?? rows.indexOf(r))+1;
              addIssue(r.id, hk, 'err', `السطر ${rn}: قيمة "${COLUMNS.find(c=>c.key===hk).name}" تختلف عن السطر الأول لنفس مرجع الفاتورة (${key}). اتركها فارغة أو طابقها تمامًا.`);
            }
          });
        }
      });
    }
    // [إضافة] سند قبض بمرجع لا يقابله أي سطر فاتورة فعلي بنفس الملف — خطأ صريح
    // بدل رسالة "G ناقصة" المضلِّلة (لا يوجد G أصلًا لسند قبض بمفرده).
    if(invoiceRowsInGroup.length===0){
      rowsInGroup.forEach(r=>{
        const rn = (rowIndexById.get(r.id) ?? rows.indexOf(r))+1;
        addIssue(r.id, 'A', 'err', `السطر ${rn}: سند قبض بمرجع "${key}" لا يقابله أي سطر فاتورة فعلي بنفس الملف — أضِف سطور الفاتورة أو صحّح المرجع.`);
      });
      return;
    }
    // تحقق من الحقول الإلزامية على مستوى الفاتورة (تحسب من أول قيمة غير فارغة بالمجموعة)
    // يجب أن يعمل هذا التحقق حتى لو كانت الفاتورة مكوّنة من سطر واحد فقط
    ['C','D','G'].forEach(hk=>{
      const hasAny = invoiceRowsInGroup.some(r=>!isBlank(r[hk]));
      if(!hasAny){
        const rn = (rowIndexById.get(invoiceRowsInGroup[0].id) ?? rows.indexOf(invoiceRowsInGroup[0]))+1;
        addIssue(invoiceRowsInGroup[0].id, hk, 'err', `مجموعة الفاتورة "${key}" (بدءًا من السطر ${rn}): حقل "${COLUMNS.find(c=>c.key===hk).name}" إلزامي ولم يُعبَّأ في أي سطر من المجموعة.`);
      }
    });
  });
  // فواتير بمرجع فارغ ومفردة أيضا تحتاج تحقق C/D/G
  rows.forEach((row,idx)=>{
    if(isBlank(row.A)){
      ['C','D','G'].forEach(hk=>{
        if(isBlank(row[hk])) addIssue(row.id,hk,'err',`السطر ${idx+1}: حقل "${COLUMNS.find(c=>c.key===hk).name}" إلزامي.`);
      });
    }
  });

  // ---------- الخصم أكبر من قيمة البند / قيمة الفاتورة ----------
  // إجمالي البند = الكمية × سعر الوحدة، ثم نطرح خصم البند (نسبة أو قيمة) للوصول لصافي الفاتورة
  // الذي يُقارَن به خصم المستند.
  function lineGross(r){
    const q = parseFloat(r.P), p = parseFloat(r.R);
    return (isNaN(q) || isNaN(p)) ? NaN : q*p;
  }
  rows.forEach((row, idx)=>{
    const gross = lineGross(row);
    if(isNaN(gross)) return;
    const u = isBlank(row.U) ? null : parseFloat(row.U);
    if(u!==null && !isNaN(u) && u > gross + 0.005){
      const msg = `السطر ${idx+1}: قيمة الخصم (${u}) أعلى من قيمة البند نفسه (${round2(gross)} = ${row.P} × ${row.R}) — عدّل الخصم ليكون أقل من قيمة البند أو مساويًا لها.`;
      addIssue(row.id,'U','err',msg);
    }
  });
  groups.forEach((rowsInGroup, key)=>{
    if(key.startsWith('__blank__')) return;
    let net = 0, ok = false;
    rowsInGroup.forEach(r=>{
      const gross = lineGross(r);
      if(isNaN(gross)) return;
      ok = true;
      let lineNet = gross;
      const t = isBlank(r.T) ? null : parseFloat(r.T);
      const u = isBlank(r.U) ? null : parseFloat(r.U);
      if(t!==null && !isNaN(t)) lineNet -= gross * (t/100);
      else if(u!==null && !isNaN(u)) lineNet -= u;
      net += lineNet;
    });
    if(!ok) return;
    // خصم المستند يُكتب في السطر الأول من المجموعة، وقد يُترك فارغًا في بقية الأسطر
    const kRow = rowsInGroup.find(r=>!isBlank(r.K));
    if(!kRow) return;
    const k = parseFloat(kRow.K);
    if(isNaN(k)) return;
    if(k > Math.max(0, net) + 0.005){
      const rn = (rowIndexById.get(kRow.id) ?? rows.indexOf(kRow))+1;
      addIssue(kRow.id,'K','err',`الفاتورة "${key}" (السطر ${rn}): قيمة خصم المستند (${k}) أعلى من إجمالي قيمة الفاتورة (${round2(net)}) — عدّل قيمة الخصم ليكون أقل من إجمالي الفاتورة أو مساويًا له.`);
    }
  });

  // عمود إلزامي لم يُعثر له على موضع في القالب المرفوع = الملف الناتج سيخرج ناقصًا، فنمنع التصدير
  if(template.loaded && rows.length){
    (template.missingFields||[])
      .filter(k=>COLUMNS.find(c=>c.key===k).required)
      .forEach(k=>{
        addIssue(rows[0].id, k, 'err', `عمود "${COLUMNS.find(c=>c.key===k).name}" غير موجود في القالب المرفوع — لن تُكتب قيمه في الملف النهائي. تأكد من رفع قالب قيود الأصلي دون تعديل صف العناوين.`);
      });
  }

  // التحقق التراكمي من كفاية المخزون (محاكاة الاستهلاك التسلسلي) — انظر stockSimulation.js
  // [إصلاح خطأ حقيقي] newSkus/newLocations (منتجات/مواقع أُنشئت هذه الجلسة عبر
  // resolveMissingEntities) — راجع تعليق رأس getStockTopUpNeeds بـstockSimulation.js.
  // بلا تمريرها هنا، منتج/موقع جديد كليًا لا يظهر له أي تحذير نقص كمية (code:
  // 'stock_shortage_draft')، فـstockShortageGroups يخرج فارغًا ولوحة "تغذية
  // المخزون تلقائيًا" لا تظهر أصلًا — الفاتورة تُرسَل مباشرة وتُنشأ كمسودة صامتة
  // (draft_if_out_of_stock) بلا أي تنبيه أو خيار للمستخدم.
  if(stock.loaded){
    checkStockSequential(rows, {productsIndex: products.loaded ? products : null, stockIndex: stock, newSkus: refs.newSkus, newLocations: refs.newLocations}).forEach(iss=>{
      addIssue(iss.rowId, iss.colKey, iss.sev, iss.msg, iss.code);
    });
  }

  return {byRow: issuesByRow, list: summary};
}

// من findInvoicesMissingLocation (qoyod_validator_core.js أسطر 1911-1920) — نقية، تأخذ rows كوسيط.
export function findInvoicesMissingLocation(rows){
  const groups = groupRowsByInvoiceRef(rows);
  const missing = [];
  groups.forEach((rowsInGroup,key)=>{
    if(key.startsWith('__blank__')) return;
    if(rowsInGroup.every(r=>isBlank(r.G))) missing.push({key, rows:rowsInGroup});
  });
  return missing;
}

// يعيد أسطر الفواتير "السليمة تمامًا" فقط (كل أسطر الفاتورة خالية من أي خطأ حاجب) — تُستخدم في خيار
// "تحميل الفواتير الصحيحة فقط" عندما لا يزال في الملف فواتير أخرى بها أخطاء.
// نسخ حرفي من qoyod_validator_core.js (أسطر 2002-2012).
export function getValidOnlyRows(rows, issuesByRow){
  const groups = groupRowsByInvoiceRef(rows);
  const validRows = [];
  groups.forEach((rowsInGroup, key)=>{
    if(key.startsWith('__blank__')) return; // الفواتير بلا مرجع أصلًا غير صالحة للتصدير
    const anyErr = rowsInGroup.some(r => (issuesByRow[r.id] && Object.values(issuesByRow[r.id]).some(arr=>arr.some(i=>i.sev==='err'))));
    if(!anyErr) for(let i=0;i<rowsInGroup.length;i++) validRows.push(rowsInGroup[i]); // بلا spread — راجع تعليق excelCore.js.readWorkbookRows لسبب تجنّبه مع مصفوفات كبيرة
  });
  return validRows;
}

export const STOCK_SHORTAGE_DRAFT_CODE = 'stock_shortage_draft';

// [إضافة] يرجّع مجموعات الفواتير (مرجع + صفوفها + رسائل التحذير) التي فيها نقص
// كمية "قابل للإرسال كمسودة" (code==='stock_shortage_draft' — فقط بمسار المخزون
// المجلوب عبر API، راجع checkStockSequential) — تُستخدَم بلوحة مراجعة الخطوة 4
// (StockShortageReviewPanel) لعرض الفواتير المحفوفة بالمخاطر والسماح بقرار صريح
// لكل واحدة قبل الإرسال، بدل حجبها بالكامل عن مسار الإرسال عبر API.
export function getStockShortageDraftGroups(rows, issuesByRow){
  const groups = groupRowsByInvoiceRef(rows);
  const result = [];
  groups.forEach((rowsInGroup, key)=>{
    if(key.startsWith('__blank__')) return;
    const messages = [];
    rowsInGroup.forEach(r=>{
      const byCol = issuesByRow[r.id];
      if(!byCol) return;
      Object.values(byCol).forEach(arr=>{
        arr.forEach(i=>{ if(i.code === STOCK_SHORTAGE_DRAFT_CODE) messages.push(i.msg); });
      });
    });
    if(messages.length) result.push({ref: key, rows: rowsInGroup, messages});
  });
  return result;
}

// [إضافة] يبني خطة الكيانات الناقصة القابلة للإنشاء التلقائي (عملاء/منتجات/مواقع)
// من issuesByRow (نتيجة runValidation) + rows نفسها — تُستخدَم من useMemo
// missingEntitiesPlan بالهوك (useSalesInvoiceImportEngine.js) وMissingEntitiesReviewPanel.
// دالة نقية قابلة للاختبار مباشرة، على نفس نمط getStockShortageDraftGroups أعلاه:
//  - عملاء/منتجات: من issues بكود MISSING_CUSTOMER_CODE/MISSING_PRODUCT_CODE فقط
//    (مُعلَّمة بالفعل من runValidation فقط لو الفهرس مجلوب عبر API — راجع تعليقها).
//  - مواقع: حالة مستقلة تمامًا وغير مرتبطة بـissues إطلاقًا (لا تحقق مسبق للموقع
//    بمسار API أصلًا — راجع تعليق رأس الأداة/الخطة)؛ تُفحَص هنا مباشرة مقابل
//    locationIdByName (يُمرَّر بوسيط منفصل)، بنفس شرط بوابة stockShortageGroups
//    (المسار المجلوب عبر API فقط — locationIdByName !== null يعني ذلك، بصرف
//    النظر عن حجمه: منشأة بلا أي موقع مُعرَّف بعد ترجع فهرسًا فارغًا صالحًا).
export function computeMissingEntitiesPlan(rows, issuesByRow, {locationIdByName} = {}){
  const customers = new Map(); // normKey(typedName) -> {typedName, rowIds}
  const products = new Map(); // normKey(typedSku) -> {typedSku, typedName, rowIds, categoryFromFile, unitFromFile, sellingPriceFromFile, taxLabelFromFile}
  const locations = new Map(); // normKey(typedName) -> {typedName, rowIds}

  const hasCode = (row, colKey, code) => {
    const byCol = issuesByRow[row.id];
    const arr = byCol && byCol[colKey];
    return !!(arr && arr.some(i=>i.code===code));
  };

  (rows||[]).forEach(row=>{
    if(hasCode(row, 'C', MISSING_CUSTOMER_CODE)){
      const typedName = norm(row.C);
      const key = normKey(typedName);
      if(!customers.has(key)) customers.set(key, {typedName, rowIds: []});
      customers.get(key).rowIds.push(row.id);
    }
    if(hasCode(row, 'N', MISSING_PRODUCT_CODE)){
      const typedSku = norm(row.N);
      const key = normKey(typedSku);
      if(!products.has(key)){
        // [إضافة] سعر الوحدة (R) وفئة الضريبة (V) من أول ظهور لهذا المنتج بالملف —
        // نفس نمط categoryFromFile/unitFromFile بالضبط (أول قيمة فقط، لا يُعاد
        // حسابها لكل صف). تُستخدَمان لاحقًا (qoyodEntityCreate.js) لتعبئة
        // selling_price/tax_id الحقيقيين عند إنشاء المنتج — منشأة العميل الحقيقية
        // (2026-09-16) رفضت POST /products بلا هذين الحقلين فعليًا رغم كونهما
        // اختياريين بمواصفة OpenAPI الرسمية (ProductInput)، فتفشل كل الفواتير
        // لاحقًا بصمت عند البحث عن معرّف منتج لم يُنشأ أصلًا.
        const priceNum = parseFloat(row.R);
        products.set(key, {
          typedSku,
          typedName: norm(row.O) || typedSku,
          rowIds: [],
          categoryFromFile: isBlank(row.categoryRef) ? undefined : norm(row.categoryRef),
          unitFromFile: isBlank(row.unitRef) ? undefined : norm(row.unitRef),
          sellingPriceFromFile: isNaN(priceNum) ? undefined : priceNum,
          taxLabelFromFile: isBlank(row.V) ? undefined : norm(row.V),
        });
      }
      products.get(key).rowIds.push(row.id);
    }
    if(locationIdByName){
      const typedName = norm(row.G);
      if(typedName && !locationIdByName.has(typedName)){
        const key = normKey(typedName);
        if(!locations.has(key)) locations.set(key, {typedName, rowIds: []});
        locations.get(key).rowIds.push(row.id);
      }
    }
  });

  return {
    customers: Array.from(customers.values()),
    products: Array.from(products.values()),
    locations: Array.from(locations.values()),
  };
}
