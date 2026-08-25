export type ApiType =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai";

export const API_TYPES: ApiType[] = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
];

/**
 * Pi thinking levels, ordered from least to most effort.
 * See https://pi.dev/docs/latest/models#thinking-level-map
 */
export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

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
export const THINKING_PRESETS: ThinkingPreset[] = [
  {
    id: "default",
    label: "Keep defaults (omit thinkingLevelMap)",
    hint: "Don't write the field; pi maps all standard levels automatically",
    map: undefined,
  },
  {
    id: "all",
    label: "All levels enabled",
    hint: "off / minimal / low / medium / high / xhigh / max all available",
    map: {
      off: "off",
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
  },
  {
    id: "standard",
    label: "Standard only (off / high / max)",
    hint: "Hide minimal / low / medium / xhigh; keep off / high / max",
    map: {
      off: "off",
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: null,
      max: "max",
    },
  },
  {
    id: "always-on",
    label: "Always thinking (cannot disable)",
    hint: "Mark off as unsupported; keep default mapping for the rest",
    map: {
      off: null,
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
  },
];

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

export function defaultAuthHeader(api: ApiType): boolean {
  return api !== "anthropic-messages" && api !== "google-generative-ai";
}

export function defaultModel(
  partial: Partial<ModelConfig> & { id: string },
): ModelConfig {
  const base: ModelConfig = {
    id: partial.id,
    name: partial.name ?? partial.id,
    reasoning: partial.reasoning ?? false,
    input: partial.input ?? ["text"],
    contextWindow: partial.contextWindow ?? 128000,
    maxTokens: partial.maxTokens ?? 16384,
    cost: partial.cost ?? {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
  };
  // Only include thinkingLevelMap when explicitly provided so the field is
  // omitted by default (matching pi's "use provider defaults" behavior).
  if (partial.thinkingLevelMap !== undefined) {
    base.thinkingLevelMap = partial.thinkingLevelMap;
  }
  return base;
}

/**
 * Returns a compact, human-readable summary of a ThinkingLevelMap for display.
 * Examples: "default (omitted)" | "off·min·low·med·high·xhigh·max" | "off,high,max"
 */
export function summarizeThinkingLevelMap(
  map: ThinkingLevelMap | undefined,
): string {
  if (map === undefined) return "default (omitted)";
  const supported = THINKING_LEVELS.filter((lvl) => {
    const v = map[lvl];
    return v !== undefined && v !== null;
  });
  if (supported.length === THINKING_LEVELS.length) return "all levels";
  if (supported.length === 0) return "none (all disabled)";
  return supported.join("·");
}
