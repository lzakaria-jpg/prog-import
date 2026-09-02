import { useState, useRef } from "react";

let seq = 0;

/**
 * إصلاح شامل لمنع تعبية المتصفح/مدراء كلمات المرور التلقائية لحقول الإدخال —
 * المشكلة الجذرية: Chrome (وLastPass/1Password) يستخدمان تخمينًا بالسياق (اسم/موضع
 * الحقل) لا مطابقة حرفية، فقد يعبّي حقل "تعليق" ببريد المستخدم المحفوظ حتى مع
 * autoComplete="off" وحده (غير كافٍ عمليًا في Chrome الحديث).
 *
 * الإصلاح المثبّت (مطبّق أول مرة على مربعات البحث، الآن معمَّم لكل حقول الإدخال
 * الحرة في التطبيق عبر هذا المكوّن الموحّد):
 *  - type="search" افتراضيًا (بدل text) + CSS عام يقمع سهم الإلغاء (index.css)
 *  - readOnly حتى أول focus من المستخدم فعليًا (unlock) — هذا هو المانع الحقيقي
 *  - autoComplete/autoCorrect/autoCapitalize/spellCheck = off
 *  - data-lpignore + data-1p-ignore (LastPass / 1Password) + data-form-type="other"
 *  - name فريد تلقائيًا لكل حقل (يمنع Chrome من مطابقته باسم حقل محفوظ)
 *
 * استخدم prop مثل type="password" أو type="date" لتجاوز type الافتراضي عند الحاجة
 * (مثال: حقل مفتاح API يجب أن يبقى password). كل props أخرى (value/onChange/
 * placeholder/className/style/dir/list/inputMode...) تُمرَّر كما هي.
 */
export function SafeInput({ type = "search", name, onFocus, inputRef, ...rest }) {
  const [unlocked, setUnlocked] = useState(false);
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = `qoyod-nf-${++seq}`;
  return (
    <input
      {...rest}
      ref={inputRef}
      type={type}
      name={name || idRef.current}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck="false"
      data-lpignore="true"
      data-1p-ignore="true"
      data-form-type="other"
      readOnly={!unlocked}
      onFocus={(e) => {
        setUnlocked(true);
        onFocus?.(e);
      }}
    />
  );
}

/** نفس الإصلاح لعناصر textarea الحرة (وليست textarea readOnly للعرض/النسخ فقط). */
export function SafeTextarea({ name, onFocus, inputRef, ...rest }) {
  const [unlocked, setUnlocked] = useState(false);
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = `qoyod-nf-${++seq}`;
  return (
    <textarea
      {...rest}
      ref={inputRef}
      name={name || idRef.current}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck="false"
      data-lpignore="true"
      data-1p-ignore="true"
      data-form-type="other"
      readOnly={!unlocked}
      onFocus={(e) => {
        setUnlocked(true);
        onFocus?.(e);
      }}
    />
  );
}
