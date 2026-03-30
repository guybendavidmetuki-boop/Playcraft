import { NextResponse } from "next/server";

export const runtime = "nodejs";

type InFile = {
  kind: "image" | "text";
  mime?: string;
  base64?: string;
  text?: string;
  name?: string;
  truncated?: boolean;
};

type ApiMessage = {
  role: "user" | "assistant";
  text?: string;
  mode?: string;
  files?: InFile[];
};

type OutFile = { name: string; content: string; mime: string };

function clean(text: string) {
  return (text || "").replace(/\u0000/g, "").trim();
}

function hasHebrew(text: string) {
  return /[\u0590-\u05FF]/.test(text || "");
}

function guessMime(name: string) {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".html")) return "text/html;charset=utf-8";
  if (lower.endsWith(".css")) return "text/css;charset=utf-8";
  if (lower.endsWith(".js")) return "text/javascript;charset=utf-8";
  if (lower.endsWith(".json")) return "application/json;charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml;charset=utf-8";
  if (lower.endsWith(".md")) return "text/markdown;charset=utf-8";
  return "text/plain;charset=utf-8";
}

function extractTag(text: string, tag: string) {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`, "i"));
  return match ? match[1].trim() : "";
}

function extractFiles(text: string) {
  const files: OutFile[] = [];
  const regex = /<file\s+name="([^"]+)"(?:\s+mime="([^"]+)")?>([\s\S]*?)<\/file>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    files.push({
      name: match[1],
      mime: match[2] || guessMime(match[1]),
      content: match[3].trim(),
    });
  }
  return {
    files,
    text: text.replace(regex, "").replace(/<image_prompt>[\s\S]*?<\/image_prompt>/gi, "").trim(),
  };
}

function latestUserText(messages: ApiMessage[]) {
  const user = [...messages].reverse().find((m) => m.role === "user");
  const parts: string[] = [];
  if (user?.text) parts.push(user.text);
  for (const f of user?.files || []) {
    if (f.kind === "text" && f.text) parts.push(f.text.slice(0, 5000));
  }
  return parts.join("\n\n");
}

function hasImageAttachment(messages: ApiMessage[]) {
  return messages.some((m) => (m.files || []).some((f) => f.kind === "image" && !!f.base64));
}

function wantsGame(text: string) {
  return /(game|wordle|snake|platformer|maze|arcade|rpg|tetris|runner|puzzle|horror|roguelike|vampire survivors|משחק|וורדל|סנייק|פלטפורמה|מבוך|אימה|פאזל|מרוץ|יריות)/i.test(text || "");
}

function wantsCode(text: string) {
  return /(code|source|snippet|arduino|esp32|javascript|typescript|react|html|css|js|ts|c\+\+|סקץ|קוד|ארדואינו|מקור)/i.test(text || "");
}

function wantsFileExplicit(text: string) {
  return /(file|download|zip|index\.html|project files|open in browser|קובץ|קבצים|להורדה|זיפ|html מלא|קובץ html)/i.test(text || "");
}

function wantsImageGeneration(mode: string, text: string, hasImage: boolean) {
  const explicit = /(create image|generate image|make an image|draw|illustration|artwork|צור תמונה|תיצור תמונה|תמונה חדשה|תצייר)/i.test(text || "");
  const designCopyIntent = /(like this|same style|match this|copy this design|based on this screenshot|same ui|כמו התמונה|כמו המסך|כמו זה|אותו עיצוב|אותו סגנון|תעתיק את העיצוב|תבנה לפי התמונה)/i.test(text || "");
  if (hasImage && designCopyIntent) return false;
  return mode === "image" || explicit;
}

function maybeWrapHtmlAsFile(text: string) {
  const codeMatch = text.match(/```(?:html)?\n([\s\S]*?)```/i);
  if (!codeMatch) return null;
  const code = codeMatch[1].trim();
  if (!/<html|<canvas|<script|<!doctype/i.test(code)) return null;
  return { name: "index.html", mime: "text/html;charset=utf-8", content: code };
}

function pollinationsUrl(prompt: string) {
  const q = encodeURIComponent(`${prompt}. beautiful, polished, vivid, premium quality, modern composition`);
  return `https://image.pollinations.ai/prompt/${q}?width=1024&height=1024&nologo=true`;
}

function buildMessages(messages: ApiMessage[]) {
  return messages.map((m) => {
    if (m.role === "assistant") return { role: "assistant", content: clean(m.text || "") };

    const parts: any[] = [];
    const textParts: string[] = [];
    if (m.mode && m.mode !== "chat") textParts.push(`Mode: ${m.mode}`);
    if (m.text) textParts.push(clean(m.text));

    for (const f of m.files || []) {
      if (f.kind === "image" && f.base64) {
        parts.push({
          type: "image_url",
          image_url: { url: `data:${f.mime || "image/jpeg"};base64,${f.base64}` },
        });
      } else if (f.kind === "text") {
        textParts.push(`Attached file: ${f.name}${f.truncated ? " (truncated)" : ""}\n\n${f.text || ""}`);
      }
    }

    const finalText = textParts.join("\n\n").trim() || "Hello";
    if (!parts.length) return { role: "user", content: finalText };
    return { role: "user", content: [{ type: "text", text: finalText }, ...parts] };
  });
}

