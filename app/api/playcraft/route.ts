import { put } from '@vercel/blob';

export const runtime = 'nodejs';

const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'qwen/qwen3-32b';
const HEAVY_MODEL = process.env.HEAVY_MODEL || 'openai/gpt-oss-120b';
const VISION_MODEL = process.env.VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function needsGame(prompt: string, mode: string) {
  const p = prompt.toLowerCase();
  return mode === 'build' || /משחק|game|wordle|snake|runner|platformer|horror|maze|rpg|shooter|flappy|tetris/.test(p);
}
function needsCode(prompt: string, mode: string) {
  const p = prompt.toLowerCase();
  return mode === 'code' || /קוד|code|arduino|esp32|react|next|python|node|fix|refactor/.test(p);
}
function isGreeting(prompt: string) {
  const p = prompt.trim().toLowerCase();
  return ['hi','hello','hey','שלום','היי','מה נשמע','מה קורה'].includes(p);
}
function detectLang(text: string) {
  const heb = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const lat = (text.match(/[A-Za-z]/g) || []).length;
  return heb >= lat ? 'he' : 'en';
}
function summarizeTitle(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.slice(0, 38) || 'שיחה חדשה';
}

function wordleTemplate() {
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Wordle</title>
<style>
:root{--bg:#0f1221;--card:#171a2b;--line:#2a2f49;--text:#f2f5ff;--muted:#9ba4c4;--accent:#7c6cff;--good:#28c76f;--mid:#ffb020;--bad:#444c6b}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#20264a,#0f1221 60%);color:var(--text);font-family:Inter,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}
.app{width:min(920px,100%);background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(16px);border-radius:28px;padding:28px;box-shadow:0 20px 80px rgba(0,0,0,.35)}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.title{font-size:40px;font-weight:900}.sub{color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;max-width:420px;margin:24px auto}
.cell{aspect-ratio:1/1;border:2px solid var(--line);border-radius:18px;display:grid;place-items:center;font-size:34px;font-weight:900;background:rgba(255,255,255,.02);text-transform:uppercase;transition:.18s}
.cell.filled{border-color:#5f6aa4}.cell.good{background:var(--good);border-color:var(--good)}.cell.mid{background:var(--mid);border-color:var(--mid)}.cell.bad{background:var(--bad);border-color:var(--bad)}
.kb{display:flex;flex-direction:column;gap:10px;align-items:center;margin-top:22px}.row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}.key{min-width:44px;height:52px;border:none;border-radius:14px;background:#232844;color:var(--text);font-weight:800;cursor:pointer;padding:0 14px}.key.wide{min-width:88px}.key.good{background:var(--good)}.key.mid{background:var(--mid)}.key.bad{background:var(--bad)}
.bar{display:flex;justify-content:center;gap:10px;align-items:center}.badge{padding:10px 14px;border-radius:999px;background:#1a2040;color:var(--muted)} .btn{background:linear-gradient(135deg,var(--accent),#47c6ff);color:#fff;border:none;padding:12px 18px;border-radius:14px;font-weight:800;cursor:pointer}
@media(max-width:640px){.title{font-size:28px}.cell{font-size:28px;border-radius:14px}.key{height:46px;min-width:36px;padding:0 10px}}
</style>
</head>
<body>
<div class="app">
  <div class="top"><div><div class="title">Wordle</div><div class="sub">Guess the 5-letter word</div></div><div class="bar"><div id="status" class="badge">Good luck</div><button class="btn" id="restart">Restart</button></div></div>
  <div id="grid" class="grid"></div>
  <div class="kb" id="kb"></div>
</div>
<script>
const WORDS=['APPLE','GRAPE','LIGHT','STONE','BRAVE','SMILE','PLANT','CLOUD','SHINE','TRACK'];
let secret=WORDS[Math.floor(Math.random()*WORDS.length)];
let row=0,col=0,done=false; const guesses=Array.from({length:6},()=>Array(5).fill(''));
const grid=document.getElementById('grid'); const kb=document.getElementById('kb'); const statusEl=document.getElementById('status');
const rows=['QWERTYUIOP','ASDFGHJKL','ZXCVBNM']; const keyState={};
function build(){grid.innerHTML=''; for(let r=0;r<6;r++){ for(let c=0;c<5;c++){ const d=document.createElement('div'); d.className='cell'; d.id=`cell-${r}-${c}`; grid.appendChild(d);} } kb.innerHTML=''; rows.forEach((letters,i)=>{ const rowEl=document.createElement('div'); rowEl.className='row'; if(i===2) rowEl.appendChild(makeKey('Enter',true)); [...letters].forEach(ch=>rowEl.appendChild(makeKey(ch))); if(i===2) rowEl.appendChild(makeKey('⌫',true)); kb.appendChild(rowEl);}); render(); }
function makeKey(label,wide=false){ const b=document.createElement('button'); b.className='key'+(wide?' wide':''); b.textContent=label; b.onclick=()=>handleKey(label); return b; }
function render(){ for(let r=0;r<6;r++){ for(let c=0;c<5;c++){ const cell=document.getElementById(`cell-${r}-${c}`); cell.textContent=guesses[r][c]; cell.className='cell'+(guesses[r][c]?' filled':''); } } [...document.querySelectorAll('.key')].forEach(btn=>{ const s=keyState[btn.textContent]; btn.className='key'+(btn.classList.contains('wide')?' wide':'')+(s?' '+s:''); }); }
function setStatus(text){ statusEl.textContent=text; }
function handleKey(key){ if(done) return; if(key==='⌫' || key==='Backspace'){ if(col>0){ col--; guesses[row][col]=''; render(); } return; } if(key==='Enter'){ submitGuess(); return; } if(/^[A-Z]$/.test(key)){ if(col<5){ guesses[row][col]=key; col++; render(); } } }
function submitGuess(){ if(col<5){ setStatus('Need 5 letters'); return; } const guess=guesses[row].join(''); const secretArr=secret.split(''); const marks=Array(5).fill('bad');
  for(let i=0;i<5;i++){ if(guess[i]===secret[i]){ marks[i]='good'; secretArr[i]=null; }}
  for(let i=0;i<5;i++){ if(marks[i]==='good') continue; const idx=secretArr.indexOf(guess[i]); if(idx!==-1){ marks[i]='mid'; secretArr[idx]=null; }}
  for(let i=0;i<5;i++){ const cell=document.getElementById(`cell-${row}-${i}`); cell.classList.add(marks[i]); const ch=guess[i]; const prev=keyState[ch]; if(prev!=='good' && (marks[i]==='good' || (marks[i]==='mid' && prev!=='mid'))) keyState[ch]=marks[i]; else if(!prev) keyState[ch]=marks[i]; }
  render();
  if(guess===secret){ done=true; setStatus('You won 🎉'); return; }
  row++; col=0; if(row===6){ done=true; setStatus('Game over: '+secret); } else { setStatus('Try again'); }
}
window.addEventListener('keydown',e=>{ const k=e.key.toUpperCase(); if(/^[A-Z]$/.test(k)) handleKey(k); else if(e.key==='Enter') handleKey('Enter'); else if(e.key==='Backspace') handleKey('⌫'); });
document.getElementById('restart').onclick=()=>{ secret=WORDS[Math.floor(Math.random()*WORDS.length)]; row=0; col=0; done=false; for(let r=0;r<6;r++) for(let c=0;c<5;c++) guesses[r][c]=''; Object.keys(keyState).forEach(k=>delete keyState[k]); setStatus('Good luck'); build(); };
build();
</script>
</body></html>`;
  return { html, name: 'wordle.html' };
}

async function callGroq(model: string, system: string, user: string) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Groq failed');
  return data.choices?.[0]?.message?.content || '';
}

function extractCodeBlock(text: string) {
  const m = text.match(/```(?:html|js|javascript|ts|tsx|jsx|css)?\n([\s\S]*?)```/i);
  return m ? m[1].trim() : '';
}

async function saveHtml(name: string, html: string) {
  if (!BLOB_TOKEN) return null;
  const blob = await put(`playcraft/${Date.now()}-${name}`, html, { access: 'public', token: BLOB_TOKEN, contentType: 'text/html; charset=utf-8', addRandomSuffix: true });
  return {
    name,
    code: html,
    previewUrl: blob.url,
    openUrl: blob.url,
    downloadUrl: blob.downloadUrl || blob.url,
    publishUrl: blob.url,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt = String(body.prompt || '').trim();
    const mode = String(body.mode || 'chat');
    const history = Array.isArray(body.history) ? body.history : [];
    const project = body.project || null;
    const lastFile = body.lastFile || null;

    if (!GROQ_API_KEY) return json({ error: 'Missing GROQ_API_KEY' }, 500);

    if (isGreeting(prompt)) {
      const lang = detectLang(prompt);
      return json({ text: lang === 'he' ? 'שלום! אני כאן לעזור בכל נושא — קוד, משחקים, לימוד, עיצוב וארדואינו. תגיד לי מה לעשות.' : 'Hi! I can help with code, games, learning, design, and Arduino. Tell me what you want to build.', title: summarizeTitle(prompt) });
    }

    if (needsGame(prompt, mode)) {
      const lower = prompt.toLowerCase();
      if (/wordle|וורדל/.test(lower)) {
        const tpl = wordleTemplate();
        const file = await saveHtml(tpl.name, tpl.html);
        return json({ text: 'הכנתי לך Wordle מסודר עם מקלדת, Enter, מחיקה ו־restart. אפשר לראות ב־Preview או לפתוח בדפדפן.', file, title: 'Wordle game' });
      }

      const fixOnly = /לוגיקה|logic|fix|תתקן|leave the design|keep the design|same design|same style/i.test(prompt);
      const style = project?.style || 'modern';
      const system = `You are an elite game builder. Return JSON only with keys: text, html, title. Build beautiful, responsive, keyboard-friendly HTML games with inline CSS and JS. Style=${style}. If user asks to fix logic only, preserve existing layout/styles as much as possible and edit logic only.`;
      const user = `Project memory: ${JSON.stringify(project || {})}\nHistory summary: ${history.slice(-8).map((m:any)=>`${m.role}: ${m.text}`).join('\n')}\nLast file if any:\n${lastFile?.code || ''}\nUser request:\n${prompt}`;
      let content = '';
      try {
        content = await callGroq(HEAVY_MODEL, system, user);
      } catch {
        content = await callGroq(DEFAULT_MODEL, system, user);
      }
      let parsed: any = null;
      try { parsed = JSON.parse(content); } catch {}
      const html = parsed?.html || extractCodeBlock(content);
      const text = parsed?.text || 'הכנתי משהו חדש. תבדוק ב־Preview.';
      const title = parsed?.title || summarizeTitle(prompt);
      if (html && html.includes('<html')) {
        const file = await saveHtml((title || 'game').replace(/\s+/g,'-') + '.html', html);
        return json({ text, file, title });
      }
      return json({ text, title });
    }

    if (needsCode(prompt, mode)) {
      const system = `You are an expert coding assistant. Return JSON only with keys: text, code, title. Prefer code when requested. Keep explanations concise and useful.`;
      const user = `Project: ${JSON.stringify(project || {})}\nHistory:\n${history.slice(-8).map((m:any)=>`${m.role}: ${m.text}`).join('\n')}\nLast file:\n${lastFile?.code || ''}\nRequest:\n${prompt}`;
      let content = '';
      try { content = await callGroq(HEAVY_MODEL, system, user); } catch { content = await callGroq(DEFAULT_MODEL, system, user); }
      let parsed: any = null;
      try { parsed = JSON.parse(content); } catch {}
      const code = parsed?.code || extractCodeBlock(content) || '';
      return json({ text: parsed?.text || 'הנה הקוד.', code, title: parsed?.title || summarizeTitle(prompt) });
    }

    const system = `You are a smart general assistant. Return JSON only with keys: text, title. Reply in the user's language. Be concise, smart, and helpful.`;
    const user = `History:\n${history.slice(-8).map((m:any)=>`${m.role}: ${m.text}`).join('\n')}\nRequest:\n${prompt}`;
    let content = '';
    try { content = await callGroq(DEFAULT_MODEL, system, user); } catch { content = await callGroq(HEAVY_MODEL, system, user); }
    let parsed: any = null;
    try { parsed = JSON.parse(content); } catch {}
    return json({ text: parsed?.text || content || 'Done.', title: parsed?.title || summarizeTitle(prompt) });
  } catch (e: any) {
    return json({ error: e.message || 'Server error' }, 500);
  }
}
