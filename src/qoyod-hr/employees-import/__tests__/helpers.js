// أدوات مشتركة للاختبارات: قراءة الملفات الوهمية من fixtures (قالب تجريبي + ملفات عملاء مخربطة)
import fs from 'node:fs';
import { readClientFile } from '../lib/engine.js';
import { readTemplate } from '../lib/template.js';

export const FX = new URL('./fixtures/', import.meta.url);
export const CLIENTS = new URL('./clients/', FX);
export const readBuf = (name, base = FX) => {
  const buf = fs.readFileSync(new URL(name, base));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};
export const loadTemplate = () => readTemplate(readBuf('template_rich.xlsx'));
export const readClient = (name) => readClientFile(readBuf(name, CLIENTS), name);
export const SETTINGS = { dateOrder: 'dmy', addCC: true, nameSplit: 'rest', translit: true };

// كل ملف عميل يُحلَّل مرة واحدة لكل ملف اختبار (التحليل مكلف، ويُعاد استخدامه بين الاختبارات)
const analyzed = new Map();
export const analyzeClient = (name, analyze, lists) => {
  if (!analyzed.has(name)) analyzed.set(name, analyze(readClient(name).filter((s) => s.rows.length), lists));
  return analyzed.get(name);
};
