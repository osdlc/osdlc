/**
 * Per-repository consent to run a repository's own scripts.
 *
 * {@link trustStore} answers "has a person agreed to run this repository's
 * scripts?" for any CLI tool, with one store per tool name.
 *
 * Why it exists: some things a tool does to a repository it did not write
 * run that repository's code: its own scripts, its build config, its hooks.
 * A setting inside the repository (its config file, its build config)
 * cannot authorize this, because the repository could grant itself that
 * setting. So the tool asks a person once per repository and stores the
 * answer here.
 *
 * ## Where the store lives
 *
 * In a state directory, not a config directory. Trust is state a program
 * keeps, not configuration a person edits, so it is not stored next to a
 * tool's `config.yaml`. People sync config files between machines, for
 * example in a dotfiles repo. A consent record for one machine that is copied
 * to another is no longer consent.
 *
 * A tool that passes `vendorDirs` gets its store from `@osdlc/tiered-dirs`,
 * like its other machine-local files: `<state home>/<tool>[/<app>]/trusted/`.
 * The convention and the `<PREFIX>_ROOT` and `<PREFIX>_STATE_DIR` overrides
 * of those vendor dirs place it. A tool under a family root passes the family
 * as `tool` and itself as `app`, so its markers stay its own. Consent given
 * to one tool must never cover another.
 *
 * A store that opts in this way reads only its new place. Grants made before,
 * in the old place, are not carried over: the person runs the tool's `trust`
 * again, once per tool per machine. The old markers are never read or
 * touched, so an older release keeps using them. Carrying them over was tried
 * and dropped: each way of telling whether a copy had already been made, and
 * whether the two places differ, had a case that brought back a grant the
 * person had revoked.
 *
 * The new place is the old folder only on Linux, or macOS under `xdg`, with
 * no `app`, no `<PREFIX>_ROOT` or `<PREFIX>_STATE_DIR`, and an
 * `XDG_STATE_HOME` that is unset or absolute. There the grants are already
 * in place; anywhere else the store starts empty.
 *
 * A tool that passes neither `vendorDirs` nor `dir` keeps the place every
 * release before this one used: `$XDG_STATE_HOME/<tool>/trusted/`, or
 * `~/.local/state/<tool>/trusted/` when the variable is unset, on every
 * platform. A leading `~` in the variable is expanded, because direnv, `.env`
 * loaders and CI YAML pass a literal `~` through. No tool changes place until
 * it opts in.
 *
 * ## What a trust decision is keyed on
 *
 * A key and a scope. The key is a root or a repository. A root is the
 * absolute, symlink-resolved repository root. A repository is
 * `{ repo: 'host/owner/name' }`, for a clone whose folder is made again in
 * another place: a grant on its path would be lost each time. The scope says what the grant covers: {@link WHOLE_REPO_SCOPE} (`*`)
 * is the whole repository, and any other string is one tool, named as the
 * caller chooses (a tool or runner id). This package gives a scope no
 * meaning. A whole-repository grant covers every scope.
 *
 * A tool can run another tool. A mise task runs mise, so it can run mise's
 * hooks. A caller asks about every tool a command will run, not only the one
 * the command names. `resolveExecGate` takes a list of scopes for this.
 *
 * Two paths that lead to one
 * repository (a symlinked checkout, or a `/tmp` that is really
 * `/private/tmp`) share one decision. The person answered about the
 * repository, not about the path they typed.
 *
 * A repository key is lower-cased and checked by {@link parseTrustRepo}. It
 * can never equal a root. A root starts with `/`, or a drive letter and `:`
 * on Windows. A repository key starts with a host name, which is never empty
 * and never holds a `:`. So no folder, whatever it is named, shares a grant
 * with a repository, and a path rule never matches one.
 *
 * The key is a path, not a hash of the repository's contents. mise does the
 * same. A trusted repository stays trusted if it later pulls hostile
 * changes, and {@link TrustStore.untrust} is the only way to remove the
 * grant. A hash of every config file in a monorepo would ask again after
 * ordinary edits. People asked that often learn to approve without reading,
 * which is less safe than a simple path rule.
 *
 * ## How it is stored
 *
 * A directory of marker files, one per trusted root, as mise does it.
 * Creating and deleting a file are atomic and independent, so two processes
 * that trust two repositories at the same time cannot lose each other's
 * write. A single JSON file would need a locked read-modify-write, and a bug
 * there would silently drop a trust record. The cost is a directory of
 * opaque names instead of one readable file. {@link TrustStore.list} reads
 * them back.
 *
 * A whole-repository marker is named
 * `${basename(root)}-${sha256(root).slice(0, 16)}`, and a repository's
 * `${name}-${sha256('host/owner/name').slice(0, 16)}`: the same rule, with the
 * key in place of the root. The hash tells apart
 * repositories with the same name. The basename keeps an `ls` of the store
 * readable. The file contains the resolved absolute path and a newline. mise
 * uses a symlink to the path instead, which breaks once the repository is
 * deleted. A plain file keeps {@link TrustStore.list} exact and readable by
 * eye. The write is atomic, so a partial write is never read as a grant. A
 * repository's marker holds its key the same way, so an older release lists
 * it as a root named `host/owner/name` and never reads it as a grant on a
 * folder.
 *
 * A grant for one scope lives in `<marker>.scopes/`, in a file named
 * `${slug(scope)}-${sha256(scope).slice(0, 16)}` that holds the root and the
 * scope on two lines. Whole-repository markers keep the name and content they
 * have always had, so a store written by an older release reads as it is.
 *
 * The store directory is mode 0700 and each marker 0600, because the list of
 * trusted repositories is private. A store left looser by an older release is
 * tightened on the next {@link TrustStore.trust}, or by
 * {@link TrustStore.tighten}.
 */

