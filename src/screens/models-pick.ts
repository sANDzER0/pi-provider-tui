import * as p from "@clack/prompts";
import { fetchRemoteModels } from "../fetch-models.js";
import { guessReasoning } from "../heuristics.js";
import {
  defaultModel,
  THINKING_LEVELS,
  THINKING_PRESETS,
  type ApiType,
  type ModelConfig,
  type ModelCost,
  type ThinkingLevelMap,
} from "../types.js";
import { handleCancel } from "../ui-cancel.js";

/**
 * Prompt the user to configure a thinkingLevelMap for a reasoning model.
 * Returns `ThinkingLevelMap | undefined` (undefined = omit the field),
 * or `null` on cancel.
 */
export async function promptThinkingLevelMap(
  existing?: ThinkingLevelMap,
): Promise<ThinkingLevelMap | undefined | null> {
  // Build preset options, plus a "custom" entry.
  const presetOptions = THINKING_PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.label,
    hint: preset.hint,
  }));

  const sel = await p.select({
    message: "Thinking level map",
    options: [
      ...presetOptions,
      {
        value: "custom",
        label: "Customize levels…",
        hint: "Configure each thinking level individually",
      },
    ],
  });
  if (handleCancel(sel)) return null;

  if (sel !== "custom") {
    const preset = THINKING_PRESETS.find((pr) => pr.id === sel);
    return preset?.map; // may be undefined ("default" preset)
  }

  // --- Custom: configure each level ---
  p.log.info(
    "For each level choose: keep (send this value), disable (hide it), or default (omit).",
  );
  const map: ThinkingLevelMap = {};
  for (const level of THINKING_LEVELS) {
    const existingVal = existing?.[level];
    const initialHint =
      existingVal === null
        ? "disabled"
        : existingVal === undefined
          ? "default"
          : existingVal;

    const choice = await p.select({
      message: `Level "${level}" (current: ${initialHint})`,
      options: [
        { value: "keep", label: `Keep — send "${level}"`, hint: "level available" },
        { value: "disable", label: "Disable — set to null", hint: "hide/skip this level" },
        { value: "default", label: "Default — omit", hint: "let pi decide" },
      ],
    });
    if (handleCancel(choice)) return null;

    if (choice === "keep") {
      map[level] = String(level);
    } else if (choice === "disable") {
      map[level] = null;
    }
    // "default" → don't add the key (omitted)
  }

  // If the custom map is empty (all defaults), return undefined to omit.
  if (Object.keys(map).length === 0) return undefined;
  return map;
}

/**
 * Convenience: if `reasoning` is true, ask for thinkingLevelMap.
 * Returns the map (or undefined), or null on cancel.
 */
async function maybePromptThinkingLevelMap(
  reasoning: boolean,
  existing?: ThinkingLevelMap,
): Promise<ThinkingLevelMap | undefined | null> {
  if (!reasoning) return undefined;
  return promptThinkingLevelMap(existing);
}

function positiveNumberValidate(v: string | undefined): string | undefined {
  return v && Number.isFinite(Number(v)) && Number(v) > 0
    ? undefined
    : "Positive number required";
}

function nonNegativeNumberValidate(v: string | undefined): string | undefined {
  return v && Number.isFinite(Number(v)) && Number(v) >= 0
    ? undefined
    : "Non-negative number required";
}

function isZeroCost(cost: ModelCost | undefined): boolean {
  if (!cost) return true;
  return (
    cost.input === 0 &&
    cost.output === 0 &&
    cost.cacheRead === 0 &&
    cost.cacheWrite === 0
  );
}

/** Prompt for per-million-token pricing rates. */
async function promptCost(
  label: string,
  existing: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
): Promise<ModelCost | null> {
  const fields: Array<{ key: keyof ModelCost; msg: string }> = [
    { key: "input", msg: `${label} cost.input ($/M input tokens)` },
    { key: "output", msg: `${label} cost.output ($/M output tokens)` },
    { key: "cacheRead", msg: `${label} cost.cacheRead ($/M cached-input tokens)` },
    { key: "cacheWrite", msg: `${label} cost.cacheWrite ($/M cache-write tokens)` },
  ];
  const cost: ModelCost = { ...existing };
  for (const f of fields) {
    const v = await p.text({
      message: f.msg,
      initialValue: String(existing[f.key] ?? 0),
      validate: nonNegativeNumberValidate,
      placeholder: "0",
    });
    if (handleCancel(v)) return null;
    cost[f.key] = Number(v);
  }
  return cost;
}

