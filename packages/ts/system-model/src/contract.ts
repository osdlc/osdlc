/**
 * What a runner and a `detect` function are handed, and the options of the
 * two calls that hand it to them.
 *
 * Two rules keep runners honest and testable:
 *
 *   1. They never spawn. `ctx.runner(binary)` hands back an injected runner,
 *      so a test supplies canned output instead of needing moon on the PATH.
 *   2. They never read the filesystem for discovery. `ctx.files()` applies the
 *      chosen strategy (git-tracked or a directory walk); a runner reaching
 *      past it would disagree with every other runner about which files exist.
 */

import type { AsyncCommandRunner } from '@osdlc/command-seam'

import type { DiscoveryMode } from './model.ts'
import type { PackageManagerChoice } from './roles.ts'
import type { ProjectProfile, ToolDef } from './tool.ts'

/**
 * Whether a runner must run subprocesses to list its tasks.
 *
 * A trust boundary, not an optimization: `moon query tasks` runs the
 * repository's toolchain config. With execution withheld only `parse`
 * runners run. A `parse` runner may still ask its own tool when execution is
 * allowed and the binary is there (just, rake, go-task, gradle do); the kind
 * promises it has an honest answer without.
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
   * The pattern language is `.gitignore`'s anchoring: a pattern with no `/`
   * matches a basename at any depth (`justfile`, `*.mk`); a pattern with a
   * `/` at the start or in the middle is a path from the root
   * (`/mise.toml`, `.github/workflows/*.yml`); a trailing `/` matches every
   * file under that directory. `*` matches within one path segment.
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
   * Whether subprocesses are permitted. An `exec` runner never sees `false`:
   * it is withheld. A `parse` runner or a `detect` function must not spawn
   * when this is `false`.
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
   * Permit `describe` functions that run a subprocess, such as moon's project
   * roles. Defaults to `false`.
   */
  allowExec?: boolean | undefined
  /**
   * `git` lists tracked plus untracked-but-not-ignored files; `walk` walks
   * the tree, skipping well-known directories. `auto` (the default) picks git
   * when the root is a repository and git is on the PATH.
   */
  discovery?: DiscoveryMode | 'auto' | undefined
  /**
   * Extra paths to skip, on top of the built-in list. A bare name matches a
   * path segment at any depth; a value with a slash matches a root-relative
   * prefix. Use it for trees that are data, such as test-fixture repositories.
   */
  excludePaths?: string[] | undefined
  /**
   * Add the built-in exclude list to `excludePaths` (default `true`). Pass
   * `false` when `excludePaths` must be the whole list.
   */
  useBuiltinExcludes?: boolean | undefined
  /** Build the runner for a binary. Defaults to the subprocess seam. */
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
   * Permit subprocesses. Defaults to `false`: a library that shells out by
   * default runs unknown code when pointed somewhere new.
   */
  allowExec?: boolean | undefined
  /**
   * Appended to the diagnostic on a runner withheld for want of execution,
   * such as the sentence a CLI wants a user to read about trust.
   */
  execWithheldHint?: string | undefined
  /** Build the runner for a binary. Defaults to the subprocess seam. */
  makeRunner?: ((binary: string) => AsyncCommandRunner) | undefined
  /** PATH lookup. Defaults to a `node:fs` PATH walk. */
  which?: ((binary: string) => string | null) | undefined
  signal?: AbortSignal | undefined
}
