"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "playcraft.stable.v1";
const MAX_TEXT_FILE_CHARS = 70000;
const MAX_IMAGE_EDGE = 1280;
const MAX_ATTACHMENT_COUNT = 6;

const uid = () => Math.random().toString(36).slice(2, 10);
const nowIso = () => new Date().toISOString();

const THEMES = {
  light: {
    name: "Light",
    vars: {
      "--bg": "#f7f8fc",
      "--sidebar": "#ffffff",
      "--panel": "#ffffff",
      "--panel-2": "#f2f5fb",
      "--border": "#e5e9f3",
      "--text": "#172033",
      "--muted": "#66748f",
      "--soft": "#9aa6bd",
      "--shadow": "0 18px 40px rgba(23,32,51,.08)",
      "--user": "#e9efff",
      "--assistant": "#ffffff",
      "--bg-gradient": "radial-gradient(circle at top left, rgba(109,94,252,.10), transparent 30%), radial-gradient(circle at right top, rgba(255,122,89,.08), transparent 22%), #f7f8fc",
    },
  },
  dark: {
    name: "Dark",
    vars: {
      "--bg": "#0d1220",
      "--sidebar": "#11192b",
      "--panel": "#131d31",
      "--panel-2": "#17233a",
      "--border": "#27324b",
      "--text": "#ecf3ff",
      "--muted": "#93a0b6",
      "--soft": "#6e7a91",
      "--shadow": "0 22px 56px rgba(0,0,0,.28)",
      "--user": "#203761",
      "--assistant": "#162238",
      "--bg-gradient": "radial-gradient(circle at top left, rgba(109,94,252,.18), transparent 30%), radial-gradient(circle at right top, rgba(34,197,94,.09), transparent 22%), #0d1220",
    },
  },
  peach: {
    name: "Peach",
    vars: {
      "--bg": "#fff7f3",
      "--sidebar": "#ffffff",
      "--panel": "#ffffff",
      "--panel-2": "#fff0e7",
      "--border": "#ffd9c5",
      "--text": "#3c271e",
      "--muted": "#8b6759",
      "--soft": "#bc8f7a",
      "--shadow": "0 18px 40px rgba(97,55,32,.10)",
      "--user": "#ffe8da",
      "--assistant": "#fffdfb",
      "--bg-gradient": "radial-gradient(circle at top left, rgba(255,122,89,.16), transparent 26%), radial-gradient(circle at right top, rgba(245,158,11,.08), transparent 18%), #fff7f3",
    },
  },
  mint: {
    name: "Mint",
    vars: {
      "--bg": "#f2fffb",
      "--sidebar": "#ffffff",
      "--panel": "#ffffff",
      "--panel-2": "#ecfdf6",
      "--border": "#cdeee0",
      "--text": "#13342d",
      "--muted": "#5f8b7f",
      "--soft": "#82ad9f",
      "--shadow": "0 18px 40px rgba(19,52,45,.08)",
      "--user": "#ddf8ed",
      "--assistant": "#ffffff",
      "--bg-gradient": "radial-gradient(circle at top left, rgba(16,185,129,.14), transparent 26%), radial-gradient(circle at right top, rgba(14,165,233,.08), transparent 18%), #f2fffb",
    },
  },
};

const ACCENTS = [
  { id: "violet", value: "#6d5efc", label: "Violet" },
  { id: "sky", value: "#0ea5e9", label: "Sky" },
  { id: "rose", value: "#ec4899", label: "Rose" },
  { id: "orange", value: "#ff7a59", label: "Orange" },
  { id: "green", value: "#22c55e", label: "Green" },
  { id: "amber", value: "#f59e0b", label: "Amber" },
];

const MODES = [
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "build", label: "Build", icon: "🛠️" },
  { id: "study", label: "Study and learn", icon: "📚" },
  { id: "image", label: "Create image", icon: "🖼️" },
  { id: "code", label: "Code", icon: "💻" },
  { id: "fix", label: "Fix code", icon: "🧰" },
  { id: "arduino", label: "Arduino / ESP32", icon: "🔌" },
];

const STUDY_MODES = [
  { id: "explain", label: "Explain simply" },
  { id: "quiz", label: "Quiz mode" },
  { id: "flashcards", label: "Flashcards" },
  { id: "questions", label: "Ask me questions" },
  { id: "file", label: "Study from file" },
];

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function createChat(overrides = {}) {
  return {
    id: uid(),
    title: "New chat",
    projectId: null,
    pinned: false,
    mode: "chat",
    studyMode: "explain",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: [],
    previewArtifactId: null,
    ...overrides,
  };
}

