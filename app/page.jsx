"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const uid = () => Math.random().toString(36).slice(2, 10);

function createChat(name = "New chat") {
  return {
    id: uid(),
    title: name,
    mode: "chat",
    messages: [],
    createdAt: Date.now(),
  };
}

function createProject(name = "My project") {
  const firstChat = createChat("New chat");
  return {
    id: uid(),
    name,
    chats: [firstChat],
    createdAt: Date.now(),
  };
}

const DEFAULT_PROJECTS = [createProject("General")];

function inferTitle(text) {
  const cleaned = (text || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "New chat";
  return cleaned.slice(0, 32) + (cleaned.length > 32 ? "…" : "");
}

function prettyFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFile(file) {
  return new Promise((resolve) => {
    const isImage = file.type.startsWith("image/");
    const isTextish = /^(text\/|application\/(json|javascript|xml))/.test(file.type) || /\.(txt|md|js|jsx|ts|tsx|css|html|json|ino|cpp|c|h|py|java|rb|go|rs|sql)$/i.test(file.name);

    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => resolve({
        id: uid(),
        name: file.name,
        type: file.type || "image/png",
        size: file.size,
        dataUrl: String(reader.result),
      });
      reader.readAsDataURL(file);
      return;
    }

    if (isTextish) {
      const reader = new FileReader();
      reader.onload = () => resolve({
        id: uid(),
        name: file.name,
        type: file.type || "text/plain",
        size: file.size,
        text: String(reader.result).slice(0, 50000),
      });
      reader.readAsText(file);
      return;
    }

    resolve({
      id: uid(),
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      text: `Binary file attached: ${file.name}`,
    });
  });
}

function TypingDots() {
  return (
    <div className="typingDots" aria-label="Thinking">
      <span />
      <span />
      <span />
    </div>
  );
}

