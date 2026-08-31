/* بناء فهارس الملفات المرجعية (منتجات/مخزون/عملاء) — نسخ حرفي من الجزء غير-DOM من
   buildIndex في qoyod_validator_core.js (أسطر 857-946)، مقسَّمة إلى 3 دوال بانية مستقلة
   حسب النوع (بدل تفريع واحد بمعامل kind)، بلا أي استدعاء DOM (setCardLoaded/buildRefDatalists/
   checkStep1Ready تنتقل لطبقة React). rowGet نسخ حرفي من سطر 851-855. */

import { norm, normKey } from './text.js';

export function rowGet(row, headers, colName){
  if(!colName) return '';
  const idx = headers.indexOf(colName);
  return idx>=0 ? row[idx] : '';
}

// من الجزء kind==='products' في buildIndex (أسطر 860-894)
export function buildProductsIndex(raw, headers, mapping){
  const map = new Map();
  const byName = new Map();
  raw.forEach(r=>{
    const sku = norm(rowGet(r, headers, mapping.sku));
    if(!sku) return;
    const name = norm(rowGet(r, headers, mapping.name));
    let sellableRaw = norm(rowGet(r, headers, mapping.sellable));
    let sellable = true;
    if(sellableRaw){
      const sv = sellableRaw.toLowerCase();
      // نتحقق من كلمات النفي الشائعة (لا / غير) وليس فقط تطابق تام، لأن تسمية عمود الحالة تختلف من تصدير لآخر
      sellable = !( sv.includes('لا') || sv.includes('غير') || sv==='no' || sv==='false' || sv==='0' || sv==='unavailable' || sv==='disabled' || sv==='' );
    }
    // حالة التخزين: المنتج "غير مخزن" (أو خدمة) لا يخضع لأي حد كمية ولا يظهر في تقرير مواقع المنتجات
    const stockedRaw = norm(rowGet(r, headers, mapping.stocked));
    let stocked = null; // null = العمود غير مُطابَق، فنُبقي السلوك السابق كما هو
    if(stockedRaw){
      const tv = normKey(stockedRaw);
      // ترتيب الفحص مقصود: "غير مخزن" تُفحص قبل "مخزن" لأنها تحتوي الكلمة نفسها.
      if(/غيرمخزن|غيرمخزون|لايخزن|خدمه|خدمة|service|nonstock|notstocked|noninventory/.test(tv)) stocked = false;
      else if(/^(لا|no|false|0)$/.test(tv)) stocked = false;
      else if(/مخزن|مخزون|يخزن|stock|inventory/.test(tv)) stocked = true;
      else if(/^(نعم|yes|true|1)$/.test(tv)) stocked = true;
    }
    const rec = {sku, name, sellable, stocked};
    map.set(sku, rec);
    if(name){
      const nk = normKey(name);
      if(!byName.has(nk)) byName.set(nk, []);
      byName.get(nk).push(rec);
    }
  });
  const nonStockedCount = Array.from(map.values()).filter(p=>p.stocked===false).length;
  return {bySku: map, byName, nonStockedCount};
}

// من الجزء kind==='stock' في buildIndex (أسطر 895-923)
export function buildStockIndex(raw, headers, mapping){
  const map = new Map();
  if(mapping.mode==='wide'){
    // صيغة عريضة: كل عمود موقع مستقل تحته الكمية — نفكّها إلى ثلاثيات (منتج، موقع، كمية)
    const locHeaders = Object.keys(mapping.locCols || {});
    raw.forEach(r=>{
      const sku = norm(rowGet(r, headers, mapping.sku));
      if(!sku) return;
      locHeaders.forEach(h=>{
        const loc = mapping.locCols[h];
        const qty = parseFloat(String(rowGet(r, headers, h)).replace(/[^\d.\-]/g,''));
        if(!loc || isNaN(qty)) return;
        map.set(sku+'||'+loc, qty);
      });
    });
    return {byKey: map, groupCount: map.size, locHeaderCount: locHeaders.length};
  } else {
    raw.forEach(r=>{
      const sku = norm(rowGet(r, headers, mapping.sku));
      const loc = norm(rowGet(r, headers, mapping.location));
      const qtyRaw = rowGet(r, headers, mapping.qty);
      const qty = parseFloat(String(qtyRaw).replace(/[^\d.\-]/g,'')) || 0;
      if(!sku || !loc) return;
      map.set(sku+'||'+loc, qty);
    });
    return {byKey: map, groupCount: map.size};
  }
}

// من الجزء kind==='customers' في buildIndex (أسطر 924-940)
export function buildCustomersIndex(raw, headers, mapping){
  const map = new Map();
  const byName = new Map();
  raw.forEach(r=>{
    const ref = norm(rowGet(r, headers, mapping.ref));
    if(!ref) return;
    const name = norm(rowGet(r, headers, mapping.name));
    const statusRaw = norm(rowGet(r, headers, mapping.status)).toLowerCase();
    const active = !(statusRaw.includes('غير') || statusRaw.includes('لا') || statusRaw==='inactive' || statusRaw==='false' || statusRaw==='0' || statusRaw==='disabled');
    const rec = {ref, name, active};
    map.set(ref, rec);
    if(name){
      const nk = normKey(name);
      if(!byName.has(nk)) byName.set(nk, []);
      byName.get(nk).push(rec);
    }
  });
  return {byRef: map, byName};
}
