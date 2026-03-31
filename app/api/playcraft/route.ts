import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || process.env.GROQ_MODEL || "qwen/qwen3-32b";
const HEAVY_MODEL = process.env.HEAVY_MODEL || "openai/gpt-oss-120b";
const FAST_MODEL = process.env.GROQ_FAST_MODEL || "groq/compound-mini";
const VISION_MODEL = process.env.VISION_MODEL || process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

const SYS_ROUTER = `You are Playcraft's internal router.
Choose the best output strategy.
Return strict JSON with keys:
intent: one of chat|code|game|study|image
output: one of text|code|file|files|image
clarify: boolean
clarify_question: string
reason: short string
Rules:
- Greetings or casual talk -> chat/text.
- Arduino/ESP32 usually -> code.
- If the user explicitly asks to build or create a game -> game/file unless they ask for code.
- If the user asks for code, code only, fix, refactor, or a sketch -> code.
- If the user uploads screenshots and asks like this/reference/match/copy -> keep intent based on request, but note it's a design reference.
- Ask a clarifying question only if a critical detail is truly missing and the request cannot be sensibly fulfilled.`;

const SYS_CHAT = `You are Playcraft, a very smart and practical assistant.
You are strong at coding, games, product design, UI critique, study help, ESP32/Arduino, and clear explanations.
Rules:
- Reply in the user's language.
- Keep mixed Hebrew/English visually clean.
- Do not generate a file unless it clearly helps or the user asked for one.
- When the user says hi/hello/היי/שלום, just chat naturally.
- Be helpful, concise, and structured.
- Use headings only when they help.
- If the user uploaded screenshots and asks to match/copy them, treat them as design references, not as a request to create an image.`;

const SYS_CODE = `You are Playcraft's elite coding expert.
Write production-quality code and clear explanations.
Rules:
- Reply in the user's language.
- If the mode is code-only, return code first and keep prose minimal.
- If the mode is explain+code, explain briefly and then provide code.
- If the mode is fix, explain the bug and then provide the fixed code.
- If the mode is refactor, explain the refactor briefly and then provide the improved code.
- For Arduino/ESP32 return code that is ready to paste into Arduino IDE.
- If the user asks for multiple files, return JSON with summary, title, and files[{name,mime,content}].
- Otherwise return markdown with fenced code blocks.`;

const SYS_STUDY = `You are Playcraft's study coach.
Teach clearly and adapt to the requested study mode.
Available study submodes: general, quiz, flashcards, simple, file, questions.
Rules:
- Reply in the user's language.
- Make the answer structured and easy to follow.
- In quiz mode, ask questions and wait.
- In flashcards mode, return short Q/A pairs.
- In simple mode, explain like to a beginner.
- In file mode, focus on the uploaded file.
- In questions mode, ask the user questions on the topic.`;

const SYS_GAME = `You are Playcraft Game Studio, an expert browser game designer and engineer.
You build beautiful, fully playable games with polished UI and solid logic.
Rules:
- Return strict JSON with keys: summary, title, html.
- html must be a complete self-contained HTML document.
- No external libraries or assets.
- The game must work immediately when opened.
- Keyboard controls must work without focusing an input.
- The game must look polished: spacing, hierarchy, shadows, buttons, readable typography, nice colors, clear states.
- Include a short instruction area, restart/new game flow, and good feedback.
- If the user provided screenshots and asked for a similar style, follow them closely.
- If the user asks for a specific game style, follow it: pixel, neon, horror, cartoon, minimal, modern.
- If the user asks for code instead of a built game, do not return HTML; return code in markdown instead.`;

const SYS_TITLE = `Create a very short chat title summary, 2 to 5 words, in the user's language if possible. No quotes.`;

type FilePart = { name?: string; type?: string; dataUrl?: string; text?: string; previewUrl?: string };
type IncomingMessage = { role: "user" | "assistant"; content?: string; files?: FilePart[] };
type ProjectMemory = {
  style?: string;
  designPreset?: string;
  notes?: string;
  files?: Array<{ name: string; kind?: string }>;
  gameStyle?: string;
};
type RouteBody = {
  messages?: IncomingMessage[];
  mode?: string;
  codeMode?: string;
  studyMode?: string;
  gameStyle?: string;
  designPreset?: string;
  projectMemory?: ProjectMemory;
};

type FileOutput = { name: string; mime: string; content?: string; url?: string };

function latestUserText(messages: IncomingMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return (messages[i].content || "").trim();
  }
  return "";
}

function latestUserFiles(messages: IncomingMessage[]): FilePart[] {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i].files || [];
  }
  return [];
}

function isHebrew(text = "") {
  return /[\u0590-\u05FF]/.test(text);
}

function sanitizeTitle(title: string, fallback: string) {
  const clean = title.replace(/[\n\r\t]+/g, " ").replace(/["'`]/g, "").trim();
  return (clean || fallback).slice(0, 44);
}

async function persistPublicFile(file: FileOutput): Promise<FileOutput> {
  if (!file.content) return file;
  try {
    const safeName = String(file.name || "playcraft-file").replace(/[^a-zA-Z0-9._-]+/g, "-");
    const blob = await put(`playcraft/${Date.now()}-${safeName}`, file.content, {
      access: "public",
      contentType: file.mime || "text/plain",
      addRandomSuffix: true,
    });
    return { ...file, url: blob.url };
  } catch {
    return file;
  }
}

async function persistMany(files: FileOutput[]): Promise<FileOutput[]> {
  return Promise.all(files.map((f) => persistPublicFile(f)));
}

function htmlFile(name: string, html: string): FileOutput {
  return { name, mime: "text/html", content: html };
}

function textFiles(files: FilePart[]) {
  return files.filter((f) => !String(f.type || "").startsWith("image/") && f.text).slice(0, 6);
}

function imageFiles(files: FilePart[]) {
  return files.filter((f) => String(f.type || "").startsWith("image/") && f.dataUrl).slice(0, 4);
}

function inferGameStyle(text: string, memory?: ProjectMemory) {
  if (memory?.gameStyle) return memory.gameStyle;
  const map: Array<[string, RegExp]> = [
    ["pixel", /pixel|פיקסל/i],
    ["neon", /neon|ניאון/i],
    ["horror", /horror|אימה/i],
    ["cartoon", /cartoon|cartoony|מצויר/i],
    ["minimal", /minimal|מינימל/i],
    ["modern", /modern|מודרני/i],
  ];
  for (const [label, rx] of map) if (rx.test(text)) return label;
  return memory?.style || "modern";
}

function inferCodeMode(text: string, mode?: string) {
  if (mode) return mode;
  if (/(code only|רק קוד)/i.test(text)) return "code-only";
  if (/(fix my code|תקן לי את הקוד|fix this code)/i.test(text)) return "fix";
  if (/(refactor|רפקטור)/i.test(text)) return "refactor";
  if (/(arduino|esp32)/i.test(text)) return "arduino";
  return "explain-code";
}

function explicitOutputRequest(text: string) {
  if (/(file|קובץ|html file|zip)/i.test(text)) return "file";
  if (/(code|קוד|source)/i.test(text)) return "code";
  if (/(image|תמונה)/i.test(text)) return "image";
  return "text";
}

async function groqChat(messages: any[], opts?: { model?: string; temperature?: number; responseFormat?: any }) {
  if (!GROQ_API_KEY || !GROQ_API_KEY.startsWith("gsk_")) {
    return { error: "⚠️ GROQ_API_KEY is missing or not real. Put your real Groq key in Vercel Environment Variables." };
  }
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: opts?.model || DEFAULT_MODEL,
      temperature: opts?.temperature ?? 0.3,
      messages,
      ...(opts?.responseFormat ? { response_format: opts.responseFormat } : {}),
    }),
  });
  const json = await resp.json();
  if (!resp.ok) return { error: `⚠️ ${json?.error?.message || "Groq request failed."}` };
  return { text: json?.choices?.[0]?.message?.content || "", raw: json };
}

