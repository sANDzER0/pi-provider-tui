import { buildAuthHeaders } from "./fetch-models.js";
import { isReferenceValue, resolveValue } from "./env-resolve.js";
import { fetchWithTimeout, DEFAULT_FETCH_TIMEOUT_MS } from "./http.js";
import type { ModelConfig, ProviderConfig } from "./types.js";

function joinUrl(baseUrl: string, suffix: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const path = suffix.startsWith("/") ? suffix : `/${suffix}`;
  if (base.endsWith(path)) return base;
  return base + path;
}

export async function testConnection(opts: {
  provider: ProviderConfig;
  model: ModelConfig;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ ok: boolean; status?: number; detail: string }> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const { provider, model } = opts;

  // Resolve $VAR / !command references before use (pi does the same at request time).
  let rawKey = provider.apiKey;
  if (rawKey && isReferenceValue(rawKey)) {
    const res = await resolveValue(rawKey);
    if (!res.ok) return { ok: false, detail: res.error };
    rawKey = res.value;
  }

  const auth = buildAuthHeaders(provider.api, rawKey);
  // When authHeader is explicitly false, still send provider-specific keys
  // from buildAuthHeaders for anthropic; for openai, omit Bearer if authHeader false.
  let headers: Record<string, string> = {
    "content-type": "application/json",
    ...auth,
  };
  if (provider.authHeader === false && provider.api !== "anthropic-messages") {
    delete headers.Authorization;
  }

  let url: string;
  let body: unknown;

  if (provider.api === "openai-completions") {
    url = joinUrl(provider.baseUrl, "/chat/completions");
    body = {
      model: model.id,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    };
  } else if (provider.api === "openai-responses") {
    url = joinUrl(provider.baseUrl, "/responses");
    body = {
      model: model.id,
      input: "ping",
      max_output_tokens: 1,
    };
  } else if (provider.api === "google-generative-ai") {
    url = joinUrl(provider.baseUrl, `/models/${model.id}:generateContent`);
    body = {
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      generationConfig: { maxOutputTokens: 1 },
    };
  } else {
    url = joinUrl(provider.baseUrl, "/messages");
    headers = {
      ...headers,
      "anthropic-version": "2023-06-01",
    };
    body = {
      model: model.id,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    };
  }

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      timeoutMs,
      fetchFn,
    );
    const text = (await res.text().catch(() => "")).slice(0, 300);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        detail: `HTTP ${res.status}: ${text || res.statusText}`,
      };
    }
    return {
      ok: true,
      status: res.status,
      detail: text || `HTTP ${res.status} OK`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg };
  }
}
