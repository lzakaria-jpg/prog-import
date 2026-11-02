// ترجمة حرفية للأسماء من الإنجليزية إلى العربية: قاموس للأسماء الشائعة (بكل تهجئاتها) + قواعد صوتية لغير المعروف.
// النتيجة تُعلَّم دائمًا "للمراجعة" لأن الترجمة الحرفية تخمين.

// الصيغة: "تهجئة|تهجئة:الاسم العربي" مفصولة بفواصل
const DICT_SRC = `
mohammed|mohamed|muhammad|mohammad|muhammed|mohamad|mohd|mhd|mehmet|mohammod:محمد,ahmed|ahmad|ahmet:أحمد,mahmoud|mahmood|mahmud:محمود,mustafa|mostafa|moustafa:مصطفى,
abdullah|abdallah|abdulla|abdellah:عبدالله,abdulrahman|abdelrahman|abdurrahman|abdulrhman:عبدالرحمن,abdulaziz|abdelaziz|abdul-aziz:عبدالعزيز,
abdulelah|abdulilah|abdelilah:عبدالإله,abdulkarim|abdelkarim|abdulkareem:عبدالكريم,abdulmajeed|abdulmajid:عبدالمجيد,abdulrahim|abdelrahim|abdulraheem:عبدالرحيم,
abdelfattah|abdulfattah:عبدالفتاح,abdulqadir|abdulkadir|abdelkader|abdulqader:عبدالقادر,abdulghafoor|abdulghafour:عبدالغفور,abdulhadi:عبدالهادي,abdulmalik:عبدالملك,
khalid|khaled:خالد,fahad|fahd:فهد,saud|saoud:سعود,sultan:سلطان,turki:تركي,naif|nayef|naief:نايف,faisal|faysal|feisal:فيصل,omar|umar:عمر,ali:علي,
hassan|hasan:حسن,hussein|hussain|husain|hossain|husein|hosain:حسين,ibrahim|ebrahim|ibraheem:إبراهيم,ismail|ismael|esmail:إسماعيل,
yousef|youssef|yusuf|yousif|yousuf|yusef:يوسف,saleh|salih:صالح,saad|sa'ad:سعد,majed|majid|maged:ماجد,bandar:بندر,nasser|naser|nasir:ناصر,mansour|mansoor|mansur:منصور,
mishal|meshal|mishaal:مشعل,waleed|walid:وليد,tariq|tarek|tareq|tarik:طارق,hamza|hamzah:حمزة,bilal:بلال,imran:عمران,irfan:عرفان,osman|othman|usman|uthman:عثمان,
karim|kareem:كريم,rahim|raheem:رحيم,yasser|yasir|yaser:ياسر,ziad|ziyad|zeyad:زياد,rami:رامي,sami:سامي,badr|bader:بدر,salman:سلمان,sulaiman|sulaiman|suleiman|sulieman:سليمان,
abdul:عبد,hamad:حمد,hamed|hamid:حامد,rashid|rasheed|rashed:راشد,saeed|said|saied:سعيد,adel|adil:عادل,amr|amro:عمرو,anas:أنس,ayman:أيمن,bassam:بسام,
fawaz:فواز,ghazi:غازي,hani:هاني,hisham|hesham:هشام,jamal:جمال,jaber|jabir:جابر,kamal:كمال,mazen|mazin:مازن,mohsen|muhsin:محسن,moath|muath|muadh:معاذ,
nawaf:نواف,nabil|nabeel:نبيل,osama|usama:أسامة,qasim|qassim|kasim:قاسم,riyadh|riyad:رياض,saif|sayf:سيف,talal:طلال,thamer|thamir:ثامر,wael|wail:وائل,
yazan:يزن,yazeed|yazid:يزيد,zaid|zayed|zayd:زيد,abbas:عباس,mishari:مشاري,meshari:مشاري,rakan:راكان,raed:رائد,haitham|haytham:هيثم,emad|imad:عماد,
iqbal:إقبال,asif|asef:آصف,shahid:شاهد,tahir:طاهر,zahid:زاهد,javed|javeed:جاويد,arif:عارف,akbar:أكبر,aslam:أسلم,nadeem|nadim:نديم,naveed:نويد,
fatima|fatimah|fatma:فاطمة,aisha|ayesha|aysha|aishah:عائشة,maryam|mariam|maryem:مريم,noura|nora|nourah|norah:نورة,sara|sarah:سارة,reem|rim:ريم,hind:هند,
lama:لمى,layla|laila|leila|leyla:ليلى,amal:أمل,huda|hoda:هدى,nada:ندى,dana:دانة,rana:رنا,lina|leena:لينا,yasmin|yasmeen|yasmine:ياسمين,mona|muna:منى,
abeer:عبير,munira|muneera|monira:منيرة,haya:هيا,shahad:شهد,ghada:غادة,samar:سمر,salma:سلمى,asma|asmaa:أسماء,khadija|khadijah:خديجة,zainab|zaynab:زينب,
hanan:حنان,wafa|wafaa:وفاء,eman|iman:إيمان,rasha:رشا,reema|rima:ريما,afnan:أفنان,bushra:بشرى,jawaher:جواهر,latifa|latifah:لطيفة,nouf|nuf:نوف,
alotaibi:العتيبي,otaibi:العتيبي,alqahtani:القحطاني,qahtani:القحطاني,aldosari|aldossary|aldawsari|aldossari:الدوسري,dosari|dossary|dawsari:الدوسري,
alshammari:الشمري,shammari:الشمري,alghamdi:الغامدي,ghamdi:الغامدي,alzahrani:الزهراني,zahrani:الزهراني,almutairi:المطيري,mutairi:المطيري,
alharbi:الحربي,harbi:الحربي,alsubaie|alsubaei:السبيعي,subaie:السبيعي,alanazi|alenezi|alanezi:العنزي,anazi|enezi:العنزي,alshehri:الشهري,shehri:الشهري,
almalki|almaliki:المالكي,malki:المالكي,alrashid|alrasheed:الرشيد,alrasheed:الرشيد,altamimi:التميمي,tamimi:التميمي,aljuhani:الجهني,juhani:الجهني,
alshahrani:الشهراني,shahrani:الشهراني,alasmari:الأسمري,asmari:الأسمري,alamri:العمري,amri:العمري,alqurashi:القرشي,alhashimi|alhashemi:الهاشمي,
aldawood|aldawoud:الداود,alsaud:آل سعود,alfaisal:الفيصل,alzahrani:الزهراني,alyami:اليامي,alhajri:الهاجري,alkhaldi:الخالدي,alruwaili|alruwaily:الرويلي,
alshamrani:الشمراني,alomari:العمري,alsharif|elsherif|alsherif:الشريف,elsayed|alsayed|el-sayed:السيد,elshafei|alshafei:الشافعي,
alkhatib:الخطيب,alabbadi:العبادي,alhalabi:الحلبي,alyafei:اليافعي,alaoui:العلوي,haddad:حداد,abdelrahim:عبدالرحيم,
rajesh:راجيش,kumar:كومار,suresh:سوريش,nair:ناير,priya:بريا,sharma:شارما,khan:خان,siddiqui|siddiqi:صديقي,singh:سينغ,patel:باتيل,das:داس,
uddin:الدين,rahman:رحمن,hossain:حسين,islam:إسلام,ahmed:أحمد,chowdhury:شودري,begum:بيغوم,akter|akhter:أختر,miah|mia:ميا,
anil:أنيل,menon:مينون,vinod:فينود,ravi:رافي,sunil:سونيل,ramesh:راميش,manoj:مانوج,santosh:سانتوش,deepak:ديباك,arun:أرون,vijay:فيجاي,
prakash:براكاش,shankar:شانكار,krishna:كريشنا,lakshmi:لاكشمي,anitha|anita:أنيتا,reddy:ريدي,pillai:بيلاي,thomas:توماس,varghese:فارغيز,
baloch:بلوش,qureshi:قريشي,butt:بت,malik:مالك,chaudhry|chaudhary:تشودري,raza:رضا,abbasi:عباسي,mirza:ميرزا,hussaini:الحسيني,
maria:ماريا,santos:سانتوس,jose:خوسيه,reyes:رييس,cruz:كروز,angelica:أنجليكا,garcia:غارسيا,mendoza:ميندوزا,ramos:راموس,bautista:باوتيستا,
dela:ديلا,de:دي,la:لا,juan:خوان,mark:مارك,joseph:جوزيف,michael:مايكل,john:جون,james:جيمس,robert:روبرت,william:ويليام,david:ديفيد,
richard:ريتشارد,charles:تشارلز,christopher:كريستوفر,daniel:دانيال,paul:بول,peter:بيتر,george:جورج,edward:إدوارد,anthony:أنتوني,kevin:كيفن,
jennifer:جينيفر,elizabeth:إليزابيث,emily:إيميلي,emma:إيما,olivia:أوليفيا,sophia:صوفيا,anna|ana:آنا,grace:غريس,joy:جوي,rose:روز,
wilson:ويلسون,johnson:جونسون,smith:سميث,brown:براون,jones:جونز,miller:ميلر,davis:ديفيس,taylor:تايلور,anderson:أندرسون,white:وايت,
ram:رام,thapa:ثابا,gurung:غورونغ,tamang:تامانغ,rai:راي,nuwan:نوان,perera:بيريرا,fernando:فرناندو,silva:سيلفا,
mwangi:موانجي,otieno:أوتيينو,abebe:أبيبي,bekele:بيكيلي,tesfaye:تسفاي,yilmaz:يلماز,kaya:كايا,demir:دمير,siti:سيتي,rahma:رحمة,
nour|noor|nurul:نور,putri:بوتري,samer|samir:سامر,hossam|husam|hussam:حسام,maha:مها,rahaf:رهف,nasrin|nasreen:نسرين,nawaz:نواز,sheikh|shaikh:شيخ,
ghafoor:غفور,qadir|qader|kader:قادر,areej|arij:أريج,hany:هاني,buqami:البقمي,albuqami:البقمي,sahli:السهلي,alsahli:السهلي,najjar:النجار,alnajjar:النجار,
husseini:الحسيني,alhusseini:الحسيني,khoury|khouri:خوري,arjun:أرجون,abdulilah:عبدالإله,nour|noor:نور,manal:منال,mashael|mashail:مشاعل,
abdulmohsen|abdulmohsin:عبدالمحسن,abdulhakim:عبدالحكيم,turky:تركي,mohannad|muhannad:مهند,rayan|rayyan:ريان,omar:عمر,adnan:عدنان,
eid:عيد,awad:عوض,muteb|mutaib:متعب,mubarak:مبارك,marwan:مروان,shaker|shakir:شاكر,khalaf:خلف,ayed|aied:عايد,owais|uwais:أويس,
sanjay:سانجاي,rohit:روهيت,amit:أميت,rahul:راهول,pooja:بوجا,neha:نيها,joel:جويل,ronald|ronaldo:رونالد,edwin:إدوين,jerome:جيروم,
alrajhi:الراجحي,alhamdan:الحمدان,alfahad:الفهد,alsaleh:الصالح,alahmadi:الأحمدي,ahmadi:الأحمدي,alzahrani:الزهراني,alhamad:الحمد,
alotaiby:العتيبي,alharthi:الحارثي,harthi:الحارثي,alshahri:الشهري,alghamdi:الغامدي,albalawi:البلوي,balawi:البلوي,alonazi:العنزي,
alqarni:القرني,qarni:القرني,alsulami:السلمي,sulami:السلمي,alzahrani:الزهراني,aljohani:الجهني,johani:الجهني,almutlaq:المطلق,
alhazmi:الحازمي,hazmi:الحازمي,alfaifi:الفيفي,alsheikh:الشيخ,alkhateeb:الخطيب,khateeb|khatib:الخطيب,dewi:ديوي,lopez:لوبيز,gonzalez:غونزاليز,rodriguez:رودريغيز,martin:مارتن,karen:كارين,
`;
const DICT = new Map();
for (const part of DICT_SRC.split(',')) {
  const [en, ar] = part.split(':').map((x) => (x || '').trim());
  if (!en || !ar) continue;
  for (const v of en.split('|')) DICT.set(v.replace(/[^a-z]/g, ''), ar);
}

