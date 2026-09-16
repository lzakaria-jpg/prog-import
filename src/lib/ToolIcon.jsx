/*
 ============================================================================
  ToolIcon — أيقونة متحركة واحدة لكل أداة، تعبّر عن فعل الأداة نفسه
 ============================================================================
  طلب صريح من المستخدم (بدلاً من الإيموجي الثابتة 📥 📦 👥 🚚 🧾): أيقونات
  "تعبر عن الاداة بشكل ادق، وتكون متحركة موشن، في عملية تحرك مستمر، بشكل جميل
  جدا وملون، تكون في كل الادوات، ويكون شغل الايقونة معبر عن الاداة وما تفعله".

  كل أيقونة SVG مضمَّنة (لا ملف خارجي ولا مكتبة) بتدرّج لوني خاص بها، وحركتها
  تحاكي ما تفعله الأداة فعلاً — تفاصيل كل حركة في تعليقات tool-icons.css.
  معرّفات التدرّجات مسبوقة باسم الأيقونة فتبقى فريدة عبر الأدوات، وتكرار نفس
  الأيقونة بعدة تبويبات مفتوحة معاً غير ضار (نفس التعريف حرفياً).
 ============================================================================
*/
import './tool-icons.css';

const G = ({ id, from, to }) => (
  <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stopColor={from} />
    <stop offset="100%" stopColor={to} />
  </linearGradient>
);

/** شجرة الحسابات: الفرع الناقص يُرسَم ثم تهبط عليه العقدة وتستقر */
function AccountsIcon() {
  return (
    <svg viewBox="0 0 48 48" role="img">
      <defs><G id="qti-accounts" from="#1E3A8A" to="#3B82F6" /></defs>
      <rect width="48" height="48" rx="13" fill="url(#qti-accounts)" />
      <path d="M24 17v6M24 23h-8v5M24 23h8v5" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".85" />
      <path className="qti-a-branch" d="M24 23v9" stroke="#BFDBFE" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle className="qti-a-root" cx="24" cy="14" r="3.4" fill="#fff" />
      <circle cx="16" cy="31" r="2.8" fill="#fff" opacity=".9" />
      <circle cx="32" cy="31" r="2.8" fill="#fff" opacity=".9" />
      <circle className="qti-a-node" cx="24" cy="34" r="3" fill="#FDE047" />
    </svg>
  );
}

