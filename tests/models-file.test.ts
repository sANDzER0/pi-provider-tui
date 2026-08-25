import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadModelsFile,
  saveModelsFile,
  upsertProvider,
  removeProvider,
  maskKey,
  restoreFromBackup,
  undoLastWrite,
  hasUndoHistory,
  latestBackupPath,
  BACKUP_KEEP,
  normalizeProvider,
  normalizeProviders,
} from "../src/models-file.ts";
import { defaultModel } from "../src/types.ts";
import type { ModelsFile, ProviderConfig } from "../src/types.ts";

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "pi-provider-tui-"));
}

const sampleProvider = (): ProviderConfig => ({
  name: "Test",
  baseUrl: "https://api.example.com/v1",
  api: "openai-completions",
  apiKey: "sk-secret-abcd",
  authHeader: true,
  models: [defaultModel({ id: "m1" })],
});

describe("maskKey", () => {
  it("masks long keys to last 4", () => {
    assert.equal(maskKey("sk-secret-abcd"), "****abcd");
  });
  it("handles empty", () => {
    assert.equal(maskKey(undefined), "(none)");
    assert.equal(maskKey(""), "(none)");
  });
});

describe("loadModelsFile", () => {
  it("returns empty providers when file missing", async () => {
    const dir = await tempDir();
    const p = path.join(dir, "models.json");
    const doc = await loadModelsFile(p);
    assert.deepEqual(doc.providers, {});
  });

  it("throws on invalid JSON", async () => {
    const dir = await tempDir();
    const p = path.join(dir, "models.json");
    await fs.writeFile(p, "{not-json", "utf8");
    await assert.rejects(() => loadModelsFile(p), /invalid|JSON|parse/i);
  });

  it("loads valid file and preserves extra top-level keys", async () => {
    const dir = await tempDir();
    const p = path.join(dir, "models.json");
    const raw = {
      providers: { a: sampleProvider() },
      futureField: 1,
    };
    await fs.writeFile(p, JSON.stringify(raw, null, 2), "utf8");
    const doc = await loadModelsFile(p);
    assert.equal(doc.futureField, 1);
    assert.ok(doc.providers.a);
  });

  it("normalizes providers missing models on load", async () => {
    const dir = await tempDir();
    const p = path.join(dir, "models.json");
    await fs.writeFile(
      p,
      JSON.stringify({
        providers: {
          broken: {
            baseUrl: "https://ex.com/v1",
            api: "openai-completions",
          },
        },
      }),
      "utf8",
    );
    const doc = await loadModelsFile(p);
    assert.ok(Array.isArray(doc.providers.broken.models));
    assert.deepEqual(doc.providers.broken.models, []);
    assert.equal(doc.providers.broken.baseUrl, "https://ex.com/v1");
  });
});

describe("normalizeProvider", () => {
  it("defaults missing models to [] and baseUrl to string", () => {
    const p = normalizeProvider({ api: "openai-completions" });
    assert.deepEqual(p.models, []);
    assert.equal(p.baseUrl, "");
    assert.equal(p.api, "openai-completions");
  });

  it("keeps invalid api string but still sets models array", () => {
    const p = normalizeProvider({
      api: "custom-api",
      models: "not-array",
      baseUrl: "https://x",
    });
    assert.equal(p.api, "custom-api");
    assert.deepEqual(p.models, []);
    assert.equal(p.baseUrl, "https://x");
  });

  it("normalizeProviders maps all entries", () => {
    const out = normalizeProviders({ a: {}, b: { models: [{ id: "m" }] } });
    assert.deepEqual(out.a.models, []);
    assert.equal(out.b.models.length, 1);
  });
});

