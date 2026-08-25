import { fetchWithTimeout, DEFAULT_FETCH_TIMEOUT_MS } from "./http.js";
import { isReferenceValue, resolveHeaders, resolveValue } from "./env-resolve.js";
import { guessReasoning } from "./heuristics.js";
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
    if (api === "google-generative-ai") {
        return { "x-goog-api-key": apiKey };
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
function optionalNumber(...values) {
    for (const v of values) {
        if (typeof v === "number" && Number.isFinite(v))
            return v;
    }
    return undefined;
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
        // google-generative-ai rows carry "name": "models/<id>" and no id field
        const rawId = typeof row.id === "string" && row.id
            ? row.id
            : typeof row.name === "string"
                ? row.name.replace(/^models\//i, "")
                : "";
        if (!rawId) {
            skipped++;
            continue;
        }
        // Skip non-generation entries (embeddings, aqa, …) when the gateway tells us
        if (Array.isArray(row.supportedGenerationMethods)) {
            const methods = row.supportedGenerationMethods.filter((m) => typeof m === "string");
            if (methods.length > 0 && !methods.includes("generateContent")) {
                skipped++;
                continue;
            }
        }
        const displayName = typeof row.displayName === "string" && row.displayName
            ? row.displayName
            : typeof row.name === "string" && !/^models\//i.test(row.name)
                ? row.name
                : undefined;
        models.push(defaultModel({
            id: rawId,
            name: displayName,
            // Heuristic initial value; user confirms/overrides per model next.
            reasoning: typeof row.reasoning === "boolean" ? row.reasoning : guessReasoning(rawId),
            contextWindow: optionalNumber(row.context_window, row.contextWindow, row.inputTokenLimit),
            maxTokens: optionalNumber(row.max_tokens, row.maxTokens, row.outputTokenLimit),
        }));
    }
    return { models, skipped };
}
export async function fetchRemoteModels(opts) {
    const fetchFn = opts.fetchImpl ?? fetch;
    const url = buildModelsUrl(opts.baseUrl);
    // Resolve $VAR / !command references before use (pi does the same at request time).
    let apiKey = opts.apiKey;
    if (apiKey && isReferenceValue(apiKey)) {
        const res = await resolveValue(apiKey);
        if (!res.ok)
            return { ok: false, error: res.error };
        apiKey = res.value;
    }
    const headers = buildAuthHeaders(opts.api, apiKey);
    // Custom provider headers win over auth defaults.
    const custom = await resolveHeaders(opts.headers);
    if (!custom.ok)
        return { ok: false, error: custom.error };
    Object.assign(headers, custom.value);
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
