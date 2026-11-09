/**
 * Versioned migrations for a config file: the steps that bring an older
 * document to the current shape, and the driver that runs them. Both the
 * machine file (`./machine.ts`) and the project file (`./loader.ts`) run
 * through this driver.
 *
 * A file's version is its top-level integer `version` key; a file without one
 * is version 1. A step moves a document from one version to the next. It is
 * either a hand-written `run`, or a list of declarative moves built with
 * {@link defineMigrations}, or both.
 *
 * Every function here works on plain data, in memory. Writing the result back
 * without losing the file's comments is `reconcileYaml`'s job (`./edit.ts`).
 */

import { splitKeyPath } from './explain.ts'
import { isPlainObject } from './value.ts'

/**
 * Something a migration step changed or could not change, for the tool to show.
 *
 * @experimental
 */
export interface MigrationWarning {
  /** The version the step that reported it produces. */
  to: number
  message: string
}

/**
 * One step: `run` turns a version-`from` document into a version-`to` one.
 * `run` receives a copy it may mutate, and `warn` to report a change the user
 * should hear about.
 *
 * @experimental
 */
export interface ConfigMigration {
  from: number
  to: number
  run(raw: Record<string, unknown>, warn: (message: string) => void): Record<string, unknown>
}

/**
 * A key path in a move: dotted (`'agent.claude.command'`) or one string per
 * segment (`['agent', 'claude.command']`), for a key that holds a dot.
 *
 * @experimental
 */
export type MigrationPath = string | readonly string[]

/**
 * One step for {@link defineMigrations}. The step goes from the previous
 * step's `to` (1 for the first) to `to`.
 *
 * `moves` run first, in order. Each `[from, to]` moves the value at `from` to
 * `to`. When `to` is already set, that value wins: the one at `from` is
 * dropped, with a warning. When a segment on the way to `to` holds something
 * other than a mapping, the move cannot happen: `from` stays where it is, with
 * a warning. An absent `from` is no change.
 *
 * `pruneEmpty` (default `true`) then removes each mapping on a moved `from`'s
 * path that the move left with no keys, innermost first, so a strict schema
 * does not reject `{ agent: { claude: {} } }`. A mapping that was empty
 * before the step is left alone.
 *
 * `run`, when given, runs last, on the moved document.
 *
 * @experimental
 */
export interface MigrationStep {
  to: number
  moves?: readonly (readonly [from: MigrationPath, to: MigrationPath])[]
  pruneEmpty?: boolean
  run?: (raw: Record<string, unknown>, warn: (message: string) => void) => Record<string, unknown>
}

/**
 * The version of a file with no `version` key.
 *
 * @experimental
 */
export const BASE_CONFIG_VERSION = 1

/**
 * Turn declarative steps into the ordered {@link ConfigMigration} list the
 * loaders take. Throws when the steps are not in order: each `to` must be an
 * integer greater than the one before it (and than 1), and no move may go
 * from a path to itself, to a path inside it, or to a path that contains it.
 *
 * @experimental
 */
export function defineMigrations(steps: readonly MigrationStep[]): ConfigMigration[] {
  let from = BASE_CONFIG_VERSION
  return steps.map((step, index) => {
    if (!Number.isInteger(step.to) || step.to <= from) {
      throw new Error(
        `migration ${index + 1}: 'to' must be an integer greater than ${from}, got ${String(step.to)}`,
      )
    }
    const moves = (step.moves ?? []).map(([src, dst]) => {
      const a = toPath(src)
      const b = toPath(dst)
      if (isPrefix(a, b) || isPrefix(b, a)) {
        throw new Error(
          `migration ${index + 1}: cannot move '${a.join('.')}' to '${b.join('.')}', ` +
            'one path contains the other',
        )
      }
      return [a, b] as const
    })
    const prune = step.pruneEmpty ?? true
    const migration: ConfigMigration = {
      from,
      to: step.to,
      run(raw, warn) {
        let next = raw
        for (const [a, b] of moves) next = applyMove(next, a, b, prune, warn)
        return step.run === undefined ? next : step.run(next, warn)
      },
    }
    from = step.to
    return migration
  })
}

