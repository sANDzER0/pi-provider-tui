import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guessReasoning } from "../src/heuristics.js";

describe("guessReasoning", () => {
  it("flags OpenAI o-series and GPT-5+", () => {
    for (const id of [
      "o1",
      "o1-mini",
      "o3",
      "o3-mini-high",
      "o4-mini",
      "gpt-5",
      "gpt-5.6-sol",
      "openai/gpt-5-mini",
      "openai/o4-mini-2025-04-16",
    ]) {
      assert.equal(guessReasoning(id), true, id);
    }
  });

  it("flags DeepSeek R-line, QwQ, Qwen3+, thinking/reasoning markers", () => {
    for (const id of [
      "deepseek-r1",
      "deepseek-r1-0528",
      "qwq-32b-preview",
      "qwen3-235b-a22b",
      "Qwen/Qwen3-32B",
      "gemini-2.5-flash-thinking",
      "kimi-k2-thinking",
      "granite-3.2-reasoning",
    ]) {
      assert.equal(guessReasoning(id), true, id);
    }
  });

  it("flags Claude 3.7+/4.x, Gemini 2.5+, Grok 4+, GLM Z/4.5+, MiniMax M", () => {
    for (const id of [
      "claude-opus-4-7",
      "claude-sonnet-4",
      "anthropic/claude-3-7-sonnet-latest",
      "claude-haiku-4-5",
      "gemini-2.5-pro",
      "google/gemini-3-pro",
      "grok-4",
      "glm-z1",
      "glm-4.5-air",
      "minimax-m1",
      "mistralai/magistral-medium-latest",
    ]) {
      assert.equal(guessReasoning(id), true, id);
    }
  });

  it("does not flag chat-only families", () => {
    for (const id of [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4.1",
      "gpt-35-turbo",
      "llama3.1:8b",
      "qwen2.5-coder:7b",
      "qwen2.5-72b-instruct",
      "deepseek-v3",
      "deepseek-chat",
      "claude-3-5-sonnet-20241022",
      "claude-3-haiku",
      "gemini-1.5-flash",
      "gemini-2.0-flash",
      "grok-2",
      "glm-4",
      "mistral-small-latest",
      "phi-4",
      "yi-34b-chat",
    ]) {
      assert.equal(guessReasoning(id), false, id);
    }
  });
});
