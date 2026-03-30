import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Attachment = {
  kind?: "image" | "text" | "file";
  name?: string;
  mime?: string;
  dataUrl?: string;
  base64?: string;
  text?: string;
};

type Message = {
  role: "user" | "assistant" | "system";
  text?: string;
  attachments?: Attachment[];
  artifacts?: Array<{ name?: string; content?: string }>;
};

type ProjectContext = {
  name?: string;
  memory?: string;
  stylePreset?: string;
  files?: string[];
};

type RequestBody = {
  messages?: Message[];
  mode?: string;
  studyMode?: string;
  project?: ProjectContext | null;
};

const API_KEY = process.env.GROQ_API_KEY;
const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const VISION_MODEL = process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
const WEB_MODEL = process.env.GROQ_WEB_MODEL || "groq/compound-mini";

const STYLE_OPTIONS = ["modern", "minimal", "neon", "pixel", "horror"] as const;

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function latestUserText(messages: Message[]) {
  const msg = [...messages].reverse().find((m) => m.role === "user");
  return (msg?.text || "").trim();
}

function latestUserAttachments(messages: Message[]) {
  const msg = [...messages].reverse().find((m) => m.role === "user");
  return msg?.attachments || [];
}

function hasHebrew(text: string) {
  return /[\u0590-\u05FF]/.test(text);
}

function inferLanguage(text: string) {
  return hasHebrew(text) ? "he" : "en";
}

function lower(text: string) {
  return text.toLowerCase();
}

function wantsImage(text: string, mode?: string) {
  const t = lower(text);
  return mode === "image" || /(create|generate|make|draw|design|render|צור|תיצור|תכין|תייצר).{0,20}(image|picture|art|logo|poster|banner|תמונה|איור)/i.test(text);
}

function wantsFile(text: string) {
  const t = lower(text);
  return /(file|download|html file|zip|project file|קובץ|קובץ html|זיפ|להוריד|לפתוח בדפדפן)/i.test(text);
}

function wantsCode(text: string, mode?: string) {
  return mode === "code" || mode === "fix" || mode === "arduino" || /(code|source|snippet|arduino|esp32|ino|script|קוד|סקץ'|arduino ide|esp32)/i.test(text);
}

function wantsWebSearch(text: string, mode?: string) {
  return /(search|look up|find online|latest|current|news|research|web|internet|חפש|תחפש|באינטרנט|מידע|מה חדש|מחקר)/i.test(text) || mode === "study";
}

function wantsReferenceDesign(text: string, attachments: Attachment[]) {
  return attachments.some((a) => a.kind === "image") && /(like this|same design|copy this design|match this|same style|exactly like|כמו זה|כמו התמונה|בדיוק כמו|אותו עיצוב|אותו סגנון)/i.test(text);
}

function isGameRequest(text: string, mode?: string) {
  return mode === "build" || /(game|wordle|snake|runner|platformer|maze|horror|rpg|tetris|משחק|וורדל|סנייק|מבוך|אימה|פלטפורמר)/i.test(text);
}

function detectStyle(text: string, project?: ProjectContext | null): string {
  const t = lower(text);
  const fromText = STYLE_OPTIONS.find((style) => t.includes(style));
  if (fromText) return fromText;
  if (project?.stylePreset && STYLE_OPTIONS.includes(project.stylePreset as any)) return project.stylePreset;
  if (/(ניאון|neon)/i.test(text)) return "neon";
  if (/(פיקסל|pixel)/i.test(text)) return "pixel";
  if (/(minimal|minimalist|מינימל)/i.test(text)) return "minimal";
  if (/(אימה|horror|dark scary)/i.test(text)) return "horror";
  return "modern";
}

function detectGameKind(text: string): "wordle" | "snake" | "runner" | "platformer" | "horror" | "generic" {
  const t = lower(text);
  if (/(wordle|וורדל)/i.test(text)) return "wordle";
  if (/(snake|סנייק)/i.test(text)) return "snake";
  if (/(runner|endless|רץ|ריצה אינסופית)/i.test(text)) return "runner";
  if (/(platformer|platform|פלטפורמר|מריו)/i.test(text)) return "platformer";
  if (/(horror|maze|מבוך|אימה|מפחיד)/i.test(text)) return "horror";
  return "generic";
}

function extractFileTag(raw: string) {
  const match = raw.match(/<file\s+name="([^"]+)"\s+type="([^"]+)">([\s\S]*?)<\/file>/i);
  if (!match) return { clean: raw.trim(), file: null as null | { name: string; type: string; content: string } };
  const clean = raw.replace(match[0], "").replace(/<reply>|<\/reply>/g, "").trim();
  return {
    clean,
    file: {
      name: match[1],
      type: match[2],
      content: match[3].trim(),
    },
  };
}

async function groqChat(args: {
  model?: string;
  system: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: any }>;
  temperature?: number;
  max_tokens?: number;
}) {
  if (!API_KEY || !API_KEY.startsWith("gsk_")) {
    throw new Error("GROQ_API_KEY is missing or not real. Put your real Groq key in Vercel Environment Variables.");
  }
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: args.model || DEFAULT_MODEL,
      messages: [{ role: "system", content: args.system }, ...args.messages],
      temperature: args.temperature ?? 0.35,
      max_tokens: args.max_tokens ?? 4096,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Groq request failed (${resp.status})`);
  }
  return data?.choices?.[0]?.message?.content || "";
}

function toGroqMessages(messages: Message[], { includeImages = false }: { includeImages?: boolean } = {}) {
  return messages.slice(-12).map((msg) => {
    const pieces: any[] = [];
    const textParts: string[] = [];
    if (msg.text?.trim()) textParts.push(msg.text.trim());
    (msg.attachments || []).forEach((att) => {
      if (att.kind === "text" && att.text) textParts.push(`Attached file ${att.name || "file"}:\n${att.text}`);
      if (att.kind === "file") textParts.push(`Attached file ${att.name || "file"} (binary file not expanded).`);
      if (includeImages && att.kind === "image" && att.dataUrl) {
        pieces.push({ type: "image_url", image_url: { url: att.dataUrl } });
      }
    });
    if (textParts.length) pieces.push({ type: "text", text: textParts.join("\n\n") });
    return { role: msg.role, content: pieces.length === 1 && pieces[0].type === "text" ? pieces[0].text : pieces };
  });
}

async function designNotesFromImages(messages: Message[], userText: string) {
  const withImages = latestUserAttachments(messages).filter((a) => a.kind === "image" && a.dataUrl).slice(0, 4);
  if (!withImages.length) return "";
  const content: any[] = [{ type: "text", text: `Analyze these reference images for UI/game style. User request: ${userText}. Return a short bullet list covering colors, spacing, layout, buttons, mood, typography feel, and shapes. Focus on how to recreate the design in code.` }];
  withImages.forEach((img) => content.push({ type: "image_url", image_url: { url: img.dataUrl! } }));
  return await groqChat({
    model: VISION_MODEL,
    system: "You are a sharp visual UI analyst. Be concrete and concise.",
    messages: [{ role: "user", content }],
    temperature: 0.2,
    max_tokens: 700,
  });
}

function imageResult(prompt: string, language: "he" | "en") {
  const cleaned = prompt.trim().replace(/\s+/g, " ");
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleaned)}?width=1280&height=960&seed=42&nologo=true`;
  return {
    reply:
      language === "he"
        ? `יצרתי לך תמונה. אפשר לפתוח אותה בדפדפן או להוריד.`
        : `I generated an image for you. You can open it in the browser or download it.`,
    images: [
      {
        id: `img_${Date.now()}`,
        name: "generated-image.png",
        kind: "image",
        mime: "image/png",
        url,
      },
    ],
    artifacts: [],
  };
}

