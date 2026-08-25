/**
 * Heuristics that pre-fill likely-correct defaults for models discovered from
 * gateways. All guesses are initial values only — every prompt still lets the
 * user override them.
 */

/**
 * Patterns matched against the lowercased model id to decide whether a model
 * most likely supports reasoning/thinking. Kept conservative to avoid false
 * positives on chat-only families (gpt-4o, claude-3-5, qwen2.5, llama…).
 */
const REASONING_PATTERNS: RegExp[] = [
  // OpenAI o-series: o1, o3-mini, o4-mini … ("gpt-4o" does NOT match)
  /(?:^|[^a-z0-9])o[134](?:$|[^a-z0-9])/,
  // GPT-5 family and later (all reasoning-capable)
  /(?:^|[^a-z0-9])gpt-[5-9]/,
  // DeepSeek R-line
  /(?:^|[^a-z0-9])deepseek-r\d/,
  // Qwen: QwQ and Qwen3+ (hybrid thinking on by default)
  /(?:^|[^a-z0-9])(?:qwq|qwen[3-9])/,
  // Generic markers
  /thinking/,
  /reason(?:ing|er)/,
  // Gemini 2.5+ think by default
  /(?:^|[^a-z0-9])gemini-(?:2\.[5-9]|[3-9])/,
  // Grok 4+, GLM Z-line / 4.5+ hybrids, MiniMax M-line, Mistral Magistral
  /(?:^|[^a-z0-9])grok-[4-9]/,
  /(?:^|[^a-z0-9])glm-(?:z\d|4\.5|[5-9])/,
  /(?:^|[^a-z0-9])minimax-m\d/,
  /magistral/,
];

/**
 * Claude reasoning check. Extended thinking exists on 3.7 and 4.x+; 3.5 and
 * earlier are chat-only. Handles both naming orders:
 *   claude-{maj}-{min}-{family} → claude-3-7-sonnet (reasoning), claude-3-5-sonnet (not)
 *   claude-{family}-{maj}-{min} → claude-opus-4-7, claude-haiku-4-5 (reasoning)
 */
function isClaudeReasoning(id: string): boolean {
  const cm = /(?:^|[^a-z0-9])claude(?:$|[^a-z0-9])/.exec(id);
  if (!cm) return false;
  const rest = id.slice(cm.index + cm[0].length);

  // Version-first: claude-3-7-sonnet, claude-3-haiku, claude-2.1
  const vf = /^(\d{1,2})(?:[.-](\d{1,}))?(?:$|[^a-z0-9])/.exec(rest);
  if (!vf) {
    // Family-first: claude-opus-4-7, claude-sonnet-4-20250514
    const ff = /(?:^|[^a-z0-9])(\d{1,2})(?=$|[^a-z0-9])/.exec(rest);
    return ff !== null && Number(ff[1]) >= 4;
  }
  const maj = Number(vf[1]);
  const min = vf[2] !== undefined ? parseInt(vf[2], 10) : -1;
  return maj >= 4 || (maj === 3 && min === 7);
}

/** Best-effort guess whether a model id belongs to a reasoning model. */
export function guessReasoning(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return REASONING_PATTERNS.some((re) => re.test(id)) || isClaudeReasoning(id);
}