async function summarizeTitle(user: string, reply: string) {
  const out = await groqChat([
    { role: "system", content: SYS_TITLE },
    { role: "user", content: `${user}\n\n${reply}`.slice(0, 1200) },
  ], { model: FAST_MODEL, temperature: 0.2 });
  if ((out as any).error) return sanitizeTitle(user, "New chat");
  return sanitizeTitle(String((out as any).text || ""), sanitizeTitle(user, "New chat"));
}

async function analyzeReferenceImages(files: FilePart[], userText: string, designPreset?: string) {
  const images = imageFiles(files);
  if (!images.length) return "";
  const content: any[] = [
    {
      type: "text",
      text: `These are reference images. Analyze them as design/style references for this request: ${userText}. Also consider this preset if relevant: ${designPreset || "none"}. Return concise notes about palette, spacing, hierarchy, buttons, shadows, typography, mood, layout, and game/UI motifs. If they look like screenshots for a game or app, say so explicitly.`,
    },
  ];
  for (const img of images) {
    content.push({ type: "image_url", image_url: { url: img.dataUrl } });
  }
  const out = await groqChat([
    { role: "system", content: "You are a precise product design and game UI analyst." },
    { role: "user", content },
  ], { model: VISION_MODEL, temperature: 0.2 });
  return (out as any).error ? "" : String((out as any).text || "").slice(0, 2500);
}

async function routeIntent(messages: IncomingMessage[], body: RouteBody) {
  const text = latestUserText(messages);
  const files = latestUserFiles(messages);
  const explicit = explicitOutputRequest(text);
  if (!text && !files.length) return { intent: "chat", output: "text", clarify: false };
  if (/^(hi|hello|hey|היי|שלום|מה נשמע)$/i.test(text.trim()) && body.mode !== "build") {
    return { intent: "chat", output: "text", clarify: false };
  }
  if (body.mode === "study") return { intent: "study", output: "text", clarify: false };
  if (body.mode === "image") return { intent: "image", output: "image", clarify: false };
  if (body.mode === "build") return { intent: "game", output: explicit === "code" ? "code" : "file", clarify: false };
  if (body.mode === "code") return { intent: "code", output: explicit === "file" ? "files" : "code", clarify: false };

  const heuristics = {
    game: /(תכין לי משחק|תבנה לי משחק|תעשה לי משחק|build a game|create a game|make a game|וורדל|wordle|snake|runner|platformer|pong|tetris|maze|racing|shooter|flappy)/i.test(text),
    code: /(code|קוד|arduino|esp32|sketch|fix my code|refactor|html|css|javascript|python|react|next\.js|ts|typescript)/i.test(text),
    image: /(create image|generate image|צור תמונה|תיצור תמונה|תעשה תמונה|תייצר תמונה)/i.test(text),
    study: /(study|learn|למד|תסביר|explain|quiz|flashcards)/i.test(text),
    hasImages: imageFiles(files).length > 0,
  };

  if (heuristics.image) return { intent: "image", output: "image", clarify: false };
  if (heuristics.game && explicit !== "image") return { intent: "game", output: explicit === "code" ? "code" : explicit === "text" ? "file" : explicit, clarify: false };
  if (heuristics.code) return { intent: "code", output: explicit === "file" ? "files" : "code", clarify: false };
  if (heuristics.study) return { intent: "study", output: "text", clarify: false };
  if (heuristics.hasImages && /(like this|כמו זה|כזה|match this|copy this|reference)/i.test(text)) return { intent: "chat", output: "text", clarify: false, designReference: true };

  const out = await groqChat([
    { role: "system", content: SYS_ROUTER },
    { role: "user", content: JSON.stringify({ text, mode: body.mode, codeMode: body.codeMode, studyMode: body.studyMode, fileCount: files.length, imageCount: imageFiles(files).length, explicit }) },
  ], { model: FAST_MODEL, temperature: 0.1, responseFormat: { type: "json_object" } });
  if ((out as any).error) return { intent: "chat", output: "text", clarify: false };
  try {
    return JSON.parse(String((out as any).text || "{}"));
  } catch {
    return { intent: "chat", output: "text", clarify: false };
  }
}

function themeTokens(style: string) {
  const themes: Record<string, any> = {
    modern: { bg: "#f6f7fb", panel: "#ffffff", ink: "#111827", sub: "#6b7280", accent: "#6366f1", accent2: "#a855f7", ok: "#22c55e", mid: "#f59e0b", miss: "#cbd5e1" },
    pixel: { bg: "#0f172a", panel: "#111827", ink: "#f8fafc", sub: "#93c5fd", accent: "#22d3ee", accent2: "#8b5cf6", ok: "#10b981", mid: "#f59e0b", miss: "#334155" },
    neon: { bg: "#080315", panel: "#100822", ink: "#f5f3ff", sub: "#c4b5fd", accent: "#e879f9", accent2: "#22d3ee", ok: "#22c55e", mid: "#fb7185", miss: "#3b275e" },
    horror: { bg: "#050505", panel: "#131313", ink: "#fafafa", sub: "#a3a3a3", accent: "#ef4444", accent2: "#7f1d1d", ok: "#65a30d", mid: "#d97706", miss: "#27272a" },
    cartoon: { bg: "#fff7ed", panel: "#ffffff", ink: "#2b2118", sub: "#9a6f50", accent: "#fb7185", accent2: "#f59e0b", ok: "#22c55e", mid: "#f97316", miss: "#f3d3b6" },
    minimal: { bg: "#fafafa", panel: "#ffffff", ink: "#111111", sub: "#6b7280", accent: "#111111", accent2: "#4b5563", ok: "#2e7d32", mid: "#ef6c00", miss: "#d4d4d8" },
  };
  return themes[style] || themes.modern;
}

