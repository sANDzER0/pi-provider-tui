/**
 * Heuristics that pre-fill likely-correct defaults for models discovered from
 * gateways. All guesses are initial values only — every prompt still lets the
 * user override them.
 */
/** Best-effort guess whether a model id belongs to a reasoning model. */
export declare function guessReasoning(modelId: string): boolean;
