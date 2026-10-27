/**
 * Unknown keys, removed and reported instead of refused.
 *
 * A strict schema (`.strict()` at every level) reports every key it does not
 * define as an `unrecognized_keys` issue. {@link stripUnknownKeys} turns those
 * issues into a copy of the input without the keys, plus the path of each
 * removed key. The input is never changed. The machine config's salvage
 * (`./machine.ts`) and the project loader's `'warn'` mode (`./loader.ts`) both
 * use it, so the two treat an unknown key the same way.
 */

import type { z } from 'zod'

import { isPlainObject } from './value.ts'

interface Unrecognized {
  path: PropertyKey[]
  keys: string[]
}

/**
 * The `unrecognized_keys` issues among `issues`, including those inside a
 * union. A union reports one issue that holds each branch's issues. A branch
 * whose only fault is unknown keys is taken as the one the input was meant
 * for. Among several, the one with the fewest unknown keys wins, the first on
 * a tie. Paths are made absolute.
 */
function unrecognizedIn(
  issues: readonly z.core.$ZodIssue[],
  base: PropertyKey[] = [],
): Unrecognized[] {
  const out: Unrecognized[] = []
  for (const issue of issues) {
    const path = [...base, ...issue.path]
    if (issue.code === 'unrecognized_keys') {
      out.push({ path, keys: issue.keys })
    } else if (issue.code === 'invalid_union') {
      let best: Unrecognized[] | undefined
      let bestCount = Infinity
      for (const errs of issue.errors) {
        if (errs.length === 0 || !errs.every((e) => e.code === 'unrecognized_keys')) continue
        const found = unrecognizedIn(errs, path)
        const count = found.reduce((n, u) => n + u.keys.length, 0)
        if (count < bestCount) {
          best = found
          bestCount = count
        }
      }
      if (best !== undefined) out.push(...best)
    }
  }
  return out
}

/**
 * What {@link stripUnknownKeys} found.
 *
 * @experimental
 */
export interface StrippedKeys {
  /** `raw` without the unknown keys. Same object when there were none. */
  value: Record<string, unknown>
  /** The path of each removed key, outermost segment first. */
  unknown: string[][]
}

/**
 * Remove every key `schema` does not define, at any depth, from a copy of
 * `raw`. A parse reports an unknown key only where it got that far, so this
 * repeats until a pass finds none. The loop ends because each pass removes at
 * least one key. A key nested in a union branch the parse never entered stays,
 * and fails the real parse as an invalid value. `schema` must be strict.
 *
 * @experimental
 */
export function stripUnknownKeys(
  schema: z.ZodTypeAny,
  raw: Record<string, unknown>,
  /**
   * Whether the object at this path (array indexes as strings) keeps its
   * unknown keys, so the real parse fails on them. Use it for a matcher or
   * selector, where dropping a key widens what it matches.
   */
  keepStrict?: (path: readonly string[]) => boolean,
): StrippedKeys {
  let draft: Record<string, unknown> | null = null
  const unknown: string[][] = []
  for (;;) {
    const result = schema.safeParse(draft ?? raw)
    if (result.success) break
    let removed = 0
    for (const issue of unrecognizedIn(result.error.issues)) {
      if (keepStrict?.(issue.path.map(String))) continue
      draft ??= structuredClone(raw)
      const parent = issue.path.reduce<unknown>(
        (node, seg) =>
          typeof node === 'object' && node !== null
            ? (node as Record<PropertyKey, unknown>)[seg]
            : undefined,
        draft,
      )
      if (!isPlainObject(parent)) continue
      for (const key of issue.keys) {
        if (!(key in parent)) continue
        delete parent[key]
        unknown.push([...issue.path.map(String), key])
        removed++
      }
    }
    if (removed === 0) break
  }
  return { value: draft ?? raw, unknown }
}

/**
 * Build a predicate over key paths from dotted patterns, for the `keepStrict`
 * argument of {@link stripUnknownKeys}. `*` stands for exactly one segment (an
 * array index or a key). A trailing `**` stands for any number of further
 * segments, including none.
 *
 * @experimental
 */
export function pathMatcher(patterns: readonly string[]): (path: readonly string[]) => boolean {
  const split = patterns.map((p) => p.split('.'))
  return (path) =>
    split.some((pat) => {
      const deep = pat[pat.length - 1] === '**'
      const head = deep ? pat.slice(0, -1) : pat
      if (deep ? path.length < head.length : path.length !== head.length) return false
      return head.every((seg, i) => seg === '*' || seg === path[i])
    })
}