function wordleTemplate(style = "modern") {
  const t = themeTokens(style);
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Playcraft Wordle</title><style>
  :root{--bg:${t.bg};--panel:${t.panel};--ink:${t.ink};--sub:${t.sub};--accent:${t.accent};--accent2:${t.accent2};--ok:${t.ok};--mid:${t.mid};--miss:${t.miss}}
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:Inter,system-ui,Arial;background:radial-gradient(circle at top, color-mix(in srgb,var(--accent) 14%, var(--bg)), var(--bg) 52%);color:var(--ink)}
  .app{width:min(720px,100%);background:var(--panel);border-radius:28px;padding:24px;border:1px solid color-mix(in srgb,var(--accent) 18%, transparent);box-shadow:0 24px 70px rgba(0,0,0,.18)}
  .head{display:flex;justify-content:space-between;align-items:start;gap:14px}.title{font-weight:1000;font-size:clamp(28px,5vw,44px);letter-spacing:.06em}.sub{color:var(--sub)}
  .board{display:grid;gap:10px;margin:22px auto;max-width:360px}.row{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.tile{aspect-ratio:1;border:2px solid color-mix(in srgb,var(--sub) 22%, transparent);border-radius:20px;display:grid;place-items:center;font-size:32px;font-weight:900;text-transform:uppercase;background:var(--panel);box-shadow:inset 0 -8px 14px rgba(0,0,0,.04)}.tile.filled{border-color:color-mix(in srgb,var(--accent) 40%, transparent)}.tile.ok{background:var(--ok);border-color:var(--ok);color:white}.tile.mid{background:var(--mid);border-color:var(--mid);color:white}.tile.miss{background:var(--miss);border-color:var(--miss);color:var(--ink)}
  .meta{display:flex;justify-content:space-between;gap:14px;align-items:center;margin:8px 0 14px}.pill{padding:10px 14px;border-radius:999px;background:color-mix(in srgb,var(--accent) 10%, var(--panel));color:var(--ink);font-weight:800}
  .kbd{display:grid;gap:10px}.krow{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}.key{border:none;border-radius:16px;padding:14px 12px;min-width:42px;background:color-mix(in srgb,var(--sub) 15%, var(--panel));color:var(--ink);font-weight:900;cursor:pointer;box-shadow:0 10px 22px rgba(0,0,0,.08)}.key.wide{min-width:88px}.key.ok{background:var(--ok);color:#fff}.key.mid{background:var(--mid);color:#fff}.key.miss{background:var(--miss)}
  .foot{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:16px;flex-wrap:wrap}.btn{border:none;border-radius:16px;padding:12px 16px;font-weight:900;cursor:pointer;background:linear-gradient(135deg,var(--accent),var(--accent2));color:white;box-shadow:0 16px 34px color-mix(in srgb,var(--accent) 28%, transparent)}
  @media(max-width:600px){.app{padding:18px}.tile{font-size:26px;border-radius:16px}.key{padding:12px 10px;min-width:36px;border-radius:14px}}
  </style></head><body><div class="app"><div class="head"><div><div class="title">WORDLE</div><div class="sub">Type with your keyboard. Press Enter to submit.</div></div><button class="btn" id="newGame">New game</button></div><div class="meta"><div class="pill" id="status">Guess the word</div><div class="pill" id="attempts">0 / 6</div></div><div class="board" id="board"></div><div class="kbd" id="kbd"></div><div class="foot"><div class="sub">A polished Playcraft Wordle</div><div class="sub" id="answerHint"></div></div></div><script>
  const WORDS=["apple","grape","flame","stone","light","candy","house","sweet","crane","shiny","smile","ocean","bread","dream","plant","spark","crown","trail","orbit","pearl"];
  let answer="",row=0,col=0,grid=[],done=false;const board=document.getElementById('board'),kbd=document.getElementById('kbd'),statusEl=document.getElementById('status'),attemptsEl=document.getElementById('attempts'),hintEl=document.getElementById('answerHint');
  function build(){board.innerHTML='';grid=[];for(let r=0;r<6;r++){const rowEl=document.createElement('div');rowEl.className='row';const cells=[];for(let c=0;c<5;c++){const cell=document.createElement('div');cell.className='tile';rowEl.appendChild(cell);cells.push(cell)}board.appendChild(rowEl);grid.push(cells)};const rows=['qwertyuiop','asdfghjkl','zxcvbnm'];kbd.innerHTML='';rows.forEach((keys,i)=>{const wrap=document.createElement('div');wrap.className='krow';if(i===2){wrap.appendChild(key('Enter',true))}keys.split('').forEach(ch=>wrap.appendChild(key(ch.toUpperCase())));if(i===2){wrap.appendChild(key('⌫',true))}kbd.appendChild(wrap)})}
  function key(label,wide=false){const b=document.createElement('button');b.className='key'+(wide?' wide':'');b.textContent=label;b.onclick=()=>press(label);return b}
  function reset(){answer=WORDS[Math.floor(Math.random()*WORDS.length)];row=0;col=0;done=false;statusEl.textContent='Guess the word';attemptsEl.textContent='0 / 6';hintEl.textContent='';build()}
  function press(label){if(done)return; if(label==='⌫'){if(col>0){col--;grid[row][col].textContent='';grid[row][col].classList.remove('filled')}return} if(label==='Enter'){submit();return} if(!/^[A-Z]$/.test(label)||col>=5)return;grid[row][col].textContent=label;grid[row][col].classList.add('filled');col++}
  function submit(){if(col<5){statusEl.textContent='Need 5 letters';return} const guess=grid[row].map(c=>c.textContent.toLowerCase()).join(''); const answerArr=answer.split(''); const state=Array(5).fill('miss'); for(let i=0;i<5;i++){if(guess[i]===answer[i]){state[i]='ok';answerArr[i]='*'}} for(let i=0;i<5;i++){if(state[i]==='ok')continue; const idx=answerArr.indexOf(guess[i]); if(idx!==-1){state[i]='mid';answerArr[idx]='*'}}
    state.forEach((s,i)=>{grid[row][i].classList.add(s); paintKey(grid[row][i].textContent,s)}); if(guess===answer){done=true;statusEl.textContent='You won!';hintEl.textContent='';return} row++; col=0; attemptsEl.textContent=row+' / 6'; if(row>=6){done=true;statusEl.textContent='Game over'; hintEl.textContent='Answer: '+answer.toUpperCase()} else {statusEl.textContent='Keep going'}}
  function paintKey(letter,state){[...kbd.querySelectorAll('.key')].forEach(btn=>{if(btn.textContent===letter){if(btn.classList.contains('ok'))return; if(btn.classList.contains('mid')&&state==='miss')return; btn.classList.remove('ok','mid','miss'); btn.classList.add(state)}})}
  window.addEventListener('keydown',(e)=>{if(done&&e.key==='Enter')return; if(e.key==='Backspace'){press('⌫');return} if(e.key==='Enter'){press('Enter');return} const k=e.key.toUpperCase(); if(/^[A-Z]$/.test(k))press(k)}); document.getElementById('newGame').onclick=reset; reset();
  </script></body></html>`;
}

function snakeTemplate(style = "modern") {
  const t = themeTokens(style);
  return `<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Playcraft Snake</title><style>:root{--bg:${t.bg};--panel:${t.panel};--ink:${t.ink};--sub:${t.sub};--accent:${t.accent};--accent2:${t.accent2}}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at top,color-mix(in srgb,var(--accent) 15%,var(--bg)),var(--bg) 56%);font-family:Inter,system-ui,Arial;color:var(--ink);padding:20px}.wrap{width:min(900px,100%);background:var(--panel);border-radius:28px;padding:22px;border:1px solid color-mix(in srgb,var(--accent) 18%, transparent);box-shadow:0 24px 70px rgba(0,0,0,.18)}.head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.title{font-size:40px;font-weight:1000}.sub{color:var(--sub)}.meta{display:flex;gap:10px;flex-wrap:wrap}.pill,.btn{padding:12px 16px;border-radius:16px;font-weight:900}.pill{background:color-mix(in srgb,var(--accent) 10%, var(--panel))}.btn{border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;cursor:pointer}.board{margin-top:18px;background:#0b1220;border-radius:24px;padding:14px}.grid{display:grid;grid-template-columns:repeat(22,1fr);gap:4px;aspect-ratio:22/14}.cell{border-radius:8px;background:rgba(255,255,255,.04)}.snake{background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 0 0 1px rgba(255,255,255,.08) inset}.food{background:linear-gradient(135deg,#fb7185,#f43f5e)}.foot{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px}.touch{display:none}@media(max-width:720px){.touch{display:flex;gap:8px;justify-content:center;margin-top:14px}.t{width:58px;height:58px;border:none;border-radius:18px;font-size:22px;font-weight:900;background:color-mix(in srgb,var(--accent) 18%, var(--panel));color:var(--ink)}}</style></head><body><div class="wrap"><div class="head"><div><div class="title">SNAKE</div><div class="sub">Use arrow keys or WASD. No input focus needed.</div></div><div class="meta"><div class="pill" id="score">Score 0</div><button class="btn" id="restart">Restart</button></div></div><div class="board"><div class="grid" id="grid"></div></div><div class="touch"><button class="t" data-d="U">↑</button><button class="t" data-d="L">←</button><button class="t" data-d="D">↓</button><button class="t" data-d="R">→</button></div><div class="foot"><div class="sub" id="status">Eat the food. Avoid walls and yourself.</div><div class="sub">Playcraft polished template</div></div></div><script>const W=22,H=14;const grid=document.getElementById('grid');const cells=[];for(let i=0;i<W*H;i++){const d=document.createElement('div');d.className='cell';grid.appendChild(d);cells.push(d)}let snake,dir,nextDir,food,score,timer;function idx(x,y){return y*W+x}function spawnFood(){do{food={x:Math.floor(Math.random()*W),y:Math.floor(Math.random()*H)}}while(snake.some(s=>s.x===food.x&&s.y===food.y))}function reset(){snake=[{x:7,y:7},{x:6,y:7},{x:5,y:7}];dir='R';nextDir='R';score=0;document.getElementById('score').textContent='Score '+score;document.getElementById('status').textContent='Eat the food. Avoid walls and yourself.';spawnFood();clearInterval(timer);timer=setInterval(tick,120);draw()}function turn(d){const bad={L:'R',R:'L',U:'D',D:'U'}; if(bad[dir]!==d) nextDir=d}function tick(){dir=nextDir;const head={...snake[0]}; if(dir==='R')head.x++; if(dir==='L')head.x--; if(dir==='U')head.y--; if(dir==='D')head.y++; if(head.x<0||head.y<0||head.x>=W||head.y>=H||snake.some(s=>s.x===head.x&&s.y===head.y)){document.getElementById('status').textContent='Game over'; clearInterval(timer); return} snake.unshift(head); if(head.x===food.x&&head.y===food.y){score++;document.getElementById('score').textContent='Score '+score; spawnFood()} else snake.pop(); draw()}function draw(){cells.forEach(c=>c.className='cell'); snake.forEach(p=>cells[idx(p.x,p.y)].classList.add('snake')); cells[idx(food.x,food.y)].classList.add('food')}window.addEventListener('keydown',e=>{const k=e.key.toLowerCase(); if(k==='arrowup'||k==='w')turn('U'); if(k==='arrowdown'||k==='s')turn('D'); if(k==='arrowleft'||k==='a')turn('L'); if(k==='arrowright'||k==='d')turn('R')}); document.querySelectorAll('.t').forEach(b=>b.onclick=()=>turn(b.dataset.d)); document.getElementById('restart').onclick=reset; reset();</script></body></html>`;
}

