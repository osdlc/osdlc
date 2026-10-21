/**
 * Resolving a conflict without asking anyone.
 *
 * Most conflicts in a repository that regenerates artifacts are not judgement
 * calls. Measured over the last 400 merges here, the conflicted files are
 * dominated by lockfiles and generated output — files nobody edits by hand and
 * whose correct content is whatever the generator says it is. For those the
 * answer is mechanical: take a side to get a tree, re-run the tool, stage what
 * it wrote.
 *
 * That is the whole idea of the ladder. Each rung claims paths it knows how to
 * rebuild, and a rung that claims a path owns the result. A conflict no rung
 * claims is left alone — an update that guessed at a source file would be
 * worse than one that reported it needed a human.
 *
 * The rungs, in order:
 *
 *   0. **rerere** — git replayed a resolution recorded earlier in this run.
 *      Free, and the reason a stack of siblings sharing a base costs one
 *      resolution rather than one per PR.
 *   1. **lockfile** — recognized built in, because every ecosystem has one and
 *      the resolution is always the same shape: take a side, re-derive from
 *      the merged manifest. The re-derivation needs a command only the host
 *      knows (`PrUpdateConfig.lockfile_install`); without one the path is left
 *      unclaimed rather than resolved to a lockfile that disagrees with its
 *      own manifest.
 *   2. **regenerate** — `PrUpdateConfig.resolvers`. A host's own codegen
 *      (`docs/index.md`, say) lives in that config, not in this file: this
 *      package is a reusable product and a consumer's own codegen is not its
 *      business.
 *   3. **generator** — `Ports.generators`, the same idea supplied in code by a
 *      host that runs its generator in process rather than as a shell verb.
 *   4. **repair** — `Ports.repair`, opt-in through `PrUpdateConfig.repair`.
 *      It is not a path plan: the executor calls it once for whatever the
 *      rungs above left unclaimed, then checks its result (`execute.ts`).
 *
 * Without a repair, an unclaimed conflict ends the attempt for that PR and the
 * run moves on.
 */

import type { Generator } from '../ports.ts'
import { branchMatchesGlob } from '../strategy.ts'

/**
 * Lockfiles, by exact basename.
 *
 * Matching on basename rather than a full path is deliberate: a monorepo has
 * one per workspace and they are all equally derived.
 *
 * `go.sum` is here for the same reason even though it is append-only: its
 * conflicts are two independent additions, and `go mod tidy` is the arbiter.
 */
const LOCKFILES = new Set([
  'bun.lock',
  'bun.lockb',
  'Cargo.lock',
  'composer.lock',
  'Gemfile.lock',
  'go.sum',
  'package-lock.json',
  'pnpm-lock.yaml',
  'poetry.lock',
  'uv.lock',
  'yarn.lock',
])

/** True when `path` is a lockfile any ecosystem would regenerate. */
export function isLockfile(path: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1)
  return LOCKFILES.has(base)
}

/** A configured `paths` → `run` rule from `PrUpdateConfig.resolvers`. */
export interface RegenerateRule {
  paths: readonly string[]
  run: string
}

/** The first configured rule claiming `path`, or null. */
export function matchRegenerate(
  path: string,
  rules: readonly RegenerateRule[],
): RegenerateRule | null {
  for (const rule of rules) {
    if (rule.paths.some((p) => branchMatchesGlob(p, path))) return rule
  }
  return null
}

/** What to do about one conflicted path. */
export type PathPlan =
  | { kind: 'lockfile'; path: string; run: string }
  | { kind: 'regenerate'; path: string; run: string }
  | { kind: 'generator'; path: string; generator: string }
  | { kind: 'unclaimed'; path: string; why: string }

/**
 * Assign every conflicted path to a rung.
 *
 * Lockfiles are checked before the configured rules so a project cannot
 * accidentally shadow the built-in with a broad `**` glob — and so that the
 * common case needs no configuration at all.
 */
export function planPaths(
  conflicts: readonly string[],
  rules: readonly RegenerateRule[],
  lockfileInstall: string | null,
  generators: readonly Generator[] = [],
): PathPlan[] {
  return conflicts.map((path): PathPlan => {
    if (isLockfile(path)) {
      // Taking a side without re-deriving would push a lockfile that
      // disagrees with its own manifest — worse than not updating at all.
      return lockfileInstall === null
        ? { kind: 'unclaimed', path, why: 'lockfile, but no lockfile_install configured' }
        : { kind: 'lockfile', path, run: lockfileInstall }
    }
    const rule = matchRegenerate(path, rules)
    if (rule !== null) return { kind: 'regenerate', path, run: rule.run }
    const gen = generators.find((g) => g.claims(path))
    return gen === undefined
      ? { kind: 'unclaimed', path, why: 'no resolver claims it' }
      : { kind: 'generator', path, generator: gen.name }
  })
}

/**
 * The distinct shell verbs a plan needs, in first-seen order.
 *
 * One rule usually claims several paths — `docs/index.md` and
 * `docs/glossary.md` are both `make docs`, every lockfile in a
 * workspace is one `bun install` — and running a generator once per file it
 * owns would be wasted work and, for a tool that rewrites a whole directory,
 * actively misleading.
 */
export function rebuildVerbs(plans: readonly PathPlan[]): string[] {
  return [
    ...new Set(
      plans.flatMap((p) => (p.kind === 'lockfile' || p.kind === 'regenerate' ? [p.run] : [])),
    ),
  ]
}

/** The distinct generator names a plan needs, in first-seen order, as {@link rebuildVerbs}. */
export function generatorNames(plans: readonly PathPlan[]): string[] {
  return [...new Set(plans.flatMap((p) => (p.kind === 'generator' ? [p.generator] : [])))]
}

/** Paths no rung claimed, with why. Non-empty means the PR needs a human. */
export function unclaimed(plans: readonly PathPlan[]): { path: string; why: string }[] {
  return plans
    .filter((p): p is Extract<PathPlan, { kind: 'unclaimed' }> => p.kind === 'unclaimed')
    .map((p) => ({ path: p.path, why: p.why }))
}
