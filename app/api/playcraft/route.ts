import { NextResponse } from "next/server";

export const runtime = "nodejs";

type OutFile = { name: string; content: string; mime: string };

function cleanText(text: string) {
  return (text || "").replace(/\u0000/g, "").trim();
}

function extractTag(text: string, tag: string) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

function extractFiles(text: string) {
  const files: OutFile[] = [];
  const regex = /<file\s+name="([^"]+)"(?:\s+mime="([^"]+)")?>([\s\S]*?)<\/file>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    files.push({
      name: match[1],
      mime: match[2] || "text/plain;charset=utf-8",
      content: match[3].trim(),
    });
  }
  return {
    text: text.replace(regex, "").replace(/<image_prompt>[\s\S]*?<\/image_prompt>/gi, "").trim(),
    files,
  };
}

function lastUserText(messages: any[]) {
  const lastUser = [...messages].reverse().find((m) => m?.role === "user");
  const bits: string[] = [];
  if (lastUser?.text) bits.push(lastUser.text);
  for (const f of lastUser?.files || []) {
    if (f.kind === "text" && f.text) bits.push(f.text.slice(0, 4000));
  }
  return bits.join("\n\n");
}

function hasHebrew(text: string) {
  return /[\u0590-\u05FF]/.test(text || "");
}

function isGameRequest(text: string) {
  const lower = (text || "").toLowerCase();
  return /(game|wordle|snake|platformer|rpg|tetris|html game|משחק|וורדל|סנייק|פלטפורמה)/.test(lower);
}

function wantsCode(text: string) {
  const lower = (text || "").toLowerCase();
  return /(code|source|snippet|arduino|esp32|c\+\+|javascript|typescript|react|html|css|js|ts|קוד|סקץ'|arduino ide)/.test(lower);
}

function wantsFile(text: string) {
  const lower = (text || "").toLowerCase();
  return /(file|download|project files|zip|index\.html|make a file|create a file|קובץ|קבצים|זיפ|להורדה)/.test(lower);
}

function wantsImage(mode: string, text: string) {
  const lower = (text || "").toLowerCase();
  return mode === "image" || /(generate an image|create an image|make an image|draw|illustration|artwork|תיצור תמונה|תייצר תמונה|ציור|אילוסטרציה|תמונה)/.test(lower);
}

function pollinationsUrl(prompt: string) {
  const finalPrompt = encodeURIComponent(`${prompt}. High quality, beautiful composition, clean details.`);
  return `https://image.pollinations.ai/prompt/${finalPrompt}?width=1024&height=1024&nologo=true`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const mode = body.mode || "chat";
    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || "groq/compound";

    if (!apiKey || apiKey.length < 20) {
      return NextResponse.json({ error: "GROQ_API_KEY is missing or not real. Put your real Groq key in Vercel Environment Variables." }, { status: 400 });
    }

    const latestText = lastUserText(messages);
    const sameLanguageRule = hasHebrew(latestText)
      ? "Reply in Hebrew unless the user explicitly asks for another language."
      : "Reply in the same language and tone as the user's latest message.";

    const system = `You are Playcraft AI.

You are a smart assistant for chat, coding, games, ESP32, Arduino IDE, design help, image prompting, learning, and web research.

LANGUAGE
- ${sameLanguageRule}

GLOBAL RULES
- Be clear, smart, and practical.
- Keep answers beautifully organized.
- Use short sections, bullets, and numbered steps when helpful.
- Never answer with one giant wall of text.
- Keep the opening explanation short and useful.
- If the user is casually chatting, answer naturally.
- If the user asks for current information, examples, trends, or references, use web search.
- If the user uploads screenshots or images, analyze them carefully and mention concrete details.

GAMES
- For game requests, the DEFAULT is: short explanation first, then downloadable file(s).
- For HTML or web games, prefer one self-contained index.html file unless the user asks for another structure.
- If the user explicitly asks for CODE, do NOT create a file by default. Give short explanation + clean code blocks.
- If the user explicitly asks for a FILE or downloadable project, return <file name="..." mime="...">...</file> blocks.

NON-GAME CODE
- For Arduino IDE / ESP32 and most coding tasks: short explanation + copyable code blocks.
- Only create files when the user explicitly asks for a file.

IMAGES
- If the user wants an image, first write a short helpful response.
- Then include exactly one <image_prompt>...</image_prompt> tag with a vivid image generation prompt.
- Do not put markdown fences inside the image_prompt tag.

FILES
- When creating files, keep the explanation OUTSIDE the <file> tags.
- Never wrap file contents in markdown fences when using <file> tags.

FORMAT
- Use markdown for normal answers.
- Put code only inside fenced code blocks when not creating files.
- Make answers look polished and easy to read.`;

    const hasImage = messages.some((m: any) => (m.files || []).some((f: any) => f.kind === "image"));

    const groqMessages = messages.map((m: any) => {
      if (m.role === "assistant") {
        return { role: "assistant", content: cleanText(m.text || "") };
      }

      const parts: any[] = [];
      const textParts: string[] = [];

      if (m.mode && m.mode !== "chat") textParts.push(`Mode: ${m.mode}`);
      if (m.text) textParts.push(cleanText(m.text));

      for (const f of m.files || []) {
        if (f.kind === "image" && f.base64) {
          parts.push({ type: "image_url", image_url: { url: `data:${f.mime || "image/jpeg"};base64,${f.base64}` } });
        } else if (f.kind === "text") {
          textParts.push(`Attached file: ${f.name}${f.truncated ? " (truncated)" : ""}\n\n${f.text}`);
        }
      }

      const finalText = textParts.join("\n\n").trim() || "Hello";
      if (!parts.length) return { role: "user", content: finalText };
      return { role: "user", content: [{ type: "text", text: finalText }, ...parts] };
    });

    const selectedModel = hasImage ? "meta-llama/llama-4-scout-17b-16e-instruct" : model;
    const payload: any = {
      model: selectedModel,
      messages: [{ role: "system", content: system }, ...groqMessages],
      temperature: 0.45,
      max_completion_tokens: 4096,
    };

    if (!hasImage && selectedModel.startsWith("groq/compound")) {
      payload.tools = [{ type: "web_search" }, { type: "code_interpreter" }];
    }

    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    if (!resp.ok) {
      const msg = data?.error?.message || data?.message || "Groq request failed.";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const rawText = data?.choices?.[0]?.message?.content || "";
    const { text, files } = extractFiles(rawText);
    const imagePrompt = extractTag(rawText, "image_prompt");

    let generatedImageUrl = "";
    if (wantsImage(mode, latestText) && imagePrompt) {
      generatedImageUrl = pollinationsUrl(imagePrompt);
    }

    // Safety fallback so the behavior stays aligned even if the model drifts.
    if (isGameRequest(latestText) && !wantsCode(latestText) && !wantsFile(latestText) && files.length === 0) {
      const prompt = hasHebrew(latestText)
        ? "ביקשת משחק. ברירת המחדל היא הסבר קצר ואז קובץ מוכן. נסה לבקש שוב ולכתוב למשל: תעשה לי קובץ HTML של המשחק."
        : "You asked for a game. The default here is a short explanation and then a downloadable file. Ask again and say for example: make me an HTML file for the game.";
      return NextResponse.json({ text: prompt, files: [] });
    }

    return NextResponse.json({ text: text || "Done.", files, generatedImageUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