function runnerTemplate(style = "modern") {
  const t = themeTokens(style);
  return `<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Playcraft Runner</title><style>:root{--bg:${t.bg};--panel:${t.panel};--ink:${t.ink};--sub:${t.sub};--accent:${t.accent};--accent2:${t.accent2}}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 16%, var(--bg)),var(--bg));font-family:Inter,system-ui,Arial;color:var(--ink)}.box{width:min(980px,100%);background:var(--panel);border-radius:28px;padding:20px;border:1px solid color-mix(in srgb,var(--accent) 18%, transparent);box-shadow:0 24px 70px rgba(0,0,0,.18)}.head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.title{font-size:40px;font-weight:1000}.sub{color:var(--sub)}.btn{border:none;border-radius:16px;padding:12px 16px;font-weight:900;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;cursor:pointer}.pill{padding:10px 14px;border-radius:999px;background:color-mix(in srgb,var(--accent) 10%, var(--panel));font-weight:800}.scene{margin-top:18px;position:relative;border-radius:24px;overflow:hidden;aspect-ratio:16/9;background:linear-gradient(180deg,#bae6fd 0%,#dbeafe 55%,#fef3c7 56%,#f59e0b 100%)}canvas{width:100%;height:100%;display:block}</style></head><body><div class="box"><div class="head"><div><div class="title">RUNNER</div><div class="sub">Press Space / Arrow Up to jump.</div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><div class="pill" id="score">0</div><button class="btn" id="restart">Restart</button></div></div><div class="scene"><canvas id="c" width="1280" height="720"></canvas></div></div><script>const c=document.getElementById('c'),x=c.getContext('2d');let player,obs,score,spd,alive;function reset(){player={x:150,y:530,w:70,h:90,vy:0,on:true};obs=[];score=0;spd=11;alive=true;document.getElementById('score').textContent='0'}function jump(){if(player.on){player.vy=-25;player.on=false}}function spawn(){obs.push({x:1280+Math.random()*260,w:40+Math.random()*60,h:60+Math.random()*120})}setInterval(()=>alive&&spawn(),1200);function tick(){x.clearRect(0,0,c.width,c.height);x.fillStyle='#7dd3fc';x.fillRect(0,0,c.width,420);x.fillStyle='#fef3c7';x.fillRect(0,420,c.width,300); x.fillStyle='rgba(255,255,255,.55)';for(let i=0;i<4;i++){x.fillRect((i*330+(Date.now()/25)%330)-120,90+Math.sin(Date.now()/800+i)*10,120,30)} player.vy+=1.25; player.y+=player.vy; if(player.y>530){player.y=530;player.vy=0;player.on=true} x.fillStyle='#1f2937'; x.fillRect(player.x,player.y,player.w,player.h); x.fillStyle='#fff'; x.fillRect(player.x+44,player.y+16,10,10); obs.forEach(o=>o.x-=spd); obs=obs.filter(o=>o.x+o.w>-20); for(const o of obs){x.fillStyle='#334155';x.fillRect(o.x,620-o.h,o.w,o.h); if(player.x<o.x+o.w&&player.x+player.w>o.x&&player.y+player.h>620-o.h){alive=false}} if(alive){score+=0.1;spd=Math.min(18,11+score/180);document.getElementById('score').textContent=Math.floor(score)} else {x.fillStyle='rgba(0,0,0,.45)';x.fillRect(0,0,c.width,c.height);x.fillStyle='#fff';x.font='bold 56px Inter';x.fillText('Game over',460,270);x.font='24px Inter';x.fillText('Press Restart to try again',472,320)} requestAnimationFrame(tick)}window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(k===' '||k==='arrowup'||k==='w'){e.preventDefault();jump()}});document.getElementById('restart').onclick=reset;reset();tick();</script></body></html>`;
}