/** Prompt for input modalities (text / image). */
async function promptInputModalities(
  existing: Array<"text" | "image"> = ["text"],
): Promise<Array<"text" | "image"> | null> {
  const sel = await p.multiselect({
    message: "Input modalities (Space to toggle, Enter to confirm)",
    options: [
      { value: "text", label: "text" },
      { value: "image", label: "image" },
    ],
    initialValues: existing.length ? existing : ["text"],
    required: true,
  });
  if (handleCancel(sel)) return null;
  const list = sel as string[];
  return list.includes("text") ? (list as Array<"text" | "image">) : ["text"];
}

/**
 * Ask for cost + input modalities. Cost editing is behind a confirm so the
 * common zero-cost gateway/local path stays fast.
 * Returns `{ cost, input }` or null on cancel.
 */
export async function promptCostAndInput(existing?: {
  cost?: ModelCost;
  input?: Array<"text" | "image">;
}): Promise<{ cost: ModelCost; input: Array<"text" | "image"> } | null> {
  const editCost = await p.confirm({
    message: "Configure token pricing? (leave zeros for free/local models)",
    initialValue: !isZeroCost(existing?.cost),
  });
  if (handleCancel(editCost)) return null;

  let cost: ModelCost = existing?.cost ?? {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
  if (editCost) {
    const c = await promptCost("Model", existing?.cost);
    if (c === null) return null;
    cost = c;
  }

  const input = await promptInputModalities(existing?.input);
  if (input === null) return null;
  return { cost, input };
}

async function promptReasoning(
  message: string,
  initial: boolean,
): Promise<boolean | null> {
  const reasoningSel = await p.select({
    message,
    options: [
      { value: "yes", label: "Yes (reasoning: true)" },
      { value: "no", label: "No (reasoning: false)" },
    ],
    initialValue: initial ? "yes" : "no",
  });
  if (handleCancel(reasoningSel)) return null;
  return reasoningSel === "yes";
}

async function promptLimits(
  label: string,
  defaults: { contextWindow: number; maxTokens: number },
): Promise<{ contextWindow: number; maxTokens: number } | null> {
  const contextWindowRaw = await p.text({
    message: `${label} contextWindow (context length)`,
    initialValue: String(defaults.contextWindow),
    validate: positiveNumberValidate,
  });
  if (handleCancel(contextWindowRaw)) return null;

  const maxTokensRaw = await p.text({
    message: `${label} maxTokens (max output length)`,
    initialValue: String(defaults.maxTokens),
    validate: positiveNumberValidate,
  });
  if (handleCancel(maxTokensRaw)) return null;

  return {
    contextWindow: Number(contextWindowRaw),
    maxTokens: Number(maxTokensRaw),
  };
}

/**
 * After remote multiselect: set reasoning + contextWindow + maxTokens per model.
 * Multi-select can share one limit set, or configure each model individually.
 */
export async function configureSelectedModels(
  models: ModelConfig[],
): Promise<ModelConfig[] | null> {
  if (models.length === 0) return models;

  if (models.length === 1) {
    const m = models[0];
    const reasoning = await promptReasoning(
      `Does "${m.id}" support reasoning/thinking?`,
      m.reasoning,
    );
    if (reasoning === null) return null;
    const tlm = await maybePromptThinkingLevelMap(reasoning, m.thinkingLevelMap);
    if (tlm === null) return null;
    const limits = await promptLimits(`"${m.id}"`, {
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
    });
    if (limits === null) return null;
    const extras = await promptCostAndInput({ cost: m.cost, input: m.input });
    if (extras === null) return null;
    return [
      { ...m, reasoning, thinkingLevelMap: tlm, ...limits, ...extras },
    ];
  }

  const mode = await p.select({
    message: `Configure ${models.length} selected models`,
    options: [
      {
        value: "shared",
        label: "Same reasoning + limits for all",
      },
      {
        value: "each",
        label: "Configure each model separately",
      },
    ],
    initialValue: "each",
  });
  if (handleCancel(mode)) return null;

  if (mode === "shared") {
    const reasoning = await promptReasoning(
      "Do all selected models support reasoning/thinking?",
      models.some((m) => m.reasoning),
    );
    if (reasoning === null) return null;
    const tlm = await maybePromptThinkingLevelMap(reasoning, models[0]?.thinkingLevelMap);
    if (tlm === null) return null;
    const limits = await promptLimits("All models", {
      contextWindow: models[0].contextWindow,
      maxTokens: models[0].maxTokens,
    });
    if (limits === null) return null;
    const extras = await promptCostAndInput();
    if (extras === null) return null;
    return models.map((m) => ({
      ...m,
      reasoning,
      thinkingLevelMap: tlm,
      ...limits,
      ...extras,
    }));
  }

  const out: ModelConfig[] = [];
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    p.log.step(`Model ${i + 1}/${models.length}: ${m.id}`);
    const reasoning = await promptReasoning(
      `Does "${m.id}" support reasoning/thinking?`,
      m.reasoning,
    );
    if (reasoning === null) return null;
    const tlm = await maybePromptThinkingLevelMap(reasoning, m.thinkingLevelMap);
    if (tlm === null) return null;
    const limits = await promptLimits(`"${m.id}"`, {
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
    });
    if (limits === null) return null;
    const extras = await promptCostAndInput({ cost: m.cost, input: m.input });
    if (extras === null) return null;
    out.push({ ...m, reasoning, thinkingLevelMap: tlm, ...limits, ...extras });
  }
  return out;
}

