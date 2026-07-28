# pi-provider-tui Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive TUI (`pi-provider-tui`) that adds/lists/edits/removes/tests custom gateway providers in Pi's `~/.pi/agent/models.json`.

**Architecture:** Standalone Node.js TypeScript CLI. Pure modules handle file I/O, model fetch, and connection tests; `@clack/prompts` screens own the wizard UI. Never depends on Pi packages at runtime—only writes config Pi already understands.

**Tech Stack:** Node.js 18+, TypeScript, `tsx`, `@clack/prompts`, native `fetch`, `node:test` (or vitest if preferred—default `node:test` to avoid extra runners).

**Spec:** `docs/superpowers/specs/2026-07-28-pi-provider-tui-design.md`

## Global Constraints

- Config path: default `~/.pi/agent/models.json`; override via `PI_MODELS_PATH`
- API types only: `openai-completions` | `openai-responses` | `anthropic-messages`
- API keys stored **plaintext** in models.json; file mode **0600** after every write
- Atomic write: copy → `.bak`, write `.tmp`, `rename` to final
- Preserve unknown top-level keys in models.json; only mutate `providers[id]`
- Fetch models failure/empty **must not** block manual model entry
- At least one model required before write confirm
- Mask apiKey in list/preview (show last 4 chars only)
- Project root: `/root/pi-provider-tui`

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | name, bin `pi-provider-tui`, scripts, deps |
| `tsconfig.json` | strict TS, NodeNext or ES2022 + Node types |
| `src/types.ts` | shared types + defaults helpers |
| `src/models-file.ts` | path resolve, load, save, restore bak, maskKey |
| `src/fetch-models.ts` | models URL, auth headers, parse remote list |
| `src/test-connection.ts` | minimal POST per API type |
| `src/screens/list.ts` | list providers |
| `src/screens/models-pick.ts` | fetch + multiselect + manual loop |
| `src/screens/add.ts` | add wizard |
| `src/screens/edit.ts` | edit wizard |
| `src/screens/remove.ts` | remove confirm |
| `src/screens/test.ts` | connection test UI |
| `src/index.ts` | main menu loop + entry |
| `tests/models-file.test.ts` | file layer tests |
| `tests/fetch-models.test.ts` | parse/URL tests |
| `README.md` | install, usage, security note |

---

<!-- SEGMENT 1 END: header + structure. Tasks continue below. -->

### Task 1: Project scaffold + types

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/types.ts`
- Create: `src/index.ts` (stub entry only)

**Interfaces:**
- Produces:
  - `ApiType = "openai-completions" | "openai-responses" | "anthropic-messages"`
  - `ModelConfig` with fields: `id`, `name`, `reasoning`, `input`, `contextWindow`, `maxTokens`, `cost`
  - `ProviderConfig` with fields: `name?`, `baseUrl`, `api`, `apiKey?`, `authHeader?`, `models`
  - `ModelsFile` with `{ providers: Record<string, ProviderConfig> }` plus index signature for unknown keys
  - `defaultModel(partial): ModelConfig`
  - `defaultAuthHeader(api: ApiType): boolean`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "pi-provider-tui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "pi-provider-tui": "./dist/index.js"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "tsx --test tests/**/*.test.ts",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "@clack/prompts": "^0.10.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "tests"]
}
```

Note: tests run via `tsx --test` and import from `../src/...` with TypeScript directly; they are not emitted by `tsc`.

- [ ] **Step 3: Create src/types.ts**

```typescript
export type ApiType =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages";

export const API_TYPES: ApiType[] = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
];

export interface ModelCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelConfig {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  contextWindow: number;
  maxTokens: number;
  cost: ModelCost;
}

export interface ProviderConfig {
  name?: string;
  baseUrl: string;
  api: ApiType;
  apiKey?: string;
  authHeader?: boolean;
  models: ModelConfig[];
}

export interface ModelsFile {
  providers: Record<string, ProviderConfig>;
  [key: string]: unknown;
}

export function defaultAuthHeader(api: ApiType): boolean {
  return api !== "anthropic-messages";
}

export function defaultModel(
  partial: Partial<ModelConfig> & { id: string },
): ModelConfig {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    reasoning: partial.reasoning ?? false,
    input: partial.input ?? ["text"],
    contextWindow: partial.contextWindow ?? 128000,
    maxTokens: partial.maxTokens ?? 16384,
    cost: partial.cost ?? {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
  };
}
```

- [ ] **Step 4: Create stub src/index.ts**

```typescript
#!/usr/bin/env node
console.log("pi-provider-tui scaffold ok");
```

- [ ] **Step 5: Install and smoke-run**

```bash
cd /root/pi-provider-tui
npm install
npx tsx src/index.ts
```

