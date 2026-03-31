"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

const THEMES = {
  light: {
    bg: "#f5f7fb",
    panel: "#ffffff",
    border: "#d9e1f2",
    text: "#16213e",
    muted: "#6f7b95",
    accent: "#6c63ff",
    accent2: "#4cc9f0",
    bubbleUser: "#e9ecff",
    bubbleAssistant: "#ffffff",
    previewBg: "#f7f9ff",
  },
  dark: {
    bg: "#0c1222",
    panel: "#121a2f",
    border: "#2b3553",
    text: "#eef3ff",
    muted: "#a8b4d1",
    accent: "#8b7cff",
    accent2: "#4cc9f0",
    bubbleUser: "#2a3458",
    bubbleAssistant: "#141d33",
    previewBg: "#0d1528",
  },
};

const DEFAULT_CHAT = () => ({
  id: crypto.randomUUID(),
  title: "שיחה חדשה",
  pinned: false,
  messages: [],
  files: [],
  mode: "chat",
  projectId: null,
});

function detectDir(text = "") {
  const heb = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const lat = (text.match(/[A-Za-z]/g) || []).length;
  if (heb && heb >= lat) return "rtl";
  if (lat && lat > heb) return "ltr";
  return "auto";
}

function Icon({ children }) {
  return <span style={{ width: 18, display: "inline-flex", justifyContent: "center" }}>{children}</span>;
}

function ActionButton({ label, icon, onClick, active, small }) {
  return (
    <button
      onClick={onClick}
      style={{
        borderRadius: 16,
        border: "1px solid var(--border)",
        background: active ? "var(--accentSoft)" : "var(--panel)",
        color: "var(--text)",
        padding: small ? "8px 12px" : "12px 16px",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontWeight: 700,
        cursor: "pointer",
        transition: "0.18s ease",
      }}
      type="button"
    >
      {icon ? <Icon>{icon}</Icon> : null}
      <span>{label}</span>
    </button>
  );
}

