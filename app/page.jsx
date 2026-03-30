"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const TEXT_EXTENSIONS = [
  ".txt", ".md", ".json", ".js", ".jsx", ".ts", ".tsx", ".css", ".html", ".htm",
  ".xml", ".csv", ".yml", ".yaml", ".py", ".java", ".c", ".cpp", ".cs", ".php",
  ".rb", ".go", ".rs", ".swift", ".sql", ".sh"
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

function ActionButton({ label, onClick, primary = false, danger = false, disabled = false, icon }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: 38,
        padding: "0 14px",
        borderRadius: 12,
        border: primary ? "none" : `1px solid ${danger ? "rgba(233,110,98,0.45)" : "rgba(255,255,255,0.1)"}`,
        background: primary ? "#d17947" : danger ? "rgba(233,110,98,0.1)" : "#2e2b27",
        color: primary ? "#fff" : danger ? "#f08a80" : "#ebe5da",
        cursor: disabled ? "default" : "pointer",
        fontSize: 13,
        fontWeight: 500,
        opacity: disabled ? 0.6 : 1,
        boxShadow: primary ? "0 8px 24px rgba(209,121,71,0.28)" : "none"
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function IconButton({ icon, onClick, title, active = false, danger = false, disabled = false }) {
  return (
    <button
      title={title}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.08)",
        background: active ? "rgba(0,0,0,0.42)" : "transparent",
        color: danger ? "#f08a80" : "#cfc7bc",
        display: "grid",
        placeItems: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1
      }}
    >
      {icon}
    </button>
  );
}

function AttachmentPill({ file, onRemove }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "#d7d0c5",
        fontSize: 12
      }}
    >
      <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
      <button
        onClick={onRemove}
        style={{ border: "none", background: "transparent", color: "#b7aea1", cursor: "pointer", fontSize: 14 }}
      >
        ✕
      </button>
    </div>
  );
}

