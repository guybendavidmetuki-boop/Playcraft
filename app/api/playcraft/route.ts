import { put } from '@vercel/blob';

export const runtime = 'nodejs';

const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'qwen/qwen3-32b';
const HEAVY_MODEL = process.env.HEAVY_MODEL || 'openai/gpt-oss-120b';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function detectLang(text: string) {
  const heb = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const lat = (text.match(/[A-Za-z]/g) || []).length;
  return heb >= lat ? 'he' : 'en';
}

function summarizeTitle(messages: Array<{ text?: string }>) {
  const joined = messages.map(m => m.text || '').join(' ').replace(/\s+/g, ' ').trim();
  if (!joined) return 'New chat';
  return joined.length > 46 ? joined.slice(0, 46) + '…' : joined;
}

function isGreeting(text: string) {
  const p = text.trim().toLowerCase();
  return ['היי', 'שלום', 'מה נשמע', 'hey', 'hi', 'hello'].includes(p);
}

function wantsGame(text: string, mode = 'chat') {
  const p = text.toLowerCase();
  return mode === 'build' || /משחק|game|wordle|snake|runner|platformer|maze|horror|flappy|racer|shooter|tetris/.test(p);
}

function wantsCode(text: string, mode = 'chat') {
  const p = text.toLowerCase();
  return mode === 'code' || /קוד|code|arduino|esp32|react|next|python|node|fix|refactor/.test(p);
}

async function callGroq(model: string, system: string, user: string) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Groq request failed');
  return data?.choices?.[0]?.message?.content || '';
}

function extractJson(text: string) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/```json\n([\s\S]*?)```/i);
  if (m) {
    try { return JSON.parse(m[1]); } catch {}
  }
  return null;
}

function extractCodeBlock(text: string) {
  const m = text.match(/```(?:html|js|javascript|ts|tsx|jsx|css)?\n([\s\S]*?)```/i);
  return m ? m[1].trim() : '';
}

