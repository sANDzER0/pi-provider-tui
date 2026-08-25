import * as p from "@clack/prompts";
import { maskKey, removeProvider, upsertProvider } from "../models-file.js";
import {
  API_TYPES,
  defaultAuthHeader,
  summarizeThinkingLevelMap,
  type ApiType,
  type ModelConfig,
  type ModelsFile,
  type ProviderConfig,
} from "../types.js";
import { handleCancel } from "../ui-cancel.js";
import { editCompatScreen } from "./compat.js";
import { editHeadersScreen } from "./headers.js";
import {
  editOneModel,
  manualModels,
  pickModels,
  promptNewModel,
} from "./models-pick.js";

function isUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function modelLabel(m: ModelConfig): string {
  const bits = [
    m.name === m.id ? m.id : `${m.name} (${m.id})`,
    m.reasoning ? "reasoning" : "no-reasoning",
  ];
  if (m.reasoning) {
    bits.push(`thinking=${summarizeThinkingLevelMap(m.thinkingLevelMap)}`);
  }
  bits.push(`ctx=${m.contextWindow}`, `out=${m.maxTokens}`);
  return bits.join(" · ");
}

function listModelsNote(models: ModelConfig[]): void {
  if (models.length === 0) {
    p.note("(none)", "Models");
    return;
  }
  p.note(
    models.map((m, i) => `${i + 1}. ${modelLabel(m)}`).join("\n"),
    `Models (${models.length})`,
  );
}

async function selectModelIndex(
  models: ModelConfig[],
  message: string,
): Promise<number | null> {
  if (models.length === 0) {
    p.log.warn("No models in this provider.");
    return null;
  }
  const sel = await p.select({
    message,
    options: models.map((m, i) => ({
      value: String(i),
      label: modelLabel(m),
    })),
  });
  if (handleCancel(sel)) return null;
  return Number(sel);
}

