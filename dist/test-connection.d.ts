import type { ModelConfig, ProviderConfig } from "./types.js";
export declare function testConnection(opts: {
    provider: ProviderConfig;
    model: ModelConfig;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}): Promise<{
    ok: boolean;
    status?: number;
    detail: string;
}>;
