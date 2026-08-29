import React from 'react';
import { n, i } from './ui.jsx';

/**
 * شريط الحالة — ثابت أسفل الشاشة في كل الخطوات.
 *
 * يعرض إجمالي الفاتورة المحسوب من مجموع بنودها — وهو الإجمالي المعتمد الوحيد —
 * دون مقارنته بأي عمود إجمالي مجمَّع في ملف المصدر: تلك المقارنة ليست مرجعاً
 * معتمداً للتحقق من صحة الفاتورة، فلا تُحسب ولا تُعرض هنا إطلاقاً.
 */
export default function ReconStrip({ result, stats }) {
  if (!result) {
    return (
      <div className="qii-recon">
        <div className="qii-recon-cell">
          <span className="qii-recon-k">الحالة</span>
          <span className="qii-recon-v">بانتظار البيانات</span>
        </div>
        <span className="spacer" />
        <span className="qii-recon-note">ارفع قالب قيود وملف العميل لبدء المطابقة</span>
      </div>
    );
  }

  const { summary, validation } = result;
  const fatal = validation.fatal.length;

  return (
    <div className="qii-recon">
      <div className="qii-recon-cell">
        <span className="qii-recon-k">فواتير</span>
        <span className="qii-recon-v">{i(summary.invoices)}</span>
      </div>
      <div className="qii-recon-cell">
        <span className="qii-recon-k">صفوف القالب</span>
        <span className="qii-recon-v">{i(summary.rows)}</span>
      </div>
      <div className="qii-recon-cell">
        <span className="qii-recon-k">إجمالي الفاتورة المحسوب</span>
        <span className="qii-recon-v">{n(summary.expectedGrandTotal)}</span>
      </div>
      <div className="qii-recon-cell">
        <span className="qii-recon-k">أخطاء فادحة</span>
        <span className={`qii-recon-v ${fatal ? 'stop' : 'ok'}`}>{i(fatal)}</span>
      </div>
      <span className="spacer" />
      <span className="qii-recon-note">
        {fatal ? 'التصدير موقوف حتى تُعالَج الأخطاء الفادحة' : 'جاهز للتصدير'}
      </span>
    </div>
  );
}
