/**
 * `@osdlc/typed-git/testing` — throwaway git repositories for tests.
 *
 * A separate subpath, not part of the package entry: production code should
 * not be able to reach `mkdtemp` through a git client.
 *
 * It is general on purpose. Conventions that belong to one consuming project,
 * such as a directory layout or a ref namespace, go in that project's own
 * wrapper around these helpers, not here.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { Git } from './sync.ts'

/**
 * A fixed author and committer identity, supplied through the environment
 * rather than written into the repo config. The dates are pinned because they
 * are the two inputs to a commit object that would otherwise move every run.
 *
 * Only identity is isolated. A fixture also turns off `commit.gpgsign` in its
 * own repo config. The rest of the developer's global and system config still
 * applies: `core.hooksPath`, `commit.template`, `init.templateDir`,
 * `core.autocrlf` and the like. A suite that must not see them sets
 * `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_NOSYSTEM` itself, for example through
 * the `identity` option.
 */
export const IDENTITY: Readonly<Record<string, string>> = Object.freeze({
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_AUTHOR_DATE: '2020-01-01T00:00:00+0000',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_DATE: '2020-01-01T00:00:00+0000',
})

/** Per-commit overrides, for a suite that needs commits at distinct times. */
export interface FixtureCommitOptions {
  /**
   * Both `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` for this commit. Set it
   * rather than the two variables by hand: a commit whose two dates disagree
   * has a different sha from one where they match.
   */
  date?: string | undefined
  /** Further environment entries for this commit only, over `date`. */
  env?: Record<string, string> | undefined
}

/** A temp repository and the client bound to it. */
export interface GitFixture {
  /** Absolute path of the repository's working tree (or of a bare store). */
  readonly dir: string
  /**
   * A client rooted at {@link GitFixture.dir}, carrying the fixture identity
   * as its client-level `env`, so every call through it runs under the pinned
   * identity, a suite's own calls included.
   */
  readonly git: Git
  /** Write files (paths relative to `dir`), stage everything, and commit. */
  commit(message: string, files?: Record<string, string>, opts?: FixtureCommitOptions): string
  /** Remove the temp directory. Idempotent. */
  cleanup(): void
}

/** Shared options for where a fixture is made and who authors it. */
interface FixtureLocation {
  /**
   * Use this exact directory rather than making one. `cleanup()` still removes
   * it, so do not point it at anything you want to keep.
   */
  dir?: string | undefined
  /**
   * Make the temp directory under this parent instead of `os.tmpdir()`, so two
   * related repositories share one parent, such as a store and its worker, or
   * an origin and its clone.
   */
  parent?: string | undefined
  /** Prefix for the generated directory name. */
  prefix?: string | undefined
  /** Override the pinned {@link IDENTITY} wholesale. */
  identity?: Record<string, string> | undefined
}

/** Make (or adopt) the directory a fixture will live in. */
function fixtureDir(opts: FixtureLocation, fallbackPrefix: string): string {
  if (opts.dir !== undefined) {
    mkdirSync(opts.dir, { recursive: true })
    return resolve(opts.dir)
  }
  const parent = opts.parent === undefined ? tmpdir() : resolve(opts.parent)
  mkdirSync(parent, { recursive: true })
  return mkdtempSync(join(parent, opts.prefix ?? fallbackPrefix))
}

/**
 * Wrap an existing directory that already holds a repository.
 *
 * The identity is set as the client's `env` rather than passed on each call,
 * so every call the fixture makes runs under it, including the `rev-parse`
 * inside `commit()`.
 */
