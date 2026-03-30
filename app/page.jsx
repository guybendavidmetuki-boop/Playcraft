"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const uid = () => Math.random().toString(36).slice(2, 10);
const storageKey = "playcraft_v6_ultra";

function loadState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {}
}

function makeChat(title = "New chat") {
  return { id: uid(), title, messages: [] };
}

function makeProject(name = "New project") {
  return { id: uid(), name, icon: "📁", color: ["#7c6cff", "#ff9a62"][Math.floor(Math.random() * 2)], chatIds: [] };
}

async function fileToData(file) {
  const isImage = file.type.startsWith("image/");
  if (isImage) {
    const bitmap = await createImageBitmap(file);
    const max = 1200;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    return {
      id: uid(),
      name: file.name,
      kind: "image",
      mime: "image/jpeg",
      previewUrl: dataUrl,
      base64: dataUrl.split(",")[1],
      size: file.size,
    };
  }

  const text = await file.text();
  const trimmed = text.slice(0, 70000);
  return {
    id: uid(),
    name: file.name,
    kind: "text",
    mime: file.type || "text/plain",
    text: trimmed,
    truncated: text.length > trimmed.length,
    size: file.size,
  };
}

function renderInline(text) {
  const nodes = [];
  const chunks = text.split(/(`[^`]+`)/g);
  let key = 0;
  for (const chunk of chunks) {
    if (!chunk) continue;
    if (chunk.startsWith("`") && chunk.endsWith("`")) {
      nodes.push(
        <code key={key++} style={{ background: "rgba(53,69,118,0.08)", padding: "2px 7px", borderRadius: 8, fontSize: "0.92em" }}>
          {chunk.slice(1, -1)}
        </code>
      );
      continue;
    }
    const boldParts = chunk.split(/(\*\*[^*]+\*\*)/g);
    for (const part of boldParts) {
      if (!part) continue;
      if (part.startsWith("**") && part.endsWith("**")) {
        nodes.push(<strong key={key++}>{part.slice(2, -2)}</strong>);
      } else {
        nodes.push(<span key={key++}>{part}</span>);
      }
    }
  }
  return nodes;
}

function renderBlocks(text) {
  const out = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd();
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const content = line.replace(/^#{1,3}\s/, "");
      const size = level === 1 ? 24 : level === 2 ? 20 : 17;
      out.push(
        <div key={`h-${i}`} style={{ fontSize: size, fontWeight: 850, margin: "10px 0 10px", lineHeight: 1.25 }}>
          {renderInline(content)}
        </div>
      );
      i += 1;
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s/, ""));
        i += 1;
      }
      out.push(
        <ul key={`ul-${i}`} style={{ margin: "4px 0 14px", paddingInlineStart: 22 }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ marginBottom: 8, lineHeight: 1.72 }}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, ""));
        i += 1;
      }
      out.push(
        <ol key={`ol-${i}`} style={{ margin: "4px 0 14px", paddingInlineStart: 22 }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ marginBottom: 8, lineHeight: 1.72 }}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraph = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,3}\s/.test(lines[i].trim()) &&
      !/^[-*]\s/.test(lines[i].trim()) &&
      !/^\d+\.\s/.test(lines[i].trim())
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    out.push(
      <p key={`p-${i}`} style={{ margin: "0 0 14px", lineHeight: 1.78, fontSize: 15.5 }}>
        {renderInline(paragraph.join("\n"))}
      </p>
    );
  }

  return out;
}

function RichMessage({ text }) {
  const parts = text.split(/```([\w.+-]*)\n([\s\S]*?)```/g);
  const nodes = [];
  for (let i = 0; i < parts.length; i += 3) {
    const plain = parts[i];
    if (plain) nodes.push(<div key={`plain-${i}`}>{renderBlocks(plain)}</div>);
    const lang = parts[i + 1];
    const code = parts[i + 2];
    if (code !== undefined) {
      nodes.push(
        <div key={`code-${i}`} style={{ margin: "14px 0 18px", borderRadius: 22, overflow: "hidden", background: "#12203d", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 14px 28px rgba(15,26,52,0.18)" }}>
          <div style={{ padding: "11px 15px", fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.78)", letterSpacing: ".06em", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {lang || "code"}
          </div>
          <pre style={{ margin: 0, padding: 16, overflowX: "auto", color: "#f7fbff", fontSize: 13.5, lineHeight: 1.65, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
            <code>{code.trim()}</code>
          </pre>
        </div>
      );
    }
  }
  return <div>{nodes}</div>;
}

function ChatBubble({ msg, isTyping, onDownloadFile }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 18 }}>
      <div
        style={{
          maxWidth: "min(920px, 90%)",
          borderRadius: 28,
          padding: 18,
          background: isUser ? "linear-gradient(135deg,#7b6dff,#a06bff)" : "rgba(255,255,255,0.86)",
          color: isUser ? "#fff" : "#22304a",
          border: isUser ? "none" : "1px solid rgba(93,113,158,0.14)",
          boxShadow: isUser ? "0 18px 34px rgba(123,109,255,0.2)" : "0 14px 30px rgba(34,48,74,0.08)",
          backdropFilter: "blur(12px)",
        }}
      >
        {msg.files?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: msg.text ? 12 : 0 }}>
            {msg.files.map((f) =>
              f.kind === "image" ? (
                <img key={f.id} src={f.previewUrl} alt={f.name} style={{ width: 150, height: 110, objectFit: "cover", borderRadius: 18, border: "1px solid rgba(0,0,0,0.08)" }} />
              ) : (
                <div key={f.id} style={{ padding: "10px 12px", borderRadius: 14, background: isUser ? "rgba(255,255,255,0.14)" : "rgba(95,110,160,0.08)", fontSize: 13.5 }}>
                  📄 {f.name}
                </div>
              )
            )}
          </div>
        )}

        {!!msg.text && (
          <div>
            <RichMessage text={msg.text} />
            {isTyping && <span style={{ display: "inline-block", width: 9, height: 18, borderRadius: 999, background: "currentColor", opacity: 0.45, animation: "blink 1s steps(1) infinite" }} />}
          </div>
        )}

        {!!msg.generatedImageUrl && (
          <div style={{ marginTop: 14 }}>
            <img src={msg.generatedImageUrl} alt="Generated" style={{ width: "100%", maxWidth: 560, borderRadius: 22, border: "1px solid rgba(0,0,0,0.08)" }} />
          </div>
        )}

        {!!msg.filesOut?.length && (
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {msg.filesOut.map((f) => (
              <button
                key={f.name}
                onClick={() => onDownloadFile(f)}
                style={{
                  textAlign: "left",
                  padding: 14,
                  borderRadius: 18,
                  border: "1px solid rgba(98,117,170,0.16)",
                  background: "linear-gradient(180deg,#ffffff,#f7f8ff)",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 14 }}>📦 {f.name}</div>
                <div style={{ fontSize: 12, opacity: 0.68, marginTop: 4 }}>Tap to download</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarAction({ icon, title, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        border: "1px solid rgba(93,113,158,0.12)",
        background: "rgba(255,255,255,0.74)",
        borderRadius: 18,
        padding: 14,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ width: 40, height: 40, display: "grid", placeItems: "center", borderRadius: 14, background: "linear-gradient(135deg,#fff1bf,#ffd3ae)" }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.62 }}>{subtitle}</div>
      </div>
    </button>
  );
}

export default function Page() {
  const initial = useMemo(() => loadState(), []);
  const [rootChats, setRootChats] = useState(initial?.rootChats?.length ? initial.rootChats : [makeChat()]);
  const [projects, setProjects] = useState(initial?.projects || []);
  const [projectChats, setProjectChats] = useState(initial?.projectChats || {});
  const [activeType, setActiveType] = useState(initial?.activeType || "root");
  const [activeId, setActiveId] = useState(initial?.activeId || (initial?.rootChats?.[0]?.id ?? null) || null);
  const [composer, setComposer] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState("chat");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [typingId, setTypingId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [hoveredRoot, setHoveredRoot] = useState(null);
  const [hoveredProject, setHoveredProject] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const abortRef = useRef(null);
  const dragCount = useRef(0);
  const recognitionRef = useRef(null);
  const voiceTextRef = useRef("");
  const shouldAutoSendVoiceRef = useRef(false);
  const composerRef = useRef("");
  const sendRef = useRef(() => {});

  useEffect(() => {
    composerRef.current = composer;
  }, [composer]);

  useEffect(() => {
    saveState({ rootChats, projects, projectChats, activeType, activeId });
  }, [rootChats, projects, projectChats, activeType, activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rootChats, projects, projectChats, activeId, typingId]);

  useEffect(() => {
    const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    setSpeechSupported(!!SR);
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "he-IL";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) transcript += event.results[i][0].transcript;
      voiceTextRef.current = transcript.trim();
      setComposer((prev) => {
        const base = shouldAutoSendVoiceRef.current ? "" : prev.trim();
        return [base, transcript.trim()].filter(Boolean).join(base ? "\n" : " ").trim();
      });
    };
    recognition.onerror = () => {
      setIsListening(false);
      setError("Voice input didn't work this time. Try again.");
    };
    recognition.onend = () => {
      setIsListening(false);
      if (shouldAutoSendVoiceRef.current && voiceTextRef.current.trim()) {
        setTimeout(() => sendRef.current?.(), 120);
      }
      voiceTextRef.current = "";
    };
    recognitionRef.current = recognition;
    return () => recognition.stop();
  }, []);

  const activeChat = useMemo(() => {
    if (!activeId) return null;
    if (activeType === "root") return rootChats.find((c) => c.id === activeId) || null;
    return projectChats[activeId] || null;
  }, [activeType, activeId, rootChats, projectChats]);

  const updateActiveChat = (updater) => {
    if (!activeChat) return;
    if (activeType === "root") {
      setRootChats((prev) => prev.map((chat) => (chat.id === activeChat.id ? updater(chat) : chat)));
    } else {
      setProjectChats((prev) => ({ ...prev, [activeChat.id]: updater(prev[activeChat.id]) }));
    }
  };

  const allMessages = activeChat?.messages || [];

  const ensureRootChat = () => {
    if (!rootChats.length) {
      const chat = makeChat();
      setRootChats([chat]);
      setActiveType("root");
      setActiveId(chat.id);
    }
  };

  const addRootChat = () => {
    const chat = makeChat();
    setRootChats((prev) => [chat, ...prev]);
    setActiveType("root");
    setActiveId(chat.id);
    setMode("chat");
  };

  const addProject = () => {
    const name = window.prompt("Project name?")?.trim();
    if (!name) return;
    const project = makeProject(name);
    setProjects((prev) => [project, ...prev]);
  };

  const addChatToProject = (projectId) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const chat = makeChat(`Chat ${project.chatIds.length + 1}`);
    setProjectChats((prev) => ({ ...prev, [chat.id]: chat }));
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, chatIds: [chat.id, ...p.chatIds] } : p)));
    setActiveType("project");
    setActiveId(chat.id);
  };

  const deleteProject = (projectId) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    if (!window.confirm(`Delete project \"${project.name}\"?`)) return;
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setProjectChats((prev) => {
      const next = { ...prev };
      project.chatIds.forEach((chatId) => delete next[chatId]);
      return next;
    });
    ensureRootChat();
    const fallback = rootChats[0] || null;
    if (fallback) {
      setActiveType("root");
      setActiveId(fallback.id);
    }
  };

  const deleteRootChat = (chatId) => {
    setRootChats((prev) => {
      const next = prev.filter((chat) => chat.id !== chatId);
      if (!next.length) {
        const newChat = makeChat();
        setActiveType("root");
        setActiveId(newChat.id);
        return [newChat];
      }
      if (activeType === "root" && activeId === chatId) setActiveId(next[0].id);
      return next;
    });
  };

  const deleteProjectChat = (projectId, chatId) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const nextIds = project.chatIds.filter((id) => id !== chatId);
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, chatIds: nextIds } : p)));
    setProjectChats((prev) => {
      const next = { ...prev };
      delete next[chatId];
      return next;
    });
    if (activeType === "project" && activeId === chatId) {
      if (nextIds[0]) {
        setActiveType("project");
        setActiveId(nextIds[0]);
      } else if (rootChats[0]) {
        setActiveType("root");
        setActiveId(rootChats[0].id);
      }
    }
  };

  const addFiles = async (fileList) => {
    setError("");
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const converted = [];
    for (const file of files.slice(0, 5)) {
      try {
        converted.push(await fileToData(file));
      } catch {
        setError(`Couldn't read ${file.name}`);
      }
    }
    const total = converted.reduce((sum, f) => sum + (f.base64?.length || f.text?.length || 0), 0);
    if (total > 2_200_000) {
      setError("The files are too big. Try smaller files or fewer images.");
      return;
    }
    setAttachments((prev) => [...prev, ...converted]);
  };

  const animateAssistantMessage = (messageId, fullText, extras = {}) => {
    setTypingId(messageId);
    let i = 0;
    const step = Math.max(2, Math.ceil(fullText.length / 220));
    const tick = () => {
      i = Math.min(fullText.length, i + step);
      updateActiveChat((chat) => ({
        ...chat,
        messages: chat.messages.map((m) => (m.id === messageId ? { ...m, text: fullText.slice(0, i), ...extras } : m)),
      }));
      if (i < fullText.length) setTimeout(tick, 16);
      else setTypingId(null);
    };
    tick();
  };

  const send = async () => {
    if (loading || !activeChat) return;
    const text = composer.trim();
    if (!text && !attachments.length && mode !== "image") return;
    setError("");

    const userMsg = { id: uid(), role: "user", text, files: attachments, mode };
    const assistantMsg = { id: uid(), role: "assistant", text: "" };

    updateActiveChat((chat) => ({
      ...chat,
      title: chat.messages.length ? chat.title : (text || (mode === "image" ? "Create image" : mode === "study" ? "Study and learn" : "New chat")).slice(0, 30),
      messages: [...chat.messages, userMsg, assistantMsg],
    }));

    setComposer("");
    setAttachments([]);
    setLoading(true);
    setMenuOpen(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch("/api/playcraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...allMessages, userMsg], mode }),
        signal: controller.signal,
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Something went wrong");
      const extras = {};
      if (json.files?.length) extras.filesOut = json.files;
      if (json.generatedImageUrl) extras.generatedImageUrl = json.generatedImageUrl;
      animateAssistantMessage(assistantMsg.id, json.text || "Done.", extras);
    } catch (e) {
      updateActiveChat((chat) => ({
        ...chat,
        messages: chat.messages.map((m) => (m.id === assistantMsg.id ? { ...m, text: `⚠️ ${e.message}` } : m)),
      }));
    } finally {
      setLoading(false);
      abortRef.current = null;
      if (mode !== "chat") setMode("chat");
    }
  };

  sendRef.current = send;

  const toggleVoice = () => {
    if (!speechSupported) {
      setError("Voice input is not supported in this browser.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    shouldAutoSendVoiceRef.current = composerRef.current.trim().length === 0;
    if (shouldAutoSendVoiceRef.current) setComposer("");
    voiceTextRef.current = "";
    setError("");
    recognitionRef.current?.start();
  };

  const downloadFile = (file) => {
    const blob = new Blob([file.content], { type: file.mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onDragEnter = (e) => {
    e.preventDefault();
    dragCount.current += 1;
    setDragging(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    dragCount.current -= 1;
    if (dragCount.current <= 0) setDragging(false);
  };
  const onDrop = async (e) => {
    e.preventDefault();
    dragCount.current = 0;
    setDragging(false);
    await addFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        height: "100vh",
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        background: "radial-gradient(circle at top left, #fff3c8 0%, #fff8e8 20%, #f8fbff 55%, #eef4ff 100%)",
        color: "#23314f",
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        @keyframes blink { 50% { opacity: 0; } }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: rgba(103,120,170,0.25); border-radius: 999px; }
        button { font-family: inherit; }
        textarea::placeholder { color: rgba(35,49,79,0.48); }
      `}</style>

      {dragging && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(43,59,104,0.18)", backdropFilter: "blur(6px)", zIndex: 60, display: "grid", placeItems: "center" }}>
          <div style={{ padding: 34, background: "white", borderRadius: 30, border: "2px dashed #7b6dff", boxShadow: "0 24px 60px rgba(32,45,85,0.18)", fontWeight: 800 }}>
            Drop files or screenshots here
          </div>
        </div>
      )}

      <aside style={{ height: "100vh", padding: 18, borderRight: "1px solid rgba(100,118,162,0.12)", background: "linear-gradient(180deg, rgba(255,255,255,0.84), rgba(249,251,255,0.62))", backdropFilter: "blur(14px)", overflow: "hidden", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 6px 2px" }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 24 }}>Playcraft</div>
            <div style={{ fontSize: 12, opacity: 0.64 }}>smart chat, code, games, study, images</div>
          </div>
          <div style={{ width: 46, height: 46, borderRadius: 16, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#fff0b8,#ffc8aa)", fontSize: 22 }}>✨</div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <button onClick={addRootChat} style={primaryButtonStyle}>💬 New chat</button>
          <button onClick={addProject} style={secondaryButtonStyle}>📁 Add project</button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <SidebarAction icon="🖼️" title="Create image" subtitle="Generate an image from a prompt" onClick={() => setMode("image")} />
          <SidebarAction icon="📘" title="Study and learn" subtitle="Ask to learn any topic clearly" onClick={() => setMode("study")} />
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
          <div style={sectionTitleStyle}>💬 Chats</div>
          <div style={{ display: "grid", gap: 8 }}>
            {rootChats.map((chat) => {
              const active = activeType === "root" && activeId === chat.id;
              return (
                <div key={chat.id} onMouseEnter={() => setHoveredRoot(chat.id)} onMouseLeave={() => setHoveredRoot(null)}>
                  <button
                    onClick={() => {
                      setActiveType("root");
                      setActiveId(chat.id);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 18,
                      border: active ? "1px solid rgba(123,109,255,0.36)" : "1px solid transparent",
                      background: active ? "rgba(123,109,255,0.14)" : hoveredRoot === chat.id ? "rgba(255,255,255,0.76)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 12, display: "grid", placeItems: "center", background: active ? "rgba(123,109,255,0.18)" : "rgba(96,114,160,0.08)" }}>💬</div>
                    <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>{chat.title}</div>
                    {hoveredRoot === chat.id && rootChats.length > 1 && (
                      <span onClick={(e) => { e.stopPropagation(); deleteRootChat(chat.id); }} style={{ fontSize: 14, opacity: 0.6 }}>🗑️</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ ...sectionTitleStyle, marginTop: 18 }}>📁 Projects</div>
          {!projects.length && (
            <div style={{ padding: 14, borderRadius: 18, background: "rgba(255,255,255,0.58)", border: "1px dashed rgba(101,119,168,0.18)", fontSize: 13, opacity: 0.72 }}>
              No projects yet. Tap <strong>Add project</strong> when you want one.
            </div>
          )}

          <div style={{ display: "grid", gap: 12 }}>
            {projects.map((project) => (
              <div key={project.id} onMouseEnter={() => setHoveredProject(project.id)} onMouseLeave={() => setHoveredProject(null)} style={{ borderRadius: 22, background: "rgba(255,255,255,0.72)", border: "1px solid rgba(93,113,158,0.12)", padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 14, display: "grid", placeItems: "center", background: `linear-gradient(135deg, ${project.color}, #ffc08c)`, color: "white", boxShadow: "0 10px 18px rgba(61,76,120,0.14)" }}>{project.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.58 }}>{project.chatIds.length} chats</div>
                  </div>
                  <button onClick={() => addChatToProject(project.id)} style={tinyIconButton}>➕</button>
                  <button onClick={() => deleteProject(project.id)} style={tinyIconButton}>🗑️</button>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {project.chatIds.length === 0 && <button onClick={() => addChatToProject(project.id)} style={emptyProjectButtonStyle}>➕ Add first chat</button>}
                  {project.chatIds.map((chatId) => {
                    const chat = projectChats[chatId];
                    if (!chat) return null;
                    const active = activeType === "project" && activeId === chat.id;
                    return (
                      <div key={chat.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button onClick={() => { setActiveType("project"); setActiveId(chat.id); }} style={{ flex: 1, textAlign: "left", padding: "11px 12px", borderRadius: 16, border: active ? "1px solid rgba(123,109,255,0.36)" : "1px solid transparent", background: active ? "rgba(123,109,255,0.14)" : "rgba(255,255,255,0.56)", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                          <span>🧠</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>{chat.title}</span>
                        </button>
                        <button onClick={() => deleteProjectChat(project.id, chat.id)} style={tinyIconButton}>✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "24px 28px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 950 }}>{activeChat?.title || "Playcraft"}</div>
            <div style={{ fontSize: 13, opacity: 0.64 }}>
              {mode === "chat" ? "Chat mode" : mode === "study" ? "Study and learn mode" : "Create image mode"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {mode !== "chat" && <button onClick={() => setMode("chat")} style={pillButtonStyle}>Back to chat</button>}
            {loading && <button onClick={() => abortRef.current?.abort()} style={{ ...pillButtonStyle, background: "#ff8c75", color: "white", border: "none" }}>Stop</button>}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 28px 190px" }}>
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            {allMessages.length === 0 && (
              <div style={{ paddingTop: 52 }}>
                <div style={{ background: "rgba(255,255,255,0.76)", border: "1px solid rgba(100,118,162,0.14)", borderRadius: 30, padding: 30, boxShadow: "0 22px 48px rgba(32,45,85,0.08)" }}>
                  <div style={{ fontSize: 34, fontWeight: 950, lineHeight: 1.12, maxWidth: 760 }}>Talk naturally, ask for code, create games, drag screenshots, learn something new, or tap the mic and speak.</div>
                  <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 12 }}>
                    {[
                      "תסביר לי איך עובד Wordle",
                      "תן לי קוד ל ESP32 ב Arduino IDE עם כפתור ולד",
                      "תבנה לי משחק snake",
                      "הנה צילום מסך, תעשה עיצוב דומה אבל שמח יותר",
                    ].map((s) => (
                      <button key={s} onClick={() => setComposer(s)} style={starterButtonStyle}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {allMessages.map((msg) => <ChatBubble key={msg.id} msg={msg} isTyping={typingId === msg.id} onDownloadFile={downloadFile} />)}
            <div ref={bottomRef} />
          </div>
        </div>

        <div style={{ position: "sticky", bottom: 0, padding: "18px 28px 24px", background: "linear-gradient(180deg, rgba(238,244,255,0) 0%, rgba(238,244,255,0.86) 20%, rgba(238,244,255,0.98) 56%)" }}>
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            {!!attachments.length && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                {attachments.map((f, i) => (
                  <div key={f.id} style={{ position: "relative", borderRadius: 18, padding: 8, background: "rgba(255,255,255,0.88)", border: "1px solid rgba(103,120,170,0.14)" }}>
                    {f.kind === "image" ? <img src={f.previewUrl} alt={f.name} style={{ width: 74, height: 74, objectFit: "cover", borderRadius: 14 }} /> : <div style={{ minWidth: 110, fontSize: 13.5, padding: 10 }}>📄 {f.name}</div>}
                    <button onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: -8, right: -8, border: "none", background: "#ff8c75", color: "white", width: 24, height: 24, borderRadius: 999, cursor: "pointer" }}>×</button>
                  </div>
                ))}
              </div>
            )}

            {error && <div style={{ marginBottom: 10, color: "#c53f35", fontWeight: 800 }}>{error}</div>}

            <div style={{ position: "relative", background: "rgba(255,255,255,0.84)", border: "1px solid rgba(102,120,167,0.15)", borderRadius: 32, boxShadow: "0 20px 42px rgba(32,45,85,0.1)", padding: 14 }}>
              <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />
              <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 56px 140px 56px", gap: 14, alignItems: "end" }}>
                <div style={{ position: "relative" }}>
                  <button onClick={() => setMenuOpen((v) => !v)} style={{ width: 56, height: 56, borderRadius: 20, border: "none", background: "linear-gradient(135deg,#ffd58d,#ff9f83)", cursor: "pointer", fontSize: 28, color: "#3c2e3f", boxShadow: "0 12px 24px rgba(255,159,131,0.24)" }}>+</button>
                  {menuOpen && (
                    <div style={{ position: "absolute", bottom: 68, left: 0, width: 240, background: "white", borderRadius: 22, border: "1px solid rgba(106,123,170,0.14)", boxShadow: "0 24px 54px rgba(28,42,77,0.16)", padding: 8, zIndex: 20 }}>
                      <button onClick={() => { setMenuOpen(false); fileRef.current?.click(); }} style={menuItemStyle}>📎 Add file</button>
                      <button onClick={() => { setMenuOpen(false); setMode("study"); }} style={menuItemStyle}>📘 Study and learn</button>
                      <button onClick={() => { setMenuOpen(false); setMode("image"); }} style={menuItemStyle}>🖼️ Create image</button>
                      <button onClick={() => { setMenuOpen(false); addRootChat(); }} style={menuItemStyle}>💬 New chat</button>
                      <button onClick={() => { setMenuOpen(false); addProject(); }} style={menuItemStyle}>📁 Add project</button>
                    </div>
                  )}
                </div>

                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={mode === "image" ? "Describe the image you want..." : mode === "study" ? "What do you want to learn?" : "Ask anything, drag files, or tap the mic and speak..."}
                  rows={1}
                  style={{ minHeight: 56, maxHeight: 180, resize: "none", border: "none", outline: "none", background: "transparent", fontSize: 18, lineHeight: 1.65, padding: "12px 0 4px", width: "100%" }}
                />

                <button onClick={toggleVoice} title={speechSupported ? (isListening ? "Stop recording" : "Record voice") : "Voice is not supported here"} style={{ width: 56, height: 56, borderRadius: 20, border: "none", cursor: "pointer", background: isListening ? "linear-gradient(135deg,#ff8370,#ff5f7c)" : "rgba(123,109,255,0.12)", color: isListening ? "#fff" : "#5a58dd", fontWeight: 900, fontSize: 21 }}>
                  {isListening ? "◼" : "🎤"}
                </button>

                <div style={{ alignSelf: "center", justifySelf: "stretch" }}>
                  <div style={{ padding: "12px 14px", borderRadius: 18, background: mode === "chat" ? "rgba(123,109,255,0.1)" : mode === "study" ? "rgba(88,194,151,0.16)" : "rgba(255,160,115,0.16)", fontWeight: 800, textAlign: "center" }}>
                    {mode === "chat" ? "Chat" : mode === "study" ? "Study" : "Image"}
                  </div>
                </div>

                <button onClick={send} disabled={loading} style={{ width: 56, height: 56, borderRadius: 20, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#7b6dff,#a06bff)", color: "#fff", fontWeight: 900, fontSize: 18, boxShadow: "0 12px 24px rgba(123,109,255,0.28)" }}>↑</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const primaryButtonStyle = {
  border: "none",
  cursor: "pointer",
  padding: "14px 16px",
  borderRadius: 18,
  background: "linear-gradient(135deg,#7b6dff,#a06bff)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 15,
  boxShadow: "0 14px 28px rgba(123,109,255,0.22)",
  textAlign: "left",
};

const secondaryButtonStyle = {
  border: "1px solid rgba(104,120,168,0.14)",
  cursor: "pointer",
  padding: "13px 16px",
  borderRadius: 18,
  background: "rgba(255,255,255,0.72)",
  fontWeight: 800,
  fontSize: 15,
  textAlign: "left",
};

const sectionTitleStyle = {
  fontSize: 12,
  fontWeight: 850,
  letterSpacing: ".05em",
  opacity: 0.58,
  margin: "12px 8px 10px",
  textTransform: "uppercase",
};

const tinyIconButton = {
  border: "none",
  background: "rgba(96,114,160,0.08)",
  cursor: "pointer",
  width: 34,
  height: 34,
  borderRadius: 12,
};

const emptyProjectButtonStyle = {
  border: "1px dashed rgba(103,120,170,0.24)",
  background: "rgba(255,255,255,0.58)",
  cursor: "pointer",
  padding: "12px 14px",
  borderRadius: 16,
  textAlign: "left",
  fontWeight: 700,
};

const starterButtonStyle = {
  border: "1px solid rgba(123,109,255,0.14)",
  background: "#fff",
  padding: "12px 14px",
  borderRadius: 16,
  cursor: "pointer",
  fontWeight: 700,
};

const pillButtonStyle = {
  border: "1px solid rgba(123,109,255,0.18)",
  background: "rgba(255,255,255,0.8)",
  borderRadius: 999,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const menuItemStyle = {
  width: "100%",
  textAlign: "left",
  padding: "12px 14px",
  border: "none",
  background: "transparent",
  borderRadius: 14,
  cursor: "pointer",
  fontSize: 15,
};
