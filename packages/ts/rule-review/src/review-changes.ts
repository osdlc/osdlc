/**
 * The one-call entry: review a git checkout's changes against its rule files.
 *
 * Everything {@link review} needs (the changed files, their diffs, the rule
 * sources) is read here from the checkout, in the order the CLI reads them, so
 * a library caller and `rule-review` judge the same thing.
 */
import { resolve } from 'node:path'

import {
  asGit,
  ChangesetError,
  diffsSince,
  errorText,
  filesSince,
  forkPointOf,
  resolveBase,
} from './changeset.ts'
import { planJobs } from './plan.ts'
import { instructionFiles } from './providers/instruction-files.ts'
import { discoverSources, review, type ReviewOptions } from './run.ts'
import {
  DEFAULT_CONFIG,
  type ReviewConfig,
  type ReviewRun,
  type RuleSourceProvider,
} from './types.ts'

/** Input to {@link reviewChanges}. Every field is optional. */
export interface ReviewChangesOptions extends Pick<
  ReviewOptions,
  'dryRun' | 'signal' | 'onJobSettled' | 'dispatch'
> {
  /** A directory inside the checkout. Default: `process.cwd()`. */
  cwd?: string
  /**
   * The rev to compare against. Default `HEAD`: uncommitted work only. A branch
   * name compares the whole branch from where it forked, and prefers
   * `origin/<branch>` when the local branch is behind it. `@{u}` adds unpushed
   * commits; a sha or `HEAD~3` reaches further back.
   */
  base?: string
  /** Where rule sources come from. Default: `[instructionFiles()]`. */
  providers?: readonly RuleSourceProvider[]
  /** Settings over {@link DEFAULT_CONFIG}; only the fields given change. */
  config?: Partial<ReviewConfig>
}

/** What {@link reviewChanges} returns: the run, and the changeset it judged. */
export interface ReviewChangesResult extends ReviewRun {
  /** Absolute path of the checkout's top level, as git reports it (symlinks resolved). */
  projectRoot: string
  /** The base as given. */
  base: string
  /** The rev `base` resolved to, which the files were diffed against. */
  resolvedBase: string
  /** The changed files, repo-relative and sorted. */
  changedFiles: string[]
  /** The settings the run used: {@link DEFAULT_CONFIG} with `config` over it. */
  config: ReviewConfig
}

export { ChangesetError }

/**
 * Review a checkout's changes against the rule files that govern them.
 *
 * Finds the changed files against `base`, discovers the rule sources, and
 * judges each source's files with one agent call. Only files some source
 * governs are diffed. With no changed files it returns an empty run and
 * starts no agent.
 *
 * @throws {ChangesetError} `cwd` is not inside a git checkout, or `base` does not resolve.
 * @throws {FailureError} From `@osdlc/typed-git`, with `failure.kind` `not-installed` or
 *   `not-executable`, when git itself cannot be run.
 * @throws {ScopeError} A source's scope or an `exclude` pattern cannot be read.
 * @throws {Error} A setting is out of range, such as an engine `@osdlc/agent-call` does not know.
 */
export async function reviewChanges(
  options: ReviewChangesOptions = {},
): Promise<ReviewChangesResult> {
  const { cwd, base = 'HEAD', providers, config: overrides, ...pass } = options
  const git = asGit(resolve(cwd ?? process.cwd()))
  const projectRoot = git.cwd
  const config: ReviewConfig = { ...DEFAULT_CONFIG, ...overrides }

  // Resolved once, then used for the file list, the diffs and the report
  // alike, so the ref that is judged and the ref that is printed cannot diverge.
  const resolvedBase = resolveBase(git, base)
  let ref: string
  let files: string[]
  try {
    ref = forkPointOf(git, resolvedBase)
    files = filesSince(git, ref)
  } catch (err) {
    throw new ChangesetError('bad-base', `could not diff against '${base}': ${errorText(err)}`, {
      cause: err,
    })
  }

  const sources =
    files.length === 0
      ? []
      : await discoverSources(providers ?? [instructionFiles()], {
          projectRoot,
          changedFiles: files,
        })
  // A file no source governs is never sent to a judge, so it is not diffed.
  const governed = new Set(planJobs(sources, files, config).jobs.flatMap((j) => j.files))
  let diffs: ReturnType<typeof diffsSince>
  try {
    diffs = diffsSince(git, ref, [...governed])
  } catch (err) {
    throw new ChangesetError('bad-base', `could not diff against '${base}': ${errorText(err)}`, {
      cause: err,
    })
  }

  const run = await review({ ...pass, projectRoot, sources, changedFiles: files, diffs, config })
  return { ...run, projectRoot, base, resolvedBase, changedFiles: files, config }
}
