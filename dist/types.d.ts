export type ApiType = "openai-completions" | "openai-responses" | "anthropic-messages";
export declare const API_TYPES: ApiType[];
export interface ModelCost {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
}
export interface ModelConfig {
    id: string;
    name: string;
    reasoning: boolean;
    input: Array<"text" | "image">;
    contextWindow: number;
    maxTokens: number;
    cost: ModelCost;
}
export interface ProviderConfig {
    name?: string;
    baseUrl: string;
    api: ApiType;
    apiKey?: string;
    authHeader?: boolean;
    models: ModelConfig[];
}
export interface ModelsFile {
    providers: Record<string, ProviderConfig>;
    [key: string]: unknown;
}
export declare function defaultAuthHeader(api: ApiType): boolean;
export declare function defaultModel(partial: Partial<ModelConfig> & {
    id: string;
}): ModelConfig;
