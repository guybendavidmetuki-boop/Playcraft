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

function wantsGame(text: string) {
  return /(game|wordle|snake|platformer|maze|arcade|rpg|tetris|משחק|וורדל|סנייק|פלטפורמה|מבוך|אימה)/i.test(text || "");
}

function wantsCode(text: string) {
  return /(code|source|snippet|arduino|esp32|javascript|typescript|react|html|css|js|ts|קוד|ארדואינו|סקץ)/i.test(text || "");
}

function wantsFile(text: string) {
  return /(file|download|zip|index\.html|project files|קובץ|קבצים|להורדה|זיפ)/i.test(text || "");
}

function wantsImage(mode: string, text: string) {
  return mode === "image" || /(image|draw|illustration|artwork|תמונה|ציור|אילוסטרציה|צור תמונה)/i.test(text || "");
}

function pollinationsUrl(prompt: string) {
  const q = encodeURIComponent(`${prompt}. high quality, beautiful composition, polished details, modern style`);
  return `https://image.pollinations.ai/prompt/${q}?width=1024&height=1024&nologo=true`;
}

function latestUserText(messages: ApiMessage[]) {
  const user = [...messages].reverse().find((m) => m.role === "user");
  const pieces: string[] = [];
  if (user?.text) pieces.push(user.text);
  for (const f of user?.files || []) {
    if (f.kind === "text" && f.text) pieces.push(f.text.slice(0, 5000));
  }
  return pieces.join("\n\n");
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
        parts.push({ type: "image_url", image_url: { url: `data:${f.mime || "image/jpeg"};base64,${f.base64}` } });
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
      temperature: 0.35,
      max_completion_tokens: 4096,
      tools: model.startsWith("groq/compound") ? [{ type: "web_search" }] : undefined,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || data?.message || "Groq request failed.");
  return clean(data?.choices?.[0]?.message?.content || "");
}

function maybeWrapHtmlAsFile(text: string) {
  const codeMatch = text.match(/```(?:html)?\n([\s\S]*?)```/i);
  if (!codeMatch) return null;
  const code = codeMatch[1].trim();
  if (!/<html|<canvas|<script|<!doctype/i.test(code)) return null;
  return { name: "index.html", mime: "text/html;charset=utf-8", content: code };
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
    const languageRule = hasHebrew(latestText)
      ? "Reply in Hebrew unless the user explicitly asks for another language."
      : "Reply in the same language as the user. If the user writes in Hebrew, reply in Hebrew.";

    if (wantsImage(mode, latestText)) {
      const imagePrompt = latestText || (hasHebrew(latestText) ? "תמונה יפה" : "beautiful image");
      return NextResponse.json({
        text: hasHebrew(latestText)
          ? "הכנתי לך תמונה לפי הבקשה."
          : "I made an image based on your request.",
        imageUrl: pollinationsUrl(imagePrompt),
        files: [],
      });
    }

    const system = `You are Playcraft AI.

${languageRule}

GLOBAL
- Be practical, fast, and well organized.
- Use short sections and clean formatting.
- For normal chat: answer naturally and clearly.
- For current information or references: use web search when useful.
- If the user uploads a screenshot, analyze concrete visual details.

MODES
- Chat mode: normal smart assistant.
- Study mode: teach clearly, step by step, in simple language.
- Build mode: strong at games, code, UI ideas, product ideas.

FILES AND CODE
- Only create files when needed.
- Non-game coding tasks like ESP32 / Arduino IDE: short explanation + fenced code blocks, unless the user explicitly asks for a file.
- If the user explicitly asks for code, do not create files by default.
- If the user explicitly asks for a file, downloadable project, or html file, use <file name="..." mime="...">...</file>.

GAMES
- IMPORTANT: for game requests, the default is SHORT explanation first, then a downloadable file.
- So if the user asks for a game and does not explicitly ask for code only, create a game file by default.
- Prefer a single self-contained index.html for web games unless the user asks otherwise.
- If the user asks for game code, give short explanation + fenced code blocks instead of files.
- Do not talk ABOUT the default. Actually do it.

FORMAT
- Use markdown for normal text.
- Use fenced code blocks only when not returning file tags.
- Keep explanations outside file tags.
- If you create a file, keep the explanation short and helpful.`;

    const hasImage = messages.some((m) => (m.files || []).some((f) => f.kind === "image"));
    const selectedModel = hasImage ? "meta-llama/llama-4-scout-17b-16e-instruct" : model;
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
          ? "הנה קובץ המשחק עם הסבר קצר. אפשר לפתוח אותו בדפדפן או להוריד."
          : "Here is the game file with a short explanation. You can open it in the browser or download it.";
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
