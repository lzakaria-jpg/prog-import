import React, { useEffect, useId, useMemo, useState } from 'react';

/**
 * [إضافة] قائمة اختيار قابلة للبحث بالكتابة — بديل لعنصر <select> العادي حين
 * تكون الخيارات كثيرة (دليل حسابات 700+ حساب مثلًا)، طلب صريح من المستخدم:
 * "أقدر أكتب وأبحث فيها مثلاً حساب 5101 لو كتبت 51 يظهر حسابات 51 وكل الي تحتها".
 * تعتمد على <input list="..."> + <datalist> (بحث فرعي أصلي بالمتصفح على نص
 * الخيار، بلا أي مكتبة خارجية) — نفس آلية dl-customers/dl-products الموجودة
 * فعلًا بـRefDatalists.jsx، لكن كمكوّن عام قابل لإعادة الاستخدام بدل عنصر <select>
 * تقليدي، حيث القيمة الحقيقية (id) تُشتَق من مطابقة نص الإدخال الحالي حرفيًا
 * بأحد الخيارات (لا يمكن اختيار id غير موجود ضمن options فعلًا).
 *
 * options: [{value, label}] — value هو ما يُمرَّر لـonChange (id حقيقي غالبًا)،
 * label هو النص المعروض/القابل للبحث (مثلًا "5101 — النقدية"، بادئة الكود تتيح
 * البحث بجزء من الكود كما طُلب). value الحالي (المُمرَّر كـprop) يُعرَض بلا حاجة
 * لأي بحث إضافي لأنه يُطابَق مباشرة بخيار موجود عبر id.
 */
export default function SearchableSelect({ options, value, onChange, placeholder }) {
  const listId = 'ssel-' + useId();
  const byLabel = useMemo(() => {
    const m = new Map();
    options.forEach((o) => m.set(o.label, o.value));
    return m;
  }, [options]);
  const labelByValue = useMemo(() => {
    const m = new Map();
    options.forEach((o) => m.set(String(o.value), o.label));
    return m;
  }, [options]);

  const [text, setText] = useState(() => labelByValue.get(String(value)) || '');

  // [مزامنة] لو القيمة تغيّرت من الأب (مثلًا تصفير بعد تأكيد الإنشاء)، نعكسها
  // بنص الإدخال المعروض — طالما المستخدم لا يكتب فعليًا بنفس اللحظة (نادر التعارض
  // هنا، هذا المكوّن يُستخدَم بلوحات مراجعة لا تتغيّر قيمها الخارجية أثناء الكتابة).
  useEffect(() => {
    const expected = labelByValue.get(String(value)) || '';
    setText((prev) => (prev === expected || (value === '' && !labelByValue.has(prev)) ? prev : expected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e) => {
    const next = e.target.value;
    setText(next);
    const matched = byLabel.get(next);
    onChange(matched !== undefined ? matched : '');
  };

  return (
    <>
      <input
        type="text"
        list={listId}
        value={text}
        onChange={handleChange}
        placeholder={placeholder}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((o) => <option key={o.value} value={o.label} />)}
      </datalist>
    </>
  );
}
