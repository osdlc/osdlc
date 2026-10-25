/**
 * Test helpers for meta completeness: the checks a tool's own `meta` test runs
 * against its config schema, so every tool built on this module checks its
 * per-key meta the same way.
 *
 * Each function returns the problems it found (empty when none) and does not
 * assert. So the kit needs no test runner, and a test prints every problem at
 * once with `expect(problems).toEqual([])`. {@link checkConfigMeta} in
 * `./meta.ts` checks that meta is well formed. These functions check that the
 * claims meta makes are true, where the code can confirm them.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { z } from 'zod'

import { MACHINE_LAYER, PLANNED_PREFIX, applierOf, isReserved, readConfigMeta } from './meta.ts'

/**
 * Every `<path>.ts#<symbol>` consumer must name a file under `sourceRoot` that
 * mentions the symbol. The match is on word boundaries, not a bare substring,
 * so `server` does not match `serverLog`. It does not tell code from a comment
 * or a string, so a symbol that appears only in the file's prose still passes.
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
      // The consumer grammar allows only `[A-Za-z_$][\w$]*` in a symbol. `$` is a regex
      // metacharacter, so the escape is needed. `$` is also an identifier character but not
      // a regex word character, so the boundaries are lookarounds over `[\w$]`, not `\b`.
      const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const word = new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`)
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
 * The appliers in `declared` that no key uses, plus every reserved key that is
 * not optional. `except` lists appliers with no key of their own, such as one
 * that acts on the whole file. A reserved key has no reader, so it must parse
 * when absent.
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
