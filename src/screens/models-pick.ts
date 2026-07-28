import * as p from "@clack/prompts";
import { fetchRemoteModels } from "../fetch-models.js";
import { defaultModel, type ApiType, type ModelConfig } from "../types.js";
import { handleCancel } from "../ui-cancel.js";

export async function manualModels(): Promise<ModelConfig[] | null> {
  const models: ModelConfig[] = [];
  for (;;) {
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

    const reasoning = await p.confirm({
      message: "Supports reasoning/thinking?",
      initialValue: false,
    });
    if (handleCancel(reasoning)) return null;

    const contextWindowRaw = await p.text({
      message: "contextWindow",
      initialValue: "128000",
      validate: (v) =>
        v && Number.isFinite(Number(v)) && Number(v) > 0
          ? undefined
          : "Positive number required",
    });
    if (handleCancel(contextWindowRaw)) return null;

    const maxTokensRaw = await p.text({
      message: "maxTokens",
      initialValue: "16384",
      validate: (v) =>
        v && Number.isFinite(Number(v)) && Number(v) > 0
          ? undefined
          : "Positive number required",
    });
    if (handleCancel(maxTokensRaw)) return null;

    models.push(
      defaultModel({
        id: String(id).trim(),
        name: String(name || id).trim() || String(id).trim(),
        reasoning: Boolean(reasoning),
        contextWindow: Number(contextWindowRaw),
        maxTokens: Number(maxTokensRaw),
      }),
    );

    const again = await p.confirm({
      message: "Add another model?",
      initialValue: false,
    });
    if (handleCancel(again)) return null;
    if (!again) break;
  }
  return models;
}

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
      const selected = await p.multiselect({
        message: "Select models (space to toggle)",
        options: result.models.map((m) => ({
          value: m.id,
          label: m.name === m.id ? m.id : `${m.name} (${m.id})`,
        })),
        required: false,
      });
      if (handleCancel(selected)) return null;

      const ids = selected as string[];
      if (ids.length > 0) {
        const byId = new Map(result.models.map((m) => [m.id, m]));
        return ids.map((id) => byId.get(id)!).filter(Boolean);
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
