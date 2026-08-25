export type ApiType = "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
export declare const API_TYPES: ApiType[];
/**
 * Pi thinking levels, ordered from least to most effort.
 * See https://pi.dev/docs/latest/models#thinking-level-map
 */
export declare const THINKING_LEVELS: readonly ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
/**
 * Maps each pi thinking level to a provider-specific value.
 * - `string`  → level is supported; this value is sent to the provider
 * - `null`    → level is unsupported (hidden / skipped / clamped)
 * - omitted   → standard levels through `high` use the provider default;
 *               extended `xhigh` / `max` are unsupported
 */
export type ThinkingLevelMap = Partial<Record<ThinkingLevel, string | null>>;
/**
 * Human-readable labels for the thinking-level presets offered in the TUI.
 * Each preset produces a `ThinkingLevelMap` (or `undefined` to omit the field).
 */
export interface ThinkingPreset {
    id: string;
    label: string;
    hint: string;
    /** `undefined` means "don't write thinkingLevelMap at all" (pi defaults). */
    map: ThinkingLevelMap | undefined;
}
/**
 * Built-in presets shown when configuring a reasoning model.
 * Users can also pick "custom" to define the map level-by-level.
 */
export declare const THINKING_PRESETS: ThinkingPreset[];
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
    thinkingLevelMap?: ThinkingLevelMap;
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
    /** Custom request headers; values support $VAR / !command references. */
    headers?: Record<string, string>;
    /** Provider-level compatibility overrides passed through to pi verbatim. */
    compat?: Record<string, unknown>;
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
/**
 * Returns a compact, human-readable summary of a ThinkingLevelMap for display.
 * Examples: "default (omitted)" | "off·min·low·med·high·xhigh·max" | "off,high,max"
 */
export declare function summarizeThinkingLevelMap(map: ThinkingLevelMap | undefined): string;