/** @deprecated use configureSelectedModels — kept name for clarity in older call sites */
export async function applyReasoningFlags(
  models: ModelConfig[],
): Promise<ModelConfig[] | null> {
  return configureSelectedModels(models);
}

/** Prompt for one new model (manual). */
export async function promptNewModel(): Promise<ModelConfig | null> {
  const id = await p.text({
    message: "Model id",
    validate: (v) => (v && v.trim() ? undefined : "Required"),
  });
  if (handleCancel(id)) return null;

  const name = await p.text({
    message: "Model name (Enter = id)",
    placeholder: String(id),
  });
  if (handleCancel(name)) return null;

  const reasoning = await promptReasoning(
    "Supports reasoning/thinking?",
    guessReasoning(String(id)),
  );
  if (reasoning === null) return null;

  const tlm = await maybePromptThinkingLevelMap(reasoning);
  if (tlm === null) return null;

  const limits = await promptLimits("Model", {
    contextWindow: 128000,
    maxTokens: 16384,
  });
  if (limits === null) return null;

  const extras = await promptCostAndInput();
  if (extras === null) return null;

  return defaultModel({
    id: String(id).trim(),
    name: String(name || id).trim() || String(id).trim(),
    reasoning,
    thinkingLevelMap: tlm,
    contextWindow: limits.contextWindow,
    maxTokens: limits.maxTokens,
    input: extras.input,
    cost: extras.cost,
  });
}

/** Edit fields of an existing model (id can be changed). */
export async function editOneModel(
  existing: ModelConfig,
): Promise<ModelConfig | null> {
  const id = await p.text({
    message: "Model id",
    initialValue: existing.id,
    validate: (v) => (v && v.trim() ? undefined : "Required"),
  });
  if (handleCancel(id)) return null;

  const name = await p.text({
    message: "Model name",
    initialValue: existing.name,
  });
  if (handleCancel(name)) return null;

  const reasoning = await promptReasoning(
    "Supports reasoning/thinking?",
    existing.reasoning,
  );
  if (reasoning === null) return null;

  const tlm = await maybePromptThinkingLevelMap(reasoning, existing.thinkingLevelMap);
  if (tlm === null) return null;

  const limits = await promptLimits(`"${String(id).trim()}"`, {
    contextWindow: existing.contextWindow,
    maxTokens: existing.maxTokens,
  });
  if (limits === null) return null;

  const extras = await promptCostAndInput({ cost: existing.cost, input: existing.input });
  if (extras === null) return null;

  return defaultModel({
    id: String(id).trim(),
    name: String(name || id).trim() || String(id).trim(),
    reasoning,
    thinkingLevelMap: tlm,
    contextWindow: limits.contextWindow,
    maxTokens: limits.maxTokens,
    input: extras.input,
    cost: extras.cost,
  });
}