import { createHash } from 'node:crypto'
import { chmod, mkdir, readdir, readFile, rm, rmdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { atomicWriteAsync } from '@osdlc/etag-write'
import { systemBaseDirs, TieredDirs, type EnvVars, type ResolveOptions } from '@osdlc/tiered-dirs'

import { homeDir } from './home.ts'
import { resolveTrustRoot } from './paths.ts'
import { xdgHome } from './xdg.ts'

/**
 * The directory that holds the marker files, under the tool's state
 * directory.
 *
 * @experimental
 */
export const TRUST_MARKER_DIR = 'trusted'

/**
 * Whose state home a store lives in: the vendor and its override variables.
 * The same shape `@osdlc/config-layers`' `machineConfigFile` takes as
 * `vendorDirs`, so a tool passes one value to both.
 *
 * @experimental
 */
export interface TrustVendorDirs {
  /** The vendor segment, e.g. `com.example`. */
  vendor: string
  /** The override variables, e.g. `envVars('TOOLY')` from `@osdlc/tiered-dirs`. */
  envVars: EnvVars
}

/** The old place: `$XDG_STATE_HOME/<tool>/trusted/`, else `~/.local/state/<tool>/trusted/`. */
function legacyStoreDir(
  tool: string,
  env: Record<string, string | undefined>,
  home: string,
): string {
  return join(xdgHome(env, home, 'XDG_STATE_HOME', '.local', 'state'), tool, TRUST_MARKER_DIR)
}

/**
 * Refuse options that would be silently ignored: `app` or `dirs` without
 * `vendorDirs`, and `env` or `home` beside `dirs`, which alone places the
 * store. A `TypeError`, since each is a mistake in the calling code.
 */
function checkOptions(opts: TrustStoreOptions): void {
  if (opts.dir !== undefined) return
  if (opts.vendorDirs === undefined) {
    if (opts.dirs !== undefined || opts.app !== undefined) {
      throw new TypeError(
        `trust store: ${opts.dirs !== undefined ? 'dirs' : 'app'} needs vendorDirs; without it the store keeps its old place, which has no app directory`,
      )
    }
  } else if (opts.dirs !== undefined && (opts.env !== undefined || opts.home !== undefined)) {
    throw new TypeError(
      `trust store: ${opts.env !== undefined ? 'env' : 'home'} is ignored when dirs is given; close over it in the dirs factory instead`,
    )
  }
}

/** The store's directory for `opts`. See "Where the store lives" above. */
function locateStore(opts: TrustStoreOptions): string {
  if (opts.dir !== undefined) return opts.dir
  checkOptions(opts)
  if (opts.vendorDirs === undefined) {
    return legacyStoreDir(opts.tool, opts.env ?? process.env, opts.home ?? homeDir())
  }
  // Only what the caller injected is passed, so tiered-dirs' test rules still
  // apply to a store built from the real environment.
  const resolveOpts: ResolveOptions = {
    ...(opts.env !== undefined ? { env: opts.env } : {}),
    ...(opts.home !== undefined ? { home: opts.home } : {}),
  }
  const dirs =
    opts.dirs?.() ??
    new TieredDirs(opts.vendorDirs.vendor, systemBaseDirs(opts.vendorDirs.envVars, resolveOpts))
  const state = dirs.standalone(opts.tool).state()
  return join((opts.app !== undefined ? state.app(opts.app) : state).path, TRUST_MARKER_DIR)
}

/**
 * Where a tool's store lives. Pure: it reads nothing on disk. `env` and
 * `home` are parameters because a test that read the real environment would
 * read the developer's own trust store, and a test that wrote would grant
 * trust on their machine.
 *
 * Given a tool name, the old place: `$XDG_STATE_HOME/<tool>/trusted/`, or
 * `~/.local/state/<tool>/trusted/` when the variable is unset. Given
 * {@link TrustStoreOptions}, the directory {@link trustStore} uses for them:
 * `dir` when set, else `<state home>/<tool>[/<app>]/trusted/` through
 * `@osdlc/tiered-dirs` when `vendorDirs` is set, else the old place.
 *
 * Throws a `TypeError` for `app` or `dirs` without `vendorDirs`, or for
 * `env` or `home` beside `dirs`, and tiered-dirs' `TieredDirsError` when the
 * state home cannot be resolved, such as for a relative `<PREFIX>_ROOT` or a
 * `tool` or `app` that is not one path segment.
 * @experimental
 */
export function trustStoreDir(opts: TrustStoreOptions): string
export function trustStoreDir(
  tool: string,
  env?: Record<string, string | undefined>,
  home?: string,
): string
export function trustStoreDir(
  tool: string | TrustStoreOptions,
  env: Record<string, string | undefined> = process.env,
  home?: string,
): string {
  if (typeof tool !== 'string') return locateStore(tool)
  return legacyStoreDir(tool, env, home ?? homeDir())
}

/**
 * The scope of a grant that covers the whole repository: every tool in it.
 * A store written before scopes existed holds only grants of this scope.
 *
 * @experimental
 */
export const WHOLE_REPO_SCOPE = '*'

/** Whether `c` is a control character. */
function isControl(c: string): boolean {
  return c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f
}

/**
 * `scope` with leading and trailing whitespace removed, so `'just '` and
 * `'just'` name one grant. Throws a `TypeError` unless the result can name a
 * grant: 1-200 characters with no control characters. An empty or
 * whitespace-only scope throws.
 */
function normalizeScope(scope: string): string {
  const trimmed = typeof scope === 'string' ? scope.trim() : scope
  if (
    typeof trimmed !== 'string' ||
    trimmed === '' ||
    trimmed.length > 200 ||
    [...trimmed].some(isControl)
  ) {
    throw new TypeError(
      `trust scope must be 1-200 characters with no control characters: ${JSON.stringify(scope)}`,
    )
  }
  return trimmed
}

/**
 * A scope a person typed (a `--scope` value), ready to grant: trimmed and
 * checked as every store method checks it. `*` is refused, because a
 * whole-repository grant is made by calling `trust(root)` with no scope, not
 * by naming one. Throws a `TypeError` naming the problem, which a CLI can
 * report as a usage error.
 *
 * @example
 * ```ts
 * parseTrustScope(' just ') // 'just'
 * parseTrustScope('*') // throws TypeError
 * ```
 * @experimental
 */
export function parseTrustScope(input: string): string {
  const scope = normalizeScope(input)
  if (scope === WHOLE_REPO_SCOPE) {
    throw new TypeError(
      `trust scope "*" is reserved for the whole repository; trust it without a scope instead`,
    )
  }
  return scope
}

/**
 * A repository a grant can name instead of a root: `{ repo: 'host/owner/name' }`.
 * For a clone, whose folder changes each time it is made again. See
 * {@link parseTrustRepo} for the form `repo` must have.
 *
 * @experimental
 */
export interface TrustRepoKey {
  repo: string
}

/**
 * What a grant is keyed on: a root (a path, resolved through symlinks) or a
 * repository ({@link TrustRepoKey}).
 *
 * @experimental
 */
export type TrustKey = string | TrustRepoKey

/**
 * Which kind of key a grant has: a `path` (a root) or a `repo`.
 *
 * @experimental
 */
export type TrustKeyKind = 'path' | 'repo'

/** The longest owner or name a repository key takes, so its marker name stays short. */
const MAX_REPO_SEGMENT = 200

/** One DNS label: letters, digits and `-`, not at either end. */
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/** Why `key`, already lower-cased, is not `host/owner/name`; null when it is. */
function repoProblem(key: string): string | null {
  const parts = key.split('/')
  if (parts.length !== 3) return 'it needs exactly three parts, host/owner/name'
  if (parts.some((p) => p === '')) return 'a part is empty'
  if (parts.some((p) => p === '.' || p === '..')) return 'a part is . or ..'
  if (/[\s\\]/.test(key) || [...key].some(isControl)) {
    return 'it holds a space, a backslash or a control character'
  }
  const [host, owner, name] = parts as [string, string, string]
  if (host.length > 253 || !host.split('.').every((label) => HOST_LABEL.test(label))) {
    return `${JSON.stringify(host)} is not a host name`
  }
  if (owner.length > MAX_REPO_SEGMENT || name.length > MAX_REPO_SEGMENT) {
    return `the owner and the name take at most ${MAX_REPO_SEGMENT} characters each`
  }
  // `api.git` and `api` would be two grants on one repository.
  if (name.endsWith('.git')) return 'the name ends in .git; pass the name without .git'
  return null
}

/**
 * A repository key, ready to grant: `input` trimmed and lower-cased, as
 * every store method reads `{ repo }`. Throws a `TypeError` naming the
 * problem, which a CLI can report as a usage error, unless the result is
 * `host/owner/name`:
 *
 * - exactly three parts, none empty, `.` or `..`;
 * - no space, backslash or control character anywhere;
 * - the host a host name: dot-separated labels of letters, digits and `-`,
 *   so it has no `:` and no port;
 * - the owner and the name 1-200 characters each;
 * - the name not ending in `.git`, so a clone URL's name and the bare name
 *   are never two grants. Pass the name without it.
 *
 * No root can pass: a root starts with `/` (an empty first part), or with a
 * drive letter and `:`, which no host holds.
 *
 * @example
 * ```ts
 * parseTrustRepo('GitHub.com/Acme/API') // 'github.com/acme/api'
 * parseTrustRepo('/srv/acme/api') // throws TypeError
 * ```
 * @experimental
 */
export function parseTrustRepo(input: string): string {
  const key = typeof input === 'string' ? input.trim().toLowerCase() : ''
  const problem = typeof input === 'string' ? repoProblem(key) : 'it is not a string'
  if (problem !== null) {
    throw new TypeError(
      `trust repository must be host/owner/name, such as github.com/acme/api; ${problem}: ${JSON.stringify(input)}`,
    )
  }
  return key
}

/** Whether a stored key is a repository key. A root never is. */
function isRepoKey(key: string): boolean {
  return repoProblem(key) === null && key === key.toLowerCase()
}

/** The kind of a stored key. */
function kindOf(key: string): TrustKeyKind {
  return isRepoKey(key) ? 'repo' : 'path'
}

/**
 * The string a grant is stored under: a root resolved by
 * {@link resolveTrustRoot}, or a repository key read by {@link parseTrustRepo}.
 */
async function resolveKey(key: TrustKey): Promise<string> {
  return typeof key === 'string' ? resolveTrustRoot(key) : parseTrustRepo(key.repo)
}

/** {@link TrustStore.resolveRoot}: the resolved key, in the kind it was given. */
function resolveRoot(key: string): Promise<string>
function resolveRoot(key: TrustRepoKey): Promise<TrustRepoKey>
function resolveRoot(key: TrustKey): Promise<string | TrustRepoKey>
async function resolveRoot(key: TrustKey): Promise<string | TrustRepoKey> {
  return typeof key === 'string' ? resolveTrustRoot(key) : { repo: parseTrustRepo(key.repo) }
}

/** A name safe on every filesystem, from any string. */
function slug(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]/g, '-')
}