export default function PlaycraftPage() {
  const [theme, setTheme] = useState("light");
  const t = THEMES[theme];
  const [chats, setChats] = useState([DEFAULT_CHAT()]);
  const [projects, setProjects] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [previewVisible, setPreviewVisible] = useState(true);
  const [previewTab, setPreviewTab] = useState("preview");
  const [previewFile, setPreviewFile] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [voiceOverlay, setVoiceOverlay] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voicePulse, setVoicePulse] = useState(0);
  const [toast, setToast] = useState("");

  const messagesRef = useRef(null);
  const fileRef = useRef(null);
  const recognitionRef = useRef(null);
  const speakingRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem("playcraft-reset-pro");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed.theme) setTheme(parsed.theme);
      if (parsed.projects) setProjects(parsed.projects);
      if (parsed.chats?.length) {
        setChats(parsed.chats);
        setActiveChatId(parsed.activeChatId || parsed.chats[0].id);
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "playcraft-reset-pro",
      JSON.stringify({ theme, chats, activeChatId, projects })
    );
  }, [theme, chats, activeChatId, projects]);

  useEffect(() => {
    if (!activeChatId && chats[0]) setActiveChatId(chats[0].id);
  }, [activeChatId, chats]);

  useEffect(() => {
    const close = (e) => {
      if (!e.target.closest("[data-menu-root='true']")) {
        setMenuOpen(null);
        setModeMenuOpen(false);
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0];

  const visibleChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => (m.text || "").toLowerCase().includes(q)));
  }, [chats, search]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [activeChat?.messages.length, loading]);

  function patchActiveChat(updater) {
    setChats((prev) => prev.map((c) => (c.id === activeChat.id ? updater(c) : c)));
  }

  function addMessage(role, text, extra = {}) {
    const msg = { id: crypto.randomUUID(), role, text, createdAt: Date.now(), ...extra };
    patchActiveChat((c) => ({ ...c, messages: [...c.messages, msg] }));
    return msg.id;
  }

  function updateMessage(id, patch) {
    patchActiveChat((c) => ({ ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  }

  function createChat(mode = "chat", projectId = null) {
    const chat = { ...DEFAULT_CHAT(), mode, projectId };
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
    setDraft("");
  }

  function createProject() {
    const name = prompt("שם לפרויקט?");
    if (!name) return;
    const p = { id: crypto.randomUUID(), name, pinned: false, style: "modern", fileIds: [] };
    setProjects((prev) => [p, ...prev]);
  }

  function deleteChat(id) {
    const next = chats.filter((c) => c.id !== id);
    setChats(next);
    if (activeChatId === id) setActiveChatId(next[0]?.id || null);
  }

  function renameChat(id) {
    const chat = chats.find((c) => c.id === id);
    const name = prompt("שם חדש לשיחה", chat?.title || "");
    if (!name) return;
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: name } : c)));
  }

  function deleteProject(id) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setChats((prev) => prev.map((c) => (c.projectId === id ? { ...c, projectId: null } : c)));
  }

  function renameProject(id) {
    const project = projects.find((p) => p.id === id);
    const name = prompt("שם חדש לפרויקט", project?.name || "");
    if (!name) return;
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }

  function togglePinChat(id) {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
  }

  function copyText(text) {
    navigator.clipboard.writeText(text || "");
    setToast("Copied");
  }

  async function sendMessage(forceVoice = false) {
    if (!activeChat) return;
    const text = draft.trim();
    if (!text && !forceVoice) return;

    const finalText = text || "[voice]";
    setDraft("");
    setLoading(true);
    setStatus("Thinking...");
    addMessage("user", text || "🎤 הודעה קולית");

    const assistantId = addMessage("assistant", "", { pending: true });

    try {
      const body = {
        prompt: finalText,
        mode: activeChat.mode || "chat",
        history: activeChat.messages.slice(-12).map((m) => ({ role: m.role, text: m.text })),
        project: projects.find((p) => p.id === activeChat.projectId) || null,
        lastFile: activeChat.files?.[0] || null,
      };
      const res = await fetch("/api/playcraft/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      updateMessage(assistantId, {
        pending: false,
        text: data.text || "Done.",
        code: data.code || null,
        file: data.file || null,
      });

      if (data.file) {
        patchActiveChat((c) => ({ ...c, files: [data.file, ...(c.files || [])] }));
        if (data.file.previewUrl) {
          setPreviewVisible(true);
          setPreviewTab("preview");
          setPreviewFile(data.file);
        }
      }
      if (data.title) {
        patchActiveChat((c) => ({ ...c, title: data.title }));
      }
      if (voiceOverlay && data.text) speakText(data.text);
    } catch (e) {
      updateMessage(assistantId, { pending: false, text: `⚠️ ${e.message}` });
    } finally {
      setLoading(false);
      setStatus("");
    }
  }

  function speakText(text) {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const dir = detectDir(text);
    utter.lang = dir === "rtl" ? "he-IL" : "en-US";
    utter.onstart = () => {
      setSpeaking(true);
      speakingRef.current = true;
    };
    utter.onend = () => {
      setSpeaking(false);
      speakingRef.current = false;
    };
    window.speechSynthesis.speak(utter);
  }

  function toggleVoiceOverlay() {
    if (!voiceOverlay) {
      setVoiceOverlay(true);
      startListening();
    } else {
      stopListening();
      setVoiceOverlay(false);
    }
  }

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setToast("Voice is not supported here");
      return;
    }
    try {
      const rec = new SR();
      recognitionRef.current = rec;
      rec.lang = "he-IL";
      rec.interimResults = true;
      rec.continuous = true;
      rec.onstart = () => {
        setListening(true);
        setVoicePulse(1);
      };
      rec.onresult = (event) => {
        const text = Array.from(event.results)
          .map((r) => r[0]?.transcript || "")
          .join(" ");
        setDraft(text.trim());
      };
      rec.onerror = () => {
        setListening(false);
        setVoicePulse(0);
      };
      rec.onend = () => {
        setListening(false);
        setVoicePulse(0);
      };
      rec.start();
    } catch {
      setToast("Voice start failed");
    }
  }

  function stopListening() {
    recognitionRef.current?.stop?.();
    setListening(false);
    setVoicePulse(0);
  }

  function onVoiceSend() {
    stopListening();
    if (draft.trim()) sendMessage(true);
  }

  function onFilePick(files) {
    if (!files?.length) return;
    const names = Array.from(files).map((f) => f.name).join(", ");
    addMessage("user", `📎 ${names}`);
    setToast("Files added");
  }

  return (
    <div
      style={{
        "--bg": t.bg,
        "--panel": t.panel,
        "--border": t.border,
        "--text": t.text,
        "--muted": t.muted,
        "--accent": t.accent,
        "--accent2": t.accent2,
        "--accentSoft": `${t.accent}1a`,
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        display: "flex",
        gap: 16,
        padding: 16,
        fontFamily: "Inter, Arial, sans-serif",
      }}
      dir="rtl"
    >
      <style>{`
        * { box-sizing: border-box; }
        button:hover { filter: brightness(0.98); }
        .scroll { scrollbar-width: thin; }
        .scroll::-webkit-scrollbar { width: 10px; height: 10px; }
        .scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }
        .msg-actions { opacity: 0; transition: .15s; }
        .msg:hover .msg-actions { opacity: 1; }
        @keyframes pulse {
          0% { transform: scale(1); opacity: .9; }
          50% { transform: scale(1.08); opacity: .6; }
          100% { transform: scale(1); opacity: .9; }
        }
      `}</style>

      <aside style={{ width: 320, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 28, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 14, background: `linear-gradient(135deg, var(--accent), var(--accent2))`, display: "grid", placeItems: "center", color: "white", fontWeight: 900 }}>✦</div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>Playcraft</div>
            <div style={{ color: "var(--muted)" }}>smart chat, code, games</div>
          </div>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats and projects" style={{ width: "100%", borderRadius: 16, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", padding: 14 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <ActionButton label="New chat" icon="💬" onClick={() => createChat()} />
          <ActionButton label="Add project" icon="📁" onClick={createProject} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1, color: "var(--muted)" }}>PROJECTS</div>
        <div className="scroll" style={{ maxHeight: 180, overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {projects.length ? projects.map((p) => (
            <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>📁</span>
                <div style={{ flex: 1, fontWeight: 700 }}>{p.name}</div>
                <button onClick={() => renameProject(p.id)} style={{ border: "none", background: "transparent", cursor: "pointer" }}>✏️</button>
                <button onClick={() => deleteProject(p.id)} style={{ border: "none", background: "transparent", cursor: "pointer" }}>🗑️</button>
              </div>
            </div>
          )) : <div style={{ color: "var(--muted)", border: "1px dashed var(--border)", borderRadius: 16, padding: 14 }}>No projects yet</div>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1, color: "var(--muted)" }}>CHATS</div>
        <div className="scroll" style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleChats.map((chat) => (
            <div key={chat.id} onClick={() => setActiveChatId(chat.id)} style={{ border: `1px solid ${chat.id === activeChatId ? "var(--accent)" : "var(--border)"}`, background: chat.id === activeChatId ? "var(--accentSoft)" : "transparent", borderRadius: 18, padding: 12, cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
              <span>💬</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{chat.title}</div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>{chat.mode}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); renameChat(chat.id); }} style={{ border: "none", background: "transparent", cursor: "pointer" }}>✏️</button>
              <button onClick={(e) => { e.stopPropagation(); togglePinChat(chat.id); }} style={{ border: "none", background: "transparent", cursor: "pointer" }}>{chat.pinned ? "📌" : "📍"}</button>
              <button onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }} style={{ border: "none", background: "transparent", cursor: "pointer" }}>🗑️</button>
            </div>
          ))}
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: "flex", gap: 16 }}>
        <section style={{ flex: 1, minWidth: 0, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 28, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: 18, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{activeChat?.title || "New chat"}</div>
              <div style={{ color: "var(--muted)" }}>{activeChat?.mode || "chat"}</div>
            </div>
            <div data-menu-root="true" style={{ display: "flex", gap: 10, flexWrap: "wrap", position: "relative" }}>
              <ActionButton label={activeChat?.mode || "chat"} icon="💬" onClick={() => setModeMenuOpen((v) => !v)} active={modeMenuOpen} />
              <ActionButton label="Backgrounds & colors" icon="🎨" onClick={() => setThemeMenuOpen((v) => !v)} active={themeMenuOpen} />
              <ActionButton label={previewVisible ? "Hide preview" : "Show preview"} icon="👁️" onClick={() => setPreviewVisible((v) => !v)} />
              {modeMenuOpen && (
                <div style={{ position: "absolute", top: 58, right: 0, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 18, padding: 8, zIndex: 20, display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
                  {['chat','build','study','code'].map((m) => <ActionButton key={m} small label={m} onClick={() => { patchActiveChat((c) => ({ ...c, mode: m })); setModeMenuOpen(false); }} active={activeChat?.mode===m} />)}
                </div>
              )}
              {themeMenuOpen && (
                <div style={{ position: "absolute", top: 58, left: 0, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 18, padding: 8, zIndex: 20, display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
                  <ActionButton small label="Light" onClick={() => setTheme('light')} active={theme==='light'} />
                  <ActionButton small label="Dark" onClick={() => setTheme('dark')} active={theme==='dark'} />
                </div>
              )}
            </div>
          </div>

          <div ref={messagesRef} className="scroll" style={{ flex: 1, overflow: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
            {activeChat?.messages.map((m) => (
              <div key={m.id} className="msg" style={{ display: "flex", flexDirection: "column", alignItems: m.role === 'user' ? 'flex-start' : 'flex-end', gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: "85%" }}>
                  {m.role === 'assistant' ? <div style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--accentSoft)', display: 'grid', placeItems: 'center' }}>✦</div> : null}
                  <div dir={detectDir(m.text)} style={{ background: m.role === 'user' ? 'var(--bubbleUser)' : 'var(--bubbleAssistant)', border: '1px solid var(--border)', borderRadius: 22, padding: '14px 16px', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{m.text || '...'}</div>
                  {m.role === 'user' ? <div style={{ width: 30, height: 30, borderRadius: 999, background: 'linear-gradient(135deg,var(--accent),var(--accent2))', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>U</div> : null}
                </div>
                {m.code && (
                  <div style={{ maxWidth: '85%', alignSelf: m.role === 'assistant' ? 'flex-end' : 'flex-start', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', background: theme==='dark' ? '#0a1120' : '#f8fbff' }}>
                    <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                      <strong>Code</strong>
                      <button onClick={() => copyText(m.code)} style={{ border: '1px solid var(--border)', background: 'transparent', borderRadius: 12, padding: '6px 10px', cursor: 'pointer' }}>Copy</button>
                    </div>
                    <pre style={{ margin: 0, padding: 14, overflow: 'auto', direction: 'ltr', textAlign: 'left' }}>{m.code}</pre>
                  </div>
                )}
                {m.file && (
                  <div style={{ maxWidth: '85%', alignSelf: 'flex-end', border: '1px solid var(--border)', borderRadius: 18, padding: 12, background: 'var(--panel)' }}>
                    <div style={{ fontWeight: 800 }}>{m.file.name}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      {m.file.previewUrl && <ActionButton small label="Preview" onClick={() => { setPreviewVisible(true); setPreviewTab('preview'); setPreviewFile(m.file); }} />}
                      {m.file.code && <ActionButton small label="Code" onClick={() => { setPreviewVisible(true); setPreviewTab('code'); setPreviewFile(m.file); }} />}
                      {m.file.openUrl && <ActionButton small label="Open" onClick={() => window.open(m.file.openUrl, '_blank')} />}
                      {m.file.downloadUrl && <ActionButton small label="Download" onClick={() => window.open(m.file.downloadUrl, '_blank')} />}
                      {m.file.publishUrl && <ActionButton small label="Publish" onClick={() => window.open(m.file.publishUrl, '_blank')} />}
                    </div>
                  </div>
                )}
                <div className="msg-actions" style={{ display: 'flex', gap: 6, fontSize: 12 }}>
                  <button onClick={() => copyText(m.text)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>Copy</button>
                  {m.role==='user' && <button onClick={() => { setDraft(m.text); setEditingMessageId(m.id); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>Edit</button>}
                </div>
              </div>
            ))}
            {loading && <div style={{ color: 'var(--muted)', fontWeight: 700 }}>{status || 'Thinking...'}</div>}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', padding: 14, display: 'flex', gap: 10, alignItems: 'flex-end' }} data-menu-root="true">
            <div style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen((m) => (m ? null : 'plus'))} style={{ width: 46, height: 46, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--panel)', fontSize: 24, cursor: 'pointer', color: 'var(--text)' }}>+</button>
              {menuOpen === 'plus' && (
                <div style={{ position: 'absolute', bottom: 56, right: 0, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 18, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
                  <ActionButton small label="Add file" onClick={() => { fileRef.current?.click(); setMenuOpen(null); }} />
                  <ActionButton small label="New chat" onClick={() => { createChat(activeChat?.mode || 'chat', activeChat?.projectId || null); setMenuOpen(null); }} />
                  <ActionButton small label="Add project" onClick={() => { createProject(); setMenuOpen(null); }} />
                </div>
              )}
            </div>

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message Playcraft..."
              rows={1}
              style={{ flex: 1, resize: 'none', minHeight: 52, maxHeight: 180, overflow: 'auto', borderRadius: 18, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', padding: 14, fontSize: 18 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (editingMessageId) {
                    updateMessage(editingMessageId, { text: draft });
                    setEditingMessageId(null);
                    setDraft('');
                  } else sendMessage(false);
                }
              }}
            />

            {!draft.trim() ? (
              <button onClick={toggleVoiceOverlay} style={{ width: 54, height: 54, borderRadius: 18, border: '1px solid var(--border)', background: 'var(--accent)', color: '#fff', fontSize: 22, cursor: 'pointer' }}>◉</button>
            ) : (
              <button onClick={() => sendMessage(false)} style={{ width: 54, height: 54, borderRadius: 18, border: 'none', background: 'linear-gradient(135deg,var(--accent),var(--accent2))', color: '#fff', fontSize: 22, cursor: 'pointer' }}>➤</button>
            )}

            <input ref={fileRef} type="file" hidden multiple onChange={(e) => onFilePick(e.target.files)} />
          </div>
        </section>

        {previewVisible && (
          <aside style={{ width: 520, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 28, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 14, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionButton small label="Preview" active={previewTab==='preview'} onClick={() => setPreviewTab('preview')} />
                <ActionButton small label="Code" active={previewTab==='code'} onClick={() => setPreviewTab('code')} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {previewFile?.downloadUrl && <ActionButton small label="Download" onClick={() => window.open(previewFile.downloadUrl, '_blank')} />}
                {previewFile?.openUrl && <ActionButton small label="Open" onClick={() => window.open(previewFile.openUrl, '_blank')} />}
                {previewFile?.publishUrl && <ActionButton small label="Publish" onClick={() => window.open(previewFile.publishUrl, '_blank')} />}
                <ActionButton small label="X" onClick={() => setPreviewVisible(false)} />
              </div>
            </div>
            <div style={{ flex: 1, background: t.previewBg }}>
              {previewFile ? (
                previewTab === 'preview' && previewFile.previewUrl ? (
                  <iframe title="preview" src={previewFile.previewUrl} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
                ) : (
                  <pre style={{ margin: 0, padding: 16, overflow: 'auto', height: '100%', direction: 'ltr', textAlign: 'left' }}>{previewFile.code || 'No code yet.'}</pre>
                )
              ) : (
                <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontWeight: 700 }}>When an HTML game or page is created, it will appear here.</div>
              )}
            </div>
          </aside>
        )}
      </main>

      {voiceOverlay && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <div style={{ width: 420, maxWidth: '92vw', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 28, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <div style={{ fontSize: 24, fontWeight: 900 }}>Voice chat</div>
            <div style={{ width: 160, height: 160, borderRadius: 999, background: 'linear-gradient(135deg,var(--accent),var(--accent2))', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 34, animation: listening || speaking ? 'pulse 1.2s infinite' : 'none' }}>◉</div>
            <div style={{ color: 'var(--muted)', textAlign: 'center' }}>{listening ? 'אני מקשיב...' : speaking ? 'אני מדבר...' : 'דבר איתי'}</div>
            <div dir={detectDir(draft)} style={{ minHeight: 40 }}>{draft || '...'}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <ActionButton label={listening ? 'Stop' : 'Listen'} onClick={() => listening ? stopListening() : startListening()} />
              <ActionButton label="Send" onClick={onVoiceSend} />
              <ActionButton label="Close" onClick={() => { stopListening(); setVoiceOverlay(false); }} />
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', background: 'var(--text)', color: 'var(--panel)', padding: '10px 14px', borderRadius: 999 }}>{toast}</div>}
    </div>
  );
}
