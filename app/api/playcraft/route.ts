import { put } from '@vercel/blob';

export const runtime = 'nodejs';

type Role = 'user' | 'assistant' | 'system';

type Msg = {
  role: Role;
  text: string;
};

type RefFile = {
  name: string;
  type: string;
  dataUrl?: string;
  text?: string;
};

type InputBody = {
  draft?: string;
  mode?: string;
  messages?: Msg[];
  references?: RefFile[];
  latestFile?: { name: string; content: string; language?: string; mimeType?: string } | null;
  projectMemory?: {
    style?: string;
    notes?: string;
    preferences?: string[];
  } | null;
};

type OutputFile = {
  name: string;
  content: string;
  language: string;
  mimeType: string;
  openUrl?: string;
  downloadUrl?: string;
  publishedUrl?: string;
};

const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'qwen/qwen3-32b';
const HEAVY_MODEL = process.env.HEAVY_MODEL || 'openai/gpt-oss-120b';
const VISION_MODEL = process.env.VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function normalize(s: string) {
  return (s || '').toLowerCase();
}

function isGreeting(text: string) {
  const t = normalize(text).trim();
  return ['hi', 'hello', 'hey', 'shalom', 'שלום', 'היי', 'אהלן', 'מה נשמע', 'מה קורה'].includes(t);
}

function looksLikeImageReference(text: string, refs: RefFile[]) {
  const t = normalize(text);
  if (!refs?.some(r => r.type.startsWith('image/'))) return false;
  return /(כמו|לפי|בסגנון|reference|like this|like the image|same style|copy design|closer)/.test(t);
}

function wantsGame(text: string, mode?: string) {
  const t = normalize(text);
  return mode === 'build' || /(משחק|game|wordle|snake|runner|platformer|maze|horror|flappy|racer|shooter|tetris|arcade)/.test(t);
}

function wantsCode(text: string, mode?: string) {
  const t = normalize(text);
  return mode === 'code' || /(code|קוד|arduino|esp32|react|next|node|python|javascript|typescript|html|css|fix my code|refactor)/.test(t);
}

function wantsImage(text: string, mode?: string) {
  const t = normalize(text);
  return mode === 'image' || /(תמונה|image|poster|illustration|mockup|generate image|create image)/.test(t);
}

function wantsStudy(text: string, mode?: string) {
  const t = normalize(text);
  return mode === 'study' || /(explain|study|learn|quiz|flashcards|ללמוד|להסביר|לימוד)/.test(t);
}

function wantsFixCurrent(text: string, latestFile?: { name: string; content: string } | null) {
  const t = normalize(text);
  if (!latestFile?.content) return false;
  return /(fix|תתקן|תשפר|הלוגיקה|logic|keep the design|same design|same style|don't rebuild|אל תבנה מחדש|רק הלוגיקה|רק לתקן)/.test(t);
}

function summarizeTitle(messages: Msg[], draft: string) {
  const combined = [...messages.filter(m => m.role === 'user').map(m => m.text), draft]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!combined) return 'New chat';

  const short = combined
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(' ');

  if (/wordle|וורדל/i.test(combined)) return 'וורדל ועיצוב';
  if (/esp32|arduino/i.test(combined)) return 'ESP32 / Arduino';
  if (/game|משחק/i.test(combined)) return 'בניית משחק';
  if (/image|תמונה/i.test(combined)) return 'תמונה ועיצוב';
  if (/study|learn|לימוד|להסביר/i.test(combined)) return 'לימוד והסבר';
  return short || 'Chat';
}

function stylePreset(style?: string) {
  const s = normalize(style || 'modern');
  const presets: Record<string, { bg: string; panel: string; accent: string; accent2: string; text: string }> = {
    modern: { bg: '#0b1020', panel: '#131a2e', accent: '#7c5cff', accent2: '#39d0ff', text: '#eef2ff' },
    pixel: { bg: '#111827', panel: '#1f2937', accent: '#f59e0b', accent2: '#ef4444', text: '#f3f4f6' },
    neon: { bg: '#09090f', panel: '#111827', accent: '#00f5ff', accent2: '#ff2dfb', text: '#e0f2fe' },
    horror: { bg: '#090909', panel: '#1a0c0c', accent: '#8b0000', accent2: '#d97706', text: '#f8fafc' },
    arcade: { bg: '#0f172a', panel: '#1e293b', accent: '#22c55e', accent2: '#f43f5e', text: '#f8fafc' },
    mobile: { bg: '#f8fafc', panel: '#ffffff', accent: '#6366f1', accent2: '#f59e0b', text: '#0f172a' },
    minimal: { bg: '#ffffff', panel: '#f3f4f6', accent: '#111827', accent2: '#6b7280', text: '#111827' },
  };
  return presets[s] || presets.modern;
}

