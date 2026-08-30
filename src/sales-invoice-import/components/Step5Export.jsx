import React, { useState } from 'react';
import { Card, Note, i } from './ui.jsx';
import { exportInvoiceTemplate } from '../io/exportFiles.js';

/**
 * الخطوة 4 — التصدير.
 *
 * عنصر واحد فقط عمداً: تحميل نموذج الاستيراد الجاهز للرفع في قيود. كل ما كان
 * هنا سابقاً (تصدير المرتجعات، تقرير التحقق، إعدادات التحويل، اختيار حساب خصم
 * المستند) إما لم يعد له داعٍ بعد نقل التصحيح إلى صفحة «المطابقة والمراجعة»
 * (حساب خصم المستند أصبح حقلاً يُعدَّل لكل فاتورة هناك مباشرة)، أو أُزيل لتبسيط
 * هذه الصفحة كما طُلب صراحة.
 *
 * النموذج المصدَّر هو نفس ملف قالب قيود المرفوع، منسوخاً وليس معاد بناءه —
 * فيحافظ على كل تنسيقه وقوائمه المنسدلة وقيود التحقق فيه حرفياً (buildTemplateFile
 * في engine/template.js). التصدير مقفل عند وجود أي خطأ فادح غير مصحَّح.
 */
export default function Step5Export({ state, actions }) {
  const { result, template } = state;
  const [busy, setBusy] = useState(false);

  if (!result) return <div className="qii-empty">أكمل الخطوات السابقة</div>;

  const { rows, validation } = result;
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `فواتير_مبيعات_قيود_${stamp}.xlsx`;

  const download = async () => {
    setBusy(true);
    try {
      await exportInvoiceTemplate(rows, template, filename);
      actions.notifyExport?.({ kind: 'template', filename });
    } catch (e) {
      alert(`تعذّر إنشاء الملف: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="qii-page-title">التصدير</h1>
      <p className="qii-page-sub">نموذج استيراد فواتير المبيعات، جاهزاً للرفع في قيود كما هو.</p>

      {!validation.canExport && (
        <Note tone="stop">
          التصدير موقوف: <strong>{i(validation.fatal.length)}</strong> خطأ فادح ما زال بلا تصحيح.
          ارجع إلى خطوة «المطابقة والمراجعة» وصحّح الفواتير المعلَّمة بخطأ.
        </Note>
      )}

      <Card title="نموذج الاستيراد">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>تحميل نموذج الاستيراد</div>
            <div style={{ fontSize: 12.5, color: 'var(--qii-ink-3)' }}>
              {i(rows.length)} صف · بنفس تنسيق قالب قيود الرسمي وقوائمه المنسدلة وقيود التحقق فيه، دون أي تعديل عليها
            </div>
          </div>
          <button className="qii-btn primary" onClick={download} disabled={!validation.canExport || busy}>
            {busy ? 'جارٍ الإنشاء…' : 'تحميل نموذج الاستيراد'}
          </button>
        </div>
      </Card>
    </>
  );
}
