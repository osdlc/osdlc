/**
 * Resolving a conflict without asking anyone.
 *
 * Most conflicts in a repository that regenerates artifacts need no judgement.
 * Over 400 merges in the repository this was built in, most conflicted files
 * were lockfiles and generated output. Nobody edits those by hand, and their
 * correct content is whatever the generator produces. For those the answer is
 * mechanical: take a side to get a tree, re-run the tool, stage what it wrote.
 *
 * The resolvers are tried in order. Each claims the paths it knows how to
 * rebuild, and the resolver that claims a path is responsible for the result.
 * A conflict no resolver claims is left alone. An update that guessed at a
 * source file would be worse than one that reported it needed a person.
 *
 * The resolvers, in order:
 *
 *   0. rerere: git replayed a resolution recorded earlier in this run. It
 *      costs nothing, and it is why a stack of sibling PRs on one base needs
 *      one resolution, not one per PR.
 *   1. lockfile: built in, because every ecosystem has lockfiles and the
 *      resolution always has the same form: take a side, then regenerate from
 *      the merged manifest. Regenerating needs a command only the host knows
 *      (`PrUpdateConfig.lockfile_install`). Without one the path is left
 *      unclaimed, rather than resolved to a lockfile that disagrees with its
 *      own manifest.
 *   2. regenerate: `PrUpdateConfig.resolvers`. A host's own codegen
 *      (`docs/index.md`, say) is set in that config, not in this file. This
 *      package is reusable, and a consumer's codegen does not belong in it.
 *   3. generator: `Ports.generators`, the same idea supplied in code by a host
 *      that runs its generator in process instead of as a shell verb.
 *   4. repair: `Ports.repair`, opt-in through `PrUpdateConfig.repair`. It
 *      does not claim paths. The executor calls it once for whatever the
 *      resolvers above left unclaimed, then checks its result (`execute.ts`).
 *
 * Without a repair, an unclaimed conflict ends the attempt for that PR and the
 * run moves on.
 */

import type { Generator } from '../ports.ts'
import { branchMatchesGlob } from '../strategy.ts'

/**
 * Lockfiles, by exact basename.
 *
 * Matching on the basename, not the full path, is on purpose. A monorepo has
 * one per workspace, and all of them are generated.
 *
 * `go.sum` is here too, even though it is append-only. Its conflicts are two
 * independent additions, and `go mod tidy` settles them.
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
 * Assign every conflicted path to a resolver.
 *
 * Lockfiles are checked before the configured rules, so a project cannot hide
 * the built-in rule by accident with a broad `**` glob, and so the common case
 * needs no configuration.
 */
export function planPaths(
  conflicts: readonly string[],
  rules: readonly RegenerateRule[],
  lockfileInstall: string | null,
  generators: readonly Generator[] = [],
): PathPlan[] {
  return conflicts.map((path): PathPlan => {
    if (isLockfile(path)) {
      // Taking a side without regenerating would push a lockfile that
      // disagrees with its own manifest, which is worse than not updating.
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
 * One rule usually claims several paths. `docs/index.md` and
 * `docs/glossary.md` are both `make docs`, and every lockfile in a workspace
 * is one `bun install`. Running a generator once per file would be wasted
 * work, and wrong for a tool that rewrites a whole directory.
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

/** Paths no resolver claimed, with the reason. Non-empty means the PR needs a person. */
export function unclaimed(plans: readonly PathPlan[]): { path: string; why: string }[] {
  return plans
    .filter((p): p is Extract<PathPlan, { kind: 'unclaimed' }> => p.kind === 'unclaimed')
    .map((p) => ({ path: p.path, why: p.why }))
}
