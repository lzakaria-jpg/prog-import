import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabase";
import { useLanguage } from "./language";
import { useAuth } from "./auth";
import {
  generateAIResponse,
  AI_AGENT_EMAIL, AI_AGENT_NAME_AR, AI_AGENT_NAME_EN
} from "./aiAgent";
import { runAIExcelWorkflow } from "./lib/aiExcelAgent";
import { organizeChartOfAccounts, isChartOrganizeRequest } from "./lib/chartOrganizerAgent";
import { resolveAmbiguousTypesWithClaude, resolveColumnMappingWithClaude } from "./lib/chartOrganizerAiResolver";
import {
  MessageCircle, X, Send, Paperclip, Image, FileSpreadsheet, FileText,
  ChevronLeft, ChevronRight, Volume2, VolumeX, Archive, Trash2, Edit3,
  Check, CheckCheck, Smile, Search, MoreVertical, Download, Eye, EyeOff,
  Bell, BellOff, Users, Hash, Lock, ArrowDown, ArrowUp, Bot, Pin, PinOff, Plus,
  CheckSquare, Square, UserPlus, UserMinus, AlertTriangle,
} from "lucide-react";

// ─── Sound ──────────────────────────────────────────────────────────

const NOTIF_SOUND = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVggoKPkJaQf2xncoCTmZqXkYJ8eH2NnZ6dmZOLhH1/h5CZnZuUkIaCgIaLkJaWlZCKhYF/g4uQlZWTkIiDgICFjJCVlZOQh4OAgIWMkZWVk5CHg4CAhYyRlZWTkIeDgICEjJGVlZOQh4OAgISNkpaVk5CHg4CAhI2SlpaTkIeDgICEjpOWlpOQh4OAgISOk5aXk5CHg4CAhI6UlpibkIeDgICEj5SWmJuQh4OAgISPlJaYm5CHg4CAhI+VlpmckIeDgICEj5WWmZyQh4OAgIWQlpaZnJCHg4CAhZCWlpmckIeDgICFkJaWmZyQh4OAgIWQl5aZnJCHg4CAhZCXlpmckIeDgICFkJeWmZyQh4OAgIWQl5aZnJCHg4CAhZCXlpmckIeDgICFkJeWmZyQh4OAgA==";

