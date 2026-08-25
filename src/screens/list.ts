import * as p from "@clack/prompts";
import { maskKey } from "../models-file.js";
import { paginatedNote } from "../paginate.js";
import type { ModelsFile } from "../types.js";

export async function listProviders(doc: ModelsFile): Promise<void> {
  const ids = Object.keys(doc.providers);
  if (ids.length === 0) {
    p.note("No providers configured.", "Providers");
    return;
  }
  const lines = ids.map((id) => {
    const pr = doc.providers[id];
    const name = pr.name ?? id;
    const n = pr.models?.length ?? 0;
    return `${id}  |  ${name}  |  ${pr.api}  |  ${pr.baseUrl}  |  models:${n}  |  key:${maskKey(pr.apiKey)}`;
  });
  await paginatedNote(`Providers (${ids.length})`, lines);
}