describe("saveModelsFile", () => {
  it("writes atomically, backs up previous, sets 0600, preserves siblings", async () => {
    const dir = await tempDir();
    const p = path.join(dir, "models.json");
    const first: ModelsFile = {
      providers: { keep: sampleProvider() },
      extra: true,
    };
    await saveModelsFile(first, p);

    let doc = await loadModelsFile(p);
    doc = upsertProvider(doc, "new", {
      ...sampleProvider(),
      name: "New",
    });
    await saveModelsFile(doc, p);

    const bak = await fs.readFile(p + ".bak.1", "utf8");
    assert.ok(bak.includes("keep"));

    const final = JSON.parse(await fs.readFile(p, "utf8"));
    assert.ok(final.providers.keep);
    assert.ok(final.providers.new);
    assert.equal(final.extra, true);

    const stat = await fs.stat(p);
    assert.equal(stat.mode & 0o777, 0o600);
  });
});

describe("upsertProvider / removeProvider", () => {
  it("upserts and removes without mutating other keys", () => {
    let doc: ModelsFile = { providers: { a: sampleProvider() }, x: 1 };
    doc = upsertProvider(doc, "b", sampleProvider());
    assert.ok(doc.providers.a && doc.providers.b);
    assert.equal(doc.x, 1);
    doc = removeProvider(doc, "a");
    assert.equal(doc.providers.a, undefined);
    assert.ok(doc.providers.b);
  });
});

describe("restoreFromBackup", () => {
  it("restores from .bak.1", async () => {
    const dir = await tempDir();
    const p = path.join(dir, "models.json");
    await saveModelsFile({ providers: { old: sampleProvider() } }, p);
    await saveModelsFile({ providers: { neu: sampleProvider() } }, p);
    const restored = await restoreFromBackup(p);
    assert.ok(restored.providers.old);
  });
});

describe("rolling backups", () => {
  const docWith = (tag: string): ModelsFile => ({
    providers: { [tag]: sampleProvider() },
  });

  it("keeps at most BACKUP_KEEP numbered backups in order", async () => {
    const dir = await tempDir();
    const p = path.join(dir, "models.json");
    for (let v = 0; v <= BACKUP_KEEP + 2; v++) {
      await saveModelsFile(docWith(`v${v}`), p);
    }
    // after 8 writes (v0..v7): bak.1=v6 … bak.5=v2, no bak.6, no legacy .bak
    for (let i = 1; i <= BACKUP_KEEP; i++) {
      const content = await fs.readFile(`${p}.bak.${i}`, "utf8");
      assert.ok(content.includes(`v${BACKUP_KEEP + 2 - i}`), `bak.${i}`);
    }
    await assert.rejects(() => fs.access(`${p}.bak.${BACKUP_KEEP + 1}`));
    await assert.rejects(() => fs.access(p + ".bak"));
    assert.equal(await latestBackupPath(p), `${p}.bak.1`);
  });

  it("undo walks back through writes then runs out", async () => {
    const dir = await tempDir();
    const p = path.join(dir, "models.json");
    await saveModelsFile(docWith("first"), p);
    await saveModelsFile(docWith("second"), p);
    await saveModelsFile(docWith("third"), p);
    assert.equal(await hasUndoHistory(p), true);

    let doc = await undoLastWrite(p);
    assert.ok(doc.providers.second);
    doc = await undoLastWrite(p);
    assert.ok(doc.providers.first);
    assert.equal(await hasUndoHistory(p), false);
    await assert.rejects(() => undoLastWrite(p), /No undo history/);
    // current file still intact after failed undo
    const cur = await loadModelsFile(p);
    assert.ok(cur.providers.first);
  });

  it("restore prefers newest backup over legacy .bak", async () => {
    const dir = await tempDir();
    const p = path.join(dir, "models.json");
    await saveModelsFile(docWith("legacy"), p);
    // simulate a legacy backup left by an older version
    await fs.copyFile(p, p + ".bak");
    await saveModelsFile(docWith("newer"), p); // creates .bak.1 = legacy-content
    const src = await latestBackupPath(p);
    assert.equal(src, p + ".bak.1");
    const restored = await restoreFromBackup(p);
    assert.ok(restored.providers.legacy);
  });
});