function platformerTemplate(style = "modern") {
  const t = themeTokens(style);
  return `<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Playcraft Platformer</title><style>:root{--bg:${t.bg};--panel:${t.panel};--ink:${t.ink};--sub:${t.sub};--accent:${t.accent};--accent2:${t.accent2}}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at top,color-mix(in srgb,var(--accent) 14%, var(--bg)),var(--bg) 58%);font-family:Inter,system-ui,Arial;color:var(--ink)}.box{width:min(980px,100%);background:var(--panel);border:1px solid color-mix(in srgb,var(--accent) 18%, transparent);border-radius:28px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.18)}.head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.title{font-size:38px;font-weight:1000}.sub{color:var(--sub)}.btn{border:none;border-radius:16px;padding:12px 16px;font-weight:900;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;cursor:pointer}canvas{margin-top:18px;width:100%;aspect-ratio:16/9;background:linear-gradient(180deg,#a5f3fc,#d9f99d);border-radius:22px;display:block}</style></head><body><div class="box"><div class="head"><div><div class="title">PLATFORMER</div><div class="sub">Move with arrows/WASD. Jump with Space.</div></div><button class="btn" id="restart">Restart</button></div><canvas id="c" width="1280" height="720"></canvas></div><script>const c=document.getElementById('c'),x=c.getContext('2d');const keys={};let p,plats,goal,won;function reset(){p={x:80,y:560,w:52,h:72,vx:0,vy:0,on:false};plats=[{x:0,y:650,w:1280,h:70},{x:220,y:560,w:180,h:22},{x:470,y:490,w:180,h:22},{x:750,y:420,w:180,h:22},{x:1010,y:350,w:140,h:22}];goal={x:1090,y:290,w:40,h:60};won=false}function step(){x.clearRect(0,0,c.width,c.height); x.fillStyle='#86efac'; x.fillRect(0,630,1280,90); p.vx=(keys['arrowleft']||keys['a']?-7:0)+(keys['arrowright']||keys['d']?7:0); if((keys[' ']||keys['arrowup']||keys['w'])&&p.on){p.vy=-19;p.on=false} p.vy+=1.05; p.x+=p.vx; p.y+=p.vy; p.on=false; plats.forEach(pl=>{if(p.x+p.w>pl.x&&p.x<pl.x+pl.w&&p.y+p.h>pl.y&&p.y+p.h<pl.y+30&&p.vy>=0){p.y=pl.y-p.h;p.vy=0;p.on=true} x.fillStyle='#1f2937'; x.fillRect(pl.x,pl.y,pl.w,pl.h)}); p.x=Math.max(0,Math.min(1228,p.x)); if(p.y>740){p.x=80;p.y=560;p.vy=0} if(p.x+p.w>goal.x&&p.x<goal.x+goal.w&&p.y+p.h>goal.y&&p.y<goal.y+goal.h){won=true} x.fillStyle='#2563eb'; x.fillRect(p.x,p.y,p.w,p.h); x.fillStyle='#f59e0b'; x.fillRect(goal.x,goal.y,goal.w,goal.h); if(won){x.fillStyle='rgba(0,0,0,.35)';x.fillRect(0,0,1280,720);x.fillStyle='#fff';x.font='bold 58px Inter';x.fillText('You win!',510,280)} requestAnimationFrame(step)}window.addEventListener('keydown',e=>keys[e.key.toLowerCase()]=true);window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);document.getElementById('restart').onclick=reset;reset();step();</script></body></html>`;
}

function flappyTemplate(style = "modern") {
  const t = themeTokens(style);
  return `<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Playcraft Flappy</title><style>:root{--bg:${t.bg};--panel:${t.panel};--ink:${t.ink};--sub:${t.sub};--accent:${t.accent};--accent2:${t.accent2}}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 18%, var(--bg)),var(--bg));font-family:Inter,system-ui,Arial;color:var(--ink)}.box{width:min(900px,100%);background:var(--panel);border-radius:28px;padding:20px;border:1px solid color-mix(in srgb,var(--accent) 18%, transparent);box-shadow:0 24px 70px rgba(0,0,0,.18)}.head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.title{font-size:38px;font-weight:1000}.sub{color:var(--sub)}.pill,.btn{padding:10px 14px;border-radius:16px;font-weight:900}.pill{background:color-mix(in srgb,var(--accent) 10%, var(--panel))}.btn{border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;cursor:pointer}canvas{display:block;width:100%;aspect-ratio:16/9;background:linear-gradient(180deg,#7dd3fc,#dbeafe);border-radius:22px;margin-top:18px}</style></head><body><div class="box"><div class="head"><div><div class="title">FLAPPY</div><div class="sub">Click or press Space to flap.</div></div><div style="display:flex;gap:10px"><div class="pill" id="score">0</div><button class="btn" id="restart">Restart</button></div></div><canvas id="c" width="1280" height="720"></canvas></div><script>const c=document.getElementById('c'),x=c.getContext('2d');let bird,pipes,score,alive;function reset(){bird={x:220,y:320,r:24,vy:0};pipes=[];score=0;alive=true;document.getElementById('score').textContent='0'}function flap(){if(alive)bird.vy=-12}setInterval(()=>{if(alive)pipes.push({x:1280,gapY:160+Math.random()*300,gapH:180,w:90,passed:false})},1450);function tick(){x.clearRect(0,0,c.width,c.height);x.fillStyle='#fde68a';x.fillRect(0,620,1280,100); if(alive){bird.vy+=0.7;bird.y+=bird.vy} x.fillStyle='#22c55e'; pipes.forEach(p=>{p.x-=7;x.fillRect(p.x,0,p.w,p.gapY);x.fillRect(p.x,p.gapY+p.gapH,p.w,720-(p.gapY+p.gapH)); if(!p.passed&&p.x+p.w<bird.x){p.passed=true;score++;document.getElementById('score').textContent=score} if(bird.x+bird.r>p.x&&bird.x-bird.r<p.x+p.w&&(bird.y-bird.r<p.gapY||bird.y+bird.r>p.gapY+p.gapH)){alive=false}}); pipes=pipes.filter(p=>p.x+p.w>-20); x.fillStyle='#f59e0b';x.beginPath();x.arc(bird.x,bird.y,bird.r,0,Math.PI*2);x.fill(); x.fillStyle='#111827';x.beginPath();x.arc(bird.x+8,bird.y-5,4,0,Math.PI*2);x.fill(); if(bird.y>690||bird.y<0)alive=false; if(!alive){x.fillStyle='rgba(0,0,0,.35)';x.fillRect(0,0,1280,720);x.fillStyle='#fff';x.font='bold 60px Inter';x.fillText('Game over',470,280)} requestAnimationFrame(tick)}window.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();flap()}});c.addEventListener('pointerdown',flap);document.getElementById('restart').onclick=reset;reset();tick();</script></body></html>`;
}

function racerTemplate(style = "modern") {
  const t = themeTokens(style);
  return `<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Playcraft Racer</title><style>:root{--bg:${t.bg};--panel:${t.panel};--ink:${t.ink};--sub:${t.sub};--accent:${t.accent};--accent2:${t.accent2}}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at top,color-mix(in srgb,var(--accent) 16%, var(--bg)),var(--bg));font-family:Inter,system-ui,Arial;color:var(--ink)}.box{width:min(960px,100%);background:var(--panel);border:1px solid color-mix(in srgb,var(--accent) 18%, transparent);border-radius:28px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.18)}.head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.title{font-size:38px;font-weight:1000}.sub{color:var(--sub)}.btn{border:none;border-radius:16px;padding:12px 16px;font-weight:900;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;cursor:pointer}canvas{display:block;width:100%;aspect-ratio:16/9;background:#111827;border-radius:22px;margin-top:18px}</style></head><body><div class="box"><div class="head"><div><div class="title">RACER</div><div class="sub">Arrow keys or A/D to steer.</div></div><button class="btn" id="restart">Restart</button></div><canvas id="c" width="1280" height="720"></canvas></div><script>const c=document.getElementById('c'),x=c.getContext('2d');const keys={};let car,enemies,score,alive,roadY;function reset(){car={x:640,y:580,w:80,h:120};enemies=[];score=0;alive=true;roadY=0}setInterval(()=>alive&&enemies.push({x:[420,560,700,840][Math.floor(Math.random()*4)],y:-140,w:80,h:120,s:8+Math.random()*6}),800);function tick(){x.clearRect(0,0,c.width,c.height);x.fillStyle='#374151';x.fillRect(320,0,640,720);x.strokeStyle='rgba(255,255,255,.55)';x.lineWidth=10;roadY=(roadY+18)%120;for(let y=-120;y<840;y+=120){x.beginPath();x.moveTo(640,y+roadY);x.lineTo(640,y+60+roadY);x.stroke()}if((keys['arrowleft']||keys['a'])&&car.x>360)car.x-=10;if((keys['arrowright']||keys['d'])&&car.x<860)car.x+=10;x.fillStyle='#60a5fa';x.fillRect(car.x,car.y,car.w,car.h);enemies.forEach(e=>{e.y+=e.s;x.fillStyle='#ef4444';x.fillRect(e.x,e.y,e.w,e.h);if(car.x<e.x+e.w&&car.x+car.w>e.x&&car.y<e.y+e.h&&car.y+car.h>e.y)alive=false});enemies=enemies.filter(e=>{if(e.y<820)return true;score++;return false});x.fillStyle='#fff';x.font='bold 30px Inter';x.fillText('Score: '+score,40,50);if(!alive){x.fillStyle='rgba(0,0,0,.45)';x.fillRect(0,0,1280,720);x.fillStyle='#fff';x.font='bold 58px Inter';x.fillText('Crash!',540,280)}requestAnimationFrame(tick)}window.addEventListener('keydown',e=>keys[e.key.toLowerCase()]=true);window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);document.getElementById('restart').onclick=reset;reset();tick();</script></body></html>`;
}

