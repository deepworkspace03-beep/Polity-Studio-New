import type { AiConfig } from "../lib/types";

/**
 * Model-agnostic AI client. Two wire protocols cover practically every
 * provider: "openai" speaks the OpenAI-compatible Chat Completions API
 * (OpenAI, OpenRouter, Groq, Gemini's compat endpoint, LM Studio,
 * Ollama…) and "anthropic" speaks the Anthropic Messages API directly
 * from the browser. Keys live only in local settings — never bundled,
 * never sent anywhere except the configured endpoint.
 */

export interface AiRequest {
  system: string;
  prompt: string;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}

async function* sseEvents(res: Response, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    if (signal?.aborted) {
      await reader.cancel();
      return;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.trim();
      if (data.startsWith("data:")) yield data.slice(5).trim();
    }
  }
}

async function readError(res: Response): Promise<never> {
  const text = await res.text().catch(() => "");
  let message = text.slice(0, 300);
  try {
    const json = JSON.parse(text) as { error?: { message?: string } };
    message = json.error?.message || message;
  } catch {
    /* not json */
  }
  if (res.status === 401 || res.status === 403) message = message || "Invalid API key.";
  throw new Error(`AI request failed (${res.status}): ${message || res.statusText}`);
}

async function completeOpenAi(config: AiConfig, req: AiRequest): Promise<string> {
  const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal: req.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
    }),
  });
  if (!res.ok || !res.body) await readError(res);

  let full = "";
  for await (const data of sseEvents(res, req.signal)) {
    if (data === "[DONE]") break;
    try {
      const delta: string | undefined = JSON.parse(data)?.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        req.onDelta(delta);
      }
    } catch {
      /* keep-alive or partial frame */
    }
  }
  return full;
}

async function completeAnthropic(config: AiConfig, req: AiRequest): Promise<string> {
  const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    signal: req.signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 16000,
      stream: true,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
    }),
  });
  if (!res.ok || !res.body) await readError(res);

  let full = "";
  for await (const data of sseEvents(res, req.signal)) {
    try {
      const event = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } };
      if (event.type === "content_block_delta" && event.delta?.text) {
        full += event.delta.text;
        req.onDelta(event.delta.text);
      }
    } catch {
      /* keep-alive */
    }
  }
  return full;
}

export async function runCompletion(config: AiConfig, req: AiRequest): Promise<string> {
  if (!config.apiKey) throw new Error("No API key configured — add one in Settings → AI assistant.");
  if (!config.model) throw new Error("No model configured — set one in Settings → AI assistant.");
  const text = config.provider === "anthropic" ? await completeAnthropic(config, req) : await completeOpenAi(config, req);
  if (!text.trim()) throw new Error("The AI returned an empty response.");
  // Models occasionally wrap the whole reply in a markdown fence — unwrap it.
  return text.trim().replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/m, "$1");
}

export const PROVIDER_PRESETS: Record<AiConfig["provider"], { label: string; baseUrl: string; modelHint: string }> = {
  openai: { label: "OpenAI-compatible", baseUrl: "https://api.openai.com/v1", modelHint: "gpt-5-mini, llama-3.3-70b, …" },
  anthropic: { label: "Anthropic", baseUrl: "https://api.anthropic.com", modelHint: "claude-sonnet-5, claude-haiku-4-5, …" },
};
