/**
 * Prompt size in tokens — estimated before a run, observed after one.
 *
 * Bytes stay the enforcement unit (`maxPromptBytes`) because they are exact,
 * free, and engine-independent. Tokens are what a context window is actually
 * denominated in, so they are the more useful number to *read*, and this
 * module exists to render one without pretending to a precision it lacks.
 *
 * There is deliberately no tokenizer here. Anthropic publishes no local
 * tokenizer for current Claude models — the exact count comes from the
 * `count_tokens` endpoint, a network round-trip that would cost `--dry-run`
 * its one strong property, that it is free and offline. A third-party BPE
 * (tiktoken) is not a fix: it is OpenAI's vocabulary, so against Claude it
 * yields a number that looks precise and is not. And this package dispatches
 * through `agent-call` to many different engines, so no single tokenizer
 * would be correct for all of them anyway.
 *
 * What we do instead: divide by a round constant for the estimate, and record
 * the engine's own reported count when a real run reports one.
 */

/**
 * Bytes per token, for UTF-8 source and unified diffs.
 *
 * Round on purpose. English prose runs nearer 4.5 and dense punctuation
 * nearer 3, and diffs are a mix; a second significant figure here would imply
 * a calibration that has not been done.
 */
export const BYTES_PER_TOKEN = 4

/** Approximate token count for a byte size. Never exact — see the module note. */
export function estimateTokens(bytes: number): number {
  return Math.round(bytes / BYTES_PER_TOKEN)
}

/**
 * Render a token count compactly: `55k`, `8.2k`, `430`.
 *
 * Thousands are the unit a context budget is discussed in, so anything above
 * 10k drops the fractional part as noise.
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens)
  const k = tokens / 1000
  // Threshold on the ROUNDED value, not the raw one: 9,999 rounds to 10.0k
  // at one decimal, and printing that beside a real 10k would suggest the
  // two were measured differently.
  return k < 9.95 ? `${k.toFixed(1)}k` : `${Math.round(k)}k`
}

/**
 * Display name for a job: the source's label, plus its shard when split.
 *
 * One helper because every surface that lists jobs — the `rule-review` CLI, any
 * other front end, a report — must name a shard the same way, or the same
 * run appears to describe different work depending on where you read it.
 */
export function jobLabel(job: {
  source: { label: string }
  shard?: { index: number; of: number }
}): string {
  return job.shard === undefined
    ? job.source.label
    : `${job.source.label} (${job.shard.index}/${job.shard.of})`
}
