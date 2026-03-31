'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

const uid = () => Math.random().toString(36).slice(2, 10);

const THEMES = {
  light: {
    bg: '#eef2ff',
    panel: '#ffffff',
    soft: '#f5f7ff',
    text: '#0f172a',
    border: '#dde4ff',
    accent: '#7c5cff',
    accent2: '#5ed0ff',
  },
  dark: {
    bg: '#0b1020',
    panel: '#11182b',
    soft: '#151d32',
    text: '#ecf1ff',
    border: '#29314d',
    accent: '#7c5cff',
    accent2: '#2dd4ff',
  },
};

function Icon({ children }) {
  return <span className="iconWrap">{children}</span>;
}
function IconPlus() { return <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>; }
function IconSend() { return <svg viewBox="0 0 24 24" fill="none"><path d="M21 3 10 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/><path d="M21 3 14 21l-4-7-7-4 18-7Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/></svg>; }
function IconMic() { return <svg viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="2.2"/><path d="M19 11a7 7 0 0 1-14 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/><path d="M12 18v3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/><path d="M8 21h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>; }
function IconFolder() { return <svg viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" strokeWidth="2.2"/></svg>; }
function IconChat() { return <svg viewBox="0 0 24 24" fill="none"><path d="M7 18 3 21V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/></svg>; }
function IconSearch() { return <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2.2"/><path d="m20 20-4.2-4.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>; }
function IconPin() { return <svg viewBox="0 0 24 24" fill="none"><path d="m14 4 6 6-3 1-2 5-1 1-5 2 2-5 1-1 5-2 1-3Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round"/></svg>; }
function IconTrash() { return <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"/></svg>; }
function IconEdit() { return <svg viewBox="0 0 24 24" fill="none"><path d="m4 20 4.5-1 9-9a2.12 2.12 0 0 0-3-3l-9 9L4 20Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round"/></svg>; }
function IconCode() { return <svg viewBox="0 0 24 24" fill="none"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 5l-2 14" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconEye() { return <svg viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="2.1"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2.1"/></svg>; }
function IconDownload() { return <svg viewBox="0 0 24 24" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconOpen() { return <svg viewBox="0 0 24 24" fill="none"><path d="M14 4h6v6M10 14 20 4M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconPublish() { return <svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4M8 8l4-4 4 4M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconX() { return <svg viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"/></svg>; }
function IconHeartUp() { return <svg viewBox="0 0 24 24" fill="none"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.6-7 10-7 10Z" stroke="currentColor" strokeWidth="2.1"/></svg>; }
function IconTheme() { return <svg viewBox="0 0 24 24" fill="none"><path d="M12 3a9 9 0 1 0 9 9A7 7 0 0 1 12 3Z" stroke="currentColor" strokeWidth="2.1"/></svg>; }

function summarizeChat(messages) {
  const text = messages.filter(m => m.role === 'user').map(m => m.text).join(' ').trim();
  if (!text) return 'New chat';
  if (/wordle|וורדל/i.test(text)) return 'וורדל ועיצוב';
  if (/esp32|arduino/i.test(text)) return 'ESP32 / Arduino';
  if (/image|תמונה/i.test(text)) return 'עיצוב מתמונה';
  if (/game|משחק/i.test(text)) return 'בניית משחק';
  return text.replace(/\s+/g, ' ').split(' ').slice(0, 5).join(' ');
}

function makeDefaultChat() {
  return {
    id: uid(),
    projectId: null,
    pinned: false,
    mode: 'chat',
    title: 'New chat',
    messages: [],
    latestFile: null,
    files: [],
  };
}

function makeDefaultProject() {
  return {
    id: uid(),
    name: 'New project',
    pinned: false,
    style: 'modern',
    notes: '',
    preferences: [],
    files: [],
  };
}

export default function Page() {
  const [theme, setTheme] = useState('light');
  const colors = THEMES[theme];
  const [projects, setProjects] = useState([]);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewTab, setPreviewTab] = useState('preview');
  const [typingId, setTypingId] = useState('');
  const [recording, setRecording] = useState(false);
  const [voiceReply, setVoiceReply] = useState(false);
  const [voiceLang, setVoiceLang] = useState('he-IL');
  const [refs, setRefs] = useState([]);
  const [copied, setCopied] = useState('');
  const [toast, setToast] = useState('');
  const abortRef = useRef(null);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const composerRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('playcraft-clean-v1') || '{}');
      if (saved.projects) setProjects(saved.projects);
      if (saved.chats?.length) {
        setChats(saved.chats);
        setActiveChatId(saved.activeChatId || saved.chats[0].id);
      } else {
        const c = makeDefaultChat();
        setChats([c]);
        setActiveChatId(c.id);
      }
      if (saved.theme) setTheme(saved.theme);
    } catch {
      const c = makeDefaultChat();
      setChats([c]);
      setActiveChatId(c.id);
    }
  }, []);

  useEffect(() => {
    if (!chats.length) return;
    localStorage.setItem('playcraft-clean-v1', JSON.stringify({ projects, chats, activeChatId, theme }));
  }, [projects, chats, activeChatId, theme]);

  useEffect(() => {
    const onDown = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const activeChat = chats.find(c => c.id === activeChatId) || chats[0];
  const activeProject = projects.find(p => p.id === activeChat?.projectId) || null;
  const previewFile = activeChat?.latestFile || activeProject?.files?.at?.(-1) || null;

  const filteredProjects = useMemo(() => projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase())), [projects, search]);
  const filteredChats = useMemo(() => chats.filter(c => (c.title || '').toLowerCase().includes(search.toLowerCase())), [chats, search]);

  function updateChat(id, updater) {
    setChats(prev => prev.map(c => c.id === id ? updater(c) : c));
  }

  function createChat(projectId = null) {
    const c = makeDefaultChat();
    c.projectId = projectId;
    setChats(prev => [c, ...prev]);
    setActiveChatId(c.id);
    setDraft('');
    setRefs([]);
    setMenu(null);
  }

  function createProject() {
    const name = prompt('Project name?')?.trim();
    if (!name) return;
    const p = { ...makeDefaultProject(), name };
    setProjects(prev => [p, ...prev]);
    createChat(p.id);
  }

  function renameChat(id) {
    const target = chats.find(c => c.id === id);
    const name = prompt('Rename chat', target?.title || '')?.trim();
    if (!name) return;
    updateChat(id, c => ({ ...c, title: name }));
  }

  function renameProject(id) {
    const target = projects.find(p => p.id === id);
    const name = prompt('Rename project', target?.name || '')?.trim();
    if (!name) return;
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p));
  }

  function deleteChat(id) {
    const remain = chats.filter(c => c.id !== id);
    if (!remain.length) {
      const c = makeDefaultChat();
      setChats([c]);
      setActiveChatId(c.id);
      return;
    }
    setChats(remain);
    if (activeChatId === id) setActiveChatId(remain[0].id);
  }

  function deleteProject(id) {
    setProjects(prev => prev.filter(p => p.id !== id));
    setChats(prev => prev.map(c => c.projectId === id ? { ...c, projectId: null } : c));
  }

  function togglePinChat(id) { updateChat(id, c => ({ ...c, pinned: !c.pinned })); }
  function togglePinProject(id) { setProjects(prev => prev.map(p => p.id === id ? { ...p, pinned: !p.pinned } : p)); }

  function speakText(text) {
    if (!voiceReply || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voiceLang;
    window.speechSynthesis.speak(u);
  }

  function startVoiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setToast('Voice input not supported here');
      return;
    }
    const rec = new SR();
    rec.lang = voiceLang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setRecording(true);
    rec.onerror = () => { setRecording(false); setToast('Voice failed'); };
    rec.onend = () => setRecording(false);
    rec.onresult = e => {
      const text = e.results?.[0]?.[0]?.transcript || '';
      if (!text) return;
      setDraft(text);
      setTimeout(() => sendMessage(text), 80);
    };
    rec.start();
  }

  async function toDataUrl(file) {
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function addFiles(fileList) {
    const arr = Array.from(fileList || []);
    const next = [];
    for (const f of arr) {
      const item = { name: f.name, type: f.type || 'application/octet-stream' };
      if (f.type.startsWith('image/')) item.dataUrl = await toDataUrl(f);
      else item.text = await f.text();
      next.push(item);
    }
    setRefs(prev => [...prev, ...next]);
    setMenu(null);
  }

  async function sendMessage(forcedText) {
    const text = (forcedText ?? draft).trim();
    if (!text && refs.length === 0) return;
    if (!activeChat) return;

    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
      abortRef.current = null;
    }

    const userMsg = { id: uid(), role: 'user', text, createdAt: Date.now() };
    const placeholderId = uid();

    updateChat(activeChat.id, c => {
      const nextMessages = [...c.messages, userMsg, { id: placeholderId, role: 'assistant', text: '', loading: true, createdAt: Date.now() }];
      return { ...c, messages: nextMessages, title: summarizeChat(nextMessages) };
    });

    setDraft('');
    setRefs([]);
    setLoading(true);
    setTypingId(placeholderId);
    setStatus('Thinking...');
    setMenu(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/playcraft', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: text,
          mode: activeChat.mode || 'chat',
          messages: activeChat.messages.map(m => ({ role: m.role, text: m.text })),
          references: refs,
          latestFile: activeChat.latestFile,
          projectMemory: activeProject ? { style: activeProject.style, notes: activeProject.notes, preferences: activeProject.preferences } : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      const assistantText = data.text || 'Done.';
      const files = data.files || [];
      const firstFile = files[0] || null;

      updateChat(activeChat.id, c => {
        const msgs = c.messages.map(m => m.id === placeholderId ? { ...m, text: assistantText, loading: false, files } : m);
        return {
          ...c,
          title: data.title || summarizeChat(msgs),
          messages: msgs,
          latestFile: firstFile || c.latestFile,
          files: files.length ? [...(c.files || []), ...files] : c.files,
        };
      });

      if (activeProject && files.length) {
        setProjects(prev => prev.map(p => p.id === activeProject.id ? { ...p, files: [...(p.files || []), ...files] } : p));
      }

      if (firstFile) {
        setPreviewOpen(true);
        setPreviewTab(firstFile.language === 'html' ? 'preview' : 'code');
      }

      speakText(assistantText);
      setStatus('');
    } catch (err) {
      const msg = err?.message || 'Request failed';
      updateChat(activeChat.id, c => ({
        ...c,
        messages: c.messages.map(m => m.id === placeholderId ? { ...m, text: `⚠️ ${msg}`, loading: false } : m),
      }));
      setStatus('');
    } finally {
      setLoading(false);
      setTypingId('');
      abortRef.current = null;
    }
  }

  function copy(text, key) {
    navigator.clipboard.writeText(text || '');
    setCopied(key);
    setToast('Copied');
    setTimeout(() => setCopied(''), 1300);
  }

  function downloadFile(file) {
    if (file?.downloadUrl) {
      window.open(file.downloadUrl, '_blank');
      return;
    }
    const blob = new Blob([file.content], { type: file.mimeType || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name || 'file.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  function openFile(file) {
    if (file?.openUrl) window.open(file.openUrl, '_blank');
    else setPreviewOpen(true);
  }

  function publishFile(file) {
    if (file?.publishedUrl) {
      navigator.clipboard.writeText(file.publishedUrl);
      setToast('Publish link copied');
      window.open(file.publishedUrl, '_blank');
    }
  }

  const sortedProjects = [...filteredProjects].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const sortedChats = [...filteredChats].sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return (
    <div className="shell" style={{ '--bg': colors.bg, '--panel': colors.panel, '--soft': colors.soft, '--text': colors.text, '--border': colors.border, '--accent': colors.accent, '--accent2': colors.accent2 }}>
      <aside className="sidebar">
        <div className="brand"><div className="brandDot">✦</div><div><div className="brandName">Playcraft</div><div className="brandSub">smart chat, code, games</div></div></div>
        <div className="searchBox"><Icon><IconSearch /></Icon><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats and projects" /></div>
        <div className="sideActions">
          <button className="bigBtn" onClick={() => createChat(null)}><Icon><IconChat /></Icon>New chat</button>
          <button className="bigBtn" onClick={createProject}><Icon><IconFolder /></Icon>Add project</button>
        </div>

        <div className="sectionTitle">Projects</div>
        <div className="listCol">
          {sortedProjects.length ? sortedProjects.map(p => (
            <div key={p.id} className="listCard">
              <div className="listMain" onClick={() => createChat(p.id)}><Icon><IconFolder /></Icon><div><div>{p.name}</div><small>{p.style}</small></div></div>
              <div className="actionsMini">
                <button onClick={() => togglePinProject(p.id)} title="Pin"><IconPin /></button>
                <button onClick={() => renameProject(p.id)} title="Rename"><IconEdit /></button>
                <button onClick={() => deleteProject(p.id)} title="Delete"><IconTrash /></button>
              </div>
            </div>
          )) : <div className="emptySmall">No projects yet</div>}
        </div>

        <div className="sectionTitle">Chats</div>
        <div className="listCol">
          {sortedChats.map(c => (
            <div key={c.id} className={`listCard ${c.id === activeChatId ? 'active' : ''}`} onClick={() => setActiveChatId(c.id)}>
              <div className="listMain"><Icon><IconChat /></Icon><div><div>{c.title}</div><small>{c.mode || 'chat'}</small></div></div>
              <div className="actionsMini">
                <button onClick={e => { e.stopPropagation(); togglePinChat(c.id); }} title="Pin"><IconPin /></button>
                <button onClick={e => { e.stopPropagation(); renameChat(c.id); }} title="Rename"><IconEdit /></button>
                <button onClick={e => { e.stopPropagation(); deleteChat(c.id); }} title="Delete"><IconTrash /></button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <div className="chatTitle" dir="auto">{activeChat?.title || 'New chat'}</div>
            <div className="chatSub">{activeChat?.mode || 'chat'}</div>
          </div>
          <div className="toolbar" ref={menuRef}>
            <button className="pill" onClick={() => setMenu(menu === 'mode' ? null : 'mode')}><Icon><IconChat /></Icon>{activeChat?.mode || 'chat'}</button>
            <button className="pill" onClick={() => setMenu(menu === 'theme' ? null : 'theme')}><Icon><IconTheme /></Icon>Backgrounds & colors</button>
            <button className="pill" onClick={() => setPreviewOpen(v => !v)}>{previewOpen ? 'Hide preview' : 'Show preview'}</button>
            {menu === 'mode' && <div className="menuPop"><MenuItem label="Chat" onClick={() => { updateChat(activeChat.id, c => ({ ...c, mode: 'chat' })); setMenu(null); }} /><MenuItem label="Build" onClick={() => { updateChat(activeChat.id, c => ({ ...c, mode: 'build' })); setMenu(null); }} /><MenuItem label="Code" onClick={() => { updateChat(activeChat.id, c => ({ ...c, mode: 'code' })); setMenu(null); }} /><MenuItem label="Study" onClick={() => { updateChat(activeChat.id, c => ({ ...c, mode: 'study' })); setMenu(null); }} /><MenuItem label="Image" onClick={() => { updateChat(activeChat.id, c => ({ ...c, mode: 'image' })); setMenu(null); }} /></div>}
            {menu === 'theme' && <div className="menuPop"><MenuItem label="Light" onClick={() => { setTheme('light'); setMenu(null); }} /><MenuItem label="Dark" onClick={() => { setTheme('dark'); setMenu(null); }} /><MenuItem label={`Voice replies: ${voiceReply ? 'On' : 'Off'}`} onClick={() => setVoiceReply(v => !v)} /><MenuItem label={`Voice language: ${voiceLang}`} onClick={() => setVoiceLang(voiceLang === 'he-IL' ? 'en-US' : 'he-IL')} /></div>}
          </div>
        </div>

        <div className="contentWrap">
          <section className="chatPane">
            <div className="messages" ref={messagesRef}>
              {activeChat?.messages?.length ? activeChat.messages.map(m => (
                <MessageBubble
                  key={m.id}
                  msg={m}
                  onCopy={() => copy(m.text, m.id)}
                  copied={copied === m.id}
                  onEdit={m.role === 'user' ? () => setDraft(m.text) : undefined}
                />
              )) : <div className="emptyIntro"><div className="emptyOrb">✦</div><div><h2>Type or talk to start.</h2><p>I can chat, code, build games, explain topics, and work from screenshots.</p></div></div>}
            </div>

            <div className="composerShell" ref={composerRef}>
              {refs.length > 0 && <div className="refsRow">{refs.map((r, i) => <div key={i} className="refChip">{r.name}</div>)}</div>}
              <div className="composer">
                <button className="roundBtn" onClick={() => setMenu(menu === 'plus' ? null : 'plus')}><IconPlus /></button>
                {menu === 'plus' && <div className="menuPop plus"><MenuItem label="Add file" onClick={() => { fileInputRef.current?.click(); setMenu(null); }} /><MenuItem label="New chat" onClick={() => createChat(activeProject?.id || null)} /><MenuItem label="Add project" onClick={createProject} /></div>}
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder="Message Playcraft..."
                  rows={1}
                  dir="auto"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                />
                {loading ? (
                  <button className="roundBtn accent" onClick={() => { abortRef.current?.abort(); setLoading(false); setStatus(''); }}>⏹</button>
                ) : draft.trim() ? (
                  <button className="roundBtn accent" onClick={() => sendMessage()}><IconSend /></button>
                ) : (
                  <button className={`roundBtn ${recording ? 'recording' : ''}`} onClick={startVoiceInput}><IconMic /></button>
                )}
                <input ref={fileInputRef} hidden multiple type="file" onChange={e => addFiles(e.target.files)} />
              </div>
              {status ? <div className="status">{status}</div> : null}
            </div>
          </section>

          {previewOpen && (
            <aside className="previewPane">
              <div className="previewTop">
                <div className="previewTabs">
                  <button className={`tab ${previewTab === 'preview' ? 'active' : ''}`} onClick={() => setPreviewTab('preview')}><IconEye /></button>
                  <button className={`tab ${previewTab === 'code' ? 'active' : ''}`} onClick={() => setPreviewTab('code')}><IconCode /></button>
                  <div className="previewName">{previewFile?.name || 'Preview'}</div>
                </div>
                <div className="previewActions">
                  {previewFile && <button className="smallBtn" onClick={() => copy(previewFile.content, 'file-code')}>{copied === 'file-code' ? 'Copied' : 'Copy'}</button>}
                  {previewFile && <button className="smallBtn" onClick={() => downloadFile(previewFile)}><IconDownload /></button>}
                  {previewFile && <button className="smallBtn" onClick={() => openFile(previewFile)}><IconOpen /></button>}
                  {previewFile && <button className="smallBtn" onClick={() => publishFile(previewFile)}><IconPublish /></button>}
                  <button className="smallBtn" onClick={() => setPreviewOpen(false)}><IconX /></button>
                </div>
              </div>
              <div className="previewBody">
                {!previewFile ? <div className="previewEmpty">When an HTML game or page is created, it will appear here.</div> : previewTab === 'preview' && previewFile.mimeType === 'text/html' ? <iframe title="preview" src={previewFile.openUrl || `data:text/html;charset=utf-8,${encodeURIComponent(previewFile.content)}`} /> : <pre className="codeView" dir="ltr">{previewFile.content}</pre>}
              </div>
            </aside>
          )}
        </div>
      </main>

      {toast ? <div className="toast">{toast}</div> : null}

      <style jsx global>{`
        *{box-sizing:border-box} html,body{margin:0;padding:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;background:var(--bg);color:var(--text)} body{height:100vh;overflow:hidden} button,input,textarea{font:inherit} input,textarea{outline:none}
        .shell{--shadow:0 18px 40px rgba(30,41,59,.08);display:grid;grid-template-columns:320px 1fr;height:100vh;background:linear-gradient(180deg,var(--bg),color-mix(in srgb,var(--bg) 86%, white));padding:16px;gap:16px}
        .sidebar,.main,.previewPane,.listCard,.bigBtn,.composer,.previewTop,.menuPop,.searchBox,.emptySmall,.composerShell,.message,.emptyIntro,.refChip{background:var(--panel);border:1px solid var(--border)}
        .sidebar{border-radius:28px;padding:18px;display:flex;flex-direction:column;gap:14px;overflow:auto}.brand{display:flex;align-items:center;gap:12px}.brandDot{width:38px;height:38px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,var(--accent),var(--accent2));color:white}.brandName{font-weight:900;font-size:28px}.brandSub{font-size:13px;opacity:.7}
        .searchBox{display:flex;align-items:center;gap:10px;border-radius:18px;padding:12px 14px}.searchBox input{border:none;background:transparent;flex:1;color:var(--text)}.iconWrap{width:18px;height:18px;display:inline-grid;place-items:center}.iconWrap svg{width:100%;height:100%}
        .sideActions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.bigBtn{display:flex;align-items:center;justify-content:center;gap:10px;border-radius:20px;padding:14px;border:none;color:var(--text);cursor:pointer;font-weight:800}.bigBtn:hover{transform:translateY(-1px)}
        .sectionTitle{margin-top:6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.6;font-weight:800}.listCol{display:flex;flex-direction:column;gap:8px}.listCard{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-radius:18px;cursor:pointer}.listCard.active{outline:2px solid color-mix(in srgb,var(--accent) 65%, transparent)}.listMain{display:flex;gap:10px;align-items:center;min-width:0}.listMain small{display:block;opacity:.6}.actionsMini{display:flex;gap:6px;opacity:0;transition:.15s}.listCard:hover .actionsMini{opacity:1}.actionsMini button{width:30px;height:30px;border-radius:10px;border:none;background:var(--soft);color:var(--text);cursor:pointer}.actionsMini svg{width:16px;height:16px}.emptySmall{border-radius:18px;padding:16px;opacity:.65}
        .main{display:flex;flex-direction:column;gap:14px}.topbar{display:flex;justify-content:space-between;align-items:center;padding:8px 8px 0 8px}.chatTitle{font-size:34px;font-weight:900;unicode-bidi:plaintext}.chatSub{opacity:.6}.toolbar{display:flex;align-items:center;gap:10px;position:relative}.pill{display:flex;align-items:center;gap:8px;border:none;background:var(--panel);border:1px solid var(--border);padding:12px 16px;border-radius:18px;color:var(--text);cursor:pointer}
        .menuPop{position:absolute;top:56px;right:0;border-radius:18px;padding:8px;display:flex;flex-direction:column;gap:4px;min-width:230px;z-index:40;box-shadow:var(--shadow)}.menuPop.plus{bottom:74px;top:auto;left:0;right:auto}.menuItem{display:flex;align-items:center;justify-content:space-between;padding:11px 12px;border-radius:12px;cursor:pointer}.menuItem:hover{background:var(--soft)}
        .contentWrap{display:grid;grid-template-columns:minmax(0,1fr) ${previewOpen ? '480px' : '0px'};gap:16px;min-height:0;flex:1}.chatPane{display:grid;grid-template-rows:minmax(0,1fr) auto;min-height:0;background:var(--panel);border:1px solid var(--border);border-radius:28px;overflow:hidden}.messages{padding:18px;overflow:auto;display:flex;flex-direction:column;gap:14px}.emptyIntro{display:flex;align-items:center;gap:18px;border-radius:24px;padding:18px 20px}.emptyOrb{width:52px;height:52px;border-radius:18px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:grid;place-items:center;color:#fff;font-weight:900}
        .composerShell{padding:12px;border-top:1px solid var(--border);position:relative}.composer{display:flex;align-items:flex-end;gap:10px;border-radius:24px;padding:10px;background:var(--soft);position:relative}.composer textarea{flex:1;resize:none;min-height:54px;max-height:160px;border:none;background:transparent;color:var(--text);padding:12px 4px}.roundBtn{width:44px;height:44px;border-radius:16px;border:none;background:var(--panel);color:var(--text);display:grid;place-items:center;cursor:pointer;flex:0 0 auto}.roundBtn svg{width:20px;height:20px}.roundBtn.accent{background:linear-gradient(135deg,var(--accent),var(--accent2));color:white}.roundBtn.recording{animation:pulse 1s infinite}.status{font-size:13px;opacity:.7;padding:6px 8px 0}.refsRow{display:flex;gap:8px;flex-wrap:wrap;padding-bottom:8px}.refChip{padding:8px 12px;border-radius:999px;font-size:13px;background:var(--soft)}
        .messageRow{display:flex;align-items:flex-end;gap:10px}.messageRow.user{justify-content:flex-end}.avatar{width:38px;height:38px;border-radius:14px;display:grid;place-items:center;font-weight:900;background:linear-gradient(135deg,var(--accent),var(--accent2));color:white;flex:0 0 auto}.avatar.assistant{background:var(--soft);color:var(--accent)}.message{max-width:min(78ch,88%);padding:14px 16px;border-radius:22px;position:relative}.messageText{white-space:pre-wrap;line-height:1.6;unicode-bidi:plaintext}.messageText pre,.codeView{margin:0;white-space:pre-wrap;overflow:auto;padding:16px;border-radius:16px;background:#0f172a;color:#e5efff;border:1px solid rgba(148,163,184,.2)} .codeView{height:100%}
        .hoverBar{display:flex;gap:6px;opacity:0;transition:.15s}.messageRow:hover .hoverBar{opacity:1}.tinyBtn{border:none;background:var(--soft);color:var(--text);padding:7px 9px;border-radius:10px;cursor:pointer;font-size:12px}.tinyBtn:hover{background:color-mix(in srgb,var(--soft) 70%, var(--accent) 15%)}
        .previewPane{border-radius:28px;overflow:hidden;display:grid;grid-template-rows:auto 1fr}.previewTop{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:28px 28px 0 0}.previewTabs{display:flex;align-items:center;gap:8px;min-width:0}.tab{width:40px;height:40px;border-radius:12px;border:none;background:var(--soft);display:grid;place-items:center;cursor:pointer;color:var(--text)}.tab.active{background:linear-gradient(135deg,var(--accent),var(--accent2));color:white}.previewName{font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px}.previewActions{display:flex;gap:8px}.smallBtn{border:none;background:var(--soft);color:var(--text);padding:10px 12px;border-radius:12px;cursor:pointer;display:grid;place-items:center}.smallBtn svg{width:18px;height:18px}.previewBody{min-height:0;background:var(--panel);border-top:1px solid var(--border)}.previewBody iframe{width:100%;height:100%;border:none;background:white}.previewEmpty{display:grid;place-items:center;height:100%;opacity:.6;padding:20px;text-align:center}
        .toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);padding:12px 16px;border-radius:14px;background:#0f172a;color:white;z-index:80;box-shadow:var(--shadow)}
        @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(124,92,255,.35)}100%{box-shadow:0 0 0 12px rgba(124,92,255,0)}}
        @media (max-width: 1200px){.contentWrap{grid-template-columns:1fr}.previewPane{order:-1;height:360px}}
      `}</style>
    </div>
  );
}

function MenuItem({ label, onClick }) {
  return <div className="menuItem" onClick={onClick}>{label}</div>;
}

function MessageBubble({ msg, onCopy, copied, onEdit }) {
  const files = msg.files || [];
  return (
    <div className={`messageRow ${msg.role === 'user' ? 'user' : ''}`}>
      {msg.role !== 'user' && <div className="avatar assistant">✦</div>}
      <div>
        <div className={`message ${msg.role === 'user' ? 'user' : 'assistant'}`}>
          <div className="messageText" dir="auto">{msg.loading ? '…' : msg.text}</div>
          {files.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{files.map((f, i) => <div key={i} className="refChip">{f.name}</div>)}</div>}
        </div>
        <div className="hoverBar" style={{ marginTop: 6 }}>
          <button className="tinyBtn" onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</button>
          {onEdit ? <button className="tinyBtn" onClick={onEdit}>Edit</button> : <button className="tinyBtn">Like</button>}
          {!onEdit ? <button className="tinyBtn">Dislike</button> : null}
        </div>
      </div>
      {msg.role === 'user' && <div className="avatar">U</div>}
    </div>
  );
}
