/**
 * The git feature table: the one place that says which git release each
 * version-dependent feature needs, and which of them have a fallback.
 *
 * A verb that uses one of these features names it in `needs` (see `GitVerb`
 * in `./verbs.ts`). Before such a verb runs, the client probes the git version
 * once per runner (`./git-version.ts`) and calls {@link versionedVerb}, which
 * picks the verb's own form, its `fallback` form, or throws the
 * `unsupported-git` failure. No other module compares versions.
 *
 * Every feature at or below {@link GIT_FLOOR} is used without a check. Below
 * the floor itself, every version-gated verb fails as `unsupported-git` with
 * the feature `typed-git`, and no fallback is tried.
 *
 * The README's "Git versions" table is checked against this one by
 * `tests/features.test.ts`.
 */

import { FailureError } from '@osdlc/result'

import { describeGitFailure, type GitFailure } from './failure.ts'
import { compareGitVersions, formatGitVersion, type GitVersion } from './git-version.ts'
import type { GitVerb } from './verbs.ts'

/** A `major.minor.patch` release, without the `text` a probed version carries. */
export type GitRelease = Pick<GitVersion, 'major' | 'minor' | 'patch'>

/**
 * The oldest git this package supports: 2.34, the git of Ubuntu 22.04 LTS.
 * Every flag typed-git passes unconditionally is at least this old.
 */
export const GIT_FLOOR: GitRelease = Object.freeze({ major: 2, minor: 34, patch: 0 })

/** One row of {@link GIT_FEATURES}. */
export interface GitFeatureSpec {
  /** The first git release with the feature. */
  readonly minimum: GitRelease
  /** The methods that use it. */
  readonly usedBy: readonly string[]
  /**
   * What runs instead on an older git, for a feature whose older form gives
   * the same answer. A feature without one fails as `unsupported-git`.
   */
  readonly fallback?: string
}

const release = (major: number, minor: number): GitRelease =>
  Object.freeze({ major, minor, patch: 0 })

/**
 * Every git feature newer than {@link GIT_FLOOR} that typed-git uses.
 *
 * - `merge-tree --write-tree`: git 2.38 ("git merge-tree" learned a new mode
 *   that computes the merge tree, RelNotes/2.38.0). `--name-only` and `-z`
 *   arrived with it.
 * - `merge-tree --merge-base`: git 2.40 ("merge-tree" learns a new
 *   `--merge-base` option, RelNotes/2.40.0).
 * - `worktree list -z`: git 2.36 (NUL-terminated `--porcelain` output, because
 *   paths and lock reasons with unsafe bytes were not C-quoted correctly,
 *   RelNotes/2.36.0).
 */
export const GIT_FEATURES = Object.freeze({
  'merge-tree --write-tree': { minimum: release(2, 38), usedBy: ['mergeTree'] },
  'merge-tree --merge-base': { minimum: release(2, 40), usedBy: ['mergeTree({ mergeBase })'] },
  'worktree list -z': {
    minimum: release(2, 36),
    usedBy: ['worktrees'],
    fallback:
      'newline-split `worktree list --porcelain`: a path with a newline breaks it, and a lock reason comes back C-quoted',
  },
} satisfies Record<string, GitFeatureSpec>)

/** A feature in {@link GIT_FEATURES}. */
export type GitFeature = keyof typeof GIT_FEATURES

/** What an `unsupported-git` failure carries: the feature, the git it needs, and the git found. */
export interface UnsupportedGit {
  /** The feature, or `typed-git` when the git is older than {@link GIT_FLOOR}. */
  feature: GitFeature | 'typed-git'
  /** The first git release that has it. */
  needs: GitRelease
  /** The git that was found. */
  have: GitVersion
}

/** True when `have` has `feature`. */
export function gitSupports(feature: GitFeature, have: GitRelease): boolean {
  return compareGitVersions(have, GIT_FEATURES[feature].minimum) >= 0
}

/** `2.38` — a feature minimum as the README and the messages write it. */
function formatMinimum(v: GitRelease): string {
  return v.patch === 0 ? `${v.major}.${v.minor}` : formatGitVersion(v)
}

/** The classified failure for a git too old for `feature`. */
export function unsupportedGitFailure(
  feature: GitFeature | 'typed-git',
  needs: GitRelease,
  have: GitVersion,
  argv: string[],
): GitFailure {
  const want = formatMinimum(needs)
  return {
    kind: 'unsupported-git',
    message: `${feature} needs git ${want} or later; found ${formatGitVersion(have)}.`,
    hint: `Upgrade git to ${want} or later from https://git-scm.com.`,
    detail: `git version ${have.text}`,
    argv,
    exitCode: null,
    unsupported: { feature, needs, have },
  }
}

function throwUnsupported(
  feature: GitFeature | 'typed-git',
  needs: GitRelease,
  have: GitVersion,
  argv: string[],
): never {
  const failure = unsupportedGitFailure(feature, needs, have, argv)
  const thrown = new FailureError(failure)
  thrown.message = describeGitFailure(failure)
  throw thrown
}

/**
 * The form of `verb` that the git at `have` can run: the verb itself when it
 * needs nothing or `have` has its feature, its `fallback` when the feature has
 * one in the table, otherwise a thrown `unsupported-git` failure. Below
 * {@link GIT_FLOOR} a gated verb always throws.
 *
 * `prefix` is the repository binding the client adds, so the failure names
 * the argv that would have run.
 */
export function versionedVerb<T>(
  verb: GitVerb<T>,
  have: GitVersion,
  prefix: readonly string[] = [],
): GitVerb<T> {
  const feature = verb.needs
  if (feature === undefined) return verb
  const argv = [...prefix, ...verb.argv]
  if (compareGitVersions(have, GIT_FLOOR) < 0) throwUnsupported('typed-git', GIT_FLOOR, have, argv)
  if (gitSupports(feature, have)) return verb
  const spec: GitFeatureSpec = GIT_FEATURES[feature]
  if (spec.fallback !== undefined && verb.fallback !== undefined) {
    return versionedVerb(verb.fallback, have, prefix)
  }
  return throwUnsupported(feature, spec.minimum, have, argv)
}