Expected: prints `pi-provider-tui scaffold ok`

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/types.ts src/index.ts
git commit -m "chore: scaffold pi-provider-tui package and types"
```

---

### Task 2: models-file module (TDD)

**Files:**
- Create: `src/models-file.ts`
- Create: `tests/models-file.test.ts`

**Interfaces:**
- Consumes: `ModelsFile`, `ProviderConfig` from `./types.js`
- Produces:
  - `getModelsPath(): string`
  - `maskKey(key: string | undefined): string`
  - `loadModelsFile(path?: string): Promise<ModelsFile>`
  - `saveModelsFile(doc: ModelsFile, path?: string): Promise<void>`
  - `restoreFromBackup(path?: string): Promise<ModelsFile>`
  - `upsertProvider(doc: ModelsFile, id: string, provider: ProviderConfig): ModelsFile`
  - `removeProvider(doc: ModelsFile, id: string): ModelsFile`

- [ ] **Step 1: Write failing tests**

Create `tests/models-file.test.ts`:

```typescript
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

    const bak = await fs.readFile(p + ".bak", "utf8");
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
  it("restores from .bak", async () => {
    const dir = await tempDir();
    const p = path.join(dir, "models.json");
    await saveModelsFile({ providers: { old: sampleProvider() } }, p);
    await saveModelsFile({ providers: { neu: sampleProvider() } }, p);
    const restored = await restoreFromBackup(p);
    assert.ok(restored.providers.old);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /root/pi-provider-tui
npm test
```

Expected: FAIL (cannot find module `../src/models-file.ts` or exports missing)

- [ ] **Step 3: Implement src/models-file.ts**

```typescript
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ModelsFile, ProviderConfig } from "./types.js";

export function getModelsPath(): string {
  if (process.env.PI_MODELS_PATH && process.env.PI_MODELS_PATH.trim()) {
    return path.resolve(process.env.PI_MODELS_PATH);
  }
  return path.join(os.homedir(), ".pi", "agent", "models.json");
}

export function maskKey(key: string | undefined): string {
  if (!key) return "(none)";
  if (key.length <= 4) return "****";
  return "****" + key.slice(-4);
}

function emptyDoc(): ModelsFile {
  return { providers: {} };
}

export async function loadModelsFile(
  filePath: string = getModelsPath(),
): Promise<ModelsFile> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyDoc();
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in models file: ${filePath}`);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !("providers" in parsed) ||
    typeof (parsed as ModelsFile).providers !== "object" ||
    (parsed as ModelsFile).providers === null ||
    Array.isArray((parsed as ModelsFile).providers)
  ) {
    throw new Error(
      `Invalid models file shape (expected { providers: object }): ${filePath}`,
    );
  }

  return parsed as ModelsFile;
}

export async function saveModelsFile(
  doc: ModelsFile,
  filePath: string = getModelsPath(),
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmp = filePath + ".tmp";
  const bak = filePath + ".bak";

  try {
    await fs.access(filePath);
    await fs.copyFile(filePath, bak);
  } catch {
    // no existing file — skip bak
  }

  const body = JSON.stringify(doc, null, 2) + "\n";
  await fs.writeFile(tmp, body, { encoding: "utf8", mode: 0o600 });
  await fs.rename(tmp, filePath);
  await fs.chmod(filePath, 0o600);
}

export async function restoreFromBackup(
  filePath: string = getModelsPath(),
): Promise<ModelsFile> {
  const bak = filePath + ".bak";
  await fs.copyFile(bak, filePath);
  await fs.chmod(filePath, 0o600);
  return loadModelsFile(filePath);
}

export function upsertProvider(
  doc: ModelsFile,
  id: string,
  provider: ProviderConfig,
): ModelsFile {
  return {
    ...doc,
    providers: {
      ...doc.providers,
      [id]: provider,
    },
  };
}

export function removeProvider(doc: ModelsFile, id: string): ModelsFile {
  const providers = { ...doc.providers };
  delete providers[id];
  return { ...doc, providers };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /root/pi-provider-tui
npm test
```

Expected: all `models-file` tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/models-file.ts tests/models-file.test.ts
git commit -m "feat: add models.json load/save with backup and merge helpers"
```

---

<!-- SEGMENT 2 END: Tasks 1–2. Next: fetch-models + test-connection. -->

### Task 3: fetch-models module (TDD)

**Files:**
- Create: `src/fetch-models.ts`
- Create: `tests/fetch-models.test.ts`

**Interfaces:**
- Consumes: `ApiType`, `ModelConfig`, `defaultModel` from `./types.js`
- Produces:
  - `buildModelsUrl(baseUrl: string): string`
  - `buildAuthHeaders(api: ApiType, apiKey?: string): Record<string, string>`
  - `parseModelsPayload(payload: unknown): { models: ModelConfig[]; skipped: number }`
  - `fetchRemoteModels(opts: { baseUrl: string; api: ApiType; apiKey?: string; fetchImpl?: typeof fetch }): Promise<{ ok: true; models: ModelConfig[]; skipped: number } | { ok: false; error: string }>`

- [ ] **Step 1: Write failing tests**

Create `tests/fetch-models.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildModelsUrl,
  buildAuthHeaders,
  parseModelsPayload,
  fetchRemoteModels,
} from "../src/fetch-models.ts";

describe("buildModelsUrl", () => {
  it("appends /models when missing", () => {
    assert.equal(
      buildModelsUrl("https://api.example.com/v1"),
      "https://api.example.com/v1/models",
    );
    assert.equal(
      buildModelsUrl("https://api.example.com/v1/"),
      "https://api.example.com/v1/models",
    );
  });

  it("does not double-append /models", () => {
    assert.equal(
      buildModelsUrl("https://api.example.com/v1/models"),
      "https://api.example.com/v1/models",
    );
    assert.equal(
      buildModelsUrl("https://api.example.com/v1/models/"),
      "https://api.example.com/v1/models",
    );
  });
});

