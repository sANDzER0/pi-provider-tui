import * as p from "@clack/prompts";
import { maskKey, upsertProvider } from "../models-file.js";
import { isReferenceValue } from "../env-resolve.js";
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

export async function addProvider(
  doc: ModelsFile,
): Promise<ModelsFile | null> {
  const idRaw = await p.text({
    message: "Provider id (kebab-case recommended)",
    placeholder: "my-gateway",
    validate: (v) => (v && v.trim() ? undefined : "Required"),
  });
  if (handleCancel(idRaw)) return null;
  const id = String(idRaw).trim();

  if (doc.providers[id]) {
    const overwrite = await p.confirm({
      message: `Provider "${id}" exists. Overwrite?`,
      initialValue: false,
    });
    if (handleCancel(overwrite) || !overwrite) return null;
  }

  const nameRaw = await p.text({
    message: "Display name (Enter = id)",
    placeholder: id,
  });
  if (handleCancel(nameRaw)) return null;

  const baseUrlRaw = await p.text({
    message: "baseUrl",
    placeholder: "https://api.example.com/v1",
    validate: (v) => (v && isUrl(v.trim()) ? undefined : "Valid http(s) URL required"),
  });
  if (handleCancel(baseUrlRaw)) return null;
  const baseUrl = String(baseUrlRaw).trim().replace(/\/+$/, "");

  const apiSel = await p.select({
    message: "API type",
    options: API_TYPES.map((a) => ({ value: a, label: a })),
  });
  if (handleCancel(apiSel)) return null;
  const api = apiSel as ApiType;

  const apiKeyRaw = await p.text({
    message: "apiKey (empty allowed; $VAR / !command references supported)",
    placeholder: "sk-... | $MY_API_KEY | !op read 'op://vault/key'",
  });
  if (handleCancel(apiKeyRaw)) return null;
  const apiKey = String(apiKeyRaw ?? "").trim();
  if (apiKey && isReferenceValue(apiKey)) {
    p.log.info("Reference value — resolved at request time by pi and this tool.");
  } else if (!apiKey) {
    p.log.warn("Empty apiKey — models may be unavailable in pi /model until auth is set.");
  }

  const authHeader = await p.confirm({
    message: "Send Authorization Bearer via authHeader?",
    initialValue: defaultAuthHeader(api),
  });
  if (handleCancel(authHeader)) return null;

  const models = await pickModels({ baseUrl, api, apiKey: apiKey || undefined });
  if (models === null) return null;
  if (models.length === 0) {
    p.log.error("At least one model required.");
    return null;
  }

  const provider: ProviderConfig = {
    name: String(nameRaw || id).trim() || id,
    baseUrl,
    api,
    ...(apiKey ? { apiKey } : {}),
    authHeader: Boolean(authHeader),
    models,
  };

  const preview = {
    ...provider,
    apiKey: maskKey(provider.apiKey),
  };
  p.note(JSON.stringify({ [id]: preview }, null, 2), "Preview (key masked)");

  const ok = await p.confirm({ message: "Write to models.json?", initialValue: true });
  if (handleCancel(ok) || !ok) return null;

  return upsertProvider(doc, id, provider);
}
