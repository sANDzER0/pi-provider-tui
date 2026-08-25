import { parseArgs } from "node:util";
import { examineDoc } from "./doctor.js";
import { guessReasoning } from "./heuristics.js";
import { getModelsPath, hasUndoHistory, loadModelsFile, removeProvider, saveModelsFile, undoLastWrite, upsertProvider, } from "./models-file.js";
import { fetchRemoteModels } from "./fetch-models.js";
import { testConnection } from "./test-connection.js";
import { defaultModel, API_TYPES } from "./types.js";
/** Non-interactive CLI mode. Returns process exit code. */
const USAGE = `pi-provider-tui — manage pi custom model providers

Usage:
  pi-provider-tui                       Interactive TUI (default)
  pi-provider-tui <command> [options]

Commands:
  add      --id ID --base-url URL --api TYPE [--name NAME] [--key KEY]
           [--auth-header true|false] [--models a,b,c] [--json] [-y]
  list     [--json]
  get      --id ID
  remove   --id ID [-y]
  test     --id ID [--model MODEL] [--mode endpoint|full] [--json]
  doctor   [--json]
  undo     [-y]
  help

Options shared by all commands:
  PI_MODELS_PATH env var overrides the config path (default ~/.pi/agent/models.json)

API types: ${API_TYPES.join(", ")}

Examples:
  pi-provider-tui add --id my-gw --base-url https://gw.example.com/v1 \\
      --api openai-completions --key '$MY_KEY' --models foo,bar -y
  pi-provider-tui test --id my-gw --mode endpoint
  pi-provider-tui doctor --json

Exit codes: 0 ok, 1 operation failed, 2 usage error.`;
function usageError(message) {
    console.error(`error: ${message}`);
    console.error(USAGE);
    process.exit(2);
}
function info(msg) {
    console.log(msg);
}
function die(message) {
    console.error(`error: ${message}`);
    return 1;
}
function asApi(v) {
    if (!v || !API_TYPES.includes(v)) {
        usageError(`--api must be one of: ${API_TYPES.join(", ")}`);
    }
    return v;
}
async function loadOrFail() {
    try {
        return await loadModelsFile();
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${msg}\nRestore manually from models.json.bak.1 if present.`);
    }
}
async function cmdAdd(argv) {
    const { values } = parseArgs({
        args: argv,
        options: {
            id: { type: "string" },
            "base-url": { type: "string" },
            api: { type: "string" },
            name: { type: "string" },
            key: { type: "string" },
            "auth-header": { type: "string" },
            models: { type: "string" },
            json: { type: "boolean", default: false },
            y: { type: "boolean", default: false },
        },
        allowPositionals: false,
    });
    const id = values.id?.trim() || usageError("--id is required");
    const baseUrlRaw = values["base-url"] || usageError("--base-url is required");
    let baseUrl;
    try {
        baseUrl = new URL(baseUrlRaw);
    }
    catch {
        usageError("--base-url must be a valid http(s) URL");
    }
    if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
        usageError("--base-url must be http(s)");
    }
    const api = asApi(values.api);
    const authHeader = values["auth-header"] === undefined
        ? undefined
        : !["false", "0", "no"].includes(values["auth-header"].toLowerCase());
    const doc = await loadOrFail();
    if (doc.providers[id] && !values.y) {
        return die(`Provider "${id}" already exists. Re-run with -y to overwrite.`);
    }
    // Build models: explicit CSV wins; otherwise fetch everything from gateway.
    let modelList;
    const csv = values.models
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (csv && csv.length > 0) {
        modelList = csv.map((mid) => defaultModel({ id: mid, reasoning: guessReasoning(mid) }));
    }
    else {
        const res = await fetchRemoteModels({
            baseUrl: baseUrl.toString().replace(/\/+$/, ""),
            api,
            apiKey: values.key || undefined,
        });
        if (!res.ok) {
            return die(`Fetching models failed (${res.error}). Pass --models a,b,c to define them manually.`);
        }
        if (res.models.length === 0) {
            return die("Gateway listed no models. Pass --models a,b,c.");
        }
        modelList = res.models;
    }
    const prev = doc.providers[id];
    const cleanBase = baseUrl.toString().replace(/\/+$/, "");
    const nextDoc = upsertProvider(doc, id, {
        ...(prev ?? {}),
        // On overwrite, keep previous name/apiKey unless explicitly provided.
        name: values.name?.trim() || prev?.name || id,
        baseUrl: cleanBase,
        api,
        ...(values.key ? { apiKey: values.key } : {}),
        ...(authHeader !== undefined ? { authHeader } : {}),
        models: modelList,
    });
    await saveModelsFile(nextDoc);
    const written = nextDoc.providers[id];
    if (values.json) {
        console.log(JSON.stringify({ id, provider: written }, null, 2));
    }
    else {
        info(`Saved ${getModelsPath()} — provider "${id}" with ${modelList.length} model(s).`);
    }
    return 0;
}
async function cmdList(argv) {
    const { values } = parseArgs({
        args: argv,
        options: { json: { type: "boolean", default: false } },
    });
    const doc = await loadOrFail();
    const ids = Object.keys(doc.providers);
    if (values.json) {
        console.log(JSON.stringify(doc.providers, null, 2));
        return 0;
    }
    if (ids.length === 0) {
        info("No providers configured.");
        return 0;
    }
    for (const id of ids) {
        const pr = doc.providers[id];
        const key = pr.apiKey
            ? pr.apiKey.startsWith("!") || pr.apiKey.startsWith("$")
                ? pr.apiKey
                : `****${pr.apiKey.slice(-4)}`
            : "(none)";
        info(`${id}  |  ${pr.name ?? id}  |  ${pr.api ?? "?"}  |  ${pr.baseUrl}  |  models:${pr.models?.length ?? 0}  |  key:${key}`);
    }
    return 0;
}
async function cmdGet(argv) {
    const { values } = parseArgs({
        args: argv,
        options: { id: { type: "string" } },
    });
    const id = values.id?.trim() || usageError("--id is required");
    const doc = await loadOrFail();
    const provider = doc.providers[id];
    if (!provider)
        return die(`No provider "${id}".`);
    console.log(JSON.stringify(provider, null, 2));
    return 0;
}
async function cmdRemove(argv) {
    const { values } = parseArgs({
        args: argv,
        options: { id: { type: "string" }, y: { type: "boolean", default: false } },
    });
    const id = values.id?.trim() || usageError("--id is required");
    const doc = await loadOrFail();
    if (!doc.providers[id])
        return die(`No provider "${id}".`);
    if (!values.y) {
        return die(`Refusing to delete "${id}" without -y.`);
    }
    await saveModelsFile(removeProvider(doc, id));
    info(`Removed "${id}" from ${getModelsPath()}.`);
    return 0;
}
async function cmdTest(argv) {
    const { values } = parseArgs({
        args: argv,
        options: {
            id: { type: "string" },
            model: { type: "string" },
            mode: { type: "string", default: "endpoint" },
            json: { type: "boolean", default: false },
        },
    });
    const id = values.id?.trim() || usageError("--id is required");
    const mode = values.mode === "full" ? "full" : values.mode === "endpoint" ? "endpoint" : usageError("--mode must be endpoint|full");
    const doc = await loadOrFail();
    const provider = doc.providers[id];
    if (!provider)
        return die(`No provider "${id}".`);
    if (mode === "endpoint") {
        const res = await fetchRemoteModels({
            baseUrl: provider.baseUrl,
            api: provider.api,
            apiKey: provider.apiKey,
            headers: provider.headers,
        });
        if (res.ok) {
            if (values.json) {
                console.log(JSON.stringify({ ok: true, mode, models: res.models.length, skipped: res.skipped }, null, 2));
            }
            else {
                info(`OK — endpoint reachable, auth accepted (${res.models.length} model(s) listed).`);
            }
            return 0;
        }
        if (values.json)
            console.log(JSON.stringify({ ok: false, mode, error: res.error }, null, 2));
        else
            console.error(`FAILED: ${res.error}`);
        return 1;
    }
    const modelId = values.model ?? provider.models?.[0]?.id;
    if (!modelId)
        return die("Provider has no models; pass --model.");
    const model = provider.models?.find((m) => m.id === modelId);
    if (!model)
        return die(`No model "${modelId}" in provider "${id}".`);
    const res = await testConnection({ provider, model });
    if (values.json) {
        console.log(JSON.stringify(res, null, 2));
    }
    else if (res.ok) {
        info(`OK — status=${res.status ?? "?"} ${res.detail.slice(0, 200)}`);
    }
    else {
        console.error(`FAILED: ${res.detail}`);
    }
    return res.ok ? 0 : 1;
}
async function cmdDoctor(argv) {
    const { values } = parseArgs({
        args: argv,
        options: { json: { type: "boolean", default: false } },
    });
    const doc = await loadOrFail();
    const issues = examineDoc(doc);
    const errors = issues.filter((i) => i.level === "error").length;
    const warns = issues.filter((i) => i.level === "warn").length;
    const infos = issues.filter((i) => i.level === "info").length;
    if (values.json) {
        console.log(JSON.stringify({ errors, warns, infos, issues }, null, 2));
    }
    else if (issues.length === 0) {
        info("All checks passed.");
    }
    else {
        for (const i of issues) {
            const scope = [i.provider, i.model].filter(Boolean).join(" › ");
            const icon = i.level === "error" ? "✖" : i.level === "warn" ? "▲" : "ℹ";
            info(`${icon} ${scope ? `${scope} — ` : ""}${i.message}`);
        }
        info(`\n${errors} error(s), ${warns} warning(s), ${infos} info`);
    }
    return errors > 0 ? 1 : 0;
}
async function cmdUndo(argv) {
    const { values } = parseArgs({
        args: argv,
        options: { y: { type: "boolean", default: false } },
    });
    const filePath = getModelsPath();
    if (!values.y) {
        return die("Undo rewrites the config from backup; re-run with -y to confirm.");
    }
    if (!(await hasUndoHistory(filePath))) {
        return die("No undo history (no numbered backups found).");
    }
    const doc = await undoLastWrite(filePath);
    info(`Undid last write. ${Object.keys(doc.providers).length} provider(s) now in ${filePath}.`);
    return 0;
}
export async function runCli(argv) {
    const [cmd, ...rest] = argv;
    switch (cmd) {
        case "add":
            return cmdAdd(rest);
        case "list":
            return cmdList(rest);
        case "get":
            return cmdGet(rest);
        case "remove":
            return cmdRemove(rest);
        case "test":
            return cmdTest(rest);
        case "doctor":
            return cmdDoctor(rest);
        case "undo":
            return cmdUndo(rest);
        case "help":
        case "--help":
        case "-h":
            info(USAGE);
            return 0;
        default:
            usageError(`unknown command "${cmd ?? ""}"`);
    }
}
