import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { examineDoc } from "../src/doctor.ts";
import { defaultModel, type ModelsFile, type ProviderConfig } from "../src/types.ts";

const provider = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  name: "P",
  baseUrl: "https://api.example.com/v1",
  api: "openai-completions",
  apiKey: "sk-x",
  authHeader: true,
  models: [defaultModel({ id: "m1" })],
  ...over,
});

const doc = (providers: Record<string, ProviderConfig>): ModelsFile => ({
  providers,
});

const levels = (issues: ReturnType<typeof examineDoc>) =>
  issues.map((i) => i.level);

describe("examineDoc", () => {
  it("clean config yields no issues", () => {
    const issues = examineDoc(doc({ good: provider() }));
    assert.deepEqual(issues, []);
  });

  it("flags missing baseUrl when models exist", () => {
    const issues = examineDoc(
      doc({ broken: provider({ baseUrl: "" }) }),
    );
    assert.ok(issues.some((i) => i.level === "error" && /baseUrl/.test(i.message)));
  });

  it("allows missing baseUrl+api without models (built-in override)", () => {
    const issues = examineDoc(
      doc({ override: provider({ baseUrl: "", api: undefined, models: [] }) }),
    );
    // only info-level notes may appear (e.g. authHeader unusual)
    assert.ok(issues.every((i) => i.level === "info"));
  });

  it("flags unknown api and missing api", () => {
    const a = examineDoc(doc({ x: provider({ api: "bogus-api" as never }) }));
    assert.ok(a.some((i) => i.level === "error" && /unknown api/.test(i.message)));

    const b = examineDoc(doc({ x: provider({ api: undefined }) }));
    assert.ok(b.some((i) => i.level === "error" && /missing api/.test(i.message)));
  });

  it("reports unset env vars referenced by apiKey", () => {
    const issues = examineDoc(
      doc({
        x: provider({ apiKey: "$DEFINITELY_UNSET_VAR_123" }),
      }),
    );
    const warn = issues.find(
      (i) => i.level === "warn" && /DEFINITELY_UNSET_VAR_123/.test(i.message),
    );
    assert.ok(warn);
  });

  it("info for !command references without executing", () => {
    const issues = examineDoc(
      doc({ x: provider({ apiKey: "!echo hello" }) }),
    );
    assert.ok(issues.some((i) => i.level === "info" && /!command/.test(i.message)));
  });

  it("warns on duplicate baseUrls across providers", () => {
    const issues = examineDoc(
      doc({ a: provider(), b: provider() }),
    );
    assert.ok(issues.some((i) => i.level === "warn" && /share baseUrl/.test(i.message)));
  });

  it("detects duplicate model ids and invalid limits", () => {
    const dup = defaultModel({ id: "m1" });
    const bad = {
      ...defaultModel({ id: "m2" }),
      contextWindow: -5,
      maxTokens: 0,
      cost: { input: -1, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    const issues = examineDoc(
      doc({
        p: provider({
          models: [dup, { ...dup }, bad as typeof dup],
        }),
      }),
    );
    assert.ok(issues.some((i) => i.level === "error" && /duplicate model id/.test(i.message)));
    assert.ok(issues.some((i) => i.level === "error" && /contextWindow/.test(i.message)));
    assert.ok(issues.some((i) => i.level === "error" && /maxTokens/.test(i.message)));
    assert.ok(issues.some((i) => i.level === "error" && /negative cost\.input/.test(i.message)));
  });

  it("warns thinkingLevelMap without reasoning and unknown keys", () => {
    const m = {
      ...defaultModel({ id: "m1", reasoning: false }),
      thinkingLevelMap: { bogus: "x" } as Record<string, string | null>,
    };
    const issues = examineDoc(doc({ p: provider({ models: [m as typeof m] }) }));
    assert.ok(issues.some((i) => i.level === "warn" && /reasoning=false/.test(i.message)));
    assert.ok(issues.some((i) => i.level === "warn" && /unknown thinkingLevelMap key "bogus"/.test(i.message)));
  });

  it("empty models array warns; no providers short-circuits", () => {
    const a = examineDoc(doc({ p: provider({ models: [] }) }));
    assert.deepEqual(levels(a).filter((l) => l !== "info"), ["warn"]);

    const b = examineDoc(doc({}));
    assert.deepEqual(b, []);

    // override-style provider without baseUrl/api: empty models is fine
    const c = examineDoc(
      doc({ ov: provider({ baseUrl: "", api: undefined, models: [] }) }),
    );
    assert.ok(c.every((i) => i.level === "info"));
  });
});
