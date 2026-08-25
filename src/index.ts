#!/usr/bin/env node
import * as p from "@clack/prompts";
import { runCli } from "./cli.js";
import {
  getModelsPath,
  hasUndoHistory,
  loadModelsFile,
  restoreFromBackup,
  saveModelsFile,
  undoLastWrite,
} from "./models-file.js";
import type { ModelsFile } from "./types.js";
import { handleCancel } from "./ui-cancel.js";
import { addProvider } from "./screens/add.js";
import { runDoctorScreen } from "./screens/doctor.js";
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
  // Non-interactive CLI mode when arguments are present.
  const argv = process.argv.slice(2);
  if (argv.length > 0) {
    const code = await runCli(argv);
    process.exit(code);
  }

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
        { value: "doctor", label: "Run health checks (doctor)" },
        { value: "undo", label: "Undo last write" },
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
      if (action === "doctor") {
        runDoctorScreen(doc);
        continue;
      }
      if (action === "undo") {
        if (!(await hasUndoHistory())) {
          p.log.warn("No undo history — nothing written yet.");
          continue;
        }
        const ok = await p.confirm({
          message: "Restore models.json from the last write's backup?",
          initialValue: false,
        });
        if (handleCancel(ok) || !ok) continue;
        doc = await undoLastWrite();
        p.log.success("Undid last write.");
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
