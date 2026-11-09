// Context sizes: the `ctx=` size grammar shared by references and a profile's
// `context:`, and the translation of a size into each tool's own form, which
// needs no form when the window the tool runs the model with already covers the
// size (`defaultWindow`, `contextArgs`). Whether a model reaches a size at all
// is `checkContext`, the one place a requirement is checked against the
// catalogue.

import { err, ok, type Result } from '@osdlc/result'
import type { CatalogueQuery } from './catalogue/query.ts'

/** `digits` plus `k` (1,000) or `m` (1,000,000): decimal units. */
const SIZE_PATTERN = /^([1-9][0-9]*)([km])$/

/**
 * The largest context size in tokens, `Number.MAX_SAFE_INTEGER`: above it a
 * size is no longer an exact integer, and `formatSize` could not print it back.
 */
export const MAX_SIZE = Number.MAX_SAFE_INTEGER

/**
 * A context size in tokens, or why `text` is not one: `malformed` when it is not
 * `digits` plus `k` or `m`, `too-large` when it names more than {@link MAX_SIZE}
 * tokens. The parsers use it to say which.
 */
export function readSize(text: string): Result<number, 'malformed' | 'too-large'> {
  const m = SIZE_PATTERN.exec(text)
  if (m === null) return err('malformed')
  const size = Number(m[1]) * (m[2] === 'm' ? 1_000_000 : 1_000)
  return size > MAX_SIZE ? err('too-large') : ok(size)
}

/**
 * A context size in tokens, or `undefined` when `text` is not `digits` plus `k`
 * or `m`, or names more than {@link MAX_SIZE} tokens.
 */
export function parseSize(text: string): number | undefined {
  const size = readSize(text)
  return size.ok ? size.value : undefined
}

/**
 * A size in the reference form: `1m`, `200k`. A size neither unit divides is
 * rounded down to whole `k` (1,048,576 is `1048k`), so the text parses and, as
 * `ctx=` means "at least", still asks for no more than the size. Under 1k there
 * is no reference form and the digits are returned.
 */
export function formatSize(tokens: number): string {
  if (tokens % 1_000_000 === 0) return `${tokens / 1_000_000}m`
  if (tokens >= 1_000) return `${Math.floor(tokens / 1_000)}k`
  return String(tokens)
}

/** Claude Code's default window; at or under it nothing is passed. */
const CLAUDE_DEFAULT_CONTEXT = 200_000

/** Claude Code's one context variant, `[1m]`: the most a size can ask of it. */
const CLAUDE_LONG_CONTEXT = 1_000_000

/** What a tool is given for a context size. */
export type ContextArgs = {
  /**
   * The model string, with the tool's suffix or bracket when the size needs
   * one (`opus[1m]`, `x[context=1m]`); unchanged when the default window
   * covers the size; absent when there was no model, for `ollama` (the size goes
   * in `options`), and whenever the size is unchecked.
   */
  model?: string
  /** Request options, for a runtime that takes the size per request (Ollama's `num_ctx`). */
  options?: { num_ctx: number }
  /**
   * Nothing carries the size and nothing shows the run has it: the tool has
   * no verified form and the size is above (or there is no known) default
   * window, the tool's form needs a model and there is none, or the size is
   * above the largest the tool's form reaches (Claude's `[1m]`).
   */
  contextUnchecked: boolean
}

/**
 * The context window `model` runs with on `tool` when nothing asks for a size.
 * It is the catalogue's `default`. The tool's offering wins over the model's
 * own row.
 *
 * A model's `max` is never used here. A model's largest size (models.dev's
 * `limit.context`, an Ollama model's trained `context_length`) is not the
 * window a tool gives it. Codex runs its models at 272k; Ollama runs at its
 * own `num_ctx`.
 *
 * `undefined` when the catalogue states no `default`, or when there is no
 * model (the catalogue names no default model for a tool).
 */
export function defaultWindow(
  catalogue: CatalogueQuery,
  tool: string,
  model: string | undefined,
): number | undefined {
  if (model === undefined) return undefined
  const found = catalogue.findModel(tool, model)
  if (found === undefined) return undefined
  return found.offering.context?.default ?? found.model.context?.default
}

/**
 * Translate a context size into `tool`'s own form:
 *
 * - Claude needs nothing at or under its 200k default. Above it, up to 1m,
 *   the model alias gets `[1m]`. This is documented. Above 1m nothing
 *   reaches the size (`ctx=` means at least), so it is `contextUnchecked`.
 * - Cursor takes `model[context=1m]`. This comes from its CLI help only.
 * - An Ollama runtime takes `num_ctx` per request.
 * - Any other tool has no verified form. That includes Codex: no run has
 *   confirmed its `-c` config key. A size the model's default window already
 *   covers needs no form, and the model passes unchanged. (`defaultWindow`
 *   finds that window; the caller passes it as `defaultContext`.) A larger
 *   size, or any size with no known window, gets nothing and is
 *   `contextUnchecked`.
 *
 * A size that needs Claude's or Cursor's form but has no model to attach it to
 * is `contextUnchecked` too.
 *
 * Pure. The launcher that builds the argv applies the result, and refuses a
 * size whose form is unchecked.
 */
export function contextArgs(
  tool: string,
  model: string | undefined,
  ctx: number,
  defaultContext?: number,
): ContextArgs {
  switch (tool) {
    case 'claude':
      if (ctx <= CLAUDE_DEFAULT_CONTEXT) {
        return { ...(model !== undefined ? { model } : {}), contextUnchecked: false }
      }
      return model === undefined || ctx > CLAUDE_LONG_CONTEXT
        ? { contextUnchecked: true }
        : { model: `${model}[1m]`, contextUnchecked: false }
    case 'cursor':
      if (model === undefined) return { contextUnchecked: true }
      return { model: `${model}[context=${formatSize(ctx)}]`, contextUnchecked: false }
    case 'ollama':
      return { options: { num_ctx: ctx }, contextUnchecked: false }
    default:
      if (defaultContext !== undefined && ctx <= defaultContext) {
        return { ...(model !== undefined ? { model } : {}), contextUnchecked: false }
      }
      return { contextUnchecked: true }
  }
}