/** The first 16 hex characters of the SHA-256 of `text`. */
function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/** Owner read and write only: no other local user can read a marker. */
const MARKER_MODE = 0o600
/** Owner only: no other local user can list the trusted repositories. */
const DIR_MODE = 0o700
/** The suffix of the folder that holds a root's per-scope grants. */
const SCOPES_SUFFIX = '.scopes'

/** The marker filename for an already-resolved root. */
function markerName(resolved: string): string {
  const raw = basename(resolved)
  return `${slug(raw === '' ? 'root' : raw)}-${digest(resolved)}`
}

/** The file name of a per-scope grant, inside its root's `.scopes` folder. */
function scopeFileName(scope: string): string {
  return `${slug(scope)}-${digest(scope)}`
}

/** A marker's root and scope, or null when the text is not a grant. */
function parseMarker(text: string): { root: string; scope: string } | null {
  const [first = '', second = ''] = text.split('\n')
  // Only the line ending is stripped: a root is a real path, and one that
  // ends in whitespace must still match the marker name built from it. A
  // blank line is still no grant.
  const root = first.replace(/\r$/, '')
  if (root.trim() === '') return null
  const scope = second.trim()
  return { root, scope: scope === '' ? WHOLE_REPO_SCOPE : scope }
}

/** The text of a marker for `root` and `scope`. */
function markerText(root: string, scope: string): string {
  return scope === WHOLE_REPO_SCOPE ? `${root}\n` : `${root}\n${scope}\n`
}

