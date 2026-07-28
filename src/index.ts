#!/usr/bin/env node
import * as p from "@clack/prompts";
import {
  getModelsPath,
  loadModelsFile,
  restoreFromBackup,
  saveModelsFile,
} from "./models-file.js";
import type { ModelsFile } from "./types.js";
import { handleCancel } from "./ui-cancel.js";
import { addProvider } from "./screens/add.js";
import { editProvider } from "./screens/edit.js";
import { listProviders } from "./screens/list.js";
import { removeProviderScreen } from "./screens/remove.js";
import { testProviderScreen } from "./screens/test.js";

async function loadOrRecover(): Promise<ModelsFile> {
  const filePath = getModelsPath();
  try {
    const doc = await loadModelsFile(filePath);
    return doc;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(msg);
    p.log.info(`Path: ${filePath}`);
    const tryRestore = await p.confirm({
      message: "Restore from models.json.bak if present?",
      initialValue: true,
    });
    if (handleCancel(tryRestore) || !tryRestore) {
      p.cancel("Fix the file manually, then re-run.");
      process.exit(1);
    }
    try {
      return await restoreFromBackup(filePath);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      p.log.error(`Restore failed: ${m}`);
      process.exit(1);
    }
  }
}

async function main(): Promise<void> {
  p.intro("pi-provider-tui");
  p.log.info(`models.json → ${getModelsPath()}`);

  let doc = await loadOrRecover();

  for (;;) {
    const action = await p.select({
      message: "Main menu",
      options: [
        { value: "list", label: "List providers" },
        { value: "add", label: "Add provider" },
        { value: "edit", label: "Edit provider" },
        { value: "remove", label: "Remove provider" },
        { value: "test", label: "Test connection" },
        { value: "quit", label: "Quit" },
      ],
    });

    if (handleCancel(action) || action === "quit") {
      p.outro("Bye");
      return;
    }

    try {
      if (action === "list") {
        listProviders(doc);
        continue;
      }
      if (action === "test") {
        await testProviderScreen(doc);
        continue;
      }

      let next: ModelsFile | null = null;
      if (action === "add") next = await addProvider(doc);
      else if (action === "edit") next = await editProvider(doc);
      else if (action === "remove") next = await removeProviderScreen(doc);

      if (next) {
        await saveModelsFile(next);
        doc = next;
        p.log.success(`Saved ${getModelsPath()}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      p.log.error(msg);
      // reload from disk to avoid divergent in-memory state after failed save
      try {
        doc = await loadModelsFile();
      } catch {
        // keep previous in-memory doc
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