const DIGRAPH = [
  ['sh', 'ش'], ['kh', 'خ'], ['gh', 'غ'], ['th', 'ث'], ['dh', 'ذ'], ['ph', 'ف'], ['ch', 'تش'], ['ck', 'ك'], ['qu', 'كو'],
  ['oo', 'و'], ['ou', 'و'], ['ee', 'ي'], ['ea', 'ي'], ['ie', 'ي'], ['ai', 'اي'], ['ay', 'اي'], ['ey', 'اي'], ['ei', 'اي'],
  ['aa', 'ا'], ['au', 'او'], ['aw', 'او'], ['ow', 'او'], ['oa', 'و'],
];
const CONS = { b: 'ب', c: 'ك', d: 'د', f: 'ف', g: 'ج', h: 'ه', j: 'ج', k: 'ك', l: 'ل', m: 'م', n: 'ن', p: 'ب', q: 'ق', r: 'ر', s: 'س', t: 'ت', v: 'ف', w: 'و', x: 'كس', y: 'ي', z: 'ز' };
const isV = (ch) => 'aeiou'.includes(ch);

// قواعد صوتية لاسم غير موجود بالقاموس
function phonetic(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return '';
  let out = '';
  for (let i = 0; i < w.length;) {
    const ch = w[i], nx = w[i + 1], first = i === 0, last = i === w.length - 1;
    if (ch === nx && !isV(ch)) { i++; continue; } // حرف مكرر
    if (last && ch === 'h' && w[i - 1] === 'a') { out = out.replace(/ا$/, '') + 'ة'; i++; continue; } // ...ah ← ة
    const dg = DIGRAPH.find(([k]) => w.startsWith(k, i));
    if (dg) {
      let ar = dg[1];
      if (first && 'ouea'.includes(ch) && isV(nx)) ar = { ou: 'أو', oo: 'أو', ee: 'إي', ea: 'إي', ai: 'آي', ay: 'آي', au: 'أو', aw: 'أو', aa: 'آ', ei: 'آي', ey: 'آي', oa: 'أو' }[dg[0]] || ar;
      out += ar; i += 2; continue;
    }
    if (isV(ch)) {
      if (first) out += ch === 'a' ? 'ا' : ch === 'o' || ch === 'u' ? 'أو' : 'إي';
      else if (ch === 'e' && last && !isV(w[i - 1])) { /* e صامتة بالنهاية */ }
      else if (ch === 'a') out += 'ا';
      else if (ch === 'e' || ch === 'i') out += 'ي';
      else out += 'و';
      i++; continue;
    }
    if (ch === 'h' && i > 0 && !isV(w[i - 1])) { i++; continue; } // h صامتة بعد ساكن
    if (ch === 'c' && nx && 'eiy'.includes(nx)) { out += 'س'; i++; continue; }
    if (ch === 'y' && i > 0 && !isV(nx || '')) { out += 'ي'; i++; continue; }
    out += CONS[ch] || '';
    i++;
  }
  return out;
}

