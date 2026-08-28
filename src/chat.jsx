import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabase";
import { useLanguage } from "./language";
import { useAuth } from "./auth";
import {
  generateAIResponse,
  AI_AGENT_EMAIL, AI_AGENT_NAME_AR, AI_AGENT_NAME_EN
} from "./aiAgent";
import {
  MessageCircle, X, Send, Paperclip, Image, FileSpreadsheet, FileText,
  ChevronLeft, ChevronRight, Volume2, VolumeX, Archive, Trash2, Edit3,
  Check, CheckCheck, Smile, Search, MoreVertical, Download, Eye, EyeOff,
  Bell, BellOff, Users, Hash, Lock, ArrowDown, Bot,
} from "lucide-react";

// ─── Sound ──────────────────────────────────────────────────────────

const NOTIF_SOUND = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVggoKPkJaQf2xncoCTmZqXkYJ8eH2NnZ6dmZOLhH1/h5CZnZuUkIaCgIaLkJaWlZCKhYF/g4uQlZWTkIiDgICFjJCVlZOQh4OAgIWMkZWVk5CHg4CAhYyRlZWTkIeDgICEjJGVlZOQh4OAgISNkpaVk5CHg4CAhI2SlpaTkIeDgICEjpOWlpOQh4OAgISOk5aXk5CHg4CAhI6UlpibkIeDgICEj5SWmJuQh4OAgISPlJaYm5CHg4CAhI+VlpmckIeDgICEj5WWmZyQh4OAgIWQlpaZnJCHg4CAhZCWlpmckIeDgICFkJaWmZyQh4OAgIWQl5aZnJCHg4CAhZCXlpmckIeDgICFkJeWmZyQh4OAgIWQl5aZnJCHg4CAhZCXlpmckIeDgICFkJeWmZyQh4OAgIWQl5aZnJCHg4CAhZCXlpmckIeDgICFkJeWmZyQh4OAgA==";

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
  return <FileText size={16} color="#8CA3C1" />;
}

// ─── Message Bubble ─────────────────────────────────────────────────