async function callGroq({ apiKey, model, system, messages }: { apiKey: string; model: string; system: string; messages: any[] }) {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
      temperature: 0.28,
      max_completion_tokens: 4096,
      tools: model.startsWith("groq/compound") ? [{ type: "web_search" }] : undefined,
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || data?.message || "Groq request failed.");
  return clean(data?.choices?.[0]?.message?.content || "");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? (body.messages as ApiMessage[]) : [];
    const mode = String(body.mode || "chat");
    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || "groq/compound-mini";

    if (!apiKey || apiKey.length < 20) {
      return NextResponse.json({ error: "GROQ_API_KEY is missing or not real. Put your real Groq key in Vercel Environment Variables." }, { status: 400 });
    }

    const latestText = latestUserText(messages);
    const imageAttached = hasImageAttachment(messages);

    const languageRule = hasHebrew(latestText)
      ? "Reply in Hebrew unless the user explicitly asks for another language."
      : "Reply in the same language as the user. If the user writes in Hebrew, reply in Hebrew.";

    if (wantsImageGeneration(mode, latestText, imageAttached)) {
      const imagePrompt = latestText || (hasHebrew(latestText) ? "תמונה יפה" : "beautiful image");
      return NextResponse.json({
        text: hasHebrew(latestText) ? "הכנתי לך תמונה לפי הבקשה." : "I created an image based on your request.",
        files: [],
        imageUrl: pollinationsUrl(imagePrompt),
      });
    }

    const system = `You are Playcraft AI, a very strong assistant for chat, coding, games, design-copying from screenshots, ESP32, Arduino IDE, and web work.

${languageRule}

GLOBAL BEHAVIOR
- Be smart, practical, fast, and beautifully organized.
- Understand the user's intent automatically. Do not ask unnecessary questions if you can infer sensible defaults.
- If the user asks for current info, trends, examples, references, or inspiration, use web search when useful.
- If the user writes in Hebrew, keep the whole answer in Hebrew.
- Use clear sections, short paragraphs, and a neat structure.
- When giving code, the code must be production-like, clean, and not sloppy.

SCREENSHOT / DESIGN-COPY MODE
- If the user attached a screenshot, UI image, game image, or app mockup AND asks for a design, game, page, or code based on it, DO NOT try to create a new image.
- Instead, analyze the screenshot carefully and copy it as closely as possible in structure, spacing, component sizes, hierarchy, colors, alignment, mood, and polish.
- Mention briefly what you recognized from the screenshot, then build from it.
- Prefer exactness over generic creativity when the user asks for "like the screenshot".

GAMES
- For game requests, make the game as polished and beautiful as reasonably possible.
- Prioritize good UX, good logic, nice spacing, nice colors, responsive layout, smooth interactions, and a premium feel.
- The game should not feel like a rough prototype unless the user asks for something very simple.
- Default behavior for game requests: SHORT explanation first, then a downloadable/openable file.
- If the user explicitly asks for game code, return SHORT explanation + fenced code blocks instead of files.
- If the user explicitly asks for a file or html game, return a file.
- Prefer one self-contained index.html unless the user asks otherwise.
- Never explain the default behavior. Just do it.

WORDLE SPECIAL RULES
- If the user asks for Wordle or a Wordle-like game, make sure it includes:
  1) on-screen keyboard
  2) physical keyboard support
  3) Enter key support
  4) Backspace support
  5) proper guess validation flow
  6) win and lose states
  7) neat tile layout
  8) nice styling and animation
  9) clean mobile-friendly layout
- The logic must feel complete, not half-broken.

ESP32 / ARDUINO
- For ESP32 / Arduino IDE requests, default to: short explanation + code block.
- Only create a file if the user explicitly asks for a file.
- Keep hardware instructions simple and practical.

FILES AND OUTPUT RULES
- For normal chat, do not create files.
- For non-game coding tasks, do not create files unless explicitly asked.
- For game requests, create a file by default unless the user asks for code.
- If creating files, use this exact format:
<file name="index.html" mime="text/html;charset=utf-8">
...full file content...
</file>
- Keep any explanation outside the file tag.
- If returning code instead of a file, use fenced code blocks.

STYLE
- Answers should look clean and well thought out.
- Be specific, not generic.
- If the user asks for something beautiful, premium, modern, cute, dark, colorful, joyful, elegant, arcade-like, etc., reflect that style in the output.
`;

    const selectedModel = imageAttached ? "meta-llama/llama-4-scout-17b-16e-instruct" : model;
    const raw = await callGroq({ apiKey, model: selectedModel, system, messages: buildMessages(messages) });

    const imagePrompt = extractTag(raw, "image_prompt");
    const parsed = extractFiles(raw);
    let files = parsed.files;
    let text = parsed.text;

    if (!files.length && wantsGame(latestText) && !wantsCode(latestText)) {
      const wrapped = maybeWrapHtmlAsFile(raw);
      if (wrapped) {
        files = [wrapped];
        text = hasHebrew(latestText)
          ? "הנה המשחק עם הסבר קצר. אפשר לפתוח אותו בדפדפן או להוריד."
          : "Here is the game with a short explanation. You can open it in the browser or download it.";
      }
    }

    return NextResponse.json({
      text,
      files,
      imageUrl: imagePrompt ? pollinationsUrl(imagePrompt) : "",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
