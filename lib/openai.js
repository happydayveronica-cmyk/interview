const OPENAI_BASE_URL = "https://api.openai.com/v1";

export function getApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }

  return apiKey;
}

export async function createOpenAIResponse({ input, instructions, maxOutputTokens = 3500 }) {
  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      instructions,
      input,
      max_output_tokens: maxOutputTokens
    })
  });

  const payload = await safeJson(response);

  if (!response.ok) {
    throw new Error(payload?.error?.message || "OpenAI Responses API 요청에 실패했습니다.");
  }

  return {
    payload,
    text: collectOutputText(payload)
  };
}

export async function transcribeAudio(file) {
  const form = new FormData();
  form.append("file", file, file.name || "answer.webm");
  form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe");
  form.append("response_format", "json");
  form.append("prompt", "한국어 고등학생 입시 면접 답변입니다. 고유명사와 학교 활동명을 가능한 정확히 보존하세요.");

  const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`
    },
    body: form
  });

  const payload = await safeJson(response);

  if (!response.ok) {
    throw new Error(payload?.error?.message || "음성 전사 요청에 실패했습니다.");
  }

  return {
    payload,
    text: payload?.text || ""
  };
}

export function parseModelJson(text) {
  if (!text) {
    throw new Error("AI 응답이 비어 있습니다.");
  }

  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const firstBrace = withoutFence.indexOf("{");
    const lastBrace = withoutFence.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("AI 응답에서 JSON을 찾지 못했습니다.");
    }

    return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1));
  }
}

export function jsonError(error, status = 500) {
  const message = error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
  return Response.json({ error: message }, { status });
}

async function safeJson(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function collectOutputText(payload) {
  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  const chunks = [];

  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}
