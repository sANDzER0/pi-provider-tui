import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkPages, PAGE_SIZE } from "../src/paginate.js";

describe("chunkPages", () => {
  it("splits evenly and keeps order", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line-${i}`);
    const pages = chunkPages(lines, 15);
    assert.equal(pages.length, 3);
    assert.deepEqual(pages[0].slice(0, 2), ["line-0", "line-1"]);
    assert.equal(pages[0].length, 15);
    assert.equal(pages[1][0], "line-15");
    assert.equal(pages[2].length, 10);
    assert.equal(pages[2][9], "line-39");
  });

  it("exact multiple of page size yields no empty tail page", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `${i}`);
    assert.equal(chunkPages(lines, 15).length, 2);
  });

  it("single short list is one page", () => {
    const pages = chunkPages(["a"], PAGE_SIZE);
    assert.equal(pages.length, 1);
    assert.deepEqual(pages[0], ["a"]);
  });

  it("empty input yields one empty page (renders as '(none)' upstream)", () => {
    assert.deepEqual(chunkPages([]), [[]]);
  });
});
