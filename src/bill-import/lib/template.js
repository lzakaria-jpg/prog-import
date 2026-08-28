/**
 * template.js — قراءة قالب قيود المعتمد والكتابة داخله.
 * القالب يُفكّ كملف ZIP وتُقرأ قوائمه المنسدلة من ورقته المخفية (do_not_edit)
 * عبر قواعد التحقق، لا بحروف أعمدة مفترضة، لأن بنية القالب تختلف بين النسخ.
 */
import JSZip from 'jszip';
import { colLetter } from './text.js';
import { TPL_LABELS, NEG } from './fields.js';
import { nameScore } from './mapping.js';

const XMLENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" };
const dec = (s) => String(s).replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => XMLENT[m]);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const serial = (d) =>
  Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000);

/** قراءة خلايا ورقة من XML، مع دعم النص المضمّن والنص المشترك */
function cellsOf(xml, sst) {
  const out = {};
  const re = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, col, row, attrs, inner = ''] = m;
    const t = /t="([a-zA-Z]+)"/.exec(attrs);
    const type = t ? t[1] : 'n';
    let v = '';
    if (type === 'inlineStr') {
      const x = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
      v = x ? x[1] : '';
    } else {
      const x = /<v>([\s\S]*?)<\/v>/.exec(inner);
      v = x ? x[1] : '';
      if (type === 's') v = sst[+v] ?? '';
    }
    out[col + row] = dec(v);
  }
  return out;
}

function parseRange(f) {
  const m = /^(?:'([^']+)'|([^!]+))!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/.exec(String(f).trim());
  return m ? { sheet: m[1] || m[2], col: m[3], from: +m[4], to: +m[6] } : null;
}

/**
 * قراءة القالب: يعيد أعمدته مربوطة بحقولها، وقوائمه المنسدلة، ونمط خلية التاريخ.
 * @param {File|Blob|ArrayBuffer} file ملف xlsx
 */