/** القيود: عمودا المدين والدائن يتأرجحان حتى يتوازنا فتظهر علامة التوازن */
function JournalIcon() {
  return (
    <svg viewBox="0 0 48 48" role="img">
      <defs><G id="qti-journal" from="#0E7490" to="#10B981" /></defs>
      <rect width="48" height="48" rx="13" fill="url(#qti-journal)" />
      <rect x="11" y="12" width="26" height="24" rx="3" fill="#fff" opacity=".16" />
      <rect className="qti-a-bar-d" x="15.5" y="17" width="6.5" height="14" rx="1.8" fill="#fff" />
      <rect className="qti-a-bar-c" x="26" y="17" width="6.5" height="14" rx="1.8" fill="#A7F3D0" />
      <rect x="13" y="32.5" width="22" height="2" rx="1" fill="#fff" opacity=".9" />
      <g className="qti-a-balance">
        <circle cx="24" cy="15.5" r="5" fill="#FDE047" />
        <path d="M21.7 15.6l1.7 1.7 3-3.4" stroke="#0F172A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

/** فواتير المشتريات: السهم يدخل إلى المستند (استيراد للداخل) */
function BillsIcon() {
  return (
    <svg viewBox="0 0 48 48" role="img">
      <defs><G id="qti-bills" from="#4338CA" to="#7C3AED" /></defs>
      <rect width="48" height="48" rx="13" fill="url(#qti-bills)" />
      {/* المستند بزاوية مطوية ليُقرأ كفاتورة لا كمربّع */}
      <path d="M13 19h15l7 6.5V36a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2V19z" fill="#fff" opacity=".96" />
      <path d="M28 19l7 6.5h-7V19z" fill="#C7D2FE" />
      <rect x="17" y="24" width="8" height="2" rx="1" fill="#4338CA" opacity=".45" />
      <rect className="qti-a-line-1" x="17" y="28.5" width="14" height="2" rx="1" fill="#4338CA" />
      <rect className="qti-a-line-2" x="17" y="32.5" width="14" height="2" rx="1" fill="#7C3AED" />
      <g className="qti-a-arrow-in">
        <path d="M24 8v7" stroke="#FDE047" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M20.5 12.5L24 16l3.5-3.5" stroke="#FDE047" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

/** فواتير المبيعات: السهم يخرج من المستند (إصدار للخارج) + عملة تدور */
function SalesIcon() {
  return (
    <svg viewBox="0 0 48 48" role="img">
      <defs><G id="qti-sales" from="#C2410C" to="#F59E0B" /></defs>
      <rect width="48" height="48" rx="13" fill="url(#qti-sales)" />
      <path d="M13 18h18v17a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2V18z" fill="#fff" opacity=".95" />
      <rect x="17" y="24" width="10" height="2" rx="1" fill="#C2410C" opacity=".75" />
      <rect x="17" y="28.5" width="7" height="2" rx="1" fill="#C2410C" opacity=".55" />
      <g className="qti-a-arrow-out">
        <path d="M33 21v-8" stroke="#FEF08A" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M29.5 16.5L33 13l3.5 3.5" stroke="#FEF08A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <circle className="qti-a-coin" cx="31" cy="32" r="4.6" fill="#FDE047" stroke="#B45309" strokeWidth="1.2" />
    </svg>
  );
}

/** المنتجات: الأصناف ترتفع من الصندوق (رفع مباشر عبر API) */
function ProductsIcon() {
  return (
    <svg viewBox="0 0 48 48" role="img">
      <defs><G id="qti-products" from="#0369A1" to="#06B6D4" /></defs>
      <rect width="48" height="48" rx="13" fill="url(#qti-products)" />
      <rect className="qti-a-cube" x="20.5" y="17" width="7" height="7" rx="1.6" fill="#FDE047" />
      <rect className="qti-a-cube-2" x="27" y="18" width="5" height="5" rx="1.4" fill="#BAE6FD" />
      <path d="M13 28h22v8a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2v-8z" fill="#fff" opacity=".95" />
      <rect className="qti-a-lid" x="12" y="25.5" width="24" height="3.6" rx="1.4" fill="#fff" />
    </svg>
  );
}

/** العملاء: شخصان يتقاربان وتظهر بينهما علامة التطابق */
function CustomersIcon() {
  return (
    <svg viewBox="0 0 48 48" role="img">
      <defs><G id="qti-customers" from="#6D28D9" to="#DB2777" /></defs>
      <rect width="48" height="48" rx="13" fill="url(#qti-customers)" />
      <g className="qti-a-person-l">
        <circle cx="16.5" cy="19" r="4.2" fill="#fff" />
        <path d="M9.5 34c0-3.9 3.1-6.6 7-6.6s7 2.7 7 6.6z" fill="#fff" opacity=".92" />
      </g>
      <g className="qti-a-person-r">
        <circle cx="31.5" cy="19" r="4.2" fill="#FBCFE8" />
        <path d="M24.5 34c0-3.9 3.1-6.6 7-6.6s7 2.7 7 6.6z" fill="#FBCFE8" opacity=".92" />
      </g>
      <g className="qti-a-match">
        <circle cx="24" cy="26" r="5.4" fill="#FDE047" />
        <path d="M21.5 26.1l1.8 1.8 3.2-3.6" stroke="#0F172A" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

/** الموردون: شاحنة تسير، عجلاتها تدور وخطوط السرعة تمرّ خلفها */
function VendorsIcon() {
  return (
    <svg viewBox="0 0 48 48" role="img">
      <defs><G id="qti-vendors" from="#065F46" to="#22C55E" /></defs>
      <rect width="48" height="48" rx="13" fill="url(#qti-vendors)" />
      <rect className="qti-a-speed-1" x="30" y="17" width="10" height="2" rx="1" fill="#D1FAE5" />
      <rect className="qti-a-speed-2" x="32" y="22" width="7" height="2" rx="1" fill="#D1FAE5" />
      <g className="qti-a-truck">
        <rect x="8" y="20" width="16" height="11" rx="2" fill="#fff" />
        <path d="M24 23h6.5l4.5 4.6V31H24z" fill="#FDE047" />
        {/* العجلة: الدائرة السوداء + شعاع أبيض داخلها معاً داخل مجموعة واحدة،
            وإلا فدوران دائرة صمّاء حول مركزها لا يُرى إطلاقاً */}
        <g className="qti-a-wheel">
          <circle cx="15" cy="33" r="3.4" fill="#0F172A" />
          <rect x="14.3" y="30.4" width="1.4" height="5.2" rx=".7" fill="#fff" />
        </g>
        <g className="qti-a-wheel">
          <circle cx="30" cy="33" r="3.4" fill="#0F172A" />
          <rect x="29.3" y="30.4" width="1.4" height="5.2" rx=".7" fill="#fff" />
        </g>
      </g>
    </svg>
  );
}

const ICONS = {
  accounts: AccountsIcon,
  journal: JournalIcon,
  bills: BillsIcon,
  sales: SalesIcon,
  products: ProductsIcon,
  customers: CustomersIcon,
  vendors: VendorsIcon,
};

/**
 * @param {'accounts'|'journal'|'bills'|'sales'|'products'|'customers'|'vendors'} name
 * @param {string} [className] أصناف إضافية (الحجم والظل من .qti افتراضياً)
 */
export default function ToolIcon({ name, className = '' }) {
  const Icon = ICONS[name];
  if (!Icon) return null;
  return (
    <span className={`qti ${className}`.trim()} aria-hidden="true">
      <Icon />
    </span>
  );
}
