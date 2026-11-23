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
 * of those vendor dirs move it. A tool under a family root passes the family
 * as `tool` and itself as `app`, so its markers stay its own. Consent given
 * to one tool must never cover another.
 *
 * A tool that passes neither `vendorDirs` nor `dir` keeps the place every
 * release before this one used: `$XDG_STATE_HOME/<tool>/trusted/`, or
 * `~/.local/state/<tool>/trusted/` when the variable is unset, on every
 * platform. No tool moves until it opts in.
 *
 * ## How a store moves
 *
 * When `vendorDirs` puts the store somewhere other than that old place, the
 * old markers are copied once, on first use, and only into a place that does
 * not exist yet. They are copied into a private staging folder, read back
 * and checked there, the folder gets a `.moved` record inside, and it is
 * renamed into place. The rename is the one step that publishes the copy, so
 * the new store is either complete or not there at all. Two processes that
 * move at once each build their own copy, and the second rename fails
 * because the first already landed. A new store that `trust` makes is
 * published the same way, so this package never leaves a store folder
 * without its record.
 *
 * Then a `.trusted.moved` record is written beside the store. That record,
 * or the one inside, means the store has had its one chance to move, and
 * only the new place is read from then on: a grant revoked there stays
 * revoked. Every way the move can end writes it: copied, the old place
 * unsafe, or the new place already there. When the old store has no grant,
 * or the move does not run, the first grant writes it. Because it sits
 * beside the store, deleting the store folder forgets every grant and does
 * not start the move again; so does `untrustAll` for one repository. The old
 * markers are never changed or deleted, so an older release still finds
 * them.
 *
 * When the new place already exists without a record (made through `dir`,
 * by hand, or left by a crash), nothing is copied into it: the record is
 * written and the person consents again. Copying into a live folder could
 * bring back a grant revoked there.
 *
 * The move trusts the environment of the first run that makes it, since
 * `XDG_STATE_HOME` places the old store. So the old folder is copied only
 * when it is a real directory, not a symlink, and on POSIX owned by this
 * user and writable by no one else. Otherwise nothing is copied, the record
 * is written, and the person consents again.
 *
 * A failed move throws from {@link TrustStore.isTrusted} and the methods that
 * write, so nothing runs on a store that lost a grant. The next use tries
 * again.
 *
 * The move runs only when none of `<PREFIX>_ROOT`, `<PREFIX>_STATE_DIR` and
 * `<PREFIX>_CONVENTION` is set (non-empty), the store is not under
 * tiered-dirs' per-process test root, and its place differs from the old
 * place. While any of those variables is set, the store gets no old markers,
 * whatever folder it lands in, and its first grant writes the record, so it
 * never gets them later either. The person consents again there, which fails
 * closed. The unmoved place moves once, the first time the tool runs with
 * none of them set.
 *
 * The rule does not try to tell whether a variable really moved the store.
 * That would mean looking inside a `dirs` factory, and a wrong guess fills
 * two places from one untouched old store, so a grant revoked in one comes
 * back in the other. A scratch store that inherited the person's real
 * consent would also defeat a test that points `<PREFIX>_ROOT` at a temp
 * directory. A tool should fix its convention in its `dirs` factory, with
 * `conventionFromEnv: false`, before it opts in, so that no person needs
 * `<PREFIX>_CONVENTION`. A `dirs` factory given with neither `env` nor
 * `home` has no old place, since it was not resolved from the real
 * environment.
 *
 * ## What a trust decision is keyed on
 *
 * A root and a scope. The root is the absolute, symlink-resolved repository
 * root. The scope says what the grant covers: {@link WHOLE_REPO_SCOPE} (`*`)
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
 * `${basename(root)}-${sha256(root).slice(0, 16)}`. The hash tells apart
 * repositories with the same name. The basename keeps an `ls` of the store
 * readable. The file contains the resolved absolute path and a newline. mise
 * uses a symlink to the path instead, which breaks once the repository is
 * deleted. A plain file keeps {@link TrustStore.list} exact and readable by
 * eye. The write is atomic, so a partial write is never read as a grant.
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