function buildWordleHTML(style = 'modern') {
  const p = stylePreset(style);
  const words = ['APPLE', 'WATER', 'LIGHT', 'SMILE', 'STONE', 'BRAVE', 'SOUND'];
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Wordle</title>
<style>
:root{--bg:${p.bg};--panel:${p.panel};--accent:${p.accent};--accent2:${p.accent2};--text:${p.text};--ok:#22c55e;--mid:#f59e0b;--bad:#475569}
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,Arial;background:radial-gradient(circle at top,rgba(124,92,255,.25),transparent 35%),var(--bg);color:var(--text)}
.app{max-width:900px;margin:0 auto;min-height:100vh;padding:24px;display:flex;flex-direction:column;align-items:center}
.top{width:100%;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.title{font-size:42px;font-weight:900;letter-spacing:.08em}
.sub{opacity:.8}.card{background:rgba(255,255,255,.04);backdrop-filter: blur(12px);border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:18px 20px;box-shadow:0 15px 50px rgba(0,0,0,.25)}
.board{display:grid;gap:10px;margin:24px 0}.row{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.cell{width:74px;height:74px;border-radius:18px;border:2px solid rgba(255,255,255,.15);display:grid;place-items:center;font-size:34px;font-weight:900;text-transform:uppercase;background:rgba(255,255,255,.03);transition:.2s transform,.2s background,.2s border-color}.cell.filled{border-color:rgba(255,255,255,.35)}.cell.ok{background:var(--ok);border-color:var(--ok)}.cell.mid{background:var(--mid);border-color:var(--mid)}.cell.bad{background:var(--bad);border-color:var(--bad)}
.status{min-height:28px;font-size:16px;font-weight:700}.keyboard{display:grid;gap:8px;margin-top:12px}.keys{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}.key{min-width:44px;padding:12px 14px;border-radius:14px;border:none;background:rgba(255,255,255,.08);color:var(--text);font-weight:800;cursor:pointer}.key.wide{min-width:90px}.key:hover{background:rgba(255,255,255,.14)}.footer{display:flex;gap:10px;margin-top:16px}.btn{padding:12px 16px;border-radius:14px;border:none;cursor:pointer;font-weight:800}.btn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:white}.btn.soft{background:rgba(255,255,255,.08);color:var(--text)}
@media(max-width:640px){.cell{width:56px;height:56px;font-size:28px}.title{font-size:30px}}
</style></head><body>
<div class="app"><div class="top"><div><div class="title">WORDLE</div><div class="sub">Guess the hidden 5-letter word</div></div><div class="card">Keyboard + Enter + Backspace</div></div>
<div class="status" id="status"></div>
<div class="board" id="board"></div>
<div class="keyboard" id="keyboard"></div>
<div class="footer"><button class="btn primary" id="restart">Restart</button><button class="btn soft" id="hint">Hint</button></div></div>
<script>
const WORDS=${JSON.stringify(words)}; let answer=WORDS[Math.floor(Math.random()*WORDS.length)]; let row=0,col=0; let gameOver=false; const maxRows=6; const board=document.getElementById('board'); const statusEl=document.getElementById('status');
for(let r=0;r<maxRows;r++){const rowEl=document.createElement('div'); rowEl.className='row'; for(let c=0;c<5;c++){const cell=document.createElement('div'); cell.className='cell'; cell.id='cell-'+r+'-'+c; rowEl.appendChild(cell);} board.appendChild(rowEl);}
const layout=['QWERTYUIOP','ASDFGHJKL','ENTERZXCVBNM⌫']; const keyboard=document.getElementById('keyboard');
layout.forEach((line,i)=>{const wrap=document.createElement('div'); wrap.className='keys'; let arr=[...line]; if(i===2){arr=['ENTER',...'ZXCVBNM','⌫'];} arr.forEach(k=>{const btn=document.createElement('button'); btn.className='key'+(k==='ENTER'||k==='⌫'?' wide':''); btn.textContent=k; btn.onclick=()=>press(k); wrap.appendChild(btn);}); keyboard.appendChild(wrap);});
function getGuess(){let s=''; for(let c=0;c<5;c++) s+=document.getElementById('cell-'+row+'-'+c).textContent||''; return s;}
function setStatus(t){statusEl.textContent=t;}
function press(key){if(gameOver)return; if(key==='ENTER') return submitGuess(); if(key==='⌫' || key==='BACKSPACE'){ if(col>0){col--; const cell=document.getElementById('cell-'+row+'-'+col); cell.textContent=''; cell.classList.remove('filled');} return; } if(!/^[A-Z]$/.test(key)||col>=5) return; const cell=document.getElementById('cell-'+row+'-'+col); cell.textContent=key; cell.classList.add('filled'); col++;}
function colorKey(letter,state){ document.querySelectorAll('.key').forEach(b=>{ if(b.textContent===letter){ const rank={ok:3,mid:2,bad:1}; const cur=b.dataset.state||''; if(!cur || rank[state]>rank[cur]){ b.dataset.state=state; b.style.background= state==='ok'?'var(--ok)':state==='mid'?'var(--mid)':'var(--bad)'; b.style.color='white'; } }}); }
function submitGuess(){ if(col<5){setStatus('Type 5 letters first'); return;} const guess=getGuess(); const ans=answer.split(''); const used=Array(5).fill(false); const states=Array(5).fill('bad'); for(let i=0;i<5;i++){ if(guess[i]===ans[i]){states[i]='ok'; used[i]=true;} } for(let i=0;i<5;i++){ if(states[i]==='ok') continue; const idx=ans.findIndex((ch,j)=>!used[j]&&ch===guess[i]); if(idx>=0){states[i]='mid'; used[idx]=true;} }
for(let i=0;i<5;i++){ const cell=document.getElementById('cell-'+row+'-'+i); cell.classList.add(states[i]); colorKey(guess[i],states[i]); }
if(guess===answer){ gameOver=true; setStatus('You won!'); return; }
row++; col=0; if(row>=maxRows){ gameOver=true; setStatus('Game over. Word was '+answer); return; } setStatus(''); }
document.addEventListener('keydown',(e)=>{const k=e.key.toUpperCase(); if(k==='ENTER') press('ENTER'); else if(k==='BACKSPACE') press('⌫'); else if(/^[A-Z]$/.test(k)) press(k);});
document.getElementById('restart').onclick=()=>{answer=WORDS[Math.floor(Math.random()*WORDS.length)]; row=0; col=0; gameOver=false; document.querySelectorAll('.cell').forEach(c=>{c.textContent=''; c.className='cell';}); document.querySelectorAll('.key').forEach(k=>{k.removeAttribute('data-state'); k.style.background='rgba(255,255,255,.08)'; k.style.color='var(--text)';}); setStatus('');};
document.getElementById('hint').onclick=()=> setStatus('Starts with '+answer[0]);
</script></body></html>`;
}

function buildSnakeHTML(style = 'modern') {
  const p = stylePreset(style);
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Snake</title><style>
:root{--bg:${p.bg};--panel:${p.panel};--accent:${p.accent};--accent2:${p.accent2};--text:${p.text}}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,rgba(124,92,255,.2),transparent 30%),var(--bg);color:var(--text);font-family:Inter,system-ui;display:grid;place-items:center;min-height:100vh} .wrap{width:min(92vw,760px)} .hud{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.title{font-size:34px;font-weight:900}.pill{padding:10px 14px;border-radius:999px;background:rgba(255,255,255,.08)} canvas{width:100%;aspect-ratio:1/1;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.02));border-radius:24px;border:1px solid rgba(255,255,255,.1);box-shadow:0 24px 60px rgba(0,0,0,.3)} .actions{display:flex;gap:10px;margin-top:14px}.btn{padding:12px 16px;border-radius:14px;border:none;font-weight:800;cursor:pointer}.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:white}.soft{background:rgba(255,255,255,.08);color:var(--text)}</style></head><body><div class="wrap"><div class="hud"><div class="title">Snake</div><div class="pill" id="score">Score: 0</div></div><canvas id="game" width="600" height="600"></canvas><div class="actions"><button class="btn primary" id="restart">Restart</button><button class="btn soft">Use arrow keys</button></div></div><script>
const cvs=document.getElementById('game'); const ctx=cvs.getContext('2d'); const size=20; const count=30; let snake=[{x:10,y:10}]; let dir={x:1,y:0}; let food={x:15,y:15}; let score=0; let over=false;
function rand(){ return Math.floor(Math.random()*count); }
function spawnFood(){ food={x:rand(),y:rand()}; if(snake.some(s=>s.x===food.x&&s.y===food.y)) spawnFood(); }
function drawCell(x,y,color,r=8){ ctx.fillStyle=color; const px=x*size, py=y*size; ctx.beginPath(); ctx.roundRect(px+2,py+2,size-4,size-4,r); ctx.fill(); }
function step(){ if(over) return; const head={x:snake[0].x+dir.x,y:snake[0].y+dir.y}; if(head.x<0||head.y<0||head.x>=count||head.y>=count||snake.some(s=>s.x===head.x&&s.y===head.y)){ over=true; return; } snake.unshift(head); if(head.x===food.x&&head.y===food.y){ score++; document.getElementById('score').textContent='Score: '+score; spawnFood(); } else snake.pop(); }
function draw(){ ctx.clearRect(0,0,cvs.width,cvs.height); for(let y=0;y<count;y++) for(let x=0;x<count;x++){ ctx.fillStyle=(x+y)%2===0?'rgba(255,255,255,.03)':'rgba(255,255,255,.015)'; ctx.fillRect(x*size,y*size,size,size); }
 drawCell(food.x,food.y,'#f43f5e'); snake.forEach((s,i)=>drawCell(s.x,s.y, i===0?'${p.accent2}':'${p.accent}')); if(over){ ctx.fillStyle='rgba(0,0,0,.45)'; ctx.fillRect(0,0,cvs.width,cvs.height); ctx.fillStyle='white'; ctx.font='bold 42px Inter'; ctx.textAlign='center'; ctx.fillText('Game Over',cvs.width/2,cvs.height/2-10); ctx.font='20px Inter'; ctx.fillText('Press Restart',cvs.width/2,cvs.height/2+28); }}
function loop(){ step(); draw(); }
let timer=setInterval(loop,110);
document.addEventListener('keydown',e=>{ const k=e.key; if(k==='ArrowUp'&&dir.y!==1) dir={x:0,y:-1}; if(k==='ArrowDown'&&dir.y!==-1) dir={x:0,y:1}; if(k==='ArrowLeft'&&dir.x!==1) dir={x:-1,y:0}; if(k==='ArrowRight'&&dir.x!==-1) dir={x:1,y:0};});
document.getElementById('restart').onclick=()=>{ snake=[{x:10,y:10}]; dir={x:1,y:0}; score=0; over=false; spawnFood(); document.getElementById('score').textContent='Score: 0'; };
if(!CanvasRenderingContext2D.prototype.roundRect){CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){this.moveTo(x+r,y);this.arcTo(x+w,y,x+w,y+h,r);this.arcTo(x+w,y+h,x,y+h,r);this.arcTo(x,y+h,x,y,r);this.arcTo(x,y,x+w,y,r);return this;}}
spawnFood(); draw();
</script></body></html>`;
}

function builtInGame(draft: string, style = 'modern') {
  const t = normalize(draft);
  if (/wordle|וורדל/.test(t)) {
    return { name: 'wordle.html', content: buildWordleHTML(style), language: 'html', mimeType: 'text/html' };
  }
  if (/snake|סנייק/.test(t)) {
    return { name: 'snake.html', content: buildSnakeHTML(style), language: 'html', mimeType: 'text/html' };
  }
  return null;
}

function extractJson(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {}
  const match = text.match(/\{[\s\S]*\}$/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  const fenced = text.match(/```json\n([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  return null;
}

async function groqChat(model: string, messages: any[]) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || 'Groq request failed';
    throw new Error(msg);
  }
  return data?.choices?.[0]?.message?.content || '';
}

async function uploadPublic(name: string, content: string, mimeType: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { url: undefined };
  const blob = await put(name, content, {
    access: 'public',
    contentType: mimeType,
    addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return { url: blob.url };
}

function buildSystemPrompt(expert: string, wantsGameResultFile: boolean, wantsCodeOnly: boolean, projectMemory?: InputBody['projectMemory']) {
  return `You are Playcraft, an elite product assistant.
Your current expert role is: ${expert}.
Project memory:
${JSON.stringify(projectMemory || {}, null, 2)}

Rules:
- If the user is just greeting, answer like a normal helpful assistant. Do not build anything.
- If the user asked for a game, produce a polished, beautiful, logically working result.
- If the user asked to fix logic while keeping design, preserve visual design and modify the existing file only.
- If the user asks for code only, return explanation + code, not a file.
- If the user asks for a file/game/app, you may return one or more files.
- If the user sent images and asked for something like the image, treat them as design references, not image generation.
- Ask a clarifying question only if a critical detail is missing.
- Be strong on coding, games, design, Arduino/ESP32, learning, and general help.
- Reply in the same language as the user.

Return JSON exactly in this shape:
{
  "text": "short helpful answer",
  "files": [
    {"name":"string","language":"string","mimeType":"string","content":"string"}
  ]
}
Use files only when they actually make sense.
${wantsGameResultFile ? '- For this request, prefer returning a file.' : ''}
${wantsCodeOnly ? '- For this request, prefer returning code in text and maybe files only if explicitly needed.' : ''}`;
}

function chooseExpert(draft: string, mode?: string) {
  if (wantsGame(draft, mode)) return 'games';
  if (wantsCode(draft, mode)) return 'code';
  if (wantsStudy(draft, mode)) return 'study';
  if (wantsImage(draft, mode)) return 'design';
  return 'general';
}

function chooseModel(draft: string, refs: RefFile[], mode?: string) {
  if (looksLikeImageReference(draft, refs)) return VISION_MODEL;
  if (wantsGame(draft, mode) || wantsCode(draft, mode)) return HEAVY_MODEL;
  return DEFAULT_MODEL;
}

export async function POST(req: Request) {
  try {
    if (!GROQ_API_KEY) {
      return jsonResponse({ error: 'GROQ_API_KEY is missing.' }, 400);
    }

    const body = (await req.json()) as InputBody;
    const draft = (body.draft || '').trim();
    const mode = body.mode || 'chat';
    const messages = body.messages || [];
    const references = body.references || [];
    const latestFile = body.latestFile || null;
    const projectMemory = body.projectMemory || null;

    const title = summarizeTitle(messages, draft);

    if (!draft && references.length === 0) {
      return jsonResponse({ title, text: 'כתוב לי משהו או דבר איתי.', files: [] });
    }

    if (isGreeting(draft)) {
      return jsonResponse({
        title,
        text: /^\p{Script=Hebrew}/u.test(draft)
          ? 'היי! אני כאן לעזור בקוד, משחקים, עיצוב, Arduino, לימוד ועוד. תגיד לי בדיוק מה אתה רוצה.'
          : 'Hi! I can help with code, games, design, Arduino, learning, and more. Tell me what you want to build or fix.',
        files: [],
      });
    }

    const style = projectMemory?.style || 'modern';
    const directGame = builtInGame(draft, style);
    const fixCurrent = wantsFixCurrent(draft, latestFile);
    const wantsGameFile = wantsGame(draft, mode) && !/code only|רק קוד|תן לי קוד|just code/.test(normalize(draft));
    const wantsCodeOnly = wantsCode(draft, mode) && !wantsGameFile;

    if (directGame && !fixCurrent) {
      const uploaded = await uploadPublic(directGame.name, directGame.content, directGame.mimeType);
      const out: OutputFile = {
        ...directGame,
        openUrl: uploaded.url,
        downloadUrl: uploaded.url,
        publishedUrl: uploaded.url,
      };
      return jsonResponse({
        title,
        text: /^\p{Script=Hebrew}/u.test(draft)
          ? 'הכנתי לך משחק מסודר שאפשר לפתוח, להוריד, ולפרסם.'
          : 'I built a polished game you can preview, open, download, and publish.',
        files: [out],
      });
    }

    const expert = chooseExpert(draft, mode);
    const model = chooseModel(draft, references, mode);
    const system = buildSystemPrompt(expert, wantsGameFile, wantsCodeOnly, projectMemory);

    const userParts: any[] = [{ type: 'text', text: draft }];
    references.forEach(ref => {
      if (ref.type?.startsWith('image/') && ref.dataUrl) {
        userParts.push({ type: 'image_url', image_url: { url: ref.dataUrl } });
      } else if (ref.text) {
        userParts.push({ type: 'text', text: `Attached file ${ref.name}:\n${ref.text.slice(0, 12000)}` });
      }
    });

    if (fixCurrent && latestFile) {
      userParts.push({
        type: 'text',
        text: `CURRENT FILE TO MODIFY (preserve design/style unless user asked otherwise):\nFILE NAME: ${latestFile.name}\n\n${latestFile.content.slice(0, 40000)}`,
      });
    }

    const history = messages.slice(-8).map(m => ({ role: m.role, content: m.text }));
    const modelMessages = [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: userParts.length === 1 ? draft : userParts },
    ];

    const raw = await groqChat(model, modelMessages);
    const parsed = extractJson(raw) || { text: raw, files: [] };

    const files: OutputFile[] = [];
    for (const f of parsed.files || []) {
      if (!f?.name || !f?.content) continue;
      const mimeType = f.mimeType || (f.language === 'html' ? 'text/html' : 'text/plain');
      const uploaded = await uploadPublic(f.name, f.content, mimeType);
      files.push({
        name: f.name,
        content: f.content,
        language: f.language || 'text',
        mimeType,
        openUrl: uploaded.url,
        downloadUrl: uploaded.url,
        publishedUrl: uploaded.url,
      });
    }

    return jsonResponse({
      title,
      text: parsed.text || raw || 'Done.',
      files,
    });
  } catch (error: any) {
    const message = error?.message || 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
}
