export const API_TYPES = [
    "openai-completions",
    "openai-responses",
    "anthropic-messages",
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
        label: "保留默认 (omit thinkingLevelMap)",
        hint: "不写入 thinkingLevelMap，由 pi 自动映射所有标准档位",
        map: undefined,
    },
    {
        id: "all",
        label: "保留全部档位",
        hint: "off / minimal / low / medium / high / xhigh / max 全部可用",
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
        label: "仅标准档位 (off / high / max)",
        hint: "隐藏 minimal / low / medium / xhigh，保留 off / high / max",
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
        label: "无法关闭 (always thinking)",
        hint: "off 设为不支持，其余档位保留默认",
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
    return api !== "anthropic-messages";
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