function buildTitleHint(text: string, language: "he" | "en") {
  const clean = text.replace(/\s+/g, " ").trim();
  const short = clean.length > 38 ? `${clean.slice(0, 38).trim()}…` : clean;
  return short || (language === "he" ? "שיחה חדשה" : "New chat");
}

function themeTokens(style: string) {
  switch (style) {
    case "neon":
      return {
        bg: "#090b16",
        panel: "rgba(15,18,34,.82)",
        text: "#e8f1ff",
        accent: "#57e8ff",
        accent2: "#b85cff",
        border: "rgba(87,232,255,.22)",
        success: "#3cf6a8",
        warn: "#ffcf5a",
      };
    case "pixel":
      return {
        bg: "#111827",
        panel: "#182235",
        text: "#f8fafc",
        accent: "#f97316",
        accent2: "#22c55e",
        border: "#334155",
        success: "#22c55e",
        warn: "#fbbf24",
      };
    case "minimal":
      return {
        bg: "#f5f7fb",
        panel: "#ffffff",
        text: "#111827",
        accent: "#111827",
        accent2: "#6d5efc",
        border: "#e5e7eb",
        success: "#16a34a",
        warn: "#d97706",
      };
    case "horror":
      return {
        bg: "#06070b",
        panel: "rgba(13, 15, 19, .84)",
        text: "#e9edf7",
        accent: "#d62839",
        accent2: "#5a0f17",
        border: "rgba(214,40,57,.24)",
        success: "#84cc16",
        warn: "#f59e0b",
      };
    default:
      return {
        bg: "#0f172a",
        panel: "rgba(15, 23, 42, .84)",
        text: "#f8fafc",
        accent: "#6d5efc",
        accent2: "#22c55e",
        border: "rgba(255,255,255,.10)",
        success: "#22c55e",
        warn: "#f59e0b",
      };
  }
}

