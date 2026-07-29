export const API_TYPES = [
    "openai-completions",
    "openai-responses",
    "anthropic-messages",
];
export function defaultAuthHeader(api) {
    return api !== "anthropic-messages";
}
export function defaultModel(partial) {
    return {
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
}