/**
 * Options for opening a trust store: the tool name, where its state home is,
 * and the environment and home directory for tests.
 * @experimental
 */
export interface TrustStoreOptions {
  /**
   * The tool's standalone name: the directory segment under the state home.
   * For a tool under a family root, the family's root (`osdlc`), with the
   * tool itself as {@link app}.
   */
  tool: string
  /**
   * The tool's own directory under a family root `tool`:
   * `<state home>/<tool>/<app>/trusted/`. Its grants are its own: no other
   * app, and not the family root, sees them. Needs {@link vendorDirs}.
   */
  app?: string
  /**
   * Resolve the store through `@osdlc/tiered-dirs`:
   * `<state home>/<tool>[/<app>]/trusted/`, honouring the convention and the
   * `<PREFIX>_ROOT` and `<PREFIX>_STATE_DIR` overrides these name. The
   * convention is tiered-dirs' default, `native`, unless
   * `<PREFIX>_CONVENTION` or {@link dirs} says otherwise. Such a store reads
   * only its new place: grants in the old place are not carried over. The
   * new place is the old folder only on Linux, or macOS under `xdg`, with no
   * `app`, no `<PREFIX>_ROOT` or `<PREFIX>_STATE_DIR`, and an
   * `XDG_STATE_HOME` that is unset or absolute; anywhere else the store
   * starts empty.
   * Without it the store keeps its old place:
   * `$XDG_STATE_HOME/<tool>/trusted/`, or `~/.local/state/<tool>/trusted/`.
   */
  vendorDirs?: TrustVendorDirs
  /**
   * Build the directories per call instead, as `machineConfigFile` takes
   * them: a tool pins its convention here (with `conventionFromEnv: false`),
   * and a test injects a rooted one. The factory alone places the store, so
   * it closes over the environment and home it resolves from, and passing
   * {@link env} or {@link home} beside it throws a `TypeError`. Needs
   * {@link vendorDirs}.
   */
  dirs?: () => TieredDirs
  /**
   * The environment that places the store; defaults to `process.env`.
   * Injected for tests, or a tool's run environment. Not with {@link dirs}:
   * pass it to the factory instead.
   */
  env?: Record<string, string | undefined>
  /**
   * The home directory; defaults to {@link homeDir}. Injected for tests. Not
   * with {@link dirs}: pass it to the factory instead.
   */
  home?: string
  /**
   * Sets the store's directory directly and skips every other lookup. For a
   * tool with its own environment variable (for example
   * `TOOLY_TRUST_STATE`) that names the marker directory itself, not a state
   * home to add `tool` and `trusted` to.
   */
  dir?: string
}

