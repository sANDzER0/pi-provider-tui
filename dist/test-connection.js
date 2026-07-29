import { buildAuthHeaders } from "./fetch-models.js";
import { fetchWithTimeout, DEFAULT_FETCH_TIMEOUT_MS } from "./http.js";
function joinUrl(baseUrl, suffix) {
    const base = baseUrl.replace(/\/+$/, "");
    const path = suffix.startsWith("/") ? suffix : `/${suffix}`;
    if (base.endsWith(path))
        return base;
    return base + path;
}
export async function testConnection(opts) {
    const fetchFn = opts.fetchImpl ?? fetch;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    const { provider, model } = opts;
    const auth = buildAuthHeaders(provider.api, provider.apiKey);
    // When authHeader is explicitly false, still send provider-specific keys
    // from buildAuthHeaders for anthropic; for openai, omit Bearer if authHeader false.
    let headers = {
        "content-type": "application/json",
        ...auth,
    };
    if (provider.authHeader === false && provider.api !== "anthropic-messages") {
        delete headers.Authorization;
    }
    let url;
    let body;
    if (provider.api === "openai-completions") {
        url = joinUrl(provider.baseUrl, "/chat/completions");
        body = {
            model: model.id,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
        };
    }
    else if (provider.api === "openai-responses") {
        url = joinUrl(provider.baseUrl, "/responses");
        body = {
            model: model.id,
            input: "ping",
            max_output_tokens: 1,
        };
    }
    else {
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
        const res = await fetchWithTimeout(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        }, timeoutMs, fetchFn);
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, detail: msg };
    }
}
