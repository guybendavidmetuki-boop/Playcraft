import { NextResponse } from "next/server";

export const runtime = "nodejs";

type UiFile = {
  name: string;
  type?: string;
  text?: string;
  base64?: string;
};

type UiMessage = {
  role: "user" | "assistant";
  content?: string;
  files?: UiFile[];
};

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM = `You are Playcraft AI, an elite game developer who builds playable games that feel polished.

You must work in this order:
1. Understand the request.
2. If the user attached existing code, repair and improve it instead of replacing it unless replacement is clearly better.
3. Produce a complete playable HTML5 game as a single self-contained HTML file.
4. Make it runnable immediately with no placeholders and no missing assets.

Hard rules:
- Always output a single complete HTML document.
- Do not rely on external libraries, CDNs, bundlers, or extra files.
- Include game loop, controls, scoring, restart flow, win/lose or fail state where relevant, and visible instructions.
- Prefer canvas for action games and plain DOM/CSS for simple UI-heavy games.
- Keep code readable and well-structured.
- When the user asks to fix a game, preserve the spirit of the original game.
- Never say you cannot provide the code if an HTML5 version is possible.

Return your answer in exactly this format:
<game_summary>
A short explanation of what you built or fixed.
</game_summary>
<game_html>
<!DOCTYPE html>
...
</game_html>`;

function truncate(text: string, max = 40000) {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max)}\n\n[truncated]`;
}

function extractHtmlFromReply(text = "") {
  const tagMatch = text.match(/<game_html>([\s\S]*?)<\/game_html>/i);
  if (tagMatch?.[1]) return tagMatch[1].trim();

  const fenced = text.match(/```html\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1] && /<(?:!doctype|html|body|canvas|script)/i.test(fenced[1])) return fenced[1].trim();

  const doctypeIndex = text.search(/<!doctype html>/i);
  if (doctypeIndex >= 0) return text.slice(doctypeIndex).trim();

  const htmlIndex = text.search(/<html[\s>]/i);
  if (htmlIndex >= 0) return text.slice(htmlIndex).trim();

  return "";
}

function extractSummaryFromReply(text = "") {
  return text.match(/<game_summary>([\s\S]*?)<\/game_summary>/i)?.[1]?.trim() || "";
}

function buildUserText(message: UiMessage) {
  const textSections: string[] = [];

  for (const file of message.files || []) {
    if (file.text) {
      textSections.push(`<attachment name="${file.name}">\n${truncate(file.text)}\n</attachment>`);
    } else if (file.type?.startsWith("image/")) {
      textSections.push(`<attachment name="${file.name}">Image attached by user.</attachment>`);
    } else {
      textSections.push(`<attachment name="${file.name}">Binary file attached but no text content was available.</attachment>`);
    }
  }

  return [
    message.content?.trim() ? `<request>\n${message.content.trim()}\n</request>` : "",
    textSections.length ? `<attached_files>\n${textSections.join("\n\n")}\n</attached_files>` : ""
  ]
    .filter(Boolean)
    .join("\n\n") || "(empty user message)";
}

function buildGroqMessages(messages: UiMessage[]) {
  return [
    { role: "system", content: SYSTEM },
    ...messages.map((message) => {
      if (message.role === "assistant") {
        return {
          role: "assistant",
          content: message.content || ""
        };
      }

      return {
        role: "user",
        content: buildUserText(message)
      };
    })
  ];
}

function isProbablyFakeGroqKey(value: string) {
  if (!value) return true;
  if (/המפתח|your_key|placeholder/i.test(value)) return true;
  if (/\s/.test(value.trim())) return true;
  return false;
}

export async function POST(req: Request) {
  try {
    const apiKey = (process.env.GROQ_API_KEY || "").trim();

    if (isProbablyFakeGroqKey(apiKey)) {
      return NextResponse.json(
        {
          error: "GROQ_API_KEY is missing or not real. Put your real Groq key in Vercel Environment Variables."
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? (body.messages as UiMessage[]) : [];

    if (!messages.length) {
      return NextResponse.json({ error: "No messages were provided." }, { status: 400 });
    }

    const upstream = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: buildGroqMessages(messages),
        temperature: 0.2,
        max_tokens: 8192
      }),
      signal: req.signal
    });

    const json = await upstream.json();

    if (!upstream.ok || json?.error) {
      return NextResponse.json(
        {
          error: json?.error?.message || `Groq request failed with status ${upstream.status}.`
        },
        { status: upstream.status || 500 }
      );
    }

    const reply = json?.choices?.[0]?.message?.content || "";

    return NextResponse.json({
      reply,
      summary: extractSummaryFromReply(reply),
      generatedHtml: extractHtmlFromReply(reply),
      model: MODEL
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return NextResponse.json({ error: "Request was aborted." }, { status: 499 });
    }

    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
