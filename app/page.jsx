"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "playcraft.mode.switch.v1";
const MAX_TEXT_FILE = 20000;
const MAX_IMAGE_SIDE = 1280;
const IMAGE_QUALITY = 0.82;

const initialState = {
  theme: "light",
  projects: [],
  chats: [],
  activeChatId: null,
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function createChat({ projectId = null, mode = "chat", title = "New chat" } = {}) {
  return {
    id: uid(),
    projectId,
    title,
    mode,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: [],
  };
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function summarizeChat(messages) {
  const source = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content || "")
    .join(" ")
    .toLowerCase();

  const original = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content || "")
    .join(" ");

  const words = original
    .replace(/[.,/#!$%^&*;:{}=\-_`~()\[\]<>?"'\\|]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => w.length > 1)
    .filter(
      (w) =>
        ![
          "the",
          "and",
          "for",
          "with",
          "that",
          "this",
          "you",
          "your",
          "from",
          "של",
          "עם",
          "זה",
          "אני",
          "את",
          "הוא",
          "היא",
          "אבל",
          "כזה",
          "יותר",
          "וגם",
          "שזה",
          "יהיה",
        ].includes(w.toLowerCase())
    );

  const freq = new Map();
  for (const word of words) freq.set(word, (freq.get(word) || 0) + 1);
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([w]) => w);

  if (/wordle|וורדל/.test(source)) return "Wordle game";
  if (/esp32|arduino/.test(source)) return "ESP32 / Arduino";
  if (/snake|סנייק/.test(source)) return "Snake game";
  if (/image|תמונה|ציור/.test(source)) return "Image creation";
  if (/study|learn|ללמוד|לימוד/.test(source)) return "Study and learn";
  if (/game|משחק/.test(source) && top.length) return top.slice(0, 2).join(" ");
  if (top.length) return top.slice(0, 3).join(" ");
  return "New chat";
}

function codeSegments(text) {
  const src = text || "";
  const parts = src.split(/```/);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i]) out.push({ type: "text", content: parts[i] });
    } else {
      const block = parts[i];
      const nl = block.indexOf("\n");
      const lang = nl === -1 ? "" : block.slice(0, nl).trim();
      const code = nl === -1 ? block : block.slice(nl + 1);
      out.push({ type: "code", lang, content: code });
    }
  }
  return out.length ? out : [{ type: "text", content: src }];
}

function renderTextBlock(text) {
  const safe = escapeHtml(text || "");
  const lines = safe.split("\n");
  const chunks = [];
  let list = [];

  const flushList = () => {
    if (!list.length) return;
    chunks.push(`<ul>${list.map((i) => `<li>${i}</li>`).join("")}</ul>`);
    list = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      chunks.push("<div class='pc-gap'></div>");
      continue;
    }
    if (/^[-*•]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^[-*•]\s+/, ""));
      continue;
    }
    flushList();
    if (/^#{1,3}\s+/.test(trimmed)) {
      const level = Math.min((trimmed.match(/^#+/) || [""])[0].length, 3);
      chunks.push(`<h${level}>${trimmed.replace(/^#{1,3}\s+/, "")}</h${level}>`);
    } else {
      chunks.push(`<p>${trimmed}</p>`);
    }
  }
  flushList();
  return chunks.join("");
}

function CodeBlock({ code, lang }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code || "");
    } catch {}
  };
  return (
    <div className="pc-code-wrap">
      <div className="pc-code-top">
        <span>{lang || "code"}</span>
        <button onClick={copy}>Copy</button>
      </div>
      <pre className="pc-code"><code>{code}</code></pre>
    </div>
  );
}

function MessageBody({ text }) {
  const segments = codeSegments(text);
  return (
    <div className="pc-body">
      {segments.map((seg, idx) =>
        seg.type === "code" ? (
          <CodeBlock key={idx} code={seg.content} lang={seg.lang} />
        ) : (
          <div key={idx} className="pc-rich" dangerouslySetInnerHTML={{ __html: renderTextBlock(seg.content) }} />
        )
      )}
    </div>
  );
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunk));
  }
  return btoa(binary);
}