/**
 * What {@link TrustStore.trust} reports about a grant.
 *
 * @experimental
 */
export interface TrustResult {
  /**
   * The key the grant is stored under: the resolved root, or for a
   * repository the key {@link parseTrustRepo} made of it.
   */
  root: string
  /** Whether {@link root} is a root (`path`) or a repository (`repo`). */
  kind: TrustKeyKind
  /** The scope granted: {@link WHOLE_REPO_SCOPE} or one tool. */
  scope: string
  /** The marker file's path. */
  marker: string
  /**
   * Whether this exact grant existed before the call. Trusting it again
   * leaves the marker as it was, so a caller can tell the person that nothing
   * changed. A whole-repository grant does not make a scope's grant exist.
   */
  alreadyTrusted: boolean
}

/**
 * One grant in a store: its key, the kind of key, the scope it covers and
 * its marker file.
 *
 * @experimental
 */
export interface TrustGrant {
  /** The resolved root, or the repository key (`host/owner/name`). */
  root: string
  /** Whether {@link root} is a root (`path`) or a repository (`repo`). */
  kind: TrustKeyKind
  scope: string
  marker: string
}

/**
 * A store of the grants a person has given to run a repository's commands,
 * kept as marker files under the state home.
 *
 * Each method takes a {@link TrustKey}: a root (a path, resolved through
 * symlinks first) or `{ repo: 'host/owner/name' }`, read by
 * {@link parseTrustRepo}, which throws a `TypeError` for a bad key. The two
 * kinds never share a grant: a folder named like a repository is still a
 * path. Scopes work the same for both.
 *
 * Every `scope` defaults to {@link WHOLE_REPO_SCOPE}. A scope is trimmed
 * first, so `'just '` is `'just'`. A scope that is then empty, longer than
 * 200 characters or holds a control character throws a `TypeError`.
 * @experimental
 */