function word(tok) {
  const k = tok.toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return { ar: '', known: true };
  if (DICT.has(k)) return { ar: DICT.get(k), known: true };
  // عبد + اسم (Abdulmohsen ← عبدالمحسن)
  const ab = k.match(/^(abdul|abdel|abdal|abd)(.{3,})$/);
  if (ab) { const r = word(ab[2]); return { ar: 'عبدال' + r.ar.replace(/^ال/, ''), known: r.known }; }
  // ال + اسم عائلة (Alotaibi، Al-Harthi، Elsayed)
  const al = k.match(/^(al|el)(.{3,})$/);
  if (al) { const r = word(al[2]); return { ar: 'ال' + r.ar.replace(/^ال/, '').replace(/^أ/, 'أ'), known: r.known }; }
  return { ar: phonetic(k), known: false };
}

/* ===================== عربي ← إنجليزي ===================== */
const normA = (s) => String(s ?? '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// القاموس العكسي: أول تهجئة بالقائمة هي المعتمدة
const REV = new Map();
for (const part of DICT_SRC.split(',')) {
  const [en, ar] = part.split(':').map((x) => (x || '').trim());
  if (!en || !ar) continue;
  const k = normA(ar);
  const e = en.split('|')[0].replace(/[^a-z-]/g, '');
  // لأسماء "ال..." نفضّل التهجئة التي تبدأ بـ al
  if (!REV.has(k) || (k.startsWith('ال') && !REV.get(k).startsWith('al') && e.startsWith('al'))) REV.set(k, e);
}
const AR_MAP = {
  'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd',
  'ط': 't', 'ظ': 'z', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'ء': '', 'ئ': 'e', 'ؤ': 'o',
};
const VOW = new Set(['ا', 'و', 'ي', 'ع']);
const endsVowel = (s) => /[aeiou]$/.test(s);
function arPhonetic(w) {
  const s = normA(w);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], nx = s[i + 1], first = i === 0, last = i === s.length - 1;
    if (ch === 'ا') { out += 'a'; continue; }
    if (ch === 'ع') { out += endsVowel(out) ? '' : 'a'; continue; }
    if (ch === 'و' || ch === 'ي') {
      const consonantal = first || (nx && 'اوي'.includes(nx));
      if (consonantal) out += (!first && !endsVowel(out) ? 'a' : '') + (ch === 'و' ? 'w' : 'y');
      else out += ch === 'و' ? 'o' : 'i';
      continue;
    }
    if (ch === 'ه' && last && i > 0) { out += VOW.has(s[i - 1]) ? 'h' : 'a'; continue; } // ة/ه بالنهاية
    out += AR_MAP[ch] ?? '';
    // حركة مقدّرة: بعد أول حرف ساكن، وقبل آخر حرف ساكن، وبين ساكنين إذا ما قبلها حركة
    if (!last && nx && !VOW.has(nx) && !(nx === 'ه' && i + 1 === s.length - 1)) {
      if (first || i + 1 === s.length - 1 || !/[aeiou]/.test(out.slice(-2, -1) || 'x')) out += 'a';
    }
  }
  return out.replace(/aa+/g, 'a');
}
function arWord(tok) {
  const k = normA(tok);
  if (!k) return { en: '', known: true };
  if (REV.has(k)) return { en: cap(REV.get(k)), known: true };
  if (k.startsWith('عبدال') && k.length > 6) { const r = arWord(k.slice(5)); return { en: 'Abdul' + r.en.toLowerCase().replace(/^al/, ''), known: r.known }; }
  if (k.startsWith('ال') && k.length > 3) { const r = arWord(k.slice(2)); return { en: 'Al' + r.en.toLowerCase(), known: r.known }; }
  return { en: cap(arPhonetic(k)), known: false };
}
// اسم عربي ← إنجليزي: {en, known}
export function transliterateAr(name) {
  const toks = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  const out = [];
  let known = true;
  for (let i = 0; i < toks.length; i++) {
    let t = toks[i];
    if (normA(t) === 'عبد' && toks[i + 1]) { t = 'عبد' + toks[++i]; }
    const r = arWord(t);
    out.push(r.en);
    known = known && r.known;
  }
  return { en: out.filter(Boolean).join(' '), known };
}

