import React from 'react';
import { n, i } from './ui.jsx';

/**
 * شريط المطابقة — ثابت أسفل الشاشة في كل الخطوات.
 *
 * سبب وجوده: الترحيل ينجح أو يفشل بسؤال واحد — هل بقيت الفلوس كما هي؟
 * وضْع الجواب أمام العين طوال الوقت يمنع اكتشاف الانحراف بعد الرفع.
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
  const diff = summary.expectedGrandTotal - summary.sourceGrandTotal;
  const diffTone = Math.abs(diff) <= 0.05 ? 'ok' : Math.abs(diff) <= 1 ? 'warn' : 'stop';
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
        <span className="qii-recon-k">إجمالي المصدر</span>
        <span className="qii-recon-v">{n(summary.sourceGrandTotal)}</span>
      </div>
      <div className="qii-recon-cell">
        <span className="qii-recon-k">إجمالي قيود</span>
        <span className="qii-recon-v">{n(summary.expectedGrandTotal)}</span>
      </div>
      <div className="qii-recon-cell">
        <span className="qii-recon-k">الفرق</span>
        <span className={`qii-recon-v ${diffTone}`}>{diff >= 0 ? '+' : ''}{n(diff)}</span>
      </div>
      <div className="qii-recon-cell">
        <span className="qii-recon-k">أخطاء فادحة</span>
        <span className={`qii-recon-v ${fatal ? 'stop' : 'ok'}`}>{i(fatal)}</span>
      </div>
      <span className="spacer" />
      <span className="qii-recon-note">
        {fatal
          ? 'التصدير موقوف حتى تُعالَج الأخطاء الفادحة'
          : `جاهز للتصدير · ${summary.driftedInvoices} فاتورة بانحراف تقريب`}
      </span>
    </div>
  );
}
