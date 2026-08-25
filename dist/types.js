export const API_TYPES = [
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
];
/**
 * Built-in presets shown when configuring a reasoning model.
 * Users can also pick "custom" to define the map level-by-level.
 */
export const THINKING_PRESETS = [
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
export function defaultAuthHeader(api) {
    return api !== "anthropic-messages" && api !== "google-generative-ai";
}
export function defaultModel(partial) {
    const base = {
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
export function summarizeThinkingLevelMap(map) {
    if (map === undefined)
        return "default (omitted)";
    const supported = THINKING_LEVELS.filter((lvl) => {
        const v = map[lvl];
        return v !== undefined && v !== null;
    });
    if (supported.length === THINKING_LEVELS.length)
        return "all levels";
    if (supported.length === 0)
        return "none (all disabled)";
    return supported.join("·");
}