function createWordleHtml() {
  const js = [
    "const WORDS=['APPLE','GRAPE','LIGHT','STONE','BRAVE','SMILE','PLANT','CLOUD','SHINE','TRACK'];",
    "let secret=WORDS[Math.floor(Math.random()*WORDS.length)];",
    "let row=0,col=0,done=false;",
    "const guesses=Array.from({length:6},()=>Array(5).fill(''));",
    "const grid=document.getElementById('grid'); const kb=document.getElementById('kb'); const statusEl=document.getElementById('status');",
    "const rows=['QWERTYUIOP','ASDFGHJKL','ZXCVBNM']; const keyState={};",
    "function setStatus(t){statusEl.textContent=t;}",
    "function makeKey(label,wide=false){const b=document.createElement('button'); b.className='key'+(wide?' wide':''); b.textContent=label; b.onclick=()=>handleKey(label); return b;}",
    "function build(){grid.innerHTML=''; for(let r=0;r<6;r++){ for(let c=0;c<5;c++){ const d=document.createElement('div'); d.className='cell'; d.id=`cell-${r}-${c}`; grid.appendChild(d);} } kb.innerHTML=''; rows.forEach((letters,i)=>{ const rowEl=document.createElement('div'); rowEl.className='row'; if(i===2) rowEl.appendChild(makeKey('Enter',true)); [...letters].forEach(ch=>rowEl.appendChild(makeKey(ch))); if(i===2) rowEl.appendChild(makeKey('⌫',true)); kb.appendChild(rowEl);}); render();}",
    "function render(){ for(let r=0;r<6;r++){ for(let c=0;c<5;c++){ const cell=document.getElementById(`cell-${r}-${c}`); cell.textContent=guesses[r][c]; cell.className='cell'+(guesses[r][c]?' filled':''); } } [...document.querySelectorAll('.key')].forEach(btn=>{ const s=keyState[btn.textContent]; btn.className='key'+(btn.classList.contains('wide')?' wide':'')+(s?' '+s:''); });}",
    "function handleKey(key){ if(done) return; if(key==='⌫' || key==='Backspace'){ if(col>0){ col--; guesses[row][col]=''; render(); } return; } if(key==='Enter'){ submitGuess(); return; } if(/^[A-Z]$/.test(key)){ if(col<5){ guesses[row][col]=key; col++; render(); } } }",
    "function submitGuess(){ if(col<5){ setStatus('Need 5 letters'); return; } const guess=guesses[row].join(''); const secretArr=secret.split(''); const marks=Array(5).fill('bad'); for(let i=0;i<5;i++){ if(guess[i]===secret[i]){ marks[i]='good'; secretArr[i]=null; } } for(let i=0;i<5;i++){ if(marks[i]==='good') continue; const idx=secretArr.indexOf(guess[i]); if(idx!==-1){ marks[i]='mid'; secretArr[idx]=null; } } for(let i=0;i<5;i++){ const cell=document.getElementById(`cell-${row}-${i}`); cell.classList.add(marks[i]); const ch=guess[i]; const prev=keyState[ch]; if(prev!=='good' && (marks[i]==='good' || (marks[i]==='mid' && prev!=='mid'))) keyState[ch]=marks[i]; else if(!prev) keyState[ch]=marks[i]; } render(); if(guess===secret){ done=true; setStatus('You won 🎉'); return; } row++; col=0; if(row===6){ done=true; setStatus('Game over: '+secret); } else { setStatus('Try again'); } }",
    "window.addEventListener('keydown',e=>{ const k=e.key.toUpperCase(); if(/^[A-Z]$/.test(k)) handleKey(k); else if(e.key==='Enter') handleKey('Enter'); else if(e.key==='Backspace') handleKey('⌫'); });",
    "document.getElementById('restart').onclick=()=>{ secret=WORDS[Math.floor(Math.random()*WORDS.length)]; row=0; col=0; done=false; for(let r=0;r<6;r++) for(let c=0;c<5;c++) guesses[r][c]=''; Object.keys(keyState).forEach(k=>delete keyState[k]); setStatus('Good luck'); build(); };",
    "build();"
  ].join('\n');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Wordle</title>
<style>
:root{--bg:#0b1224;--card:#131d36;--line:#31456e;--text:#f3f7ff;--muted:#9bb0d1;--good:#29c76f;--mid:#ffb340;--bad:#42516d;--a:#7c6cff;--b:#43b9ff}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#172448,#0b1224 58%);color:var(--text);font-family:Inter,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:22px}
.app{width:min(920px,100%);background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(14px);border-radius:28px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.35)}
.top{display:flex;justify-content:space-between;gap:12px;align-items:center}.title{font-size:38px;font-weight:900}.sub{color:var(--muted)}.actions{display:flex;gap:10px;align-items:center}.status{padding:10px 14px;border-radius:999px;background:#162442;color:var(--muted)}.btn{border:none;background:linear-gradient(135deg,var(--a),var(--b));color:#fff;padding:12px 16px;border-radius:14px;font-weight:800;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;max-width:420px;margin:24px auto}.cell{aspect-ratio:1/1;border-radius:18px;border:2px solid var(--line);display:grid;place-items:center;font-size:34px;font-weight:900;background:rgba(255,255,255,.02)}.cell.filled{border-color:#5e77af}.cell.good{background:var(--good);border-color:var(--good)}.cell.mid{background:var(--mid);border-color:var(--mid)}.cell.bad{background:var(--bad);border-color:var(--bad)}
.kb{display:flex;flex-direction:column;gap:10px;align-items:center}.row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}.key{min-width:44px;height:52px;border:none;border-radius:14px;background:#233253;color:var(--text);font-weight:800;cursor:pointer;padding:0 14px}.key.wide{min-width:92px}.key.good{background:var(--good)}.key.mid{background:var(--mid)}.key.bad{background:var(--bad)}
@media(max-width:640px){.title{font-size:28px}.cell{font-size:28px;border-radius:14px}.key{height:46px;min-width:36px;padding:0 10px}.top{flex-direction:column;align-items:flex-start}}
</style></head>
<body><div class="app"><div class="top"><div><div class="title">Wordle</div><div class="sub">Guess the 5-letter word</div></div><div class="actions"><div id="status" class="status">Good luck</div><button id="restart" class="btn">Restart</button></div></div><div id="grid" class="grid"></div><div id="kb" class="kb"></div></div><script>${js}</script></body></html>`;
  return { html, name: 'wordle.html', title: 'Wordle game', text: 'I built a polished Wordle with keyboard input, on-screen keyboard, Enter, backspace, restart, and win/lose states.' };
}

async function saveHtml(name: string, html: string) {
  if (!BLOB_TOKEN) return null;
  const blob = await put(`playcraft/${Date.now()}-${name}`, html, {
    access: 'public',
    token: BLOB_TOKEN,
    contentType: 'text/html; charset=utf-8',
    addRandomSuffix: true
  });
  return {
    name,
    code: html,
    previewUrl: blob.url,
    openUrl: blob.url,
    downloadUrl: blob.downloadUrl || blob.url,
    publishUrl: blob.url
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
      return json({
        text: lang === 'he' ? 'שלום! אני כאן לעזור בקוד, משחקים, לימוד, עיצוב ו-Arduino. תגיד לי בדיוק מה אתה רוצה לעשות.' : 'Hi! I can help with code, games, learning, design, and Arduino. Tell me exactly what you want to build.',
        title: summarizeTitle([{ text: prompt }])
      });
    }

    if (wantsGame(prompt, mode)) {
      if (/wordle|וורדל/i.test(prompt)) {
        const tpl = createWordleHtml();
        const file = await saveHtml(tpl.name, tpl.html);
        return json({ text: tpl.text, file, title: tpl.title });
      }

      const fixOnly = /תתקן|fix|logic|לוגיקה|same design|keep the design|same style/i.test(prompt);
      const style = project?.style || 'modern';
      const system = `You are an elite game developer. Return JSON only with keys: text, html, title. Build beautiful, playable, responsive HTML games with polished UI, clear controls, strong logic, restart flow, pause if relevant, and nice effects. Style=${style}. If user asks to fix logic only, keep the existing design/layout and improve logic only. Prefer one complete self-contained HTML file.`;
      const user = `Project memory:\n${JSON.stringify(project || {})}\nHistory:\n${history.slice(-10).map((m:any)=>`${m.role}: ${m.text}`).join('\n')}\nLast file:\n${lastFile?.code || ''}\nFix only logic? ${fixOnly}\nRequest:\n${prompt}`;
      let content = '';
      try { content = await callGroq(HEAVY_MODEL, system, user); } catch { content = await callGroq(DEFAULT_MODEL, system, user); }
      const parsed = extractJson(content);
      const html = parsed?.html || extractCodeBlock(content);
      const text = parsed?.text || (detectLang(prompt) === 'he' ? 'הכנתי משחק חדש. אפשר לראות ב-Preview, לפתוח בדפדפן, להוריד או לפרסם.' : 'I built a new game. You can preview it, open it in the browser, download it, or publish it.');
      const title = parsed?.title || summarizeTitle([{ text: prompt }]);
      if (html && /<html|<!doctype/i.test(html)) {
        const file = await saveHtml(`${title.replace(/\s+/g, '-').toLowerCase() || 'game'}.html`, html);
        return json({ text, file, title });
      }
      return json({ text, title });
    }

    if (wantsCode(prompt, mode)) {
      const system = `You are an expert coding assistant. Return JSON only with keys: text, code, title. If the user asks for code, return complete usable code. If the user asks to fix or refactor, preserve the existing structure when possible and improve only what is needed.`;
      const user = `Project memory:\n${JSON.stringify(project || {})}\nHistory:\n${history.slice(-10).map((m:any)=>`${m.role}: ${m.text}`).join('\n')}\nLast file:\n${lastFile?.code || ''}\nRequest:\n${prompt}`;
      let content = '';
      try { content = await callGroq(HEAVY_MODEL, system, user); } catch { content = await callGroq(DEFAULT_MODEL, system, user); }
      const parsed = extractJson(content);
      const code = parsed?.code || extractCodeBlock(content) || '';
      return json({ text: parsed?.text || (detectLang(prompt) === 'he' ? 'הנה הקוד.' : 'Here is the code.'), code, title: parsed?.title || summarizeTitle([{ text: prompt }]) });
    }

    const system = `You are a smart general assistant. Return JSON only with keys: text, title. Reply in the user's language. Be clear, helpful, and concise.`;
    const user = `History:\n${history.slice(-10).map((m:any)=>`${m.role}: ${m.text}`).join('\n')}\nRequest:\n${prompt}`;
    let content = '';
    try { content = await callGroq(DEFAULT_MODEL, system, user); } catch { content = await callGroq(HEAVY_MODEL, system, user); }
    const parsed = extractJson(content);
    return json({ text: parsed?.text || content || (detectLang(prompt) === 'he' ? 'בוצע.' : 'Done.'), title: parsed?.title || summarizeTitle([{ text: prompt }]) });
  } catch (e: any) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
}
