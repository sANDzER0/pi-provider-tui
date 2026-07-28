import * as p from "@clack/prompts";
import { maskKey, upsertProvider } from "../models-file.js";
import {
  API_TYPES,
  defaultAuthHeader,
  type ApiType,
  type ModelsFile,
  type ProviderConfig,
} from "../types.js";
import { handleCancel } from "../ui-cancel.js";
import { pickModels } from "./models-pick.js";

function isUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
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
  const id = String(idSel);
  let provider: ProviderConfig = { ...doc.providers[id], models: [...doc.providers[id].models] };

  for (;;) {
    const field = await p.select({
      message: `Editing "${id}" — choose field`,
      options: [
        { value: "name", label: `name (${provider.name ?? id})` },
        { value: "baseUrl", label: `baseUrl (${provider.baseUrl})` },
        { value: "api", label: `api (${provider.api})` },
        { value: "apiKey", label: `apiKey (${maskKey(provider.apiKey)})` },
        { value: "authHeader", label: `authHeader (${provider.authHeader})` },
        { value: "models", label: `models (${provider.models.length})` },
        { value: "save", label: "Save & return" },
        { value: "cancel", label: "Cancel without saving" },
      ],
    });
    if (handleCancel(field)) return null;

    switch (field) {
      case "cancel":
        return null;
      case "save": {
        if (!provider.models.length) {
          p.log.error("At least one model required.");
          break;
        }
        const ok = await p.confirm({ message: "Write changes?", initialValue: true });
        if (handleCancel(ok) || !ok) return null;
        return upsertProvider(doc, id, provider);
      }
      case "name": {
        const v = await p.text({ message: "name", initialValue: provider.name ?? id });
        if (handleCancel(v)) return null;
        provider = { ...provider, name: String(v).trim() || id };
        break;
      }
      case "baseUrl": {
        const v = await p.text({
          message: "baseUrl",
          initialValue: provider.baseUrl,
          validate: (x) => (x && isUrl(x.trim()) ? undefined : "Valid URL required"),
        });
        if (handleCancel(v)) return null;
        provider = { ...provider, baseUrl: String(v).trim().replace(/\/+$/, "") };
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
          message: "apiKey (plaintext)",
          initialValue: provider.apiKey ?? "",
        });
        if (handleCancel(v)) return null;
        const apiKey = String(v).trim();
        provider = { ...provider, apiKey: apiKey || undefined };
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
      case "models": {
        const mode = await p.select({
          message: "Models",
          options: [
            { value: "refetch", label: "Re-fetch / re-pick from gateway" },
            { value: "clear-manual", label: "Replace via manual entry only" },
          ],
        });
        if (handleCancel(mode)) return null;
        if (mode === "refetch") {
          const models = await pickModels({
            baseUrl: provider.baseUrl,
            api: provider.api,
            apiKey: provider.apiKey,
          });
          if (models === null) break;
          provider = { ...provider, models };
        } else {
          const models = await pickModels({
            baseUrl: provider.baseUrl,
            api: provider.api,
            apiKey: provider.apiKey,
          });
          // pickModels always tries fetch first; acceptable for v1.
          if (models === null) break;
          provider = { ...provider, models };
        }
        break;
      }
    }
  }
}
