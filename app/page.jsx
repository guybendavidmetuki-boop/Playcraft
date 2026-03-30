"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const uid = () => Math.random().toString(36).slice(2, 9);
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const TEXT_EXTENSIONS = [
  ".txt", ".md", ".json", ".js", ".jsx", ".ts", ".tsx", ".css", ".html", ".htm",
  ".xml", ".csv", ".yml", ".yaml", ".py", ".java", ".c", ".cpp", ".cs", ".php",
  ".rb", ".go", ".rs", ".swift", ".sql", ".sh"
];

const NAV_ITEMS = [
  { id: "search", label: "Search", icon: SearchIcon },
  { id: "customize", label: "Customize", icon: SlidersIcon },
  { id: "chats", label: "Chats", icon: ChatBubbleIcon },
  { id: "projects", label: "Projects", icon: BriefcaseIcon },
  { id: "artifacts", label: "Artifacts", icon: SparklesIcon },
  { id: "code", label: "Code", icon: CodeIcon }
];

const STARTER_PROMPTS = [
  "Build a polished Snake game in a single HTML file",
  "Create a top-down shooter with score, restart, and difficulty scaling",
  "Make a Tetris clone with keyboard controls and a clean HUD",
  "Fix my current game and improve controls, polish, and feel"
];

const QUICK_ACTIONS = [
  { label: "Add files or photos", icon: PaperclipIcon },
  { label: "Add to project", icon: FolderPlusIcon, hasArrow: true },
  { label: "Skills", icon: GridIcon, hasArrow: true },
  { label: "Add connectors", icon: PlugIcon },
  { label: "Web search", icon: GlobeIcon, selected: true },
  { label: "Use style", icon: BrushIcon, hasArrow: true }
];

function isProbablyTextFile(file) {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("javascript") ||
    type.includes("typescript") ||
    type.includes("xml") ||
    TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))
  );
}