export async function manualModels(): Promise<ModelConfig[] | null> {
  const models: ModelConfig[] = [];
  for (;;) {
    const one = await promptNewModel();
    if (one === null) return null;
    models.push(one);

    const again = await p.confirm({
      message: "Add another model?",
      initialValue: false,
    });
    if (handleCancel(again)) return null;
    if (!again) break;
  }
  return models;
}

/** Show the keyword filter prompt only for long model lists. */
const FILTER_PROMPT_THRESHOLD = 15;

export async function pickModels(opts: {
  baseUrl: string;
  api: ApiType;
  apiKey?: string;
  skipFetch?: boolean;
}): Promise<ModelConfig[] | null> {
  if (!opts.skipFetch) {
    const spinner = p.spinner();
    spinner.start("Fetching models from gateway…");
    const result = await fetchRemoteModels({
      baseUrl: opts.baseUrl,
      api: opts.api,
      apiKey: opts.apiKey,
    });
    spinner.stop(
      result.ok
        ? `Fetched ${result.models.length} model(s)`
        : `Fetch failed: ${result.error}`,
    );

    if (result.ok && result.models.length > 0) {
      if (result.skipped > 0) {
        p.log.warn(`Skipped ${result.skipped} unparseable entries`);
      }

      // Optional keyword filter keeps huge gateway lists manageable.
      let candidates = result.models;
      if (candidates.length > FILTER_PROMPT_THRESHOLD) {
        const kw = await p.text({
          message: `Filter by keyword? (${candidates.length} models — empty shows all)`,
          placeholder: "e.g. sonnet, gpt, gemini",
        });
        if (handleCancel(kw)) return null;
        const q = String(kw ?? "")
          .trim()
          .toLowerCase();
        if (q) {
          candidates = candidates.filter(
            (m) =>
              m.id.toLowerCase().includes(q) ||
              m.name.toLowerCase().includes(q),
          );
          if (candidates.length === 0) {
            p.log.warn(`No models match "${q}" — showing all.`);
            candidates = result.models;
          } else {
            p.log.info(`${candidates.length} model(s) match "${q}".`);
          }
        }
      }

      // Clack multiselect: Space toggles, Enter submits.
      // required:true blocks empty submit (was falling through to manual).
      // Single model: pre-check so Enter alone works.
      const initialValues =
        candidates.length === 1 ? [candidates[0].id] : undefined;

      p.log.info("Tip: Space = check/uncheck, Enter = confirm selection.");
      const selected = await p.multiselect({
        message: `Select models (${candidates.length}) — Space to check, Enter to confirm`,
        options: candidates.map((m) => ({
          value: m.id,
          label: m.name === m.id ? m.id : `${m.name} (${m.id})`,
        })),
        required: true,
        initialValues,
      });
      if (handleCancel(selected)) return null;

      const ids = selected as string[];
      if (ids.length > 0) {
        const byId = new Map(result.models.map((m) => [m.id, m]));
        const chosen = ids
          .map((id) => byId.get(id))
          .filter((m): m is ModelConfig => Boolean(m));
        return configureSelectedModels(chosen);
      }
      p.log.info("No models selected — enter manually.");
    } else if (result.ok) {
      p.log.info("Remote list empty — enter models manually.");
    } else {
      p.log.warn("Falling back to manual model entry.");
    }
  }

  for (;;) {
    const manual = await manualModels();
    if (manual === null) return null;
    if (manual.length > 0) return manual;
    p.log.error("At least one model is required.");
  }
}
