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
