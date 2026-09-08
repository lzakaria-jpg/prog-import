// نداءات REST مباشرة (PostgREST) لقاعدة Supabase — بمفتاح service_role الذي
// يتجاوز RLS، ولا يُقرأ إطلاقًا إلا من هذه الدوال السيرفرلس (Cloudflare Pages
// Functions). لا نستخدم مكتبة @supabase/supabase-js هنا عمدًا: fetch مباشر
// أبسط وأضمن التوافق مع بيئة Cloudflare Workers من مكتبة مصمَّمة أصلًا
// للمتصفح/Node.
//
// نفس رابط المشروع المستخدم بالواجهة (src/supabase.js) — ليس سرًّا، فقط
// المفتاح (service_role) هو السرّي، ويُقرأ من متغيرات بيئة Cloudflare Pages.
const SUPABASE_URL = "https://bcqhpfeayouogftdolml.supabase.co";

function serviceHeaders(env, extra) {
  const key = env && env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY غير مُعد على الخادم");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function restFetch(env, path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: serviceHeaders(env, options.headers),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase REST ${res.status}: ${text}`);
  }
  // 204 (No Content) على الحذف/التحديث بلا Prefer:return=representation
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─── جدول users (القراءة فقط من هنا — التحقق من وجود المستخدم/حالته/دوره) ───
export async function getUserRow(env, email) {
  const rows = await restFetch(env, `users?email=eq.${encodeURIComponent(email)}&select=email,role,active&limit=1`);
  return rows && rows[0] ? rows[0] : null;
}

// ─── جدول user_credentials (بيانات الاعتماد الحساسة — منفصل تمامًا عن users
//     حتى لا يصل أي عمود منها لأي اشتراك realtime أو استعلام عميل حالي) ───
export async function getCredentials(env, email) {
  const rows = await restFetch(env, `user_credentials?email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
  return rows && rows[0] ? rows[0] : null;
}

export async function getCredentialsByResetTokenHash(env, tokenHash) {
  const rows = await restFetch(env, `user_credentials?reset_token_hash=eq.${encodeURIComponent(tokenHash)}&select=*&limit=1`);
  return rows && rows[0] ? rows[0] : null;
}

// upsert بمفتاح email — يُنشئ الصف أول مرة أو يدمج (merge) بالحقول المُمرَّرة فقط
export async function upsertCredentials(env, email, patch) {
  await restFetch(env, `user_credentials?on_conflict=email`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ email, updated_at: new Date().toISOString(), ...patch }),
  });
}

export async function insertAuditLog(env, actorEmail, action, targetEmail, details) {
  try {
    await restFetch(env, "audit_log", {
      method: "POST",
      body: JSON.stringify({ actor_email: actorEmail, action, target_type: "user", target_email: targetEmail || null, details: details || null }),
    });
  } catch (e) {
    // سجل التدقيق لا يُفشل العملية الأساسية إن تعذّر الكتابة فيه
  }
}
