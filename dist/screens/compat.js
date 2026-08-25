import * as p from "@clack/prompts";
import { handleCancel } from "../ui-cancel.js";
const BOOL_FIELDS = [
    {
        key: "supportsDeveloperRole",
        label: "supportsDeveloperRole",
        hint: "false → send system prompt as `system` message",
    },
    {
        key: "supportsReasoningEffort",
        label: "supportsReasoningEffort",
        hint: "false → omit reasoning_effort parameter",
    },
    {
        key: "supportsUsageInStreaming",
        label: "supportsUsageInStreaming",
        hint: "false → omit stream_options.include_usage",
    },
    {
        key: "supportsEagerToolInputStreaming",
        label: "supportsEagerToolInputStreaming",
        hint: "false → omit per-tool eager streaming (Anthropic proxies)",
    },
    {
        key: "forceAdaptiveThinking",
        label: "forceAdaptiveThinking",
        hint: "true → adaptive thinking payload (Anthropic)",
    },
    {
        key: "allowEmptySignature",
        label: "allowEmptySignature",
        hint: "true → replay empty thinking signatures (some proxies only)",
    },
    {
        key: "supportsStrictTools",
        label: "supportsStrictTools",
        hint: "true → strict JSON-schema tool definitions accepted",
    },
];
const ENUM_FIELDS = [
    {
        key: "maxTokensField",
        label: "maxTokensField",
        values: ["max_completion_tokens", "max_tokens"],
    },
    {
        key: "thinkingFormat",
        label: "thinkingFormat",
        values: [
            "reasoning_effort",
            "openrouter",
            "deepseek",
            "together",
            "baseten",
            "zai",
            "qwen",
            "chat-template",
            "qwen-chat-template",
        ],
    },
    {
        key: "cacheControlFormat",
        label: "cacheControlFormat",
        values: ["anthropic"],
    },
];
function describe(v) {
    if (v === undefined)
        return "(unset)";
    if (typeof v === "boolean")
        return String(v);
    return JSON.stringify(v);
}
async function editBool(compat, f) {
    const cur = compat[f.key];
    const sel = await p.select({
        message: `${f.label} (current: ${describe(cur)})`,
        options: [
            { value: "unset", label: "Unset", hint: "use pi default" },
            { value: "true", label: "true" },
            { value: "false", label: "false", hint: f.hint },
        ],
        initialValue: cur === true ? "true" : cur === false ? "false" : "unset",
    });
    if (handleCancel(sel))
        return;
    if (sel === "unset")
        delete compat[f.key];
    else
        compat[f.key] = sel === "true";
}
async function editEnum(compat, f) {
    const cur = compat[f.key];
    const sel = await p.select({
        message: `${f.label} (current: ${describe(cur)})`,
        options: [
            { value: "__unset__", label: "Unset", hint: "use pi default" },
            ...f.values.map((v) => ({ value: v, label: v })),
        ],
        initialValue: typeof cur === "string" && f.values.includes(cur) ? cur : "__unset__",
    });
    if (handleCancel(sel))
        return;
    if (sel === "__unset__")
        delete compat[f.key];
    else
        compat[f.key] = sel;
}
function renderCompat(compat) {
    const keys = Object.keys(compat);
    if (keys.length === 0)
        return "(empty)";
    return keys
        .map((k) => `${k}: ${JSON.stringify(compat[k])}`)
        .join("\n");
}
/**
 * Edit a compat object in place-ish: returns a new object or null on cancel.
 */
export async function editCompatScreen(existing) {
    let compat = { ...(existing ?? {}) };
    for (;;) {
        const action = await p.select({
            message: `compat (${Object.keys(compat).length} field(s)) — choose field`,
            options: [
                ...BOOL_FIELDS.map((f) => ({
                    value: `bool:${f.key}`,
                    label: `${f.label} = ${describe(compat[f.key])}`,
                    hint: f.hint,
                })),
                ...ENUM_FIELDS.map((f) => ({
                    value: `enum:${f.key}`,
                    label: `${f.label} = ${describe(compat[f.key])}`,
                })),
                {
                    value: "json",
                    label: "Advanced — paste raw JSON",
                    hint: "merge arbitrary fields (openRouterRouting, chatTemplateKwargs, …)",
                },
                { value: "clear", label: "Clear all" },
                { value: "done", label: "Done" },
            ],
        });
        if (handleCancel(action))
            return null;
        if (action === "done")
            return compat;
        if (action === "clear") {
            compat = {};
            p.log.info("compat cleared.");
            continue;
        }
        if (action === "json") {
            const raw = await p.text({
                message: "Paste compact JSON to merge into compat",
                placeholder: '{"openRouterRouting":{"only":["anthropic"]}}',
                validate: (v) => {
                    if (!v || !v.trim())
                        return undefined; // empty = cancel merge
                    try {
                        const parsed = JSON.parse(v);
                        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                            return "Must be a JSON object";
                        }
                        return undefined;
                    }
                    catch {
                        return "Invalid JSON";
                    }
                },
            });
            if (handleCancel(raw))
                continue;
            const text = String(raw ?? "").trim();
            if (!text)
                continue;
            compat = { ...compat, ...JSON.parse(text) };
            p.note(renderCompat(compat), "compat now");
            continue;
        }
        const [kind, key] = String(action).split(":");
        if (kind === "bool") {
            const f = BOOL_FIELDS.find((x) => x.key === key);
            await editBool(compat, f);
        }
        else if (kind === "enum") {
            const f = ENUM_FIELDS.find((x) => x.key === key);
            await editEnum(compat, f);
        }
    }
}
