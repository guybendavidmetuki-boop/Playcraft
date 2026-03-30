"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "playcraft.ultra.v2";
const MAX_TEXT_FILE_CHARS = 90000;
const MAX_IMAGE_EDGE = 1400;

const uid = () => Math.random().toString(36).slice(2, 10);
const nowIso = () => new Date().toISOString();
const nowLabel = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const THEMES = {
  light: {
    name: "Light",
    vars: {
      "--bg": "#f6f7fb",
      "--panel": "#ffffff",
      "--panel-2": "#f1f3f9",
      "--panel-3": "#eef2ff",
      "--border": "#e3e8f4",
      "--text": "#152033",
      "--muted": "#667085",
      "--soft": "#8b97ab",
      "--bubble-user": "#e9efff",
      "--bubble-ai": "#ffffff",
      "--shadow": "0 16px 48px rgba(21, 32, 51, 0.08)",
      "--danger": "#e5484d",
      "--success": "#1f9d55",
      "--preview-bg": "#f8fafc",
    },
  },
  dark: {
    name: "Dark",
    vars: {
      "--bg": "#0d1220",
      "--panel": "#141b2d",
      "--panel-2": "#101727",
      "--panel-3": "#18223a",
      "--border": "#26314d",
      "--text": "#edf3ff",
      "--muted": "#93a3bf",
      "--soft": "#687792",
      "--bubble-user": "#1b315a",
      "--bubble-ai": "#162037",
      "--shadow": "0 18px 54px rgba(0, 0, 0, 0.28)",
      "--danger": "#ff6b7a",
      "--success": "#47d18c",
      "--preview-bg": "#0a1020",
    },
  },
  sunrise: {
    name: "Sunrise",
    vars: {
      "--bg": "#fff7f0",
      "--panel": "#ffffff",
      "--panel-2": "#fff1e6",
      "--panel-3": "#ffe4d2",
      "--border": "#ffd4b8",
      "--text": "#3a2418",
      "--muted": "#8b5e47",
      "--soft": "#b57f67",
      "--bubble-user": "#ffe9db",
      "--bubble-ai": "#fffaf6",
      "--shadow": "0 16px 48px rgba(120, 67, 37, 0.10)",
      "--danger": "#df5a49",
      "--success": "#3d9b62",
      "--preview-bg": "#fff8f3",
    },
  },
  mint: {
    name: "Mint",
    vars: {
      "--bg": "#f1fffb",
      "--panel": "#ffffff",
      "--panel-2": "#ebfdf7",
      "--panel-3": "#dcfaf0",
      "--border": "#c8f0e2",
      "--text": "#12332c",
      "--muted": "#5f8f82",
      "--soft": "#78a89b",
      "--bubble-user": "#dff8ef",
      "--bubble-ai": "#ffffff",
      "--shadow": "0 16px 48px rgba(18, 51, 44, 0.08)",
      "--danger": "#d95454",
      "--success": "#1f9d73",
      "--preview-bg": "#f6fffb",
    },
  },
};

const ACCENTS = ["#6d5efc", "#ff7a59", "#0ea5e9", "#22c55e", "#ec4899", "#f59e0b"];
const MODE_OPTIONS = [
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "build", label: "Build", icon: "🛠️" },
  { id: "study", label: "Study", icon: "📚" },
  { id: "image", label: "Create image", icon: "🖼️" },
  { id: "code", label: "Code", icon: "💻" },
  { id: "fix", label: "Fix code", icon: "🧰" },
  { id: "arduino", label: "Arduino / ESP32", icon: "🔌" },
];
const STUDY_OPTIONS = [
  { id: "explain", label: "Explain simply" },
  { id: "quiz", label: "Quiz mode" },
  { id: "flashcards", label: "Flashcards" },
  { id: "questions", label: "Ask me questions" },
  { id: "file", label: "Study from file" },
];
const STYLE_OPTIONS = ["modern", "minimal", "neon", "pixel", "horror"];

function createProject(name = "New project") {
  return {
    id: uid(),
    name,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    pinned: false,
    memory: "",
    stylePreset: "modern",
    fileLibrary: {},
  };
}

function createChat({ title = "New chat", projectId = null, mode = "chat", studyMode = "explain" } = {}) {
  return {
    id: uid(),
    title,
    projectId,
    pinned: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    mode,
    studyMode,
    messages: [],
    previewArtifactId: null,
    summary: "",
  };
}