export interface TrustStore {
  /** The `tool` this store was built for: the tool, or its family root when it has an `app`. */
  readonly tool: string
  /**
   * The store's directory, as {@link trustStoreDir} resolves it from the
   * options. Resolved on each call, so a store follows a change to `env`.
   */
  dir(): string
  /**
   * The key a grant is stored under, in the kind it was given: a root
   * becomes the absolute, symlink-resolved root, and `{ repo }` becomes
   * `{ repo }` with the lower-cased key. Either can be passed back to every
   * other method. A repository stays an object because a plain string is
   * always read as a path.
   */
  resolveRoot(key: string): Promise<string>
  resolveRoot(key: TrustRepoKey): Promise<TrustRepoKey>
  resolveRoot(key: TrustKey): Promise<string | TrustRepoKey>
  /**
   * The marker file's path for `key` and `scope`, without creating it. For a
   * `--show` command that reports where a grant would be stored, trusted or
   * not.
   */
  markerPath(key: TrustKey, scope?: string): Promise<string>
  /**
   * Whether `scope` is trusted for `key`: it has a whole-repository grant or
   * a grant for `scope`. An empty or blank marker is not a grant.
   * {@link list} and {@link listGrants} skip such markers too, so they agree.
   */
  isTrusted(key: TrustKey, scope?: string): Promise<boolean>
  /**
   * Record a grant. With no `scope`, the grant covers the whole repository.
   * An explicit `'*'` throws a `TypeError`: a typed scope must never widen
   * into a whole-repository grant (see {@link parseTrustScope}). See
   * {@link TrustResult.alreadyTrusted}.
   */
  trust(key: TrustKey, scope?: string): Promise<TrustResult>
  /**
   * Remove one grant, exactly the one `scope` names. `false` when it did not
   * exist. Removing the whole-repository grant leaves per-scope grants.
   */
  untrust(key: TrustKey, scope?: string): Promise<boolean>
  /**
   * Remove every grant for `key`: its marker and its whole folder of
   * per-scope markers. Returns the scopes {@link listGrants} listed for it,
   * sorted.
   */
  untrustAll(key: TrustKey): Promise<string[]>
  /**
   * Every key with a whole-repository grant: roots first, then repositories,
   * each sorted. A repository key never starts with `/` or a drive letter, so
   * the two read apart. Throws only when {@link dir} does.
   */
  list(): Promise<string[]>
  /**
   * Every grant, whole-repository and per-scope, with its `kind`: roots
   * first, then repositories, each sorted by key and then scope, with `*`
   * first. Throws only when {@link dir} does.
   */
  listGrants(): Promise<TrustGrant[]>
  /**
   * Set the store directory to 0700 and every marker to 0600 where they are
   * looser. Returns the paths it changed. {@link trust} calls it. Changes
   * nothing on Windows, where these modes do not apply. Throws only when
   * {@link dir} does, on every platform.
   */
  tighten(): Promise<string[]>
}