function CodeCard({ html, onPreview, onCopy, onDownload, onRepair, busy }) {
  return (
    <div
      style={{
        marginTop: 14,
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "#2a2723",
        overflow: "hidden"
      }}
    >
      <div style={{ padding: 16, borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#f4eee4", fontSize: 15, fontWeight: 600 }}>output.html</div>
          <div style={{ color: "#a79f93", fontSize: 12, marginTop: 4 }}>Generated HTML file</div>
        </div>
        <ActionButton label="Open preview" onClick={() => onPreview(html)} />
      </div>
      <div style={{ padding: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <ActionButton label="Copy code" onClick={() => onCopy(html)} />
        <ActionButton label="Download" onClick={() => onDownload(html)} />
        <ActionButton label="Repair" onClick={() => onRepair(html)} disabled={busy} />
      </div>
    </div>
  );
}

function MessageActions({ onCopy, onLike, onDislike, onRetry, canRetry }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
      <IconButton icon={<CopyIcon />} onClick={onCopy} title="Copy" />
      <IconButton icon={<ThumbUpIcon />} onClick={onLike} title="Like" />
      <IconButton icon={<ThumbDownIcon />} onClick={onDislike} title="Dislike" />
      <IconButton icon={<RefreshIcon />} onClick={onRetry} title="Try again" disabled={!canRetry} />
    </div>
  );
}

function AssistantMessage({ msg, onCopyMessage, onPreviewHtml, onCopyHtml, onDownloadHtml, onRepairHtml, onRetry, onLike, onDislike, loading }) {
  if (msg.pending) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#c6beb2", marginBottom: 28 }}>
        <Spinner />
        <span>Working…</span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 30 }}>
      {!!msg.summary && <div style={{ color: "#a79f93", fontSize: 13, marginBottom: 10 }}>{msg.summary}</div>}
      <div style={{ color: "#ece6dc", fontSize: 15, lineHeight: 1.9, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.content}</div>

      {!!msg.generatedHtml && (
        <CodeCard
          html={msg.generatedHtml}
          onPreview={onPreviewHtml}
          onCopy={onCopyHtml}
          onDownload={onDownloadHtml}
          onRepair={onRepairHtml}
          busy={loading}
        />
      )}

      <MessageActions
        onCopy={onCopyMessage}
        onLike={onLike}
        onDislike={onDislike}
        onRetry={onRetry}
        canRetry
      />
    </div>
  );
}

function UserMessage({ msg }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 30 }}>
      <div style={{ maxWidth: 720, background: "#0c0c0c", color: "#f4eee6", padding: "16px 18px", borderRadius: 18, lineHeight: 1.75, fontSize: 15, boxShadow: "0 8px 30px rgba(0,0,0,0.18)", whiteSpace: "pre-wrap" }}>
        {msg.content}
        {!!msg.files?.length && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {msg.files.map((file) => (
              <div key={file.id} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", fontSize: 12, color: "#d9d2c6" }}>
                📎 {file.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [openChatMenuId, setOpenChatMenuId] = useState(null);
  const [hoveredChatId, setHoveredChatId] = useState(null);
  const [toast, setToast] = useState("");

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);
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
  }, [activeChat?.messages?.length, previewHtml, loading]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const updateTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, []);

  const createChat = useCallback(() => {
    const id = uid();
    setChats((prev) => [{ id, title: "New chat", messages: [] }, ...prev]);
    setActiveId(id);
    setInput("");
    setAttachments([]);
    setPreviewHtml("");
    setOpenChatMenuId(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const renameChat = useCallback((chatId) => {
    const current = chats.find((c) => c.id === chatId);
    const nextTitle = window.prompt("New chat name", current?.title || "");
    if (!nextTitle?.trim()) return;
    setChats((prev) => prev.map((chat) => (chat.id === chatId ? { ...chat, title: nextTitle.trim() } : chat)));
    setOpenChatMenuId(null);
  }, [chats]);

  const deleteChat = useCallback((chatId) => {
    setChats((prev) => {
      const next = prev.filter((chat) => chat.id !== chatId);
      if (chatId === activeId) {
        setActiveId(next[0]?.id || null);
        setPreviewHtml("");
      }
      return next;
    });
    setOpenChatMenuId(null);
  }, [activeId]);

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

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

  const requestAssistantReply = useCallback(async ({ history, assistantId }) => {
    abortRef.current = new AbortController();

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
          message.id === assistantId ? { ...message, pending: false, content: reply, summary, generatedHtml } : message
        ))
      };
    }));

    if (generatedHtml) setPreviewHtml(generatedHtml);
  }, [activeId]);

  const sendMessage = useCallback(async (override = null) => {
    if (loading || !activeId) return;

    const text = typeof override?.text === "string" ? override.text.trim() : input.trim();
    const files = Array.isArray(override?.files) ? override.files : attachments;

    if (!text && !files.length) return;

    const userMessage = {
      id: uid(),
      role: "user",
      content: text,
      files: [...files],
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
      const title = !chat.messages.length && text ? text.slice(0, 42) + (text.length > 42 ? "…" : "") : chat.title;
      return { ...chat, title, messages: [...chat.messages, userMessage, pendingMessage] };
    }));

    setInput("");
    setAttachments([]);
    setLoading(true);
    setOpenChatMenuId(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      await requestAssistantReply({ history, assistantId: pendingId });
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
  }, [activeChat?.messages, activeId, attachments, input, loading, requestAssistantReply]);

  const retryAssistant = useCallback(async (assistantId) => {
    if (loading || !activeChat) return;

    const index = activeChat.messages.findIndex((message) => message.id === assistantId);
    if (index <= 0) return;

    const history = activeChat.messages.slice(0, index).filter((message) => message.role === "user" || message.role === "assistant");

    setChats((prev) => prev.map((chat) => {
      if (chat.id !== activeId) return chat;
      return {
        ...chat,
        messages: chat.messages.map((message) => (
          message.id === assistantId
            ? { ...message, pending: true, content: "", summary: "", generatedHtml: "" }
            : message
        ))
      };
    }));

    setLoading(true);
    try {
      await requestAssistantReply({ history, assistantId });
    } catch (error) {
      const aborted = error?.name === "AbortError";
      setChats((prev) => prev.map((chat) => {
        if (chat.id !== activeId) return chat;
        return {
          ...chat,
          messages: chat.messages.map((message) => (
            message.id === assistantId
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
  }, [activeChat, activeId, loading, requestAssistantReply]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const repairHtml = useCallback((html) => {
    if (!html || loading) return;
    sendMessage({
      text: "Repair the current HTML project. Keep the same idea, fix bugs, improve the code and UI, and return the full HTML again.",
      files: [{ id: uid(), name: "output.html", type: "text/html", text: html }]
    });
  }, [loading, sendMessage]);

  const onKeyDown = useCallback((event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const copyMessage = useCallback(async (text) => {
    const ok = await copyToClipboard(text);
    setToast(ok ? "Copied" : "Copy failed");
  }, []);

  const copyHtml = useCallback(async (html) => {
    const ok = await copyToClipboard(html);
    setToast(ok ? "Code copied" : "Copy failed");
  }, []);

  const downloadHtml = useCallback((html) => {
    downloadTextFile("output.html", html);
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
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 960px) {
          .pc-sidebar { display: none !important; }
          .pc-main { width: 100% !important; }
          .pc-composer { left: 0 !important; }
        }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh" }}>
        <aside
          className="pc-sidebar"
          style={{
            width: 290,
            flexShrink: 0,
            borderRight: "1px solid rgba(255,255,255,0.08)",
            background: "linear-gradient(180deg, #24221e 0%, #1f1d19 100%)",
            display: "flex",
            flexDirection: "column"
          }}
        >
          <div style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#0f0f0f", display: "grid", placeItems: "center", color: "#fff" }}>
              <PlayIcon />
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#f1ebe2" }}>Playcraft</div>
          </div>

          <div style={{ padding: 12 }}>
            <ActionButton label="New chat" icon={<PlusIcon />} onClick={createChat} />
          </div>

          <div style={{ padding: "6px 16px 10px", color: "#8c857b", fontSize: 12, fontWeight: 600, letterSpacing: 0.2 }}>RECENT CHATS</div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 14px" }}>
            {chats.map((chat) => {
              const active = chat.id === activeId;
              const hovered = hoveredChatId === chat.id;
              return (
                <div
                  key={chat.id}
                  style={{ position: "relative", marginBottom: 4 }}
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
                      minHeight: 44,
                      border: "none",
                      borderRadius: 12,
                      background: active || hovered ? "rgba(0,0,0,0.38)" : "transparent",
                      color: active ? "#f3eee5" : "#d8d0c5",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      cursor: "pointer",
                      padding: "10px 12px",
                      textAlign: "left",
                      transition: "background 120ms ease"
                    }}
                  >
                    <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 14 }}>{chat.title}</span>
                    {(active || hovered || openChatMenuId === chat.id) && (
                      <span
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenChatMenuId(openChatMenuId === chat.id ? null : chat.id);
                        }}
                        style={{ display: "flex", color: "#b4ad9f", padding: 3 }}
                      >
                        <DotsIcon />
                      </span>
                    )}
                  </button>

                  {openChatMenuId === chat.id && (
                    <div style={{ position: "absolute", right: 8, top: 44, width: 160, borderRadius: 16, padding: 8, background: "#2f2c28", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 50px rgba(0,0,0,0.34)", zIndex: 20 }}>
                      <MenuButton label="Rename" onClick={() => renameChat(chat.id)} icon={<PencilIcon />} />
                      <MenuButton label="Delete" onClick={() => deleteChat(chat.id)} icon={<TrashIcon />} danger />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        <main className="pc-main" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ height: 56, borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", color: "#e7e0d5" }}>
            <div style={{ fontSize: 20, fontWeight: 600 }}>Playcraft</div>
            {previewHtml ? <ActionButton label="Open preview" onClick={() => setPreviewHtml(previewHtml)} /> : <div />}
          </div>

          <div style={{ flex: 1, overflowY: "auto", paddingBottom: 190 }}>
            <div style={{ width: "min(880px, 100%)", margin: "0 auto", padding: "28px 28px 0" }}>
              {!renderedMessages.length ? (
                <div style={{ minHeight: "46vh", display: "grid", placeItems: "center", color: "#9d968c", fontSize: 15 }}>
                  Ask anything, paste code, or attach files.
                </div>
              ) : (
                renderedMessages.map((msg) => (
                  msg.role === "user" ? (
                    <UserMessage key={msg.id} msg={msg} />
                  ) : (
                    <AssistantMessage
                      key={msg.id}
                      msg={msg}
                      loading={loading}
                      onCopyMessage={() => copyMessage(msg.content || "")}
                      onPreviewHtml={(html) => setPreviewHtml(html)}
                      onCopyHtml={copyHtml}
                      onDownloadHtml={downloadHtml}
                      onRepairHtml={repairHtml}
                      onRetry={() => retryAssistant(msg.id)}
                      onLike={() => setToast("Saved") }
                      onDislike={() => setToast("Noted") }
                    />
                  )
                ))
              )}
              <div ref={bottomRef} style={{ height: 4 }} />
            </div>
          </div>

          <div className="pc-composer" style={{ position: "fixed", left: 290, right: 0, bottom: 0, padding: "0 22px 22px", background: "linear-gradient(180deg, rgba(35,33,29,0) 0%, rgba(35,33,29,0.9) 26%, rgba(35,33,29,1) 100%)" }}>
            <div style={{ width: "min(880px, calc(100vw - 44px))", margin: "0 auto", borderRadius: 22, border: "1px solid rgba(255,255,255,0.08)", background: "#3a3732", boxShadow: "0 12px 40px rgba(0,0,0,0.26)", padding: 16 }}>
              {!!attachments.length && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {attachments.map((file, index) => (
                    <AttachmentPill key={file.id || index} file={file} onRemove={() => setAttachments((prev) => prev.filter((item) => item.id !== file.id))} />
                  ))}
                </div>
              )}

              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  requestAnimationFrame(updateTextareaHeight);
                }}
                onKeyDown={onKeyDown}
                disabled={loading}
                placeholder="Ask anything, paste code, ask for ESP32, Arduino, games, or follow-up..."
                style={{ width: "100%", border: "none", outline: "none", resize: "none", background: "transparent", color: "#f4eee4", fontSize: 16, lineHeight: 1.7, minHeight: 96, maxHeight: 220 }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                <IconButton icon={<PaperclipIcon />} onClick={() => fileInputRef.current?.click()} title="Add files" active />
                <div style={{ marginLeft: "auto", color: "#c7c0b4", fontSize: 13, paddingRight: 6 }}>Playcraft AI</div>
                {loading ? (
                  <ActionButton label="Stop" onClick={stopGeneration} primary icon={<StopIcon />} />
                ) : (
                  <ActionButton label="Send" onClick={() => sendMessage()} primary disabled={!canSend} icon={<ArrowUpIcon />} />
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => addFiles(event.target.files)} />

      {!!previewHtml && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.58)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "min(1200px, 96vw)", height: "min(820px, 92vh)", borderRadius: 24, background: "#1f1d19", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 40px 120px rgba(0,0,0,0.46)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ height: 64, borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", gap: 14, flexWrap: "wrap" }}>
              <div style={{ color: "#f3ede4", fontSize: 16, fontWeight: 600 }}>Live preview</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <ActionButton label="Copy HTML" onClick={() => copyHtml(previewHtml)} />
                <ActionButton label="Download" onClick={() => downloadHtml(previewHtml)} />
                <ActionButton label="Repair" onClick={() => repairHtml(previewHtml)} disabled={loading} />
                <ActionButton label="Close" onClick={() => setPreviewHtml("")} />
              </div>
            </div>
            <div style={{ flex: 1, background: "#111" }}>
              <iframe title="Game preview" srcDoc={previewHtml} style={{ width: "100%", height: "100%", border: "none", background: "#111" }} sandbox="allow-scripts allow-same-origin" />
            </div>
          </div>
        </div>
      )}

      {!!toast && (
        <div style={{ position: "fixed", right: 22, bottom: 24, padding: "10px 14px", borderRadius: 12, background: "#111", color: "#f5efe6", border: "1px solid rgba(255,255,255,0.08)", zIndex: 90 }}>{toast}</div>
      )}
    </div>
  );
}

function MenuButton({ label, onClick, icon, danger = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        border: "none",
        background: "transparent",
        color: danger ? "#f08a80" : "#ece6dc",
        borderRadius: 10,
        height: 38,
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        padding: "0 10px",
        textAlign: "left"
      }}
    >
      <span style={{ width: 16, display: "flex", justifyContent: "center" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function Spinner() {
  return (
    <div style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid rgba(255,255,255,0.22)", borderTopColor: "#d17947", animation: "spin 0.8s linear infinite" }} />
  );
}

function Svg({ width = 18, height = 18, viewBox = "0 0 24 24", children }) {
  return <svg width={width} height={height} viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

function PlayIcon() { return <Svg width={18} height={18}><path d="m8 5 11 7-11 7V5Z" /></Svg>; }
function PlusIcon() { return <Svg width={16} height={16}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>; }
function DotsIcon() { return <Svg width={16} height={16}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Svg>; }
function PencilIcon() { return <Svg width={16} height={16}><path d="M12 3a2.1 2.1 0 0 1 3 3L7 14l-4 1 1-4 8-8Z" /></Svg>; }
function TrashIcon() { return <Svg width={16} height={16}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M18 6l-1 14H7L6 6" /></Svg>; }
function PaperclipIcon() { return <Svg width={16} height={16}><path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></Svg>; }
function StopIcon() { return <Svg width={16} height={16}><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>; }
function ArrowUpIcon() { return <Svg width={16} height={16}><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></Svg>; }
function CopyIcon() { return <Svg width={16} height={16}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>; }
function ThumbUpIcon() { return <Svg width={16} height={16}><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3m6-4V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.68l1.38-9A2 2 0 0 0 18.68 9H13Z" /></Svg>; }
function ThumbDownIcon() { return <Svg width={16} height={16}><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3m-6 4v2a3 3 0 0 0 3 3l4-9V2H6.72a2 2 0 0 0-2 1.68l-1.38 9A2 2 0 0 0 5.32 15H11Z" /></Svg>; }
function RefreshIcon() { return <Svg width={16} height={16}><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M8 16H3v5" /></Svg>; }
