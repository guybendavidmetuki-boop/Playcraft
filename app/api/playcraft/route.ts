import { NextResponse } from "next/server";

export const runtime = "nodejs";

type OutFile = { name: string; content: string; mime: string };

function cleanText(text: string) {
  return (text || "").replace(/\u0000/g, "").trim();
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
    text: text.replace(regex, "").trim(),
    files,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const mode = body.mode || "chat";

    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || "groq/compound";
    const imageBase = process.env.NEXT_PUBLIC_IMAGE_API_BASE || "";

    if (!apiKey || apiKey.length < 20) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is missing or not real. Put your real Groq key in Vercel Environment Variables." },
        { status: 400 }
      );
    }

    const system = `You are Playcraft AI.

You are a smart general assistant for:
- games
- coding
- ESP32 / Arduino IDE
- design help
- learning
- casual chat

GLOBAL RULES
- Always answer clearly and neatly.
- Use short sections and clean markdown.
- Keep the first explanation short and useful.
- If the user is casually chatting, answer naturally.
- If the user asks for code, put code only inside fenced markdown code blocks.
- Never create downloadable files unless the rules below say to.

GAME RULES (VERY IMPORTANT)
- For game requests, the DEFAULT is:
  1) a short explanation in normal text
  2) then a downloadable file
- So if the user says things like "build me a game", "make a game", "create a game", the normal default is:
  - short explanation
  - then one or more <file name="..."> ... </file> blocks
- Prefer ONE compact self-contained file for games when possible.
- For HTML/web games, default to one self-contained index.html file unless the user asks for another structure.
- Keep game files reasonably compact and runnable.

GAME CODE RULES
- If the user asks for CODE for a game, then DO NOT create a file by default.
- Instead give:
  1) short explanation
  2) clean markdown code block(s)
- Only create game files when the user asks for a file/project/download OR when the user asks to build/create a game without explicitly asking for code.

NON-GAME CODE RULES
- For Arduino IDE / ESP32 and other coding tasks:
  - do NOT create a file by default
  - give short explanation + copyable code block
  - add very short wiring/usage notes when useful
- If the user explicitly asks for a file, then create a file.

DESIGN / IMAGE / WEB RULES
- If the user uploads a screenshot, analyze it carefully and mention concrete UI details.
- If the user asks for current info, design references, trends, or examples, use web search.
- If the user asks to create an image and image generation is available, write a short response and a vivid image prompt.

FORMATTING RULES
- Keep responses neat, readable, and well organized.
- Use headings only when helpful.
- Use bullets and numbered steps when helpful.
- Keep the explanation before code or files short.
- Do not dump giant walls of text.
- When creating files, put the explanation OUTSIDE the file tags.
- Never wrap file content in markdown fences when using <file> tags.

EXAMPLES
1) User: "build me a wordle game"
Answer style:
Short explanation.
<file name="index.html" mime="text/html">...full code...</file>

2) User: "give me the code for a wordle game"
Answer style:
Short explanation.
\
\
\

a markdown code block only, no file by default.

3) User: "write esp32 code for Arduino IDE that blinks an LED"
Answer style:
Short explanation.
A markdown code block.
No file by default.`;

    const hasImage = messages.some((m: any) => (m.files || []).some((f: any) => f.kind === "image"));

    const groqMessages = messages.map((m: any) => {
      if (m.role === "assistant") {
        return { role: "assistant", content: cleanText(m.text || "") };
      }

      const parts: any[] = [];
      const textParts: string[] = [];

      if (m.text) textParts.push(cleanText(m.text));
      if (m.mode && m.mode !== "chat") textParts.unshift(`Mode: ${m.mode}`);

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

    const modelToUse = hasImage ? "meta-llama/llama-4-scout-17b-16e-instruct" : model;
    const payload: any = {
      model: modelToUse,
      messages: [{ role: "system", content: system }, ...groqMessages],
      temperature: 0.45,
      max_completion_tokens: 4096,
    };

    if (!hasImage && modelToUse.startsWith("groq/compound")) {
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

    let generatedImageUrl = "";
    if (mode === "image" && imageBase) {
      try {
        const prompt = encodeURIComponent(text || messages[messages.length - 1]?.text || "A beautiful cheerful illustration");
        generatedImageUrl = `${imageBase}${imageBase.includes("?") ? "&" : imageBase.endsWith("/") ? "" : "/"}${prompt}`;
      } catch {}
    }

    return NextResponse.json({ text: text || "Done.", files, generatedImageUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