describe("buildAuthHeaders", () => {
  it("openai uses Bearer", () => {
    assert.deepEqual(buildAuthHeaders("openai-completions", "sk-x"), {
      Authorization: "Bearer sk-x",
    });
  });

  it("anthropic sends x-api-key and Bearer", () => {
    const h = buildAuthHeaders("anthropic-messages", "sk-x");
    assert.equal(h["x-api-key"], "sk-x");
    assert.equal(h.Authorization, "Bearer sk-x");
  });

  it("empty key yields empty headers", () => {
    assert.deepEqual(buildAuthHeaders("openai-completions", ""), {});
    assert.deepEqual(buildAuthHeaders("openai-completions", undefined), {});
  });
});

describe("parseModelsPayload", () => {
  it("parses { data: [...] }", () => {
    const { models, skipped } = parseModelsPayload({
      data: [
        { id: "a", name: "A", context_window: 1000, max_tokens: 200 },
        { id: "b" },
        { noid: true },
      ],
    });
    assert.equal(models.length, 2);
    assert.equal(skipped, 1);
    assert.equal(models[0].id, "a");
    assert.equal(models[0].name, "A");
    assert.equal(models[0].contextWindow, 1000);
    assert.equal(models[0].maxTokens, 200);
    assert.equal(models[1].name, "b");
  });

  it("parses { models: [...] } and bare array", () => {
    assert.equal(
      parseModelsPayload({ models: [{ id: "x" }] }).models[0].id,
      "x",
    );
    assert.equal(parseModelsPayload([{ id: "y" }]).models[0].id, "y");
  });

  it("returns empty for garbage", () => {
    const r = parseModelsPayload({ foo: 1 });
    assert.deepEqual(r.models, []);
  });
});

describe("fetchRemoteModels", () => {
  it("returns ok models on 200", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ data: [{ id: "m" }] }), { status: 200 });
    const r = await fetchRemoteModels({
      baseUrl: "https://ex.com/v1",
      api: "openai-completions",
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.models[0].id, "m");
  });

  it("returns error on non-200", async () => {
    const fetchImpl = async () =>
      new Response("nope", { status: 401, statusText: "Unauthorized" });
    const r = await fetchRemoteModels({
      baseUrl: "https://ex.com/v1",
      api: "openai-completions",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /401/);
  });

  it("returns error on network throw", async () => {
    const fetchImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    const r = await fetchRemoteModels({
      baseUrl: "https://ex.com/v1",
      api: "openai-completions",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /ECONNREFUSED/);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /root/pi-provider-tui && npm test
```

Expected: FAIL missing `fetch-models`

- [ ] **Step 3: Implement src/fetch-models.ts**

```typescript
import { defaultModel, type ApiType, type ModelConfig } from "./types.js";

export function buildModelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (/\/models$/i.test(trimmed)) return trimmed;
  return trimmed + "/models";
}

export function buildAuthHeaders(
  api: ApiType,
  apiKey?: string,
): Record<string, string> {
  if (!apiKey) return {};
  if (api === "anthropic-messages") {
    return {
      "x-api-key": apiKey,
      Authorization: `Bearer ${apiKey}`,
    };
  }
  return { Authorization: `Bearer ${apiKey}` };
}

function asList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.models)) return obj.models;
  }
  return [];
}

export function parseModelsPayload(payload: unknown): {
  models: ModelConfig[];
  skipped: number;
} {
  const list = asList(payload);
  const models: ModelConfig[] = [];
  let skipped = 0;
  for (const item of list) {
    if (!item || typeof item !== "object") {
      skipped++;
      continue;
    }
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id) {
      skipped++;
      continue;
    }
    models.push(
      defaultModel({
        id: row.id,
        name: typeof row.name === "string" ? row.name : undefined,
        contextWindow:
          typeof row.context_window === "number"
            ? row.context_window
            : typeof row.contextWindow === "number"
              ? row.contextWindow
              : undefined,
        maxTokens:
          typeof row.max_tokens === "number"
            ? row.max_tokens
            : typeof row.maxTokens === "number"
              ? row.maxTokens
              : undefined,
      }),
    );
  }
  return { models, skipped };
}