function stripWrapper(text = "") {
  return text.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function extractHtmlFromReply(text = "") {
  if (!text) return "";

  const tagMatch = text.match(/<game_html>([\s\S]*?)<\/game_html>/i);
  if (tagMatch?.[1]) return stripWrapper(tagMatch[1]);

  const fenced = text.match(/```html\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1] && /<(?:!doctype|html|body|canvas|script)/i.test(fenced[1])) return stripWrapper(fenced[1]);

  const doctypeIndex = text.search(/<!doctype html>/i);
  if (doctypeIndex >= 0) return text.slice(doctypeIndex).trim();

  const htmlIndex = text.search(/<html[\s>]/i);
  if (htmlIndex >= 0) return text.slice(htmlIndex).trim();

  return "";
}

function extractSummaryFromReply(text = "") {
  return text.match(/<game_summary>([\s\S]*?)<\/game_summary>/i)?.[1]?.trim() || "";
}

function cleanReplyForDisplay(text = "") {
  return text
    .replace(/<game_summary>[\s\S]*?<\/game_summary>/gi, "")
    .replace(/<game_html>[\s\S]*?<\/game_html>/gi, "")
    .trim();
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text) {
  if (!text) return false;
  await navigator.clipboard.writeText(text);
  return true;
}

function readFileForUi(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : "";
      resolve({
        id: uid(),
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl,
        base64,
        text: null
      });
    };
    reader.readAsDataURL(file);
  });
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  });
}

function SpinnerFlower() {
  return (
    <div style={{ position: "relative", width: 26, height: 26 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 3,
            height: 11,
            borderRadius: 999,
            background: i % 2 === 0 ? "#d67a45" : "#f0a06a",
            transform: `translate(-50%, -50%) rotate(${i * 45}deg) translateY(-9px)`,
            opacity: 0.35 + (i / 16),
            animation: "petalPulse 1s ease-in-out infinite",
            animationDelay: `${i * 70}ms`
          }}
        />
      ))}
    </div>
  );
}

function CodeAttachmentCard({ html, onPreview, onCopy, onDownload }) {
  return (
    <div
      style={{
        marginTop: 14,
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "linear-gradient(180deg, rgba(45,44,41,0.86) 0%, rgba(34,33,31,0.98) 100%)",
        display: "flex",
        alignItems: "stretch",
        overflow: "hidden",
        minHeight: 94
      }}
    >
      <div
        style={{
          width: 92,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          background: "linear-gradient(180deg, rgba(58,56,51,0.45), rgba(31,30,28,0.2))"
        }}
      >
        <div
          style={{
            width: 54,
            height: 72,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "linear-gradient(180deg, rgba(54,52,48,0.95), rgba(35,34,31,0.95))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#9d9890"
          }}
        >
          <CodeIcon />
        </div>
      </div>

      <div style={{ flex: 1, padding: "18px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ color: "#f3efe8", fontSize: 16, fontWeight: 500 }}>game.html</div>
            <div style={{ color: "#a7a096", fontSize: 13, marginTop: 4 }}>Code · HTML game ready</div>
          </div>
          <button
            onClick={() => onPreview(html)}
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.02)",
              color: "#f2eee7",
              padding: "12px 18px",
              borderRadius: 14,
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            Open preview
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <MiniActionButton label="Copy code" onClick={onCopy} />
          <MiniActionButton label="Download" onClick={onDownload} />
        </div>
      </div>
    </div>
  );
}

function MiniActionButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.02)",
        color: "#cbc4ba",
        padding: "8px 12px",
        borderRadius: 12,
        fontSize: 12,
        cursor: "pointer"
      }}
    >
      {label}
    </button>
  );
}

function ChatMessage({ msg, onPreviewHtml, onCopyHtml, onDownloadHtml }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 36 }}>
        <div
          style={{
            maxWidth: 660,
            background: "#0b0b0b",
            color: "#f6f1ea",
            padding: "18px 22px",
            borderRadius: 18,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            fontSize: 15,
            lineHeight: 1.75,
            whiteSpace: "pre-wrap"
          }}
        >
          {msg.content}
          {!!msg.files?.length && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {msg.files.map((file) => (
                <div
                  key={file.id}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#d0c8bc",
                    background: "rgba(255,255,255,0.04)",
                    fontSize: 12
                  }}
                >
                  📎 {file.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 34 }}>
      {msg.pending ? (
        <div style={{ paddingTop: 10 }}>
          <SpinnerFlower />
        </div>
      ) : (
        <>
          {!!msg.summary && (
            <div style={{ color: "#a9a297", fontSize: 14, marginBottom: 12 }}>
              {msg.summary}
            </div>
          )}

          <div
            style={{
              color: "#ece6dc",
              fontSize: 15,
              lineHeight: 1.9,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word"
            }}
          >
            {msg.content}
          </div>

          {!!msg.generatedHtml && (
            <CodeAttachmentCard
              html={msg.generatedHtml}
              onPreview={onPreviewHtml}
              onCopy={() => onCopyHtml(msg.generatedHtml)}
              onDownload={() => onDownloadHtml(msg.generatedHtml)}
            />
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20, color: "#9c968e" }}>
            <GhostIconButton><CopySmallIcon /></GhostIconButton>
            <GhostIconButton><ThumbUpIcon /></GhostIconButton>
            <GhostIconButton><ThumbDownIcon /></GhostIconButton>
            <GhostIconButton><RefreshIcon /></GhostIconButton>
          </div>
        </>
      )}
    </div>
  );
}

function GhostIconButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        border: "none",
        background: "transparent",
        color: "#9d968d",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: onClick ? "pointer" : "default"
      }}
    >
      {children}
    </button>
  );
}

export default function App() {
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [openChatMenuId, setOpenChatMenuId] = useState(null);
  const [hoveredChatId, setHoveredChatId] = useState(null);
  const [toast, setToast] = useState("");

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const quickMenuRef = useRef(null);
  const abortRef = useRef(null);

  const activeChat = chats.find((chat) => chat.id === activeId);
  const canSend = (!!input.trim() || attachments.length > 0) && !loading;

  useEffect(() => {
    if (!chats.length) {
      const id = uid();
      setChats([{ id, title: "New chat", messages: [] }]);
      setActiveId(id);
    }
  }, [chats.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages?.length, loading]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function onClickOutside(event) {
      if (quickMenuRef.current && !quickMenuRef.current.contains(event.target)) {
        setShowQuickMenu(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const createChat = useCallback(() => {
    const id = uid();
    setChats((prev) => [{ id, title: "New chat", messages: [] }, ...prev]);
    setActiveId(id);
    setInput("");
    setAttachments([]);
    setPreviewHtml("");
    setOpenChatMenuId(null);
    setShowQuickMenu(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const deleteChat = useCallback((id) => {
    setChats((prev) => {
      const next = prev.filter((chat) => chat.id !== id);
      if (activeId === id) {
        setActiveId(next[0]?.id || null);
        setPreviewHtml("");
      }
      return next;
    });
    setOpenChatMenuId(null);
  }, [activeId]);

  const updateTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, []);

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    const loaded = await Promise.all(files.map(async (file) => {
      const uiFile = await readFileForUi(file);
      if (isProbablyTextFile(file)) {
        try {
          uiFile.text = await readTextFile(file);
        } catch {
          uiFile.text = null;
        }
      }
      return uiFile;
    }));

    setAttachments((prev) => [...prev, ...loaded]);
  }, []);

  const sendMessage = useCallback(async (overrideText) => {
    const text = typeof overrideText === "string" ? overrideText.trim() : input.trim();
    if ((!text && !attachments.length) || loading || !activeId) return;

    const userMessage = {
      id: uid(),
      role: "user",
      content: text,
      files: [...attachments],
      time: now()
    };

    const pendingId = uid();
    const pendingMessage = {
      id: pendingId,
      role: "assistant",
      content: "",
      summary: "",
      generatedHtml: "",
      pending: true,
      time: now()
    };

    const history = [...(activeChat?.messages || []), userMessage];

    setChats((prev) => prev.map((chat) => {
      if (chat.id !== activeId) return chat;
      const title = chat.messages.length === 0 && text
        ? text.slice(0, 42) + (text.length > 42 ? "…" : "")
        : chat.title;
      return { ...chat, title, messages: [...chat.messages, userMessage, pendingMessage] };
    }));

    setInput("");
    setAttachments([]);
    setLoading(true);
    setShowQuickMenu(false);
    setOpenChatMenuId(null);
    abortRef.current = new AbortController();
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const resp = await fetch("/api/playcraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: abortRef.current.signal
      });

      const json = await resp.json();
      if (!resp.ok || json?.error) {
        throw new Error(json?.error || `Request failed with status ${resp.status}`);
      }

      const reply = cleanReplyForDisplay(json.reply || "") || json.summary || "Done.";
      const summary = json.summary || extractSummaryFromReply(json.reply || "");
      const generatedHtml = json.generatedHtml || extractHtmlFromReply(json.reply || "");

      setChats((prev) => prev.map((chat) => {
        if (chat.id !== activeId) return chat;
        return {
          ...chat,
          messages: chat.messages.map((message) => (
            message.id === pendingId
              ? { ...message, pending: false, content: reply, summary, generatedHtml }
              : message
          ))
        };
      }));

      if (generatedHtml) setPreviewHtml(generatedHtml);
    } catch (error) {
      const aborted = error?.name === "AbortError";
      setChats((prev) => prev.map((chat) => {
        if (chat.id !== activeId) return chat;
        return {
          ...chat,
          messages: chat.messages.map((message) => (
            message.id === pendingId
              ? {
                  ...message,
                  pending: false,
                  content: aborted ? "Stopped." : `⚠️ ${error?.message || "Something went wrong."}`,
                  summary: "",
                  generatedHtml: ""
                }
              : message
          ))
        };
      }));
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }, [activeChat?.messages, activeId, attachments, input, loading]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendRepairRequest = useCallback(() => {
    if (!previewHtml || loading) return;
    sendMessage("Repair the current game, keep the core idea, improve controls, polish, UX, restart flow, and fix any logic issues.");
  }, [loading, previewHtml, sendMessage]);

  const onKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const copyHtml = useCallback(async (html) => {
    const ok = await copyToClipboard(html);
    setToast(ok ? "Copied" : "Copy failed");
  }, []);

  const downloadHtml = useCallback((html) => {
    downloadTextFile("game.html", html);
    setToast("Downloaded");
  }, []);

  const renderedMessages = useMemo(() => activeChat?.messages || [], [activeChat?.messages]);

  return (
    <div style={{ minHeight: "100vh", background: "#23211d", color: "#f5efe6", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #23211d; }
        body { color: #f5efe6; }
        button, input, textarea { font-family: inherit; }
        textarea::placeholder { color: #9d968c; }
        @keyframes petalPulse {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 1; }
        }
        @media (max-width: 1080px) {
          .gf-sidebar { display: none !important; }
          .gf-main { width: 100% !important; }
          .gf-composer-wrap { padding-left: 18px !important; padding-right: 18px !important; }
          .gf-message-shell { width: 100% !important; max-width: 100% !important; padding-left: 18px !important; padding-right: 18px !important; }
          .gf-title-row { padding-left: 18px !important; padding-right: 18px !important; }
        }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh", position: "relative" }}>
        <aside
          className="gf-sidebar"
          style={{
            width: 308,
            flexShrink: 0,
            borderRight: "1px solid rgba(255,255,255,0.08)",
            background: "linear-gradient(180deg, #24221e 0%, #1f1d19 100%)",
            display: "flex",
            flexDirection: "column"
          }}
        >
          <div style={{ height: 48, borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", padding: "0 12px", gap: 12, color: "#bdb6ac" }}>
            <SquareSplitIcon />
            <ArrowLeftIcon />
            <ArrowRightIcon />
          </div>

          <div style={{ padding: 12 }}>
            <button
              onClick={createChat}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "#121212",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#f5f0e7",
                padding: "12px 14px",
                borderRadius: 12,
                fontSize: 17,
                cursor: "pointer",
                justifyContent: "flex-start"
              }}
            >
              <CirclePlusIcon />
              <span>New chat</span>
              <span style={{ marginLeft: "auto", color: "#aaa295", display: "flex", gap: 8 }}>
                <LinkSmallIcon />
                <SparklesTinyIcon />
              </span>
            </button>
          </div>

          <div style={{ padding: "0 8px" }}>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 10px",
                    background: "transparent",
                    border: "none",
                    color: "#ece6dc",
                    fontSize: 18,
                    cursor: "pointer",
                    borderRadius: 12,
                    textAlign: "left"
                  }}
                >
                  <Icon />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div style={{ padding: "18px 16px 10px", color: "#8c857b", fontSize: 13, fontWeight: 500 }}>Recents</div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
            {chats.map((chat) => (
              <div
                key={chat.id}
                style={{ position: "relative" }}
                onMouseEnter={() => setHoveredChatId(chat.id)}
                onMouseLeave={() => setHoveredChatId(null)}
              >
                <button
                  onClick={() => {
                    setActiveId(chat.id);
                    setPreviewHtml("");
                    setOpenChatMenuId(null);
                  }}
                  style={{
                    width: "100%",
                    marginBottom: 4,
                    padding: "12px 10px",
                    borderRadius: 12,
                    border: "none",
                    background: chat.id === activeId ? "#111111" : "transparent",
                    color: chat.id === activeId ? "#f2ede4" : "#d8d1c7",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    textAlign: "left"
                  }}
                >
                  <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 14 }}>{chat.title}</span>
                  {(hoveredChatId === chat.id || openChatMenuId === chat.id) && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenChatMenuId(openChatMenuId === chat.id ? null : chat.id);
                      }}
                      style={{ color: "#b2ab9f", padding: 4, display: "flex" }}
                    >
                      <DotsIcon />
                    </span>
                  )}
                </button>

                {openChatMenuId === chat.id && (
                  <div
                    style={{
                      position: "absolute",
                      left: 118,
                      top: 38,
                      width: 172,
                      borderRadius: 16,
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "#302d29",
                      boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
                      padding: 12,
                      zIndex: 20
                    }}
                  >
                    <SidebarMenuItem label="Star" icon={<StarIcon />} />
                    <SidebarMenuItem label="Rename" icon={<PencilIcon />} />
                    <SidebarMenuItem label="Add to project" icon={<FolderPlusIcon />} />
                    <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "8px 0" }} />
                    <SidebarMenuItem label="Delete" icon={<TrashRedIcon />} danger onClick={() => deleteChat(chat.id)} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ padding: 14, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 999, background: "#d9d4cc", color: "#26231f", display: "grid", placeItems: "center", fontWeight: 700 }}>G</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#f3eee5", fontSize: 16 }}>guy</div>
              <div style={{ color: "#9f988d", fontSize: 14 }}>Free plan</div>
            </div>
            <div style={{ display: "flex", gap: 10, color: "#a59d92" }}>
              <DownloadMiniIcon />
              <ChevronUpSmall />
            </div>
          </div>
        </aside>

        <main className="gf-main" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div className="gf-title-row" style={{ height: 48, borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 42px", color: "#d4cec3" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16 }}>
              <span>Playcraft AI</span>
              <ChevronDownIcon />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 18, color: "#b5aea3" }}>
              <ShareIcon />
              <ReplyArrowIcon />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", paddingBottom: 240 }}>
            <div className="gf-message-shell" style={{ width: "min(860px, 100%)", margin: "0 auto", padding: "28px 36px 0" }}>
              {!renderedMessages.length ? (
                <div style={{ paddingTop: 82 }}>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <div style={{ maxWidth: 660, width: "100%", background: "#0b0b0b", borderRadius: 18, padding: "18px 22px", lineHeight: 1.7, fontSize: 15 }}>
                      Tell me what game you want to build, repair, or restyle.
                    </div>
                  </div>

                  <div style={{ marginTop: 44, color: "#e8e2d8", lineHeight: 1.9, fontSize: 15 }}>
                    <div style={{ color: "#a59e92", marginBottom: 18 }}>Playcraft is ready to build, fix, and polish HTML5 games.</div>
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => {
                          setInput(prompt);
                          requestAnimationFrame(updateTextareaHeight);
                          textareaRef.current?.focus();
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "14px 16px",
                          marginBottom: 10,
                          borderRadius: 16,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.03)",
                          color: "#f0eadd",
                          fontSize: 14,
                          cursor: "pointer"
                        }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                renderedMessages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    msg={msg}
                    onPreviewHtml={(html) => setPreviewHtml(html)}
                    onCopyHtml={copyHtml}
                    onDownloadHtml={downloadHtml}
                  />
                ))
              )}

              <div ref={bottomRef} style={{ height: 4 }} />
            </div>
          </div>

          <div className="gf-composer-wrap" style={{ position: "fixed", left: 308, right: 0, bottom: 0, padding: "0 30px 22px", background: "linear-gradient(180deg, rgba(35,33,29,0) 0%, rgba(35,33,29,0.82) 24%, rgba(35,33,29,0.98) 100%)" }}>
            <div style={{ width: "min(860px, calc(100vw - 60px))", margin: "0 auto", position: "relative" }}>
              <div style={{ background: "#0b0b0b", color: "#ddd6cb", borderRadius: "16px 16px 0 0", padding: "14px 18px", fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Ready to build or improve your next game</span>
                <span style={{ textDecoration: "underline", cursor: "pointer" }}>Upgrade</span>
              </div>

              <div style={{ borderRadius: 24, border: "1px solid rgba(255,255,255,0.08)", background: "#3a3834", padding: "16px 18px 16px", boxShadow: "0 10px 40px rgba(0,0,0,0.24)" }}>
                {!!attachments.length && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {attachments.map((file, index) => (
                      <div key={file.id || index} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 12, background: "rgba(255,255,255,0.06)", color: "#ece7de", fontSize: 12 }}>
                        <span>{file.type?.startsWith("image/") ? "🖼️" : "📄"}</span>
                        <span style={{ maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                        <button onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))} style={{ background: "transparent", border: "none", color: "#bdb6ad", cursor: "pointer" }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  disabled={loading}
                  onChange={(e) => {
                    setInput(e.target.value);
                    updateTextareaHeight();
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Describe the game, paste code, or ask for a follow-up…"
                  style={{
                    width: "100%",
                    minHeight: 70,
                    maxHeight: 220,
                    resize: "none",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    color: "#f4eee6",
                    fontSize: 16,
                    lineHeight: 1.65,
                    padding: 0
                  }}
                />

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
                  <div style={{ position: "relative" }} ref={quickMenuRef}>
                    <button
                      onClick={() => setShowQuickMenu((prev) => !prev)}
                      style={{ width: 38, height: 38, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#dfd8cd", display: "grid", placeItems: "center", cursor: "pointer" }}
                    >
                      <CirclePlusIcon size={18} />
                    </button>

                    {showQuickMenu && (
                      <div style={{ position: "absolute", left: 0, bottom: 52, width: 246, borderRadius: 18, border: "1px solid rgba(255,255,255,0.1)", background: "#302d29", boxShadow: "0 24px 60px rgba(0,0,0,0.36)", padding: 12, zIndex: 40 }}>
                        {QUICK_ACTIONS.map((item) => (
                          <button
                            key={item.label}
                            onClick={() => {
                              if (item.label === "Add files or photos") fileInputRef.current?.click();
                              setShowQuickMenu(item.label === "Add files or photos" ? false : true);
                            }}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              justifyContent: "space-between",
                              padding: "12px 10px",
                              borderRadius: 12,
                              background: item.selected ? "rgba(51,109,255,0.08)" : "transparent",
                              border: "none",
                              color: item.selected ? "#5da3ff" : "#eee8de",
                              fontSize: 14,
                              cursor: "pointer"
                            }}
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{ width: 18, display: "flex", justifyContent: "center" }}><item.icon /></span>
                              <span>{item.label}</span>
                            </span>
                            <span style={{ color: item.selected ? "#5da3ff" : "#a59e92" }}>
                              {item.selected ? <CheckIcon /> : item.hasArrow ? <ChevronRightIcon /> : null}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ marginLeft: "auto", color: "#cfc8bc", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>Sonnet 4.6 Extended</span>
                    <ChevronDownIcon small />
                  </div>

                  {loading ? (
                    <button
                      onClick={stopGeneration}
                      style={{ width: 38, height: 38, borderRadius: 12, border: "none", background: "#d67a45", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}
                      title="Stop"
                    >
                      <StopIcon />
                    </button>
                  ) : (
                    <button
                      onClick={() => sendMessage()}
                      disabled={!canSend}
                      style={{ width: 38, height: 38, borderRadius: 12, border: "none", background: canSend ? "#d67a45" : "#635f59", color: canSend ? "#fff" : "#c2bbb1", display: "grid", placeItems: "center", cursor: canSend ? "pointer" : "default" }}
                    >
                      <ArrowUpIcon />
                    </button>
                  )}
                </div>
              </div>

              <div style={{ textAlign: "center", color: "#999186", fontSize: 13, paddingTop: 12 }}>Playcraft can make mistakes. Review generated code before shipping.</div>
            </div>
          </div>
        </main>
      </div>

      <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />

      {!!previewHtml && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.56)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "min(1200px, 96vw)", height: "min(820px, 92vh)", borderRadius: 24, border: "1px solid rgba(255,255,255,0.08)", background: "#1f1d19", overflow: "hidden", boxShadow: "0 40px 120px rgba(0,0,0,0.46)", display: "flex", flexDirection: "column" }}>
            <div style={{ height: 62, borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px" }}>
              <div style={{ color: "#f3ede4", fontSize: 16 }}>Live preview</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <MiniActionButton label="Copy HTML" onClick={() => copyHtml(previewHtml)} />
                <MiniActionButton label="Download" onClick={() => downloadHtml(previewHtml)} />
                <MiniActionButton label="Repair + improve" onClick={sendRepairRequest} />
                <button onClick={() => setPreviewHtml("")} style={{ width: 38, height: 38, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#e7e1d7", cursor: "pointer" }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, background: "#111" }}>
              <iframe title="Game preview" srcDoc={previewHtml} style={{ width: "100%", height: "100%", border: "none", background: "#111" }} sandbox="allow-scripts allow-same-origin" />
            </div>
          </div>
        </div>
      )}

      {!!toast && (
        <div style={{ position: "fixed", right: 26, bottom: 26, background: "#111", color: "#f6f0e7", padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", zIndex: 80 }}>{toast}</div>
      )}
    </div>
  );
}

function SidebarMenuItem({ icon, label, danger = false, onClick }) {
  return (
    <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", border: "none", background: "transparent", color: danger ? "#ee7065" : "#ece6dc", fontSize: 14, cursor: "pointer", borderRadius: 10, textAlign: "left" }}>
      <span style={{ width: 18, display: "flex", justifyContent: "center" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function Svg({ width = 18, height = 18, viewBox = "0 0 24 24", children, ...props }) {
  return <svg width={width} height={height} viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>{children}</svg>;
}

function SquareSplitIcon() { return <Svg width={18} height={18}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M9 5v14" /></Svg>; }
function ArrowLeftIcon() { return <Svg width={18} height={18}><path d="M15 18l-6-6 6-6" /><path d="M9 12h10" /></Svg>; }
function ArrowRightIcon() { return <Svg width={18} height={18}><path d="M9 6l6 6-6 6" /><path d="M5 12h10" /></Svg>; }
function SearchIcon() { return <Svg><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg>; }
function SlidersIcon() { return <Svg><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-9" /><path d="M12 8V3" /><path d="M20 21v-5" /><path d="M20 12V3" /><path d="M1 14h6" /><path d="M9 8h6" /><path d="M17 16h6" /></Svg>; }
function ChatBubbleIcon() { return <Svg><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Svg>; }
function BriefcaseIcon() { return <Svg><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 12h18" /></Svg>; }
function SparklesIcon() { return <Svg><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" /><path d="M5 19l.8 2.2L8 22l-2.2.8L5 25l-.8-2.2L2 22l2.2-.8L5 19Z" /><path d="M19 16l.7 1.8L21.5 18l-1.8.7L19 20.5l-.7-1.8-1.8-.7 1.8-.7L19 16Z" /></Svg>; }
function CodeIcon() { return <Svg><path d="m8 9-4 3 4 3" /><path d="m16 9 4 3-4 3" /><path d="m14 5-4 14" /></Svg>; }
function CirclePlusIcon({ size = 20 }) { return <Svg width={size} height={size}><circle cx="12" cy="12" r="10" /><path d="M12 8v8" /><path d="M8 12h8" /></Svg>; }
function LinkSmallIcon() { return <Svg width={14} height={14}><path d="M10 13a5 5 0 0 1 0-7l1.2-1.2a5 5 0 0 1 7 7L17 13" /><path d="M14 11a5 5 0 0 1 0 7L12.8 19.2a5 5 0 1 1-7-7L7 11" /></Svg>; }
function SparklesTinyIcon() { return <Svg width={14} height={14}><path d="M7 1l1.1 3L11 5 8.1 6 7 9 5.9 6 3 5l2.9-1L7 1Z" /></Svg>; }
function DotsIcon() { return <Svg width={16} height={16}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Svg>; }
function StarIcon() { return <Svg width={16} height={16}><path d="m8 2 1.85 3.75L14 6.37l-3 2.92.7 4.13L8 11.5l-3.7 1.92.7-4.13-3-2.92 4.15-.62L8 2Z" /></Svg>; }
function PencilIcon() { return <Svg width={16} height={16}><path d="M12 3a2.1 2.1 0 0 1 3 3L7 14l-4 1 1-4 8-8Z" /></Svg>; }
function FolderPlusIcon() { return <Svg width={16} height={16}><path d="M3 6a2 2 0 0 1 2-2h3l2 2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" /><path d="M12 11v6" /><path d="M9 14h6" /></Svg>; }
function TrashRedIcon() { return <Svg width={16} height={16}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M18 6l-1 14H7L6 6" /></Svg>; }
function DownloadMiniIcon() { return <Svg width={18} height={18}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></Svg>; }
function ChevronUpSmall() { return <Svg width={16} height={16}><path d="m6 10 6-6 6 6" /></Svg>; }
function ChevronDownIcon({ small = false }) { return <Svg width={small ? 14 : 16} height={small ? 14 : 16}><path d="m6 9 6 6 6-6" /></Svg>; }
function ShareIcon() { return <Svg width={18} height={18}><path d="M16 8a3 3 0 1 0-2.83-4" /><path d="M4 12a3 3 0 1 0 2.83 4" /><path d="m7 13 9-5" /><path d="m7 11 9 5" /></Svg>; }
function ReplyArrowIcon() { return <Svg width={18} height={18}><path d="m9 8-5 4 5 4" /><path d="M4 12h10a4 4 0 0 1 4 4v2" /></Svg>; }
function CopySmallIcon() { return <Svg width={16} height={16}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>; }
function ThumbUpIcon() { return <Svg width={16} height={16}><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3m6-4V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.68l1.38-9A2 2 0 0 0 18.68 9H13Z" /></Svg>; }
function ThumbDownIcon() { return <Svg width={16} height={16}><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3m-6 4v2a3 3 0 0 0 3 3l4-9V2H6.72a2 2 0 0 0-2 1.68l-1.38 9A2 2 0 0 0 5.32 15H11Z" /></Svg>; }
function RefreshIcon() { return <Svg width={16} height={16}><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M8 16H3v5" /></Svg>; }
function PaperclipIcon() { return <Svg width={16} height={16}><path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></Svg>; }
function GridIcon() { return <Svg width={16} height={16}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></Svg>; }
function PlugIcon() { return <Svg width={16} height={16}><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8H6v3a6 6 0 0 0 12 0V8Z" /></Svg>; }
function GlobeIcon() { return <Svg width={16} height={16}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" /></Svg>; }
function BrushIcon() { return <Svg width={16} height={16}><path d="m9 11-6 6v3h3l6-6" /><path d="m15 5 4 4" /><path d="M16 3a2.8 2.8 0 1 1 4 4l-9 9-4-4 9-9Z" /></Svg>; }
function CheckIcon() { return <Svg width={14} height={14}><path d="m3 7 3 3 5-6" /></Svg>; }
function ChevronRightIcon() { return <Svg width={14} height={14}><path d="m5 3 5 5-5 5" /></Svg>; }
function StopIcon() { return <Svg width={16} height={16}><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>; }
function ArrowUpIcon() { return <Svg width={18} height={18}><path d="m12 19 0-14" /><path d="m6 11 6-6 6 6" /></Svg>; }