async function editModelsMenu(
  provider: ProviderConfig,
): Promise<ProviderConfig | null> {
  let models = [...(provider.models ?? [])];

  for (;;) {
    const action = await p.select({
      message: `Models (${models.length}) — choose action`,
      options: [
        { value: "list", label: "List models" },
        { value: "add-manual", label: "Add model (manual)" },
        { value: "add-fetch", label: "Add models from gateway (keep existing)" },
        { value: "edit-one", label: "Edit one model" },
        { value: "remove", label: "Remove model(s)" },
        {
          value: "replace-fetch",
          label: "Replace all — re-fetch / re-pick from gateway",
        },
        {
          value: "replace-manual",
          label: "Replace all — manual entry only",
        },
        { value: "back", label: "Back to provider fields" },
      ],
    });
    if (handleCancel(action)) return null;

    switch (action) {
      case "back":
        return { ...provider, models };

      case "list":
        listModelsNote(models);
        break;

      case "add-manual": {
        const one = await promptNewModel();
        if (one === null) break;
        if (models.some((m) => m.id === one.id)) {
          const overwrite = await p.confirm({
            message: `Model id "${one.id}" already exists. Overwrite it?`,
            initialValue: false,
          });
          if (handleCancel(overwrite) || !overwrite) break;
          models = models.map((m) => (m.id === one.id ? one : m));
        } else {
          models = [...models, one];
        }
        p.log.success(`Added ${one.id}`);
        break;
      }

      case "add-fetch": {
        const added = await pickModels({
          baseUrl: provider.baseUrl,
          api: provider.api,
          apiKey: provider.apiKey,
          headers: provider.headers,
        });
        if (added === null) break;
        const byId = new Map(models.map((m) => [m.id, m]));
        const conflicts = added.filter((m) => byId.has(m.id));
        let overwrite = true;
        if (conflicts.length > 0) {
          const strat = await p.select({
            message: `${conflicts.length} fetched model(s) already exist locally`,
            options: [
              {
                value: "keep",
                label: "Keep local settings",
                hint: "only add brand-new ids; local edits preserved",
              },
              {
                value: "overwrite",
                label: "Overwrite with fetched values",
                hint: "replace existing entries by id",
              },
            ],
            initialValue: "keep",
          });
          if (handleCancel(strat)) break;
          overwrite = strat === "overwrite";
        }
        let overwrote = 0;
        for (const m of added) {
          if (byId.has(m.id)) {
            overwrote++;
            if (!overwrite) continue;
          }
          byId.set(m.id, m);
        }
        models = [...byId.values()];
        p.log.success(
          `Merged ${added.length} model(s)` +
            (overwrote
              ? overwrite
                ? ` (${overwrote} overwritten by id)`
                : ` (${overwrote} kept local)`
              : ""),
        );
        break;
      }

      case "edit-one": {
        const idx = await selectModelIndex(models, "Edit which model?");
        if (idx === null) break;
        const updated = await editOneModel(models[idx]);
        if (updated === null) break;
        const conflict =
          updated.id !== models[idx].id &&
          models.some((m, i) => i !== idx && m.id === updated.id);
        if (conflict) {
          p.log.error(`Model id "${updated.id}" already exists.`);
          break;
        }
        models = models.map((m, i) => (i === idx ? updated : m));
        p.log.success(`Updated ${updated.id}`);
        break;
      }

      case "remove": {
        if (models.length === 0) {
          p.log.warn("No models to remove.");
          break;
        }
        if (models.length === 1) {
          p.log.error("Cannot remove the last model (at least one required).");
          break;
        }
        p.log.info("Space = check, Enter = confirm.");
        const toRemove = await p.multiselect({
          message: "Remove which models?",
          options: models.map((m) => ({
            value: m.id,
            label: modelLabel(m),
          })),
          required: true,
        });
        if (handleCancel(toRemove)) break;
        const removeSet = new Set(toRemove as string[]);
        const next = models.filter((m) => !removeSet.has(m.id));
        if (next.length === 0) {
          p.log.error("Cannot remove all models (at least one required).");
          break;
        }
        models = next;
        p.log.success(`Removed ${removeSet.size}; ${models.length} left`);
        break;
      }

      case "replace-fetch": {
        const next = await pickModels({
          baseUrl: provider.baseUrl,
          api: provider.api,
          apiKey: provider.apiKey,
          headers: provider.headers,
        });
        if (next === null) break;
        models = next;
        p.log.success(`Replaced with ${models.length} model(s)`);
        break;
      }

      case "replace-manual": {
        for (;;) {
          const next = await manualModels();
          if (next === null) break;
          if (next.length > 0) {
            models = next;
            p.log.success(`Replaced with ${models.length} model(s)`);
            break;
          }
          p.log.error("At least one model is required.");
        }
        break;
      }
    }
  }
}