function defaultStore() {
  const firstChat = createChat({ title: "New chat" });
  return {
    chats: [firstChat],
    projects: [],
    activeChatId: firstChat.id,
    search: "",
    theme: "light",
    accent: ACCENTS[0],
    splitView: true,
    voiceReply: false,
  };
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function summarizeChatTitle(messages) {
  const userTexts = messages
    .filter((m) => m.role === "user")
    .map((m) => (m.text || "").trim())
    .filter(Boolean)
    .slice(-3)
    .join(" • ");
  const clean = userTexts
    .replace(/\s+/g, " ")
    .replace(/[`*_#>-]/g, "")
    .trim();
  if (!clean) return "New chat";
  const bits = clean.split(/[.!?\n]|\s•\s/).map((s) => s.trim()).filter(Boolean);
  const best = bits[0] || clean;
  return best.length > 34 ? `${best.slice(0, 34).trim()}…` : best;
}

function sortPinned(items) {
  return [...items].sort((a, b) => {
    if (Number(b.pinned) !== Number(a.pinned)) return Number(b.pinned) - Number(a.pinned);
    return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
  });
}

function parseCodeBlocks(text) {
  const parts = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: "text", content: text.slice(last, match.index) });
    parts.push({ type: "code", lang: match[1] || "text", content: match[2] });
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push({ type: "text", content: text.slice(last) });
  return parts;
}

function inferWorkingLabel(mode) {
  switch (mode) {
    case "build":
      return "Building something nice…";
    case "image":
      return "Creating image…";
    case "study":
      return "Studying and organizing…";
    case "code":
    case "fix":
    case "arduino":
      return "Writing clean code…";
    default:
      return "Thinking…";
  }
}

function useOutsideClick(refs, handler) {
  useEffect(() => {
    const onDown = (event) => {
      const isInside = refs.some((ref) => ref?.current && ref.current.contains(event.target));
      if (!isInside) handler();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [refs, handler]);
}

function applyTheme(themeId, accent) {
  const theme = THEMES[themeId] || THEMES.light;
  Object.entries(theme.vars).forEach(([key, value]) => document.documentElement.style.setProperty(key, value));
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-soft", `${accent}22`);
}

async function fileToText(file) {
  const text = await file.text();
  return text.length > MAX_TEXT_FILE_CHARS ? `${text.slice(0, MAX_TEXT_FILE_CHARS)}\n\n[truncated]` : text;
}

async function resizeImageFile(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL("image/jpeg", 0.88);
  return {
    kind: "image",
    name: file.name,
    mime: "image/jpeg",
    dataUrl: out,
    base64: out.split(",")[1],
  };
}

async function normalizeFiles(fileList) {
  const files = Array.from(fileList || []);
  const normalized = [];
  for (const file of files) {
    if (file.type.startsWith("image/")) {
      normalized.push(await resizeImageFile(file));
    } else if (
      file.type.startsWith("text/") ||
      /\.(txt|md|js|jsx|ts|tsx|json|css|html|xml|csv|yml|yaml|ino|cpp|c|h|hpp|py|java|rb|php)$/i.test(file.name)
    ) {
      normalized.push({
        kind: "text",
        name: file.name,
        mime: file.type || "text/plain",
        text: await fileToText(file),
      });
    } else {
      normalized.push({ kind: "file", name: file.name, mime: file.type || "application/octet-stream" });
    }
  }
  return normalized;
}

function MicrophoneIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
      <path d="M8 22h8" />
      {active ? <circle cx="18.5" cy="5.5" r="2.5" fill="currentColor" stroke="none" /> : null}
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
      <path d="M5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15Z" />
    </svg>
  );
}

function PinIcon({ filled = false }) {
  return filled ? (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M14 2v2l2 3v4l2 2v1h-5v8h-2v-8H6v-1l2-2V7l2-3V2z"/></svg>
  ) : (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2v2l2 3v4l2 2v1h-5v8h-2v-8H6v-1l2-2V7l2-3V2z"/></svg>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
}

function FileIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>;
}

function ImageIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5L5 20"/></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>;
}

function DownloadIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>;
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/></svg>;
}

function RenameIcon() {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>;
}

function ThemeIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"/></svg>;
}

function MessageBody({ text }) {
  const parts = parseCodeBlocks(text || "");
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {parts.map((part, idx) =>
        part.type === "code" ? (
          <div key={idx} style={{ border: "1px solid var(--border)", borderRadius: 16, background: "var(--panel-2)", overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--soft)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
              <span>{part.lang}</span>
            </div>
            <pre style={{ margin: 0, padding: 14, overflowX: "auto", fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}><code>{part.content}</code></pre>
          </div>
        ) : (
          <div key={idx} style={{ whiteSpace: "pre-wrap", lineHeight: 1.72, fontSize: 15 }}>{part.content}</div>
        )
      )}
    </div>
  );
}

function ArtifactCard({ artifact, onOpen, onDownload, onPreview, onVersions }) {
  const isImage = artifact.kind === "image" || artifact.mime?.startsWith("image/");
  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--panel)", borderRadius: 18, padding: 12, display: "grid", gap: 10, minWidth: 220 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 12, background: "var(--panel-3)", display: "grid", placeItems: "center" }}>
          {isImage ? <ImageIcon /> : <FileIcon />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{artifact.name}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>v{artifact.version || 1} • {artifact.kind || artifact.mime || "file"}</div>
        </div>
      </div>
      {isImage && artifact.url ? (
        <img src={artifact.url} alt={artifact.name} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 14, border: "1px solid var(--border)" }} />
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="pc-chip" onClick={() => onOpen(artifact)}><ArrowIcon /> Open in web</button>
        <button className="pc-chip" onClick={() => onDownload(artifact)}><DownloadIcon /> Download</button>
        {(artifact.kind === "html" || /html/i.test(artifact.name)) ? <button className="pc-chip" onClick={() => onPreview(artifact)}>Preview</button> : null}
        {artifact.versionCount > 1 ? <button className="pc-chip" onClick={() => onVersions(artifact)}>Versions</button> : null}
      </div>
    </div>
  );
}

export default function PlaycraftApp() {
  const [store, setStore] = useState(defaultStore);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Thinking…");
  const [dragging, setDragging] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [projectMenuId, setProjectMenuId] = useState(null);
  const [chatMenuId, setChatMenuId] = useState(null);
  const [versionsFor, setVersionsFor] = useState(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const messagesRef = useRef(null);
  const plusRef = useRef(null);
  const plusButtonRef = useRef(null);
  const modeRef = useRef(null);
  const modeButtonRef = useRef(null);
  const controllerRef = useRef(null);
  const recognitionRef = useRef(null);
  const shouldStickBottomRef = useRef(true);
  const typingIntervalRef = useRef(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? safeJsonParse(raw) : null;
    if (parsed?.chats?.length) setStore(parsed);
    setSpeechSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    applyTheme(store.theme, store.accent);
  }, [store]);

  useOutsideClick([plusRef, plusButtonRef], () => setPlusOpen(false));
  useOutsideClick([modeRef, modeButtonRef], () => setModeOpen(false));

  const activeChat = useMemo(() => store.chats.find((c) => c.id === store.activeChatId) || store.chats[0], [store]);
  const activeProject = useMemo(() => store.projects.find((p) => p.id === activeChat?.projectId) || null, [store, activeChat]);
  const activeMode = activeChat?.mode || "chat";
  const modeMeta = MODE_OPTIONS.find((m) => m.id === activeMode) || MODE_OPTIONS[0];

  const filteredStandaloneChats = useMemo(() => {
    const q = store.search.trim().toLowerCase();
    const chats = sortPinned(store.chats.filter((c) => !c.projectId));
    if (!q) return chats;
    return chats.filter((chat) => {
      const hay = `${chat.title} ${chat.summary} ${chat.messages.map((m) => m.text || "").join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [store]);

  const filteredProjects = useMemo(() => {
    const q = store.search.trim().toLowerCase();
    const projects = sortPinned(store.projects);
    if (!q) return projects;
    return projects.filter((project) => {
      const related = store.chats.filter((c) => c.projectId === project.id);
      const hay = `${project.name} ${project.memory} ${related.map((c) => `${c.title} ${c.summary} ${c.messages.map((m) => m.text || "").join(" ")}`).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [store]);

  const chatsByProject = useMemo(() => {
    const map = {};
    store.projects.forEach((p) => { map[p.id] = []; });
    store.chats.forEach((chat) => {
      if (chat.projectId) {
        if (!map[chat.projectId]) map[chat.projectId] = [];
        map[chat.projectId].push(chat);
      }
    });
    Object.keys(map).forEach((k) => { map[k] = sortPinned(map[k]); });
    return map;
  }, [store]);

  useEffect(() => {
    clearInterval(typingIntervalRef.current);
    typingIntervalRef.current = setInterval(() => {
      setStore((prev) => {
        let changed = false;
        const chats = prev.chats.map((chat) => {
          const messages = chat.messages.map((msg) => {
            if (!msg.animating || !msg.fullText) return msg;
            const current = msg.text || "";
            if (current.length >= msg.fullText.length) return { ...msg, animating: false };
            changed = true;
            const remaining = msg.fullText.slice(current.length);
            const chunk = remaining.match(/^.{1,8}(\s|$)/)?.[0] || remaining.slice(0, 10);
            return { ...msg, text: current + chunk, animating: current.length + chunk.length < msg.fullText.length };
          });
          return { ...chat, messages };
        });
        return changed ? { ...prev, chats } : prev;
      });
      if (shouldStickBottomRef.current) {
        messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
      }
    }, 45);
    return () => clearInterval(typingIntervalRef.current);
  }, []);

  const updateChat = useCallback((chatId, updater) => {
    setStore((prev) => ({
      ...prev,
      chats: prev.chats.map((chat) => (chat.id === chatId ? updater(chat) : chat)),
    }));
  }, []);

  const updateProject = useCallback((projectId, updater) => {
    setStore((prev) => ({
      ...prev,
      projects: prev.projects.map((project) => (project.id === projectId ? updater(project) : project)),
    }));
  }, []);

  const addArtifactToProject = useCallback((projectId, artifact) => {
    if (!projectId) return;
    updateProject(projectId, (project) => {
      const library = { ...(project.fileLibrary || {}) };
      const existing = library[artifact.name] || [];
      const version = existing.length + 1;
      library[artifact.name] = [...existing, { ...artifact, version, savedAt: nowIso() }];
      return { ...project, fileLibrary: library, updatedAt: nowIso() };
    });
  }, [updateProject]);

  const setActiveChat = (chatId) => {
    setStore((prev) => ({ ...prev, activeChatId: chatId }));
    setProjectMenuId(null);
    setChatMenuId(null);
  };

  const createStandaloneChat = useCallback(() => {
    const chat = createChat({ title: "New chat" });
    setStore((prev) => ({ ...prev, chats: [chat, ...prev.chats], activeChatId: chat.id }));
  }, []);

  const createProjectWithChat = useCallback(() => {
    const name = window.prompt("Project name", "My project");
    if (!name) return;
    const project = createProject(name.trim());
    const chat = createChat({ title: `${name.trim()} chat`, projectId: project.id, mode: "build" });
    setStore((prev) => ({
      ...prev,
      projects: [project, ...prev.projects],
      chats: [chat, ...prev.chats],
      activeChatId: chat.id,
    }));
  }, []);

  const createChatInProject = useCallback((projectId) => {
    const project = store.projects.find((p) => p.id === projectId);
    const chat = createChat({ title: project ? `${project.name} chat` : "New chat", projectId, mode: "build" });
    setStore((prev) => ({ ...prev, chats: [chat, ...prev.chats], activeChatId: chat.id }));
  }, [store.projects]);

  const renameChat = useCallback((chatId) => {
    const chat = store.chats.find((c) => c.id === chatId);
    const next = window.prompt("Rename chat", chat?.title || "");
    if (!next) return;
    updateChat(chatId, (c) => ({ ...c, title: next.trim(), updatedAt: nowIso() }));
  }, [store.chats, updateChat]);

  const renameProject = useCallback((projectId) => {
    const project = store.projects.find((p) => p.id === projectId);
    const next = window.prompt("Rename project", project?.name || "");
    if (!next) return;
    updateProject(projectId, (p) => ({ ...p, name: next.trim(), updatedAt: nowIso() }));
  }, [store.projects, updateProject]);

  const editProjectMemory = useCallback((projectId) => {
    const project = store.projects.find((p) => p.id === projectId);
    const next = window.prompt("Project memory / style notes", project?.memory || "");
    if (next == null) return;
    updateProject(projectId, (p) => ({ ...p, memory: next, updatedAt: nowIso() }));
  }, [store.projects, updateProject]);

  const deleteChat = useCallback((chatId) => {
    if (!window.confirm("Delete this chat?")) return;
    setStore((prev) => {
      const chats = prev.chats.filter((c) => c.id !== chatId);
      const nextActive = prev.activeChatId === chatId ? chats[0]?.id || createChat().id : prev.activeChatId;
      return chats.length
        ? { ...prev, chats, activeChatId: nextActive }
        : { ...defaultStore() };
    });
  }, []);

  const deleteProject = useCallback((projectId) => {
    if (!window.confirm("Delete this project and all its chats?")) return;
    setStore((prev) => {
      const chats = prev.chats.filter((c) => c.projectId !== projectId);
      const projects = prev.projects.filter((p) => p.id !== projectId);
      let activeChatId = prev.activeChatId;
      if (!chats.find((c) => c.id === activeChatId)) {
        activeChatId = chats[0]?.id;
      }
      if (!activeChatId) {
        const chat = createChat();
        return { ...prev, projects, chats: [chat, ...chats], activeChatId: chat.id };
      }
      return { ...prev, projects, chats, activeChatId };
    });
  }, []);

  const togglePinChat = (chatId) => updateChat(chatId, (c) => ({ ...c, pinned: !c.pinned, updatedAt: nowIso() }));
  const togglePinProject = (projectId) => updateProject(projectId, (p) => ({ ...p, pinned: !p.pinned, updatedAt: nowIso() }));

  const setChatMode = (chatId, mode) => {
    updateChat(chatId, (chat) => ({ ...chat, mode, updatedAt: nowIso() }));
    setModeOpen(false);
  };

  const setStudyMode = (chatId, studyMode) => updateChat(chatId, (chat) => ({ ...chat, studyMode, updatedAt: nowIso() }));

  const setProjectStyle = (projectId, stylePreset) => updateProject(projectId, (p) => ({ ...p, stylePreset, updatedAt: nowIso() }));

  const handleFiles = async (list) => {
    if (!list?.length) return;
    const normalized = await normalizeFiles(list);
    setAttachments((prev) => [...prev, ...normalized]);
  };

  const onDrop = async (event) => {
    event.preventDefault();
    setDragging(false);
    await handleFiles(event.dataTransfer.files);
  };

  const onScrollMessages = () => {
    const el = messagesRef.current;
    if (!el) return;
    shouldStickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
  };

  const startSpeech = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || voiceActive) return;
    const recognition = new SR();
    recognition.lang = /[א-ת]/.test(input) ? "he-IL" : "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    let finalText = "";
    recognition.onstart = () => setVoiceActive(true);
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      }
      setInput((prev) => `${prev} ${transcript}`.trim());
    };
    recognition.onend = () => {
      setVoiceActive(false);
      if (finalText.trim()) {
        setInput((prev) => prev.trim());
      }
    };
    recognition.onerror = () => setVoiceActive(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopSpeech = () => {
    recognitionRef.current?.stop?.();
    setVoiceActive(false);
  };

  const stopNetwork = () => {
    controllerRef.current?.abort?.();
    setLoading(false);
    setLoadingLabel("Stopped");
  };

  const openArtifact = (artifact) => {
    if (artifact.url && /^https?:/i.test(artifact.url)) {
      window.open(artifact.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (artifact.content) {
      const blob = new Blob([artifact.content], { type: artifact.mime || "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return;
    }
    if (artifact.dataUrl) window.open(artifact.dataUrl, "_blank", "noopener,noreferrer");
  };

  const downloadArtifact = (artifact) => {
    const link = document.createElement("a");
    link.download = artifact.name || "download";
    if (artifact.dataUrl) {
      link.href = artifact.dataUrl;
    } else if (artifact.url && /^https?:/i.test(artifact.url)) {
      link.href = artifact.url;
      link.target = "_blank";
    } else {
      const blob = new Blob([artifact.content || ""], { type: artifact.mime || "text/plain" });
      link.href = URL.createObjectURL(blob);
      setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    }
    link.click();
  };

  const selectArtifactPreview = (artifact) => {
    if (!activeChat) return;
    updateChat(activeChat.id, (chat) => ({ ...chat, previewArtifactId: artifact.id, updatedAt: nowIso() }));
    setStore((prev) => ({ ...prev, splitView: true }));
  };

  const speakText = (text) => {
    if (!("speechSynthesis" in window) || !text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[א-ת]/.test(text) ? "he-IL" : "en-US";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const send = async (overrideText = null) => {
    const text = (overrideText ?? input).trim();
    if (!text && !attachments.length) return;
    if (!activeChat) return;

    const userMessage = {
      id: uid(),
      role: "user",
      text,
      createdAt: nowIso(),
      timeLabel: nowLabel(),
      attachments: [...attachments],
    };
    const pendingId = uid();
    const pendingMessage = {
      id: pendingId,
      role: "assistant",
      text: "",
      fullText: "",
      createdAt: nowIso(),
      timeLabel: nowLabel(),
      pending: true,
      animating: false,
      artifacts: [],
      images: [],
      status: inferWorkingLabel(activeChat.mode),
    };

    setInput("");
    setAttachments([]);
    setLoading(true);
    setLoadingLabel(inferWorkingLabel(activeChat.mode));
    controllerRef.current = new AbortController();

    updateChat(activeChat.id, (chat) => ({
      ...chat,
      messages: [...chat.messages, userMessage, pendingMessage],
      updatedAt: nowIso(),
    }));

    shouldStickBottomRef.current = true;
    setTimeout(() => messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" }), 20);

    const activeProjectNow = store.projects.find((p) => p.id === activeChat.projectId) || null;

    try {
      const resp = await fetch("/api/playcraft/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...activeChat.messages, userMessage].map((m) => ({ role: m.role, text: m.text, attachments: m.attachments || [], artifacts: m.artifacts || [] })),
          mode: activeChat.mode,
          studyMode: activeChat.studyMode,
          project: activeProjectNow
            ? {
                name: activeProjectNow.name,
                memory: activeProjectNow.memory,
                stylePreset: activeProjectNow.stylePreset,
                files: Object.keys(activeProjectNow.fileLibrary || {}),
              }
            : null,
        }),
        signal: controllerRef.current.signal,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `Request failed (${resp.status})`);

      const artifacts = (data.artifacts || []).map((artifact) => ({ ...artifact, id: artifact.id || uid() }));
      const images = (data.images || []).map((img) => ({ ...img, id: img.id || uid() }));
      const finalText = data.reply || "Done.";
      const titleHint = data.titleHint || summarizeChatTitle([...activeChat.messages, userMessage, { role: "assistant", text: finalText }]);

      setStore((prev) => {
        const chats = prev.chats.map((chat) => {
          if (chat.id !== activeChat.id) return chat;
          const messages = chat.messages.map((msg) =>
            msg.id === pendingId
              ? {
                  ...msg,
                  pending: false,
                  status: "Done",
                  fullText: finalText,
                  text: "",
                  animating: true,
                  artifacts,
                  images,
                }
              : msg
          );
          return {
            ...chat,
            title: titleHint || chat.title,
            summary: finalText.slice(0, 180),
            messages,
            updatedAt: nowIso(),
            previewArtifactId: chat.previewArtifactId || artifacts[0]?.id || images[0]?.id || null,
          };
        });
        const projects = prev.projects.map((project) =>
          project.id === activeChat.projectId ? { ...project, updatedAt: nowIso() } : project
        );
        return { ...prev, chats, projects };
      });

      artifacts.forEach((artifact) => addArtifactToProject(activeChat.projectId, artifact));
      images.forEach((image) => addArtifactToProject(activeChat.projectId, { ...image, kind: "image", mime: "image/png" }));

      if (store.voiceReply && finalText) speakText(finalText);
    } catch (error) {
      const message = error?.name === "AbortError" ? "Stopped." : `⚠️ ${error.message}`;
      updateChat(activeChat.id, (chat) => ({
        ...chat,
        messages: chat.messages.map((msg) =>
          msg.id === pendingId ? { ...msg, pending: false, text: message, fullText: message, status: "Error", animating: false } : msg
        ),
      }));
    } finally {
      setLoading(false);
      controllerRef.current = null;
    }
  };

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("playcraft-search")?.focus();
      }
      if (event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        createStandaloneChat();
      }
      if (event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        createProjectWithChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createProjectWithChat, createStandaloneChat]);

  const selectedPreviewArtifact = useMemo(() => {
    if (!activeChat) return null;
    const allArtifacts = activeChat.messages.flatMap((m) => [...(m.artifacts || []), ...(m.images || [])]);
    return allArtifacts.find((item) => item.id === activeChat.previewArtifactId) || allArtifacts[0] || null;
  }, [activeChat]);

  const versionsItems = useMemo(() => {
    if (!versionsFor || !activeProject) return [];
    return activeProject.fileLibrary?.[versionsFor.name] || [];
  }, [versionsFor, activeProject]);

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { e.preventDefault(); if (e.target === e.currentTarget) setDragging(false); }}
      onDrop={onDrop}
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateColumns: store.splitView ? "310px minmax(0, 1fr) 420px" : "310px minmax(0, 1fr)",
        background: "linear-gradient(180deg, var(--bg), color-mix(in srgb, var(--bg) 85%, white))",
        color: "var(--text)",
        overflow: "hidden",
      }}
    >
      <style>{`
        :root { --accent: ${store.accent}; --accent-soft: ${store.accent}22; }
        * { box-sizing: border-box; }
        html, body { margin: 0; }
        body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        button, input, textarea, select { font: inherit; }
        .pc-btn { border: 1px solid var(--border); background: var(--panel); color: var(--text); border-radius: 14px; padding: 10px 12px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; transition: .18s ease; box-shadow: var(--shadow); }
        .pc-btn:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }
        .pc-btn.primary { background: var(--accent); color: white; border-color: transparent; box-shadow: 0 16px 30px color-mix(in srgb, var(--accent) 26%, transparent); }
        .pc-btn.ghost { box-shadow: none; background: transparent; }
        .pc-chip { border: 1px solid var(--border); background: var(--panel-2); color: var(--text); border-radius: 999px; padding: 8px 12px; display: inline-flex; align-items: center; gap: 7px; cursor: pointer; }
        .pc-chip:hover { border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }
        .pc-card { background: var(--panel); border: 1px solid var(--border); border-radius: 22px; box-shadow: var(--shadow); }
        .pc-item { border: 1px solid transparent; background: transparent; color: var(--text); border-radius: 16px; padding: 10px 12px; width: 100%; display: flex; align-items: center; gap: 10px; cursor: pointer; }
        .pc-item:hover, .pc-item.active { background: var(--panel-3); border-color: var(--border); }
        .pc-scroll::-webkit-scrollbar { width: 9px; height: 9px; }
        .pc-scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--text) 16%, transparent); border-radius: 999px; }
        .pc-statusdot { width: 8px; height: 8px; border-radius: 999px; background: var(--accent); box-shadow: 0 0 0 6px var(--accent-soft); animation: pulse 1.4s infinite; }
        @keyframes pulse { 0% { transform: scale(.88); opacity: .85; } 70% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(.88); opacity: .85; } }
        @keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
        .pc-shimmer { background: linear-gradient(90deg, var(--panel-2) 25%, color-mix(in srgb, var(--panel-2) 70%, white) 50%, var(--panel-2) 75%); background-size: 200% 100%; animation: shimmer 1.2s linear infinite; }
      `}</style>

      {dragging ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20, 28, 48, 0.18)", backdropFilter: "blur(6px)", zIndex: 100, display: "grid", placeItems: "center" }}>
          <div className="pc-card" style={{ padding: 30, textAlign: "center", minWidth: 280 }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>📎</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Drop files here</div>
            <div style={{ color: "var(--muted)" }}>Images, code, notes, screenshots — all good.</div>
          </div>
        </div>
      ) : null}

      <aside className="pc-card pc-scroll" style={{ margin: 16, marginRight: 8, padding: 14, overflow: "auto", display: "grid", gridTemplateRows: "auto auto auto 1fr auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 6 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: -0.4 }}>Playcraft</div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Build games, code, images, study</div>
          </div>
          <button className="pc-btn ghost" onClick={() => setStore((prev) => ({ ...prev, splitView: !prev.splitView }))}>Split</button>
        </div>

        <div style={{ display: "grid", gap: 10, padding: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button className="pc-btn" onClick={createStandaloneChat}><PlusIcon /> New chat</button>
            <button className="pc-btn" onClick={createProjectWithChat}><SparkIcon /> Add project</button>
          </div>
          <div style={{ position: "relative" }}>
            <SearchIcon />
            <input
              id="playcraft-search"
              value={store.search}
              onChange={(e) => setStore((prev) => ({ ...prev, search: e.target.value }))}
              placeholder="Search chats, projects, files…"
              style={{ width: "100%", padding: "12px 14px 12px 38px", borderRadius: 16, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", outline: "none" }}
            />
            <div style={{ position: "absolute", left: 12, top: 12, color: "var(--muted)" }}><SearchIcon /></div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, padding: 6 }}>
          <div className="pc-card" style={{ padding: 12, background: "var(--panel-2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>Appearance</div>
              <button className="pc-chip" onClick={() => setStore((prev) => ({ ...prev, voiceReply: !prev.voiceReply }))}>{store.voiceReply ? "🔊 Voice on" : "🔈 Voice off"}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
              <select value={store.theme} onChange={(e) => setStore((prev) => ({ ...prev, theme: e.target.value }))} style={{ padding: "10px 12px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)" }}>
                {Object.entries(THEMES).map(([id, theme]) => <option key={id} value={id}>{theme.name}</option>)}
              </select>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: 8, borderRadius: 14, border: "1px solid var(--border)", background: "var(--panel)" }}>
                {ACCENTS.map((color) => (
                  <button key={color} onClick={() => setStore((prev) => ({ ...prev, accent: color }))} title={color} style={{ width: 18, height: 18, borderRadius: 999, border: color === store.accent ? "2px solid var(--text)" : "2px solid transparent", background: color, cursor: "pointer" }} />
                ))}
              </div>
            </div>
          </div>
          <div className="pc-card" style={{ padding: 12, background: "var(--panel-2)" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Quick actions</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button className="pc-chip" onClick={() => activeChat && setChatMode(activeChat.id, "image")}>🖼️ Create image</button>
              <button className="pc-chip" onClick={() => activeChat && setChatMode(activeChat.id, "study")}>📚 Study and learn</button>
              <button className="pc-chip" onClick={() => activeChat && setChatMode(activeChat.id, "build")}>🛠️ Build</button>
              <button className="pc-chip" onClick={() => activeChat && setChatMode(activeChat.id, "arduino")}>🔌 Arduino</button>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12, padding: 6, minHeight: 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>Projects</div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {filteredProjects.map((project) => (
                <div key={project.id} className="pc-card" style={{ padding: 8, background: "var(--panel-2)", boxShadow: "none" }}>
                  <div className={`pc-item ${activeProject?.id === project.id ? "active" : ""}`} style={{ padding: 10, alignItems: "flex-start" }}>
                    <button onClick={() => {
                      const firstChat = chatsByProject[project.id]?.[0];
                      if (firstChat) setActiveChat(firstChat.id);
                    }} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "none", border: "none", color: "inherit", padding: 0, cursor: "pointer", flex: 1, textAlign: "left" }}>
                      <div style={{ width: 30, height: 30, borderRadius: 12, background: "var(--accent-soft)", display: "grid", placeItems: "center", fontSize: 14 }}>📁</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>{project.name} {project.pinned ? <PinIcon filled /> : null}</div>
                        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{project.memory ? project.memory.slice(0, 70) : `${chatsByProject[project.id]?.length || 0} chats • ${Object.keys(project.fileLibrary || {}).length} files`}</div>
                      </div>
                    </button>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="pc-chip" onClick={() => createChatInProject(project.id)}>+ Chat</button>
                      <button className="pc-chip" onClick={() => setProjectMenuId(projectMenuId === project.id ? null : project.id)}>•••</button>
                    </div>
                  </div>
                  {projectMenuId === project.id ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "6px 8px 10px 8px" }}>
                      <button className="pc-chip" onClick={() => renameProject(project.id)}><RenameIcon /> Rename</button>
                      <button className="pc-chip" onClick={() => togglePinProject(project.id)}><PinIcon filled={project.pinned} /> Pin</button>
                      <button className="pc-chip" onClick={() => editProjectMemory(project.id)}>🧠 Memory</button>
                      <select value={project.stylePreset} onChange={(e) => setProjectStyle(project.id, e.target.value)} style={{ padding: "8px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)" }}>
                        {STYLE_OPTIONS.map((style) => <option key={style} value={style}>{style}</option>)}
                      </select>
                      <button className="pc-chip" onClick={() => deleteProject(project.id)} style={{ color: "var(--danger)" }}><TrashIcon /> Delete</button>
                    </div>
                  ) : null}
                  <div style={{ display: "grid", gap: 6, padding: "0 6px 6px 6px" }}>
                    {(chatsByProject[project.id] || []).map((chat) => (
                      <button key={chat.id} className={`pc-item ${activeChat?.id === chat.id ? "active" : ""}`} onClick={() => setActiveChat(chat.id)} style={{ padding: "8px 10px", fontSize: 13 }}>
                        <span style={{ fontSize: 14 }}>💬</span>
                        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chat.title}</span>
                        {chat.pinned ? <PinIcon filled /> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Chats</div>
            <div style={{ display: "grid", gap: 8 }}>
              {filteredStandaloneChats.map((chat) => (
                <div key={chat.id} className={`pc-item ${activeChat?.id === chat.id ? "active" : ""}`} onClick={() => setActiveChat(chat.id)} style={{ justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 11, background: "var(--panel-3)", display: "grid", placeItems: "center" }}>💬</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>{chat.title}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{chat.summary || MODE_OPTIONS.find((m) => m.id === chat.mode)?.label}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                    <button className="pc-chip" onClick={() => togglePinChat(chat.id)}><PinIcon filled={chat.pinned} /></button>
                    <button className="pc-chip" onClick={() => setChatMenuId(chatMenuId === chat.id ? null : chat.id)}>•••</button>
                  </div>
                </div>
              ))}
              {chatMenuId ? (
                <div className="pc-card" style={{ padding: 8, background: "var(--panel-2)", boxShadow: "none" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="pc-chip" onClick={() => renameChat(chatMenuId)}><RenameIcon /> Rename</button>
                    <button className="pc-chip" onClick={() => togglePinChat(chatMenuId)}><PinIcon /> Pin</button>
                    <button className="pc-chip" onClick={() => deleteChat(chatMenuId)} style={{ color: "var(--danger)" }}><TrashIcon /> Delete</button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ padding: 6, color: "var(--muted)", fontSize: 12, display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span>⌘/Ctrl+K search</span>
          <span>Alt+N chat • Alt+P project</span>
        </div>
      </aside>

      <main className="pc-card" style={{ margin: 16, marginLeft: 8, marginRight: store.splitView ? 8 : 16, display: "grid", gridTemplateRows: "auto auto 1fr auto", minWidth: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 16, borderBottom: "1px solid var(--border)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 22, letterSpacing: -0.4 }}>{activeChat?.title || "Playcraft"}</h1>
              <div style={{ position: "relative" }} ref={modeRef}>
                <button ref={modeButtonRef} className="pc-chip" onClick={() => setModeOpen((v) => !v)}>
                  <span>{modeMeta.icon}</span> {modeMeta.label}
                </button>
                {modeOpen ? (
                  <div className="pc-card" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 30, padding: 8, minWidth: 220, display: "grid", gap: 6 }}>
                    {MODE_OPTIONS.map((option) => (
                      <button key={option.id} className={`pc-item ${activeMode === option.id ? "active" : ""}`} onClick={() => activeChat && setChatMode(activeChat.id, option.id)}>
                        <span>{option.icon}</span>
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {activeMode === "study" ? (
                <select value={activeChat?.studyMode || "explain"} onChange={(e) => activeChat && setStudyMode(activeChat.id, e.target.value)} style={{ padding: "9px 12px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)" }}>
                  {STUDY_OPTIONS.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                </select>
              ) : null}
              {activeProject ? (
                <div className="pc-chip">🎨 {activeProject.stylePreset}</div>
              ) : null}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
              {activeProject ? `${activeProject.name} • ${activeProject.memory || "Project memory ready"}` : "Standalone chat"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {loading ? <div className="pc-chip"><span className="pc-statusdot" /> {loadingLabel}</div> : null}
            <button className="pc-btn ghost" onClick={() => activeChat && renameChat(activeChat.id)}>Rename</button>
          </div>
        </div>

        {attachments.length ? (
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexWrap: "wrap", gap: 10 }}>
            {attachments.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="pc-card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 10, boxShadow: "none" }}>
                {file.kind === "image" ? <img src={file.dataUrl} alt={file.name} style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 12 }} /> : <div style={{ width: 52, height: 52, borderRadius: 12, background: "var(--panel-3)", display: "grid", placeItems: "center" }}>{file.kind === "text" ? "📝" : "📄"}</div>}
                <div>
                  <div style={{ fontWeight: 700, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>{file.kind}</div>
                </div>
                <button className="pc-chip" onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}>Remove</button>
              </div>
            ))}
          </div>
        ) : null}

        <div ref={messagesRef} className="pc-scroll" onScroll={onScrollMessages} style={{ overflow: "auto", padding: 20, minHeight: 0 }}>
          <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gap: 16 }}>
            {(activeChat?.messages?.length ? activeChat.messages : []).map((msg) => (
              <div key={msg.id} style={{ display: "grid", justifyItems: msg.role === "user" ? "end" : "start" }}>
                <div style={{ maxWidth: "min(820px, 92%)", background: msg.role === "user" ? "var(--bubble-user)" : "var(--bubble-ai)", border: "1px solid var(--border)", borderRadius: 24, padding: 16, boxShadow: "var(--shadow)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 14, background: msg.role === "user" ? "var(--accent-soft)" : "var(--panel-3)", display: "grid", placeItems: "center", fontSize: 16 }}>{msg.role === "user" ? "🧑" : "✨"}</div>
                      <div>
                        <div style={{ fontWeight: 800 }}>{msg.role === "user" ? "You" : "Playcraft"}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{msg.timeLabel || nowLabel()}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {msg.pending ? <div className="pc-chip"><span className="pc-statusdot" /> {msg.status || "Thinking…"}</div> : null}
                      {msg.role === "assistant" && msg.text ? <button className="pc-chip" onClick={() => speakText(msg.fullText || msg.text)}>Speak</button> : null}
                    </div>
                  </div>

                  {msg.attachments?.length ? (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                      {msg.attachments.map((file, idx) => (
                        <div key={idx} className="pc-card" style={{ padding: 8, display: "flex", alignItems: "center", gap: 10, boxShadow: "none" }}>
                          {file.kind === "image" ? <img src={file.dataUrl} alt={file.name} style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover" }} /> : <div style={{ width: 50, height: 50, borderRadius: 12, background: "var(--panel-3)", display: "grid", placeItems: "center" }}>{file.kind === "text" ? "📝" : "📄"}</div>}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>{file.kind}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {(msg.artifacts?.length || msg.images?.length) ? (
                    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6, marginBottom: 14 }}>
                      {[...(msg.artifacts || []), ...(msg.images || [])].map((artifact) => {
                        const versionCount = activeProject?.fileLibrary?.[artifact.name]?.length || 1;
                        return (
                          <ArtifactCard
                            key={artifact.id}
                            artifact={{ ...artifact, versionCount }}
                            onOpen={openArtifact}
                            onDownload={downloadArtifact}
                            onPreview={selectArtifactPreview}
                            onVersions={(item) => setVersionsFor(item)}
                          />
                        );
                      })}
                    </div>
                  ) : null}

                  {msg.pending && !msg.text ? <div className="pc-shimmer" style={{ height: 92, borderRadius: 18 }} /> : <MessageBody text={msg.text || ""} />}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", padding: 16 }}>
          <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ position: "relative" }} ref={plusRef}>
                <button ref={plusButtonRef} className="pc-btn" onClick={() => setPlusOpen((v) => !v)}><PlusIcon /> Add</button>
                {plusOpen ? (
                  <div className="pc-card" style={{ position: "absolute", bottom: "calc(100% + 10px)", left: 0, zIndex: 40, padding: 8, minWidth: 220, display: "grid", gap: 6 }}>
                    <button className="pc-item" onClick={() => { fileInputRef.current?.click(); setPlusOpen(false); }}><span>📎</span><span>Add file</span></button>
                    <button className="pc-item" onClick={() => { activeChat && setChatMode(activeChat.id, "study"); setPlusOpen(false); }}><span>📚</span><span>Study and learn</span></button>
                    <button className="pc-item" onClick={() => { activeChat && setChatMode(activeChat.id, "image"); setPlusOpen(false); }}><span>🖼️</span><span>Create image</span></button>
                    <button className="pc-item" onClick={() => { activeChat && setChatMode(activeChat.id, "build"); setPlusOpen(false); }}><span>🛠️</span><span>Build game / app</span></button>
                    <button className="pc-item" onClick={() => { activeProject ? createChatInProject(activeProject.id) : createProjectWithChat(); setPlusOpen(false); }}><span>📁</span><span>{activeProject ? "New chat in project" : "Add project"}</span></button>
                  </div>
                ) : null}
              </div>

              <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => handleFiles(e.target.files)} />

              <button
                className={`pc-btn ${voiceActive ? "primary" : ""}`}
                onMouseDown={() => speechSupported && startSpeech()}
                onMouseUp={() => voiceActive && stopSpeech()}
                onTouchStart={() => speechSupported && startSpeech()}
                onTouchEnd={() => voiceActive && stopSpeech()}
                onClick={() => speechSupported && (voiceActive ? stopSpeech() : startSpeech())}
                title={speechSupported ? "Hold to talk or tap to start" : "Speech not supported in this browser"}
              >
                <MicrophoneIcon active={voiceActive} />
                {voiceActive ? "Listening…" : "Talk"}
              </button>

              {activeProject ? <div className="pc-chip">📁 {activeProject.name}</div> : <div className="pc-chip">💬 Standalone chat</div>}
              <div className="pc-chip">Mode: {modeMeta.label}</div>
              {loading ? <button className="pc-btn ghost" onClick={stopNetwork}>Stop</button> : null}
            </div>

            <div className="pc-card" style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={activeMode === "build" ? "Describe the game or app you want…" : activeMode === "image" ? "Describe the image you want, or upload reference screenshots…" : "Ask anything — games, code, study, ESP32, design…"}
                style={{ width: "100%", minHeight: 70, maxHeight: 220, resize: "none", border: "none", outline: "none", background: "transparent", color: "var(--text)", lineHeight: 1.7, fontSize: 15 }}
              />
              <div style={{ display: "grid", gap: 8 }}>
                <button className="pc-btn primary" onClick={() => send()}><ArrowIcon /> Send</button>
                {activeChat?.messages?.some((m) => m.animating) ? <button className="pc-btn" onClick={() => updateChat(activeChat.id, (chat) => ({ ...chat, messages: chat.messages.map((m) => m.animating ? { ...m, text: m.fullText || m.text, animating: false } : m) }))}>Finish reply</button> : null}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "var(--muted)", fontSize: 12 }}>
              <span>Follow-up works in the same chat. You can keep scrolling while Playcraft is typing.</span>
              <span>Enter = send • Shift+Enter = new line</span>
            </div>
          </div>
        </div>
      </main>

      {store.splitView ? (
        <section className="pc-card pc-scroll" style={{ margin: 16, marginLeft: 8, padding: 14, overflow: "auto", display: "grid", gridTemplateRows: "auto 1fr auto", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 6 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Preview & files</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{selectedPreviewArtifact ? selectedPreviewArtifact.name : "Pick a file card to preview"}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedPreviewArtifact ? <button className="pc-chip" onClick={() => openArtifact(selectedPreviewArtifact)}>Open</button> : null}
              {selectedPreviewArtifact ? <button className="pc-chip" onClick={() => downloadArtifact(selectedPreviewArtifact)}>Download</button> : null}
            </div>
          </div>
          <div className="pc-card" style={{ background: "var(--preview-bg)", minHeight: 0, overflow: "hidden", display: "grid", alignContent: "stretch" }}>
            {selectedPreviewArtifact ? (
              selectedPreviewArtifact.kind === "image" || selectedPreviewArtifact.mime?.startsWith("image/") ? (
                <div style={{ padding: 12 }}><img src={selectedPreviewArtifact.url || selectedPreviewArtifact.dataUrl} alt={selectedPreviewArtifact.name} style={{ width: "100%", borderRadius: 18, border: "1px solid var(--border)" }} /></div>
              ) : selectedPreviewArtifact.kind === "html" || /html/i.test(selectedPreviewArtifact.name) ? (
                <iframe title={selectedPreviewArtifact.name} srcDoc={selectedPreviewArtifact.content} style={{ width: "100%", height: "100%", minHeight: 420, border: "none" }} />
              ) : (
                <pre style={{ margin: 0, padding: 16, overflow: "auto", fontSize: 13, lineHeight: 1.6 }}>{selectedPreviewArtifact.content || "No preview available."}</pre>
              )
            ) : (
              <div style={{ display: "grid", placeItems: "center", minHeight: 420, color: "var(--muted)", textAlign: "center", padding: 24 }}>
                <div>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>🪄</div>
                  <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Preview shows up here</div>
                  <div>Generate a game, file, or image and open it straight in the browser.</div>
                </div>
              </div>
            )}
          </div>
          <div style={{ paddingTop: 14, display: "grid", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>Project files</div>
            <div style={{ display: "grid", gap: 8 }}>
              {activeProject && Object.keys(activeProject.fileLibrary || {}).length ? Object.entries(activeProject.fileLibrary).map(([name, versions]) => {
                const latest = versions[versions.length - 1];
                return (
                  <div key={name} className="pc-card" style={{ padding: 10, boxShadow: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{versions.length} version{versions.length > 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="pc-chip" onClick={() => selectArtifactPreview({ ...latest, versionCount: versions.length })}>Preview</button>
                      <button className="pc-chip" onClick={() => setVersionsFor({ name })}>Versions</button>
                    </div>
                  </div>
                );
              }) : <div style={{ color: "var(--muted)", fontSize: 13 }}>No saved files yet.</div>}
            </div>
          </div>
        </section>
      ) : null}

      {versionsFor ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.18)", display: "grid", placeItems: "center", zIndex: 70 }} onClick={() => setVersionsFor(null)}>
          <div className="pc-card pc-scroll" onClick={(e) => e.stopPropagation()} style={{ width: "min(640px, 92vw)", maxHeight: "76vh", overflow: "auto", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{versionsFor.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Version history</div>
              </div>
              <button className="pc-chip" onClick={() => setVersionsFor(null)}>Close</button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {versionsItems.slice().reverse().map((version, idx) => (
                <div key={idx} className="pc-card" style={{ padding: 12, boxShadow: "none", display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>v{version.version || versionsItems.length - idx}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{new Date(version.savedAt).toLocaleString()}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="pc-chip" onClick={() => selectArtifactPreview({ ...version, versionCount: versionsItems.length })}>Preview</button>
                    <button className="pc-chip" onClick={() => openArtifact(version)}>Open</button>
                    <button className="pc-chip" onClick={() => downloadArtifact(version)}>Download</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