function horrorTemplate(style = "horror") {
  const t = themeTokens(style === "modern" ? "horror" : style);
  return `<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Playcraft Horror Maze</title><style>:root{--bg:${t.bg};--panel:${t.panel};--ink:${t.ink};--sub:${t.sub};--accent:${t.accent};--accent2:${t.accent2}}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:18px;background:#000;color:var(--ink);font-family:Inter,system-ui,Arial}.box{width:min(960px,100%);background:var(--panel);border:1px solid #2b0e0e;border-radius:28px;padding:18px;box-shadow:0 30px 80px rgba(0,0,0,.6)}.head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.title{font-size:36px;font-weight:1000}.sub{color:var(--sub)}.pill,.btn{padding:10px 14px;border-radius:16px;font-weight:900}.pill{background:#1a1a1a}.btn{border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;cursor:pointer}canvas{display:block;width:100%;aspect-ratio:16/9;border-radius:22px;background:#050505;margin-top:18px}</style></head><body><div class="box"><div class="head"><div><div class="title">HORROR MAZE</div><div class="sub">Find the exit. Avoid the hunter.</div></div><div style="display:flex;gap:10px"><div class="pill" id="status">Alive</div><button class="btn" id="restart">Restart</button></div></div><canvas id="c" width="1280" height="720"></canvas></div><script>const c=document.getElementById('c'),x=c.getContext('2d');const cols=20,rows=12,cell=60;let walls,player,exitPos,ghost;function reset(){walls=new Set();for(let y=0;y<rows;y++){for(let x0=0;x0<cols;x0++){if(x0===0||y===0||x0===cols-1||y===rows-1||Math.random()<0.18)walls.add(x0+','+y)}}player={x:1,y:1};exitPos={x:cols-2,y:rows-2};walls.delete(player.x+','+player.y);walls.delete(exitPos.x+','+exitPos.y);ghost={x:cols-3,y:1};document.getElementById('status').textContent='Alive';draw()}function move(dx,dy){const nx=player.x+dx,ny=player.y+dy;if(!walls.has(nx+','+ny)){player.x=nx;player.y=ny}if(player.x===exitPos.x&&player.y===exitPos.y){document.getElementById('status').textContent='Escaped!'}if(player.x===ghost.x&&player.y===ghost.y){document.getElementById('status').textContent='Caught'}draw()}function tick(){if(ghost.x<player.x&&!walls.has((ghost.x+1)+','+ghost.y))ghost.x++;else if(ghost.x>player.x&&!walls.has((ghost.x-1)+','+ghost.y))ghost.x--;else if(ghost.y<player.y&&!walls.has(ghost.x+','+(ghost.y+1)))ghost.y++;else if(ghost.y>player.y&&!walls.has(ghost.x+','+(ghost.y-1)))ghost.y--;if(player.x===ghost.x&&player.y===ghost.y)document.getElementById('status').textContent='Caught';draw()}function draw(){x.fillStyle='#050505';x.fillRect(0,0,c.width,c.height);for(let y=0;y<rows;y++){for(let x0=0;x0<cols;x0++){const px=x0*cell+40,py=y*cell+40;if(walls.has(x0+','+y)){x.fillStyle='#171717';x.fillRect(px,py,cell-8,cell-8)}}}const glow=(cx,cy,color,r)=>{const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');x.fillStyle=g;x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.fill()};glow(exitPos.x*cell+70,exitPos.y*cell+70,'rgba(34,197,94,.65)',50);glow(ghost.x*cell+70,ghost.y*cell+70,'rgba(239,68,68,.55)',64);glow(player.x*cell+70,player.y*cell+70,'rgba(255,255,255,.22)',120);x.fillStyle='#fafafa';x.beginPath();x.arc(player.x*cell+70,player.y*cell+70,18,0,Math.PI*2);x.fill();x.fillStyle='#ef4444';x.beginPath();x.arc(ghost.x*cell+70,ghost.y*cell+70,18,0,Math.PI*2);x.fill();x.fillStyle='#22c55e';x.fillRect(exitPos.x*cell+54,exitPos.y*cell+54,32,32)}window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(k==='w'||k==='arrowup')move(0,-1);if(k==='s'||k==='arrowdown')move(0,1);if(k==='a'||k==='arrowleft')move(-1,0);if(k==='d'||k==='arrowright')move(1,0)});document.getElementById('restart').onclick=reset;reset();setInterval(tick,520);</script></body></html>`;
}

function shooterTemplate(style = "modern") {
  const t = themeTokens(style);
  return `<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Playcraft Shooter</title><style>:root{--bg:${t.bg};--panel:${t.panel};--ink:${t.ink};--sub:${t.sub};--accent:${t.accent};--accent2:${t.accent2}}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at top,color-mix(in srgb,var(--accent) 14%, var(--bg)),var(--bg));font-family:Inter,system-ui,Arial;color:var(--ink)}.box{width:min(980px,100%);background:var(--panel);border-radius:28px;padding:20px;border:1px solid color-mix(in srgb,var(--accent) 18%, transparent);box-shadow:0 24px 70px rgba(0,0,0,.18)}.head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.title{font-size:38px;font-weight:1000}.sub{color:var(--sub)}.btn{border:none;border-radius:16px;padding:12px 16px;font-weight:900;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;cursor:pointer}canvas{display:block;width:100%;aspect-ratio:16/9;background:#0b1020;border-radius:22px;margin-top:18px}</style></head><body><div class="box"><div class="head"><div><div class="title">SHOOTER</div><div class="sub">Move with arrows/WASD. Space to shoot.</div></div><button class="btn" id="restart">Restart</button></div><canvas id="c" width="1280" height="720"></canvas></div><script>const c=document.getElementById('c'),x=c.getContext('2d');const keys={};let p,shots,enemies,score,alive;function reset(){p={x:610,y:620,w:60,h:60};shots=[];enemies=[];score=0;alive=true}setInterval(()=>alive&&enemies.push({x:80+Math.random()*1120,y:-60,w:50,h:50,s:2+Math.random()*4}),700);function shoot(){if(alive)shots.push({x:p.x+p.w/2-4,y:p.y,w:8,h:18})}function tick(){x.clearRect(0,0,c.width,c.height);x.fillStyle='#0b1020';x.fillRect(0,0,1280,720);if((keys['arrowleft']||keys['a'])&&p.x>0)p.x-=9;if((keys['arrowright']||keys['d'])&&p.x<1220)p.x+=9;if((keys['arrowup']||keys['w'])&&p.y>0)p.y-=7;if((keys['arrowdown']||keys['s'])&&p.y<660)p.y+=7;shots.forEach(s=>s.y-=12);shots=shots.filter(s=>s.y>-30);enemies.forEach(e=>e.y+=e.s);x.fillStyle='#60a5fa';x.fillRect(p.x,p.y,p.w,p.h);x.fillStyle='#fbbf24';shots.forEach(s=>x.fillRect(s.x,s.y,s.w,s.h));enemies.forEach(e=>{x.fillStyle='#f43f5e';x.fillRect(e.x,e.y,e.w,e.h);if(p.x<e.x+e.w&&p.x+p.w>e.x&&p.y<e.y+e.h&&p.y+p.h>e.y)alive=false});for(const s of shots){for(const e of enemies){if(s.x<e.x+e.w&&s.x+s.w>e.x&&s.y<e.y+e.h&&s.y+s.h>e.y){e.dead=true;s.dead=true;score++}}}shots=shots.filter(s=>!s.dead);enemies=enemies.filter(e=>!e.dead&&e.y<760);x.fillStyle='#fff';x.font='bold 28px Inter';x.fillText('Score: '+score,30,50);if(!alive){x.fillStyle='rgba(0,0,0,.45)';x.fillRect(0,0,1280,720);x.fillStyle='#fff';x.font='bold 58px Inter';x.fillText('Game over',480,280)} requestAnimationFrame(tick)}window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys[k]=true;if(k===' ')shoot()});window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);document.getElementById('restart').onclick=reset;reset();tick();</script></body></html>`;
}

