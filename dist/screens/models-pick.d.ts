import { type ApiType, type ModelConfig, type ThinkingLevelMap } from "../types.js";
/**
 * Prompt the user to configure a thinkingLevelMap for a reasoning model.
 * Returns `ThinkingLevelMap | undefined` (undefined = omit the field),
 * or `null` on cancel.
 */
export declare function promptThinkingLevelMap(existing?: ThinkingLevelMap): Promise<ThinkingLevelMap | undefined | null>;
/**
 * After remote multiselect: set reasoning + contextWindow + maxTokens per model.
 * Multi-select can share one limit set, or configure each model individually.
 */
export declare function configureSelectedModels(models: ModelConfig[]): Promise<ModelConfig[] | null>;
/** @deprecated use configureSelectedModels — kept name for clarity in older call sites */
export declare function applyReasoningFlags(models: ModelConfig[]): Promise<ModelConfig[] | null>;
/** Prompt for one new model (manual). */
export declare function promptNewModel(): Promise<ModelConfig | null>;
/** Edit fields of an existing model (id can be changed). */
export declare function editOneModel(existing: ModelConfig): Promise<ModelConfig | null>;
export declare function manualModels(): Promise<ModelConfig[] | null>;
export declare function pickModels(opts: {
    baseUrl: string;
    api: ApiType;
    apiKey?: string;
    skipFetch?: boolean;
}): Promise<ModelConfig[] | null>;