function fixtureAt(
  dir: string,
  opts: { identity?: Record<string, string> | undefined; bare?: boolean | undefined } = {},
): GitFixture {
  const identity = opts.identity ?? IDENTITY
  const git = new Git(dir, { env: { ...identity } })
  // A developer with `commit.gpgsign = true` globally would otherwise fail
  // every fixture commit, on their machine only. A bare store has no commits
  // made in it, so there is nothing to sign.
  if (opts.bare !== true) git.configSet('commit.gpgsign', 'false')
  return {
    dir,
    git,
    commit(message, files = {}, commitOpts = {}) {
      for (const [rel, content] of Object.entries(files)) {
        const path = join(dir, rel)
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, content)
      }
      const env: Record<string, string> = {}
      if (commitOpts.date !== undefined) {
        env['GIT_AUTHOR_DATE'] = commitOpts.date
        env['GIT_COMMITTER_DATE'] = commitOpts.date
      }
      Object.assign(env, commitOpts.env ?? {})
      const call = Object.keys(env).length === 0 ? {} : { env }
      git.add(['.'], { all: true, ...call })
      git.commit({ message, allowEmpty: true, ...call })
      const head = git.revParse('HEAD')
      if (head === null) throw new Error('fixture commit produced no HEAD')
      return head
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** Options for {@link makeGitFixture}. */
export interface MakeGitFixtureOptions extends FixtureLocation {
  /** Initial branch name; `main` when omitted. */
  initialBranch?: string | undefined
  /** Make a bare store rather than a working tree. */
  bare?: boolean | undefined
}

/** Create an initialized repository, by default under the OS temp directory. */
export function makeGitFixture(opts: MakeGitFixtureOptions = {}): GitFixture {
  const dir = fixtureDir(opts, 'typed-git-fixture-')
  const initOpts: { quiet: true; initialBranch: string; bare?: boolean } = {
    quiet: true,
    initialBranch: opts.initialBranch ?? 'main',
  }
  if (opts.bare === true) initOpts.bare = true
  new Git(dir).init(undefined, initOpts)
  const at: { identity?: Record<string, string> | undefined; bare?: boolean } = {
    identity: opts.identity,
  }
  if (opts.bare === true) at.bare = true
  return fixtureAt(dir, at)
}

/** Options for {@link makeOriginAndCheckout}. */
export interface MakeOriginAndCheckoutOptions {
  /** Initial branch name; `main` when omitted. */
  initialBranch?: string | undefined
  /** Files in the origin's first commit; a `README.md` when omitted. */
  files?: Record<string, string> | undefined
  /**
   * Make both repositories under this parent instead of `os.tmpdir()`.
   * `cleanup()` removes the two repositories, not `parent`.
   */
  parent?: string | undefined
  /** Override the pinned {@link IDENTITY} wholesale. */
  identity?: Record<string, string> | undefined
}

/** What {@link makeOriginAndCheckout} returns. */
export interface OriginAndCheckout {
  origin: GitFixture
  checkout: GitFixture
  /** Remove the checkout and the origin. */
  cleanup(): void
}

/**
 * An origin repository with one commit, plus a clone of it. Tests of fetch,
 * push and worktree behaviour need this setup.
 *
 * Use {@link makeBareAndWorker} instead when the second repo must have
 * its own history rather than the origin's.
 */
export function makeOriginAndCheckout(opts: MakeOriginAndCheckoutOptions = {}): OriginAndCheckout {
  const branch = opts.initialBranch ?? 'main'
  const origin = makeGitFixture({
    prefix: 'typed-git-origin-',
    initialBranch: branch,
    parent: opts.parent,
    identity: opts.identity,
  })
  origin.commit('initial', opts.files ?? { 'README.md': 'fixture\n' })

  const dir = fixtureDir({ parent: opts.parent }, 'typed-git-checkout-')
  // `Git.clone` runs from `cwd` (see sync.ts). `dir` is not a repository yet; this clone makes it the checkout.
  new Git(dir).clone(origin.dir, '.', { quiet: true, branch })
  const checkout = fixtureAt(dir, { identity: opts.identity })

  return {
    origin,
    checkout,
    cleanup() {
      checkout.cleanup()
      origin.cleanup()
    },
  }
}

/** Options for {@link makeBareAndWorker}. */
export interface MakeBareAndWorkerOptions {
  /** Name the worker knows the store by; `origin` when omitted. */
  remoteName?: string | undefined
  /**
   * Shared parent for both; a fresh temp directory when omitted.
   *
   * Warning: `cleanup()` removes this whole directory, also when you pass it,
   * with everything else in it. Do not point it at anything you want to keep.
   */
  parent?: string | undefined
  /** Initial branch name; `main` when omitted. */
  initialBranch?: string | undefined
  /** Override the pinned {@link IDENTITY} wholesale. */
  identity?: Record<string, string> | undefined
}

/** What {@link makeBareAndWorker} returns. */
export interface BareAndWorker {
  bare: GitFixture
  worker: GitFixture
  remoteName: string
  /** The directory both repositories live in. */
  parent: string
  /** Remove `parent` and everything in it, also a `parent` the caller passed. */
  cleanup(): void
}

/**
 * A bare store plus an independently-inited worker that names it as a remote.
 *
 * Not a clone: the worker is `git init`ed on its own and given a remote, so it
 * starts with no history and no upstream tracking, and its first push is a
 * real first push into an empty store.
 *
 * Both repositories land under one parent, so a suite deletes one directory.
 * `cleanup()` deletes that whole parent, also one the caller passed in; see
 * {@link MakeBareAndWorkerOptions.parent}.
 */
export function makeBareAndWorker(opts: MakeBareAndWorkerOptions = {}): BareAndWorker {
  const parent =
    opts.parent === undefined
      ? mkdtempSync(join(tmpdir(), 'typed-git-pair-'))
      : resolve(opts.parent)
  mkdirSync(parent, { recursive: true })
  const remoteName = opts.remoteName ?? 'origin'
  const branch = opts.initialBranch ?? 'main'

  const bare = makeGitFixture({
    dir: join(parent, 'store.git'),
    bare: true,
    initialBranch: branch,
    identity: opts.identity,
  })
  const worker = makeGitFixture({
    dir: join(parent, 'worker'),
    initialBranch: branch,
    identity: opts.identity,
  })
  worker.git.remoteAdd(remoteName, bare.dir)

  return {
    bare,
    worker,
    remoteName,
    parent,
    cleanup() {
      rmSync(parent, { recursive: true, force: true })
    },
  }
}