function knownTemplateFor(text: string, style: string) {
  if (/wordle|וורדל/i.test(text)) return { title: isHebrew(text) ? "וורדל יפה" : "Beautiful Wordle", summary: isHebrew(text) ? "הכנתי וורדל מסודר עם מקלדת פיזית, מקלדת על המסך, Enter, מחיקה, ניצחון והפסד." : "I built a polished Wordle with physical keyboard support, on-screen keyboard, enter, backspace, win and lose states.", html: wordleTemplate(style) };
  if (/snake|סנייק/i.test(text)) return { title: isHebrew(text) ? "סנייק יפה" : "Beautiful Snake", summary: isHebrew(text) ? "הכנתי סנייק יפה ומסודר עם שליטה מלאה, ניקוד ואתחול." : "I built a polished Snake game with controls, score, and restart.", html: snakeTemplate(style) };
  if (/runner|ראנר|רץ/i.test(text)) return { title: isHebrew(text) ? "ראנר יפה" : "Beautiful Runner", summary: isHebrew(text) ? "הכנתי ראנר מסודר עם קפיצה, ניקוד ואתחול." : "I built a polished runner with jump, score, and restart.", html: runnerTemplate(style) };
  if (/platformer|פלטפורמה|מריו/i.test(text)) return { title: isHebrew(text) ? "פלטפורמר יפה" : "Beautiful Platformer", summary: isHebrew(text) ? "הכנתי משחק פלטפורמה מסודר עם תנועה, קפיצה וניצחון." : "I built a polished platformer with movement, jump, and a win condition.", html: platformerTemplate(style) };
  if (/horror|maze|אימה|מבוך/i.test(text)) return { title: isHebrew(text) ? "מבוך אימה" : "Horror Maze", summary: isHebrew(text) ? "הכנתי מבוך אימה עם שליטה מהמקלדת, אויב, יציאה ואתחול." : "I built a horror maze with keyboard control, an enemy, an exit, and restart.", html: horrorTemplate(style) };
  if (/flappy|bird/i.test(text)) return { title: "Flappy", summary: isHebrew(text) ? "הכנתי משחק קפיצות בסגנון פלפי עם ניקוד ואתחול." : "I built a flappy-style game with score and restart.", html: flappyTemplate(style) };
  if (/racing|car|race|מירוץ|מכוניות/i.test(text)) return { title: isHebrew(text) ? "מירוץ יפה" : "Beautiful Racer", summary: isHebrew(text) ? "הכנתי משחק מירוצים מסודר עם שליטה מהמקלדת ואתחול." : "I built a polished racer with keyboard steering and restart.", html: racerTemplate(style) };
  if (/shooter|shoot|יריות/i.test(text)) return { title: isHebrew(text) ? "משחק יריות" : "Shooter", summary: isHebrew(text) ? "הכנתי משחק יריות מסודר עם שליטה מהמקלדת וניקוד." : "I built a polished shooter with keyboard control and score.", html: shooterTemplate(style) };
  return null;
}

function selfCheckHtml(html: string) {
  const lower = html.toLowerCase();
  const score = ["<html", "<script", "restart", "keydown", "body", "title"].reduce((acc, token) => acc + (lower.includes(token) ? 1 : 0), 0);
  return score >= 5 && html.length > 2500;
}

async function buildGame(userText: string, files: FilePart[], memory: ProjectMemory, designPreset?: string) {
  const style = inferGameStyle(userText, memory);
  const template = knownTemplateFor(userText, style);
  if (template) return template;

  const refNotes = await analyzeReferenceImages(files, userText, designPreset || memory?.designPreset);
  const planPrompt = `User request: ${userText}\n\nGame style: ${style}\nDesign preset: ${designPreset || memory?.designPreset || "none"}\nProject memory: ${JSON.stringify(memory || {})}\nReference notes: ${refNotes || "none"}\n\nBuild a beautiful, polished game. Strong logic matters. Avoid placeholders.`;

  const out = await groqChat([
    { role: "system", content: SYS_GAME },
    { role: "user", content: planPrompt },
  ], { model: HEAVY_MODEL, temperature: 0.45, responseFormat: { type: "json_object" } });

  if ((out as any).error) {
    return { title: isHebrew(userText) ? "משחק חדש" : "New game", summary: isHebrew(userText) ? "המודל לא החזיר תוצאה טובה, אז החזרתי fallback מסודר." : "The model did not return a strong result, so I used a polished fallback.", html: snakeTemplate(style) };
  }

  try {
    const parsed = JSON.parse(String((out as any).text || "{}"));
    let html = String(parsed.html || "");
    if (!selfCheckHtml(html)) {
      const fix = await groqChat([
        { role: "system", content: SYS_GAME },
        { role: "user", content: `Fix and improve this HTML game. Make the logic stronger and the UI more beautiful. Return strict JSON with summary,title,html.\n\n${html}` },
      ], { model: HEAVY_MODEL, temperature: 0.25, responseFormat: { type: "json_object" } });
      if (!(fix as any).error) {
        try {
          const fixed = JSON.parse(String((fix as any).text || "{}"));
          if (selfCheckHtml(String(fixed.html || ""))) {
            html = String(fixed.html);
            parsed.summary = fixed.summary || parsed.summary;
            parsed.title = fixed.title || parsed.title;
          }
        } catch {}
      }
    }
    if (!selfCheckHtml(html)) throw new Error("Weak html");
    return { title: sanitizeTitle(String(parsed.title || "Custom game"), "Custom game"), summary: String(parsed.summary || (isHebrew(userText) ? "הכנתי משחק יפה ומסודר." : "I built a polished game.")), html };
  } catch {
    return { title: isHebrew(userText) ? "משחק חדש" : "New game", summary: isHebrew(userText) ? "המודל החזיר פורמט לא תקין, אז החזרתי fallback מסודר." : "The model returned an invalid format, so I used a polished fallback.", html: snakeTemplate(style) };
  }
}

