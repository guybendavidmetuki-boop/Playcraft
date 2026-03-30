export const runtime = "edge";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const TEXT_MODEL = "groq/compound";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildSystem(mode) {
  const base = `You are Playcraft, a smart all-purpose AI assistant.
You are especially strong at:
- writing real, usable code
- building games
- explaining code clearly
- ESP32 and Arduino IDE projects
- analyzing screenshots and UI designs
- finding current information when your model has web access

Rules:
- Chat normally when the user is just talking.
- If the user asks for code, give complete usable code.
- If the user asks for a game, build the game they asked for, not a random one.
- If the user asks about a screenshot or design reference, analyze it carefully and be very specific.
- If the user asks for current/latest information, use web search if available through the model.
- Be practical and direct.`;

  if (mode === "study") {
    return `${base}

Study mode rules:
- teach step by step
- explain simply
- help the user learn, not only copy-paste
- still give full code if the user explicitly asks for it`;
  }

  return base;
}

function summarizeTextAttachment(file) {
  const text = typeof file.text === "string" ? file.text.slice(0, 30000) : "";
  return `\n\nAttached file: ${file.name}\nType: ${file.type || "unknown"}\n\n${text}`;
}

function normalizeMessages(messages = []) {
  let hasImage = false;

  const normalized = messages
    .filter((msg) => msg && (msg.content || msg.files?.length))
    .map((msg) => {
      if (msg.role === "assistant") {
        return {
          role: "assistant",
          content: msg.content || "",
        };
      }

      const files = Array.isArray(msg.files) ? msg.files : [];
      const imageFiles = files.filter((file) => file?.type?.startsWith("image/") && file.dataUrl);
      const textFiles = files.filter((file) => !file?.type?.startsWith("image/") && file.text);

      if (imageFiles.length) hasImage = true;

      if (hasImage || imageFiles.length) {
        const parts = [];
        let text = msg.content || "";
        if (textFiles.length) {
          text += textFiles.map(summarizeTextAttachment).join("\n\n");
        }
        parts.push({ type: "text", text: text || "Please analyze the attached file(s)." });
        imageFiles.slice(0, 4).forEach((file) => {
          parts.push({
            type: "image_url",
            image_url: { url: file.dataUrl },
          });
        });
        return { role: "user", content: parts };
      }

      let text = msg.content || "";
      if (textFiles.length) {
        text += textFiles.map(summarizeTextAttachment).join("\n\n");
      }
      return {
        role: "user",
        content: text || "Please analyze the attached file(s).",
      };
    });

  return { normalized, hasImage };
}

function collectSources(message) {
  const tools = message?.executed_tools || [];
  const seen = new Set();
  const sources = [];

  for (const tool of tools) {
    const results = tool?.search_results?.results || tool?.search_results || [];
    for (const item of results) {
      if (!item?.url || seen.has(item.url)) continue;
      seen.add(item.url);
      sources.push({ title: item.title || item.url, url: item.url });
      if (sources.length >= 6) return sources;
    }
  }

  return sources;
}

export async function POST(req) {
  try {
    if (!GROQ_API_KEY || GROQ_API_KEY.includes("המפתח") || GROQ_API_KEY.length < 20) {
      return json({ error: "GROQ_API_KEY is missing or not real. Put your real Groq key in Vercel Environment Variables." }, 400);
    }

    const body = await req.json();
    const mode = body?.mode || "chat";
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    const { normalized, hasImage } = normalizeMessages(messages);
    if (!normalized.length) {
      return json({ error: "No message to send." }, 400);
    }

    const model = hasImage ? VISION_MODEL : TEXT_MODEL;

    const groqPayload = {
      model,
      temperature: 0.35,
      max_completion_tokens: 2200,
      messages: [
        { role: "system", content: buildSystem(mode) },
        ...normalized,
      ],
    };

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify(groqPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      const message = data?.error?.message || data?.message || "Groq request failed.";
      return json({ error: message }, response.status);
    }

    const message = data?.choices?.[0]?.message || {};
    const text = message?.content || "No response.";
    const sources = hasImage ? [] : collectSources(message);

    return json({ text, sources, model, usedVision: hasImage, usedWebSearch: !hasImage && sources.length > 0 });
  } catch (error) {
    return json({ error: error?.message || "Unexpected server error." }, 500);
  }
}