async function imageFileToPayload(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });

  const ratio = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * ratio));
  canvas.height = Math.max(1, Math.round(img.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const outUrl = canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
  return {
    kind: "image",
    name: file.name,
    mime: "image/jpeg",
    dataUrl: outUrl,
    base64: outUrl.split(",")[1],
  };
}

async function textFileToPayload(file) {
  const text = await file.text();
  return {
    kind: "text",
    name: file.name,
    mime: file.type || "text/plain",
    text: text.slice(0, MAX_TEXT_FILE),
    truncated: text.length > MAX_TEXT_FILE,
  };
}

async function filesToPayload(fileList) {
  const list = Array.from(fileList || []);
  const out = [];
  for (const file of list) {
    if ((file.type || "").startsWith("image/")) out.push(await imageFileToPayload(file));
    else out.push(await textFileToPayload(file));
  }
  return out;
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v4" />
      <path d="M8 22h8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function WandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7 21 3-3" />
      <path d="m16 5 3-3" />
      <path d="M3 7h4" />
      <path d="M17 21h4" />
      <path d="m12 3 1 3" />
      <path d="m12 18 1 3" />
      <path d="m7 17 10-10" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function ModeBadge({ mode }) {
  const label = mode === "study" ? "Study" : mode === "image" ? "Image" : mode === "build" ? "Build" : "Chat";
  const icon = mode === "study" ? <BookIcon /> : mode === "image" ? <ImageIcon /> : mode === "build" ? <WandIcon /> : <ChatIcon />;
  return <span className="pc-mode-badge">{icon}<span>{label}</span></span>;
}

function FileCard({ file }) {
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    if (!file?.content) return;
    const blob = new Blob([file.content], { type: file.mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const openWeb = () => {
    if (!blobUrl) return;
    window.open(blobUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="pc-file-card">
      <div className="pc-file-head">
        <div className="pc-file-name"><FileIcon /> <span>{file.name}</span></div>
      </div>
      <div className="pc-file-actions">
        <button onClick={openWeb}>Open in web</button>
        <a href={blobUrl || undefined} download={file.name}>Download</a>
      </div>
    </div>
  );
}

function App() {
  const hydrated = useRef(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const plusMenuRef = useRef(null);
  const modeMenuRef = useRef(null);
  const recognitionRef = useRef(null);
  const autoSendAfterVoiceRef = useRef(false);
  const messagesBottomRef = useRef(null);

  const [state, setState] = useState(initialState);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("chat");
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setState(parsed);
        const active = parsed.chats.find((c) => c.id === parsed.activeChatId);
        if (active?.mode) setMode(active.mode);
      } else {
        const starter = createChat();
        setState({ ...initialState, chats: [starter], activeChatId: starter.id });
      }
    } catch {
      const starter = createChat();
      setState({ ...initialState, chats: [starter], activeChatId: starter.id });
    } finally {
      hydrated.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    const onDown = (e) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target)) setPlusOpen(false);
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target)) setModeOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    messagesBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.activeChatId, state.chats]);

  const activeChat = useMemo(() => state.chats.find((c) => c.id === state.activeChatId) || null, [state]);

  useEffect(() => {
    if (activeChat?.mode) setMode(activeChat.mode);
  }, [activeChat?.id]);

  const chats = useMemo(() => state.chats.filter((c) => !c.projectId), [state.chats]);
  const projects = state.projects;

  const toggleTheme = () => {
    setState((prev) => ({ ...prev, theme: prev.theme === "light" ? "dark" : "light" }));
  };

  const createNewChat = (projectId = null, presetMode = "chat") => {
    const chat = createChat({ projectId, mode: presetMode });
    setState((prev) => ({
      ...prev,
      chats: [chat, ...prev.chats],
      activeChatId: chat.id,
    }));
    setSelectedProjectId(projectId);
    setMode(presetMode);
    setInput("");
    setAttachments([]);
    setPlusOpen(false);
    setModeOpen(false);
  };

  const addProject = () => {
    const name = window.prompt("Project name")?.trim();
    if (!name) return;
    const project = { id: uid(), name, createdAt: nowIso() };
    setState((prev) => ({ ...prev, projects: [project, ...prev.projects] }));
    setSelectedProjectId(project.id);
    setPlusOpen(false);
  };

  const deleteProject = (projectId) => {
    const ok = window.confirm("Delete this project and its chats?");
    if (!ok) return;
    setState((prev) => {
      const remainingChats = prev.chats.filter((c) => c.projectId !== projectId);
      const stillActive = remainingChats.find((c) => c.id === prev.activeChatId);
      let activeChatId = prev.activeChatId;
      if (!stillActive) activeChatId = remainingChats[0]?.id || null;
      if (!activeChatId) {
        const starter = createChat();
        return {
          ...prev,
          projects: prev.projects.filter((p) => p.id !== projectId),
          chats: [starter, ...remainingChats],
          activeChatId: starter.id,
        };
      }
      return {
        ...prev,
        projects: prev.projects.filter((p) => p.id !== projectId),
        chats: remainingChats,
        activeChatId,
      };
    });
    if (selectedProjectId === projectId) setSelectedProjectId(null);
  };

  const deleteChat = (chatId) => {
    setState((prev) => {
      const remaining = prev.chats.filter((c) => c.id !== chatId);
      let activeChatId = prev.activeChatId;
      if (prev.activeChatId === chatId) activeChatId = remaining[0]?.id || null;
      if (!activeChatId) {
        const starter = createChat();
        return { ...prev, chats: [starter, ...remaining], activeChatId: starter.id };
      }
      return { ...prev, chats: remaining, activeChatId };
    });
  };

  const selectChat = (chatId) => {
    const chat = state.chats.find((c) => c.id === chatId);
    if (!chat) return;
    setState((prev) => ({ ...prev, activeChatId: chatId }));
    setMode(chat.mode || "chat");
    setSelectedProjectId(chat.projectId || null);
  };

  const setChatMode = (nextMode) => {
    setMode(nextMode);
    setState((prev) => ({
      ...prev,
      chats: prev.chats.map((c) => (c.id === prev.activeChatId ? { ...c, mode: nextMode } : c)),
    }));
    setModeOpen(false);
  };

  const applyTyping = async (fullText, update) => {
    const finalText = fullText || "";
    let current = "";
    for (const ch of finalText) {
      current += ch;
      update(current);
      await new Promise((r) => setTimeout(r, finalText.length > 1600 ? 2 : 8));
    }
  };

  const send = async () => {
    if (loading || !activeChat) return;
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    const userMessage = {
      id: uid(),
      role: "user",
      content: text,
      files: attachments,
      createdAt: nowIso(),
    };

    const assistantId = uid();
    const assistantMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      pending: true,
      createdAt: nowIso(),
      files: [],
      imageUrl: "",
    };

    const outgoingChat = activeChat;
    const nextMessages = [...outgoingChat.messages, userMessage, assistantMessage];

    setState((prev) => ({
      ...prev,
      chats: prev.chats.map((c) => (c.id === outgoingChat.id ? { ...c, messages: nextMessages, updatedAt: nowIso() } : c)),
    }));

    setLoading(true);
    setInput("");
    setAttachments([]);

    try {
      const resp = await fetch("/api/playcraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          messages: outgoingChat.messages
            .filter((m) => !m.pending)
            .concat(userMessage)
            .map((m) => ({
              role: m.role,
              text: m.content,
              mode,
              files: (m.files || []).map((f) => ({
                kind: f.kind,
                mime: f.mime,
                base64: f.base64,
                text: f.text,
                name: f.name,
                truncated: f.truncated,
              })),
            })),
        }),
      });

      const data = await resp.json();
      const replyText = data?.text || data?.error || "Something went wrong.";
      const replyFiles = data?.files || [];
      const imageUrl = data?.imageUrl || "";

      await applyTyping(replyText, (partial) => {
        setState((prev) => ({
          ...prev,
          chats: prev.chats.map((c) => {
            if (c.id !== outgoingChat.id) return c;
            const updatedMessages = c.messages.map((m) =>
              m.id === assistantId ? { ...m, content: partial, pending: true } : m
            );
            return { ...c, messages: updatedMessages };
          }),
        }));
      });

      setState((prev) => ({
        ...prev,
        chats: prev.chats.map((c) => {
          if (c.id !== outgoingChat.id) return c;
          const updatedMessages = c.messages.map((m) =>
            m.id === assistantId ? { ...m, content: replyText, pending: false, files: replyFiles, imageUrl } : m
          );
          const title = summarizeChat(updatedMessages);
          return { ...c, messages: updatedMessages, updatedAt: nowIso(), title };
        }),
      }));
    } catch (err) {
      const msg = `⚠️ ${err?.message || "Request failed"}`;
      setState((prev) => ({
        ...prev,
        chats: prev.chats.map((c) => {
          if (c.id !== outgoingChat.id) return c;
          const updatedMessages = c.messages.map((m) =>
            m.id === assistantId ? { ...m, content: msg, pending: false } : m
          );
          return { ...c, messages: updatedMessages, updatedAt: nowIso() };
        }),
      }));
    } finally {
      setLoading(false);
    }
  };

  const toggleVoice = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Voice input is not supported in this browser.");
      return;
    }

    if (recording && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const rec = new SpeechRec();
    recognitionRef.current = rec;
    rec.lang = /[\u0590-\u05FF]/.test(input) ? "he-IL" : "he-IL";
    rec.interimResults = true;
    rec.continuous = false;
    autoSendAfterVoiceRef.current = !input.trim();

    rec.onstart = () => setRecording(true);
    rec.onend = () => {
      setRecording(false);
      if (autoSendAfterVoiceRef.current && inputRef.current?.value?.trim()) {
        setTimeout(() => send(), 150);
      }
    };
    rec.onerror = () => setRecording(false);
    rec.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0]?.transcript || "")
        .join(" ");
      setInput(transcript.trim());
      if (inputRef.current) inputRef.current.value = transcript.trim();
    };
    rec.start();
  };

  const onDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const files = await filesToPayload(e.dataTransfer.files);
    setAttachments((prev) => [...prev, ...files]);
  };

  const addFiles = async (fileList) => {
    const files = await filesToPayload(fileList);
    setAttachments((prev) => [...prev, ...files]);
    setPlusOpen(false);
  };

  const themeClass = state.theme === "dark" ? "pc-dark" : "pc-light";

  return (
    <div className={`pc-app ${themeClass}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <style>{`
        :root{--bg:#eef4ff;--bg2:#fff7ee;--panel:#ffffffd8;--panel-2:#ffffff;--text:#223055;--muted:#7180a0;--border:#d8def1;--accent:#7c5cff;--accent-2:#ffb770;--shadow:0 20px 50px rgba(75,95,160,.12);--bubble-user:#7c5cff;--bubble-user-text:#fff;--bubble-ai:#ffffff;--bubble-ai-text:#203157;--soft:#eef0ff}
        .pc-dark{--bg:#111320;--bg2:#15192b;--panel:#171c2be0;--panel-2:#1a2133;--text:#f4f7ff;--muted:#a6b1cc;--border:#2b3349;--accent:#8b72ff;--accent-2:#f7b46a;--shadow:0 20px 50px rgba(0,0,0,.35);--bubble-user:#8b72ff;--bubble-user-text:#fff;--bubble-ai:#1b2235;--bubble-ai-text:#f1f5ff;--soft:#232c45}
        *{box-sizing:border-box} body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;background:linear-gradient(135deg,var(--bg2),var(--bg));color:var(--text)}
        .pc-app{height:100vh;display:flex;background:linear-gradient(135deg,var(--bg2),var(--bg));color:var(--text)}
        .pc-sidebar{width:335px;border-right:1px solid var(--border);padding:18px;display:flex;flex-direction:column;gap:16px;background:rgba(255,255,255,.28);backdrop-filter:blur(14px)}
        .pc-dark .pc-sidebar{background:rgba(17,19,32,.6)}
        .pc-brand{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .pc-brand h1{margin:0;font-size:26px;line-height:1}.pc-brand p{margin:4px 0 0;color:var(--muted);font-size:14px}
        .pc-logo{width:52px;height:52px;border-radius:18px;background:linear-gradient(135deg,var(--accent-2),#ffe39b);display:grid;place-items:center;box-shadow:var(--shadow);font-size:22px}
        .pc-icon-btn,.pc-action,.pc-theme-btn,.pc-send,.pc-mic,.pc-plus,.pc-menu button,.pc-card button,.pc-delete{border:none;cursor:pointer}
        .pc-action{display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:20px;font-weight:800;font-size:18px;box-shadow:var(--shadow);transition:.18s transform,.18s opacity}
        .pc-action:hover,.pc-card:hover{transform:translateY(-1px)}
        .pc-primary{background:linear-gradient(135deg,var(--accent),#9c7dff);color:#fff}.pc-secondary{background:var(--panel);color:var(--text);border:1px solid var(--border)}
        .pc-card{background:var(--panel);border:1px solid var(--border);padding:16px;border-radius:24px;display:flex;gap:12px;align-items:flex-start;box-shadow:var(--shadow);cursor:pointer}
        .pc-card-icon{width:40px;height:40px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#ffe0b2,var(--accent-2));color:#6a4100;flex:none}
        .pc-card strong{display:block;font-size:18px}.pc-card span{display:block;color:var(--muted);font-size:14px;margin-top:4px}
        .pc-section-title{display:flex;align-items:center;gap:8px;color:var(--muted);font-weight:900;letter-spacing:.08em;text-transform:uppercase;font-size:12px;margin-top:4px}
        .pc-list{display:flex;flex-direction:column;gap:10px;min-height:0}
        .pc-item,.pc-project-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:18px;border:1px solid transparent;background:transparent;color:var(--text)}
        .pc-item:hover,.pc-project-head:hover{background:var(--panel)}
        .pc-item.active{background:linear-gradient(135deg,rgba(124,92,255,.14),rgba(255,183,112,.18));border-color:rgba(124,92,255,.22)}
        .pc-item-main{display:flex;align-items:center;gap:10px;flex:1;min-width:0}.pc-item-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700}
        .pc-item-sub{color:var(--muted);font-size:12px}
        .pc-delete{background:transparent;color:var(--muted);width:28px;height:28px;border-radius:10px;display:grid;place-items:center}
        .pc-delete:hover{background:rgba(255,95,95,.12);color:#e05f5f}
        .pc-project-body{padding-inline-start:12px;display:flex;flex-direction:column;gap:8px;margin-top:8px}
        .pc-project-empty{padding:14px;border:1px dashed var(--border);border-radius:18px;color:var(--muted);font-size:14px}
        .pc-main{flex:1;display:flex;flex-direction:column;min-width:0}
        .pc-header{height:72px;padding:18px 26px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.14);backdrop-filter:blur(10px)}
        .pc-dark .pc-header{background:rgba(17,19,32,.35)}
        .pc-header h2{margin:0;font-size:28px}.pc-header small{display:block;color:var(--muted);margin-top:4px}
        .pc-theme-btn{width:42px;height:42px;border-radius:14px;background:var(--panel);color:var(--text);border:1px solid var(--border);display:grid;place-items:center;box-shadow:var(--shadow)}
        .pc-messages{flex:1;overflow:auto;padding:28px 30px 180px}
        .pc-thread{max-width:1020px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
        .pc-msg{display:flex;gap:14px}.pc-msg.user{justify-content:flex-end}.pc-avatar{width:52px;height:52px;border-radius:20px;display:grid;place-items:center;background:var(--panel);border:1px solid var(--border);box-shadow:var(--shadow);font-weight:900;flex:none}
        .pc-msg.user .pc-avatar{order:2;background:linear-gradient(135deg,var(--accent),#9c7dff);color:#fff;border:none}
        .pc-bubble{max-width:min(78vw,840px);padding:20px 22px;border-radius:28px;background:var(--bubble-ai);color:var(--bubble-ai-text);box-shadow:var(--shadow);border:1px solid var(--border)}
        .pc-msg.user .pc-bubble{background:linear-gradient(135deg,var(--bubble-user),#9a79ff);color:var(--bubble-user-text);border:none}
        .pc-body{display:flex;flex-direction:column;gap:14px}.pc-rich p,.pc-rich li{margin:0;font-size:18px;line-height:1.7}.pc-rich h1,.pc-rich h2,.pc-rich h3{margin:0 0 6px;font-size:20px}
        .pc-rich ul{margin:0;padding-inline-start:22px;display:flex;flex-direction:column;gap:8px}.pc-gap{height:4px}
        .pc-code-wrap{background:rgba(17,24,39,.96);border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.08)}
        .pc-code-top{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;color:#dce4ff;background:rgba(255,255,255,.06);font-size:12px;text-transform:uppercase;letter-spacing:.08em}
        .pc-code-top button{background:rgba(255,255,255,.12);color:#fff;border:none;border-radius:10px;padding:6px 10px;cursor:pointer}
        .pc-code{margin:0;padding:16px;overflow:auto;max-height:360px;color:#f7f7fb;font-size:14px;line-height:1.6}
        .pc-files{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}.pc-file-card{min-width:220px;max-width:100%;background:var(--panel-2);border:1px solid var(--border);padding:14px;border-radius:20px;box-shadow:var(--shadow)}
        .pc-file-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.pc-file-name{display:flex;align-items:center;gap:8px;font-weight:800}
        .pc-file-actions{display:flex;gap:10px;margin-top:12px}.pc-file-actions button,.pc-file-actions a{background:linear-gradient(135deg,var(--accent),#9b7cff);color:#fff;border:none;border-radius:12px;padding:10px 14px;text-decoration:none;font-weight:800}
        .pc-inline-img{max-width:min(100%,560px);border-radius:20px;border:1px solid var(--border);box-shadow:var(--shadow);display:block;margin-top:12px}
        .pc-composer-wrap{position:sticky;bottom:0;padding:18px 26px 22px;background:linear-gradient(180deg,transparent,rgba(255,255,255,.7) 18%,rgba(255,255,255,.88));backdrop-filter:blur(10px)}
        .pc-dark .pc-composer-wrap{background:linear-gradient(180deg,transparent,rgba(17,19,32,.78) 18%,rgba(17,19,32,.94))}
        .pc-composer{max-width:1040px;margin:0 auto;background:var(--panel);border:1px solid var(--border);box-shadow:var(--shadow);border-radius:34px;padding:16px;display:flex;align-items:flex-end;gap:14px;position:relative}
        .pc-plus,.pc-mic,.pc-send,.pc-mode-switch{flex:none}.pc-plus,.pc-mic,.pc-send{width:66px;height:66px;border-radius:24px;display:grid;place-items:center}
        .pc-plus{background:linear-gradient(135deg,#ffb26b,#ffcf96);color:#4d2d00}
        .pc-mic{background:var(--soft);color:var(--text);border:1px solid var(--border)}
        .pc-mic.recording{background:linear-gradient(135deg,#ff7b7b,#ffb3b3);color:#fff;border:none}
        .pc-send{background:linear-gradient(135deg,var(--accent),#9b7cff);color:#fff}
        .pc-input-col{flex:1;display:flex;flex-direction:column;gap:10px;min-width:0}
        .pc-textarea{width:100%;min-height:84px;max-height:220px;resize:none;border:none;outline:none;background:transparent;color:var(--text);font-size:22px;line-height:1.5;padding:6px 2px}
        .pc-textarea::placeholder{color:var(--muted)}
        .pc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .pc-mode-switch{border:none;background:var(--soft);color:var(--text);border-radius:18px;padding:12px 16px;display:flex;align-items:center;gap:10px;font-weight:900;cursor:pointer;border:1px solid var(--border)}
        .pc-mode-badge{display:inline-flex;align-items:center;gap:8px}
        .pc-attach-row{display:flex;gap:8px;flex-wrap:wrap}.pc-chip{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:var(--soft);border:1px solid var(--border);font-size:13px}
        .pc-chip button{background:transparent;border:none;color:var(--muted);cursor:pointer}
        .pc-menu{position:absolute;bottom:90px;left:18px;min-width:240px;background:var(--panel-2);border:1px solid var(--border);box-shadow:var(--shadow);border-radius:22px;padding:8px;display:flex;flex-direction:column;gap:4px;z-index:20}
        .pc-menu.right{left:auto;right:168px}.pc-menu button{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:16px;background:transparent;color:var(--text);text-align:left;font-weight:800}
        .pc-menu button:hover{background:var(--soft)}
        .pc-drop{position:fixed;inset:0;background:rgba(124,92,255,.12);display:grid;place-items:center;z-index:30;pointer-events:none}.pc-drop-card{background:var(--panel-2);padding:28px 34px;border-radius:28px;border:2px dashed var(--accent);box-shadow:var(--shadow);font-weight:900;font-size:24px}
        @media (max-width:1100px){.pc-sidebar{width:300px}.pc-textarea{font-size:18px}}
        @media (max-width:900px){.pc-sidebar{display:none}.pc-messages{padding-inline:14px}.pc-composer-wrap{padding-inline:12px}.pc-header{padding-inline:14px}.pc-bubble{max-width:100%}.pc-plus,.pc-mic,.pc-send{width:58px;height:58px}}
      `}</style>

      {dragging && (
        <div className="pc-drop"><div className="pc-drop-card">Drop files or screenshots here</div></div>
      )}

      <aside className="pc-sidebar">
        <div className="pc-brand">
          <div>
            <h1>Playcraft</h1>
            <p>smart chat, code, games, study, images</p>
          </div>
          <div className="pc-logo">✨</div>
        </div>

        <button className="pc-action pc-primary" onClick={() => createNewChat(selectedProjectId, "chat")}><ChatIcon /> New chat</button>
        <button className="pc-action pc-secondary" onClick={addProject}><FolderIcon /> Add project</button>

        <div className="pc-card" onClick={() => setChatMode("image")}>
          <div className="pc-card-icon"><ImageIcon /></div>
          <div><strong>Create image</strong><span>Generate an image from a prompt</span></div>
        </div>
        <div className="pc-card" onClick={() => setChatMode("study")}>
          <div className="pc-card-icon"><BookIcon /></div>
          <div><strong>Study and learn</strong><span>Ask to learn any topic clearly</span></div>
        </div>

        <div className="pc-section-title"><ChatIcon /> <span>Chats</span></div>
        <div className="pc-list" style={{ maxHeight: 250, overflow: "auto" }}>
          {chats.map((chat) => (
            <button key={chat.id} className={`pc-item ${chat.id === state.activeChatId ? "active" : ""}`} onClick={() => selectChat(chat.id)}>
              <div className="pc-item-main">
                <ChatIcon />
                <div style={{ minWidth: 0 }}>
                  <div className="pc-item-title">{chat.title || "New chat"}</div>
                  <div className="pc-item-sub">{chat.mode || "chat"}</div>
                </div>
              </div>
              <span className="pc-delete" onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}><TrashIcon /></span>
            </button>
          ))}
        </div>

        <div className="pc-section-title"><FolderIcon /> <span>Projects</span></div>
        <div className="pc-list" style={{ overflow: "auto" }}>
          {projects.length === 0 ? (
            <div className="pc-project-empty">No projects yet. Tap <b>Add project</b> when you want one.</div>
          ) : projects.map((project) => {
            const projectChats = state.chats.filter((c) => c.projectId === project.id);
            const open = selectedProjectId === project.id;
            return (
              <div key={project.id}>
                <div className="pc-project-head" onClick={() => setSelectedProjectId(open ? null : project.id)}>
                  <div className="pc-item-main"><FolderIcon /><div className="pc-item-title">{project.name}</div></div>
                  <button className="pc-delete" onClick={(e) => { e.stopPropagation(); createNewChat(project.id, "chat"); }}>+</button>
                  <button className="pc-delete" onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}><TrashIcon /></button>
                </div>
                {open && (
                  <div className="pc-project-body">
                    {projectChats.length === 0 ? <div className="pc-project-empty">No chats yet in this project.</div> : projectChats.map((chat) => (
                      <button key={chat.id} className={`pc-item ${chat.id === state.activeChatId ? "active" : ""}`} onClick={() => selectChat(chat.id)}>
                        <div className="pc-item-main"><ChatIcon /><div className="pc-item-title">{chat.title || "New chat"}</div></div>
                        <span className="pc-delete" onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}><TrashIcon /></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <main className="pc-main">
        <div className="pc-header">
          <div>
            <h2>{activeChat?.title || "New chat"}</h2>
            <small>{mode === "study" ? "Study mode" : mode === "image" ? "Image mode" : mode === "build" ? "Build mode" : "Chat mode"}</small>
          </div>
          <button className="pc-theme-btn" onClick={toggleTheme}>{state.theme === "light" ? <MoonIcon /> : <SunIcon />}</button>
        </div>

        <div className="pc-messages">
          <div className="pc-thread">
            {(activeChat?.messages || []).map((msg) => (
              <div key={msg.id} className={`pc-msg ${msg.role === "user" ? "user" : "assistant"}`}>
                <div className="pc-avatar">{msg.role === "user" ? "U" : "AI"}</div>
                <div className="pc-bubble">
                  <MessageBody text={msg.content || (msg.pending ? "Typing..." : "")} />
                  {(msg.files?.length || 0) > 0 && <div className="pc-files">{msg.files.map((file, i) => <FileCard key={i} file={file} />)}</div>}
                  {msg.imageUrl ? <img src={msg.imageUrl} alt="Generated" className="pc-inline-img" /> : null}
                </div>
              </div>
            ))}
            <div ref={messagesBottomRef} />
          </div>
        </div>

        <div className="pc-composer-wrap">
          <div className="pc-composer">
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />

            <div ref={plusMenuRef}>
              <button className="pc-plus" onClick={() => setPlusOpen((v) => !v)}><PlusIcon /></button>
              {plusOpen && (
                <div className="pc-menu">
                  <button onClick={() => fileInputRef.current?.click()}><FileIcon /> Add file</button>
                  <button onClick={() => { setChatMode("study"); setPlusOpen(false); }}><BookIcon /> Study and learn</button>
                  <button onClick={() => { setChatMode("image"); setPlusOpen(false); }}><ImageIcon /> Create image</button>
                  <button onClick={() => { addProject(); }}><FolderIcon /> Add project</button>
                  <button onClick={() => createNewChat(selectedProjectId, "chat")}><ChatIcon /> New chat</button>
                </div>
              )}
            </div>

            <div className="pc-input-col">
              <textarea
                ref={inputRef}
                className="pc-textarea"
                placeholder={mode === "image" ? "Describe the image you want..." : mode === "study" ? "Ask what you want to learn..." : mode === "build" ? "Ask to build a game, app, or code project..." : "Ask anything, drag files, or tap the mic and speak..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              {attachments.length > 0 && (
                <div className="pc-attach-row">
                  {attachments.map((f, i) => (
                    <div key={i} className="pc-chip">
                      {f.kind === "image" ? <ImageIcon /> : <FileIcon />}<span>{f.name}</span>
                      <button onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="pc-toolbar">
                <div ref={modeMenuRef} style={{ position: "relative" }}>
                  <button className="pc-mode-switch" onClick={() => setModeOpen((v) => !v)}><ModeBadge mode={mode} /></button>
                  {modeOpen && (
                    <div className="pc-menu right">
                      <button onClick={() => setChatMode("chat")}><ChatIcon /> Chat</button>
                      <button onClick={() => setChatMode("study")}><BookIcon /> Study and learn</button>
                      <button onClick={() => setChatMode("image")}><ImageIcon /> Create image</button>
                      <button onClick={() => setChatMode("build")}><WandIcon /> Build</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button className={`pc-mic ${recording ? "recording" : ""}`} onClick={toggleVoice}><MicIcon /></button>
            <button className="pc-send" onClick={send} disabled={loading}><SendIcon /></button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