function AttachmentPill({ file, onRemove }) {
  const isImage = file.type?.startsWith("image/") && file.dataUrl;
  return (
    <div className="attachmentPill">
      {isImage ? (
        <img src={file.dataUrl} alt={file.name} className="attachmentThumb" />
      ) : (
        <div className="attachmentIcon">📄</div>
      )}
      <div className="attachmentMeta">
        <div className="attachmentName">{file.name}</div>
        <div className="attachmentSize">{prettyFileSize(file.size)}</div>
      </div>
      {onRemove ? (
        <button className="tinyGhost" onClick={onRemove} type="button">✕</button>
      ) : null}
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`messageRow ${isUser ? "user" : "assistant"}`}>
      <div className="avatar">{isUser ? "U" : "P"}</div>
      <div className="messageBody">
        <div className="messageHeader">{isUser ? "You" : "Playcraft"}</div>

        {msg.files?.length ? (
          <div className="messageFiles">
            {msg.files.map((file) => (
              <AttachmentPill key={file.id} file={file} />
            ))}
          </div>
        ) : null}

        <div className={`bubble ${isUser ? "userBubble" : "assistantBubble"}`}>
          {msg.pending ? <TypingDots /> : <div className="bubbleText">{msg.content}</div>}
        </div>

        {msg.sources?.length ? (
          <div className="sourcesWrap">
            <div className="sourcesTitle">Sources</div>
            <div className="sourcesList">
              {msg.sources.map((source, index) => (
                <a
                  key={`${source.url}-${index}`}
                  className="sourceItem"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="sourceIndex">{index + 1}</span>
                  <span className="sourceText">{source.title || source.url}</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Page() {
  const [projects, setProjects] = useState(DEFAULT_PROJECTS);
  const [activeProjectId, setActiveProjectId] = useState(DEFAULT_PROJECTS[0].id);
  const [activeChatId, setActiveChatId] = useState(DEFAULT_PROJECTS[0].chats[0].id);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const fileInputRef = useRef(null);
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("playcraft-projects-v3");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          setProjects(parsed);
          setActiveProjectId(parsed[0].id);
          setActiveChatId(parsed[0].chats?.[0]?.id || null);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem("playcraft-projects-v3", JSON.stringify(projects));
  }, [projects]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || projects[0],
    [projects, activeProjectId]
  );

  const activeChat = useMemo(() => {
    if (!activeProject) return null;
    return activeProject.chats.find((chat) => chat.id === activeChatId) || activeProject.chats[0] || null;
  }, [activeProject, activeChatId]);

  useEffect(() => {
    if (!activeProject && projects.length) setActiveProjectId(projects[0].id);
  }, [activeProject, projects]);

  useEffect(() => {
    if (!activeChat && activeProject?.chats?.length) setActiveChatId(activeProject.chats[0].id);
  }, [activeChat, activeProject]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [activeChat?.messages?.length]);

  const updateActiveChat = (updater) => {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== activeProjectId) return project;
        return {
          ...project,
          chats: project.chats.map((chat) => {
            if (chat.id !== activeChatId) return chat;
            return typeof updater === "function" ? updater(chat) : { ...chat, ...updater };
          }),
        };
      })
    );
  };

  const createProjectNow = () => {
    const name = window.prompt("Project name?")?.trim();
    if (!name) return;
    const project = createProject(name);
    setProjects((prev) => [project, ...prev]);
    setActiveProjectId(project.id);
    setActiveChatId(project.chats[0].id);
  };

  const createChatNow = (projectId = activeProjectId) => {
    const newChat = createChat("New chat");
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? { ...project, chats: [newChat, ...project.chats] }
          : project
      )
    );
    setActiveProjectId(projectId);
    setActiveChatId(newChat.id);
  };

  const renameProject = (projectId) => {
    const project = projects.find((p) => p.id === projectId);
    const name = window.prompt("New project name?", project?.name || "")?.trim();
    if (!name) return;
    setProjects((prev) => prev.map((project) => (project.id === projectId ? { ...project, name } : project)));
  };

  const renameChat = (chatId) => {
    const chat = activeProject?.chats.find((c) => c.id === chatId);
    const title = window.prompt("New chat name?", chat?.title || "")?.trim();
    if (!title) return;
    setProjects((prev) =>
      prev.map((project) =>
        project.id === activeProjectId
          ? { ...project, chats: project.chats.map((c) => (c.id === chatId ? { ...c, title } : c)) }
          : project
      )
    );
  };

  const removeChat = (chatId) => {
    if (!activeProject) return;
    if (activeProject.chats.length === 1) return;
    setProjects((prev) =>
      prev.map((project) =>
        project.id === activeProjectId
          ? { ...project, chats: project.chats.filter((c) => c.id !== chatId) }
          : project
      )
    );
    const next = activeProject.chats.find((c) => c.id !== chatId);
    if (next) setActiveChatId(next.id);
  };

  const attachFiles = async (files) => {
    const loaded = await Promise.all(Array.from(files).map(readFile));
    setAttachments((prev) => [...prev, ...loaded]);
  };

  const onDragEnter = (e) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragging(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragging(false);
    }
  };
  const onDragOver = (e) => e.preventDefault();
  const onDrop = async (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragging(false);
    if (e.dataTransfer.files?.length) await attachFiles(e.dataTransfer.files);
  };

  const applyTyping = (messageId, fullText, sources = []) => {
    let index = 0;
    const tick = () => {
      index += Math.max(1, Math.ceil(fullText.length / 140));
      const nextSlice = fullText.slice(0, index);
      updateActiveChat((chat) => ({
        ...chat,
        messages: chat.messages.map((msg) =>
          msg.id === messageId
            ? { ...msg, content: nextSlice, pending: index < fullText.length, sources: index >= fullText.length ? sources : [] }
            : msg
        ),
      }));
      if (index < fullText.length) {
        setTimeout(tick, 14);
      }
    };
    tick();
  };

  const send = async () => {
    const content = text.trim();
    if (!content && !attachments.length) return;
    if (!activeChat || sending) return;

    setError("");
    setShowPlusMenu(false);

    const userMessage = {
      id: uid(),
      role: "user",
      content,
      files: attachments,
      createdAt: Date.now(),
    };
    const assistantMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      pending: true,
      createdAt: Date.now(),
      sources: [],
    };

    const nextMessages = [...activeChat.messages, userMessage, assistantMessage];
    updateActiveChat((chat) => ({
      ...chat,
      title: chat.messages.length ? chat.title : inferTitle(content || attachments[0]?.name || "New chat"),
      messages: nextMessages,
    }));

    setText("");
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = "56px";

    const controller = new AbortController();
    abortRef.current = controller;
    setSending(true);

    try {
      const response = await fetch("/api/playcraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          mode: activeChat.mode,
          messages: nextMessages.filter((msg) => !msg.pending),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Request failed");
      }

      applyTyping(assistantMessage.id, data.text || "", data.sources || []);
    } catch (err) {
      const message = err?.name === "AbortError" ? "Stopped." : `⚠️ ${err.message}`;
      updateActiveChat((chat) => ({
        ...chat,
        messages: chat.messages.map((msg) =>
          msg.id === assistantMessage.id ? { ...msg, content: message, pending: false } : msg
        ),
      }));
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const setStudyMode = () => {
    updateActiveChat((chat) => ({ ...chat, mode: chat.mode === "study" ? "chat" : "study" }));
    setShowPlusMenu(false);
  };

  return (
    <div
      className="appShell"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dragging ? (
        <div className="dragOverlay">
          <div className="dragCard">
            <div className="dragEmoji">📎</div>
            <div className="dragTitle">Drop files here</div>
            <div className="dragSub">Images, code, notes, screenshots</div>
          </div>
        </div>
      ) : null}

      <aside className="sidebar">
        <div className="brand">Playcraft</div>

        <div className="sidebarActions">
          <button className="primaryBtn" onClick={() => createChatNow()} type="button">New chat</button>
          <button className="secondaryBtn" onClick={createProjectNow} type="button">New project</button>
        </div>

        <div className="projectList">
          {projects.map((project) => {
            const activeProjectNow = project.id === activeProjectId;
            return (
              <div key={project.id} className="projectCard">
                <div className={`projectHeader ${activeProjectNow ? "active" : ""}`}>
                  <button
                    className="projectButton"
                    type="button"
                    onClick={() => {
                      setActiveProjectId(project.id);
                      setActiveChatId(project.chats[0]?.id || null);
                    }}
                  >
                    <span className="projectName">{project.name}</span>
                    <span className="projectCount">{project.chats.length}</span>
                  </button>
                  <div className="rowActions">
                    <button className="iconBtn" onClick={() => createChatNow(project.id)} type="button">＋</button>
                    <button className="iconBtn" onClick={() => renameProject(project.id)} type="button">✎</button>
                  </div>
                </div>

                {activeProjectNow ? (
                  <div className="chatList">
                    {project.chats.map((chat) => {
                      const activeChatNow = chat.id === activeChatId;
                      return (
                        <div key={chat.id} className={`chatRow ${activeChatNow ? "active" : ""}`}>
                          <button
                            className="chatButton"
                            type="button"
                            onClick={() => {
                              setActiveProjectId(project.id);
                              setActiveChatId(chat.id);
                            }}
                          >
                            {chat.title}
                          </button>
                          <div className="rowActions small">
                            <button className="iconBtn" onClick={() => renameChat(chat.id)} type="button">✎</button>
                            {project.chats.length > 1 ? (
                              <button className="iconBtn danger" onClick={() => removeChat(chat.id)} type="button">✕</button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </aside>

      <main className="mainPanel">
        <header className="topbar">
          <div>
            <div className="topTitle">{activeProject?.name || "Playcraft"}</div>
            <div className="topSub">
              {activeChat?.mode === "study" ? "Study and learn mode" : "Smart build mode"} · web search auto · drag files in
            </div>
          </div>
          {activeChat?.mode === "study" ? <div className="modeBadge">Study</div> : null}
        </header>

        <section className="messagesPane" ref={messagesRef}>
          {!activeChat?.messages?.length ? (
            <div className="emptyState">
              <div className="emptyTitle">Ask for code, games, ESP32, design, or research</div>
              <div className="emptySub">
                It can chat normally, study with you, analyze screenshots, and search the web when needed.
              </div>
            </div>
          ) : (
            activeChat.messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
          )}
        </section>

        <div className="composerWrap">
          {attachments.length ? (
            <div className="attachmentTray">
              {attachments.map((file, index) => (
                <AttachmentPill
                  key={file.id}
                  file={file}
                  onRemove={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                />
              ))}
            </div>
          ) : null}

          {error ? <div className="errorBar">{error}</div> : null}

          <div className="composer">
            <div className="composerLeft">
              <button className="plusBtn" type="button" onClick={() => setShowPlusMenu((v) => !v)}>＋</button>
              {showPlusMenu ? (
                <div className="plusMenu">
                  <button type="button" onClick={() => fileInputRef.current?.click()}>Add file</button>
                  <button type="button" onClick={setStudyMode}>
                    {activeChat?.mode === "study" ? "Back to normal chat" : "Study and learn"}
                  </button>
                </div>
              ) : null}
            </div>

            <textarea
              ref={textareaRef}
              className="composerInput"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = "56px";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask anything, drag in a screenshot, paste code, or ask to search the web..."
            />

            <div className="composerRight">
              {sending ? (
                <button className="stopBtn" type="button" onClick={stop}>Stop</button>
              ) : (
                <button className="sendBtn" type="button" onClick={send}>↑</button>
              )}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => e.target.files && attachFiles(e.target.files)}
          />
        </div>
      </main>

      <style jsx>{`
        :global(html, body) {
          margin: 0;
          padding: 0;
          background: #171513;
          color: #f5efe6;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        :global(*) { box-sizing: border-box; }
        .appShell {
          height: 100vh;
          display: flex;
          overflow: hidden;
          background: radial-gradient(circle at top left, rgba(215,164,91,0.12), transparent 28%), #171513;
          position: relative;
        }
        .sidebar {
          width: 286px;
          flex-shrink: 0;
          border-right: 1px solid rgba(255,255,255,0.08);
          padding: 20px 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          background: rgba(16,15,14,0.78);
          backdrop-filter: blur(14px);
          position: sticky;
          top: 0;
          height: 100vh;
          overflow: auto;
        }
        .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.03em; }
        .sidebarActions { display: grid; gap: 8px; }
        .primaryBtn, .secondaryBtn {
          width: 100%; border: 0; border-radius: 14px; padding: 12px 14px; cursor: pointer; font-size: 14px; font-weight: 700;
        }
        .primaryBtn { background: #f5efe6; color: #171513; }
        .secondaryBtn { background: rgba(255,255,255,0.06); color: #f5efe6; }
        .projectList { display: flex; flex-direction: column; gap: 10px; overflow: auto; padding-bottom: 28px; }
        .projectCard { border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); }
        .projectHeader { display: flex; align-items: center; justify-content: space-between; padding: 8px; border-radius: 16px; }
        .projectHeader.active { background: rgba(255,255,255,0.05); }
        .projectButton { flex: 1; background: transparent; color: inherit; border: 0; text-align: left; padding: 6px 8px; cursor: pointer; }
        .projectName { display: block; font-size: 14px; font-weight: 700; }
        .projectCount { display: block; font-size: 12px; color: rgba(245,239,230,0.55); margin-top: 3px; }
        .rowActions { display: flex; align-items: center; gap: 6px; }
        .rowActions.small { opacity: 0; transition: opacity .15s ease; }
        .chatRow:hover .rowActions.small, .chatRow.active .rowActions.small { opacity: 1; }
        .iconBtn {
          width: 28px; height: 28px; border-radius: 10px; border: 0; cursor: pointer;
          background: transparent; color: rgba(245,239,230,0.75);
        }
        .iconBtn:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .iconBtn.danger:hover { background: rgba(255,92,92,0.12); color: #ff8e8e; }
        .chatList { padding: 0 8px 8px; display: flex; flex-direction: column; gap: 4px; }
        .chatRow {
          display: flex; align-items: center; gap: 8px; padding: 4px; border-radius: 12px;
        }
        .chatRow.active, .chatRow:hover { background: rgba(255,255,255,0.05); }
        .chatButton { flex: 1; background: transparent; border: 0; color: inherit; text-align: left; padding: 8px 10px; cursor: pointer; font-size: 13px; }
        .mainPanel { flex: 1; min-width: 0; display: flex; flex-direction: column; height: 100vh; }
        .topbar {
          padding: 20px 28px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; gap: 16px;
          backdrop-filter: blur(12px); background: rgba(23,21,19,0.72);
        }
        .topTitle { font-size: 20px; font-weight: 800; }
        .topSub { font-size: 13px; color: rgba(245,239,230,0.6); margin-top: 4px; }
        .modeBadge { padding: 8px 12px; border-radius: 999px; background: rgba(215,164,91,0.15); color: #ffd797; font-size: 12px; font-weight: 700; }
        .messagesPane { flex: 1; overflow: auto; padding: 24px 28px 180px; }
        .emptyState {
          max-width: 760px; margin: 12vh auto 0; text-align: center; padding: 28px; border-radius: 28px;
          border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03);
        }
        .emptyTitle { font-size: 28px; line-height: 1.15; font-weight: 800; }
        .emptySub { color: rgba(245,239,230,0.68); font-size: 15px; line-height: 1.7; margin-top: 10px; }
        .messageRow { max-width: 960px; margin: 0 auto 18px; display: flex; gap: 14px; align-items: flex-start; }
        .avatar {
          width: 34px; height: 34px; border-radius: 12px; display: grid; place-items: center; font-size: 13px; font-weight: 800;
          background: rgba(255,255,255,0.08); color: #fff; flex-shrink: 0;
        }
        .messageBody { flex: 1; min-width: 0; }
        .messageHeader { font-size: 12px; color: rgba(245,239,230,0.55); margin-bottom: 8px; }
        .messageFiles { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
        .bubble { border-radius: 20px; padding: 16px 18px; border: 1px solid rgba(255,255,255,0.08); }
        .userBubble { background: rgba(255,255,255,0.07); }
        .assistantBubble { background: rgba(255,255,255,0.03); }
        .bubbleText { white-space: pre-wrap; line-height: 1.75; font-size: 15px; }
        .sourcesWrap { margin-top: 10px; }
        .sourcesTitle { font-size: 12px; color: rgba(245,239,230,0.5); margin-bottom: 6px; }
        .sourcesList { display: flex; flex-wrap: wrap; gap: 8px; }
        .sourceItem {
          display: inline-flex; align-items: center; gap: 8px; text-decoration: none; color: #f5efe6;
          padding: 8px 10px; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.06);
          max-width: 100%;
        }
        .sourceIndex {
          width: 18px; height: 18px; border-radius: 999px; display: grid; place-items: center;
          background: rgba(215,164,91,0.18); color: #ffd797; font-size: 11px; font-weight: 800;
        }
        .sourceText { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
        .composerWrap {
          position: sticky; bottom: 0; padding: 10px 28px 24px; background: linear-gradient(to top, rgba(23,21,19,0.98), rgba(23,21,19,0.84), transparent);
        }
        .composer { max-width: 960px; margin: 0 auto; position: relative; display: flex; gap: 12px; align-items: flex-end; padding: 14px; border-radius: 28px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
        .composerLeft, .composerRight { flex-shrink: 0; position: relative; }
        .composerInput {
          flex: 1; min-height: 56px; max-height: 220px; resize: none; border: 0; outline: none; background: transparent; color: #f5efe6; font-size: 16px; line-height: 1.6; padding: 8px 0;
        }
        .composerInput::placeholder { color: rgba(245,239,230,0.45); }
        .plusBtn, .sendBtn, .stopBtn {
          border: 0; cursor: pointer; border-radius: 18px; height: 52px; min-width: 52px; padding: 0 16px; font-weight: 800; font-size: 16px;
        }
        .plusBtn { background: rgba(0,0,0,0.28); color: #fff; }
        .sendBtn { background: #f5efe6; color: #171513; }
        .stopBtn { background: rgba(255,92,92,0.12); color: #ffb1b1; }
        .plusMenu {
          position: absolute; bottom: 64px; left: 0; min-width: 190px; border-radius: 18px; overflow: hidden;
          background: #25211d; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 14px 40px rgba(0,0,0,0.35);
        }
        .plusMenu button {
          width: 100%; background: transparent; color: #f5efe6; border: 0; text-align: left; padding: 14px 14px; cursor: pointer; font-size: 14px;
        }
        .plusMenu button:hover { background: rgba(255,255,255,0.06); }
        .attachmentTray { max-width: 960px; margin: 0 auto 12px; display: flex; flex-wrap: wrap; gap: 10px; }
        .attachmentPill {
          display: inline-flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 16px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); min-width: 0;
        }
        .attachmentThumb { width: 40px; height: 40px; object-fit: cover; border-radius: 10px; }
        .attachmentIcon { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; background: rgba(255,255,255,0.08); }
        .attachmentMeta { min-width: 0; }
        .attachmentName { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
        .attachmentSize { font-size: 11px; color: rgba(245,239,230,0.5); margin-top: 2px; }
        .tinyGhost { border: 0; background: transparent; color: rgba(245,239,230,0.6); cursor: pointer; }
        .typingDots { display: inline-flex; gap: 6px; align-items: center; height: 18px; }
        .typingDots span {
          width: 7px; height: 7px; border-radius: 999px; background: rgba(245,239,230,0.75); animation: jump 1s infinite ease-in-out;
        }
        .typingDots span:nth-child(2) { animation-delay: .12s; }
        .typingDots span:nth-child(3) { animation-delay: .24s; }
        .dragOverlay {
          position: fixed; inset: 0; z-index: 50; background: rgba(10,10,10,0.55); display: grid; place-items: center;
          backdrop-filter: blur(6px);
        }
        .dragCard { padding: 30px 34px; border-radius: 28px; border: 1px solid rgba(255,255,255,0.1); background: #211c18; text-align: center; }
        .dragEmoji { font-size: 38px; }
        .dragTitle { margin-top: 10px; font-size: 22px; font-weight: 800; }
        .dragSub { margin-top: 6px; font-size: 14px; color: rgba(245,239,230,0.6); }
        .errorBar { max-width: 960px; margin: 0 auto 10px; color: #ffb1b1; font-size: 13px; }
        @keyframes jump {
          0%, 80%, 100% { transform: translateY(0); opacity: .45; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        @media (max-width: 900px) {
          .sidebar { width: 240px; }
          .topTitle { font-size: 18px; }
        }
      `}</style>
    </div>
  );
}
