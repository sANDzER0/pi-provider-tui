import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { API_TYPES, } from "./types.js";
export function getModelsPath() {
    if (process.env.PI_MODELS_PATH && process.env.PI_MODELS_PATH.trim()) {
        return path.resolve(process.env.PI_MODELS_PATH);
    }
    return path.join(os.homedir(), ".pi", "agent", "models.json");
}
export function maskKey(key) {
    if (!key)
        return "(none)";
    if (key.length <= 4)
        return "****";
    return "****" + key.slice(-4);
}
function emptyDoc() {
    return { providers: {} };
}
export function normalizeProvider(raw) {
    const obj = raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw
        : {};
    const apiRaw = obj.api;
    const api = typeof apiRaw === "string" && API_TYPES.includes(apiRaw)
        ? apiRaw
        : typeof apiRaw === "string"
            ? apiRaw
            : "openai-completions";
    const models = Array.isArray(obj.models) ? obj.models : [];
    return {
        ...obj,
        name: typeof obj.name === "string" ? obj.name : undefined,
        baseUrl: typeof obj.baseUrl === "string" ? obj.baseUrl : "",
        api,
        apiKey: typeof obj.apiKey === "string" ? obj.apiKey : undefined,
        authHeader: typeof obj.authHeader === "boolean" ? obj.authHeader : undefined,
        models: models,
    };
}
export function normalizeProviders(providers) {
    const out = {};
    for (const [id, raw] of Object.entries(providers)) {
        out[id] = normalizeProvider(raw);
    }
    return out;
}
export async function loadModelsFile(filePath = getModelsPath()) {
    let raw;
    try {
        raw = await fs.readFile(filePath, "utf8");
    }
    catch (err) {
        const code = err.code;
        if (code === "ENOENT")
            return emptyDoc();
        throw err;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error(`Invalid JSON in models file: ${filePath}`);
    }
    if (!parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        !("providers" in parsed) ||
        typeof parsed.providers !== "object" ||
        parsed.providers === null ||
        Array.isArray(parsed.providers)) {
        throw new Error(`Invalid models file shape (expected { providers: object }): ${filePath}`);
    }
    const doc = parsed;
    return {
        ...doc,
        providers: normalizeProviders(doc.providers),
    };
}
export async function saveModelsFile(doc, filePath = getModelsPath()) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = filePath + ".tmp";
    const bak = filePath + ".bak";
    try {
        await fs.access(filePath);
        await fs.copyFile(filePath, bak);
    }
    catch {
        // no existing file — skip bak
    }
    const body = JSON.stringify(doc, null, 2) + "\n";
    await fs.writeFile(tmp, body, { encoding: "utf8", mode: 0o600 });
    await fs.rename(tmp, filePath);
    await fs.chmod(filePath, 0o600);
}
export async function restoreFromBackup(filePath = getModelsPath()) {
    const bak = filePath + ".bak";
    await fs.copyFile(bak, filePath);
    await fs.chmod(filePath, 0o600);
    return loadModelsFile(filePath);
}
export function upsertProvider(doc, id, provider) {
    return {
        ...doc,
        providers: {
            ...doc.providers,
            [id]: provider,
        },
    };
}
export function removeProvider(doc, id) {
    const providers = { ...doc.providers };
    delete providers[id];
    return { ...doc, providers };
}
