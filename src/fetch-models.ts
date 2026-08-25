import { fetchWithTimeout, DEFAULT_FETCH_TIMEOUT_MS } from "./http.js";
import { isReferenceValue, resolveValue } from "./env-resolve.js";
import { defaultModel, type ApiType, type ModelConfig } from "./types.js";

export function buildModelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (/\/models$/i.test(trimmed)) return trimmed;
  return trimmed + "/models";
}

export function buildAuthHeaders(
  api: ApiType,
  apiKey?: string,
): Record<string, string> {
  if (!apiKey) return {};
  if (api === "anthropic-messages") {
    return {
      "x-api-key": apiKey,
      Authorization: `Bearer ${apiKey}`,
    };
  }
  return { Authorization: `Bearer ${apiKey}` };
}

function asList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.models)) return obj.models;
  }
  return [];
}

export function parseModelsPayload(payload: unknown): {
  models: ModelConfig[];
  skipped: number;
} {
  const list = asList(payload);
  const models: ModelConfig[] = [];
  let skipped = 0;
  for (const item of list) {
    if (!item || typeof item !== "object") {
      skipped++;
      continue;
    }
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id) {
      skipped++;
      continue;
    }
    models.push(
      defaultModel({
        id: row.id,
        name: typeof row.name === "string" ? row.name : undefined,
        reasoning:
          typeof row.reasoning === "boolean" ? row.reasoning : undefined,
        contextWindow:
          typeof row.context_window === "number"
            ? row.context_window
            : typeof row.contextWindow === "number"
              ? row.contextWindow
              : undefined,
        maxTokens:
          typeof row.max_tokens === "number"
            ? row.max_tokens
            : typeof row.maxTokens === "number"
              ? row.maxTokens
              : undefined,
      }),
    );
  }
  return { models, skipped };
}

export async function fetchRemoteModels(opts: {
  baseUrl: string;
  api: ApiType;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<
  | { ok: true; models: ModelConfig[]; skipped: number }
  | { ok: false; error: string }
> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const url = buildModelsUrl(opts.baseUrl);

  // Resolve $VAR / !command references before use (pi does the same at request time).
  let apiKey = opts.apiKey;
  if (apiKey && isReferenceValue(apiKey)) {
    const res = await resolveValue(apiKey);
    if (!res.ok) return { ok: false, error: res.error };
    apiKey = res.value;
  }

  const headers = buildAuthHeaders(opts.api, apiKey);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  try {
    const res = await fetchWithTimeout(url, { headers }, timeoutMs, fetchFn);
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      return {
        ok: false,
        error: `HTTP ${res.status} ${res.statusText}${body ? `: ${body}` : ""}`,
      };
    }
    const json = (await res.json()) as unknown;
    const parsed = parseModelsPayload(json);
    return { ok: true, models: parsed.models, skipped: parsed.skipped };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