export async function editProvider(
  doc: ModelsFile,
): Promise<ModelsFile | null> {
  const ids = Object.keys(doc.providers);
  if (ids.length === 0) {
    p.log.warn("No providers to edit.");
    return null;
  }
  const idSel = await p.select({
    message: "Edit which provider?",
    options: ids.map((i) => ({ value: i, label: i })),
  });
  if (handleCancel(idSel)) return null;
  const originalId = String(idSel);
  let id = originalId;
  const existing = doc.providers[id];
  let provider: ProviderConfig = {
    ...existing,
    models: [...(existing.models ?? [])],
  };

  for (;;) {
    const field = await p.select({
      message: `Editing "${id}" — choose field`,
      options: [
        { value: "rename", label: `rename id (${id})` },
        { value: "name", label: `name (${provider.name ?? id})` },
        { value: "baseUrl", label: `baseUrl (${provider.baseUrl})` },
        { value: "api", label: `api (${provider.api})` },
        { value: "apiKey", label: `apiKey (${maskKey(provider.apiKey)})` },
        { value: "authHeader", label: `authHeader (${provider.authHeader})` },
        {
          value: "headers",
          label: `headers (${Object.keys(provider.headers ?? {}).length})`,
          hint: "custom request headers",
        },
        {
          value: "compat",
          label: `compat (${Object.keys(provider.compat ?? {}).length})`,
          hint: "pi compatibility overrides",
        },
        {
          value: "models",
          label: `models (${(provider.models ?? []).length})`,
        },
        { value: "save", label: "Save & return" },
        { value: "cancel", label: "Cancel without saving" },
      ],
    });
    if (handleCancel(field)) return null;

    switch (field) {
      case "cancel":
        return null;
      case "save": {
        if (!(provider.models ?? []).length) {
          p.log.error("At least one model required.");
          break;
        }
        const ok = await p.confirm({
          message: "Write changes?",
          initialValue: true,
        });
        if (handleCancel(ok) || !ok) return null;
        let next = upsertProvider(doc, id, provider);
        if (id !== originalId) {
          next = removeProvider(next, originalId);
        }
        return next;
      }
      case "rename": {
        const v = await p.text({
          message: "New provider id",
          initialValue: id,
          validate: (x) => (x && x.trim() ? undefined : "Required"),
        });
        if (handleCancel(v)) return null;
        const newId = String(v).trim();
        if (newId === id) break;
        if (doc.providers[newId]) {
          p.log.error(`Provider "${newId}" already exists.`);
          break;
        }
        p.log.success(`Will save as "${newId}" on write.`);
        id = newId;
        break;
      }
      case "name": {
        const v = await p.text({
          message: "name",
          initialValue: provider.name ?? id,
        });
        if (handleCancel(v)) return null;
        provider = { ...provider, name: String(v).trim() || id };
        break;
      }
      case "baseUrl": {
        const v = await p.text({
          message: "baseUrl",
          initialValue: provider.baseUrl,
          validate: (x) =>
            x && isUrl(x.trim()) ? undefined : "Valid URL required",
        });
        if (handleCancel(v)) return null;
        provider = {
          ...provider,
          baseUrl: String(v).trim().replace(/\/+$/, ""),
        };
        break;
      }
      case "api": {
        const v = await p.select({
          message: "api",
          options: API_TYPES.map((a) => ({ value: a, label: a })),
          initialValue: provider.api,
        });
        if (handleCancel(v)) return null;
        const api = v as ApiType;
        provider = {
          ...provider,
          api,
          authHeader: provider.authHeader ?? defaultAuthHeader(api),
        };
        break;
      }
      case "apiKey": {
        const v = await p.text({
          message: "apiKey (leave empty to keep current)",
          placeholder: provider.apiKey
            ? "•••• keep current / enter new"
            : "enter new key",
          initialValue: "",
        });
        if (handleCancel(v)) return null;
        const apiKey = String(v).trim();
        if (apiKey) {
          provider = { ...provider, apiKey };
        }
        break;
      }
      case "authHeader": {
        const v = await p.confirm({
          message: "authHeader",
          initialValue: provider.authHeader ?? defaultAuthHeader(provider.api),
        });
        if (handleCancel(v)) return null;
        provider = { ...provider, authHeader: Boolean(v) };
        break;
      }
      case "headers": {
        const next = await editHeadersScreen(provider.headers);
        if (next === null) break;
        const cleaned = { ...provider };
        if (Object.keys(next).length > 0) cleaned.headers = next;
        else delete cleaned.headers;
        provider = cleaned;
        break;
      }
      case "compat": {
        const next = await editCompatScreen(provider.compat);
        if (next === null) break;
        const cleaned = { ...provider };
        if (Object.keys(next).length > 0) cleaned.compat = next;
        else delete cleaned.compat;
        provider = cleaned;
        break;
      }
      case "models": {
        const next = await editModelsMenu(provider);
        if (next === null) break;
        provider = next;
        break;
      }
    }
  }
}
