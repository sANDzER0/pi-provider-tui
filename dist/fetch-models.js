import { fetchWithTimeout, DEFAULT_FETCH_TIMEOUT_MS } from "./http.js";
import { defaultModel } from "./types.js";
export function buildModelsUrl(baseUrl) {
    const trimmed = baseUrl.replace(/\/+$/, "");
    if (/\/models$/i.test(trimmed))
        return trimmed;
    return trimmed + "/models";
}
export function buildAuthHeaders(api, apiKey) {
    if (!apiKey)
        return {};
    if (api === "anthropic-messages") {
        return {
            "x-api-key": apiKey,
            Authorization: `Bearer ${apiKey}`,
        };
    }
    return { Authorization: `Bearer ${apiKey}` };
}
function asList(payload) {
    if (Array.isArray(payload))
        return payload;
    if (payload && typeof payload === "object") {
        const obj = payload;
        if (Array.isArray(obj.data))
            return obj.data;
        if (Array.isArray(obj.models))
            return obj.models;
    }
    return [];
}
export function parseModelsPayload(payload) {
    const list = asList(payload);
    const models = [];
    let skipped = 0;
    for (const item of list) {
        if (!item || typeof item !== "object") {
            skipped++;
            continue;
        }
        const row = item;
        if (typeof row.id !== "string" || !row.id) {
            skipped++;
            continue;
        }
        models.push(defaultModel({
            id: row.id,
            name: typeof row.name === "string" ? row.name : undefined,
            reasoning: typeof row.reasoning === "boolean" ? row.reasoning : undefined,
            contextWindow: typeof row.context_window === "number"
                ? row.context_window
                : typeof row.contextWindow === "number"
                    ? row.contextWindow
                    : undefined,
            maxTokens: typeof row.max_tokens === "number"
                ? row.max_tokens
                : typeof row.maxTokens === "number"
                    ? row.maxTokens
                    : undefined,
        }));
    }
    return { models, skipped };
}
export async function fetchRemoteModels(opts) {
    const fetchFn = opts.fetchImpl ?? fetch;
    const url = buildModelsUrl(opts.baseUrl);
    const headers = buildAuthHeaders(opts.api, opts.apiKey);
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
        const json = (await res.json());
        const parsed = parseModelsPayload(json);
        return { ok: true, models: parsed.models, skipped: parsed.skipped };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
    }
}
