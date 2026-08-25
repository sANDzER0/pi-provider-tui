import * as p from "@clack/prompts";
import { fetchRemoteModels } from "../fetch-models.js";
import { testConnection } from "../test-connection.js";
import { handleCancel } from "../ui-cancel.js";
export async function testProviderScreen(doc) {
    const ids = Object.keys(doc.providers);
    if (ids.length === 0) {
        p.log.warn("No providers configured.");
        return;
    }
    const id = await p.select({
        message: "Provider",
        options: ids.map((i) => ({ value: i, label: i })),
    });
    if (handleCancel(id))
        return;
    const provider = doc.providers[String(id)];
    const mode = await p.select({
        message: "Test mode",
        options: [
            {
                value: "endpoint",
                label: "Endpoint + auth check",
                hint: "GET /models — no tokens used",
            },
            {
                value: "full",
                label: "Full request",
                hint: "tiny completion — may cost tokens",
            },
        ],
        initialValue: "endpoint",
    });
    if (handleCancel(mode))
        return;
    if (mode === "endpoint") {
        const spinner = p.spinner();
        spinner.start("Checking /models endpoint…");
        const res = await fetchRemoteModels({
            baseUrl: provider.baseUrl,
            api: provider.api,
            apiKey: provider.apiKey,
            headers: provider.headers,
        });
        spinner.stop(res.ok ? "OK" : "Failed");
        if (res.ok) {
            p.log.success(`Endpoint reachable, auth OK — ${res.models.length} model(s) listed` +
                (res.skipped ? `, ${res.skipped} unparseable` : ""));
        }
        else {
            p.log.error(res.error);
        }
        return;
    }
    const models = provider.models ?? [];
    if (!models.length) {
        p.log.error("Provider has no models.");
        return;
    }
    const modelId = await p.select({
        message: "Model",
        options: models.map((m) => ({
            value: m.id,
            label: m.name === m.id ? m.id : `${m.name} (${m.id})`,
        })),
    });
    if (handleCancel(modelId))
        return;
    const model = models.find((m) => m.id === String(modelId));
    const spinner = p.spinner();
    spinner.start("Testing connection…");
    const result = await testConnection({ provider, model });
    spinner.stop(result.ok ? "OK" : "Failed");
    if (result.ok) {
        p.log.success(`status=${result.status ?? "?"} ${result.detail.slice(0, 200)}`);
    }
    else {
        p.log.error(result.detail);
    }
}
