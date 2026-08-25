import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  interpolateEnv,
  isReferenceValue,
  resolveValue,
} from "../src/env-resolve.js";

describe("isReferenceValue", () => {
  it("detects command references", () => {
    assert.equal(isReferenceValue("!op read x"), true);
  });

  it("detects env references", () => {
    assert.equal(isReferenceValue("$MY_KEY"), true);
    assert.equal(isReferenceValue("${KEY}_suffix"), true);
    assert.equal(isReferenceValue("prefix-$VAR"), true);
  });

  it("treats literals and escapes as non-references", () => {
    assert.equal(isReferenceValue("sk-123"), false);
    assert.equal(isReferenceValue(""), false);
    assert.equal(isReferenceValue(undefined), false);
    assert.equal(isReferenceValue("$!not-a-command"), false);
    assert.equal(isReferenceValue("$$literal"), false);
    // "$" followed by nothing special is literal
    assert.equal(isReferenceValue("cost: 5$ "), false);
  });
});

describe("interpolateEnv", () => {
  const env = { FOO: "foo-val", FOO_BAR: "foobar-val", EMPTY: "" };

  it("leaves plain literals untouched", () => {
    assert.deepEqual(interpolateEnv("sk-abc", env), { ok: true, value: "sk-abc" });
  });

  it("resolves $VAR", () => {
    assert.deepEqual(interpolateEnv("$FOO", env), { ok: true, value: "foo-val" });
  });

  it("uses longest variable name for $NAME", () => {
    assert.deepEqual(interpolateEnv("$FOO_BAR", env), {
      ok: true,
      value: "foobar-val",
    });
  });

  it("resolves ${VAR} including inside larger literals", () => {
    assert.deepEqual(interpolateEnv("${FOO}_BAR", env), {
      ok: true,
      value: "foo-val_BAR",
    });
    assert.deepEqual(interpolateEnv("${FOO}-${FOO_BAR}", env), {
      ok: true,
      value: "foo-val-foobar-val",
    });
  });

  it("empty env value counts as resolved", () => {
    assert.deepEqual(interpolateEnv("x${EMPTY}y", env), {
      ok: true,
      value: "xy",
    });
  });

  it("reports missing variables", () => {
    const res = interpolateEnv("$NOPE", env);
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.error, /NOPE/);
  });

  it("supports $$ and $! escapes", () => {
    assert.deepEqual(interpolateEnv("$$literal-dollar", env), {
      ok: true,
      value: "$literal-dollar",
    });
    assert.deepEqual(interpolateEnv("$!not-a-command", env), {
      ok: true,
      value: "!not-a-command",
    });
  });

  it("keeps lone $ literal", () => {
    assert.deepEqual(interpolateEnv("5$ discount", env), {
      ok: true,
      value: "5$ discount",
    });
  });

  it("keeps unclosed ${ as literal", () => {
    assert.deepEqual(interpolateEnv("a${b", env), { ok: true, value: "a${b" });
  });
});

describe("resolveValue", () => {
  it("executes !command and trims stdout", async () => {
    const res = await resolveValue("!echo hello-secret");
    assert.deepEqual(res, { ok: true, value: "hello-secret" });
  });

  it("reports command failure", async () => {
    const res = await resolveValue("!exit 3");
    assert.equal(res.ok, false);
  });

  it("supports custom execImpl (test seam)", async () => {
    const res = await resolveValue("!anything", {
      execImpl: async () => ({ ok: true, stdout: "from-seam\n" }),
    });
    assert.deepEqual(res, { ok: true, value: "from-seam" });
  });

  it("interpolates env through resolveValue", async () => {
    const ok = await resolveValue("$PI_PROVIDER_TUI_TEST_VAR", {
      env: { PI_PROVIDER_TUI_TEST_VAR: "yes" },
    });
    assert.deepEqual(ok, { ok: true, value: "yes" });
  });
});
