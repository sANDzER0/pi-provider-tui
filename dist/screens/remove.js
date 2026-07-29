import * as p from "@clack/prompts";
import { removeProvider } from "../models-file.js";
import { handleCancel } from "../ui-cancel.js";
export async function removeProviderScreen(doc) {
    const ids = Object.keys(doc.providers);
    if (ids.length === 0) {
        p.log.warn("No providers to remove.");
        return null;
    }
    const id = await p.select({
        message: "Remove which provider?",
        options: ids.map((i) => ({ value: i, label: i })),
    });
    if (handleCancel(id))
        return null;
    const ok = await p.confirm({
        message: `Delete provider "${String(id)}"?`,
        initialValue: false,
    });
    if (handleCancel(ok) || !ok)
        return null;
    return removeProvider(doc, String(id));
}