function MessageBubble({ msg, isOwn, isRTL, lang, onEdit, onDelete, onArchive, isArchivedView, onDownload }) {
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

  const bubbleColor = isOwn ? "linear-gradient(135deg, #162560, #1E3370)" : "#0E1830";
  const textColor = isOwn ? "#FFF" : "#E6EDF6";
  const align = isRTL ? (isOwn ? "flex-end" : "flex-start") : (isOwn ? "flex-end" : "flex-start");

  return (
    <div className="flex w-full" style={{ justifyContent: align, marginBottom: 4 }}>
      <div
        className="relative group"
        style={{
          maxWidth: "78%",
          minWidth: 60,
          background: bubbleColor,
          borderRadius: isRTL
            ? (isOwn ? "16px 16px 4px 16px" : "16px 16px 16px 4px")
            : (isOwn ? "16px 16px 4px 16px" : "16px 16px 16px 4px"),
          padding: "8px 12px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
          position: "relative",
        }}
      >
        {!isOwn && !isArchivedView && (
          <p style={{ fontSize: 11, fontWeight: 700, color: emailToColor(msg.sender_email), marginBottom: 2 }}>
            {emailToName(msg.sender_email)}
          </p>
        )}

        {msg.message_type === "file" && msg.file_name && (
          <div
            onClick={() => onDownload && onDownload(msg)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10,
              background: isOwn ? "rgba(255,255,255,0.15)" : "#16213A", marginBottom: msg.content ? 6 : 0,
              cursor: "pointer", transition: "background 0.15s",
            }}
          >
            {fileIcon(msg.file_name)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: isOwn ? "#FFF" : "#E6EDF6", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {msg.file_name}
              </p>
              {msg.file_size && (
                <p style={{ fontSize: 10, color: isOwn ? "rgba(255,255,255,0.6)" : "#5C7196", margin: 0 }}>
                  {msg.file_size > 1048576 ? `${(msg.file_size / 1048576).toFixed(1)} MB` : `${(msg.file_size / 1024).toFixed(0)} KB`}
                </p>
              )}
            </div>
            <Download size={14} color={isOwn ? "rgba(255,255,255,0.7)" : "#8CA3C1"} />
          </div>
        )}

        {editing ? (
          <div style={{ display: "flex", gap: 4 }}>
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") setEditing(false); }}
              autoFocus
              style={{ flex: 1, fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid #233152", background: "#111A2E", color: "#E6EDF6", outline: "none" }}
            />
            <button onClick={handleSaveEdit} style={{ padding: "4px 8px", borderRadius: 6, background: "#16A34A", color: "#FFF", border: "none", fontSize: 11, cursor: "pointer" }}>
              <Check size={12} />
            </button>
          </div>
        ) : (
          msg.content && (
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: textColor, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
              {msg.content}
            </p>
          )
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: isOwn ? "flex-end" : "flex-start", gap: 4, marginTop: 4 }}>
          {msg.is_edited && (
            <span style={{ fontSize: 9, color: isOwn ? "rgba(255,255,255,0.5)" : "#5C7196", fontStyle: "italic" }}>
              {lang === "ar" ? "تم التعديل" : "edited"}
            </span>
          )}
          <span style={{ fontSize: 10, color: isOwn ? "rgba(255,255,255,0.5)" : "#5C7196" }}>
            {formatFullTime(msg.created_at)}
          </span>
          {isOwn && (
            <CheckCheck size={12} color="rgba(255,255,255,0.6)" />
          )}
        </div>

        {isOwn && !isArchivedView && (
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
              <MoreVertical size={12} color="#8CA3C1" />
            </button>
            {showMenu && (
              <div style={{
                position: "absolute", top: 28, [isRTL ? "left" : "right"]: 0, zIndex: 50,
                background: "#111A2E", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                border: "1px solid #233152", overflow: "hidden", minWidth: 140,
              }}>
                <button
                  onClick={() => { setEditing(true); setShowMenu(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#E6EDF6", textAlign: isRTL ? "right" : "left" }}
                >
                  <Edit3 size={14} /> {lang === "ar" ? "تعديل" : "Edit"}
                </button>
                <button
                  onClick={() => { onArchive(msg.id); setShowMenu(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#E6EDF6", textAlign: isRTL ? "right" : "left" }}
                >
                  <Archive size={14} /> {lang === "ar" ? "أرشفة" : "Archive"}
                </button>
                <div style={{ height: 1, background: "#16213A" }} />
                <button
                  onClick={() => { onDelete(msg.id); setShowMenu(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#FB7185", textAlign: isRTL ? "right" : "left" }}
                >
                  <Trash2 size={14} /> {lang === "ar" ? "حذف" : "Delete"}
                </button>
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

// ─── Main Chat Panel ────────────────────────────────────────────────

export function ChatPanel({ isOpen, onClose, isRTL, onUnreadChange }) {
  const { lang, t } = useLanguage();
  const { currentUser, whitelist } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState("public");
  const [showOnline, setShowOnline] = useState(true);
  const [muted, setMuted] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [unreadCounts, setUnreadCounts] = useState({});
  const [uploading, setUploading] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [popup, setPopup] = useState(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const channelRef = useRef(null);

  const channelLabel = useMemo(() => {
    if (activeChannel === "public") return { ar: "الشات العام", en: "Public Chat" };
    if (activeChannel === AI_AGENT_EMAIL) return { ar: AI_AGENT_NAME_AR, en: AI_AGENT_NAME_EN };
    return { ar: `خاص مع ${emailToName(activeChannel)}`, en: `Chat with ${emailToName(activeChannel)}` };
  }, [activeChannel]);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from("chat_messages").select("*").eq("is_archived", showArchive);
      if (activeChannel === "public") {
        query = query.is("recipient_email", null);
      } else {
        query = query.not("recipient_email", "is", null).or(`sender_email.eq.${currentUser},recipient_email.eq.${currentUser}`);
      }
      const { data, error } = await query.order("created_at", { ascending: true }).limit(500);
      if (data) {
        if (activeChannel !== "public") {
          const filtered = data.filter((m) =>
            (m.sender_email === currentUser && m.recipient_email === activeChannel) ||
            (m.sender_email === activeChannel && m.recipient_email === currentUser)
          );
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
  }, [activeChannel, showArchive, currentUser]);

  useEffect(() => { if (isOpen) loadMessages(); }, [isOpen, loadMessages]);

  useEffect(() => {
    const channel = supabase
      .channel("chat-room")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const msg = payload.new;
        const isPublicMsg = !msg.recipient_email;
        const isRelevantDM = msg.recipient_email && (msg.sender_email === currentUser || msg.recipient_email === currentUser);
        if (!isPublicMsg && !isRelevantDM) return;

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
  }, [isOpen, currentUser, muted]);

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

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");

    const isDMWithAgent = activeChannel === AI_AGENT_EMAIL;

    // 1. إذا كان الشات عادي بين الموظفين (ليس مع الذكاء الاصطناعي)
    if (!isDMWithAgent && !text.includes("@AI")) {
      await supabase.from("chat_messages").insert({
        sender_email: currentUser,
        recipient_email: activeChannel === "public" ? null : activeChannel,
        content: text,
        message_type: "text",
      });
      return;
    }

    // 2. إذا كانت الرسالة موجهة للذكاء الاصطناعي حصراً
    await supabase.from("chat_messages").insert({
      sender_email: currentUser,
      recipient_email: isDMWithAgent ? AI_AGENT_EMAIL : null,
      content: text,
      message_type: "text",
    });

    setAgentTyping(true);
    const replyText = await generateAIResponse(text);
    setAgentTyping(false);

    await supabase.from("chat_messages").insert({
      sender_email: AI_AGENT_EMAIL,
      recipient_email: isDMWithAgent ? currentUser : null,
      content: replyText,
      message_type: "text",
    });
  };

  const handleFileSend = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadChatFile(file, currentUser);
      const recipientForDB = activeChannel === "public" ? null : activeChannel;
      await supabase.from("chat_messages").insert({
        sender_email: currentUser,
        recipient_email: recipientForDB,
        message_type: "file",
        file_name: file.name,
        file_url: url,
        file_size: file.size,
      });
    } catch (err) {
      console.error("Upload error:", err);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleEdit = async (id, newContent) => {
    await supabase.from("chat_messages").update({ content: newContent, is_edited: true }).eq("id", id);
  };

  const handleDelete = async (id) => {
    await supabase.from("chat_messages").delete().eq("id", id);
  };

  const handleArchive = async (id) => {
    await supabase.from("chat_messages").update({ is_archived: true }).eq("id", id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const handleDownload = (msg) => {
    if (msg.file_url) window.open(msg.file_url, "_blank");
  };

  const switchChannel = (ch) => {
    setActiveChannel(ch);
    setUnreadCounts((prev) => ({ ...prev, [ch]: 0 }));
  };

  const participants = useMemo(() => {
    const users = (whitelist || []).filter((email) => email !== currentUser);
    return [AI_AGENT_EMAIL, ...users];
  }, [whitelist, currentUser]);

  const filteredMessages = searchQuery
    ? messages.filter((m) => (m.content || "").toLowerCase().includes(searchQuery.toLowerCase()) || (m.file_name || "").toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  if (!isOpen) return null;

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      style={{
        position: "fixed",
        bottom: 16,
        [isRTL ? "left" : "right"]: 16,
        width: 400,
        height: 560,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 12px 48px rgba(22, 37, 96, 0.25), 0 0 0 1px rgba(22, 37, 96, 0.08)",
        fontFamily: "Cairo, sans-serif",
        background: "#111A2E",
      }}
    >
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #162560, #0F1A47)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#FFF" }}>
            <X size={16} />
          </button>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#FFF" }}>{t(channelLabel)}</h3>
            <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
              {activeChannel === "public"
                ? t({ ar: `${participants.length} أعضاء`, en: `${participants.length} members` })
                : t({ ar: onlineUsers.has(activeChannel) ? "متصل" : "غير متصل", en: onlineUsers.has(activeChannel) ? "Online" : "Offline" })}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => setMuted(!muted)} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: muted ? "#F59E0B" : "rgba(255,255,255,0.7)" }}>
            {muted ? <BellOff size={14} /> : <Bell size={14} />}
          </button>
          <button onClick={() => setShowOnline(!showOnline)} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: showOnline ? "#4ADE80" : "rgba(255,255,255,0.7)" }}>
            <Users size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        {showOnline && (
          <div style={{ width: 130, borderRight: isRTL ? "none" : "1px solid #16213A", borderLeft: isRTL ? "1px solid #16213A" : "none", background: "#0E1830", overflow: "auto", flexShrink: 0 }}>
            <button
              onClick={() => switchChannel("public")}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 12px", border: "none", cursor: "pointer", textAlign: "start", background: activeChannel === "public" ? "rgba(22,37,96,0.08)" : "transparent" }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 16, background: "linear-gradient(135deg, #162560, #4A90D9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Hash size={14} color="#FFF" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#E6EDF6", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t({ ar: "عام", en: "Public" })}</p>
              </div>
            </button>

            <div style={{ height: 1, background: "#233152", margin: "4px 12px" }} />

            {participants.map((email) => {
              const isAgent = email === AI_AGENT_EMAIL;
              const isOnline = isAgent ? true : onlineUsers.has(email);
              const isActive = activeChannel === email;
              return (
                <button
                  key={email}
                  onClick={() => switchChannel(email)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", cursor: "pointer", textAlign: "start", background: isActive ? "rgba(22,37,96,0.08)" : "transparent" }}
                >
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 16, background: isAgent ? "linear-gradient(135deg, #7C3AED, #4A90D9)" : `linear-gradient(135deg, ${emailToColor(email)}, ${emailToColor(email)}dd)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", fontSize: 12, fontWeight: 700 }}>
                      {isAgent ? <Bot size={16} /> : email.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, background: isOnline ? "#16A34A" : "#5C7196", border: "2px solid #0E1830" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: isAgent ? "#A78BFA" : "#E6EDF6", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {isAgent ? t({ ar: AI_AGENT_NAME_AR, en: AI_AGENT_NAME_EN }) : emailToName(email)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #16213A", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, background: "#16213A" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <Search size={12} style={{ position: "absolute", [isRTL ? "right" : "left"]: 8, top: "50%", transform: "translateY(-50%)", color: "#5C7196" }} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t({ ar: "بحث...", en: "Search..." })}
                style={{ width: "100%", padding: "6px 10px 6px 28px", borderRadius: 8, border: "1px solid #233152", fontSize: 11, outline: "none", background: "#0E1830", color: "#E6EDF6" }}
              />
            </div>
          </div>

          <div ref={messagesContainerRef} onScroll={handleScroll} style={{ flex: 1, overflow: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 4 }}>
            {loading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 24, height: 24, border: "3px solid #233152", borderTopColor: "#162560", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              </div>
            ) : filteredMessages.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
                <MessageCircle size={32} color="#5C7196" />
                <p style={{ fontSize: 13, color: "#5C7196", margin: 0 }}>{t({ ar: "ابدأ المحادثة!", en: "Start the conversation!" })}</p>
              </div>
            ) : (
              filteredMessages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} isOwn={msg.sender_email === currentUser} isRTL={isRTL} lang={lang} onEdit={handleEdit} onDelete={handleDelete} onArchive={handleArchive} isArchivedView={showArchive} onDownload={handleDownload} />
              ))
            )}

            {agentTyping && (
              <div className="flex w-full" style={{ justifyContent: isRTL ? "flex-end" : "flex-start", marginBottom: 4 }}>
                <div style={{ background: "linear-gradient(135deg, #7C3AED22, #4A90D922)", border: "1px solid #7C3AED33", borderRadius: "16px 16px 16px 4px", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  <Bot size={14} color="#7C3AED" />
                  <span style={{ fontSize: 10, color: "#7C3AED", fontWeight: 500 }}>{t({ ar: "المساعد يكتب...", en: "Assistant typing..." })}</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid #16213A", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, background: "#16213A" }}>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.doc,.png,.jpg,.jpeg,.gif,.txt" onChange={handleFileSend} style={{ display: "none" }} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "#16213A", color: "#8CA3C1", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {uploading ? <div style={{ width: 14, height: 14, border: "2px solid #233152", borderTopColor: "#162560", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> : <Paperclip size={16} />}
            </button>
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={t({ ar: "اكتب رسالة...", en: "Type a message..." })}
              style={{ flex: 1, padding: "8px 14px", borderRadius: 12, border: "1px solid #233152", fontSize: 13, outline: "none", background: "#0E1830", color: "#E6EDF6" }}
            />
            <button onClick={handleSend} disabled={!inputText.trim()} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: inputText.trim() ? "linear-gradient(135deg, #162560, #4A90D9)" : "#233152", color: inputText.trim() ? "#FFF" : "#5C7196", cursor: inputText.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Send size={14} style={{ transform: isRTL ? "scaleX(-1)" : "none" }} />
            </button>
          </div>
        </div>
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