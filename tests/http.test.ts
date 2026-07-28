import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchWithTimeout } from "../src/http.ts";

describe("fetchWithTimeout", () => {
  it("aborts slow fetch and throws timeout message", async () => {
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const t = setTimeout(() => {
          reject(new Error("should have been aborted"));
        }, 5_000);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    };
    await assert.rejects(
      () =>
        fetchWithTimeout(
          "https://ex.com",
          {},
          40,
          fetchImpl as unknown as typeof fetch,
        ),
      /timed out/i,
    );
  });

  it("returns response when fetch completes in time", async () => {
    const fetchImpl = async () => new Response("ok", { status: 200 });
    const res = await fetchWithTimeout(
      "https://ex.com",
      {},
      1000,
      fetchImpl as unknown as typeof fetch,
    );
    assert.equal(res.status, 200);
  });
});