async function generalReply(messages: IncomingMessage[], mode?: string, memory?: ProjectMemory, designPreset?: string) {
  const userText = latestUserText(messages);
  const files = latestUserFiles(messages);
  const refs = await analyzeReferenceImages(files, userText, designPreset || memory?.designPreset);
  const txtFiles = textFiles(files);
  const mapped: any[] = [{ role: "system", content: SYS_CHAT + (memory ? `\nProject memory: ${JSON.stringify(memory).slice(0, 2200)}` : "") }];
  for (const m of messages.slice(-12)) {
    if (m.role === "assistant") mapped.push({ role: "assistant", content: m.content || "" });
    else mapped.push({ role: "user", content: m.content || "" });
  }
  if (refs) mapped.push({ role: "system", content: `Reference image analysis for the latest request: ${refs}` });
  if (txtFiles.length) mapped.push({ role: "system", content: `Attached text files:\n${txtFiles.map((f) => `--- ${f.name || "file"} ---\n${String(f.text || "").slice(0, 14000)}`).join("\n\n")}` });
  const out = await groqChat(mapped, { model: DEFAULT_MODEL, temperature: 0.35 });
  if ((out as any).error) return { reply: (out as any).error, title: sanitizeTitle(userText, "New chat") };
  const reply = String((out as any).text || "").trim();
  return { reply, title: await summarizeTitle(userText, reply) };
}

async function studyReply(messages: IncomingMessage[], studyMode?: string, memory?: ProjectMemory) {
  const userText = latestUserText(messages);
  const files = latestUserFiles(messages);
  const txtFiles = textFiles(files);
  const out = await groqChat([
    { role: "system", content: SYS_STUDY + (memory ? `\nProject memory: ${JSON.stringify(memory).slice(0, 1800)}` : "") },
    { role: "user", content: `Study mode: ${studyMode || "general"}\n\nRequest: ${userText}\n\n${txtFiles.map((f) => `--- ${f.name || "file"} ---\n${String(f.text || "").slice(0, 14000)}`).join("\n\n")}` },
  ], { model: DEFAULT_MODEL, temperature: 0.3 });
  if ((out as any).error) return { reply: (out as any).error, title: sanitizeTitle(userText, "Study") };
  const reply = String((out as any).text || "").trim();
  return { reply, title: await summarizeTitle(userText, reply) };
}

async function codeReply(messages: IncomingMessage[], codeMode?: string, memory?: ProjectMemory, designPreset?: string) {
  const userText = latestUserText(messages);
  const files = latestUserFiles(messages);
  const txtFiles = textFiles(files);
  const refs = await analyzeReferenceImages(files, userText, designPreset || memory?.designPreset);
  const effectiveMode = inferCodeMode(userText, codeMode);
  const wantsMultiple = /(multiple files|כמה קבצים|multi file|multi-file|פרויקט שלם|full project)/i.test(userText);

  const prompt = `Code mode: ${effectiveMode}\nRequest: ${userText}\nProject memory: ${JSON.stringify(memory || {})}\nReference notes: ${refs || "none"}\n\n${txtFiles.map((f) => `--- ${f.name || "file"} ---\n${String(f.text || "").slice(0, 15000)}`).join("\n\n")}`;

  if (wantsMultiple) {
    const out = await groqChat([
      { role: "system", content: SYS_CODE },
      { role: "user", content: `${prompt}\n\nReturn strict JSON with keys summary, title, files. Each file must have name, mime, content.` },
    ], { model: HEAVY_MODEL, temperature: 0.25, responseFormat: { type: "json_object" } });
    if ((out as any).error) return { reply: (out as any).error, title: sanitizeTitle(userText, "Code") };
    try {
      const parsed = JSON.parse(String((out as any).text || "{}"));
      const filesOut = Array.isArray(parsed.files) ? parsed.files.filter((f: any) => f?.name && f?.content).slice(0, 8) : [];
      if (!filesOut.length) throw new Error("No files");
      const storedFiles = await persistMany(filesOut.map((f: any) => ({ name: String(f.name), mime: String(f.mime || "text/plain"), content: String(f.content) })));
      return {
        reply: String(parsed.summary || (isHebrew(userText) ? "הכנתי כמה קבצים מסודרים לפרויקט." : "I created a clean multi-file project.")),
        title: sanitizeTitle(String(parsed.title || "Project files"), "Project files"),
        files: storedFiles.map((f) => ({ ...f, openUrl: f.url, publishUrl: f.url })),
      };
    } catch {
      return { reply: isHebrew(userText) ? "לא הצלחתי לבנות כמה קבצים הפעם, אז תיארתי את הפתרון בטקסט. תנסה שוב עם בקשה יותר מדויקת." : "I could not build multiple files cleanly this time, so I answered in text. Try again with a more specific request.", title: sanitizeTitle(userText, "Code") };
    }
  }

  const out = await groqChat([
    { role: "system", content: SYS_CODE },
    { role: "user", content: prompt },
  ], { model: HEAVY_MODEL, temperature: 0.25 });
  if ((out as any).error) return { reply: (out as any).error, title: sanitizeTitle(userText, "Code") };
  const reply = String((out as any).text || "").trim();
  return { reply, title: await summarizeTitle(userText, reply) };
}

function imageReply(userText: string, memory?: ProjectMemory, designPreset?: string) {
  const clean = userText.replace(/^(create image|generate image|make image|צור תמונה|תיצור תמונה|תעשה תמונה|תייצר תמונה)\s*/i, "") || "beautiful concept art";
  const style = [designPreset, memory?.designPreset, memory?.style].filter(Boolean).join(", ");
  const prompt = encodeURIComponent(`${clean}${style ? `, style: ${style}` : ""}`);
  const seed = Math.floor(Math.random() * 1000000);
  return {
    reply: isHebrew(userText) ? "יצרתי לך תמונה. אפשר לפתוח או להוריד אותה." : "I created an image for you. You can open or download it.",
    image: { name: "playcraft-image.png", url: `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&seed=${seed}&nologo=true`, openUrl: `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&seed=${seed}&nologo=true`, publishUrl: `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&seed=${seed}&nologo=true` },
    title: isHebrew(userText) ? "יצירת תמונה" : "Image creation",
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RouteBody;
    const messages = body.messages || [];
    const userText = latestUserText(messages);
    const files = latestUserFiles(messages);
    const memory = body.projectMemory || {};

    if (!userText && !files.length) {
      return NextResponse.json({ reply: isHebrew(userText) ? "כתוב לי או דבר איתי כדי להתחיל." : "Type or talk to start.", title: "New chat" });
    }

    const route = await routeIntent(messages, body);
    if (route?.clarify) {
      return NextResponse.json({ reply: route.clarify_question || (isHebrew(userText) ? "יש פרט אחד חשוב שחסר לי. תוכל לחדד?" : "I need one important missing detail. Could you clarify?"), title: sanitizeTitle(userText, "New chat") });
    }

    if (route.intent === "image") {
      return NextResponse.json(imageReply(userText, memory, body.designPreset));
    }

    if (route.intent === "game") {
      if (route.output === "code") {
        const code = await codeReply(messages, "code-only", { ...memory, gameStyle: body.gameStyle || memory.gameStyle }, body.designPreset);
        return NextResponse.json(code);
      }
      const built = await buildGame(userText, files, { ...memory, gameStyle: body.gameStyle || memory.gameStyle }, body.designPreset);
      const title = await summarizeTitle(userText, built.summary);
      const stored = await persistPublicFile(htmlFile(`${sanitizeTitle(built.title, "playcraft-game")}.html`, built.html));
      return NextResponse.json({ reply: built.summary, title, file: { ...stored, openUrl: stored.url, publishUrl: stored.url } });
    }

    if (route.intent === "code") {
      const code = await codeReply(messages, body.codeMode, memory, body.designPreset);
      return NextResponse.json(code);
    }

    if (route.intent === "study") {
      const study = await studyReply(messages, body.studyMode, memory);
      return NextResponse.json(study);
    }

    const general = await generalReply(messages, body.mode, memory, body.designPreset);
    return NextResponse.json(general);
  } catch (error: any) {
    return NextResponse.json({ reply: `⚠️ ${error?.message || "Request failed."}`, title: "Playcraft" }, { status: 500 });
  }
}
