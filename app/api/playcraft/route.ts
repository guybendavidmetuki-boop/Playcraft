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

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

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

function buildAnthropicMessages(messages: UiMessage[]) {
  return messages.map((message) => {
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: [{ type: "text", text: message.content || "" }]
      };
    }

    const files = message.files || [];
    const parts: Array<any> = [];
    const textSections: string[] = [];

    for (const file of files) {
      if (file.type?.startsWith("image/") && file.base64) {
        parts.push({
          type: "image",
          source: {
            type: "base64",
            media_type: file.type,
            data: file.base64
          }
        });
        continue;
      }

      if (file.text) {
        textSections.push(`<attachment name="${file.name}">\n${truncate(file.text)}\n</attachment>`);
        continue;
      }

      textSections.push(`<attachment name="${file.name}">Binary file attached but no text content was available.</attachment>`);
    }

    const textBlock = [
      message.content?.trim() ? `<request>\n${message.content.trim()}\n</request>` : "",
      textSections.length ? `<attached_files>\n${textSections.join("\n\n")}\n</attached_files>` : ""
    ]
      .filter(Boolean)
      .join("\n\n") || "(empty user message)";

    parts.push({ type: "text", text: textBlock });

    return {
      role: "user",
      content: parts
    };
  });
}

function isProbablyPlaceholderKey(value: string) {
  return !value || /המפתח/.test(value) || /your_key/i.test(value) || /placeholder/i.test(value);
}

function hasNonLatin1(value: string) {
  return /[^\u0000-\u00ff]/.test(value);
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY || "";

    if (isProbablyPlaceholderKey(apiKey) || hasNonLatin1(apiKey)) {
      return NextResponse.json(
        {
          error: "ANTHROPIC_API_KEY is not set to a real Anthropic key. Put your real key in Vercel Environment Variables."
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? (body.messages as UiMessage[]) : [];

    if (!messages.length) {
      return NextResponse.json({ error: "No messages were provided." }, { status: 400 });
    }

    const upstream = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 12000,
        system: SYSTEM,
        messages: buildAnthropicMessages(messages)
      }),
      signal: req.signal
    });

    const json = await upstream.json();

    if (!upstream.ok || json?.error) {
      return NextResponse.json(
        {
          error: json?.error?.message || `Anthropic request failed with status ${upstream.status}.`
        },
        { status: upstream.status || 500 }
      );
    }

    const reply = Array.isArray(json?.content)
      ? json.content
          .filter((block: any) => block?.type === "text")
          .map((block: any) => block.text || "")
          .join("\n\n")
      : "";

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
