/**
 * The context a runner and a `detect` function receive, and the options of
 * the two calls that pass it to them.
 *
 * Two rules keep runners correct and testable:
 *
 *   1. They never spawn a process. `ctx.runner(binary)` returns an injected
 *      runner, so a test supplies canned output instead of needing moon on
 *      the PATH.
 *   2. They never read the filesystem for discovery. `ctx.files()` applies the
 *      chosen strategy (git-tracked or a directory walk). A runner that went
 *      around it would disagree with every other runner about which files
 *      exist.
 */

import type { AsyncCommandRunner } from '@osdlc/command-seam'

import type { DiscoveryMode } from './model.ts'
import type { PackageManagerChoice } from './roles.ts'
import type { ProjectProfile, ToolDef } from './tool.ts'

/**
 * Whether a runner must run subprocesses to list its tasks.
 *
 * This is a trust boundary, not an optimization. `moon query tasks` runs the
 * repository's toolchain config. With execution withheld, only `parse`
 * runners run. A `parse` runner may still ask its own tool when execution is
 * allowed and the binary is present (just, rake, go-task and gradle do). The
 * `parse` kind promises a correct answer without running anything.
 */
export type ProviderKind = 'parse' | 'exec'

/** The read-only view of one repository that runners and `detect` functions use. */
export interface ProviderContext {
  /** Absolute. Every path a runner returns is relative to this. */
  root: string
  /** A runner for one binary, injected. */
  runner(binary: string): AsyncCommandRunner
  /**
   * Root-relative paths matching a pattern, memoized for the call.
   *
   * Patterns use `.gitignore`'s anchoring. A pattern with no `/` matches a
   * basename at any depth (`justfile`, `*.mk`). A pattern with a `/` at the
   * start or in the middle is a path from the root (`/mise.toml`,
   * `.github/workflows/*.yml`). A trailing `/` matches every file under that
   * directory. `*` matches within one path segment.
   */
  files(pattern: string): Promise<string[]>
  /** Read and parse a JSON file, root-relative. `null` when absent or malformed. */
  readJson(relPath: string): Promise<unknown>
  /** Read a text file, root-relative. `null` when absent. */
  readText(relPath: string): Promise<string | null>
  /** True when a root-relative path exists. */
  exists(relPath: string): Promise<boolean>
  /** PATH lookup for a binary, with no subprocess. */
  which(binary: string): string | null
  /**
   * Whether subprocesses are allowed. An `exec` runner never sees `false`,
   * because it is withheld instead. A `parse` runner or a `detect` function
   * must not spawn a process when this is `false`.
   */
  allowExec: boolean
  discovery: DiscoveryMode
  /** Aborted when the caller cancels. */
  signal: AbortSignal
}

/** A {@link ProviderContext} plus the profile and the registered tools, for runners. */
export interface RunnerContext extends ProviderContext {
  profile: ProjectProfile
  tools: readonly ToolDef[]
  /**
   * `Project.packageManagers` for this profile: the manager per ecosystem of
   * the package at `dir`.
   *
   * @experimental
   */
  packageManagers(dir: string): PackageManagerChoice[]
}

/** Options for `Project.detect`. */
export interface DetectOptions {
  /**
   * Allow `describe` functions that run a subprocess, such as moon's project
   * roles. Defaults to `false`.
   */
  allowExec?: boolean | undefined
  /**
   * `git` lists tracked files plus untracked files that are not ignored.
   * `walk` walks the tree, skipping well-known directories. `auto` (the
   * default) picks git when the root is a repository and git is on the PATH.
   */
  discovery?: DiscoveryMode | 'auto' | undefined
  /**
   * Extra paths to skip, on top of the built-in list. A bare name matches a
   * path segment at any depth. A value with a slash matches a root-relative
   * prefix. Use it for trees that are data, such as test-fixture repositories.
   */
  excludePaths?: string[] | undefined
  /**
   * Add the built-in exclude list to `excludePaths` (default `true`). Pass
   * `false` when `excludePaths` must be the whole list.
   */
  useBuiltinExcludes?: boolean | undefined
  /** Build the runner for a binary. Defaults to `spawnRunnerAsync` from `@osdlc/command-seam`. */
  makeRunner?: ((binary: string) => AsyncCommandRunner) | undefined
  /** PATH lookup. Defaults to a `node:fs` PATH walk. */
  which?: ((binary: string) => string | null) | undefined
  signal?: AbortSignal | undefined
}

/** Options for `Project.runners.collect` and the cached variants. */
export interface CollectOptions {
  /** Restrict to these runner ids. */
  only?: string[] | undefined
  /** Skip these runner ids. */
  exclude?: string[] | undefined
  /**
   * Allow subprocesses. Defaults to `false`, because a library that runs
   * subprocesses by default runs unknown code when pointed at a new repo.
   */
  allowExec?: boolean | undefined
  /**
   * Appended to the diagnostic of a runner withheld because execution is not
   * allowed. For example, a CLI's sentence telling the user how to trust the
   * repo.
   */
  execWithheldHint?: string | undefined
  /** Build the runner for a binary. Defaults to `spawnRunnerAsync` from `@osdlc/command-seam`. */
  makeRunner?: ((binary: string) => AsyncCommandRunner) | undefined
  /** PATH lookup. Defaults to a `node:fs` PATH walk. */
  which?: ((binary: string) => string | null) | undefined
  signal?: AbortSignal | undefined
}
