/**
 * The meta completeness test kit: the checks a tool's own `meta` test runs
 * against its live config schema, so every tool built on this module proves
 * its per-key meta the same way.
 *
 * Each function returns the problems it found (empty when none) instead of
 * asserting, so the kit needs no test runner and a test prints every problem
 * at once with `expect(problems).toEqual([])`. {@link checkConfigMeta} in
 * `./meta.ts` is the well-formedness half; these are the truthfulness half,
 * the claims meta makes that the code can confirm.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { z } from 'zod'

import { MACHINE_LAYER, PLANNED_PREFIX, applierOf, isReserved, readConfigMeta } from './meta.ts'

/**
 * Every `<path>.ts#<symbol>` consumer must name a file under `sourceRoot` that
 * mentions the symbol. The symbol match is a word-boundary one, not a bare
 * substring: `server` would otherwise match `serverLog`. It does
 * not tell a code reference from a comment or string mention, so a symbol that
 * also appears in the file's prose still passes.
 * @experimental
 */
export function consumerProblems(shape: Record<string, z.ZodType>, sourceRoot: string): string[] {
  const broken: string[] = []
  for (const [key, meta] of Object.entries(readConfigMeta(shape))) {
    for (const ref of meta.consumers) {
      if (ref.startsWith(PLANNED_PREFIX)) continue
      const [path, symbol] = ref.split('#') as [string, string]
      const file = join(sourceRoot, path)
      if (!existsSync(file)) {
        broken.push(`${key}: ${ref} (no such file)`)
        continue
      }
      // The consumer grammar limits a symbol to `[A-Za-z_$][\w$]*`, which has no
      // regex metacharacters; the escape stays in case the grammar widens.
      const word = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
      if (!word.test(readFileSync(file, 'utf-8')))
        broken.push(`${key}: ${ref} (symbol not in file)`)
    }
  }
  return broken
}

/**
 * `enforcement` must agree with the facts meta already states: the `reserved`
 * level is exactly a reserved key (every consumer `planned:`), and the
 * `applied` level is exactly an `apply:<applier>` key. Each check runs only
 * when the vocabulary names that level (its `spec.enforcement`).
 * @experimental
 */
export function enforcementProblems(
  shape: Record<string, z.ZodType>,
  levels: { reserved?: string | undefined; applied?: string | undefined },
): string[] {
  const wrong: string[] = []
  for (const [key, meta] of Object.entries(readConfigMeta(shape))) {
    if (
      levels.reserved !== undefined &&
      (meta.enforcement === levels.reserved) !== isReserved(meta)
    ) {
      wrong.push(`${key}: enforcement ${meta.enforcement} vs reserved=${isReserved(meta)}`)
    }
    if (
      levels.applied !== undefined &&
      (meta.enforcement === levels.applied) !== (applierOf(meta) !== null)
    ) {
      wrong.push(`${key}: enforcement ${meta.enforcement} vs applies_via ${meta.applies_via}`)
    }
  }
  return wrong
}

/**
 * The `machine` layer must be claimed by exactly the keys the machine schema
 * also declares. Returns the two sorted lists for the test to compare.
 * @experimental
 */
export function machineLayerKeys(
  shape: Record<string, z.ZodType>,
  machineShape: Record<string, unknown>,
): { claimed: string[]; declared: string[] } {
  const metas = readConfigMeta(shape)
  return {
    claimed: Object.keys(metas)
      .filter((k) => metas[k]!.layers.includes(MACHINE_LAYER))
      .sort(),
    declared: Object.keys(machineShape)
      .filter((k) => k in shape)
      .sort(),
  }
}

/**
 * The appliers in `declared` that no key uses (`except` carves out one with no
 * key of its own, such as an applier that acts on the whole file), plus every reserved key that is not
 * optional: a reserved key has no reader, so it must parse when absent.
 * @experimental
 */
export function applierAndReservedProblems(
  shape: Record<string, z.ZodType>,
  declared: readonly string[],
  except: readonly string[] = [],
): string[] {
  const metas = readConfigMeta(shape)
  const used = new Set(Object.values(metas).map(applierOf))
  const problems = declared
    .filter((name) => !except.includes(name) && !used.has(name))
    .map((name) => `applier '${name}' is declared but no key uses it`)
  for (const [key, meta] of Object.entries(metas)) {
    if (isReserved(meta) && !shape[key]!.safeParse(undefined).success) {
      problems.push(`${key}: a reserved key must be optional`)
    }
  }
  return problems
}
