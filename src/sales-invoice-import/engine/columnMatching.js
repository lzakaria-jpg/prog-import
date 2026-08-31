/* محرك مطابقة الأعمدة وتحديد تخطيط القالب — نسخ حرفي من qoyod_validator_core.js
   (أسطر 173-247 و 488-588). كل الدوال هنا نقية بالكامل. */

import { COLUMNS, COL_KEYS, TEMPLATE_HEADER_SYNONYMS } from './constants.js';
import { norm, stripArabicMarks, normKey } from './text.js';

export function colLetterToIndex(letters){
  let n = 0;
  for(let i=0;i<letters.length;i++) n = n*26 + (letters.charCodeAt(i)-64);
  return n;
}
export function indexToColLetter(n){
  let s = '';
  while(n>0){ const r = (n-1)%26; s = String.fromCharCode(65+r) + s; n = Math.floor((n-1)/26); }
  return s;
}
export function normHdr(s){
  return String(s==null?'':s)
    .replace(/[ً-ْٰ]/g,'')
    .replace(/[*؟?]/g,' ')
    .replace(/\([^)]*\)/g,' ')
    .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي')
    .replace(/\s+/g,' ')
    .trim().toLowerCase();
}

// نجرّد أدوات التعريف واللواصق العربية من بداية الكلمة حتى تتطابق "الباركود" مع "باركود"
// و"للمنتج" مع "المنتج" — وهي الحالة الشائعة في اختلاف صياغة عناوين الأعمدة.
export function stemArabicToken(t){
  if(!/[؀-ۿ]/.test(t)) return t;
  let s = t;
  const prefixes = ['وبال','فبال','بال','كال','فال','وال','لل','ال'];
  for(const p of prefixes){
    if(s.startsWith(p) && s.length - p.length >= 3){ s = s.slice(p.length); break; }
  }
  return s;
}
export function tokenize(s){
  return stripArabicMarks(String(s||'')).toLowerCase()
    .replace(/[#_\-\/()،,.]+/g,' ')
    .split(/\s+/).map(t=>stemArabicToken(t.trim())).filter(Boolean);
}
// تشابه نصي بسيط (مسافة ليفنشتاين) لتحمّل الأخطاء الإملائية في عناوين الأعمدة مثل "Ptoducts".
export function editDistance(a, b){
  const m = a.length, n = b.length;
  if(!m) return n; if(!n) return m;
  let prev = Array.from({length:n+1}, (_,j)=>j);
  for(let i=1;i<=m;i++){
    const cur = [i];
    for(let j=1;j<=n;j++){
      cur[j] = Math.min(prev[j]+1, cur[j-1]+1, prev[j-1] + (a[i-1]===b[j-1]?0:1));
    }
    prev = cur;
  }
  return prev[n];
}
export function similarity(a, b){
  if(!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - editDistance(a, b)/maxLen;
}
export function tokenOverlapScore(headerTokens, keyword){
  const kwTokens = tokenize(keyword);
  // نطلب عبارة من كلمتين فأكثر ووجود كل كلماتها (بأي ترتيب) ضمن كلمات العنوان — تطابق كلمة واحدة فقط من
  // عبارة أطول (مثل "discount" وحدها مقابل "document discount") ليس دليلًا كافيًا ويُنتج مطابقات خاطئة.
  // الكلمة المفردة أصلًا يغطيها فحص الاحتواء الجزئي في المرحلة الثانية.
  if(kwTokens.length < 2) return 0;
  const matched = kwTokens.filter(kt=>headerTokens.includes(kt)).length;
  return matched === kwTokens.length ? 1 : 0;
}

// يحل مطابقة أعمدة عدة حقول دفعة واحدة عبر أربع مراحل: التطابق التام أولًا لكل الحقول، ثم تطابق
// الاحتواء الجزئي، ثم تداخل الكلمات، ثم تحمّل الأخطاء الإملائية. هذا يمنع حقلًا بكلمة مفتاحية عامة
// (مثل "unit" ضمن "Unit Price") من الاستحواذ خطأً على عمود يخص حقلًا آخر له تطابق تام أدق.
// fields: preUsed تحدد رؤوس أعمدة محجوزة مسبقًا (من حقول أخرى) بحيث لا تتنافس معها هذه الدفعة.
export function guessColumnsBatch(fields, headers, preUsed){
  const result = {};
  const used = new Set(preUsed || []);
  // reject: دالة اختيارية على الحقل لاستبعاد عناوين لا يصح أن تُسند إليه (مثل عمود ضريبة لحقل إجمالي البند)
  const allowed = (f, h) => !(typeof f.reject === 'function' && f.reject(h));
  // المرحلة 1: تطابق تام (بعد التطبيع)
  fields.forEach(f=>{
    for(const h of headers){
      if(used.has(h) || !allowed(f,h)) continue;
      const nk = normKey(h);
      if(f.kw.some(kw=>nk===normKey(kw))){ result[f.key]=h; used.add(h); break; }
    }
  });
  // المرحلة 2: تطابق احتواء جزئي (كلمة مفتاحية ضمن اسم العمود)
  fields.forEach(f=>{
    if(result[f.key]) return;
    for(const h of headers){
      if(used.has(h) || !allowed(f,h)) continue;
      const nk = normKey(h);
      if(f.kw.some(kw=>nk.includes(normKey(kw)))){ result[f.key]=h; used.add(h); break; }
    }
  });
  // المرحلة 3: تطابق تقريبي بتداخل الكلمات — يغطي تسميات غير متوقعة تمامًا
  // (مثل "Bill Number" أو "Number of Bill" لعمود "مرجع الفاتورة") دون اعتماد كلي على قائمة كلمات مفتاحية ثابتة
  fields.forEach(f=>{
    if(result[f.key]) return;
    let bestH=null, bestScore=0;
    for(const h of headers){
      if(used.has(h) || !allowed(f,h)) continue;
      const headerTokens = tokenize(h);
      if(headerTokens.length===0) continue;
      let score=0;
      f.kw.forEach(kw=>{ score = Math.max(score, tokenOverlapScore(headerTokens, kw)); });
      if(score>bestScore){ bestScore=score; bestH=h; }
    }
    if(bestH && bestScore>=0.5){ result[f.key]=bestH; used.add(bestH); }
  });
  // المرحلة 4: تحمّل الأخطاء الإملائية في عناوين الأعمدة (مثل "Ptoducts" بدل "Products")
  fields.forEach(f=>{
    if(result[f.key]) return;
    let bestH=null, bestScore=0;
    for(const h of headers){
      if(used.has(h) || !allowed(f,h)) continue;
      const nk = normKey(h);
      if(nk.length < 4) continue;
      f.kw.forEach(kw=>{
        const nkw = normKey(kw);
        if(nkw.length < 4) return;
        const s = similarity(nk, nkw);
        if(s>bestScore){ bestScore=s; bestH=h; }
      });
    }
    if(bestH && bestScore>=0.82){ result[f.key]=bestH; used.add(bestH); }
  });
  fields.forEach(f=>{ if(result[f.key]===undefined) result[f.key]=''; });
  return result;
}

// يبحث عن صف العناوين داخل أول صفوف الورقة ويُرجع خريطة: مفتاح الحقل -> حرف العمود الفعلي.
// نستخدم نفس محرك المطابقة الذكي المستعمل لملفات العملاء (تطابق تام ⟵ احتواء ⟵ تداخل كلمات مع
// تجريد أدوات التعريف ⟵ تحمّل الأخطاء الإملائية)، حتى تُلتقط تسميات مثل
// "الرقم التسلسلي/الباركود للمنتج" أو "الكمية (بالوحدة الأساسية)" مهما اختلفت صياغتها.
export function detectTemplateLayout(rowsByNum){
  let best = null;
  const rowNums = Object.keys(rowsByNum).map(Number).sort((a,b)=>a-b).slice(0,8);
  rowNums.forEach(rn=>{
    const cells = rowsByNum[rn];
    const headerTexts = [];
    const letterOf = new Map();
    Object.keys(cells).forEach(letter=>{
      const t = norm(cells[letter]).replace(/\*/g,'').trim();
      if(t==='' || letterOf.has(t)) return;
      letterOf.set(t, letter);
      headerTexts.push(t);
    });
    if(headerTexts.length < 5) return;
    const fields = COL_KEYS.map(k=>({
      key: k,
      kw: [COLUMNS.find(c=>c.key===k).name, ...(TEMPLATE_HEADER_SYNONYMS[k]||[])],
    }));
    const guess = guessColumnsBatch(fields, headerTexts);
    const map = {};
    let score = 0;
    COL_KEYS.forEach(k=>{ if(guess[k]){ map[k] = letterOf.get(guess[k]); score++; } });
    if(!best || score > best.matched) best = {headerRow: rn, colMap: map, matched: score};
  });
  if(!best || best.matched < 8) return null;
  return best;
}
