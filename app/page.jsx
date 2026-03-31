'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

const THEMES = {
  light: {
    name: 'Light',
    bg: '#f6f8ff',
    panel: '#ffffff',
    panelAlt: '#eef2ff',
    text: '#0f172a',
    sub: '#64748b',
    border: '#dbe4ff',
    bubbleUser: '#7c6cff',
    bubbleBot: '#ffffff',
    accent: '#7c6cff',
    accent2: '#43b9ff',
    shadow: '0 20px 60px rgba(79,70,229,.14)'
  },
  dark: {
    name: 'Dark',
    bg: '#071126',
    panel: '#0c1731',
    panelAlt: '#101f43',
    text: '#f7faff',
    sub: '#9db0d3',
    border: '#22345b',
    bubbleUser: '#7c6cff',
    bubbleBot: '#111f3f',
    accent: '#8f7cff',
    accent2: '#3fd1ff',
    shadow: '0 20px 60px rgba(0,0,0,.35)'
  }
};

const ACCENTS = [
  { id: 'violet', name: 'Violet', a: '#7c6cff', b: '#43b9ff' },
  { id: 'mint', name: 'Mint', a: '#00c2a8', b: '#78ffd6' },
  { id: 'sunset', name: 'Sunset', a: '#ff7c5c', b: '#ffb86a' },
  { id: 'pink', name: 'Pink', a: '#ff5fcf', b: '#8a7dff' },
  { id: 'lime', name: 'Lime', a: '#6ccf3b', b: '#d7ff6a' }
];

const MODES = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'build', label: 'Build', icon: '🎮' },
  { id: 'code', label: 'Code', icon: '⌨️' },
  { id: 'study', label: 'Study', icon: '📘' }
];

const uid = () => Math.random().toString(36).slice(2, 10);

function detectTextLang(text = '') {
  const heb = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const lat = (text.match(/[A-Za-z]/g) || []).length;
  return heb >= lat ? 'he-IL' : 'en-US';
}

function summarizeTitle(messages) {
  const joined = messages.map(m => m.text || '').join(' ').trim();
  if (!joined) return 'New chat';
  const clean = joined.replace(/\s+/g, ' ').trim();
  const first = clean.slice(0, 46);
  return first.length < clean.length ? first + '…' : first;
}

function Icon({ name, size = 18, stroke = 2 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'search': return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
    case 'chat': return <svg {...common}><path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z" /></svg>;
    case 'project': return <svg {...common}><path d="M3 7h6l2 2h10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2" /></svg>;
    case 'plus': return <svg {...common}><path d="M12 5v14" /><path d="M5 12h14" /></svg>;
    case 'mic': return <svg {...common}><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></svg>;
    case 'send': return <svg {...common}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>;
    case 'stop': return <svg {...common}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
    case 'preview': return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'code': return <svg {...common}><path d="m8 16-4-4 4-4" /><path d="m16 8 4 4-4 4" /></svg>;
    case 'download': return <svg {...common}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
    case 'publish': return <svg {...common}><path d="M12 5v14" /><path d="m5 12 7-7 7 7" /></svg>;
    case 'refresh': return <svg {...common}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>;
    case 'edit': return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
    case 'copy': return <svg {...common}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
    case 'trash': return <svg {...common}><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>;
    case 'pin': return <svg {...common}><path d="m12 17-4 4v-7L3 9l6-1 3-5 3 5 6 1-5 5v7z" /></svg>;
    case 'close': return <svg {...common}><path d="m18 6-12 12" /><path d="m6 6 12 12" /></svg>;
    case 'palette': return <svg {...common}><path d="M12 22a10 10 0 1 1 10-10c0 1.7-1.3 3-3 3h-1a2 2 0 0 0-2 2c0 1.1-.9 2-2 2z" /><circle cx="7.5" cy="10.5" r=".8" fill="currentColor" stroke="none" /><circle cx="12" cy="7.5" r=".8" fill="currentColor" stroke="none" /><circle cx="16.5" cy="10.5" r=".8" fill="currentColor" stroke="none" /></svg>;
    case 'more': return <svg {...common}><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" /></svg>;
    default: return null;
  }
}

