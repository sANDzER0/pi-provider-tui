import * as p from "@clack/prompts";
import { fetchRemoteModels } from "../fetch-models.js";
import { defaultModel } from "../types.js";
import { handleCancel } from "../ui-cancel.js";
function positiveNumberValidate(v) {
    return v && Number.isFinite(Number(v)) && Number(v) > 0
        ? undefined
        : "Positive number required";
}
async function promptReasoning(message, initial) {
    const reasoningSel = await p.select({
        message,
        options: [
            { value: "yes", label: "Yes (reasoning: true)" },
            { value: "no", label: "No (reasoning: false)" },
        ],
        initialValue: initial ? "yes" : "no",
    });
    if (handleCancel(reasoningSel))
        return null;
    return reasoningSel === "yes";
}
async function promptLimits(label, defaults) {
    const contextWindowRaw = await p.text({
        message: `${label} contextWindow (context length)`,
        initialValue: String(defaults.contextWindow),
        validate: positiveNumberValidate,
    });
    if (handleCancel(contextWindowRaw))
        return null;
    const maxTokensRaw = await p.text({
        message: `${label} maxTokens (max output length)`,
        initialValue: String(defaults.maxTokens),
        validate: positiveNumberValidate,
    });
    if (handleCancel(maxTokensRaw))
        return null;
    return {
        contextWindow: Number(contextWindowRaw),
        maxTokens: Number(maxTokensRaw),
    };
}
/**
 * After remote multiselect: set reasoning + contextWindow + maxTokens per model.
 * Multi-select can share one limit set, or configure each model individually.
 */
export async function configureSelectedModels(models) {
    if (models.length === 0)
        return models;
    if (models.length === 1) {
        const m = models[0];
        const reasoning = await promptReasoning(`Does "${m.id}" support reasoning/thinking?`, m.reasoning);
        if (reasoning === null)
            return null;
        const limits = await promptLimits(`"${m.id}"`, {
            contextWindow: m.contextWindow,
            maxTokens: m.maxTokens,
        });
        if (limits === null)
            return null;
        return [{ ...m, reasoning, ...limits }];
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
    if (handleCancel(mode))
        return null;
    if (mode === "shared") {
        const reasoning = await promptReasoning("Do all selected models support reasoning/thinking?", models.some((m) => m.reasoning));
        if (reasoning === null)
            return null;
        const limits = await promptLimits("All models", {
            contextWindow: models[0].contextWindow,
            maxTokens: models[0].maxTokens,
        });
        if (limits === null)
            return null;
        return models.map((m) => ({ ...m, reasoning, ...limits }));
    }
    const out = [];
    for (let i = 0; i < models.length; i++) {
        const m = models[i];
        p.log.step(`Model ${i + 1}/${models.length}: ${m.id}`);
        const reasoning = await promptReasoning(`Does "${m.id}" support reasoning/thinking?`, m.reasoning);
        if (reasoning === null)
            return null;
        const limits = await promptLimits(`"${m.id}"`, {
            contextWindow: m.contextWindow,
            maxTokens: m.maxTokens,
        });
        if (limits === null)
            return null;
        out.push({ ...m, reasoning, ...limits });
    }
    return out;
}
/** @deprecated use configureSelectedModels — kept name for clarity in older call sites */
export async function applyReasoningFlags(models) {
    return configureSelectedModels(models);
}
/** Prompt for one new model (manual). */
export async function promptNewModel() {
    const id = await p.text({
        message: "Model id",
        validate: (v) => (v && v.trim() ? undefined : "Required"),
    });
    if (handleCancel(id))
        return null;
    const name = await p.text({
        message: "Model name (Enter = id)",
        placeholder: String(id),
    });
    if (handleCancel(name))
        return null;
    const reasoning = await promptReasoning("Supports reasoning/thinking?", false);
    if (reasoning === null)
        return null;
    const limits = await promptLimits("Model", {
        contextWindow: 128000,
        maxTokens: 16384,
    });
    if (limits === null)
        return null;
    return defaultModel({
        id: String(id).trim(),
        name: String(name || id).trim() || String(id).trim(),
        reasoning,
        contextWindow: limits.contextWindow,
        maxTokens: limits.maxTokens,
    });
}
/** Edit fields of an existing model (id can be changed). */
export async function editOneModel(existing) {
    const id = await p.text({
        message: "Model id",
        initialValue: existing.id,
        validate: (v) => (v && v.trim() ? undefined : "Required"),
    });
    if (handleCancel(id))
        return null;
    const name = await p.text({
        message: "Model name",
        initialValue: existing.name,
    });
    if (handleCancel(name))
        return null;
    const reasoning = await promptReasoning("Supports reasoning/thinking?", existing.reasoning);
    if (reasoning === null)
        return null;
    const limits = await promptLimits(`"${String(id).trim()}"`, {
        contextWindow: existing.contextWindow,
        maxTokens: existing.maxTokens,
    });
    if (limits === null)
        return null;
    return defaultModel({
        id: String(id).trim(),
        name: String(name || id).trim() || String(id).trim(),
        reasoning,
        contextWindow: limits.contextWindow,
        maxTokens: limits.maxTokens,
        input: existing.input,
        cost: existing.cost,
    });
}
export async function manualModels() {
    const models = [];
    for (;;) {
        const one = await promptNewModel();
        if (one === null)
            return null;
        models.push(one);
        const again = await p.confirm({
            message: "Add another model?",
            initialValue: false,
        });
        if (handleCancel(again))
            return null;
        if (!again)
            break;
    }
    return models;
}
export async function pickModels(opts) {
    if (!opts.skipFetch) {
        const spinner = p.spinner();
        spinner.start("Fetching models from gateway…");
        const result = await fetchRemoteModels({
            baseUrl: opts.baseUrl,
            api: opts.api,
            apiKey: opts.apiKey,
        });
        spinner.stop(result.ok
            ? `Fetched ${result.models.length} model(s)`
            : `Fetch failed: ${result.error}`);
        if (result.ok && result.models.length > 0) {
            if (result.skipped > 0) {
                p.log.warn(`Skipped ${result.skipped} unparseable entries`);
            }
            // Clack multiselect: Space toggles, Enter submits.
            // required:true blocks empty submit (was falling through to manual).
            // Single model: pre-check so Enter alone works.
            const initialValues = result.models.length === 1 ? [result.models[0].id] : undefined;
            p.log.info("Tip: Space = check/uncheck, Enter = confirm selection.");
            const selected = await p.multiselect({
                message: "Select models (Space to check, Enter to confirm)",
                options: result.models.map((m) => ({
                    value: m.id,
                    label: m.name === m.id ? m.id : `${m.name} (${m.id})`,
                })),
                required: true,
                initialValues,
            });
            if (handleCancel(selected))
                return null;
            const ids = selected;
            if (ids.length > 0) {
                const byId = new Map(result.models.map((m) => [m.id, m]));
                const chosen = ids
                    .map((id) => byId.get(id))
                    .filter((m) => Boolean(m));
                return configureSelectedModels(chosen);
            }
            p.log.info("No models selected — enter manually.");
        }
        else if (result.ok) {
            p.log.info("Remote list empty — enter models manually.");
        }
        else {
            p.log.warn("Falling back to manual model entry.");
        }
    }
    for (;;) {
        const manual = await manualModels();
        if (manual === null)
            return null;
        if (manual.length > 0)
            return manual;
        p.log.error("At least one model is required.");
    }
}