// يُرجع {ar, known}: known = كل الكلمات من القاموس (ثقة أعلى)
export function transliterate(name) {
  const toks = String(name ?? '').trim().split(/[\s]+/).filter(Boolean);
  const out = [];
  let known = true;
  for (let i = 0; i < toks.length; i++) {
    let t = toks[i];
    // "Al Otaibi" / "Al-Otaibi" / "Abdul Rahman" ← كلمة وحدة
    const low = t.toLowerCase().replace(/-$/, '');
    if (['al', 'el'].includes(low) && toks[i + 1]) { t = 'al' + toks[++i]; }
    else if (/^(al|el)-/i.test(t)) t = 'al' + t.slice(3);
    else if (['abdul', 'abdel', 'abd'].includes(low) && toks[i + 1]) {
      const joined = (low + toks[i + 1]).toLowerCase().replace(/[^a-z]/g, '');
      if (DICT.has(joined) || DICT.has(joined.replace(/^abd(ul|el)?/, 'abdul'))) { t = joined; i++; }
      else { const r = word(toks[++i]); out.push('عبد' + (r.ar.startsWith('ال') ? r.ar : 'ال' + r.ar)); known = known && r.known; continue; }
    }
    const r = word(t);
    out.push(r.ar);
    known = known && r.known;
  }
  return { ar: out.filter(Boolean).join(' '), known };
}
