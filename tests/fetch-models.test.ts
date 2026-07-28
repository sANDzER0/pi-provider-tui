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
