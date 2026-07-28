export type ApiType =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages";

export const API_TYPES: ApiType[] = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
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

export function defaultAuthHeader(api: ApiType): boolean {
  return api !== "anthropic-messages";
}

export function defaultModel(
  partial: Partial<ModelConfig> & { id: string },
): ModelConfig {
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
