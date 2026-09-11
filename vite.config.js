import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// [إصلاح] رقم النسخة بتذييل الواجهة (App.jsx: currentVersion) كان رقمًا ثابتًا
// منفصلًا تمامًا عن "version" بـpackage.json — تحديث أحدهما دون الآخر (كما
// حصل فعليًا: package.json رُفع لـ2.0.1 والتذييل بقي "2.0.0") ينتج تناقضًا
// صامتًا لا يظهر إلا لمستخدم يقارن الاثنين يدويًا. مصدر واحد الآن: __APP_VERSION__
// تُحقَن وقت البناء من package.json مباشرة، فلا يوجد رقمان ليتزامنا أصلًا.
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
