import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  API_TYPES,
  type ApiType,
  type ModelsFile,
  type ProviderConfig,
} from "./types.js";

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

export function normalizeProvider(raw: unknown): ProviderConfig {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const apiRaw = obj.api;
  const api: ApiType =
    typeof apiRaw === "string" && (API_TYPES as string[]).includes(apiRaw)
      ? (apiRaw as ApiType)
      : typeof apiRaw === "string"
        ? (apiRaw as ApiType)
        : "openai-completions";
  const models = Array.isArray(obj.models) ? obj.models : [];
  return {
    ...(obj as object),
    name: typeof obj.name === "string" ? obj.name : undefined,
    baseUrl: typeof obj.baseUrl === "string" ? obj.baseUrl : "",
    api,
    apiKey: typeof obj.apiKey === "string" ? obj.apiKey : undefined,
    authHeader:
      typeof obj.authHeader === "boolean" ? obj.authHeader : undefined,
    models: models as ProviderConfig["models"],
  };
}

export function normalizeProviders(
  providers: Record<string, unknown>,
): Record<string, ProviderConfig> {
  const out: Record<string, ProviderConfig> = {};
  for (const [id, raw] of Object.entries(providers)) {
    out[id] = normalizeProvider(raw);
  }
  return out;
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

  const doc = parsed as ModelsFile;
  return {
    ...doc,
    providers: normalizeProviders(
      doc.providers as unknown as Record<string, unknown>,
    ),
  };
}

/** Number of rolling backups kept: models.json.bak.1 … models.json.bak.N */
export const BACKUP_KEEP = 5;

function backupPath(filePath: string, n: number): string {
  return `${filePath}.bak.${n}`;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Shift .bak.N → .bak.(N+1), dropping the oldest. Call before writing bak.1. */
async function rotateBackups(filePath: string): Promise<void> {
  const oldest = backupPath(filePath, BACKUP_KEEP);
  if (await pathExists(oldest)) await fs.rm(oldest);
  for (let i = BACKUP_KEEP - 1; i >= 1; i--) {
    const from = backupPath(filePath, i);
    if (await pathExists(from)) {
      await fs.rename(from, backupPath(filePath, i + 1)).catch(() => {});
    }
  }
}

/** Most recent backup: numbered chain first, then legacy single .bak. */
export async function latestBackupPath(
  filePath: string,
): Promise<string | null> {
  for (let i = 1; i <= BACKUP_KEEP; i++) {
    if (await pathExists(backupPath(filePath, i))) return backupPath(filePath, i);
  }
  if (await pathExists(filePath + ".bak")) return filePath + ".bak";
  return null;
}

export async function saveModelsFile(
  doc: ModelsFile,
  filePath: string = getModelsPath(),
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmp = filePath + ".tmp";

  if (await pathExists(filePath)) {
    await rotateBackups(filePath);
    await fs.copyFile(filePath, backupPath(filePath, 1));
  }

  const body = JSON.stringify(doc, null, 2) + "\n";
  await fs.writeFile(tmp, body, { encoding: "utf8", mode: 0o600 });
  await fs.rename(tmp, filePath);
  await fs.chmod(filePath, 0o600);
}

/** Startup recovery: restore the most recent backup (no history change). */
export async function restoreFromBackup(
  filePath: string = getModelsPath(),
): Promise<ModelsFile> {
  const src = await latestBackupPath(filePath);
  if (!src) throw new Error(`No backup found next to ${filePath}`);
  await fs.copyFile(src, filePath);
  await fs.chmod(filePath, 0o600);
  return loadModelsFile(filePath);
}

/** True when at least one undo step (.bak.1) exists. */
export async function hasUndoHistory(
  filePath: string = getModelsPath(),
): Promise<boolean> {
  return pathExists(backupPath(filePath, 1));
}

/**
 * Revert to the previous write and shift history down, so repeated calls
 * walk back through successive writes.
 */
export async function undoLastWrite(
  filePath: string = getModelsPath(),
): Promise<ModelsFile> {
  const src = backupPath(filePath, 1);
  if (!(await pathExists(src))) {
    throw new Error("No undo history (models.json.bak.1 not found).");
  }
  await fs.rename(src, filePath);
  await fs.chmod(filePath, 0o600);
  for (let i = 2; i <= BACKUP_KEEP; i++) {
    const from = backupPath(filePath, i);
    if (await pathExists(from)) {
      await fs.rename(from, backupPath(filePath, i - 1)).catch(() => {});
    }
  }
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
