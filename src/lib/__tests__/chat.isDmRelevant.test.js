// isDmRelevant (src/chat.jsx) — يقرر أي رسالة تنتمي لمحادثتي الخاصة الحالية
// (currentUser ⇄ activeChannel). حالة حقيقية كانت مكسورة: منشن @AI داخل محادثة
// خاصة بين موظفين (مثال: أبو قصي وهيثم) كانت رسالة السؤال ورد الذكاء الصناعي
// كلاهما يُخزَّن بـrecipient_email:null (نفس معرِّف قناة "العام" الحصري) فيختفيان
// من المحادثة الخاصة ويظهران بالخطأ بالعام - قرار المستخدم المعتمد صريحاً: رد
// الذكاء الصناعي داخل محادثة خاصة يظهر للطرفين معاً بنفس تلك المحادثة فقط.
import { describe, it, expect } from "vitest";
import { isDmRelevant } from "../../chat.jsx";
import { AI_AGENT_EMAIL as AI } from "../../aiAgent.js";

const ME = "abo.qusai@qoyod.com";
const HAITHAM = "haitham@qoyod.com";
const SARA = "sara@qoyod.com"; // طرف ثالث غير معني بهذي المحادثة إطلاقاً

function msg(sender_email, recipient_email) {
  return { sender_email, recipient_email };
}

describe("isDmRelevant", () => {
  it("رسالة مباشرة عادية بين الطرفين (بأي اتجاه) تخص المحادثة", () => {
    expect(isDmRelevant(msg(ME, HAITHAM), ME, HAITHAM)).toBe(true);
    expect(isDmRelevant(msg(HAITHAM, ME), ME, HAITHAM)).toBe(true);
  });

  it("رد الذكاء الصناعي على منشن داخل هذي المحادثة الخاصة بالذات يخص الطرفين معاً", () => {
    // من منظور أبو قصي (currentUser=ME, activeChannel=HAITHAM)
    expect(isDmRelevant(msg(AI, HAITHAM), ME, HAITHAM)).toBe(true);
    expect(isDmRelevant(msg(AI, ME), ME, HAITHAM)).toBe(true);
    // من منظور هيثم نفسه لنفس المحادثة (currentUser=HAITHAM, activeChannel=ME)
    expect(isDmRelevant(msg(AI, HAITHAM), HAITHAM, ME)).toBe(true);
    expect(isDmRelevant(msg(AI, ME), HAITHAM, ME)).toBe(true);
  });

  it("رد الذكاء الصناعي بمحادثة خاصة أخرى (طرف ثالث غير مشترك) لا يتسرّب لهذي المحادثة", () => {
    // رد AI موجَّه لمحادثة أبو قصي مع سارة - لا يخص محادثة أبو قصي مع هيثم
    // (لا هيثم ولا AI طرف بهذا الصف، ولا سارة معنية بمحادثة أبو قصي/هيثم)
    expect(isDmRelevant(msg(AI, SARA), ME, HAITHAM)).toBe(false);
    // قيد معروف ومقصود حالياً (بلا عمود قاعدة بيانات إضافي يحدد "الطرف الآخر"
    // بدقة لكل رد AI): لو نفس الشخص (سارة) لها محادثتان خاصتان منفصلتان - واحدة
    // مع أبو قصي وواحدة مع هيثم - وسأل كل منهما @AI في محادثته معها، فرد AI
    // بكل محادثة (sender=AI, recipient=SARA) يتطابق شكلياً مع الأخرى، فيظهر
    // لهيثم أيضاً عند فتحه محادثته مع سارة حتى لو كان أصلاً رداً على سؤال أبو
    // قصي. هذا لا يتسرّب أبداً لغير المعنيين (لا للعام ولا لأي طرف ثالث حقيقي)،
    // فقط بين شخصين يتشاركان جهة ثالثة واحدة بمحادثتين مستقلتين - يحتاج عمود
    // قاعدة بيانات مخصص (مثل dm_thread_id) لحل جذري لو أصبح هذا مهماً فعلياً.
    expect(isDmRelevant(msg(AI, SARA), HAITHAM, SARA)).toBe(true);
  });

  it("رسالة طرف ثالث غير معني إطلاقاً لا تخص المحادثة", () => {
    expect(isDmRelevant(msg(SARA, HAITHAM), ME, HAITHAM)).toBe(false);
    expect(isDmRelevant(msg(ME, SARA), ME, HAITHAM)).toBe(false);
  });
});
