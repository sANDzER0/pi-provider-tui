import { type ModelsFile, type ProviderConfig } from "./types.js";
export declare function getModelsPath(): string;
export declare function maskKey(key: string | undefined): string;
export declare function normalizeProvider(raw: unknown): ProviderConfig;
export declare function normalizeProviders(providers: Record<string, unknown>): Record<string, ProviderConfig>;
export declare function loadModelsFile(filePath?: string): Promise<ModelsFile>;
/** Number of rolling backups kept: models.json.bak.1 … models.json.bak.N */
export declare const BACKUP_KEEP = 5;
/** Most recent backup: numbered chain first, then legacy single .bak. */
export declare function latestBackupPath(filePath: string): Promise<string | null>;
export declare function saveModelsFile(doc: ModelsFile, filePath?: string): Promise<void>;
/** Startup recovery: restore the most recent backup (no history change). */
export declare function restoreFromBackup(filePath?: string): Promise<ModelsFile>;
/** True when at least one undo step (.bak.1) exists. */
export declare function hasUndoHistory(filePath?: string): Promise<boolean>;
/**
 * Revert to the previous write and shift history down, so repeated calls
 * walk back through successive writes.
 */
export declare function undoLastWrite(filePath?: string): Promise<ModelsFile>;
export declare function upsertProvider(doc: ModelsFile, id: string, provider: ProviderConfig): ModelsFile;
export declare function removeProvider(doc: ModelsFile, id: string): ModelsFile;