function playNotification() {
  try {
    const audio = new Audio(NOTIF_SOUND);
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch (e) {}
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatTime(dateStr, lang) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return lang === "ar" ? "الآن" : "now";
  if (diffMin < 60) return `${diffMin}${lang === "ar" ? " د" : "m"}`;
  if (diffHr < 24) return `${diffHr}${lang === "ar" ? " س" : "h"}`;

  if (lang === "ar") {
    return d.toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFullTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function emailToName(email) {
  if (!email) return "?";
  return email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function emailToColor(email) {
  const colors = ["#162560", "#4A90D9", "#16A34A", "#D97706", "#DC2626", "#7C3AED", "#0891B2", "#BE185D"];
  let hash = 0;
  for (let i = 0; i < (email || "").length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function fileIcon(fileName) {
  const ext = (fileName || "").split(".").pop().toLowerCase();
  if (["xlsx", "xls", "csv"].includes(ext)) return <FileSpreadsheet size={16} color="#16A34A" />;
  if (["pdf"].includes(ext)) return <FileText size={16} color="#DC2626" />;
  if (["docx", "doc"].includes(ext)) return <FileText size={16} color="#2563EB" />;
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return <Image size={16} color="#D97706" />;
  return <FileText size={16} color="#64748B" />;
}

const SPREADSHEET_EXT = /\.(xlsx|xls|csv)$/i;

/**
 * هل رسالة m تخص محادثتي الخاصة الحالية (currentUser ⇄ activeChannel)؟
 * الحالة الاعتيادية: رسالة مباشرة من/إلى الطرف الآخر. الحالة الإضافية: رد
 * الذكاء الصناعي على منشن @AI داخل هذي المحادثة الخاصة بالذات - يخص الطرفين
 * معاً (موجَّه لأيّهما)، لا لمحادثة خاصة أخرى ولا لقناة "العام" (activeChannel
 * هنا دائماً بريد بشري حقيقي، لا "public"). انظر التعليق بجانب aiReplyRecipient
 * بـhandleSend وبجانب استعلام loadMessages للسياق الكامل.
 *
 * قيد معروف ومقصود: لا عمود بقاعدة البيانات يربط رد الذكاء الصناعي بطرفَي
 * محادثته بدقة (فقط sender/recipient) - فلو شخص واحد (مثلاً "سارة") له
 * محادثتان خاصتان منفصلتان مع شخصين مختلفين، وسأل كل منهما @AI بمحادثته معها،
 * يظهر رد كل منهما للآخر أيضاً عند فتحه محادثته مع سارة (تطابق شكلي بالصف
 * نفسه). لا يتسرّب هذا لغير المعنيين إطلاقاً (لا للعام ولا لطرف ثالث حقيقي) -
 * فقط بين شخصين يتشاركان جهة ثالثة واحدة. حل جذري يحتاج عمود مخصص (مثل
 * dm_thread_id) لو أصبح هذا مهماً فعلياً.
 */
export function isDmRelevant(m, currentUser, activeChannel) {
  return (
    (m.sender_email === currentUser && m.recipient_email === activeChannel) ||
    (m.sender_email === activeChannel && m.recipient_email === currentUser) ||
    (m.sender_email === AI_AGENT_EMAIL && (m.recipient_email === activeChannel || m.recipient_email === currentUser))
  );
}

/** يستخرج أسماء/إيميلات مذكورة بـ @ من نص الرسالة، مقارنةً بقائمة مستخدمين معروفة */
function extractMentions(text, knownEmails) {
  const matches = [...(text.matchAll(/@([\w.+-]+@[\w.-]+\.\w+|[\p{L}\d_]+)/gu) || [])];
  const found = new Set();
  for (const m of matches) {
    const token = m[1].toLowerCase();
    const byEmail = knownEmails.find((e) => e.toLowerCase() === token);
    if (byEmail) { found.add(byEmail); continue; }
    const byName = knownEmails.find((e) => emailToName(e).toLowerCase().replace(/\s+/g, "") === token.replace(/\s+/g, ""));
    if (byName) found.add(byName);
  }
  return [...found];
}

/** يلوّن رموز @mention داخل نص الرسالة المعروضة */
function renderWithMentions(text) {
  const parts = text.split(/(@[\w.+-]+@[\w.-]+\.\w+|@[\p{L}\d_]+)/gu);
  return parts.map((part, i) => {
    if (/^@/.test(part)) {
      return <span key={i} style={{ color: "#0284C7", fontWeight: 700 }}>{part}</span>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

// ─── Confirmation dialog — كل إجراء هدّام يمر من هنا ────────────────

function ConfirmDialog({ title, message, confirmLabel, danger = true, onConfirm, onCancel }) {
  const { t } = useLanguage();
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 340, maxWidth: "90vw", background: "#FFFFFF", borderRadius: 16, border: "1px solid #E2E8F0", padding: 20, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <AlertTriangle size={18} color={danger ? "#DC2626" : "#FBBF24"} />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{title}</p>
        </div>
        <p style={{ fontSize: 12.5, color: "#64748B", marginBottom: 18, lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "1px solid #E2E8F0", background: "transparent", color: "#64748B", fontSize: 12.5, cursor: "pointer" }}>
            {t({ ar: "إلغاء", en: "Cancel" })}
          </button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: danger ? "#DC2626" : "#12B886", color: "#FFF", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────────

function MessageBubble({ msg, isOwn, isRTL, lang, canDeleteThis, canEditThis, canPin, onEdit, onDelete, onArchive, onPin, isArchivedView, onDownload, selectMode, selected, onToggleSelect }) {
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.content || "");
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSaveEdit = () => {
    if (editText.trim() && editText !== msg.content) {
      onEdit(msg.id, editText.trim());
    }
    setEditing(false);
  };

  const isAgentMsg = msg.sender_email === AI_AGENT_EMAIL;
  // رسائلي: كبسولة كحلية معبأة بالكامل. رسائل الآخرين/الذكاء الصناعي: بطاقة بيضاء بظل خفيف.
  const bubbleColor = isOwn ? "#162560" : "#FFFFFF";
  const textColor = isOwn ? "#FFFFFF" : "#0F172A";
  const metaColor = isOwn ? "rgba(255,255,255,0.62)" : "#9AA3AF";
  const align = isOwn ? "flex-end" : "flex-start";
  const hasMenu = (isOwn && (canDeleteThis || canEditThis)) || (!isOwn && canDeleteThis) || canPin;

  return (
    <div className="flex w-full" style={{ justifyContent: align, marginBottom: 4, gap: 6, alignItems: "flex-start" }}>
      {selectMode && (
        <button onClick={() => onToggleSelect(msg.id)} style={{ background: "none", border: "none", cursor: "pointer", color: selected ? "#4A90D9" : "#94A3B8", marginTop: 8 }}>
          {selected ? <CheckSquare size={16} /> : <Square size={16} />}
        </button>
      )}
      <div
        className="relative group"
        style={{
          maxWidth: "78%", minWidth: 60, background: bubbleColor,
          borderRadius: isOwn ? 20 : 18,
          padding: isOwn ? "10px 16px" : "10px 14px",
          boxShadow: isOwn ? "none" : "0 2px 10px rgba(15,23,42,0.06)",
          position: "relative",
          outline: msg.pinned ? "1px solid #FBBF24" : "none",
        }}
      >
        {msg.pinned && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
            <Pin size={10} color="#FBBF24" />
            <span style={{ fontSize: 9, color: "#FBBF24", fontWeight: 700 }}>{lang === "ar" ? "مثبَّتة" : "Pinned"}</span>
          </div>
        )}

        {!isOwn && !isArchivedView && (
          <p style={{ fontSize: 11, fontWeight: 700, color: isAgentMsg ? "#7C3AED" : emailToColor(msg.sender_email), marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
            {isAgentMsg && <Bot size={11} />} {isAgentMsg ? (lang === "ar" ? AI_AGENT_NAME_AR : AI_AGENT_NAME_EN) : emailToName(msg.sender_email)}
          </p>
        )}

        {msg.message_type === "file" && msg.file_name && (
          <div
            onClick={() => onDownload && onDownload(msg)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 12,
              background: isOwn ? "rgba(255,255,255,0.12)" : "#F1F2F5", marginBottom: msg.content ? 6 : 0,
              cursor: "pointer", transition: "background 0.15s",
            }}
          >
            {fileIcon(msg.file_name)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: textColor, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {msg.file_name}
              </p>
              {msg.file_size && (
                <p style={{ fontSize: 9, color: metaColor, margin: 0 }}>
                  {msg.file_size > 1048576 ? `${(msg.file_size / 1048576).toFixed(1)} MB` : `${(msg.file_size / 1024).toFixed(0)} KB`}
                </p>
              )}
            </div>
            <Download size={13} color={metaColor} />
          </div>
        )}

        {editing ? (
          <div style={{ display: "flex", gap: 4 }}>
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") setEditing(false); }}
              autoFocus
              style={{ flex: 1, fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid #E2E8F0", background: "#FFFFFF", color: "#0F172A", outline: "none" }}
            />
            <button onClick={handleSaveEdit} style={{ padding: "4px 8px", borderRadius: 6, background: "#16A34A", color: "#FFF", border: "none", fontSize: 11, cursor: "pointer" }}>
              <Check size={12} />
            </button>
          </div>
        ) : (
          msg.content && (
            <p style={{ fontSize: 12, lineHeight: 1.5, margin: 0, color: textColor, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
              {renderWithMentions(msg.content)}
            </p>
          )
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: isOwn ? "flex-end" : "flex-start", gap: 4, marginTop: 4 }}>
          {msg.is_edited && (
            <span style={{ fontSize: 9, color: metaColor, fontStyle: "italic" }}>
              {lang === "ar" ? "تم التعديل" : "edited"}
            </span>
          )}
          <span style={{ fontSize: 9, color: metaColor }}>
            {formatFullTime(msg.created_at)}
          </span>
          {isOwn && (
            <CheckCheck size={12} color={metaColor} />
          )}
        </div>

        {hasMenu && !isArchivedView && !selectMode && (
          <div ref={menuRef} style={{ position: "absolute", [isRTL ? "left" : "right"]: -8, top: -4 }}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              style={{
                width: 24, height: 24, borderRadius: 12, background: "rgba(0,0,0,0.05)", border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                opacity: 0, transition: "opacity 0.2s",
              }}
              className="group-hover:opacity-100"
            >
              <MoreVertical size={12} color="#64748B" />
            </button>
            {showMenu && (
              <div style={{
                position: "absolute", top: 28, [isRTL ? "left" : "right"]: 0, zIndex: 50,
                background: "#FFFFFF", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                border: "1px solid #E2E8F0", overflow: "hidden", minWidth: 150,
              }}>
                {isOwn && canEditThis && (
                  <button
                    onClick={() => { setEditing(true); setShowMenu(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#0F172A", textAlign: isRTL ? "right" : "left" }}
                  >
                    <Edit3 size={14} /> {lang === "ar" ? "تعديل" : "Edit"}
                  </button>
                )}
                {canPin && (
                  <button
                    onClick={() => { onPin(msg); setShowMenu(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#FBBF24", textAlign: isRTL ? "right" : "left" }}
                  >
                    {msg.pinned ? <PinOff size={14} /> : <Pin size={14} />} {msg.pinned ? (lang === "ar" ? "إلغاء التثبيت" : "Unpin") : (lang === "ar" ? "تثبيت" : "Pin")}
                  </button>
                )}
                {isOwn && (
                  <button
                    onClick={() => { onArchive(msg.id); setShowMenu(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#0F172A", textAlign: isRTL ? "right" : "left" }}
                  >
                    <Archive size={14} /> {lang === "ar" ? "أرشفة" : "Archive"}
                  </button>
                )}
                {canDeleteThis && (
                  <>
                    <div style={{ height: 1, background: "#F8FAFC" }} />
                    <button
                      onClick={() => { onDelete(msg); setShowMenu(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#DC2626", textAlign: isRTL ? "right" : "left" }}
                    >
                      <Trash2 size={14} /> {lang === "ar" ? "حذف" : "Delete"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── File Upload Handler ────────────────────────────────────────────

async function uploadChatFile(file, senderEmail) {
  const ext = file.name.split(".").pop();
  const path = `chat/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("chat-files").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("chat-files").getPublicUrl(path);
  return { url: data.publicUrl, path };
}

// ─── Pending Attachments (paste / file picker → preview → Send) ────────────

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // keep inline base64 payloads to Gemini reasonable

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function fileToAttachment(file) {
  const dataUrl = await readFileAsDataURL(file);
  const base64 = (dataUrl.split(",")[1]) || "";
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    file,
    name: file.name || (file.type?.startsWith("image/") ? "pasted-image.png" : "attachment"),
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    dataUrl,
    base64,
    isImage: (file.type || "").startsWith("image/"),
  };
}

// ─── Mention dedup window — لا يُرسَل إيميل ثانٍ لنفس المُرسِل←المستلَم خلال هذه المدة ────────
const EMAIL_DEDUP_MINUTES = 10;

async function notifyMention({ recipient, actor, message, channelLabel }) {
  try {
    await supabase.from("notifications").insert({
      recipient_email: recipient, type: "mention", actor_email: actor,
      message_id: message?.id || null, channel_label: channelLabel,
      content_preview: (message?.content || "").slice(0, 140),
    });
  } catch (e) { /* notifications قد لا يكون موجوداً بعد */ }

  try {
    const since = new Date(Date.now() - EMAIL_DEDUP_MINUTES * 60000).toISOString();
    const { data: recent } = await supabase.from("email_notifications_log")
      .select("id").eq("recipient_email", recipient).eq("actor_email", actor).gte("sent_at", since).limit(1);
    if (recent && recent.length) return; // نُفَاد إرسال بريد مكرَّر خلال نافذة قصيرة

    await supabase.from("email_notifications_log").insert({ recipient_email: recipient, actor_email: actor, message_id: message?.id || null });
    // أفضل جهد: يتطلب RESEND_API_KEY على الخادم (Netlify) ليعمل فعلياً — إن لم
    // يكن مُعداً فالدالة تفشل بصمت، ويبقى الإشعار داخل التطبيق يعمل دائماً
    fetch("/.netlify/functions/send-mention-email", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: recipient, actor, preview: (message?.content || "").slice(0, 300), channelLabel }),
    }).catch(() => {});
  } catch (e) { /* email_notifications_log قد لا يكون موجوداً بعد */ }
}

// ─── Main Chat Panel ────────────────────────────────────────────────

export function ChatPanel({ isOpen, onClose, isRTL, onUnreadChange }) {
  const { lang, t } = useLanguage();
  const { currentUser, whitelist, isAdmin, hasPermission, currentUserRecord } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState("public");
  const [activeGroup, setActiveGroup] = useState(null); // {id, name} | null
  const [groups, setGroups] = useState([]);
  const [groupMembersMap, setGroupMembersMap] = useState({}); // group_id -> [email]
  // لا تُفتح قائمة المستخدمين تلقائياً عند فتح الشات - فقط عند الضغط على أيقونة
  // "المستخدمين" بالهيدر (setShowOnline أدناه) - كانت true فتُفرَض القائمة فوراً.
  const [showOnline, setShowOnline] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [unreadCounts, setUnreadCounts] = useState({});
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [attachError, setAttachError] = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [confirmState, setConfirmState] = useState(null); // { title, message, confirmLabel, onConfirm }
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null); // string | null — نص بعد @ الحالي
  const [aiWorking, setAiWorking] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const dragDepthRef = useRef(0); // عداد دخول/خروج السحب — dragenter/dragleave تُطلَق أيضاً على العناصر الداخلية
  const channelRef = useRef(null);

  const canViewPublic = hasPermission("chat.view_public");
  const canSend = hasPermission("chat.send");
  const canDeleteOwn = hasPermission("chat.delete_own");
  const canDeleteOthers = hasPermission("chat.delete_others");
  const canEditOwn = hasPermission("chat.edit_own");
  const canPin = hasPermission("chat.pin");
  const canManageGroups = hasPermission("chat.manage_groups");
  const canManageMembers = hasPermission("chat.manage_group_members");
  const canClearChat = hasPermission("chat.clear_chat");

  const channelLabel = useMemo(() => {
    if (activeGroup) return { ar: activeGroup.name, en: activeGroup.name };
    if (activeChannel === "public") return { ar: "الشات العام", en: "Public Chat" };
    if (activeChannel === AI_AGENT_EMAIL) return { ar: AI_AGENT_NAME_AR, en: AI_AGENT_NAME_EN };
    return { ar: `خاص مع ${emailToName(activeChannel)}`, en: `Chat with ${emailToName(activeChannel)}` };
  }, [activeChannel, activeGroup]);

  const userContext = useMemo(() => ({
    id: currentUser,
    email: currentUser,
    name: emailToName(currentUser),
    role: isAdmin ? "Admin" : "User",
  }), [currentUser, isAdmin]);

  const knownEmails = useMemo(() => (whitelist || []).filter((e) => e !== currentUser), [whitelist, currentUser]);

  // ── تحميل المجموعات وعضوياتها ──
  const loadGroups = useCallback(async () => {
    try {
      const { data: gs } = await supabase.from("chat_groups").select("*").order("created_at", { ascending: true });
      const { data: members } = await supabase.from("chat_group_members").select("*");
      setGroups((gs || []).filter((g) => (members || []).some((m) => m.group_id === g.id && m.email === currentUser)));
      const map = {};
      (members || []).forEach((m) => { (map[m.group_id] ||= []).push(m.email); });
      setGroupMembersMap(map);
    } catch (e) { /* chat_groups قد لا يكون موجوداً بعد */ }
  }, [currentUser]);

  useEffect(() => { if (isOpen) loadGroups(); }, [isOpen, loadGroups]);

  useEffect(() => {
    const channel = supabase.channel("chat-groups-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_groups" }, loadGroups)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_group_members" }, loadGroups)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadGroups]);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      if (activeGroup) {
        const { data } = await supabase.from("chat_messages").select("*").eq("group_id", activeGroup.id).eq("is_archived", showArchive)
          .order("created_at", { ascending: true }).limit(500);
        setMessages(data || []);
        setLoading(false);
        return;
      }
      let query = supabase.from("chat_messages").select("*").eq("is_archived", showArchive).is("group_id", null);
      if (activeChannel === "public") {
        query = query.is("recipient_email", null);
      } else {
        // محادثة خاصة: رسائل الطرفين المباشرة بينهما + أي رد من الذكاء الصناعي
        // موجَّه لأحدهما (منشن @AI داخل هذي المحادثة الخاصة بالذات - يظهر للطرفين
        // معاً، لا لقناة "العام" ولا يختفي من هذي المحادثة).
        query = query.not("recipient_email", "is", null).or(
          `and(sender_email.eq.${currentUser},recipient_email.eq.${activeChannel}),` +
          `and(sender_email.eq.${activeChannel},recipient_email.eq.${currentUser}),` +
          `and(sender_email.eq.${AI_AGENT_EMAIL},recipient_email.eq.${activeChannel}),` +
          `and(sender_email.eq.${AI_AGENT_EMAIL},recipient_email.eq.${currentUser})`
        );
      }
      const { data, error } = await query.order("created_at", { ascending: true }).limit(500);
      if (data) {
        if (activeChannel !== "public") {
          const filtered = data.filter((m) => isDmRelevant(m, currentUser, activeChannel));
          setMessages(filtered);
        } else {
          setMessages(data);
        }
      }
    } catch (err) {
      console.error("[chat] Load exception:", err);
      setMessages([]);
    }
    setLoading(false);
  }, [activeChannel, activeGroup, showArchive, currentUser]);

  useEffect(() => { if (isOpen) loadMessages(); }, [isOpen, loadMessages]);

  // من دون صلاحية عرض الشات العام، لا يُفتح على القناة العامة افتراضياً
  useEffect(() => {
    if (isOpen && !activeGroup && activeChannel === "public" && !canViewPublic) {
      const firstOther = participants.find((p) => p !== "public");
      if (firstOther) setActiveChannel(firstOther);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, canViewPublic]);

  useEffect(() => {
    const channel = supabase
      .channel("chat-room")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const msg = payload.new;
        const isRelevant = activeGroup
          ? msg.group_id === activeGroup.id
          : (!msg.group_id && (!msg.recipient_email
              ? activeChannel === "public"
              : isDmRelevant(msg, currentUser, activeChannel)));
        if (!isRelevant) return;

        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (msg.sender_email !== currentUser && !muted) {
          playNotification();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, (payload) => {
        setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? payload.new : m)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [isOpen, currentUser, muted, activeChannel, activeGroup]);

  useEffect(() => {
    if (!isOpen || !currentUser) return;
    const presenceChannel = supabase.channel("online-users", { config: { presence: { key: currentUser } } });
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const online = new Set();
        Object.keys(state).forEach((key) => {
          if (state[key] && state[key].length > 0) online.add(key);
        });
        setOnlineUsers(online);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ user: currentUser, online_at: new Date().toISOString() });
        }
      });
    return () => { supabase.removeChannel(presenceChannel); };
  }, [isOpen, currentUser]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    setShowScrollBtn(!isNearBottom);
  };

  const [agentTyping, setAgentTyping] = useState(false);

  const queueAttachment = async (file) => {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachError(t({ ar: `الملف "${file.name}" أكبر من الحد المسموح (15MB)`, en: `"${file.name}" is larger than the 15MB limit` }));
      return;
    }
    try {
      const attachment = await fileToAttachment(file);
      setPendingAttachments((prev) => [...prev, attachment]);
      setAttachError(null);
    } catch (err) {
      console.error("Attach error:", err);
      setAttachError(t({ ar: "تعذر قراءة الملف", en: "Could not read the file" }));
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    await queueAttachment(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    const fileItems = Array.from(items).filter((it) => it.kind === "file");
    if (fileItems.length === 0) return;
    e.preventDefault();
    for (const item of fileItems) {
      await queueAttachment(item.getAsFile());
    }
  };

  const removeAttachment = (id) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // ── سحب وإفلات (Drag & Drop): إسقاط ملف/صورة خارجي في أي مكان بمنطقة الشات ──
  // dragenter/dragleave تُطلَق أيضاً عند عبور كل عنصر ابن، فلا يمكن الاعتماد على
  // dragleave وحدها لإخفاء المؤشر (تسبب رمشة/اختفاء مبكر) - لذا عدّاد عمق بسيط.
  const handleDragEnter = (e) => {
    e.preventDefault();
    if (!canSend) return;
    if (!e.dataTransfer?.types?.includes("Files")) return;
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  };
  const handleDragOver = (e) => {
    // preventDefault إلزامي هنا وإلا يرفض المتصفح onDrop بالكامل ويفتح الملف بتبويب جديد
    e.preventDefault();
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFile(false);
  };
  const handleDrop = async (e) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
    if (!canSend) return;
    const files = Array.from(e.dataTransfer?.files || []);
    for (const file of files) {
      await queueAttachment(file);
    }
  };

  // ── @mention: يكتشف رمز @ الحالي أثناء الكتابة لعرض قائمة اقتراح ──
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);
    const caret = e.target.selectionStart ?? val.length;
    const upToCaret = val.slice(0, caret);
    const m = upToCaret.match(/@([\p{L}\d_.-]*)$/u);
    setMentionQuery(m ? m[1] : null);
  };

  const applyMention = (email) => {
    const caret = inputRef.current?.selectionStart ?? inputText.length;
    const before = inputText.slice(0, caret).replace(/@([\p{L}\d_.-]*)$/u, `@${email} `);
    const after = inputText.slice(caret);
    setInputText(before + after);
    setMentionQuery(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const pool = [{ email: "AI", isAi: true }, ...knownEmails.map((e) => ({ email: e, isAi: false }))];
    return pool.filter((p) => p.email.toLowerCase().includes(q) || (!p.isAi && emailToName(p.email).toLowerCase().includes(q))).slice(0, 6);
  }, [mentionQuery, knownEmails]);

  const handleSend = async () => {
    if (!canSend) return;
    const text = inputText.trim();
    const attachments = pendingAttachments;
    if (!text && attachments.length === 0) return;
    setInputText("");
    setPendingAttachments([]);
    setAttachError(null);
    setMentionQuery(null);

    const isDMWithAgent = !activeGroup && activeChannel === AI_AGENT_EMAIL;
    const mentionsAgent = !isDMWithAgent && /@AI\b/i.test(text);
    const isForAgent = isDMWithAgent || mentionsAgent;
    const groupId = activeGroup?.id || null;
    // رسالتي الخاصة تبقى جزءاً طبيعياً من نفس محادثتي الخاصة بصرف النظر عن
    // وجود منشن @AI فيها أم لا - كانت قبل هذا الإصلاح تُخزَّن بـrecipient_email:
    // null (نفس معرِّف قناة "العام" الحصري) لمجرد وجود @AI بالنص، فتختفي فوراً
    // من محادثتي الخاصة مع الطرف الآخر وتظهر فقط بالعام (تسرّب فعلي مؤكَّد).
    const recipientForDB = groupId ? null : (isDMWithAgent ? AI_AGENT_EMAIL : (activeChannel === "public" ? null : activeChannel));
    // رد الذكاء الصناعي على منشن داخل محادثة خاصة حقيقية (لا القناة المخصصة
    // للذكاء الصناعي ولا العام) يبقى بنفس تلك المحادثة الخاصة - يظهر للطرفين
    // معاً بقرار المستخدم الصريح (لا كإشعار خاص لمن كتب المنشن فقط).
    const aiReplyRecipient = groupId ? null : (isDMWithAgent ? currentUser : (activeChannel === "public" ? null : activeChannel));
    const mentionedEmails = extractMentions(text, knownEmails);

    setSending(true);
    let lastInsertedMsg = null;
    try {
      if (attachments.length > 0) {
        for (let i = 0; i < attachments.length; i++) {
          const att = attachments[i];
          try {
            const { url } = await uploadChatFile(att.file, currentUser);
            const { data } = await supabase.from("chat_messages").insert({
              sender_email: currentUser,
              recipient_email: recipientForDB,
              group_id: groupId,
              content: i === 0 ? (text || null) : null,
              message_type: "file",
              file_name: att.name,
              file_url: url,
              file_size: att.size,
              mentions: i === 0 && mentionedEmails.length ? mentionedEmails : null,
            }).select().maybeSingle();
            if (i === 0) lastInsertedMsg = data;
          } catch (err) {
            console.error("Upload error:", err);
          }
        }
      } else {
        const { data } = await supabase.from("chat_messages").insert({
          sender_email: currentUser,
          recipient_email: recipientForDB,
          group_id: groupId,
          content: text,
          message_type: "text",
          mentions: mentionedEmails.length ? mentionedEmails : null,
        }).select().maybeSingle();
        lastInsertedMsg = data;
      }

      // إشعارات @mention — بريد داخل التطبيق فوراً + محاولة بريد إلكتروني (best-effort)
      for (const recipient of mentionedEmails) {
        notifyMention({ recipient, actor: currentUser, message: lastInsertedMsg, channelLabel: t(channelLabel) });
      }

      if (!isForAgent) return;

      setAgentTyping(true);
      setAiWorking(false);

      // ملف جدول بيانات + طلب موجَّه لـ@AI → مسار تحويل الملفات (يبني ملفاً
      // جديداً ويرسله كرسالة، لا يستبدل الأصلي)، وإلا المسار المتعدد الوسائط المعتاد
      const spreadsheetAtt = attachments.find((a) => SPREADSHEET_EXT.test(a.name));

      // طلب "تنظيم شجرة حسابات" تحديداً → محرك chartOrganizerAgent الحتمي
      // المتخصص (يُعيد ملف شجرة كامل بترقيم/تصنيف/توريث قيود الصحيح + ورقة
      // تدقيق)، لا المسار العام runAIExcelWorkflow أدناه (مصمم لتحويلات جدول
      // بيانات عامة، لا لبناء شجرة حسابات كاملة بقواعدها الخاصة).
      if (spreadsheetAtt && text && isChartOrganizeRequest(text)) {
        setAiWorking(true);
        try {
          const result = await organizeChartOfAccounts(spreadsheetAtt.file, {
            aiTypeResolver: resolveAmbiguousTypesWithClaude,
            aiColumnMappingResolver: resolveColumnMappingWithClaude,
          });
          const outFile = new File([result.blob], result.filename, { type: result.blob.type });
          const { url } = await uploadChatFile(outFile, AI_AGENT_EMAIL);
          await supabase.from("chat_messages").insert({
            sender_email: AI_AGENT_EMAIL,
            recipient_email: aiReplyRecipient,
            group_id: groupId,
            content: result.summary,
            message_type: "text",
          });
          await supabase.from("chat_messages").insert({
            sender_email: AI_AGENT_EMAIL,
            recipient_email: aiReplyRecipient,
            group_id: groupId,
            message_type: "file",
            file_name: result.filename,
            file_url: url,
          });
        } catch (err) {
          await supabase.from("chat_messages").insert({
            sender_email: AI_AGENT_EMAIL,
            recipient_email: aiReplyRecipient,
            group_id: groupId,
            content: `⚠️ ${err.message || (lang === "ar" ? "تعذّر تنظيم شجرة الحسابات" : "Could not organize the chart of accounts")}`,
            message_type: "text",
          });
        }
        setAiWorking(false);
        setAgentTyping(false);
        return;
      }

      if (spreadsheetAtt && text) {
        setAiWorking(true);
        try {
          const result = await runAIExcelWorkflow(spreadsheetAtt.file, text);
          const outFile = new File([result.blob], result.filename, { type: result.blob.type });
          const { url } = await uploadChatFile(outFile, AI_AGENT_EMAIL);
          const noteLines = [result.summary, ...(result.notes || [])].filter(Boolean).join("\n");
          await supabase.from("chat_messages").insert({
            sender_email: AI_AGENT_EMAIL,
            recipient_email: aiReplyRecipient,
            group_id: groupId,
            content: noteLines || (lang === "ar" ? "تم إنشاء الملف." : "File generated."),
            message_type: "text",
          });
          await supabase.from("chat_messages").insert({
            sender_email: AI_AGENT_EMAIL,
            recipient_email: aiReplyRecipient,
            group_id: groupId,
            message_type: "file",
            file_name: result.filename,
            file_url: url,
          });
        } catch (err) {
          await supabase.from("chat_messages").insert({
            sender_email: AI_AGENT_EMAIL,
            recipient_email: aiReplyRecipient,
            group_id: groupId,
            content: `⚠️ ${err.message || (lang === "ar" ? "تعذّرت معالجة الملف" : "Could not process the file")}`,
            message_type: "text",
          });
        }
        setAiWorking(false);
        setAgentTyping(false);
        return;
      }

      // سياق المحادثة: آخر 20 رسالة من نفس القناة فقط — لا يصل @AI أبداً لأي
      // محادثة لم يُستدعَ فيها صراحةً، ولا يتجاوز ما يراه المستخدم نفسه أصلاً
      const history = messages.slice(-20).map((m) => `${m.sender_email === AI_AGENT_EMAIL ? "AI" : emailToName(m.sender_email)}: ${m.content || (m.file_name ? `[ملف: ${m.file_name}]` : "")}`).join("\n");
      const promptWithHistory = history ? `سياق المحادثة السابقة:\n${history}\n\nالرسالة الحالية: ${text}` : text;

      const attachmentsPayload = attachments.map((a) => ({ name: a.name, mimeType: a.mimeType, base64: a.base64 }));
      const replyText = await generateAIResponse(promptWithHistory, { attachments: attachmentsPayload, user: userContext });
      setAgentTyping(false);

      await supabase.from("chat_messages").insert({
        sender_email: AI_AGENT_EMAIL,
        recipient_email: aiReplyRecipient,
        group_id: groupId,
        content: replyText,
        message_type: "text",
      });
    } finally {
      setSending(false);
      setAgentTyping(false);
      setAiWorking(false);
    }
  };

  const handleEdit = async (id, newContent) => {
    if (!canEditOwn) return;
    await supabase.from("chat_messages").update({ content: newContent, is_edited: true }).eq("id", id);
  };

  const doDelete = async (ids) => {
    await supabase.from("chat_messages").delete().in("id", ids);
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const requestDeleteOne = (msg) => {
    setConfirmState({
      title: t({ ar: "حذف الرسالة", en: "Delete message" }),
      message: t({ ar: "لا يمكن التراجع عن هذا الإجراء.", en: "This cannot be undone." }),
      confirmLabel: t({ ar: "حذف", en: "Delete" }),
      onConfirm: async () => { await doDelete([msg.id]); setConfirmState(null); },
    });
  };

  const requestDeleteSelected = () => {
    if (!selectedIds.size) return;
    setConfirmState({
      title: t({ ar: `حذف ${selectedIds.size} رسالة`, en: `Delete ${selectedIds.size} messages` }),
      message: t({ ar: "لا يمكن التراجع عن هذا الإجراء.", en: "This cannot be undone." }),
      confirmLabel: t({ ar: "حذف المحدَّد", en: "Delete selected" }),
      onConfirm: async () => { await doDelete([...selectedIds]); setConfirmState(null); },
    });
  };

  const requestDeleteAllMine = () => {
    const mine = messages.filter((m) => m.sender_email === currentUser).map((m) => m.id);
    if (!mine.length) return;
    setConfirmState({
      title: t({ ar: "حذف كل رسائلي في هذه المحادثة", en: "Delete all my messages here" }),
      message: t({ ar: `سيُحذف ${mine.length} رسالة من رسائلك في هذه القناة. لا يمكن التراجع.`, en: `${mine.length} of your messages in this channel will be deleted. This cannot be undone.` }),
      confirmLabel: t({ ar: "حذف الكل", en: "Delete all" }),
      onConfirm: async () => { await doDelete(mine); setConfirmState(null); },
    });
  };

  const requestClearChat = () => {
    const all = messages.map((m) => m.id);
    if (!all.length) return;
    setConfirmState({
      title: t({ ar: "تفريغ المحادثة بالكامل", en: "Clear entire chat" }),
      message: t({ ar: `سيُحذف كل الرسائل (${all.length}) في هذه القناة نهائياً لكل الأعضاء. لا يمكن التراجع.`, en: `All ${all.length} messages in this channel will be permanently deleted for everyone. This cannot be undone.` }),
      confirmLabel: t({ ar: "تفريغ الشات", en: "Clear chat" }),
      onConfirm: async () => { await doDelete(all); setConfirmState(null); },
    });
  };

  const handlePin = async (msg) => {
    if (!canPin) return;
    await supabase.from("chat_messages").update({
      pinned: !msg.pinned, pinned_by: !msg.pinned ? currentUser : null, pinned_at: !msg.pinned ? new Date().toISOString() : null,
    }).eq("id", msg.id);
  };

  const handleArchive = async (id) => {
    await supabase.from("chat_messages").update({ is_archived: true }).eq("id", id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const handleDownload = (msg) => {
    if (msg.file_url) window.open(msg.file_url, "_blank");
  };

  const switchChannel = (ch) => {
    setActiveGroup(null);
    setActiveChannel(ch);
    setUnreadCounts((prev) => ({ ...prev, [ch]: 0 }));
    setSelectMode(false); setSelectedIds(new Set());
  };

  const switchGroup = (g) => {
    setActiveGroup(g);
    setSelectMode(false); setSelectedIds(new Set());
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const participants = useMemo(() => {
    const users = (whitelist || []).filter((email) => email !== currentUser);
    return [AI_AGENT_EMAIL, ...users];
  }, [whitelist, currentUser]);

  const filteredMessages = searchQuery
    ? messages.filter((m) => (m.content || "").toLowerCase().includes(searchQuery.toLowerCase()) || (m.file_name || "").toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const pinnedMessages = messages.filter((m) => m.pinned);

  if (!isOpen) return null;

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      style={{
        position: "fixed", bottom: 16, [isRTL ? "left" : "right"]: 16, width: 400, height: 600, zIndex: 1000,
        display: "flex", flexDirection: "column", borderRadius: 20, overflow: "hidden",
        boxShadow: "0 12px 48px rgba(22, 37, 96, 0.25), 0 0 0 1px rgba(22, 37, 96, 0.08)",
        fontFamily: "Cairo, sans-serif", background: "#FFFFFF",
      }}
    >
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title} message={confirmState.message} confirmLabel={confirmState.confirmLabel}
          onConfirm={confirmState.onConfirm} onCancel={() => setConfirmState(null)}
        />
      )}
      {showNewGroup && (
        <NewGroupDialog
          t={t} isRTL={isRTL} knownEmails={knownEmails} currentUser={currentUser}
          onClose={() => setShowNewGroup(false)}
          onCreate={async (name, members) => {
            const { data: g } = await supabase.from("chat_groups").insert({ name, created_by: currentUser }).select().maybeSingle();
            if (g) {
              const rows = [currentUser, ...members].map((email) => ({ group_id: g.id, email, added_by: currentUser }));
              await supabase.from("chat_group_members").insert(rows);
              await loadGroups();
              switchGroup(g);
            }
            setShowNewGroup(false);
          }}
        />
      )}
      {showMembers && activeGroup && (
        <GroupMembersDialog
          t={t} group={activeGroup} members={groupMembersMap[activeGroup.id] || []} knownEmails={knownEmails}
          canManageMembers={canManageMembers} currentUser={currentUser}
          onClose={() => setShowMembers(false)}
          onAdd={async (email) => { await supabase.from("chat_group_members").insert({ group_id: activeGroup.id, email, added_by: currentUser }); await loadGroups(); }}
          onRemove={async (email) => { await supabase.from("chat_group_members").delete().eq("group_id", activeGroup.id).eq("email", email); await loadGroups(); }}
        />
      )}

      {/* Header — خفيف وبسيط (اتجاه تصميم معتمد من المستخدم، مقتبس من ودجت دعم قيود) */}
      <div style={{ background: "#FFFFFF", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, borderBottom: "1px solid #ECEEF2" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6B7280", flexShrink: 0 }}>
            <X size={16} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t(channelLabel)}</h3>
            <p style={{ margin: "1px 0 0", fontSize: 10, color: !activeGroup && activeChannel !== "public" && onlineUsers.has(activeChannel) ? "#16A34A" : "#9AA3AF", fontWeight: 600 }}>
              {activeGroup
                ? t({ ar: `${(groupMembersMap[activeGroup.id] || []).length} أعضاء`, en: `${(groupMembersMap[activeGroup.id] || []).length} members` })
                : activeChannel === "public"
                ? t({ ar: `${participants.length} أعضاء`, en: `${participants.length} members` })
                : t({ ar: onlineUsers.has(activeChannel) ? "متصل الآن" : "غير متصل", en: onlineUsers.has(activeChannel) ? "Online now" : "Offline" })}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {activeGroup && (
            <button onClick={() => setShowMembers(true)} style={{ background: "none", border: "none", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6B7280" }} title={t({ ar: "الأعضاء", en: "Members" })}>
              <Users size={15} />
            </button>
          )}
          <button onClick={() => setMuted(!muted)} style={{ background: "none", border: "none", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: muted ? "#F59E0B" : "#6B7280" }}>
            {muted ? <BellOff size={15} /> : <Bell size={15} />}
          </button>
          <button onClick={() => setShowOnline(!showOnline)} style={{ background: "none", border: "none", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: showOnline ? "#16A34A" : "#6B7280" }}>
            <Users size={15} />
          </button>
          {activeGroup ? (
            <div style={{ width: 28, height: 28, borderRadius: 14, background: "linear-gradient(135deg, #0891B2, #0E7490)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Users size={13} color="#FFF" />
            </div>
          ) : activeChannel === "public" ? (
            <div style={{ width: 28, height: 28, borderRadius: 14, background: "#162560", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Hash size={13} color="#FFF" />
            </div>
          ) : activeChannel === AI_AGENT_EMAIL ? (
            <div style={{ width: 28, height: 28, borderRadius: 14, background: "linear-gradient(135deg, #7C3AED, #A78BFA)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bot size={14} color="#FFF" />
            </div>
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: 14, background: `linear-gradient(135deg, ${emailToColor(activeChannel)}, ${emailToColor(activeChannel)}dd)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              {activeChannel.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar — قائمة بيضاء بعناوين فئات، مع كبسولة كحلية ثابتة بالأسفل لإنشاء مجموعة */}
        {showOnline && (
          <div style={{ width: 140, borderRight: isRTL ? "none" : "1px solid #ECEEF2", borderLeft: isRTL ? "1px solid #ECEEF2" : "none", background: "#FFFFFF", flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, overflow: "auto" }}>
              {canViewPublic && (
              <>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9AA3AF", letterSpacing: 0.2, margin: 0, padding: "12px 12px 5px" }}>{t({ ar: "القنوات", en: "Channels" })}</p>
              <button
                onClick={() => switchChannel("public")}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", borderBottom: "1px solid #F5F6F8", cursor: "pointer", textAlign: "start", background: (!activeGroup && activeChannel === "public") ? "#F7F8FA" : "transparent" }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 15, background: "#162560", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Hash size={13} color="#FFF" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11.5, fontWeight: 700, color: "#0F172A", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t({ ar: "عام", en: "Public" })}</p>
                </div>
              </button>
              </>
              )}

              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => switchGroup(g)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", borderBottom: "1px solid #F5F6F8", cursor: "pointer", textAlign: "start", background: activeGroup?.id === g.id ? "#F7F8FA" : "transparent" }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 15, background: "#0E7490", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", flexShrink: 0 }}>
                    <Users size={13} />
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{g.name}</p>
                </button>
              ))}

              <p style={{ fontSize: 10, fontWeight: 700, color: "#9AA3AF", letterSpacing: 0.2, margin: 0, padding: "12px 12px 5px" }}>{t({ ar: "مباشر", en: "Direct" })}</p>

              {participants.map((email) => {
                const isAgent = email === AI_AGENT_EMAIL;
                const isOnline = isAgent ? true : onlineUsers.has(email);
                const isActive = !activeGroup && activeChannel === email;
                return (
                  <button
                    key={email}
                    onClick={() => switchChannel(email)}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", borderBottom: "1px solid #F5F6F8", cursor: "pointer", textAlign: "start", background: isActive ? "#F7F8FA" : "transparent" }}
                  >
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 15, background: isAgent ? "linear-gradient(135deg, #7C3AED, #A78BFA)" : `linear-gradient(135deg, ${emailToColor(email)}, ${emailToColor(email)}dd)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", fontSize: 12, fontWeight: 700 }}>
                        {isAgent ? <Bot size={15} /> : email.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ position: "absolute", bottom: -1, [isRTL ? "left" : "right"]: -1, width: 9, height: 9, borderRadius: 5, background: isOnline ? "#16A34A" : "#9AA3AF", border: "2px solid #FFFFFF" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: isAgent ? "#7C3AED" : "#0F172A", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {isAgent ? t({ ar: AI_AGENT_NAME_AR, en: AI_AGENT_NAME_EN }) : emailToName(email)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {canManageGroups && (
              <div style={{ padding: "10px 12px 12px", borderTop: "1px solid #ECEEF2", flexShrink: 0 }}>
                <button onClick={() => setShowNewGroup(true)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, width: "100%", padding: "9px", borderRadius: 16, border: "none", cursor: "pointer", background: "#162560", color: "#FFF", fontSize: 10.5, fontWeight: 700 }}>
                  <Plus size={12} /> {t({ ar: "مجموعة جديدة", en: "New group" })}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div
          style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDraggingFile && (
            <div style={{
              position: "absolute", inset: 6, zIndex: 30, borderRadius: 14,
              border: "2px dashed #162560", background: "rgba(22,37,96,0.06)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
              pointerEvents: "none",
            }}>
              <Paperclip size={28} color="#162560" />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#162560" }}>
                {t({ ar: "أسقط الملف هنا لإضافته للمحادثة", en: "Drop the file here to attach it" })}
              </p>
            </div>
          )}
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #ECEEF2", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, background: "#FFFFFF" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <Search size={12} style={{ position: "absolute", [isRTL ? "right" : "left"]: 8, top: "50%", transform: "translateY(-50%)", color: "#9AA3AF" }} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t({ ar: "بحث...", en: "Search..." })}
                style={{ width: "100%", padding: "6px 10px 6px 28px", borderRadius: 10, border: "none", fontSize: 11, outline: "none", background: "#F1F2F5", color: "#0F172A" }}
              />
            </div>
            {(canDeleteOwn || canDeleteOthers || canClearChat) && !showArchive && (
              <button
                onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
                title={t({ ar: "تحديد رسائل للحذف", en: "Select messages to delete" })}
                style={{ background: selectMode ? "#162560" : "#F1F2F5", border: "none", borderRadius: 10, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: selectMode ? "#FFF" : "#6B7280", flexShrink: 0 }}
              >
                <CheckSquare size={13} />
              </button>
            )}
          </div>

          {/* شريط إجراءات الحذف الجماعي */}
          {selectMode && (
            <div style={{ padding: "8px 12px", borderBottom: "1px solid #ECEEF2", background: "#FFFFFF", display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "#64748B", alignSelf: "center" }}>{t({ ar: `محدَّد: ${selectedIds.size}`, en: `Selected: ${selectedIds.size}` })}</span>
              <button onClick={requestDeleteSelected} disabled={!selectedIds.size} style={{ padding: "4px 10px", borderRadius: 6, background: "#FEE2E2", color: "#DC2626", border: "1px solid #FCA5A5", fontSize: 11, cursor: "pointer", opacity: selectedIds.size ? 1 : 0.5 }}>
                {t({ ar: "حذف المحدَّد", en: "Delete selected" })}
              </button>
              {canDeleteOwn && (
                <button onClick={requestDeleteAllMine} style={{ padding: "4px 10px", borderRadius: 6, background: "#FEE2E2", color: "#DC2626", border: "1px solid #FCA5A5", fontSize: 11, cursor: "pointer" }}>
                  {t({ ar: "حذف كل رسائلي", en: "Delete all my messages" })}
                </button>
              )}
              {canClearChat && (
                <button onClick={requestClearChat} style={{ padding: "4px 10px", borderRadius: 6, background: "#DC2626", color: "#FFF", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {t({ ar: "تفريغ الشات بالكامل", en: "Clear entire chat" })}
                </button>
              )}
            </div>
          )}

          {/* الرسائل المثبَّتة */}
          {pinnedMessages.length > 0 && !showArchive && (
            <div style={{ padding: "6px 12px", borderBottom: "1px solid #ECEEF2", background: "rgba(251,191,36,0.06)", flexShrink: 0, maxHeight: 70, overflow: "auto" }}>
              {pinnedMessages.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#FBBF24", padding: "2px 0" }}>
                  <Pin size={10} /> <span style={{ fontWeight: 600 }}>{emailToName(m.sender_email)}:</span>
                  <span style={{ color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.content || m.file_name}</span>
                </div>
              ))}
            </div>
          )}

          <div ref={messagesContainerRef} onScroll={handleScroll} style={{ flex: 1, overflow: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 8, background: "#F1F2F5" }}>
            {loading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 24, height: 24, border: "3px solid #E2E8F0", borderTopColor: "#162560", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              </div>
            ) : filteredMessages.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
                <MessageCircle size={32} color="#9AA3AF" />
                <p style={{ fontSize: 13, color: "#9AA3AF", margin: 0 }}>{t({ ar: "ابدأ المحادثة!", en: "Start the conversation!" })}</p>
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isOwn = msg.sender_email === currentUser;
                return (
                  <MessageBubble
                    key={msg.id} msg={msg} isOwn={isOwn} isRTL={isRTL} lang={lang}
                    canDeleteThis={isOwn ? canDeleteOwn : canDeleteOthers}
                    canEditThis={isOwn && canEditOwn}
                    canPin={canPin}
                    onEdit={handleEdit} onDelete={requestDeleteOne} onArchive={handleArchive} onPin={handlePin}
                    isArchivedView={showArchive} onDownload={handleDownload}
                    selectMode={selectMode} selected={selectedIds.has(msg.id)} onToggleSelect={toggleSelect}
                  />
                );
              })
            )}

            {agentTyping && (
              <div className="flex w-full" style={{ justifyContent: "flex-start", marginBottom: 4 }}>
                <div style={{ background: "#FFFFFF", borderRadius: 18, boxShadow: "0 2px 10px rgba(15,23,42,0.06)", padding: "9px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  <Bot size={14} color="#7C3AED" />
                  <span style={{ fontSize: 10, color: "#7C3AED", fontWeight: 500 }}>
                    {aiWorking ? t({ ar: "المساعد يعالج الملف...", en: "Assistant processing the file..." }) : t({ ar: "المساعد يكتب...", en: "Assistant typing..." })}
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {(pendingAttachments.length > 0 || attachError) && (
            <div style={{ padding: "8px 12px 0", flexShrink: 0, background: "#F1F2F5" }}>
              {attachError && (
                <p style={{ fontSize: 11, color: "#DC2626", margin: "0 0 6px" }}>{attachError}</p>
              )}
              {pendingAttachments.length > 0 && (
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
                  {pendingAttachments.map((att) => (
                    <div key={att.id} style={{ position: "relative", flexShrink: 0 }}>
                      {att.isImage ? (
                        <img src={att.dataUrl} alt={att.name} style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", border: "1px solid #E2E8F0", display: "block" }} />
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: 8, background: "#F1F5F9", border: "1px solid #E2E8F0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 4, gap: 2 }}>
                          {fileIcon(att.name)}
                          <span style={{ fontSize: 8, color: "#64748B", maxWidth: 44, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                        </div>
                      )}
                      <button
                        onClick={() => removeAttachment(att.id)}
                        title={t({ ar: "إزالة", en: "Remove" })}
                        style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 9, background: "#DC2626", border: "2px solid #F8FAFC", color: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Input — كبسولة بيضاء عائمة */}
          <div style={{ padding: "10px 14px 14px", flexShrink: 0, background: "#F1F2F5", position: "relative" }}>
            {mentionSuggestions.length > 0 && (
              <div style={{ position: "absolute", bottom: "100%", left: 14, right: 14, marginBottom: 6, background: "#FFFFFF", border: "1px solid #ECEEF2", borderRadius: 12, boxShadow: "0 8px 24px rgba(15,23,42,0.14)", overflow: "hidden", zIndex: 20 }}>
                {mentionSuggestions.map((s) => (
                  <button key={s.email} onClick={() => applyMention(s.isAi ? "AI" : s.email)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer", textAlign: isRTL ? "right" : "left" }}>
                    {s.isAi ? <Bot size={14} color="#7C3AED" /> : <div style={{ width: 20, height: 20, borderRadius: 10, background: emailToColor(s.email), color: "#FFF", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.email.charAt(0).toUpperCase()}</div>}
                    <span style={{ fontSize: 12, color: "#0F172A" }}>{s.isAi ? "AI" : emailToName(s.email)}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#FFFFFF", borderRadius: 24, padding: "6px 6px 6px 14px", boxShadow: "0 4px 16px rgba(15,23,42,0.10)" }}>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.doc,.png,.jpg,.jpeg,.gif,.txt" onChange={handleFileSelect} style={{ display: "none" }} />
              <input
                ref={inputRef}
                value={inputText}
                onChange={handleInputChange}
                onPaste={handlePaste}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } if (e.key === "Escape") setMentionQuery(null); }}
                placeholder={canSend ? t({ ar: "اكتب رسالة، أو @ لإشارة، أو الصق صورة/ملف...", en: "Type a message, @ to mention, or paste an image/file..." }) : t({ ar: "لا تملك صلاحية الإرسال في هذا الشات", en: "You don't have permission to send here" })}
                disabled={!canSend}
                style={{ flex: 1, minWidth: 0, padding: "8px 4px", border: "none", fontSize: 13, outline: "none", background: "transparent", color: "#0F172A", opacity: canSend ? 1 : 0.6 }}
              />
              <button onClick={() => fileInputRef.current?.click()} disabled={sending || !canSend} style={{ width: 30, height: 30, borderRadius: 15, border: "none", background: "transparent", color: "#9AA3AF", cursor: canSend ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", opacity: canSend ? 1 : 0.5, flexShrink: 0 }}>
                <Paperclip size={16} />
              </button>
              <button onClick={handleSend} disabled={sending || !canSend || (!inputText.trim() && pendingAttachments.length === 0)} style={{ width: 34, height: 34, borderRadius: 17, border: "none", background: (canSend && (inputText.trim() || pendingAttachments.length > 0)) ? "#162560" : "#F1F2F5", color: (inputText.trim() || pendingAttachments.length > 0) ? "#FFF" : "#9AA3AF", cursor: sending ? "wait" : (canSend && (inputText.trim() || pendingAttachments.length > 0)) ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {sending ? <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#FFF", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> : <ArrowUp size={15} style={{ transform: isRTL ? "scaleX(-1)" : "none" }} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewGroupDialog({ t, isRTL, knownEmails, currentUser, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(new Set());
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1150, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 340, maxWidth: "90vw", maxHeight: "80vh", background: "#FFFFFF", borderRadius: 16, border: "1px solid #E2E8F0", padding: 20, display: "flex", flexDirection: "column" }}>
        <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{t({ ar: "مجموعة جديدة", en: "New group" })}</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t({ ar: "اسم المجموعة", en: "Group name" })} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#F1F5F9", color: "#0F172A", fontSize: 13, marginBottom: 12 }} />
        <p style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>{t({ ar: "الأعضاء", en: "Members" })}</p>
        <div style={{ overflowY: "auto", flex: 1, marginBottom: 14 }}>
          {knownEmails.map((email) => (
            <label key={email} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 12, color: "#0F172A", cursor: "pointer" }}>
              <input type="checkbox" checked={selected.has(email)} onChange={() => setSelected((prev) => { const n = new Set(prev); n.has(email) ? n.delete(email) : n.add(email); return n; })} />
              {emailToName(email)}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 9, borderRadius: 8, border: "1px solid #E2E8F0", background: "transparent", color: "#64748B", fontSize: 12.5, cursor: "pointer" }}>{t({ ar: "إلغاء", en: "Cancel" })}</button>
          <button onClick={() => name.trim() && onCreate(name.trim(), [...selected])} disabled={!name.trim()} style={{ flex: 1, padding: 9, borderRadius: 8, border: "none", background: "#12B886", color: "#FFF", fontSize: 12.5, fontWeight: 700, cursor: "pointer", opacity: name.trim() ? 1 : 0.5 }}>{t({ ar: "إنشاء", en: "Create" })}</button>
        </div>
      </div>
    </div>
  );
}

function GroupMembersDialog({ t, group, members, knownEmails, canManageMembers, currentUser, onClose, onAdd, onRemove }) {
  const [addEmail, setAddEmail] = useState("");
  const addable = knownEmails.filter((e) => !members.includes(e));
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1150, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 340, maxWidth: "90vw", maxHeight: "80vh", background: "#FFFFFF", borderRadius: 16, border: "1px solid #E2E8F0", padding: 20, display: "flex", flexDirection: "column" }}>
        <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{t({ ar: `أعضاء ${group.name}`, en: `${group.name} members` })}</p>
        <div style={{ overflowY: "auto", flex: 1, marginBottom: 12 }}>
          {members.map((email) => (
            <div key={email} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", fontSize: 12, color: "#0F172A" }}>
              <span>{emailToName(email)}{email === currentUser ? ` (${t({ ar: "أنت", en: "you" })})` : ""}</span>
              {canManageMembers && email !== currentUser && (
                <button onClick={() => onRemove(email)} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer" }}><UserMinus size={13} /></button>
              )}
            </div>
          ))}
        </div>
        {canManageMembers && (
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <select value={addEmail} onChange={(e) => setAddEmail(e.target.value)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #233152", background: "#0E1830", color: "#E6EDF6", fontSize: 12 }}>
              <option value="">{t({ ar: "— اختر مستخدم —", en: "— Select user —" })}</option>
              {addable.map((e) => <option key={e} value={e}>{emailToName(e)}</option>)}
            </select>
            <button onClick={() => { if (addEmail) { onAdd(addEmail); setAddEmail(""); } }} disabled={!addEmail} style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#12B886", color: "#FFF", cursor: "pointer", opacity: addEmail ? 1 : 0.5 }}><UserPlus size={13} /></button>
          </div>
        )}
        <button onClick={onClose} style={{ padding: 9, borderRadius: 8, border: "1px solid #E2E8F0", background: "transparent", color: "#64748B", fontSize: 12.5, cursor: "pointer" }}>{t({ ar: "إغلاق", en: "Close" })}</button>
      </div>
    </div>
  );
}

export function ChatToggle({ onClick, isRTL, unreadCount }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed",
        bottom: 16,
        [isRTL ? "left" : "right"]: 16,
        width: 56,
        height: 56,
        borderRadius: 28,
        background: "linear-gradient(135deg, #162560, #4A90D9)",
        color: "#FFF",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 6px 24px rgba(22, 37, 96, 0.35)",
        zIndex: 999,
      }}
    >
      <MessageCircle size={24} />
    </button>
  );
}