/** Change `path` to `mode` when its permission bits are looser. True when it changed. */
async function tightenOne(path: string, mode: number): Promise<boolean> {
  try {
    const bits = (await stat(path)).mode & 0o777
    if ((bits & ~mode) === 0) return false
    await chmod(path, mode)
    return true
  } catch {
    return false
  }
}

/** Directory entries, or `[]` when the directory cannot be read. */
async function entries(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

/**
 * Build a trust store scoped to one tool. Two stores for two different
 * `tool` names, or two `app`s under one `tool`, never share a directory and
 * so never see each other's grants, even when `env`/`home` are the same.
 * @experimental
 */
export function trustStore(opts: TrustStoreOptions): TrustStore {
  const { tool } = opts
  checkOptions(opts)

  const dir = (): string => locateStore(opts)
  const scopesDir = (resolved: string): string =>
    join(dir(), `${markerName(resolved)}${SCOPES_SUFFIX}`)
  /** `scope` must already be normalized. */
  const markerPath = (resolved: string, scope: string): string => {
    return scope === WHOLE_REPO_SCOPE
      ? join(dir(), markerName(resolved))
      : join(scopesDir(resolved), scopeFileName(scope))
  }

  const readGrant = async (path: string): Promise<{ root: string; scope: string } | null> => {
    try {
      return parseMarker(await readFile(path, 'utf-8'))
    } catch {
      return null
    }
  }
  const hasGrant = async (resolved: string, scope: string): Promise<boolean> =>
    (await readGrant(markerPath(resolved, scope))) !== null

  const tighten = async (): Promise<string[]> => {
    // Resolve first, so a store that cannot be placed throws on Windows too.
    const d = dir()
    if (process.platform === 'win32') return []
    const changed: string[] = []
    const fix = async (path: string, mode: number): Promise<void> => {
      if (await tightenOne(path, mode)) changed.push(path)
    }
    await fix(d, DIR_MODE)
    for (const name of await entries(d)) {
      const path = join(d, name)
      if (name.endsWith(SCOPES_SUFFIX)) {
        await fix(path, DIR_MODE)
        for (const inner of await entries(path)) await fix(join(path, inner), MARKER_MODE)
      } else {
        await fix(path, MARKER_MODE)
      }
    }
    return changed
  }

  const removeGrant = async (resolved: string, scope: string): Promise<boolean> => {
    if (!(await hasGrant(resolved, scope))) return false
    await rm(markerPath(resolved, scope), { force: true })
    if (scope !== WHOLE_REPO_SCOPE) {
      // Drop the root's scope folder once its last grant is gone.
      await rmdir(scopesDir(resolved)).catch(() => {})
    }
    return true
  }

  const listGrants = async (): Promise<TrustGrant[]> => {
    const d = dir()
    const grants: TrustGrant[] = []
    for (const name of await entries(d)) {
      // A temp file left by a killed process is not a grant.
      if (name.endsWith('.tmp')) continue
      const path = join(d, name)
      if (name.endsWith(SCOPES_SUFFIX)) {
        for (const inner of await entries(path)) {
          if (inner.endsWith('.tmp')) continue
          const grant = await readGrant(join(path, inner))
          // A per-scope marker must name its scope, and its file name must be
          // the one that scope maps to. A marker written for `'just '`
          // without trimming reads as `just` but sits under another name, so
          // `isTrusted` never finds it; it is not listed either. Its folder
          // must be its root's, too: a marker for one root filed in another
          // root's folder is never what `isTrusted` reads.
          if (
            grant !== null &&
            grant.scope !== WHOLE_REPO_SCOPE &&
            inner === scopeFileName(grant.scope) &&
            name === `${markerName(grant.root)}${SCOPES_SUFFIX}`
          ) {
            grants.push({ ...grant, kind: kindOf(grant.root), marker: join(path, inner) })
          }
        }
        continue
      }
      const grant = await readGrant(path)
      // Likewise a whole-repository marker must sit under its root's marker
      // name. A stray or renamed file (`old-repo`, an editor's `repo~`) is
      // never what `isTrusted` reads, nor what `untrustAll` removes.
      if (grant !== null && name === markerName(grant.root)) {
        grants.push({
          root: grant.root,
          kind: kindOf(grant.root),
          scope: WHOLE_REPO_SCOPE,
          marker: path,
        })
      }
    }
    // Roots before repositories, then code-unit order, as `Array.prototype.sort`
    // uses, with `*` first within a key.
    const key = (g: TrustGrant): string =>
      `${g.kind === 'repo' ? 1 : 0}\0${g.root}\0${g.scope === WHOLE_REPO_SCOPE ? '' : g.scope}`
    return grants.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
  }

  return {
    tool,
    dir,
    resolveRoot,

    async markerPath(key, scope = WHOLE_REPO_SCOPE) {
      const normalized = normalizeScope(scope)
      return markerPath(await resolveKey(key), normalized)
    },

    async isTrusted(key, given = WHOLE_REPO_SCOPE) {
      const scope = normalizeScope(given)
      const resolved = await resolveKey(key)
      if (await hasGrant(resolved, WHOLE_REPO_SCOPE)) return true
      return scope !== WHOLE_REPO_SCOPE && hasGrant(resolved, scope)
    },

    // The check and the write are separate steps, not one atomic step.
    // Overlapping calls for one grant can each report `alreadyTrusted: false`.
    // The store still ends with one marker. Only a caller that counts new
    // grants needs to care.
    async trust(key, given) {
      const scope = given === undefined ? WHOLE_REPO_SCOPE : parseTrustScope(given)
      const resolved = await resolveKey(key)
      const marker = markerPath(resolved, scope)
      const alreadyTrusted = await hasGrant(resolved, scope)
      if (!alreadyTrusted) {
        await mkdir(dir(), { recursive: true, mode: DIR_MODE })
        if (scope !== WHOLE_REPO_SCOPE)
          await mkdir(scopesDir(resolved), { mode: DIR_MODE }).catch(() => {})
        // A marker that exists is a grant, so it must never be observable half-written.
        // On Windows a rename onto a marker another call is writing can fail
        // with EPERM. The other call wrote the same grant, so that is success.
        await atomicWriteAsync(marker, markerText(resolved, scope), { mode: MARKER_MODE }).catch(
          async (error: unknown) => {
            if (!(await hasGrant(resolved, scope))) throw error
          },
        )
      }
      await tighten()
      return { root: resolved, kind: kindOf(resolved), scope, marker, alreadyTrusted }
    },

    async untrust(key, scope = WHOLE_REPO_SCOPE) {
      const normalized = normalizeScope(scope)
      return removeGrant(await resolveKey(key), normalized)
    },

    // Removes by path, not by scope name: the root's marker and its whole
    // `.scopes` folder. A marker whose name no scope maps to (one written
    // for `'just '` without trimming) goes too.
    async untrustAll(key) {
      const resolved = await resolveKey(key)
      const removed = (await listGrants()).filter((g) => g.root === resolved).map((g) => g.scope)
      await rm(join(dir(), markerName(resolved)), { force: true })
      await rm(scopesDir(resolved), { recursive: true, force: true })
      return removed
    },

    // A missing store directory is an empty list, not an error. A machine
    // where nothing has been trusted yet is normal.
    async list() {
      return (await listGrants()).filter((g) => g.scope === WHOLE_REPO_SCOPE).map((g) => g.root)
    },

    listGrants,
    tighten,
  }
}