function extractCodeBlocks(text='') {
  const regex = /```([\w-]*)\n([\s\S]*?)```/g;
  const out = [];
  let m;
  while ((m = regex.exec(text))) out.push({ lang: m[1] || 'code', code: m[2].trim() });
  return out;
}

function stripCode(text='') { return text.replace(/```[\s\S]*?```/g, '').trim(); }

export default function Playcraft() {
  const [theme, setTheme] = useState('light');
  const [accent, setAccent] = useState('violet');
  const [projects, setProjects] = useState([]);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState(null);
  const [hoverMsg, setHoverMsg] = useState(null);
  const [showPreview, setShowPreview] = useState(true);
  const [previewTab, setPreviewTab] = useState('preview');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState('auto');
  const [voiceReply, setVoiceReply] = useState(true);
  const [split, setSplit] = useState(42);

  const menuRef = useRef(null);
  const messagesRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const typingTimerRef = useRef(null);
  const dragRef = useRef(false);

  const palette = { ...THEMES[theme], accent: ACCENTS.find(x => x.id === accent)?.a || THEMES[theme].accent, accent2: ACCENTS.find(x => x.id === accent)?.b || THEMES[theme].accent2 };

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('playcraft_clean_state') || '{}');
    if (saved.theme) setTheme(saved.theme);
    if (saved.accent) setAccent(saved.accent);
    if (saved.projects) setProjects(saved.projects);
    if (saved.chats) setChats(saved.chats);
    if (saved.activeChatId) setActiveChatId(saved.activeChatId);
  }, []);

  useEffect(() => {
    localStorage.setItem('playcraft_clean_state', JSON.stringify({ theme, accent, projects, chats, activeChatId }));
  }, [theme, accent, projects, chats, activeChatId]);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(null);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [activeChatId, chats]);

  useEffect(() => {
    const loadVoices = () => setVoices(window.speechSynthesis ? window.speechSynthesis.getVoices() : []);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const activeChat = useMemo(() => chats.find(c => c.id === activeChatId) || null, [chats, activeChatId]);
  const filteredProjects = projects.filter(p => p.title.toLowerCase().includes(search.toLowerCase()));
  const filteredChats = chats.filter(c => c.title.toLowerCase().includes(search.toLowerCase()) || c.messages.some(m => (m.text || '').toLowerCase().includes(search.toLowerCase())));

  function ensureChat() {
    if (activeChat) return activeChat.id;
    const id = uid();
    const chat = {
      id,
      title: 'New chat',
      mode: 'chat',
      projectId: null,
      createdAt: Date.now(),
      pinned: false,
      messages: [],
      files: [],
      lastFile: null,
      projectMemory: { style: 'modern', preferences: [], lastSummary: '' }
    };
    setChats(prev => [chat, ...prev]);
    setActiveChatId(id);
    return id;
  }

  function newChat(projectId = null, mode = 'chat') {
    const id = uid();
    const chat = { id, title: 'New chat', mode, projectId, createdAt: Date.now(), pinned: false, messages: [], files: [], lastFile: null, projectMemory: { style: 'modern', preferences: [], lastSummary: '' } };
    setChats(prev => [chat, ...prev]);
    setActiveChatId(id);
    setMenu(null);
  }

  function addProject() {
    const title = prompt('Project name');
    if (!title) return;
    const p = { id: uid(), title: title.trim(), pinned: false, createdAt: Date.now(), style: 'modern', preferences: [] };
    setProjects(prev => [p, ...prev]);
    setMenu(null);
  }

  function updateChat(chatId, updater) {
    setChats(prev => prev.map(c => c.id === chatId ? updater(c) : c));
  }

  function renameChat(chatId) {
    const chat = chats.find(c => c.id === chatId);
    const title = prompt('Rename chat', chat?.title || '');
    if (!title) return;
    updateChat(chatId, c => ({ ...c, title: title.trim() }));
  }

  function deleteChat(chatId) {
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (activeChatId === chatId) setActiveChatId(chats.filter(c => c.id !== chatId)[0]?.id || null);
  }

  function renameProject(projectId) {
    const p = projects.find(x => x.id === projectId);
    const title = prompt('Rename project', p?.title || '');
    if (!title) return;
    setProjects(prev => prev.map(x => x.id === projectId ? { ...x, title: title.trim() } : x));
  }

  function deleteProject(projectId) {
    setProjects(prev => prev.filter(x => x.id !== projectId));
    setChats(prev => prev.map(c => c.projectId === projectId ? { ...c, projectId: null } : c));
  }

  function copyText(text) {
    navigator.clipboard.writeText(text || '').then(() => {
      setToast('Copied');
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => setToast(''), 1200);
    });
  }

  async function speakText(text) {
    if (!voiceReply || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const lang = detectTextLang(text);
    utter.lang = lang;
    if (voiceName !== 'auto') {
      const v = voices.find(v => v.name === voiceName);
      if (v) utter.voice = v;
    } else {
      const best = voices.find(v => v.lang?.toLowerCase().startsWith(lang.toLowerCase().slice(0,2)));
      if (best) utter.voice = best;
    }
    window.speechSynthesis.speak(utter);
  }

  async function sendMessage(forceMode = null, userText = null) {
    const text = (userText ?? draft).trim();
    if (!text && !forceMode) return;
    const chatId = ensureChat();
    const chat = chats.find(c => c.id === chatId) || { mode: 'chat', messages: [], files: [], projectMemory: {} };
    const message = { id: uid(), role: 'user', text, createdAt: Date.now() };
    const nextMode = forceMode || chat.mode || 'chat';
    updateChat(chatId, c => ({ ...c, mode: nextMode, messages: [...c.messages, message] }));
    setDraft('');
    setLoading(true);
    try {
      const res = await fetch('/api/playcraft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          mode: nextMode,
          history: [...(chat.messages || []), message].slice(-12).map(m => ({ role: m.role, text: m.text })),
          project: projects.find(p => p.id === chat.projectId) || chat.projectMemory || null,
          lastFile: chat.lastFile || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      const bot = { id: uid(), role: 'assistant', text: data.text || 'Done.', createdAt: Date.now(), code: data.code || '', file: data.file || null };
      updateChat(chatId, c => {
        const messages = [...c.messages, bot];
        const files = data.file ? [data.file, ...(c.files || [])] : (c.files || []);
        return {
          ...c,
          title: data.title || summarizeTitle(messages),
          messages,
          files,
          lastFile: data.file || c.lastFile || null,
          projectMemory: { ...(c.projectMemory || {}), lastSummary: (data.title || summarizeTitle(messages)) }
        };
      });
      if (voiceActive) speakText(data.text || '');
      if (data.file?.previewUrl) {
        setShowPreview(true);
        setPreviewTab('preview');
      }
    } catch (e) {
      updateChat(chatId, c => ({ ...c, messages: [...c.messages, { id: uid(), role: 'assistant', text: `⚠️ ${e.message}`, createdAt: Date.now() }] }));
    } finally {
      setLoading(false);
    }
  }

  function startVoiceConversation() {
    const SpeechRec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    if (!SpeechRec) {
      setToast('Voice is not supported here');
      setTimeout(() => setToast(''), 1500);
      return;
    }
    try {
      const rec = new SpeechRec();
      recognitionRef.current = rec;
      rec.lang = detectTextLang(activeChat?.messages?.at(-1)?.text || navigator.language || 'en-US');
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = (event) => {
        let finalText = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const txt = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText += txt + ' ';
          else interim += txt;
        }
        setVoiceText((finalText || '') + (interim || ''));
        if (finalText.trim()) {
          sendMessage(null, finalText.trim());
        }
      };
      rec.onerror = () => {};
      rec.onend = () => { if (voiceActive) { try { rec.start(); } catch {} } };
      rec.start();
      setVoiceOpen(true);
      setVoiceActive(true);
      setVoiceText('');
    } catch (e) {
      setToast('Voice could not start');
      setTimeout(() => setToast(''), 1500);
    }
  }

  function stopVoiceConversation() {
    setVoiceActive(false);
    setVoiceOpen(false);
    setVoiceText('');
    try { recognitionRef.current?.stop(); } catch {}
    try { window.speechSynthesis?.cancel(); } catch {}
  }

  function onOpenInBrowser(file) { if (file?.openUrl) window.open(file.openUrl, '_blank'); }
  function onPublish(file) { if (file?.publishUrl) { window.open(file.publishUrl, '_blank'); copyText(file.publishUrl); } }
  function onDownload(file) { if (file?.downloadUrl) window.open(file.downloadUrl, '_blank'); }

  const previewFile = activeChat?.lastFile || activeChat?.files?.[0] || null;

  const themeStyle = {
    '--bg': palette.bg,
    '--panel': palette.panel,
    '--panelAlt': palette.panelAlt,
    '--text': palette.text,
    '--sub': palette.sub,
    '--border': palette.border,
    '--accent': palette.accent,
    '--accent2': palette.accent2,
    '--bubbleUser': palette.bubbleUser,
    '--bubbleBot': palette.bubbleBot,
    '--shadow': palette.shadow
  };

  return (
    <div style={themeStyle} className="pc-root" onDrop={e => e.preventDefault()} onDragOver={e => e.preventDefault()}>
      <style jsx global>{`
        *{box-sizing:border-box} html,body{margin:0;padding:0;font-family:Inter,Arial,sans-serif;background:var(--bg);color:var(--text)}
        .pc-root{height:100vh;display:grid;grid-template-columns:320px minmax(0,1fr) ${showPreview?`${split}%`:'0px'};background:radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 12%, transparent), transparent 26%), radial-gradient(circle at top right, color-mix(in srgb, var(--accent2) 16%, transparent), transparent 24%), var(--bg);transition:grid-template-columns .2s ease;overflow:hidden}
        .sidebar,.main,.preview{min-height:0}.sidebar{background:color-mix(in srgb,var(--panel) 92%, transparent);border-right:1px solid var(--border);padding:18px;display:flex;flex-direction:column;gap:16px;overflow:auto}.brand{display:flex;align-items:center;gap:14px}.badge{width:42px;height:42px;border-radius:16px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:grid;place-items:center;color:white;font-weight:800;box-shadow:var(--shadow)} .brand h1{margin:0;font-size:26px}.brand p{margin:2px 0 0;color:var(--sub)}
        .search{display:flex;align-items:center;gap:10px;background:var(--panelAlt);border:1px solid var(--border);padding:14px 14px;border-radius:18px}.search input{background:transparent;border:none;outline:none;color:var(--text);font-size:16px;width:100%}
        .btnRow{display:grid;grid-template-columns:1fr 1fr;gap:12px}.btn{display:flex;align-items:center;justify-content:center;gap:10px;height:56px;border-radius:18px;border:1px solid var(--border);background:var(--panel);color:var(--text);font-weight:800;cursor:pointer}.btn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:white;border:none;box-shadow:var(--shadow)}
        .sectionTitle{font-size:12px;font-weight:900;letter-spacing:.18em;color:var(--sub);text-transform:uppercase;margin-top:6px}.list{display:flex;flex-direction:column;gap:10px}.item{position:relative;border-radius:20px;border:1px solid var(--border);background:var(--panel);padding:14px 14px 14px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;min-height:64px}.item.active{outline:2px solid color-mix(in srgb, var(--accent) 45%, transparent)}.item .meta{flex:1;min-width:0}.item .title{font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.item .sub{font-size:14px;color:var(--sub)}.rowActions{display:flex;gap:6px;opacity:0;pointer-events:none;transition:.15s}.item:hover .rowActions,.item.active .rowActions{opacity:1;pointer-events:auto}.iconBtn{width:34px;height:34px;border-radius:12px;border:1px solid var(--border);background:var(--panelAlt);display:grid;place-items:center;cursor:pointer;color:var(--text)}
        .main{display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:color-mix(in srgb,var(--panel) 80%, transparent)}
        .topbar{display:flex;align-items:center;justify-content:space-between;padding:18px 18px 12px;border-bottom:1px solid var(--border)}.chatTitle{display:flex;flex-direction:column}.chatTitle h2{margin:0;font-size:34px}.chatTitle span{color:var(--sub)}.topControls{display:flex;gap:10px;position:relative}.pill{height:46px;padding:0 16px;border-radius:16px;border:1px solid var(--border);background:var(--panel);display:flex;align-items:center;gap:8px;font-weight:700;cursor:pointer;color:var(--text)}
        .messages{padding:22px;overflow:auto;display:flex;flex-direction:column;gap:18px;min-height:0}.msgWrap{display:flex;gap:10px;align-items:flex-start}.msgWrap.user{justify-content:flex-end}.avatar{width:34px;height:34px;border-radius:14px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:grid;place-items:center;color:white;font-weight:800;flex:0 0 auto}.avatar.bot{background:var(--panelAlt);color:var(--accent)} .bubble{max-width:min(820px,80%);padding:16px 18px;border-radius:24px;border:1px solid var(--border);background:var(--bubbleBot);box-shadow:0 10px 30px rgba(0,0,0,.04);line-height:1.55;direction:auto}.user .bubble{background:linear-gradient(135deg,var(--accent),var(--accent2));color:white;border:none}.bubbleText{white-space:pre-wrap;word-break:break-word;unicode-bidi:plaintext}
        .msgActions{display:flex;gap:6px;margin-top:8px;opacity:0;transition:.15s}.msgWrap:hover .msgActions{opacity:1}.tiny{width:30px;height:30px;border-radius:10px;border:1px solid var(--border);background:var(--panel);display:grid;place-items:center;cursor:pointer}
        .codeBox{margin-top:12px;border:1px solid var(--border);background:#0c1224;color:#ecf3ff;border-radius:18px;overflow:hidden}.codeHead{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#141d36;color:#cdd8ff;font-size:13px}.codeBox pre{margin:0;padding:14px;overflow:auto;max-height:360px;font-size:13px}
        .composer{padding:16px 18px 18px;border-top:1px solid var(--border);background:color-mix(in srgb, var(--panel) 96%, transparent)}.composerWrap{display:flex;align-items:flex-end;gap:10px;border:1px solid var(--border);background:var(--panel);padding:10px;border-radius:28px;box-shadow:var(--shadow)}.menuBtn,.sendBtn{width:44px;height:44px;border-radius:16px;border:none;display:grid;place-items:center;cursor:pointer}.menuBtn{background:var(--panelAlt);color:var(--text)}.sendBtn{background:linear-gradient(135deg,var(--accent),var(--accent2));color:white}.textarea{flex:1;border:none;outline:none;background:transparent;color:var(--text);font-size:18px;resize:none;max-height:180px;min-height:44px;padding:10px 4px 8px}.hint{font-size:12px;color:var(--sub);padding:8px 10px 0}
        .menuPanel{position:absolute;top:58px;right:0;z-index:40;width:260px;padding:10px;border-radius:18px;border:1px solid var(--border);background:var(--panel);box-shadow:var(--shadow)}.menuItem{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border-radius:14px;background:transparent;border:none;color:var(--text);cursor:pointer}.menuItem:hover{background:var(--panelAlt)}
        .preview{border-left:1px solid var(--border);display:grid;grid-template-rows:auto 1fr;background:var(--panel)}.previewHead{padding:12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:10px}.seg{display:flex;gap:8px}.segBtn{height:40px;padding:0 14px;border-radius:14px;border:1px solid var(--border);background:var(--panelAlt);cursor:pointer;color:var(--text);font-weight:800}.segBtn.active{background:linear-gradient(135deg,var(--accent),var(--accent2));color:white;border:none}.iframeWrap{min-height:0;display:flex;flex-direction:column}.iframe{flex:1;border:none;background:white;width:100%}.previewPlaceholder{height:100%;display:grid;place-items:center;color:var(--sub);padding:26px;text-align:center}.previewCode{height:100%;overflow:auto;background:#0c1224;color:#eaf2ff;margin:0;padding:18px;font-size:13px}
        .voiceOverlay{position:fixed;inset:0;background:rgba(6,10,20,.65);backdrop-filter:blur(10px);display:grid;place-items:center;z-index:100}.voiceCard{width:min(520px,92vw);background:var(--panel);border:1px solid var(--border);border-radius:32px;padding:28px;box-shadow:var(--shadow);text-align:center}.voiceCircle{width:150px;height:150px;margin:10px auto 18px;border-radius:999px;background:radial-gradient(circle at center,var(--accent2),var(--accent));display:grid;place-items:center;color:white;position:relative;animation:pulse 1.4s infinite ease-in-out}.voiceCircle::after{content:'';position:absolute;inset:-14px;border-radius:999px;border:2px solid color-mix(in srgb, var(--accent2) 60%, transparent);animation:ring 1.4s infinite ease-in-out}.voiceText{min-height:70px;border:1px solid var(--border);background:var(--panelAlt);border-radius:18px;padding:14px;line-height:1.5}.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--panel);padding:12px 16px;border-radius:14px;z-index:90;font-weight:800;box-shadow:var(--shadow)}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}} @keyframes ring{0%{transform:scale(.9);opacity:.7}100%{transform:scale(1.2);opacity:0}}
        @media (max-width: 1180px){.pc-root{grid-template-columns:280px 1fr}.preview{display:none}} @media (max-width: 820px){.pc-root{grid-template-columns:1fr}.sidebar{display:none}.bubble{max-width:90%}.topbar{padding:14px}.chatTitle h2{font-size:28px}}
      `}</style>

      <aside className="sidebar">
        <div className="brand">
          <div className="badge">✦</div>
          <div><h1>Playcraft</h1><p>smart chat, code, games</p></div>
        </div>
        <div className="search"><Icon name="search" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search chats and projects" /></div>
        <div className="btnRow">
          <button className="btn primary" onClick={()=>newChat()}><Icon name="chat" /> New chat</button>
          <button className="btn" onClick={addProject}><Icon name="project" /> Add project</button>
        </div>

        <div className="sectionTitle">Projects</div>
        <div className="list">
          {filteredProjects.length ? filteredProjects.map(p => (
            <div className="item" key={p.id}>
              <Icon name="project" />
              <div className="meta"><div className="title">{p.title}</div><div className="sub">{p.style || 'modern'}</div></div>
              <div className="rowActions">
                <button className="iconBtn" onClick={()=>renameProject(p.id)}><Icon name="edit" size={16} /></button>
                <button className="iconBtn" onClick={()=>deleteProject(p.id)}><Icon name="trash" size={16} /></button>
              </div>
            </div>
          )) : <div className="item"><div className="meta"><div className="sub">No projects yet</div></div></div>}
        </div>

        <div className="sectionTitle">Chats</div>
        <div className="list">
          {filteredChats.map(c => (
            <div className={`item ${activeChatId===c.id?'active':''}`} key={c.id} onClick={()=>setActiveChatId(c.id)}>
              <Icon name="chat" />
              <div className="meta"><div className="title">{c.title}</div><div className="sub">{c.mode}</div></div>
              <div className="rowActions">
                <button className="iconBtn" onClick={(e)=>{e.stopPropagation(); renameChat(c.id);}}><Icon name="edit" size={16} /></button>
                <button className="iconBtn" onClick={(e)=>{e.stopPropagation(); copyText((c.messages||[]).map(m=>m.text).join('\n\n'));}}><Icon name="copy" size={16} /></button>
                <button className="iconBtn" onClick={(e)=>{e.stopPropagation(); deleteChat(c.id);}}><Icon name="trash" size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="main">
        <div className="topbar" ref={menuRef}>
          <div className="chatTitle"><h2>{activeChat?.title || 'New chat'}</h2><span>{activeChat?.mode || 'chat'}</span></div>
          <div className="topControls">
            <button className="pill" onClick={()=>setMenu(menu==='mode'?null:'mode')}><span>{MODES.find(m=>m.id===(activeChat?.mode||'chat'))?.icon}</span> {MODES.find(m=>m.id===(activeChat?.mode||'chat'))?.label}</button>
            <button className="pill" onClick={()=>setMenu(menu==='theme'?null:'theme')}><Icon name="palette" /> Backgrounds & colors</button>
            <button className="pill" onClick={()=>setShowPreview(v=>!v)}><Icon name="preview" /> {showPreview ? 'Hide preview' : 'Show preview'}</button>

            {menu==='mode' && <div className="menuPanel">{MODES.map(m => <button key={m.id} className="menuItem" onClick={()=>{ const id=ensureChat(); updateChat(id,c=>({...c,mode:m.id})); setMenu(null); }}>{m.icon} <span style={{marginInlineStart:'auto'}}>{m.label}</span></button>)}</div>}
            {menu==='theme' && <div className="menuPanel">
              <div style={{padding:'8px 12px',fontWeight:800}}>Theme</div>
              {Object.entries(THEMES).map(([id,t]) => <button key={id} className="menuItem" onClick={()=>setTheme(id)}>{t.name}</button>)}
              <div style={{padding:'8px 12px',fontWeight:800}}>Accent</div>
              {ACCENTS.map(a => <button key={a.id} className="menuItem" onClick={()=>setAccent(a.id)}><span style={{display:'inline-flex',gap:8,alignItems:'center'}}><span style={{width:20,height:20,borderRadius:999,background:`linear-gradient(135deg,${a.a},${a.b})`,display:'inline-block'}} /> {a.name}</span></button>)}
              <div style={{padding:'8px 12px',fontWeight:800}}>Voice</div>
              <button className="menuItem" onClick={()=>setVoiceReply(v=>!v)}>Voice replies: {voiceReply?'On':'Off'}</button>
              <div style={{padding:'8px 12px',fontWeight:800}}>Voice</div>
              <button className="menuItem" onClick={()=>setVoiceName('auto')}>Auto</button>
              {voices.slice(0,12).map(v => <button key={v.name} className="menuItem" onClick={()=>setVoiceName(v.name)}>{v.name}</button>)}
            </div>}
          </div>
        </div>

        <div className="messages" ref={messagesRef}>
          {(activeChat?.messages || []).map(msg => {
            const codeBlocks = extractCodeBlocks(msg.code || msg.text || '');
            const plain = msg.code ? stripCode(msg.text || '') || msg.text : stripCode(msg.text || '');
            return (
              <div key={msg.id} className={`msgWrap ${msg.role==='user'?'user':''}`} onMouseEnter={()=>setHoverMsg(msg.id)} onMouseLeave={()=>setHoverMsg(null)}>
                {msg.role==='assistant' && <div className="avatar bot">✦</div>}
                <div className="bubble">
                  {!!plain && <div className="bubbleText">{plain}</div>}
                  {codeBlocks.map((cb, i) => <div className="codeBox" key={i}><div className="codeHead"><span>{cb.lang}</span><button className="tiny" onClick={()=>copyText(cb.code)}><Icon name="copy" size={14} /></button></div><pre>{cb.code}</pre></div>)}
                  {msg.file && <div style={{marginTop:12,display:'flex',gap:8,flexWrap:'wrap'}}>
                    <button className="pill" onClick={()=>{setShowPreview(true); setPreviewTab('preview');}}><Icon name="preview" /> Preview</button>
                    <button className="pill" onClick={()=>{setShowPreview(true); setPreviewTab('code');}}><Icon name="code" /> Code</button>
                    <button className="pill" onClick={()=>onOpenInBrowser(msg.file)}><Icon name="preview" /> Open</button>
                    <button className="pill" onClick={()=>onDownload(msg.file)}><Icon name="download" /> Download</button>
                    <button className="pill" onClick={()=>onPublish(msg.file)}><Icon name="publish" /> Publish</button>
                  </div>}
                  <div className="msgActions" style={{opacity:hoverMsg===msg.id?1:0}}>
                    {msg.role==='assistant' ? (
                      <>
                        <button className="tiny" onClick={()=>copyText(msg.text || '')}><Icon name="copy" size={14} /></button>
                      </>
                    ) : (
                      <>
                        <button className="tiny" onClick={()=>copyText(msg.text || '')}><Icon name="copy" size={14} /></button>
                        <button className="tiny" onClick={()=>setDraft(msg.text || '')}><Icon name="edit" size={14} /></button>
                      </>
                    )}
                  </div>
                </div>
                {msg.role==='user' && <div className="avatar">U</div>}
              </div>
            );
          })}
        </div>

        <div className="composer" ref={menuRef}>
          <div className="composerWrap">
            <button className="menuBtn" onClick={()=>setMenu(menu==='plus'?null:'plus')}><Icon name="plus" /></button>
            {menu==='plus' && <div className="menuPanel" style={{left:10,right:'auto',bottom:'64px',top:'auto'}}>
              <button className="menuItem" onClick={()=>newChat(activeChat?.projectId || null, activeChat?.mode || 'chat')}><Icon name="chat" /> New chat</button>
              <button className="menuItem" onClick={addProject}><Icon name="project" /> Add project</button>
            </div>}
            <textarea ref={inputRef} className="textarea" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Message Playcraft..." rows={1} onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } }} />
            {draft.trim() ? (
              <button className="sendBtn" onClick={()=>sendMessage()} title="Send"><Icon name="send" /></button>
            ) : (
              <button className="sendBtn" onClick={startVoiceConversation} title="Voice conversation"><Icon name="mic" /></button>
            )}
          </div>
          <div className="hint">Enter to send • Shift+Enter for new line</div>
        </div>
      </main>

      {showPreview && (
        <aside className="preview">
          <div className="previewHead">
            <div className="seg">
              <button className={`segBtn ${previewTab==='preview'?'active':''}`} onClick={()=>setPreviewTab('preview')}><Icon name="preview" size={16} /> Preview</button>
              <button className={`segBtn ${previewTab==='code'?'active':''}`} onClick={()=>setPreviewTab('code')}><Icon name="code" size={16} /> Code</button>
            </div>
            <div className="seg">
              <button className="segBtn" onClick={()=>onDownload(previewFile)}><Icon name="download" size={16} /> Download</button>
              <button className="segBtn" onClick={()=>onPublish(previewFile)}><Icon name="publish" size={16} /> Publish</button>
              <button className="segBtn" onClick={()=>setPreviewTab(t=>t==='preview'?'code':'preview')}><Icon name="refresh" size={16} /> Refresh</button>
              <button className="segBtn" onClick={()=>setShowPreview(false)}><Icon name="close" size={16} /></button>
            </div>
          </div>
          <div className="iframeWrap">
            {!previewFile ? <div className="previewPlaceholder">When an HTML game or page is created, it will appear here.</div> : previewTab==='preview' ? <iframe className="iframe" src={previewFile.previewUrl || previewFile.openUrl} /> : <pre className="previewCode">{previewFile.code || 'No code'}</pre>}
          </div>
        </aside>
      )}

      {voiceOpen && (
        <div className="voiceOverlay">
          <div className="voiceCard">
            <div className="voiceCircle"><Icon name="mic" size={48} /></div>
            <h2 style={{margin:'0 0 10px'}}>Voice conversation</h2>
            <div style={{color:'var(--sub)',marginBottom:14}}>Talk freely. I will answer by voice and keep the conversation in chat.</div>
            <div className="voiceText">{voiceText || 'Listening...'}</div>
            <div style={{display:'flex',justifyContent:'center',gap:10,marginTop:18}}>
              <button className="pill" onClick={stopVoiceConversation}><Icon name="stop" /> Stop conversation</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
