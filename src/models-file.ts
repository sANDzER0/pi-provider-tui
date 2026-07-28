import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ModelsFile, ProviderConfig } from "./types.js";

export function getModelsPath(): string {
  if (process.env.PI_MODELS_PATH && process.env.PI_MODELS_PATH.trim()) {
    return path.resolve(process.env.PI_MODELS_PATH);
  }
  return path.join(os.homedir(), ".pi", "agent", "models.json");
}

export function maskKey(key: string | undefined): string {
  if (!key) return "(none)";
  if (key.length <= 4) return "****";
  return "****" + key.slice(-4);
}

function emptyDoc(): ModelsFile {
  return { providers: {} };
}

export async function loadModelsFile(
  filePath: string = getModelsPath(),
): Promise<ModelsFile> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyDoc();
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in models file: ${filePath}`);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !("providers" in parsed) ||
    typeof (parsed as ModelsFile).providers !== "object" ||
    (parsed as ModelsFile).providers === null ||
    Array.isArray((parsed as ModelsFile).providers)
  ) {
    throw new Error(
      `Invalid models file shape (expected { providers: object }): ${filePath}`,
    );
  }

  return parsed as ModelsFile;
}

export async function saveModelsFile(
  doc: ModelsFile,
  filePath: string = getModelsPath(),
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmp = filePath + ".tmp";
  const bak = filePath + ".bak";

  try {
    await fs.access(filePath);
    await fs.copyFile(filePath, bak);
  } catch {
    // no existing file — skip bak
  }

  const body = JSON.stringify(doc, null, 2) + "\n";
  await fs.writeFile(tmp, body, { encoding: "utf8", mode: 0o600 });
  await fs.rename(tmp, filePath);
  await fs.chmod(filePath, 0o600);
}

export async function restoreFromBackup(
  filePath: string = getModelsPath(),
): Promise<ModelsFile> {
  const bak = filePath + ".bak";
  await fs.copyFile(bak, filePath);
  await fs.chmod(filePath, 0o600);
  return loadModelsFile(filePath);
}

export function upsertProvider(
  doc: ModelsFile,
  id: string,
  provider: ProviderConfig,
): ModelsFile {
  return {
    ...doc,
    providers: {
      ...doc.providers,
      [id]: provider,
    },
  };
}

export function removeProvider(doc: ModelsFile, id: string): ModelsFile {
  const providers = { ...doc.providers };
  delete providers[id];
  return { ...doc, providers };
}
