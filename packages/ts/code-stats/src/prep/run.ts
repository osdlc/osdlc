/**
 * `prep`'s pipeline: measure the change with {@link measureChange} (which
 * resolves it, reads its diff and classifies its files), split the files, group
 * them by package root, raise the flags. The repository's top level (found
 * from the working directory) is the checkout; git and gh are reached only
 * through the injected runners.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { CommandRunner } from '@osdlc/command-seam'

import { CodeStatsError, commandFailedOf } from '../error.ts'
import { changeSpecFrom } from '../git/change.ts'
import { measureChange } from '../measure.ts'
import type { FileContent } from '../types.ts'
import { Checkout } from './checkout.ts'
import { splitFiles } from './files.ts'
import { raiseFlags } from './flags/index.ts'
import { buildGroups, packageRoots } from './groups.ts'
import { prepManifestSchema, type PrepManifest, type Thresholds } from './schema.ts'

/**
 * The numbers a run uses unless {@link PrepArgs.thresholds} overrides them: a
 * function of 90 lines or more is long, more than half of it added makes it
 * flaggable, and a package group of more than 12 files is split.
 */
export const DEFAULT_THRESHOLDS: Thresholds = {
  longFunctionLines: 90,
  longFunctionAddedShare: 0.5,
  groupSize: 12,
}

/** What to prep and from where. */
export interface PrepArgs {
  /** A directory inside the checkout. The run starts from the repository's top level. */
  cwd: string
  /** A pull request number, or null. With `base`, `head` and `worktree`: read as {@link changeSpecFrom} reads them. */
  pr: number | null
  /** The ref to diff against, or null for the default. See {@link PrepArgs.pr}. */
  base: string | null
  /** With `base`: diff exactly `<base>..<head>`. */
  head?: string | null
  /** Prep the working tree, untracked files included. */
  worktree?: boolean
  /** Overrides for {@link DEFAULT_THRESHOLDS}. */
  thresholds?: Partial<Thresholds>
}

/** The command runners a run reaches git and `gh` through, so a caller can fake them. */
export interface PrepEnv {
  /** Runs `git`; `spawnRunner('git')` from `@osdlc/command-seam` is the usual one. */
  git: CommandRunner
  /** Runs `gh`; only a pull request reaches it. */
  gh: CommandRunner
}

const textOf = (content: FileContent | undefined): string | null =>
  content?.kind === 'text' ? content.text : null

/**
 * Measure a change and plan its review: the manifest `code-stats prep` prints.
 * Reads the checkout, runs no model and writes nothing. The manifest is
 * validated against {@link prepManifestSchema} before it is returned.
 *
 * @throws {CodeStatsError} when the change cannot be read, or the selectors
 * contradict each other (`kind` is then `bad-input`).
 */
export function runPrep(args: PrepArgs, env: PrepEnv): PrepManifest {
  const thresholds: Thresholds = { ...DEFAULT_THRESHOLDS, ...args.thresholds }
  const spec = changeSpecFrom(args)
  let manifest: PrepManifest
  try {
    // Only the file facts are wanted: no API or complexity pass.
    const {
      repo,
      change,
      files: diff,
      report,
      texts,
    } = measureChange(spec, {
      cwd: args.cwd,
      runners: env,
      analysis: false,
      requireCommits: true,
    })
    // Every git call and file read runs from the top level, so a subdirectory
    // start sees the root-relative paths the diff prints.
    const { git, root: cwd } = repo
    const checkout = new Checkout(cwd, git)
    const files = splitFiles(report)
    // Markers are read from the head's tree, no checkout needed; the working tree has no rev.
    const headPaths =
      change.head === null
        ? checkout.files.filter((p) => existsSync(join(cwd, p)))
        : git.lsTree(change.head, { recursive: true }).map((e) => e.path)
    const groups = buildGroups(files.kept, packageRoots(headPaths), thresholds.groupSize)
    const diffOf = new Map(diff.map((f) => [f.path, f]))
    const baseOf = (path: string) => {
      const f = diffOf.get(path)
      return f === undefined || f.status === 'added' ? undefined : texts.base.get(f.oldPath ?? path)
    }
    const { flags, notes } = raiseFlags({
      thresholds,
      checkout,
      kept: files.kept,
      addedAt: new Map(diff.map((f) => [f.path, f.added.map((l) => l.at)])),
      groupOf: new Map(groups.flatMap((s) => s.files.map((p) => [p, s.id] as const))),
      readHead: (path) => textOf(texts.head.get(path)),
      readBase: (path) => textOf(baseOf(path)),
      tooLarge: new Set(
        files.kept
          .filter((f) =>
            [texts.head.get(f.path), baseOf(f.path)].some((c) => c?.kind === 'too-large'),
          )
          .map((f) => f.path),
      ),
    })
    manifest = { schema: 2, change, coverage: ['ts'], thresholds, files, groups, flags, notes }
  } catch (e) {
    if (e instanceof CodeStatsError) throw e
    const failed = commandFailedOf(e)
    if (failed !== null) {
      throw new CodeStatsError(
        `could not read the repository: ${failed.detail.trim().split('\n')[0]}`,
        { cause: e },
      )
    }
    throw e
  }
  return prepManifestSchema.parse(manifest)
}