function wordleTemplate(style: string, language: "he" | "en") {
  const t = themeTokens(style);
  const words = ["APPLE","BRICK","CLOUD","DREAM","FRAME","GHOST","LIGHT","NERVE","QUEST","SHINE","SMILE","SOLAR","STONE","TRACK","WATER","WORLD","BRAIN","HEART","PLANT","MUSIC"];
  const labels = language === "he"
    ? {
        title: "Playcraft Wordle",
        subtitle: "מנחשים מילה בת 5 אותיות",
        win: "מעולה! פתרת את המילה.",
        lose: "נגמרו הניסיונות.",
        invalid: "צריך מילה בת 5 אותיות מהרשימה.",
        enter: "Enter",
        back: "⌫",
      }
    : {
        title: "Playcraft Wordle",
        subtitle: "Guess the 5-letter word",
        win: "Nice! You solved it.",
        lose: "No more tries.",
        invalid: "Use a valid 5-letter word from the list.",
        enter: "Enter",
        back: "⌫",
      };
  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${labels.title}</title>
<style>
  :root{--bg:${t.bg};--panel:${t.panel};--text:${t.text};--accent:${t.accent};--accent2:${t.accent2};--border:${t.border};--good:${t.success};--warn:${t.warn};--bad:#475569;}
  *{box-sizing:border-box} body{margin:0;font-family:Inter,system-ui,sans-serif;background:radial-gradient(circle at top,var(--accent2) 0%, transparent 35%), radial-gradient(circle at 80% 20%, color-mix(in srgb,var(--accent) 38%, transparent) 0%, transparent 30%), var(--bg);color:var(--text);min-height:100vh;display:grid;place-items:center;padding:24px}
  .app{width:min(100%,780px);background:var(--panel);backdrop-filter:blur(18px);border:1px solid var(--border);border-radius:32px;padding:28px;box-shadow:0 30px 80px rgba(0,0,0,.35)}
  .top{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
  h1{margin:0;font-size:clamp(28px,4vw,42px);letter-spacing:-.04em}
  .sub{margin-top:6px;color:color-mix(in srgb,var(--text) 68%, transparent)}
  .pill{padding:10px 14px;border-radius:999px;border:1px solid var(--border);background:rgba(255,255,255,.06)}
  .grid{display:grid;grid-template-rows:repeat(6,1fr);gap:10px;max-width:360px;margin:24px auto}
  .row{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
  .tile{aspect-ratio:1;border-radius:18px;border:1px solid var(--border);display:grid;place-items:center;font-size:clamp(22px,5vw,32px);font-weight:800;text-transform:uppercase;background:rgba(255,255,255,.03);transition:.18s transform,.18s background,.18s border-color;box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
  .tile.pop{transform:scale(1.03)}
  .tile.good{background:linear-gradient(180deg,var(--good), color-mix(in srgb,var(--good) 70%, black));border-color:transparent;color:white}
  .tile.warn{background:linear-gradient(180deg,var(--warn), color-mix(in srgb,var(--warn) 70%, black));border-color:transparent;color:#18181b}
  .tile.bad{background:linear-gradient(180deg,var(--bad), color-mix(in srgb,var(--bad) 70%, black));border-color:transparent;color:white}
  .keyboard{display:grid;gap:10px;max-width:660px;margin:0 auto}
  .keyrow{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
  button.key{min-width:40px;height:52px;border-radius:14px;border:1px solid var(--border);background:rgba(255,255,255,.05);color:var(--text);font-weight:700;cursor:pointer;padding:0 14px;font-size:15px}
  button.key:hover{transform:translateY(-1px)}
  button.key.good{background:var(--good);border-color:transparent;color:white}
  button.key.warn{background:var(--warn);border-color:transparent;color:#18181b}
  button.key.bad{background:var(--bad);border-color:transparent;color:white}
  .toast{height:28px;text-align:center;color:color-mix(in srgb,var(--text) 72%, transparent);margin:12px 0;font-weight:600}
  .controls{display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap}
  .controls button{border:none;border-radius:999px;padding:12px 18px;background:var(--accent);color:white;font-weight:800;cursor:pointer}
</style>
</head>
<body>
<div class="app">
  <div class="top">
    <div>
      <h1>${labels.title}</h1>
      <div class="sub">${labels.subtitle}</div>
    </div>
    <div class="pill" id="statusPill">6 tries</div>
  </div>
  <div class="toast" id="toast"></div>
  <div class="grid" id="grid"></div>
  <div class="keyboard" id="keyboard"></div>
  <div class="controls">
    <button id="restartBtn">Restart</button>
  </div>
</div>
<script>
const WORDS=${JSON.stringify(words)};
let answer="", row=0, col=0, board=[], keyState={}, over=false;
const grid=document.getElementById('grid');
const keyboard=document.getElementById('keyboard');
const toast=document.getElementById('toast');
const statusPill=document.getElementById('statusPill');
const rows=6, cols=5;
function pick(){answer=WORDS[Math.floor(Math.random()*WORDS.length)]}
function initBoard(){board=Array.from({length:rows},()=>Array(cols).fill(''));grid.innerHTML='';for(let r=0;r<rows;r++){const rowEl=document.createElement('div');rowEl.className='row';for(let c=0;c<cols;c++){const cell=document.createElement('div');cell.className='tile';cell.id='tile-'+r+'-'+c;rowEl.appendChild(cell);}grid.appendChild(rowEl);}}
function setToast(msg){toast.textContent=msg;clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>toast.textContent='',1800)}
function paintKey(letter,state){const btn=document.querySelector('[data-key="'+letter+'"]');if(!btn) return;const order={good:3,warn:2,bad:1};const current=btn.dataset.state; if(current && order[current]>=order[state]) return;btn.dataset.state=state;btn.classList.remove('good','warn','bad');btn.classList.add(state)}
function render(){for(let r=0;r<rows;r++){for(let c=0;c<cols;c++){const tile=document.getElementById('tile-'+r+'-'+c);tile.textContent=board[r][c]||'';tile.classList.toggle('pop', r===row && c===col && !!board[r][c]);}}statusPill.textContent=(rows-row)+' tries';}
function commitLetter(letter){if(over || col>=cols) return; board[row][col]=letter; col++; render();}
function backspace(){if(over || col<=0) return; col--; board[row][col]=''; render();}
function evaluateGuess(){const guess=board[row].join(''); if(guess.length!==5 || !WORDS.includes(guess)){setToast(${JSON.stringify(labels.invalid)}); return;} const answerArr=answer.split(''); const guessArr=guess.split(''); const marks=Array(5).fill('bad');
for(let i=0;i<5;i++){if(guessArr[i]===answerArr[i]){marks[i]='good';answerArr[i]=null;}}
for(let i=0;i<5;i++){if(marks[i]==='good') continue; const idx=answerArr.indexOf(guessArr[i]); if(idx!==-1){marks[i]='warn';answerArr[idx]=null;}}
marks.forEach((mark,i)=>{const tile=document.getElementById('tile-'+row+'-'+i); tile.classList.add(mark); paintKey(guess[i],mark);});
if(guess===answer){over=true; setToast(${JSON.stringify(labels.win)}); statusPill.textContent='Solved'; return;}
row++; col=0;
if(row>=rows){over=true; setToast(${JSON.stringify(labels.lose)}+' '+answer); statusPill.textContent=answer; return;}
render();
}
function handle(key){if(over && key!=='restart') return; if(key==='ENTER') return evaluateGuess(); if(key==='BACKSPACE') return backspace(); if(/^[A-Z]$/.test(key) && col<cols) commitLetter(key);}
function buildKeyboard(){keyboard.innerHTML='';[['QWERTYUIOP'],['ASDFGHJKL'],['ENTER','ZXCVBNM','BACKSPACE']].forEach(group=>{const row=document.createElement('div');row.className='keyrow';const keys=Array.isArray(group)?group:[group];keys.forEach(chunk=>{chunk.match(/ENTER|BACKSPACE|[A-Z]/g).forEach(k=>{const btn=document.createElement('button');btn.className='key';btn.textContent=k==='ENTER'?${JSON.stringify(labels.enter)}:k==='BACKSPACE'?${JSON.stringify(labels.back)}:k;btn.dataset.key=k.length===1?k:k;btn.onclick=()=>handle(k);row.appendChild(btn);});});keyboard.appendChild(row);});}
function restart(){row=0;col=0;over=false;pick();keyState={};buildKeyboard();initBoard();render();setToast('');}
document.addEventListener('keydown',e=>{if(e.key==='Enter') handle('ENTER'); else if(e.key==='Backspace') handle('BACKSPACE'); else {const k=e.key.toUpperCase(); if(/^[A-Z]$/.test(k)) handle(k);}});
document.getElementById('restartBtn').onclick=restart; restart();
</script>
</body>
</html>`;
}

function snakeTemplate(style: string, language: "he" | "en") {
  const t = themeTokens(style);
  return `<!DOCTYPE html><html lang="${language}"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Playcraft Snake</title><style>
  :root{--bg:${t.bg};--panel:${t.panel};--text:${t.text};--accent:${t.accent};--border:${t.border}}
  *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:radial-gradient(circle at top right,color-mix(in srgb,var(--accent) 34%, transparent),transparent 28%),var(--bg);color:var(--text);min-height:100vh;display:grid;place-items:center;padding:24px}.app{width:min(92vw,780px);background:var(--panel);border:1px solid var(--border);border-radius:28px;padding:22px;box-shadow:0 30px 80px rgba(0,0,0,.35)}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.top h1{margin:0;font-size:34px}.muted{color:rgba(255,255,255,.72)}canvas{width:100%;max-width:720px;aspect-ratio:1;border-radius:24px;background:#07131f;border:1px solid var(--border);display:block;margin:18px auto}button{border:none;border-radius:999px;padding:12px 18px;background:var(--accent);color:white;font-weight:800;cursor:pointer}
</style></head><body><div class="app"><div class="top"><div><h1>Playcraft Snake</h1><div class="muted">Arrow keys / WASD</div></div><div id="score">Score: 0</div></div><canvas id="game" width="600" height="600"></canvas><div style="display:flex;gap:10px;justify-content:center"><button id="restart">Restart</button></div></div><script>
const c=document.getElementById('game'),x=c.getContext('2d');let size=24,dir={x:1,y:0},next={x:1,y:0},snake=[{x:8,y:10},{x:7,y:10},{x:6,y:10}],food={x:15,y:14},score=0,over=false;function rand(){return Math.floor(Math.random()*25)}function placeFood(){do{food={x:rand(),y:rand()}}while(snake.some(s=>s.x===food.x&&s.y===food.y))}function restart(){dir={x:1,y:0};next={x:1,y:0};snake=[{x:8,y:10},{x:7,y:10},{x:6,y:10}];score=0;over=false;placeFood();document.getElementById('score').textContent='Score: '+score;}function draw(){x.clearRect(0,0,c.width,c.height);for(let i=0;i<25;i++){for(let j=0;j<25;j++){x.fillStyle=(i+j)%2===0?'#0a1b2c':'#0d2136';x.fillRect(i*size,j*size,size,size);}}x.fillStyle='${t.accent}';snake.forEach((s,idx)=>{x.beginPath();x.roundRect(s.x*size+2,s.y*size+2,size-4,size-4,idx===0?10:8);x.fill()});x.fillStyle='${t.accent2}';x.beginPath();x.arc(food.x*size+size/2,food.y*size+size/2,size/2.7,0,Math.PI*2);x.fill();if(over){x.fillStyle='rgba(0,0,0,.55)';x.fillRect(0,0,c.width,c.height);x.fillStyle='white';x.font='800 36px Inter';x.fillText('Game over',200,290);x.font='500 18px Inter';x.fillText('Press restart',248,326);}}
function tick(){if(over) return draw();dir=next;const head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};if(head.x<0||head.y<0||head.x>=25||head.y>=25||snake.some(s=>s.x===head.x&&s.y===head.y)){over=true;return draw()}snake.unshift(head);if(head.x===food.x&&head.y===food.y){score++;document.getElementById('score').textContent='Score: '+score;placeFood()}else{snake.pop()}draw()}document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if((k==='arrowup'||k==='w')&&dir.y!==1)next={x:0,y:-1};if((k==='arrowdown'||k==='s')&&dir.y!==-1)next={x:0,y:1};if((k==='arrowleft'||k==='a')&&dir.x!==1)next={x:-1,y:0};if((k==='arrowright'||k==='d')&&dir.x!==-1)next={x:1,y:0};});document.getElementById('restart').onclick=restart;restart();draw();setInterval(tick,105);
</script></body></html>`;
}

function runnerTemplate(style: string, language: "he" | "en") {
  const t = themeTokens(style);
  return `<!DOCTYPE html><html lang="${language}"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Playcraft Runner</title><style>:root{--bg:${t.bg};--panel:${t.panel};--text:${t.text};--accent:${t.accent};--border:${t.border}}*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#89c2ff 0%, #d9f1ff 55%, #eff7ff 100%);font-family:Inter,system-ui,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}.app{width:min(920px,95vw);background:rgba(255,255,255,.92);border-radius:28px;border:1px solid rgba(255,255,255,.65);padding:20px;box-shadow:0 30px 80px rgba(30,64,175,.18)}canvas{width:100%;height:auto;border-radius:20px;border:1px solid #dbeafe;display:block;background:linear-gradient(180deg,#dbeafe 0%,#eff6ff 52%,#e0f2fe 52%,#bae6fd 100%)}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}button{border:none;border-radius:999px;padding:12px 18px;background:${t.accent};color:white;font-weight:800;cursor:pointer}</style></head><body><div class="app"><div class="top"><div><h1 style="margin:0;font-size:34px;letter-spacing:-.04em">Playcraft Runner</h1><div style="color:#475569">Jump with Space / Arrow Up</div></div><div id="score">Score: 0</div></div><canvas id="game" width="900" height="420"></canvas><div style="display:flex;justify-content:center;margin-top:14px"><button id="restart">Restart</button></div></div><script>const c=document.getElementById('game'),x=c.getContext('2d');let player,obstacles,score,speed,ground,over;function reset(){player={x:120,y:250,w:54,h:64,vy:0,jumping:false};obstacles=[];score=0;speed=7;ground=320;over=false;}function draw(){x.clearRect(0,0,c.width,c.height);x.fillStyle='#38bdf8';x.fillRect(0,ground,900,100);x.fillStyle='#0284c7';for(let i=0;i<900;i+=50)x.fillRect(i,ground+38,28,12);x.fillStyle='${t.accent}';x.beginPath();x.roundRect(player.x,player.y,player.w,player.h,18);x.fill();x.fillStyle='${t.accent2}';obstacles.forEach(o=>{x.beginPath();x.roundRect(o.x,o.y,o.w,o.h,12);x.fill()});if(over){x.fillStyle='rgba(15,23,42,.48)';x.fillRect(0,0,900,420);x.fillStyle='white';x.font='800 40px Inter';x.fillText('Game over',332,185);x.font='500 18px Inter';x.fillText('Press restart to try again',312,225);}}function step(){if(over){draw();return} if(Math.random()<0.025)obstacles.push({x:940,y:ground-52,w:34+Math.random()*24,h:52});speed+=0.0015;player.vy+=0.8;player.y+=player.vy;if(player.y>=ground-player.h){player.y=ground-player.h;player.vy=0;player.jumping=false;}obstacles=obstacles.map(o=>({...o,x:o.x-speed})).filter(o=>o.x+o.w>0);for(const o of obstacles){if(player.x<o.x+o.w&&player.x+player.w>o.x&&player.y<o.y+o.h&&player.y+player.h>o.y){over=true;}}score++;document.getElementById('score').textContent='Score: '+Math.floor(score/10);draw();requestAnimationFrame(step)}function jump(){if(player.jumping||over)return;player.jumping=true;player.vy=-15;}document.addEventListener('keydown',e=>{if(e.key===' '||e.key==='ArrowUp')jump()});document.getElementById('restart').onclick=()=>{reset();step()};reset();step();</script></body></html>`;
}

function platformerTemplate(style: string, language: "he" | "en") {
  const t = themeTokens(style);
  return `<!DOCTYPE html><html lang="${language}"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Playcraft Platformer</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:Inter,system-ui,sans-serif;background:linear-gradient(180deg,#1d4ed8,#0ea5e9)}.app{width:min(960px,95vw);background:rgba(255,255,255,.94);border-radius:26px;padding:20px;box-shadow:0 30px 80px rgba(0,0,0,.2)}canvas{width:100%;height:auto;border-radius:18px;background:linear-gradient(180deg,#93c5fd,#bfdbfe 50%, #dbeafe 50%, #dbeafe 100%);display:block;border:1px solid #dbeafe}</style></head><body><div class="app"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div><h1 style="margin:0;font-size:34px">Playcraft Platformer</h1><div style="color:#475569">Move with arrows / A D, jump with Space</div></div><button id="restart" style="border:none;border-radius:999px;padding:12px 18px;background:${t.accent};color:#fff;font-weight:800;cursor:pointer">Restart</button></div><canvas id="game" width="920" height="460"></canvas></div><script>const c=document.getElementById('game'),x=c.getContext('2d');const gravity=.7;let keys={},player,platforms,goal,won;function reset(){player={x:60,y:320,w:42,h:54,vx:0,vy:0,onGround:false};platforms=[{x:0,y:400,w:920,h:60},{x:160,y:320,w:160,h:18},{x:380,y:260,w:180,h:18},{x:620,y:210,w:130,h:18},{x:760,y:320,w:110,h:18}];goal={x:830,y:160,w:28,h:60};won=false;}function draw(){x.clearRect(0,0,920,460);x.fillStyle='#34d399';platforms.forEach(p=>x.fillRect(p.x,p.y,p.w,p.h));x.fillStyle='${t.accent}';x.beginPath();x.roundRect(player.x,player.y,player.w,player.h,12);x.fill();x.fillStyle='#fbbf24';x.fillRect(goal.x,goal.y,goal.w,goal.h);if(won){x.fillStyle='rgba(15,23,42,.35)';x.fillRect(0,0,920,460);x.fillStyle='white';x.font='800 40px Inter';x.fillText('You win!',380,200);}}function step(){player.vx=(keys['arrowright']||keys['d']?5:0)+(keys['arrowleft']||keys['a']?-5:0);player.vy+=gravity;player.x+=player.vx;player.y+=player.vy;player.onGround=false;platforms.forEach(p=>{if(player.x<p.x+p.w&&player.x+player.w>p.x&&player.y+player.h<=p.y+20&&player.y+player.h>=p.y&&player.vy>=0){player.y=p.y-player.h;player.vy=0;player.onGround=true;}});if(player.y>500) reset();if(player.x<0)player.x=0;if(player.x+player.w>920)player.x=920-player.w;if(player.x<goal.x+goal.w&&player.x+player.w>goal.x&&player.y<goal.y+goal.h&&player.y+player.h>goal.y)won=true;draw();requestAnimationFrame(step)}document.addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if((e.key===' '||e.key==='ArrowUp')&&player.onGround){player.vy=-14;player.onGround=false;}});document.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false});document.getElementById('restart').onclick=()=>reset();reset();step();</script></body></html>`;
}

function horrorTemplate(style: string, language: "he" | "en") {
  const t = themeTokens("horror");
  return `<!DOCTYPE html><html lang="${language}"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Playcraft Horror Maze</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at center,#111 0%,#020203 70%);display:grid;place-items:center;padding:24px;font-family:Inter,system-ui,sans-serif;color:#fff}.app{width:min(96vw,900px);background:rgba(12,12,14,.88);border:1px solid ${t.border};border-radius:28px;padding:20px;box-shadow:0 30px 80px rgba(0,0,0,.48)}canvas{width:100%;height:auto;border-radius:18px;background:#050608;border:1px solid rgba(255,255,255,.06);display:block}.muted{color:#b8c1d1}button{border:none;border-radius:999px;padding:12px 18px;background:${t.accent};color:#fff;font-weight:800;cursor:pointer}</style></head><body><div class="app"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px"><div><h1 style="margin:0;font-size:34px">Playcraft Horror Maze</h1><div class="muted">Find the exit. Arrows / WASD.</div></div><button id="restart">Restart</button></div><canvas id="game" width="860" height="520"></canvas></div><script>const c=document.getElementById('game'),x=c.getContext('2d');const maze=["####################","#S   #       #    E#","# ## # ##### # #####","# ## #     # #     #","#    ##### # ### # #","####     # #   # # #","#    ### # ### # # #","# ####   #     #   #","#      ########### #","####################"];let player={x:0,y:0},keys={};function reset(){maze.forEach((row,y)=>row.split('').forEach((ch,x2)=>{if(ch==='S')player={x:x2,y};}));}function cell(xi,yi){return maze[yi]?.[xi]||'#';}function move(dx,dy){const nx=player.x+dx,ny=player.y+dy;if(cell(nx,ny)!=='#')player={x:nx,y:ny};if(cell(nx,ny)==='E')setTimeout(()=>{alert('You escaped!');reset();},10)}function draw(){x.clearRect(0,0,c.width,c.height);const tile=40;for(let y=0;y<maze.length;y++){for(let xx=0;xx<maze[y].length;xx++){const ch=maze[y][xx];x.fillStyle=ch==='#'?'#1f2937':'#090d14';x.fillRect(xx*tile,y*tile,tile,tile);if(ch==='E'){x.fillStyle='${t.accent}';x.fillRect(xx*tile+12,y*tile+12,16,16);}}}x.fillStyle='${t.accent}';x.beginPath();x.arc(player.x*40+20,player.y*40+20,12,0,Math.PI*2);x.fill();x.fillStyle='rgba(0,0,0,.82)';x.fillRect(0,0,c.width,c.height);const grad=x.createRadialGradient(player.x*40+20,player.y*40+20,20,player.x*40+20,player.y*40+20,120);grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(1,'rgba(0,0,0,.95)');x.globalCompositeOperation='destination-out';x.fillStyle=grad;x.beginPath();x.arc(player.x*40+20,player.y*40+20,120,0,Math.PI*2);x.fill();x.globalCompositeOperation='source-over';requestAnimationFrame(draw)}document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(k==='arrowup'||k==='w')move(0,-1);if(k==='arrowdown'||k==='s')move(0,1);if(k==='arrowleft'||k==='a')move(-1,0);if(k==='arrowright'||k==='d')move(1,0);});document.getElementById('restart').onclick=()=>reset();reset();draw();</script></body></html>`;
}

async function genericGameHtml(args: {
  userText: string;
  messages: Message[];
  style: string;
  language: "he" | "en";
  project?: ProjectContext | null;
  designNotes?: string;
}) {
  const system = `You are Playcraft's senior game generator.
Make polished, beautiful, playable browser games.
If the user mentions a design image, treat it as a strict design reference, not a request to generate an image.
Return exactly this format:
<reply>Very short explanation in the user's language. 2-5 lines max.</reply>
<file name="game.html" type="html">
FULL SINGLE-FILE HTML HERE
</file>
Rules:
- The game must look premium and finished.
- The logic must be correct and complete.
- Use responsive layout.
- Add keyboard support when relevant.
- Add restart and clear win/lose states.
- No placeholders.
- No markdown fences.
- Keep assets inline.`;
  const prompt = `Language: ${args.language === "he" ? "Hebrew" : "English"}
Style preset: ${args.style}
Project memory: ${args.project?.memory || "none"}
Project files: ${(args.project?.files || []).join(", ") || "none"}
Design notes from reference images:
${args.designNotes || "none"}
User request:
${args.userText}`;
  return await groqChat({
    model: DEFAULT_MODEL,
    system,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.45,
    max_tokens: 5200,
  });
}

async function textOrCodeAnswer(args: {
  messages: Message[];
  mode?: string;
  studyMode?: string;
  project?: ProjectContext | null;
  language: "he" | "en";
}) {
  const latest = latestUserText(args.messages);
  const wantsFileOutput = wantsFile(latest) && !/(game|משחק)/i.test(latest);
  const codeRequested = wantsCode(latest, args.mode);
  const searchRequested = wantsWebSearch(latest, args.mode);
  const model = searchRequested ? WEB_MODEL : DEFAULT_MODEL;
  const system = `You are Playcraft, an excellent coding and learning assistant.
Output policy:
- If the user mainly wants explanation: respond with clean rich text only.
- If the user asks for code: give a short explanation and then code blocks.
- If the user explicitly asks for a file: return exactly this format:
<reply>short explanation</reply>
<file name="FILE_NAME" type="text|js|ts|html|css|json|md|ino">
FILE CONTENT
</file>
- Do not create a file unless the user explicitly wants one, except browser games where file-by-default is allowed.
- If the user writes in Hebrew, answer in Hebrew.
- Be very organized and concise.
- For Arduino/ESP32, explain briefly and provide paste-ready code unless the user explicitly asks for a file.
- In study mode, adapt to the requested study style (${args.studyMode || "explain"}).`;
  const projectBits = args.project
    ? `Project: ${args.project.name}\nProject memory: ${args.project.memory || "none"}\nStyle: ${args.project.stylePreset || "modern"}\nFiles: ${(args.project.files || []).join(", ") || "none"}`
    : "No project context.";
  const promptMessages = toGroqMessages(args.messages);
  const contentPrefix = `${projectBits}\nCurrent mode: ${args.mode || "chat"}\nNeed code: ${codeRequested ? "yes" : "no"}\nNeed file: ${wantsFileOutput ? "yes" : "no"}`;
  const response = await groqChat({
    model,
    system,
    messages: [{ role: "user", content: contentPrefix }, ...promptMessages],
    temperature: args.mode === "fix" ? 0.2 : 0.35,
    max_tokens: 3600,
  });
  return response;
}

function makeArtifact(name: string, type: string, content: string) {
  const ext = type.toLowerCase();
  const kind = ext === "html" ? "html" : /png|jpg|jpeg|gif|webp/.test(ext) ? "image" : "text";
  const mime =
    ext === "html"
      ? "text/html"
      : ext === "js"
      ? "text/javascript"
      : ext === "ts"
      ? "text/typescript"
      : ext === "css"
      ? "text/css"
      : ext === "json"
      ? "application/json"
      : ext === "ino"
      ? "text/plain"
      : "text/plain";
  return {
    id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    kind,
    mime,
    content,
  };
}

function fileResponse(reply: string, artifact: ReturnType<typeof makeArtifact>, titleHint: string) {
  return { reply, artifacts: [artifact], images: [], titleHint };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const messages = body.messages || [];
    if (!messages.length) return json({ error: "No messages." }, { status: 400 });

    const userText = latestUserText(messages);
    const attachments = latestUserAttachments(messages);
    const language = inferLanguage(userText) as "he" | "en";
    const style = detectStyle(userText, body.project);
    const titleHint = buildTitleHint(userText, language);
    const gameRequest = isGameRequest(userText, body.mode);
    const imageRequest = wantsImage(userText, body.mode) && !wantsReferenceDesign(userText, attachments);

    if (imageRequest) {
      return json({ ...imageResult(userText, language), titleHint });
    }

    if (gameRequest) {
      const gameKind = detectGameKind(userText);
      const wantsCodeOnly = wantsCode(userText, body.mode) && !wantsFile(userText);
      const designNotes = attachments.some((a) => a.kind === "image") ? await designNotesFromImages(messages, userText) : "";

      if (!wantsCodeOnly) {
        if (gameKind === "wordle") {
          const html = wordleTemplate(style, language);
          const reply = language === "he"
            ? "בניתי לך וורדל יפה ומסודר עם לוגיקה מלאה, מקלדת פיזית, מקלדת על המסך, Enter, Backspace, ניצחון והפסד."
            : "I built a polished Wordle with full logic, physical keyboard support, on-screen keyboard, Enter, Backspace, win and lose states.";
          return json(fileResponse(reply, makeArtifact("wordle.html", "html", html), titleHint));
        }
        if (gameKind === "snake") {
          const html = snakeTemplate(style, language);
          const reply = language === "he"
            ? "בניתי לך Snake יפה עם שליטה במקלדת, ניקוד ו־restart."
            : "I built you a polished Snake game with keyboard controls, score and restart.";
          return json(fileResponse(reply, makeArtifact("snake.html", "html", html), titleHint));
        }
        if (gameKind === "runner") {
          const html = runnerTemplate(style, language);
          const reply = language === "he"
            ? "בניתי לך endless runner יפה עם קפיצה, ניקוד ו־restart."
            : "I built you a polished endless runner with jump, score and restart.";
          return json(fileResponse(reply, makeArtifact("runner.html", "html", html), titleHint));
        }
        if (gameKind === "platformer") {
          const html = platformerTemplate(style, language);
          const reply = language === "he"
            ? "בניתי לך platformer מסודר עם תנועה, קפיצה, מטרה ו־restart."
            : "I built you a neat platformer with movement, jump, goal and restart.";
          return json(fileResponse(reply, makeArtifact("platformer.html", "html", html), titleHint));
        }
        if (gameKind === "horror") {
          const html = horrorTemplate(style, language);
          const reply = language === "he"
            ? "בניתי לך horror maze עם שליטה במקלדת, אווירה אפלה ו־restart."
            : "I built you a horror maze with keyboard controls, dark mood and restart.";
          return json(fileResponse(reply, makeArtifact("horror-maze.html", "html", html), titleHint));
        }
      }

      const raw = await genericGameHtml({
        userText,
        messages,
        style,
        language,
        project: body.project,
        designNotes,
      });
      const { clean, file } = extractFileTag(raw);
      if (file) {
        return json(fileResponse(clean, makeArtifact(file.name, file.type, file.content), titleHint));
      }
      return json({ reply: clean || (language === "he" ? "סיימתי." : "Done."), artifacts: [], images: [], titleHint });
    }

    const raw = await textOrCodeAnswer({
      messages,
      mode: body.mode,
      studyMode: body.studyMode,
      project: body.project,
      language,
    });
    const { clean, file } = extractFileTag(raw);
    if (file) {
      return json(fileResponse(clean, makeArtifact(file.name, file.type, file.content), titleHint));
    }
    return json({ reply: clean, artifacts: [], images: [], titleHint });
  } catch (error: any) {
    return json({ error: error?.message || "Something went wrong." }, { status: 500 });
  }
}
