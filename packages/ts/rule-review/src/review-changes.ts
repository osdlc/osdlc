/**
 * The one-call entry: review a git checkout's changes against its rule files.
 *
 * Everything {@link review} needs (the changed files, their diffs, the rule
 * sources) is read here from the checkout, in the order the CLI reads them, so
 * a library caller and `rule-review` judge the same thing.
 */
import { resolve } from 'node:path'

import { Git } from '@osdlc/typed-git'

import { changedFiles, fileDiffs, resolveBase } from './changeset.ts'
import { instructionFiles } from './providers/instruction-files.ts'
import { discoverSources, review, type ReviewOptions } from './run.ts'
import {
  DEFAULT_CONFIG,
  type ReviewConfig,
  type ReviewRun,
  type RuleSourceProvider,
} from './types.ts'

/** Input to {@link reviewChanges}. Every field is optional. */
export interface ReviewChangesOptions {
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
  /** Plan and measure without starting an agent. See {@link ReviewOptions.dryRun}. */
  dryRun?: boolean
  /** Aborting kills every running agent. See {@link ReviewOptions.signal}. */
  signal?: AbortSignal
  /** Called as each judgement settles, for progress output. */
  onJobSettled?: ReviewOptions['onJobSettled']
  /** Replace the agent call, as in {@link ReviewOptions.dispatch}. */
  dispatch?: ReviewOptions['dispatch']
}

/** What {@link reviewChanges} returns: the run, and the changeset it judged. */
export interface ChangesReview extends ReviewRun {
  /** Absolute path of the checkout's top level. */
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

/**
 * Why {@link reviewChanges} could not start: the directory is not inside a git
 * checkout (`not-a-repository`), or the base does not resolve (`bad-base`).
 * `kind` may gain values in a minor release; treat an unknown one as a failure.
 */
export class ChangesetError extends Error {
  override readonly name = 'ChangesetError'
  constructor(
    readonly kind: 'not-a-repository' | 'bad-base',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

/**
 * Review a checkout's changes against the rule files that govern them.
 *
 * Finds the changed files against `base`, discovers the rule sources, and
 * judges each source's files with one agent call. With no changed files it
 * returns an empty run and starts no agent.
 *
 * @throws {ChangesetError} `cwd` is not inside a git checkout, or `base` does not resolve.
 * @throws {ScopeError} A source's scope or an `exclude` pattern cannot be read.
 * @throws {Error} The engine is not one `@osdlc/agent-call` knows.
 */
export async function reviewChanges(options: ReviewChangesOptions = {}): Promise<ChangesReview> {
  const cwd = resolve(options.cwd ?? process.cwd())
  let root: string | null
  try {
    root = new Git(cwd).topLevel()
  } catch (err) {
    // A missing directory fails the spawn itself rather than reading as "not a repo".
    throw new ChangesetError('not-a-repository', `${cwd}: ${message(err)}`, { cause: err })
  }
  if (root === null) {
    throw new ChangesetError('not-a-repository', `${cwd} is not inside a git repository`)
  }

  const git = new Git(root)
  const base = options.base ?? 'HEAD'
  // Resolved once, then used for the file list, the diffs and the report alike,
  // so the ref that is judged and the ref that is printed cannot diverge.
  const resolvedBase = resolveBase(git, base)
  const config: ReviewConfig = { ...DEFAULT_CONFIG, ...options.config }

  let files: string[]
  let diffs: ReturnType<typeof fileDiffs>
  try {
    files = changedFiles(git, resolvedBase)
    diffs = files.length === 0 ? [] : fileDiffs(git, resolvedBase, files)
  } catch (err) {
    throw new ChangesetError('bad-base', `could not diff against '${base}': ${message(err)}`, {
      cause: err,
    })
  }

  const sources =
    files.length === 0
      ? []
      : await discoverSources(options.providers ?? [instructionFiles()], {
          projectRoot: root,
          changedFiles: files,
        })
  const run = await review({
    projectRoot: root,
    sources,
    changedFiles: files,
    diffs,
    config,
    ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
    ...(options.onJobSettled !== undefined ? { onJobSettled: options.onJobSettled } : {}),
    ...(options.dispatch !== undefined ? { dispatch: options.dispatch } : {}),
  })
  return { ...run, projectRoot: root, base, resolvedBase, changedFiles: files, config }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
