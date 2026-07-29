import { type ApiType, type ModelConfig } from "./types.js";
export declare function buildModelsUrl(baseUrl: string): string;
export declare function buildAuthHeaders(api: ApiType, apiKey?: string): Record<string, string>;
export declare function parseModelsPayload(payload: unknown): {
    models: ModelConfig[];
    skipped: number;
};
export declare function fetchRemoteModels(opts: {
    baseUrl: string;
    api: ApiType;
    apiKey?: string;
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