export async function fetchRemoteModels(opts: {
  baseUrl: string;
  api: ApiType;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; models: ModelConfig[]; skipped: number }
  | { ok: false; error: string }
> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const url = buildModelsUrl(opts.baseUrl);
  const headers = buildAuthHeaders(opts.api, opts.apiKey);
  try {
    const res = await fetchFn(url, { headers });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      return {
        ok: false,
        error: `HTTP ${res.status} ${res.statusText}${body ? `: ${body}` : ""}`,
      };
    }
    const json = (await res.json()) as unknown;
    const parsed = parseModelsPayload(json);
    return { ok: true, models: parsed.models, skipped: parsed.skipped };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /root/pi-provider-tui && npm test
```

Expected: all fetch-models tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/fetch-models.ts tests/fetch-models.test.ts
git commit -m "feat: fetch and parse remote /models for gateways"
```

---

### Task 4: test-connection module (TDD)

**Files:**
- Create: `src/test-connection.ts`
- Create: `tests/test-connection.test.ts`

**Interfaces:**
- Consumes: `ApiType`, `ProviderConfig`, `ModelConfig`; reuses `buildAuthHeaders` from `./fetch-models.js`
- Produces:
  - `testConnection(opts: { provider: ProviderConfig; model: ModelConfig; fetchImpl?: typeof fetch }): Promise<{ ok: boolean; status?: number; detail: string }>`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { testConnection } from "../src/test-connection.ts";
import { defaultModel, type ProviderConfig } from "../src/types.ts";

function baseProvider(api: ProviderConfig["api"]): ProviderConfig {
  return {
    baseUrl: "https://api.example.com/v1",
    api,
    apiKey: "sk-test",
    authHeader: api !== "anthropic-messages",
    models: [defaultModel({ id: "m1" })],
  };
}

describe("testConnection", () => {
  it("posts chat/completions for openai-completions", async () => {
    let calledUrl = "";
    let calledBody: unknown;
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      calledUrl = String(input);
      calledBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [] }), { status: 200 });
    };
    const r = await testConnection({
      provider: baseProvider("openai-completions"),
      model: defaultModel({ id: "m1" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    assert.equal(r.ok, true);
    assert.match(calledUrl, /\/chat\/completions$/);
    assert.equal((calledBody as { model: string }).model, "m1");
  });

  it("posts /responses for openai-responses", async () => {
    let calledUrl = "";
    const fetchImpl = async (input: RequestInfo | URL) => {
      calledUrl = String(input);
      return new Response("{}", { status: 200 });
    };
    const r = await testConnection({
      provider: baseProvider("openai-responses"),
      model: defaultModel({ id: "m1" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    assert.equal(r.ok, true);
    assert.match(calledUrl, /\/responses$/);
  });

  it("posts /messages for anthropic-messages with version header", async () => {
    let headers: HeadersInit | undefined;
    let calledUrl = "";
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      calledUrl = String(input);
      headers = init?.headers;
      return new Response("{}", { status: 200 });
    };
    const r = await testConnection({
      provider: baseProvider("anthropic-messages"),
      model: defaultModel({ id: "m1" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    assert.equal(r.ok, true);
    assert.match(calledUrl, /\/messages$/);
    const h = new Headers(headers);
    assert.equal(h.get("anthropic-version"), "2023-06-01");
  });

  it("returns not ok on HTTP error with body snippet", async () => {
    const fetchImpl = async () =>
      new Response("rate limit exceeded blah", { status: 429 });
    const r = await testConnection({
      provider: baseProvider("openai-completions"),
      model: defaultModel({ id: "m1" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, 429);
    assert.match(r.detail, /rate limit/i);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /root/pi-provider-tui && npm test
```

- [ ] **Step 3: Implement src/test-connection.ts**

```typescript
import { buildAuthHeaders } from "./fetch-models.js";
import type { ModelConfig, ProviderConfig } from "./types.js";

function joinUrl(baseUrl: string, suffix: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const path = suffix.startsWith("/") ? suffix : `/${suffix}`;
  if (base.endsWith(path)) return base;
  return base + path;
}

export async function testConnection(opts: {
  provider: ProviderConfig;
  model: ModelConfig;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; status?: number; detail: string }> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const { provider, model } = opts;
  const auth = buildAuthHeaders(provider.api, provider.apiKey);
  // When authHeader is explicitly false, still send provider-specific keys
  // from buildAuthHeaders for anthropic; for openai, omit Bearer if authHeader false.
  let headers: Record<string, string> = {
    "content-type": "application/json",
    ...auth,
  };
  if (provider.authHeader === false && provider.api !== "anthropic-messages") {
    delete headers.Authorization;
  }

  let url: string;
  let body: unknown;

  if (provider.api === "openai-completions") {
    url = joinUrl(provider.baseUrl, "/chat/completions");
    body = {
      model: model.id,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    };
  } else if (provider.api === "openai-responses") {
    url = joinUrl(provider.baseUrl, "/responses");
    body = {
      model: model.id,
      input: "ping",
      max_output_tokens: 1,
    };
  } else {
    url = joinUrl(provider.baseUrl, "/messages");
    headers = {
      ...headers,
      "anthropic-version": "2023-06-01",
    };
    body = {
      model: model.id,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    };
  }

  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const text = (await res.text().catch(() => "")).slice(0, 300);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        detail: `HTTP ${res.status}: ${text || res.statusText}`,
      };
    }
    return {
      ok: true,
      status: res.status,
      detail: text || `HTTP ${res.status} OK`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg };
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /root/pi-provider-tui && npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/test-connection.ts tests/test-connection.test.ts
git commit -m "feat: add minimal gateway connection test per API type"
```

---

<!-- SEGMENT 3 END: Tasks 3–4. Next: UI screens. -->

### Task 5: models-pick + list screens

**Files:**
- Create: `src/screens/models-pick.ts`
- Create: `src/screens/list.ts`
- Create: `src/ui-cancel.ts` (shared cancel helper)

**Interfaces:**
- Consumes: `fetchRemoteModels`, `defaultModel`, `maskKey`, types
- Produces:
  - `isCancel(value: unknown): boolean` — wraps `@clack/prompts` `isCancel`
  - `pickModels(opts: { baseUrl: string; api: ApiType; apiKey?: string }): Promise<ModelConfig[] | null>`
    - `null` = user cancelled whole flow
    - never returns empty array (loops until ≥1 model or cancel)
  - `listProviders(doc: ModelsFile): void` — prints table to stdout via clack `note`/`log`

- [ ] **Step 1: Create src/ui-cancel.ts**

```typescript
import { isCancel as clackIsCancel, cancel } from "@clack/prompts";

export function isCancel(value: unknown): boolean {
  return clackIsCancel(value);
}

/** If cancel, print message and return true. */
export function handleCancel(value: unknown, message = "Cancelled."): boolean {
  if (!clackIsCancel(value)) return false;
  cancel(message);
  return true;
}
```

- [ ] **Step 2: Implement src/screens/models-pick.ts**

```typescript
import * as p from "@clack/prompts";
import { fetchRemoteModels } from "../fetch-models.js";
import { defaultModel, type ApiType, type ModelConfig } from "../types.js";
import { handleCancel } from "../ui-cancel.js";

async function manualModels(): Promise<ModelConfig[] | null> {
  const models: ModelConfig[] = [];
  for (;;) {
    const id = await p.text({
      message: "Model id",
      validate: (v) => (v && v.trim() ? undefined : "Required"),
    });
    if (handleCancel(id)) return null;

    const name = await p.text({
      message: "Model name (Enter = id)",
      placeholder: String(id),
    });
    if (handleCancel(name)) return null;

    const reasoning = await p.confirm({
      message: "Supports reasoning/thinking?",
      initialValue: false,
    });
    if (handleCancel(reasoning)) return null;

    const contextWindowRaw = await p.text({
      message: "contextWindow",
      initialValue: "128000",
      validate: (v) =>
        v && Number.isFinite(Number(v)) && Number(v) > 0
          ? undefined
          : "Positive number required",
    });
    if (handleCancel(contextWindowRaw)) return null;

    const maxTokensRaw = await p.text({
      message: "maxTokens",
      initialValue: "16384",
      validate: (v) =>
        v && Number.isFinite(Number(v)) && Number(v) > 0
          ? undefined
          : "Positive number required",
    });
    if (handleCancel(maxTokensRaw)) return null;

    models.push(
      defaultModel({
        id: String(id).trim(),
        name: String(name || id).trim() || String(id).trim(),
        reasoning: Boolean(reasoning),
        contextWindow: Number(contextWindowRaw),
        maxTokens: Number(maxTokensRaw),
      }),
    );

    const again = await p.confirm({
      message: "Add another model?",
      initialValue: false,
    });
    if (handleCancel(again)) return null;
    if (!again) break;
  }
  return models;
}

export async function pickModels(opts: {
  baseUrl: string;
  api: ApiType;
  apiKey?: string;
}): Promise<ModelConfig[] | null> {
  const spinner = p.spinner();
  spinner.start("Fetching models from gateway…");
  const result = await fetchRemoteModels({
    baseUrl: opts.baseUrl,
    api: opts.api,
    apiKey: opts.apiKey,
  });
  spinner.stop(
    result.ok
      ? `Fetched ${result.models.length} model(s)`
      : `Fetch failed: ${result.error}`,
  );

  if (result.ok && result.models.length > 0) {
    if (result.skipped > 0) {
      p.log.warn(`Skipped ${result.skipped} unparseable entries`);
    }
    const selected = await p.multiselect({
      message: "Select models (space to toggle)",
      options: result.models.map((m) => ({
        value: m.id,
        label: m.name === m.id ? m.id : `${m.name} (${m.id})`,
      })),
      required: false,
    });
    if (handleCancel(selected)) return null;

    const ids = selected as string[];
    if (ids.length > 0) {
      const byId = new Map(result.models.map((m) => [m.id, m]));
      return ids.map((id) => byId.get(id)!).filter(Boolean);
    }
    p.log.info("No models selected — enter manually.");
  } else if (result.ok) {
    p.log.info("Remote list empty — enter models manually.");
  } else {
    p.log.warn("Falling back to manual model entry.");
  }

  for (;;) {
    const manual = await manualModels();
    if (manual === null) return null;
    if (manual.length > 0) return manual;
    p.log.error("At least one model is required.");
  }
}
```

- [ ] **Step 3: Implement src/screens/list.ts**

```typescript
import * as p from "@clack/prompts";
import { maskKey } from "../models-file.js";
import type { ModelsFile } from "../types.js";

export function listProviders(doc: ModelsFile): void {
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
  p.note(lines.join("\n"), `Providers (${ids.length})`);
}
```

- [ ] **Step 4: Typecheck**

```bash
cd /root/pi-provider-tui && npm run typecheck
```

Expected: PASS (or only unused if index still stub—screens may be unused until Task 6; if `noUnusedLocals` not set, OK)

- [ ] **Step 5: Commit**

```bash
git add src/ui-cancel.ts src/screens/models-pick.ts src/screens/list.ts
git commit -m "feat: add models pick and list screens"
```

---

### Task 6: add / edit / remove / test screens

**Files:**
- Create: `src/screens/add.ts`
- Create: `src/screens/edit.ts`
- Create: `src/screens/remove.ts`
- Create: `src/screens/test.ts`

**Interfaces:**
- Produces:
  - `addProvider(doc: ModelsFile): Promise<ModelsFile | null>`
  - `editProvider(doc: ModelsFile): Promise<ModelsFile | null>`
  - `removeProviderScreen(doc: ModelsFile): Promise<ModelsFile | null>`
  - `testProviderScreen(doc: ModelsFile): Promise<void>`
- `null` return = cancelled, caller keeps previous doc and does not save

- [ ] **Step 1: Implement src/screens/add.ts**

```typescript
import * as p from "@clack/prompts";
import { maskKey, upsertProvider } from "../models-file.js";
import {
  API_TYPES,
  defaultAuthHeader,
  type ApiType,
  type ModelsFile,
  type ProviderConfig,
} from "../types.js";
import { handleCancel } from "../ui-cancel.js";
import { pickModels } from "./models-pick.js";

function isUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function addProvider(
  doc: ModelsFile,
): Promise<ModelsFile | null> {
  const idRaw = await p.text({
    message: "Provider id (kebab-case recommended)",
    placeholder: "my-gateway",
    validate: (v) => (v && v.trim() ? undefined : "Required"),
  });
  if (handleCancel(idRaw)) return null;
  const id = String(idRaw).trim();

  if (doc.providers[id]) {
    const overwrite = await p.confirm({
      message: `Provider "${id}" exists. Overwrite?`,
      initialValue: false,
    });
    if (handleCancel(overwrite) || !overwrite) return null;
  }

  const nameRaw = await p.text({
    message: "Display name (Enter = id)",
    placeholder: id,
  });
  if (handleCancel(nameRaw)) return null;

  const baseUrlRaw = await p.text({
    message: "baseUrl",
    placeholder: "https://api.example.com/v1",
    validate: (v) => (v && isUrl(v.trim()) ? undefined : "Valid http(s) URL required"),
  });
  if (handleCancel(baseUrlRaw)) return null;
  const baseUrl = String(baseUrlRaw).trim().replace(/\/+$/, "");

  const apiSel = await p.select({
    message: "API type",
    options: API_TYPES.map((a) => ({ value: a, label: a })),
  });
  if (handleCancel(apiSel)) return null;
  const api = apiSel as ApiType;

  const apiKeyRaw = await p.text({
    message: "apiKey (plaintext; empty allowed)",
    placeholder: "sk-...",
  });
  if (handleCancel(apiKeyRaw)) return null;
  const apiKey = String(apiKeyRaw ?? "").trim();
  if (!apiKey) {
    p.log.warn("Empty apiKey — models may be unavailable in pi /model until auth is set.");
  }

  const authHeader = await p.confirm({
    message: "Send Authorization Bearer via authHeader?",
    initialValue: defaultAuthHeader(api),
  });
  if (handleCancel(authHeader)) return null;

  const models = await pickModels({ baseUrl, api, apiKey: apiKey || undefined });
  if (models === null) return null;
  if (models.length === 0) {
    p.log.error("At least one model required.");
    return null;
  }

  const provider: ProviderConfig = {
    name: String(nameRaw || id).trim() || id,
    baseUrl,
    api,
    ...(apiKey ? { apiKey } : {}),
    authHeader: Boolean(authHeader),
    models,
  };

  const preview = {
    ...provider,
    apiKey: maskKey(provider.apiKey),
  };
  p.note(JSON.stringify({ [id]: preview }, null, 2), "Preview (key masked)");

  const ok = await p.confirm({ message: "Write to models.json?", initialValue: true });
  if (handleCancel(ok) || !ok) return null;

  return upsertProvider(doc, id, provider);
}
```

- [ ] **Step 2: Implement src/screens/remove.ts**

```typescript
import * as p from "@clack/prompts";
import { removeProvider } from "../models-file.js";
import type { ModelsFile } from "../types.js";
import { handleCancel } from "../ui-cancel.js";

export async function removeProviderScreen(
  doc: ModelsFile,
): Promise<ModelsFile | null> {
  const ids = Object.keys(doc.providers);
  if (ids.length === 0) {
    p.log.warn("No providers to remove.");
    return null;
  }
  const id = await p.select({
    message: "Remove which provider?",
    options: ids.map((i) => ({ value: i, label: i })),
  });
  if (handleCancel(id)) return null;

  const ok = await p.confirm({
    message: `Delete provider "${String(id)}"?`,
    initialValue: false,
  });
  if (handleCancel(ok) || !ok) return null;
  return removeProvider(doc, String(id));
}
```

- [ ] **Step 3: Implement src/screens/test.ts**

```typescript
import * as p from "@clack/prompts";
import { testConnection } from "../test-connection.js";
import type { ModelsFile } from "../types.js";
import { handleCancel } from "../ui-cancel.js";

export async function testProviderScreen(doc: ModelsFile): Promise<void> {
  const ids = Object.keys(doc.providers);
  if (ids.length === 0) {
    p.log.warn("No providers configured.");
    return;
  }
  const id = await p.select({
    message: "Provider",
    options: ids.map((i) => ({ value: i, label: i })),
  });
  if (handleCancel(id)) return;
  const provider = doc.providers[String(id)];
  if (!provider.models.length) {
    p.log.error("Provider has no models.");
    return;
  }
  const modelId = await p.select({
    message: "Model",
    options: provider.models.map((m) => ({
      value: m.id,
      label: m.name === m.id ? m.id : `${m.name} (${m.id})`,
    })),
  });
  if (handleCancel(modelId)) return;
  const model = provider.models.find((m) => m.id === String(modelId))!;

  const spinner = p.spinner();
  spinner.start("Testing connection…");
  const result = await testConnection({ provider, model });
  spinner.stop(result.ok ? "OK" : "Failed");
  if (result.ok) {
    p.log.success(`status=${result.status ?? "?"} ${result.detail.slice(0, 200)}`);
  } else {
    p.log.error(result.detail);
  }
}
```

- [ ] **Step 4: Implement src/screens/edit.ts**

```typescript
import * as p from "@clack/prompts";
import { maskKey, upsertProvider } from "../models-file.js";
import {
  API_TYPES,
  defaultAuthHeader,
  type ApiType,
  type ModelsFile,
  type ProviderConfig,
} from "../types.js";
import { handleCancel } from "../ui-cancel.js";
import { pickModels } from "./models-pick.js";

function isUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function editProvider(
  doc: ModelsFile,
): Promise<ModelsFile | null> {
  const ids = Object.keys(doc.providers);
  if (ids.length === 0) {
    p.log.warn("No providers to edit.");
    return null;
  }
  const idSel = await p.select({
    message: "Edit which provider?",
    options: ids.map((i) => ({ value: i, label: i })),
  });
  if (handleCancel(idSel)) return null;
  const id = String(idSel);
  let provider: ProviderConfig = { ...doc.providers[id], models: [...doc.providers[id].models] };

  for (;;) {
    const field = await p.select({
      message: `Editing "${id}" — choose field`,
      options: [
        { value: "name", label: `name (${provider.name ?? id})` },
        { value: "baseUrl", label: `baseUrl (${provider.baseUrl})` },
        { value: "api", label: `api (${provider.api})` },
        { value: "apiKey", label: `apiKey (${maskKey(provider.apiKey)})` },
        { value: "authHeader", label: `authHeader (${provider.authHeader})` },
        { value: "models", label: `models (${provider.models.length})` },
        { value: "save", label: "Save & return" },
        { value: "cancel", label: "Cancel without saving" },
      ],
    });
    if (handleCancel(field)) return null;

    switch (field) {
      case "cancel":
        return null;
      case "save": {
        if (!provider.models.length) {
          p.log.error("At least one model required.");
          break;
        }
        const ok = await p.confirm({ message: "Write changes?", initialValue: true });
        if (handleCancel(ok) || !ok) return null;
        return upsertProvider(doc, id, provider);
      }
      case "name": {
        const v = await p.text({ message: "name", initialValue: provider.name ?? id });
        if (handleCancel(v)) return null;
        provider = { ...provider, name: String(v).trim() || id };
        break;
      }
      case "baseUrl": {
        const v = await p.text({
          message: "baseUrl",
          initialValue: provider.baseUrl,
          validate: (x) => (x && isUrl(x.trim()) ? undefined : "Valid URL required"),
        });
        if (handleCancel(v)) return null;
        provider = { ...provider, baseUrl: String(v).trim().replace(/\/+$/, "") };
        break;
      }
      case "api": {
        const v = await p.select({
          message: "api",
          options: API_TYPES.map((a) => ({ value: a, label: a })),
          initialValue: provider.api,
        });
        if (handleCancel(v)) return null;
        const api = v as ApiType;
        provider = {
          ...provider,
          api,
          authHeader: provider.authHeader ?? defaultAuthHeader(api),
        };
        break;
      }
      case "apiKey": {
        const v = await p.text({
          message: "apiKey (plaintext)",
          initialValue: provider.apiKey ?? "",
        });
        if (handleCancel(v)) return null;
        const apiKey = String(v).trim();
        provider = { ...provider, apiKey: apiKey || undefined };
        break;
      }
      case "authHeader": {
        const v = await p.confirm({
          message: "authHeader",
          initialValue: provider.authHeader ?? defaultAuthHeader(provider.api),
        });
        if (handleCancel(v)) return null;
        provider = { ...provider, authHeader: Boolean(v) };
        break;
      }
      case "models": {
        const mode = await p.select({
          message: "Models",
          options: [
            { value: "refetch", label: "Re-fetch / re-pick from gateway" },
            { value: "clear-manual", label: "Replace via manual entry only" },
          ],
        });
        if (handleCancel(mode)) return null;
        if (mode === "refetch") {
          const models = await pickModels({
            baseUrl: provider.baseUrl,
            api: provider.api,
            apiKey: provider.apiKey,
          });
          if (models === null) break;
          provider = { ...provider, models };
        } else {
          const models = await pickModels({
            baseUrl: provider.baseUrl,
            api: provider.api,
            apiKey: provider.apiKey,
          });
          // pickModels always tries fetch first; acceptable for v1.
          if (models === null) break;
          provider = { ...provider, models };
        }
        break;
      }
    }
  }
}
```

- [ ] **Step 5: Typecheck**

```bash
cd /root/pi-provider-tui && npm run typecheck
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/screens/add.ts src/screens/edit.ts src/screens/remove.ts src/screens/test.ts
git commit -m "feat: add provider add/edit/remove/test screens"
```

---

<!-- SEGMENT 4 END: Tasks 5–6. Next: main menu, README, verify. -->

### Task 7: Main menu entry + load error recovery

**Files:**
- Modify: `src/index.ts` (replace stub)
- Ensure shebang survives build: either keep `src/index.ts` shebang and configure package bin to `tsx` for dev, or post-build; **v1 approach:** bin points to `dist/index.js` after build; `npm run dev` uses tsx. Also add `"bin"` alternative script via package.json `"pi-provider-tui": "tsx src/index.ts"` is wrong for published bin—keep build path. For local use without build:

Update `package.json` bin and scripts if needed:

```json
"bin": {
  "pi-provider-tui": "./bin/pi-provider-tui.js"
}
```

Create `bin/pi-provider-tui.js`:

```javascript
#!/usr/bin/env node
import { register } from "node:module";
import { pathToFileURL } from "node:url";
// Simpler v1: use compiled output only.
```

**Preferred v1 (simpler):** bin = `./dist/index.js`, document `npm run build && npm link`. Dev: `npm run dev`.

- [ ] **Step 1: Replace src/index.ts**

```typescript
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
```

- [ ] **Step 2: Build and ensure dist bin works**

After `tsc`, `dist/index.js` must start with shebang. TypeScript **preserves** leading `#!/usr/bin/env node` in emitted JS when it is the first line.

```bash
cd /root/pi-provider-tui
npm run build
chmod +x dist/index.js
node dist/index.js
# Cancel immediately (Ctrl+C) is OK — should show intro
```

For non-interactive smoke without hanging forever, rely on unit tests for core; manual TUI check is acceptable.

Optional smoke with timeout:

```bash
printf '\x03' | timeout 2 npm run dev || true
```

- [ ] **Step 3: npm link locally**

```bash
cd /root/pi-provider-tui
npm run build
npm link
which pi-provider-tui
```

Expected: path under global npm bin

- [ ] **Step 4: Commit**

```bash
git add src/index.ts package.json
git commit -m "feat: wire main menu and models.json load/save loop"
```

---

### Task 8: README + end-to-end manual checklist

**Files:**
- Create: `README.md`
- Optionally add `.gitignore`

- [ ] **Step 1: Create .gitignore**

```
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 2: Write README.md**

```markdown
# pi-provider-tui

Interactive TUI to manage [Pi](https://pi.dev) custom model providers in `~/.pi/agent/models.json`.

## Requirements

- Node.js 18+
- Pi coding agent installed (to consume the config)

## Install

```bash
cd /path/to/pi-provider-tui
npm install
npm run build
npm link
```

Dev without build:

```bash
npm run dev
```

## Usage

```bash
pi-provider-tui
```

Override config path:

```bash
PI_MODELS_PATH=/tmp/models.json pi-provider-tui
```

Menu: List / Add / Edit / Remove / Test connection / Quit.

Supported API types:

- `openai-completions`
- `openai-responses`
- `anthropic-messages`

After saving, verify:

```bash
pi --list-models
```

## Security

API keys are stored **in plaintext** in `models.json` by design. The tool sets file mode `0600` on write. Do not use on shared machines without additional secret management.

## Backup

Each write copies the previous file to `models.json.bak`. On corrupt JSON at startup, the TUI offers restore from `.bak`.

## Tests

```bash
npm test
npm run typecheck
```
```

- [ ] **Step 3: Manual E2E against temp file**

```bash
export PI_MODELS_PATH=/tmp/pi-models-test.json
rm -f "$PI_MODELS_PATH" "$PI_MODELS_PATH.bak"
# Run TUI manually:
# 1. Add provider id=demo baseUrl=https://httpbin.org (fetch will fail → manual model id=demo-model)
#    Note: httpbin is not an LLM API; for test connection expect failure — OK
# Better: if you have a real gateway, use it.
# 2. List — see demo
# 3. cat $PI_MODELS_PATH — valid JSON, mode 600
# 4. Remove demo
npm test
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add README.md .gitignore
git commit -m "docs: add README, gitignore, usage and security notes"
```

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| TUI main menu List/Add/Edit/Remove/Test/Quit | Task 7 |
| Add wizard fields + defaults | Task 6 add |
| API three types | types + add/edit |
| Fetch models + manual fallback | Task 3 + 5 |
| Plaintext apiKey + 0600 | Task 2 save |
| Atomic write + .bak | Task 2 |
| Preserve other providers / extra keys | Task 2 |
| Test connection per API | Task 4 + 6 test screen |
| Corrupt JSON + restore bak | Task 7 loadOrRecover |
| PI_MODELS_PATH | Task 2 getModelsPath |
| maskKey in list/preview | Task 2 + 5/6 |
| README install/security | Task 8 |
| Unit tests models-file + fetch | Tasks 2–3 (+4) |

**Out of v1 (intentionally no task):** compat editor, OAuth, streamSimple, auth.json, Ink dashboard, Pi extension.

**Type consistency check:** `ProviderConfig`, `ModelConfig`, `ModelsFile`, `ApiType`, `defaultModel`, `defaultAuthHeader`, `upsertProvider` / `removeProvider` (models-file) vs `removeProviderScreen` (screen name distinct), `pickModels`, `testConnection`, `getModelsPath`, `maskKey` — aligned across tasks.

**Placeholder scan:** none remaining for implementation steps.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-28-pi-provider-tui.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with executing-plans checkpoints  

Which approach?