import { createHash, randomBytes } from 'node:crypto'
import {
  access,
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { atomicWriteAsync } from '@osdlc/etag-write'
import { nodeGuard } from '@osdlc/path-guard/node'
import {
  homeDir as tieredHomeDir,
  systemBaseDirs,
  testRoot,
  TieredDirs,
  type EnvVars,
  type ResolveOptions,
} from '@osdlc/tiered-dirs'

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

/** The old place: `$XDG_STATE_HOME/<name>/trusted/`, else `~/.local/state/<name>/trusted/`. */
function legacyStoreDir(
  name: string,
  env: Record<string, string | undefined>,
  home: string,
): string {
  return join(xdgHome(env, home, 'XDG_STATE_HOME', '.local', 'state'), name, TRUST_MARKER_DIR)
}

/** Where a store's markers are, and the old place to move them from, if any. */
interface StoreLocation {
  dir: string
  legacy: string | null
  /**
   * Whether the store resolves through `vendorDirs`. Such a store writes
   * its move record with its first grant, so a store this package wrote is
   * never filled from the old place later.
   */
  recorded: boolean
}

/**
 * `path` absolute and with its symlinks resolved, as far as it exists, so
 * `/var/...` and `/private/var/...` on macOS compare equal.
 */
function realish(path: string): string {
  return nodeGuard.realPath(resolve(path))
}

/** Whether `child` is `parent` or inside it, after both are resolved through symlinks. */
function isWithin(child: string, parent: string): boolean {
  const rel = relative(realish(parent), realish(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** A store's directory and the old place to move from. See "How a store moves" above. */
function locateStore(opts: TrustStoreOptions): StoreLocation {
  if (opts.dir !== undefined) return { dir: opts.dir, legacy: null, recorded: false }
  const env = opts.env ?? process.env
  if (opts.vendorDirs === undefined) {
    if (opts.dirs !== undefined || opts.app !== undefined) {
      throw new TypeError(
        `trust store: ${opts.dirs !== undefined ? 'dirs' : 'app'} needs vendorDirs; without it the store keeps its old place, which has no app directory`,
      )
    }
    return {
      dir: legacyStoreDir(opts.tool, env, opts.home ?? homeDir()),
      legacy: null,
      recorded: false,
    }
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
  const dir = join((opts.app !== undefined ? state.app(opts.app) : state).path, TRUST_MARKER_DIR)
  // A store moved on purpose is not filled from the old place: see "How a
  // store moves".
  const none = { dir, legacy: null, recorded: true }
  const scratch = testRoot()
  if (scratch !== undefined && isWithin(dir, scratch)) return none
  if (placedByEnv(env, opts.vendorDirs.envVars)) return none
  const legacy =
    opts.legacyDir !== undefined ? opts.legacyDir : legacyFor(opts.app ?? opts.tool, opts)
  if (legacy === null || realish(legacy) === realish(dir)) return none
  return { dir, legacy, recorded: true }
}

/**
 * Whether any variable that can place the store is set: `<PREFIX>_ROOT`,
 * `<PREFIX>_STATE_DIR` or `<PREFIX>_CONVENTION`, non-empty. Then the store
 * gets no old markers, whatever folder it lands in. Working out whether the
 * variable really moved the store would mean looking inside a `dirs`
 * factory, and a wrong guess fills two places from one old store, so a grant
 * revoked in one comes back in the other. A wrong "yes" here costs one
 * consent asked again.
 */
function placedByEnv(env: Record<string, string | undefined>, vars: EnvVars): boolean {
  return [vars.root, vars.dirs.state, vars.convention].some((name) => Boolean(env[name]))
}

/**
 * The old place for `name`, with the home the new place was resolved with:
 * `opts.home`, else the injected environment's `HOME` (`USERPROFILE` on
 * Windows), else the user's. Reading the real home for an injected
 * environment would copy the developer's real store into a test's tree.
 * Null when that environment names no home, and for a `dirs` factory given
 * with neither `env` nor `home`: such a tree (a rooted one in a test) was
 * not resolved from the real environment, so the real home's store is not
 * its old place.
 */
function legacyFor(name: string, opts: TrustStoreOptions): string | null {
  const env = opts.env ?? process.env
  if (opts.home !== undefined) return legacyStoreDir(name, env, opts.home)
  if (opts.dirs !== undefined && opts.env === undefined) return null
  if (opts.env === undefined) return legacyStoreDir(name, env, homeDir())
  try {
    return legacyStoreDir(name, env, tieredHomeDir({ env }))
  } catch {
    return null
  }
}

/**
 * Where a tool's store lives. Pure: it reads nothing on disk and moves
 * nothing. `env` and `home` are parameters because a test that read the real
 * environment would read the developer's own trust store, and a test that
 * wrote would grant trust on their machine.
 *
 * Given a tool name, the old place: `$XDG_STATE_HOME/<tool>/trusted/`, or
 * `~/.local/state/<tool>/trusted/` when the variable is unset. Given
 * {@link TrustStoreOptions}, the directory {@link trustStore} uses for them:
 * `dir` when set, else `<state home>/<tool>[/<app>]/trusted/` through
 * `@osdlc/tiered-dirs` when `vendorDirs` is set, else the old place.
 *
 * Throws a `TypeError` for `app` or `dirs` without `vendorDirs`, and
 * tiered-dirs' `TieredDirsError` when the state home cannot be resolved,
 * such as for a relative `<PREFIX>_ROOT` or a `tool` or `app` that is not
 * one path segment.
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
  if (typeof tool !== 'string') return locateStore(tool).dir
  return legacyStoreDir(tool, env, home ?? homeDir())
}

/**
 * The scope of a grant that covers the whole repository: every tool in it.
 * A store written before scopes existed holds only grants of this scope.
 *
 * @experimental
 */
export const WHOLE_REPO_SCOPE = '*'

/**
 * `scope` with leading and trailing whitespace removed, so `'just '` and
 * `'just'` name one grant. Throws a `TypeError` unless the result can name a
 * grant: 1-200 characters with no control characters. An empty or
 * whitespace-only scope throws.
 */
function normalizeScope(scope: string): string {
  const control = (c: string): boolean => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f
  const trimmed = typeof scope === 'string' ? scope.trim() : scope
  if (
    typeof trimmed !== 'string' ||
    trimmed === '' ||
    trimmed.length > 200 ||
    [...trimmed].some(control)
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
  const root = first.trim()
  if (root === '') return null
  return { root, scope: second.trim() === '' ? WHOLE_REPO_SCOPE : second.trim() }
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
   * `<PREFIX>_CONVENTION` or {@link dirs} says otherwise. Without it the
   * store keeps its old place: `$XDG_STATE_HOME/<tool>/trusted/`, or
   * `~/.local/state/<tool>/trusted/`.
   */
  vendorDirs?: TrustVendorDirs
  /**
   * Build the directories per call instead, as `machineConfigFile` takes
   * them: a tool pins its convention here (with `conventionFromEnv: false`),
   * and a test injects a rooted one. Needs {@link vendorDirs}, whose override
   * variables, when set in `env`, turn the move off (see {@link legacyDir}).
   * The factory itself is never looked into. Pass
   * the `env` and `home` the factory resolves with: without either, the
   * store has no old place.
   */
  dirs?: () => TieredDirs
  /**
   * With {@link vendorDirs}: the old store to copy markers from once, or
   * `null` for none. Defaults to the place a release before `vendorDirs`
   * used, named after `app` when set, else `tool`:
   * `$XDG_STATE_HOME/<app or tool>/trusted/`, or
   * `~/.local/state/<app or tool>/trusted/`, where `~` is `home`, else the
   * `HOME` of an injected `env`. Nothing is copied when it is the new place,
   * while `<PREFIX>_ROOT`, `<PREFIX>_STATE_DIR` or `<PREFIX>_CONVENTION` is
   * set in `env` (whatever folder the store lands in), under tiered-dirs'
   * test root, or for a {@link dirs} given with neither `env` nor `home`.
   */
  legacyDir?: string | null
  /** Injected for tests; defaults to `process.env`. */
  env?: Record<string, string | undefined>
  /** Injected for tests; defaults to {@link homeDir}. */
  home?: string
  /**
   * Sets the store's directory directly and skips every other lookup. Nothing
   * is moved into it. For a tool with its own environment variable (for
   * example `TOOLY_TRUST_STATE`) that names the marker directory itself, not
   * a state home to add `tool` and `trusted` to.
   */
  dir?: string
}

/**
 * What {@link TrustStore.trust} reports about a grant.
 *
 * @experimental
 */
export interface TrustResult {
  /** The resolved root the grant is keyed on. */
  root: string
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
 * One grant in a store: a root, the scope it covers and its marker file.
 *
 * @experimental
 */
export interface TrustGrant {
  root: string
  scope: string
  marker: string
}

/**
 * A store of the grants a person has given to run a repository's commands,
 * kept as marker files under the state home. Every `scope` defaults to
 * {@link WHOLE_REPO_SCOPE}. A scope is trimmed first, so `'just '` is
 * `'just'`. A scope that is then empty, longer than 200 characters or holds a
 * control character throws a `TypeError`.
 *
 * Every method but {@link dir}, {@link resolveRoot} and {@link markerPath}
 * first moves an old store's markers in, once, when the store has one to move
 * (see {@link TrustStoreOptions.legacyDir}). A move that fails makes
 * {@link isTrusted}, {@link trust}, {@link untrust} and {@link untrustAll}
 * throw, and is tried again on the next call.
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
  /** The absolute, symlink-resolved key a root's grant is stored under. */
  resolveRoot(root: string): Promise<string>
  /**
   * The marker file's path for `root` and `scope`, without creating it. For a
   * `--show` command that reports where a grant would be stored, trusted or
   * not.
   */
  markerPath(root: string, scope?: string): Promise<string>
  /**
   * Whether `scope` is trusted in `root`: the root has a whole-repository
   * grant or a grant for `scope`. An empty or blank marker is not a grant.
   * {@link list} and {@link listGrants} skip such markers too, so they agree.
   */
  isTrusted(root: string, scope?: string): Promise<boolean>
  /**
   * Record a grant. With no `scope`, the grant covers the whole repository.
   * An explicit `'*'` throws a `TypeError`: a typed scope must never widen
   * into a whole-repository grant (see {@link parseTrustScope}). See
   * {@link TrustResult.alreadyTrusted}.
   */
  trust(root: string, scope?: string): Promise<TrustResult>
  /**
   * Remove one grant, exactly the one `scope` names. `false` when it did not
   * exist. Removing the whole-repository grant leaves per-scope grants.
   */
  untrust(root: string, scope?: string): Promise<boolean>
  /**
   * Remove every grant for `root`: its marker and its whole folder of
   * per-scope markers. Returns the scopes {@link listGrants} listed for it,
   * sorted.
   */
  untrustAll(root: string): Promise<string[]>
  /**
   * Every root with a whole-repository grant, sorted. Throws only when
   * {@link dir} does; a failed move lists what the new place holds.
   */
  list(): Promise<string[]>
  /**
   * Every grant, whole-repository and per-scope, sorted by root and then
   * scope, with `*` first. Throws only when {@link dir} does, as
   * {@link list}.
   */
  listGrants(): Promise<TrustGrant[]>
  /**
   * Set the store directory to 0700 and every marker to 0600 where they are
   * looser. Returns the paths it changed. {@link trust} calls it. A no-op on
   * Windows, where these modes do not apply. Throws only when {@link dir}
   * does, as {@link list}.
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

/** Whether anything is at `path`. */
async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  )
}

/** The marker file for `resolved` and an already-normalized `scope`, in the store at `dir`. */
function grantPath(dir: string, resolved: string, scope: string): string {
  return scope === WHOLE_REPO_SCOPE
    ? join(dir, markerName(resolved))
    : join(dir, `${markerName(resolved)}${SCOPES_SUFFIX}`, scopeFileName(scope))
}

/** The grant a marker file holds, or null when it holds none or cannot be read. */
async function readGrant(path: string): Promise<{ root: string; scope: string } | null> {
  try {
    return parseMarker(await readFile(path, 'utf-8'))
  } catch {
    return null
  }
}

/** Every grant in the store at `dir`, unsorted. A missing directory has none. */
async function grantsIn(dir: string): Promise<TrustGrant[]> {
  const grants: TrustGrant[] = []
  for (const name of await entries(dir)) {
    // A temp file left by a killed process is not a grant.
    if (name.endsWith('.tmp')) continue
    const path = join(dir, name)
    if (name.endsWith(SCOPES_SUFFIX)) {
      for (const inner of await entries(path)) {
        if (inner.endsWith('.tmp')) continue
        const grant = await readGrant(join(path, inner))
        // A per-scope marker must name its scope, and its file name must be
        // the one that scope maps to. A marker written for `'just '`
        // without trimming reads as `just` but sits under another name, so
        // `isTrusted` never finds it; it is not listed either.
        // Its folder must be its root's, too: a marker for one root filed
        // in another root's folder is never what `isTrusted` reads.
        if (
          grant !== null &&
          grant.scope !== WHOLE_REPO_SCOPE &&
          inner === scopeFileName(grant.scope) &&
          name === `${markerName(grant.root)}${SCOPES_SUFFIX}`
        ) {
          grants.push({ ...grant, marker: join(path, inner) })
        }
      }
      continue
    }
    const grant = await readGrant(path)
    // Likewise a whole-repository marker must sit under its root's marker
    // name. A stray or renamed file (`old-repo`, an editor's `repo~`, the
    // `.moved` record) is never what `isTrusted` reads, nor what
    // `untrustAll` removes.
    if (grant !== null && name === markerName(grant.root)) {
      grants.push({ root: grant.root, scope: WHOLE_REPO_SCOPE, marker: path })
    }
  }
  return grants
}

/**
 * The name of the record that a store has had its one chance to move. It
 * holds the old store's path, or an empty line when there was none. The
 * record that counts sits beside the store, as `.trusted.moved`, so deleting
 * the store folder does not start the move again. A store this package
 * publishes also holds one inside, which keeps the folder from ever being
 * empty: a rename onto it always fails. The inner name can never be a
 * marker's, which always ends in `-<16 hex digits>`.
 */
const MOVED_RECORD = '.moved'

/** The record beside the store at `dir`: `<parent>/.trusted.moved`. */
function recordBeside(dir: string): string {
  return join(dirname(dir), `.${basename(dir)}${MOVED_RECORD}`)
}

/** Whether the store at `dir` has had its chance to move: a record beside it or inside it. */
async function isRecorded(dir: string): Promise<boolean> {
  return (await exists(recordBeside(dir))) || exists(join(dir, MOVED_RECORD))
}

/** Write the record beside the store at `dir`, unless it is there. */
async function writeRecord(dir: string, from: string | null): Promise<void> {
  const record = recordBeside(dir)
  if (await exists(record)) return
  await mkdir(dirname(dir), { recursive: true, mode: DIR_MODE })
  // As for a marker, a Windows rename onto a record another call is writing
  // can fail; the record is there either way.
  await atomicWriteAsync(record, `${from ?? ''}\n`, { mode: MARKER_MODE }).catch(
    async (error: unknown) => {
      if (!(await exists(record))) throw error
    },
  )
}

/**
 * Whether the old store at `from` may be copied: a real directory, not a
 * symlink, and on POSIX owned by this user and writable by no one else. The
 * move trusts the environment of the first run that makes it, and
 * `XDG_STATE_HOME` can point the old place anywhere. A folder someone else
 * could have written is not a record of this person's consent.
 */
async function oldStoreState(from: string): Promise<'missing' | 'safe' | 'unsafe'> {
  let info
  try {
    info = await lstat(from)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'unsafe'
  }
  if (info.isSymbolicLink() || !info.isDirectory()) return 'unsafe'
  if (process.platform === 'win32') return 'safe'
  if (process.getuid !== undefined && info.uid !== process.getuid()) return 'unsafe'
  return (info.mode & 0o022) === 0 ? 'safe' : 'unsafe'
}

/**
 * Publish a new store at `to`: fill a private staging folder beside it, add
 * the inner record, and rename the folder into place. The rename is the one
 * step that makes the store visible, so it is complete or absent, and a
 * store this package made always holds its record. False when `to` already
 * existed, and the staged folder was dropped.
 */
async function publishStore(
  to: string,
  from: string | null,
  fill: (staging: string) => Promise<void>,
): Promise<boolean> {
  const parent = dirname(to)
  await mkdir(parent, { recursive: true, mode: DIR_MODE })
  const staging = join(parent, `.${basename(to)}.moving-${randomBytes(6).toString('hex')}`)
  try {
    await mkdir(staging, { mode: DIR_MODE })
    await fill(staging)
    await atomicWriteAsync(join(staging, MOVED_RECORD), `${from ?? ''}\n`, { mode: MARKER_MODE })
    try {
      await renameDir(staging, to)
      return true
    } catch (error) {
      // Another process's store landed first.
      if (await exists(to)) return false
      throw error
    }
  } finally {
    // A folder left behind is never read, so a failed cleanup must not hide
    // the error that got here.
    await rm(staging, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  }
}

/** Write every grant into the store at `dir`, unless it is there already. */
async function copyGrants(grants: readonly TrustGrant[], dir: string): Promise<void> {
  for (const { root, scope } of grants) {
    const target = grantPath(dir, root, scope)
    const found = await readGrant(target)
    if (found?.root === root && found.scope === scope) continue
    if (scope !== WHOLE_REPO_SCOPE) {
      await mkdir(dirname(target), { recursive: true, mode: DIR_MODE })
    }
    await atomicWriteAsync(target, markerText(root, scope), { mode: MARKER_MODE })
  }
}

/** Throw unless every grant reads back from the store at `dir` as it was written. */
async function checkGrants(
  grants: readonly TrustGrant[],
  dir: string,
  from: string,
): Promise<void> {
  for (const { root, scope } of grants) {
    const found = await readGrant(grantPath(dir, root, scope))
    if (found?.root !== root || found.scope !== scope) {
      throw new Error(
        `trust store move: the copy of ${root} (${scope}) from ${from} did not read back; ${from} is unchanged`,
      )
    }
  }
}

/**
 * Copy the grants in the old store `from` into the new store `to`, once. See
 * "How a store moves" in the module comment. The copy is only ever published
 * whole into a place that does not exist. When `to` already exists, or
 * `from` is not safe to read, nothing is copied and the record is written:
 * the person consents again. A no-op when `to` is recorded or `from` holds
 * no grant. `from` is only read.
 */
async function moveStore(from: string, to: string): Promise<void> {
  if (await isRecorded(to)) return
  if (await exists(to)) return writeRecord(to, from)
  const state = await oldStoreState(from)
  if (state === 'missing') return
  if (state === 'unsafe') return writeRecord(to, from)
  const grants = await grantsIn(from)
  if (grants.length === 0) return
  await publishStore(to, from, async (staging) => {
    await copyGrants(grants, staging)
    await checkGrants(grants, staging, from)
  })
  await writeRecord(to, from)
}

/** Errors a Windows rename gives while a scanner or indexer holds a file open. */
const BUSY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])

/**
 * Rename the staging folder `from` to `to`. On Windows a scanner holding a
 * file inside can make the rename fail for a moment, so it is tried a few
 * times. A rename onto a store that already exists fails the same way there,
 * so it stops as soon as `to` exists.
 */
async function renameDir(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? ''
      if (process.platform !== 'win32' || attempt >= 5 || !BUSY_CODES.has(code)) throw error
      if (await exists(to)) throw error
      await sleep(20 * attempt)
    }
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

  const dir = (): string => locateStore(opts).dir
  const scopesDir = (resolved: string): string =>
    join(dir(), `${markerName(resolved)}${SCOPES_SUFFIX}`)
  /** `scope` must already be normalized. */
  const markerPath = (resolved: string, scope: string): string => grantPath(dir(), resolved, scope)

  // One move per new place, kept for the life of the store. A failed one is
  // dropped so that the next call tries again.
  const moves = new Map<string, Promise<void>>()
  const moved = (): Promise<void> => {
    const { dir: to, legacy } = locateStore(opts)
    if (legacy === null) return Promise.resolve()
    let move = moves.get(to)
    if (move === undefined) {
      move = moveStore(legacy, to)
      moves.set(to, move)
      move.catch(() => moves.delete(to))
    }
    return move
  }
  /**
   * A `vendorDirs` store records its move with its first grant, whatever the
   * move did: copied, found nothing, or did not run because a variable or
   * the test root placed the store. A store this package wrote then never
   * gets the old markers later, and a grant revoked in it stays revoked. A
   * read creates nothing, except the record beside a store that already
   * exists or whose old place is not safe to read.
   */
  const recordStore = async (): Promise<void> => {
    const { dir: to, legacy, recorded } = locateStore(opts)
    if (recorded) await writeRecord(to, legacy)
  }
  /** For the methods that never throw for a failed move: they read what the new place holds. */
  const movedOrNot = async (): Promise<void> => {
    const move = moved()
    await move.catch(() => {})
  }

  /** Write the marker for `resolved` and an already-normalized `scope` into the store at `d`. */
  const writeMarker = async (d: string, resolved: string, scope: string): Promise<void> => {
    if (scope !== WHOLE_REPO_SCOPE) {
      await mkdir(join(d, `${markerName(resolved)}${SCOPES_SUFFIX}`), { mode: DIR_MODE }).catch(
        () => {},
      )
    }
    // A marker that exists is a grant, so it must never be observable half-written.
    await atomicWriteAsync(grantPath(d, resolved, scope), markerText(resolved, scope), {
      mode: MARKER_MODE,
    })
  }

  const hasGrant = async (resolved: string, scope: string): Promise<boolean> =>
    (await readGrant(markerPath(resolved, scope))) !== null

  const tighten = async (): Promise<string[]> => {
    await movedOrNot()
    if (process.platform === 'win32') return []
    const changed: string[] = []
    const fix = async (path: string, mode: number): Promise<void> => {
      if (await tightenOne(path, mode)) changed.push(path)
    }
    const d = dir()
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
    await movedOrNot()
    const grants = await grantsIn(dir())
    // Code-unit order, as `Array.prototype.sort` uses, with `*` first within a root.
    const key = (g: TrustGrant): string =>
      `${g.root}\0${g.scope === WHOLE_REPO_SCOPE ? '' : g.scope}`
    return grants.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
  }

  return {
    tool,
    dir,
    resolveRoot: resolveTrustRoot,

    async markerPath(root, scope = WHOLE_REPO_SCOPE) {
      const normalized = normalizeScope(scope)
      return markerPath(await resolveTrustRoot(root), normalized)
    },

    async isTrusted(root, given = WHOLE_REPO_SCOPE) {
      const scope = normalizeScope(given)
      await moved()
      const resolved = await resolveTrustRoot(root)
      if (await hasGrant(resolved, WHOLE_REPO_SCOPE)) return true
      return scope !== WHOLE_REPO_SCOPE && hasGrant(resolved, scope)
    },

    // The check and the write are separate steps, not one atomic step.
    // Overlapping calls for one grant can each report `alreadyTrusted: false`.
    // The store still ends with one marker. Only a caller that counts new
    // grants needs to care.
    async trust(root, given) {
      const scope = given === undefined ? WHOLE_REPO_SCOPE : parseTrustScope(given)
      await moved()
      const resolved = await resolveTrustRoot(root)
      const marker = markerPath(resolved, scope)
      const alreadyTrusted = await hasGrant(resolved, scope)
      if (!alreadyTrusted) {
        const { recorded, legacy } = locateStore(opts)
        // A new `vendorDirs` store is published as the move publishes one, so
        // this package never leaves a store folder without its record.
        const published =
          recorded &&
          !(await exists(dir())) &&
          (await publishStore(dir(), legacy, (staging) => writeMarker(staging, resolved, scope)))
        if (!published) {
          await mkdir(dir(), { recursive: true, mode: DIR_MODE })
          // On Windows a rename onto a marker another call is writing can fail
          // with EPERM. The other call wrote the same grant, so that is success.
          await writeMarker(dir(), resolved, scope).catch(async (error: unknown) => {
            if (!(await hasGrant(resolved, scope))) throw error
          })
        }
      }
      await recordStore()
      await tighten()
      return { root: resolved, scope, marker, alreadyTrusted }
    },

    async untrust(root, scope = WHOLE_REPO_SCOPE) {
      const normalized = normalizeScope(scope)
      await moved()
      return removeGrant(await resolveTrustRoot(root), normalized)
    },

    // Removes by path, not by scope name: the root's marker and its whole
    // `.scopes` folder. A marker whose name no scope maps to (one written
    // for `'just '` without trimming) goes too.
    async untrustAll(root) {
      await moved()
      const resolved = await resolveTrustRoot(root)
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