export async function readTemplate(file) {
  const zip = await JSZip.loadAsync(file);
  const rd = (p) => (zip.file(p) ? zip.file(p).async('string') : Promise.resolve(''));
  const [wbXml, relsXml, sstXml] = await Promise.all([
    rd('xl/workbook.xml'), rd('xl/_rels/workbook.xml.rels'), rd('xl/sharedStrings.xml')
  ]);

  const sst = [...sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''))
  );

  const rels = {};
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /Id="([^"]+)"/.exec(m[1]);
    const tg = /Target="([^"]+)"/.exec(m[1]);
    if (id && tg) rels[id[1]] = tg[1].replace(/^\/?xl\//, '').replace(/^\//, '');
  }

  const sheets = [];
  for (const m of wbXml.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const nm = /name="([^"]+)"/.exec(m[1]);
    const rid = /r:id="([^"]+)"/.exec(m[1]);
    if (nm && rid && rels[rid[1]]) sheets.push({ name: dec(nm[1]), path: 'xl/' + rels[rid[1]] });
  }
  if (!sheets.length) throw new Error('تعذّر قراءة أوراق الملف');

  const xmls = {};
  for (const s of sheets) xmls[s.name] = await rd(s.path);

  const main =
    sheets.find((s) => /مرجع الفاتورة/.test(xmls[s.name])) ||
    sheets.find((s) => /<dataValidation/.test(xmls[s.name])) ||
    sheets[sheets.length - 1];
  const mainXml = xmls[main.name];
  const cells = cellsOf(mainXml, sst);

  // أعمدة القالب من الصف الثاني، أياً كان عددها وترتيبها
  const labels = [];
  for (let i = 0; i < 60; i++) {
    const v = cells[colLetter(i) + '2'];
    labels.push(v == null ? '' : String(v).trim());
  }
  while (labels.length && !labels[labels.length - 1]) labels.pop();
  if (!labels.length) throw new Error('لم يُعثر على صف عناوين الأعمدة');

  // ربط كل عمود بحقله عبر تسميته
  const pairs = [];
  labels.forEach((lab, i) => {
    if (!lab) return;
    for (const key in TPL_LABELS) {
      const sc = nameScore(lab, TPL_LABELS[key], NEG[key]);
      if (sc > 0.6) pairs.push({ key, i, sc });
    }
  });
  pairs.sort((a, b) => b.sc - a.sc);
  const byIdx = {}, byKey = {};
  pairs.forEach((p) => {
    if (byIdx[p.i] != null || byKey[p.key] != null) return;
    byIdx[p.i] = p.key;
    byKey[p.key] = p.i;
  });
  const columns = labels.map((lab, i) => ({ index: i, letter: colLetter(i), label: lab, key: byIdx[i] || null }));

  // قوائم التحقق بحرف العمود الفعلي
  const dv = {};
  for (const m of mainXml.matchAll(/<dataValidation ([^>]*)>([\s\S]*?)<\/dataValidation>/g)) {
    const sq = /sqref="([A-Z]+)\d+:[^"]*"/.exec(m[1]);
    const ty = /type="([^"]+)"/.exec(m[1]);
    const f = /<formula1>([\s\S]*?)<\/formula1>/.exec(m[2]);
    if (sq && f && (!ty || ty[1] === 'list')) dv[sq[1]] = dec(f[1]);
  }
  const listFor = (key) => {
    const i = byKey[key];
    if (i == null) return [];
    const r = parseRange(dv[colLetter(i)]);
    if (!r || xmls[r.sheet] == null) return [];
    const c = cellsOf(xmls[r.sheet], sst);
    const out = [];
    for (let k = r.from; k <= r.to; k++) {
      const v = c[r.col + k];
      if (v != null && String(v).trim() !== '') out.push(String(v).trim());
    }
    return out;
  };

  // نمط خلية التاريخ كما هو معرَّف في القالب
  const stylesXml = await rd('xl/styles.xml');
  let dateStyle = 0;
  const fmtIds = new Set();
  for (const m of stylesXml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    if (/d{1,2}\/m{1,2}\/y{2,4}/i.test(m[2])) fmtIds.add(m[1]);
  }
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
  if (xfs) {
    const list = [...xfs[1].matchAll(/<xf\b([^>]*)(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[1]);
    let idx = list.findIndex((a) => {
      const n = /numFmtId="(\d+)"/.exec(a);
      return n && fmtIds.has(n[1]);
    });
    if (idx < 0) idx = list.findIndex((a) => /numFmtId="14"/.test(a));
    if (idx >= 0) dateStyle = idx;
  }

  return {
    sheetName: main.name,
    sheetPath: main.path,
    headers: labels,
    columns,
    dateStyle,
    locations: listFor('location'),
    yesno: listFor('taxIncl'),
    taxes: listFor('tax'),
    discAccounts: listFor('docDiscAcc'),
    discTaxes: listFor('docDiscTax'),
    units: listFor('unit')
  };
}

function cellXml(letter, rowNum, v, dateStyle) {
  if (v == null || v === '') return '';
  const ref = letter + rowNum;
  if (v instanceof Date) return `<c r="${ref}" s="${dateStyle}"><v>${serial(v)}</v></c>`;
  if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

/**
 * كتابة الصفوف داخل ملف القالب نفسه ابتداءً من الصف الثالث،
 * مع بقاء التنسيقات وقواعد التحقق والورقة المخفية كما هي.
 * @returns {Promise<Blob>}
 */
export async function writeIntoTemplate(templateFile, tpl, matrix) {
  const zip = await JSZip.loadAsync(templateFile);
  const f = zip.file(tpl.sheetPath);
  if (!f) throw new Error('تعذّر العثور على ورقة القالب داخل الملف');
  let xml = await f.async('string');

  let n = 3, body = '';
  matrix.forEach((vals) => {
    let cells = '';
    vals.forEach((v, c) => { cells += cellXml(colLetter(c), n, v, tpl.dateStyle); });
    body += `<row r="${n}">${cells}</row>`;
    n++;
  });

  const last = Math.max(2, n - 1);
  const lastCol = colLetter(Math.max(0, (matrix[0] ? matrix[0].length : 1) - 1));
  xml = xml.includes('<sheetData/>')
    ? xml.replace('<sheetData/>', `<sheetData>${body}</sheetData>`)
    : xml.replace('</sheetData>', body + '</sheetData>');
  xml = xml.replace(/<dimension ref="[^"]*"/, `<dimension ref="A1:${lastCol}${last}"`);

  zip.file(tpl.sheetPath, xml);
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}