/**
 * The version the last migration produces; {@link BASE_CONFIG_VERSION} when there are none.
 *
 * @experimental
 */
export function currentConfigVersion(migrations: readonly ConfigMigration[]): number {
  return migrations.at(-1)?.to ?? BASE_CONFIG_VERSION
}

/** A document's integer `version`, else {@link BASE_CONFIG_VERSION}. Internal. */
export function configVersionOf(raw: Record<string, unknown>): number {
  const v = raw.version
  return typeof v === 'number' && Number.isInteger(v) ? v : BASE_CONFIG_VERSION
}

/**
 * What {@link migrateConfigRaw} produced.
 *
 * @experimental
 */
export interface MigratedRaw {
  /** The migrated document; `raw` itself when no step applied. */
  raw: Record<string, unknown>
  /** The version each step that ran produced, in order. */
  applied: number[]
  /** What the steps reported, in order. */
  warnings: MigrationWarning[]
}

/**
 * Run every migration from `raw`'s version on, in order. When a step ran, the
 * returned document carries the final `version`. `raw` is not mutated: each
 * step gets a copy.
 *
 * @experimental
 */
export function migrateConfigRaw(
  raw: Record<string, unknown>,
  migrations: readonly ConfigMigration[],
): MigratedRaw {
  let version = configVersionOf(raw)
  let next = raw
  const applied: number[] = []
  const warnings: MigrationWarning[] = []
  for (const m of migrations) {
    if (m.from !== version) continue
    const to = m.to
    next = m.run(structuredClone(next), (message) => warnings.push({ to, message }))
    version = to
    applied.push(to)
  }
  if (applied.length > 0) next = { ...next, version }
  return { raw: next, applied, warnings }
}

function toPath(path: MigrationPath): string[] {
  if (typeof path === 'string') return splitKeyPath(path)
  if (path.length === 0 || path.some((s) => s === '')) {
    throw new Error(`invalid key path: [${path.map((s) => `'${s}'`).join(', ')}]`)
  }
  return [...path]
}

function isPrefix(prefix: readonly string[], path: readonly string[]): boolean {
  return prefix.length <= path.length && prefix.every((s, i) => path[i] === s)
}

/** Move `from` to `to` in `raw` (a copy the caller owns, mutated in place). */
function applyMove(
  raw: Record<string, unknown>,
  from: readonly string[],
  to: readonly string[],
  prune: boolean,
  warn: (message: string) => void,
): Record<string, unknown> {
  const src = from.join('.')
  const dst = to.join('.')
  // The chain of mappings down to `from`'s parent; a missing link means `from` is not set.
  const chain: Record<string, unknown>[] = [raw]
  for (const seg of from.slice(0, -1)) {
    const cur = chain.at(-1)!
    const child = Object.hasOwn(cur, seg) ? cur[seg] : undefined
    if (!isPlainObject(child)) return raw
    chain.push(child)
  }
  const leaf = from.at(-1)!
  const parent = chain.at(-1)!
  if (!Object.hasOwn(parent, leaf)) return raw
  const value = parent[leaf]

  // Walk to `to`'s parent. Past the first missing segment every mapping is new and
  // empty, so a segment that blocks the move (not a mapping) is always found first.
  let target: Record<string, unknown> = raw
  for (const seg of to.slice(0, -1)) {
    if (!Object.hasOwn(target, seg)) target[seg] = {}
    const child = target[seg]
    if (!isPlainObject(child)) {
      warn(
        `'${src}' was not moved: '${dst}' cannot be set, because a segment of it is not a mapping`,
      )
      return raw
    }
    target = child
  }
  const last = to.at(-1)!
  if (Object.hasOwn(target, last)) {
    warn(`'${src}' was dropped: '${dst}' is already set, and that value is kept`)
  } else {
    target[last] = value
    warn(`moved '${src}' to '${dst}'`)
  }
  delete parent[leaf]
  if (prune) {
    for (let i = chain.length - 1; i > 0; i--) {
      if (Object.keys(chain[i]!).length > 0) break
      delete chain[i - 1]![from[i - 1]!]
    }
  }
  return raw
}
