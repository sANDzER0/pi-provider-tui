import { type ApiType, type ModelConfig } from "./types.js";
/**
 * Anthropic's SDK (and therefore pi) appends `/v1/messages` to `baseUrl`, so
 * anthropic-messages providers store the API root WITHOUT `/v1`. Normalize to
 * the versioned root here; a trailing `/v1` is tolerated for legacy entries
 * instead of producing `/v1/v1/…`.
 */
export declare function anthropicApiRoot(baseUrl: string): string;
export declare function buildModelsUrl(baseUrl: string, api?: ApiType): string;
export declare function buildAuthHeaders(api: ApiType, apiKey?: string): Record<string, string>;
export declare function parseModelsPayload(payload: unknown): {
    models: ModelConfig[];
    skipped: number;
};
export declare function fetchRemoteModels(opts: {
    baseUrl: string;
    api: ApiType;
    apiKey?: string;
    /** Custom headers (values may use $VAR / !command references). */
    headers?: Record<string, string>;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}): Promise<{
    ok: true;
    models: ModelConfig[];
    skipped: number;
} | {
    ok: false;
    error: string;
}>;