function createProject(name = "New project") {
  return {
    id: uid(),
    name,
    pinned: false,
    memory: "",
    stylePreset: "modern",
    fileLibrary: {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function defaultStore() {
  const chat = createChat();
  return {
    chats: [chat],
    projects: [],
    activeChatId: chat.id,
    theme: "light",
    accent: ACCENTS[0].value,
    search: "",
    splitView: true,
    inputLang: "auto",
  };
}

function hasHebrew(text) { return /[\u0590-\u05FF]/.test(text || ""); }
function inferLang(text) { return hasHebrew(text) ? "he-IL" : "en-US"; }

function applyTheme(themeId, accent) {
  const theme = THEMES[themeId] || THEMES.light;
  if (typeof document === "undefined") return;
  Object.entries(theme.vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-soft", `${accent}22`);
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    if (Number(b.pinned) !== Number(a.pinned)) return Number(b.pinned) - Number(a.pinned);
    return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
  });
}

function getChatSummary(messages) {
  const users = messages.filter((m) => m.role === "user").map((m) => (m.text || "").trim()).filter(Boolean);
  const last = users.slice(-2).join(" • ").replace(/\s+/g, " ").trim();
  if (!last) return "New chat";
  return last.length > 34 ? `${last.slice(0, 34).trim()}…` : last;
}

function parseBlocks(text) {
  const parts = [];
  const re = /```(\w+)?\n([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(text || "")) !== null) {
    if (m.index > last) parts.push({ type: "text", content: text.slice(last, m.index) });
    parts.push({ type: "code", lang: m[1] || "text", content: m[2] });
    last = re.lastIndex;
  }
  if (last < (text || "").length) parts.push({ type: "text", content: text.slice(last) });
  return parts.length ? parts : [{ type: "text", content: text || "" }];
}

async function resizeImage(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL("image/jpeg", 0.9);
  return { kind: "image", name: file.name, mime: "image/jpeg", dataUrl: out };
}

async function fileToAttachment(file) {
  if (file.type.startsWith("image/")) return resizeImage(file);
  const text = await file.text();
  return {
    kind: "text",
    name: file.name,
    mime: file.type || "text/plain",
    text: text.length > MAX_TEXT_FILE_CHARS ? `${text.slice(0, MAX_TEXT_FILE_CHARS)}\n\n[truncated]` : text,
  };
}

function blobUrlForArtifact(artifact) {
  if (!artifact?.content) return "";
  const type = artifact.type === "html" ? "text/html" : artifact.type === "json" ? "application/json" : artifact.type === "css" ? "text/css" : artifact.type === "js" ? "text/javascript" : "text/plain";
  const blob = new Blob([artifact.content], { type });
  return URL.createObjectURL(blob);
}

function downloadBlob(name, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function IconMic({ active = false }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 11a7 7 0 1 1-14 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
      <path d="M12 18v3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
      <path d="M9 21h6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
      {active ? <circle cx="19" cy="5" r="3" fill="var(--accent)" /> : null}
    </svg>
  );
}

function IconPlus() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function IconSearch() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/></svg>;
}
function IconSpark() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16ZM5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>;
}
function IconPin({ filled = false }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}><path d="m14 4 6 6-3 2v4l-2 2-3-5-4 4-2-2 4-4-5-3 2-2h4l2-3Z" stroke="currentColor" strokeWidth={filled ? 0 : 1.8} strokeLinejoin="round"/></svg>;
}
function IconFolder() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" stroke="currentColor" strokeWidth="1.7"/></svg>;
}
function IconChat() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 19 3 21V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-4 2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>;
}
function IconMoonSun() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" stroke="currentColor" strokeWidth="1.8"/></svg>;
}
function IconPalette() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 1 1 0-4h1.2A4.8 4.8 0 1 0 12 3Z" stroke="currentColor" strokeWidth="1.8"/><circle cx="7.5" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="7.5" r="1" fill="currentColor"/><circle cx="16.5" cy="10" r="1" fill="currentColor"/></svg>;
}
function IconStop() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>;
}
function IconSend() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M21 3 10 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="m21 3-7 18-4-7-7-4 18-7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>;
}

function MenuButton({ icon, label, onClick, active = false, subtle = false }) {
  return (
    <button className={`menuBtn ${active ? "active" : ""} ${subtle ? "subtle" : ""}`} onClick={onClick} type="button">
      <span className="menuIcon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function MessageBody({ text }) {
  const parts = parseBlocks(text || "");
  return (
    <div className="msgText">
      {parts.map((part, idx) => part.type === "code" ? (
        <div className="codeWrap" key={idx}>
          <div className="codeTop">{part.lang}</div>
          <pre><code>{part.content}</code></pre>
        </div>
      ) : (
        <div key={idx} style={{ whiteSpace: "pre-wrap" }}>{part.content}</div>
      ))}
    </div>
  );
}

function ArtifactCard({ artifact, onOpen, onDownload, compact = false }) {
  return (
    <div className={`artifactCard ${compact ? "compact" : ""}`}>
      <div>
        <div className="artifactName">{artifact.name || "file"}</div>
        <div className="artifactType">{artifact.type || "file"}</div>
      </div>
      <div className="artifactActions">
        <button type="button" onClick={onOpen}>Open in web</button>
        <button type="button" onClick={onDownload}>Download</button>
      </div>
    </div>
  );
}

export default function Page() {
  const hydrated = useRef(false);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const micRef = useRef(null);
  const abortRef = useRef(null);
  const typingTimerRef = useRef(null);
  const menuWrapRef = useRef(null);

  const [store, setStore] = useState(defaultStore());
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [menuOpen, setMenuOpen] = useState(null);
  const [loading, setLoading] = useState(false);
  const [typingId, setTypingId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [statusLabel, setStatusLabel] = useState("");
  const [toast, setToast] = useState("");
  const [dragging, setDragging] = useState(false);

  const activeChat = useMemo(() => store.chats.find((c) => c.id === store.activeChatId) || store.chats[0], [store]);
  const activeProject = useMemo(() => store.projects.find((p) => p.id === activeChat?.projectId) || null, [store.projects, activeChat]);

  useEffect(() => { applyTheme(store.theme, store.accent); }, [store.theme, store.accent]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? safeParse(raw) : null;
    if (parsed?.chats?.length) setStore(parsed);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  useEffect(() => {
    const handler = (e) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target)) setMenuOpen(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => () => {
    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    if (abortRef.current) abortRef.current.abort();
    try { micRef.current?.stop(); } catch {}
  }, []);

  const visibleProjects = useMemo(() => {
    const q = store.search.trim().toLowerCase();
    return sortItems(store.projects).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [store.projects, store.search]);

  const visibleChats = useMemo(() => {
    const q = store.search.trim().toLowerCase();
    return sortItems(store.chats).filter((c) => {
      if (!q) return true;
      if ((c.title || "").toLowerCase().includes(q)) return true;
      return c.messages.some((m) => (m.text || "").toLowerCase().includes(q));
    });
  }, [store.chats, store.search]);

  const projectChats = useMemo(() => activeProject ? sortItems(store.chats.filter((c) => c.projectId === activeProject.id)) : [], [store.chats, activeProject]);
  const generalChats = useMemo(() => visibleChats.filter((c) => !c.projectId), [visibleChats]);

  const showToast = useCallback((text) => {
    setToast(text);
    window.clearTimeout(showToast.t);
    showToast.t = window.setTimeout(() => setToast(""), 2400);
  }, []);
  
  const updateChat = useCallback((chatId, updater) => {
    setStore((prev) => ({
      ...prev,
      chats: prev.chats.map((c) => c.id === chatId ? { ...c, ...updater(c), updatedAt: nowIso() } : c),
    }));
  }, []);

  const smartScroll = useCallback((force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (force || nearBottom) bottomRef.current?.scrollIntoView({ behavior: force ? "smooth" : "auto", block: "end" });
  }, []);

  useEffect(() => { smartScroll(false); }, [activeChat?.messages?.length, smartScroll]);

  const createNewChat = useCallback((projectId = null, mode = "chat") => {
    const chat = createChat({ projectId, mode });
    setStore((prev) => ({
      ...prev,
      chats: [chat, ...prev.chats],
      activeChatId: chat.id,
      projects: prev.projects.map((p) => p.id === projectId ? { ...p, updatedAt: nowIso() } : p),
    }));
    setDraft("");
    setAttachments([]);
  }, []);

  const createNewProject = useCallback(() => {
    const name = window.prompt("Project name", "New project");
    if (!name) return;
    const project = createProject(name.trim());
    const chat = createChat({ projectId: project.id, title: `${project.name} chat` });
    setStore((prev) => ({
      ...prev,
      projects: [project, ...prev.projects],
      chats: [chat, ...prev.chats],
      activeChatId: chat.id,
    }));
    setMenuOpen(null);
  }, []);

  const renameChat = (chat) => {
    const next = window.prompt("Rename chat", chat.title || "New chat");
    if (!next) return;
    updateChat(chat.id, () => ({ title: next.trim() || chat.title }));
  };

  const renameProject = (project) => {
    const next = window.prompt("Rename project", project.name || "Project");
    if (!next) return;
    setStore((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => p.id === project.id ? { ...p, name: next.trim() || p.name, updatedAt: nowIso() } : p),
    }));
  };

  const deleteChat = (chat) => {
    if (!window.confirm(`Delete chat \"${chat.title}\"?`)) return;
    setStore((prev) => {
      const chats = prev.chats.filter((c) => c.id !== chat.id);
      let activeChatId = prev.activeChatId;
      if (activeChatId === chat.id) activeChatId = chats[0]?.id || createChat().id;
      if (!chats.length) {
        const fallback = createChat();
        return { ...prev, chats: [fallback], activeChatId: fallback.id };
      }
      return { ...prev, chats, activeChatId };
    });
  };

  const deleteProject = (project) => {
    if (!window.confirm(`Delete project \"${project.name}\" and its chats?`)) return;
    setStore((prev) => {
      const chats = prev.chats.filter((c) => c.projectId !== project.id);
      const projects = prev.projects.filter((p) => p.id !== project.id);
      let activeChatId = prev.activeChatId;
      if (!chats.find((c) => c.id === activeChatId)) {
        if (!chats.length) {
          const fallback = createChat();
          return { ...prev, projects, chats: [fallback], activeChatId: fallback.id };
        }
        activeChatId = chats[0].id;
      }
      return { ...prev, projects, chats, activeChatId };
    });
  };

  const togglePinChat = (chat) => updateChat(chat.id, (c) => ({ pinned: !c.pinned }));
  const togglePinProject = (project) => setStore((prev) => ({ ...prev, projects: prev.projects.map((p) => p.id === project.id ? { ...p, pinned: !p.pinned, updatedAt: nowIso() } : p) }));

  const setChatMode = (mode) => {
    updateChat(activeChat.id, () => ({ mode }));
    setMenuOpen(null);
  };

  const setStudyMode = (studyMode) => {
    updateChat(activeChat.id, () => ({ studyMode, mode: "study" }));
    setMenuOpen(null);
  };

  const setTheme = (theme) => setStore((prev) => ({ ...prev, theme }));
  const setAccent = (accent) => setStore((prev) => ({ ...prev, accent }));

  const addFiles = useCallback(async (files) => {
    const list = Array.from(files || []).slice(0, MAX_ATTACHMENT_COUNT);
    if (!list.length) return;
    try {
      const loaded = await Promise.all(list.map(fileToAttachment));
      setAttachments((prev) => [...prev, ...loaded].slice(0, MAX_ATTACHMENT_COUNT));
      showToast("File added");
    } catch {
      showToast("Could not read file");
    }
  }, [showToast]);

  const stopAll = useCallback((keepText = true) => {
    if (abortRef.current) abortRef.current.abort();
    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    setLoading(false);
    setTypingId(null);
    setStatusLabel("");
    if (keepText && activeChat) {
      setStore((prev) => ({
        ...prev,
        chats: prev.chats.map((c) => c.id !== prev.activeChatId ? c : {
          ...c,
          messages: c.messages.map((m) => m.id === typingId && m.fullText ? { ...m, text: m.fullText, typing: false } : m),
        }),
      }));
    }
  }, [activeChat, typingId]);

  const startTypingEffect = useCallback((chatId, messageId, fullText, extras = {}) => {
    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    setTypingId(messageId);
    let index = 0;
    const step = Math.max(2, Math.ceil(fullText.length / 180));
    typingTimerRef.current = window.setInterval(() => {
      index += step;
      const done = index >= fullText.length;
      const current = fullText.slice(0, Math.min(index, fullText.length));
      setStore((prev) => ({
        ...prev,
        chats: prev.chats.map((c) => c.id !== chatId ? c : {
          ...c,
          messages: c.messages.map((m) => m.id === messageId ? { ...m, text: current, fullText, typing: !done, ...extras } : m),
          title: extras.titleHint || c.title,
          updatedAt: nowIso(),
        }),
      }));
      smartScroll(false);
      if (done) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
        setTypingId(null);
        setStatusLabel("");
      }
    }, 18);
  }, [smartScroll]);

  const speakInput = useCallback(() => {
    try {
      const SpeechRecognition = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
      if (!SpeechRecognition) {
        showToast("Voice input is not supported here");
        return;
      }
      if (isRecording) {
        micRef.current?.stop();
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.lang = store.inputLang === "auto" ? inferLang(draft) : store.inputLang;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;
      const startWithEmpty = !draft.trim();
      let finalText = "";
      recognition.onstart = () => {
        setIsRecording(true);
        showToast("Listening…");
      };
      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) transcript += event.results[i][0].transcript;
        finalText = transcript.trim();
        setDraft((prev) => {
          const base = startWithEmpty ? "" : `${prev.trim()} `;
          return `${base}${finalText}`.trim();
        });
      };
      recognition.onerror = () => {
        setIsRecording(false);
        showToast("Voice input could not start");
      };
      recognition.onend = () => {
        setIsRecording(false);
        if (startWithEmpty && finalText.trim()) {
          setTimeout(() => sendMessage(true), 120);
        }
      };
      micRef.current = recognition;
      recognition.start();
    } catch {
      setIsRecording(false);
      showToast("Voice input is unavailable");
    }
  }, [draft, isRecording, showToast, store.inputLang]);

  const saveArtifactToProject = useCallback((artifact) => {
    if (!activeChat?.projectId || !artifact) return;
    setStore((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => {
        if (p.id !== activeChat.projectId) return p;
        const existing = p.fileLibrary?.[artifact.name] || [];
        return {
          ...p,
          updatedAt: nowIso(),
          fileLibrary: {
            ...(p.fileLibrary || {}),
            [artifact.name]: [
              { id: uid(), createdAt: nowIso(), content: artifact.content, type: artifact.type, name: artifact.name },
              ...existing,
            ].slice(0, 10),
          },
        };
      }),
    }));
  }, [activeChat]);

  const sendMessage = useCallback(async (fromVoice = false) => {
    const text = draft.trim();
    const files = attachments;
    if (!text && !files.length) return;

    if (loading) {
      stopAll(false);
    }
    if (typingId) {
      stopAll(true);
    }

    const userMessage = { id: uid(), role: "user", text, attachments: files, createdAt: nowIso() };
    const assistantId = uid();
    const assistantMessage = { id: assistantId, role: "assistant", text: "", typing: true, createdAt: nowIso(), artifacts: [], images: [] };
    const currentChat = activeChat;
    const newMessages = [...(currentChat?.messages || []), userMessage, assistantMessage];

    setStore((prev) => ({
      ...prev,
      chats: prev.chats.map((c) => c.id !== prev.activeChatId ? c : {
        ...c,
        messages: newMessages,
        updatedAt: nowIso(),
        title: c.messages.length ? c.title : getChatSummary([userMessage]),
      }),
    }));
    setDraft("");
    setAttachments([]);
    setMenuOpen(null);
    setLoading(true);
    setStatusLabel(activeChat?.mode === "image" ? "Creating image…" : activeChat?.mode === "study" ? "Studying…" : activeChat?.mode === "build" ? "Building…" : "Thinking…");
    smartScroll(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const projectFiles = activeProject?.fileLibrary ? Object.keys(activeProject.fileLibrary) : [];
      const resp = await fetch("/api/playcraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [...(currentChat?.messages || []), userMessage].map((m) => ({ role: m.role, text: m.text || "", attachments: m.attachments || [] })),
          mode: activeChat?.mode || "chat",
          studyMode: activeChat?.studyMode || "explain",
          project: activeProject ? { name: activeProject.name, memory: activeProject.memory, stylePreset: activeProject.stylePreset, files: projectFiles } : null,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Something went wrong.");

      const reply = data.reply || (hasHebrew(text) ? "סיימתי." : "Done.");
      const artifacts = Array.isArray(data.artifacts) ? data.artifacts : [];
      const images = Array.isArray(data.images) ? data.images : [];
      const titleHint = data.titleHint || getChatSummary([...newMessages, { role: "assistant", text: reply }]);
      artifacts.forEach(saveArtifactToProject);

      startTypingEffect(currentChat.id, assistantId, reply, { artifacts, images, titleHint });
    } catch (error) {
      const msg = error?.name === "AbortError" ? (hasHebrew(text) ? "נעצר." : "Stopped.") : (error?.message || "Something went wrong.");
      setStore((prev) => ({
        ...prev,
        chats: prev.chats.map((c) => c.id !== prev.activeChatId ? c : {
          ...c,
          messages: c.messages.map((m) => m.id === assistantId ? { ...m, text: `⚠️ ${msg}`, typing: false } : m),
        }),
      }));
      setTypingId(null);
      setStatusLabel("");
    } finally {
      setLoading(false);
    }
  }, [activeChat, activeProject, attachments, draft, loading, saveArtifactToProject, smartScroll, startTypingEffect, stopAll, typingId]);

  const currentMode = MODES.find((m) => m.id === activeChat?.mode) || MODES[0];

  const messages = activeChat?.messages || [];
  const currentPreviewArtifact = messages.flatMap((m) => m.artifacts || []).find((a) => a.id === activeChat?.previewArtifactId) || messages.flatMap((m) => m.artifacts || []).at(-1) || null;

  return (
    <div className="appRoot" onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}>
      <style>{`
        :root{--accent:#6d5efc;--accent-soft:#6d5efc22;}
        *{box-sizing:border-box} html,body{margin:0;padding:0;font-family:Inter,system-ui,Arial,sans-serif;background:var(--bg-gradient);color:var(--text)}
        button,input,textarea{font:inherit}
        .appRoot{height:100vh;display:grid;grid-template-columns:290px 1fr;gap:18px;padding:18px;background:var(--bg-gradient)}
        .sidebar,.mainPanel{min-height:0;background:var(--panel);border:1px solid var(--border);border-radius:26px;box-shadow:var(--shadow)}
        .sidebar{display:flex;flex-direction:column;overflow:hidden}
        .sideHead{padding:16px;border-bottom:1px solid var(--border);display:grid;gap:12px}
        .brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px}
        .brandDot{width:34px;height:34px;border-radius:12px;background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 50%, white));display:grid;place-items:center;color:#fff;box-shadow:0 10px 22px var(--accent-soft)}
        .searchBar{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--border);background:var(--panel-2);border-radius:14px;color:var(--muted)}
        .searchBar input{flex:1;background:transparent;border:none;outline:none;color:var(--text)}
        .sideBtns{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .menuBtn{display:flex;align-items:center;gap:10px;border:1px solid var(--border);background:var(--panel-2);color:var(--text);padding:10px 12px;border-radius:14px;cursor:pointer;transition:.18s transform,.18s background,.18s border-color}
        .menuBtn:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--accent) 30%, var(--border));background:color-mix(in srgb,var(--panel-2) 78%, var(--accent-soft))}
        .menuBtn.active{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 50%, var(--border))}
        .menuBtn.subtle{padding:9px 11px}
        .menuIcon{display:grid;place-items:center;width:18px;min-width:18px}
        .sections{flex:1;min-height:0;overflow:auto;padding:14px}
        .sideSection{display:grid;gap:10px;margin-bottom:18px}
        .sectionTitle{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);padding:0 6px;font-weight:700}
        .list{display:grid;gap:8px}
        .item{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:11px 12px;border:1px solid transparent;border-radius:15px;background:transparent;cursor:pointer;color:var(--text)}
        .item:hover{background:var(--panel-2);border-color:var(--border)}
        .item.active{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 45%, var(--border))}
        .itemMeta{display:grid;gap:2px;min-width:0}
        .itemTitle{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .itemSub{font-size:12px;color:var(--muted)}
        .itemIcon{width:18px;height:18px;display:grid;place-items:center;color:var(--muted)}
        .itemActions{display:flex;gap:6px;opacity:0;transition:.15s opacity}
        .item:hover .itemActions,.item.active .itemActions{opacity:1}
        .miniIcon{width:28px;height:28px;display:grid;place-items:center;border:1px solid var(--border);background:var(--panel);border-radius:10px;color:var(--muted);cursor:pointer}
        .mainPanel{display:grid;grid-template-rows:auto 1fr auto;min-height:0;overflow:hidden;position:relative}
        .topBar{padding:16px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px}
        .topLeft{display:flex;align-items:center;gap:10px;min-width:0}
        .topTitle{font-weight:800;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .topSub{font-size:12px;color:var(--muted)}
        .topRight{display:flex;align-items:center;gap:8px;position:relative}
        .toolbarBtn{display:flex;align-items:center;gap:8px;border:1px solid var(--border);background:var(--panel-2);color:var(--text);height:40px;padding:0 14px;border-radius:14px;cursor:pointer}
        .toolbarBtn:hover{border-color:color-mix(in srgb,var(--accent) 35%, var(--border));background:color-mix(in srgb,var(--panel-2) 78%, var(--accent-soft))}
        .toolbarPrimary{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 10px 24px var(--accent-soft)}
        .menuPop{position:absolute;top:48px;right:0;min-width:240px;background:var(--panel);border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow);padding:10px;display:grid;gap:8px;z-index:50}
        .menuGrid{display:grid;gap:6px}
        .menuTitle{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);padding:4px 6px;font-weight:700}
        .chipRow{display:flex;gap:8px;flex-wrap:wrap}
        .colorChip,.themeChip{border:1px solid var(--border);background:var(--panel-2);border-radius:12px;padding:9px 12px;cursor:pointer;color:var(--text)}
        .colorDot{width:14px;height:14px;border-radius:50%}
        .chatScroll{min-height:0;overflow:auto;padding:22px 20px 10px}
        .chatColumn{min-height:100%;display:flex;flex-direction:column;justify-content:flex-end;gap:14px;max-width:1040px;margin:0 auto;width:100%}
        .welcomeCard{background:linear-gradient(180deg,var(--panel),var(--panel-2));border:1px solid var(--border);border-radius:26px;padding:28px;display:grid;gap:16px}
        .welcomeTitle{font-size:32px;font-weight:900;letter-spacing:-.05em}
        .quickRow{display:flex;gap:10px;flex-wrap:wrap}
        .quickBtn{border:1px solid var(--border);background:var(--panel);padding:10px 14px;border-radius:999px;cursor:pointer;color:var(--text)}
        .msgRow{display:flex;gap:12px;align-items:flex-start}
        .msgRow.user{justify-content:flex-end}
        .avatar{width:36px;height:36px;min-width:36px;border-radius:14px;display:grid;place-items:center;background:var(--panel-2);border:1px solid var(--border)}
        .avatar.user{background:var(--accent);color:#fff;border-color:transparent}
        .bubble{max-width:min(78%,820px);background:var(--assistant);border:1px solid var(--border);border-radius:22px;padding:14px 16px;box-shadow:0 10px 26px rgba(15,23,42,.04)}
        .msgRow.user .bubble{background:var(--user)}
        .msgText{display:grid;gap:12px;line-height:1.65;font-size:15px}
        .codeWrap{border:1px solid var(--border);border-radius:18px;overflow:hidden;background:var(--panel-2)}
        .codeTop{padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
        .codeWrap pre{margin:0;padding:14px;overflow:auto;max-height:340px}
        .artifactStack,.imageStack{display:grid;gap:8px;margin-top:10px}
        .artifactCard{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid var(--border);background:var(--panel-2);border-radius:16px;padding:12px 14px}
        .artifactCard.compact{padding:10px 12px}
        .artifactName{font-weight:700}
        .artifactType{font-size:12px;color:var(--muted)}
        .artifactActions{display:flex;gap:8px;flex-wrap:wrap}
        .artifactActions button{border:1px solid var(--border);background:var(--panel);color:var(--text);padding:8px 10px;border-radius:12px;cursor:pointer}
        .imageCard{border:1px solid var(--border);background:var(--panel-2);border-radius:18px;padding:10px;display:grid;gap:10px}
        .imageCard img{display:block;width:100%;max-width:360px;border-radius:14px;border:1px solid var(--border)}
        .statusBar{padding:0 20px 12px;max-width:1040px;width:100%;margin:0 auto;color:var(--muted);font-size:13px;display:flex;align-items:center;gap:10px}
        .statusDot{width:8px;height:8px;border-radius:50%;background:var(--accent);animation:pulse 1.1s infinite alternate}
        @keyframes pulse{from{opacity:.45;transform:scale(.9)}to{opacity:1;transform:scale(1.12)}}
        .bottomWrap{padding:14px 18px 18px;border-top:1px solid var(--border);background:color-mix(in srgb,var(--panel) 88%, transparent)}
        .composer{max-width:1040px;margin:0 auto;display:grid;gap:10px}
        .attachmentRow{display:flex;gap:8px;flex-wrap:wrap}
        .attachCard{display:flex;align-items:center;gap:8px;border:1px solid var(--border);background:var(--panel-2);padding:8px 10px;border-radius:14px;font-size:13px}
        .attachCard img{width:36px;height:36px;object-fit:cover;border-radius:10px;border:1px solid var(--border)}
        .composerBox{display:grid;grid-template-columns:auto 1fr auto auto;gap:8px;align-items:end;border:1px solid var(--border);background:var(--panel);padding:10px;border-radius:22px;box-shadow:var(--shadow);position:relative}
        .composer textarea{width:100%;min-height:52px;max-height:200px;resize:none;border:none;outline:none;background:transparent;color:var(--text);padding:10px 8px;line-height:1.55}
        .fab{width:42px;height:42px;border-radius:14px;border:1px solid var(--border);background:var(--panel-2);display:grid;place-items:center;color:var(--text);cursor:pointer}
        .fab:hover{background:color-mix(in srgb,var(--panel-2) 78%, var(--accent-soft));border-color:color-mix(in srgb,var(--accent) 35%, var(--border))}
        .fab.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
        .fab.danger{background:#fff1f2;color:#e11d48;border-color:#fecdd3}
        .inputMenu{position:absolute;left:10px;bottom:58px;min-width:220px;background:var(--panel);border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow);padding:10px;display:grid;gap:6px;z-index:60}
        .previewPane{border-top:1px solid var(--border);background:var(--panel-2);display:grid;grid-template-columns:1fr;max-height:42vh}
        .previewHead{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border)}
        .previewFrame{background:white;width:100%;height:100%;min-height:280px;border:none}
        .emptyPreview{display:grid;place-items:center;color:var(--muted);padding:36px}
        .toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:var(--panel);border:1px solid var(--border);box-shadow:var(--shadow);padding:10px 14px;border-radius:14px;z-index:100;color:var(--text)}
        .dragOverlay{position:fixed;inset:0;background:rgba(16,24,40,.18);backdrop-filter:blur(6px);display:grid;place-items:center;z-index:90}
        .dragCard{background:var(--panel);border:1px solid var(--border);padding:24px 28px;border-radius:24px;box-shadow:var(--shadow);font-weight:800}
        @media (max-width: 980px){.appRoot{grid-template-columns:1fr;padding:10px}.sidebar{display:none}.bubble{max-width:100%}.topBar{padding:12px 14px}.bottomWrap{padding:10px}.composerBox{grid-template-columns:auto 1fr auto}.topRight{flex-wrap:wrap;justify-content:flex-end}.toolbarBtn .hideMobile{display:none}}
      `}</style>

      <div className="sidebar">
        <div className="sideHead">
          <div className="brand"><div className="brandDot"><IconSpark /></div><div>Playcraft</div></div>
          <div className="searchBar"><IconSearch /><input value={store.search} onChange={(e) => setStore((prev) => ({ ...prev, search: e.target.value }))} placeholder="Search chats and projects" /></div>
          <div className="sideBtns">
            <MenuButton icon={<IconChat />} label="New chat" onClick={() => createNewChat(null, "chat")} />
            <MenuButton icon={<IconFolder />} label="Add project" onClick={createNewProject} />
          </div>
        </div>

        <div className="sections">
          <div className="sideSection">
            <div className="sectionTitle">Projects</div>
            <div className="list">
              {visibleProjects.map((project) => (
                <div key={project.id} className={`item ${activeProject?.id === project.id ? "active" : ""}`} onClick={() => {
                  const first = store.chats.find((c) => c.projectId === project.id);
                  if (first) setStore((prev) => ({ ...prev, activeChatId: first.id }));
                }}>
                  <div className="itemIcon"><IconFolder /></div>
                  <div className="itemMeta">
                    <div className="itemTitle">{project.name}</div>
                    <div className="itemSub">{store.chats.filter((c) => c.projectId === project.id).length} chats</div>
                  </div>
                  <div className="itemActions" onClick={(e) => e.stopPropagation()}>
                    <button className="miniIcon" onClick={() => togglePinProject(project)} title="Pin"><IconPin filled={project.pinned} /></button>
                    <button className="miniIcon" onClick={() => renameProject(project)} title="Rename">✎</button>
                    <button className="miniIcon" onClick={() => createNewChat(project.id, "chat")} title="New chat">+</button>
                    <button className="miniIcon" onClick={() => deleteProject(project)} title="Delete">🗑</button>
                  </div>
                </div>
              ))}
              {!visibleProjects.length && <div className="item" style={{ cursor: "default" }}><div className="itemMeta"><div className="itemSub">No projects yet</div></div></div>}
            </div>
          </div>

          {activeProject ? (
            <div className="sideSection">
              <div className="sectionTitle">Chats in project</div>
              <div className="list">
                {projectChats.map((chat) => (
                  <div key={chat.id} className={`item ${chat.id === activeChat?.id ? "active" : ""}`} onClick={() => setStore((prev) => ({ ...prev, activeChatId: chat.id }))}>
                    <div className="itemIcon"><IconChat /></div>
                    <div className="itemMeta"><div className="itemTitle">{chat.title}</div><div className="itemSub">{MODES.find((m) => m.id === chat.mode)?.label || "Chat"}</div></div>
                    <div className="itemActions" onClick={(e) => e.stopPropagation()}>
                      <button className="miniIcon" onClick={() => togglePinChat(chat)}><IconPin filled={chat.pinned} /></button>
                      <button className="miniIcon" onClick={() => renameChat(chat)}>✎</button>
                      <button className="miniIcon" onClick={() => deleteChat(chat)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="sideSection">
            <div className="sectionTitle">Chats</div>
            <div className="list">
              {generalChats.map((chat) => (
                <div key={chat.id} className={`item ${chat.id === activeChat?.id ? "active" : ""}`} onClick={() => setStore((prev) => ({ ...prev, activeChatId: chat.id }))}>
                  <div className="itemIcon"><IconChat /></div>
                  <div className="itemMeta"><div className="itemTitle">{chat.title}</div><div className="itemSub">{MODES.find((m) => m.id === chat.mode)?.label || "Chat"}</div></div>
                  <div className="itemActions" onClick={(e) => e.stopPropagation()}>
                    <button className="miniIcon" onClick={() => togglePinChat(chat)}><IconPin filled={chat.pinned} /></button>
                    <button className="miniIcon" onClick={() => renameChat(chat)}>✎</button>
                    <button className="miniIcon" onClick={() => deleteChat(chat)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mainPanel" ref={menuWrapRef}>
        <div className="topBar">
          <div className="topLeft">
            <div className="brandDot" style={{ width: 40, height: 40 }}>{currentMode.icon}</div>
            <div style={{ minWidth: 0 }}>
              <div className="topTitle">{activeChat?.title || "New chat"}</div>
              <div className="topSub">{activeProject ? `${activeProject.name} • ${currentMode.label}` : currentMode.label}</div>
            </div>
          </div>
          <div className="topRight">
            <button className="toolbarBtn" type="button" onClick={() => setMenuOpen(menuOpen === "mode" ? null : "mode")}><span>{currentMode.icon}</span><span>{currentMode.label}</span></button>
            <button className="toolbarBtn" type="button" onClick={() => setMenuOpen(menuOpen === "theme" ? null : "theme")}><IconPalette /><span className="hideMobile">Backgrounds & colors</span></button>
            <button className="toolbarBtn" type="button" onClick={() => setStore((prev) => ({ ...prev, splitView: !prev.splitView }))}>{store.splitView ? "Hide preview" : "Show preview"}</button>

            {menuOpen === "mode" && (
              <div className="menuPop">
                <div className="menuTitle">Mode</div>
                <div className="menuGrid">
                  {MODES.map((mode) => <MenuButton key={mode.id} icon={mode.icon} label={mode.label} active={activeChat?.mode === mode.id} onClick={() => setChatMode(mode.id)} />)}
                </div>
                <div className="menuTitle">Study</div>
                <div className="menuGrid">
                  {STUDY_MODES.map((option) => <MenuButton key={option.id} icon="📘" label={option.label} active={activeChat?.studyMode === option.id} onClick={() => setStudyMode(option.id)} />)}
                </div>
              </div>
            )}

            {menuOpen === "theme" && (
              <div className="menuPop" style={{ right: 0, minWidth: 280 }}>
                <div className="menuTitle">Background</div>
                <div className="menuGrid">
                  {Object.entries(THEMES).map(([id, theme]) => <button key={id} className="themeChip" type="button" onClick={() => setTheme(id)} style={{ borderColor: store.theme === id ? "var(--accent)" : "var(--border)" }}>{theme.name}</button>)}
                </div>
                <div className="menuTitle">Accent</div>
                <div className="chipRow">
                  {ACCENTS.map((accent) => (
                    <button key={accent.id} className="themeChip" type="button" onClick={() => setAccent(accent.value)} style={{ borderColor: store.accent === accent.value ? accent.value : "var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="colorDot" style={{ background: accent.value }} />{accent.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="chatScroll" ref={scrollRef}>
          <div className="chatColumn">
            {!messages.length ? (
              <div className="welcomeCard">
                <div className="welcomeTitle">Build, study, code, or create.</div>
                <div style={{ color: "var(--muted)", lineHeight: 1.7 }}>You can talk normally, ask for a beautiful game, upload a screenshot and say “make it look like this”, ask for ESP32 code, or switch to Study and learn.</div>
                <div className="quickRow">
                  <button className="quickBtn" onClick={() => setDraft("תכין לי וורדל יפה")}>Beautiful Wordle</button>
                  <button className="quickBtn" onClick={() => setDraft("תן לי קוד ל ESP32 ב Arduino IDE")}>ESP32 code</button>
                  <button className="quickBtn" onClick={() => setDraft("תבנה לי משחק עם עיצוב כמו התמונה")}>Copy design from screenshot</button>
                  <button className="quickBtn" onClick={() => { setChatMode("study"); setDraft("תלמד אותי בצורה פשוטה"); }}>Study</button>
                </div>
              </div>
            ) : null}

            {messages.map((msg) => (
              <div key={msg.id} className={`msgRow ${msg.role === "user" ? "user" : "assistant"}`}>
                {msg.role !== "user" ? <div className="avatar">✨</div> : null}
                <div className="bubble">
                  <MessageBody text={msg.text || (msg.typing ? "…" : "")} />
                  {msg.attachments?.length ? (
                    <div className="artifactStack">
                      {msg.attachments.map((a, i) => (
                        <div className="artifactCard compact" key={i}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {a.kind === "image" ? <img src={a.dataUrl} alt={a.name || "image"} style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 12, border: "1px solid var(--border)" }} /> : <div style={{ width: 46, height: 46, borderRadius: 12, background: "var(--panel)", border: "1px solid var(--border)", display: "grid", placeItems: "center" }}>📄</div>}
                            <div><div className="artifactName">{a.name || "Attachment"}</div><div className="artifactType">{a.kind}</div></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {msg.images?.length ? (
                    <div className="imageStack">
                      {msg.images.map((img) => (
                        <div key={img.id || img.url} className="imageCard">
                          <img src={img.url} alt={img.name || "generated"} />
                          <div className="artifactActions">
                            <button type="button" onClick={() => window.open(img.url, "_blank")}>Open in web</button>
                            <button type="button" onClick={() => { const a = document.createElement("a"); a.href = img.url; a.download = img.name || "image.png"; a.click(); }}>Download</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {msg.artifacts?.length ? (
                    <div className="artifactStack">
                      {msg.artifacts.map((artifact) => (
                        <ArtifactCard
                          key={artifact.id || artifact.name}
                          artifact={artifact}
                          onOpen={() => {
                            const url = blobUrlForArtifact(artifact);
                            if (artifact.type === "html") {
                              setStore((prev) => ({
                                ...prev,
                                chats: prev.chats.map((c) => c.id === activeChat.id ? { ...c, previewArtifactId: artifact.id || artifact.name } : c),
                                splitView: true,
                              }));
                            }
                            window.open(url, "_blank");
                          }}
                          onDownload={() => downloadBlob(artifact.name || "file.txt", artifact.content || "", artifact.type === "html" ? "text/html" : "text/plain")}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
                {msg.role === "user" ? <div className="avatar user">U</div> : null}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {(loading || typingId) && <div className="statusBar"><span className="statusDot" />{statusLabel || "Working…"}</div>}

        {store.splitView && (
          <div className="previewPane">
            <div className="previewHead">
              <div style={{ fontWeight: 800 }}>Preview</div>
              {currentPreviewArtifact ? (
                <div className="artifactActions">
                  <button type="button" onClick={() => { const url = blobUrlForArtifact(currentPreviewArtifact); window.open(url, "_blank"); }}>Open in web</button>
                  <button type="button" onClick={() => downloadBlob(currentPreviewArtifact.name || "file.html", currentPreviewArtifact.content || "", "text/html")}>Download</button>
                </div>
              ) : null}
            </div>
            {currentPreviewArtifact?.type === "html" ? <iframe title="preview" className="previewFrame" srcDoc={currentPreviewArtifact.content || ""} /> : <div className="emptyPreview">When an HTML game or page is created, it will appear here.</div>}
          </div>
        )}

        <div className="bottomWrap">
          <div className="composer">
            {attachments.length ? (
              <div className="attachmentRow">
                {attachments.map((file, i) => (
                  <div className="attachCard" key={i}>
                    {file.kind === "image" ? <img src={file.dataUrl} alt={file.name || "image"} /> : <span>📄</span>}
                    <span>{file.name || "file"}</span>
                    <button className="miniIcon" type="button" onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="composerBox">
              <button className="fab" type="button" onClick={() => setMenuOpen(menuOpen === "plus" ? null : "plus")}><IconPlus /></button>
              {menuOpen === "plus" && (
                <div className="inputMenu">
                  <MenuButton icon="📎" label="Add file" onClick={() => { fileInputRef.current?.click(); setMenuOpen(null); }} />
                  <MenuButton icon="📚" label="Study and learn" onClick={() => { setChatMode("study"); setMenuOpen(null); }} />
                  <MenuButton icon="🖼️" label="Create image" onClick={() => { setChatMode("image"); setMenuOpen(null); }} />
                  <MenuButton icon="💬" label="New chat" onClick={() => { createNewChat(activeProject?.id || null, activeChat?.mode || "chat"); setMenuOpen(null); }} />
                  <MenuButton icon="🗂️" label="Add project" onClick={createNewProject} />
                </div>
              )}

              <textarea
                value={draft}
                onChange={(e) => { setDraft(e.target.value); e.target.style.height = "56px"; e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(false); } }}
                placeholder={activeChat?.mode === "image" ? "Describe the image you want…" : activeChat?.mode === "build" ? "Describe the game you want…" : "Message Playcraft…"}
              />

              <button className={`fab ${isRecording ? "active" : ""}`} type="button" onClick={speakInput} title="Voice input"><IconMic active={isRecording} /></button>
              {loading || typingId ? (
                <button className="fab danger" type="button" onClick={() => stopAll(true)} title="Stop"><IconStop /></button>
              ) : (
                <button className="fab primary" type="button" onClick={() => sendMessage(false)} title="Send"><IconSend /></button>
              )}

              <input ref={fileInputRef} hidden type="file" multiple onChange={(e) => addFiles(e.target.files)} />
            </div>
          </div>
        </div>
      </div>

      {toast ? <div className="toast">{toast}</div> : null}
      {dragging ? <div className="dragOverlay"><div className="dragCard">Drop files here</div></div> : null}
    </div>
  );
}
