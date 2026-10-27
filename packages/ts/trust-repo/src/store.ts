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
 * `$XDG_STATE_HOME/<tool>/trusted/`, or `~/.local/state/<tool>/trusted/`
 * when the variable is unset. This is the XDG state directory, not the
 * config directory. Trust is state a program keeps, not configuration a
 * person edits, so it is not stored next to a tool's `config.yaml`. People
 * sync config files between machines, for example in a dotfiles repo. A
 * consent record for one machine that is copied to another is no longer
 * consent.
 *
 * XDG paths are used on every platform, macOS included, as in
 * `@osdlc/config-layers`. A leading `~` in the variable is expanded, because
 * direnv, `.env` loaders and CI YAML pass a literal `~` through.
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

import { createHash } from 'node:crypto'
import { chmod, mkdir, readdir, readFile, rm, rmdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { atomicWriteAsync } from '@osdlc/etag-write'

import { homeDir } from './home.ts'
import { resolveTrustRoot } from './paths.ts'
import { xdgHome } from './xdg.ts'

/**
 * Directory under `$XDG_STATE_HOME/<tool>/` holding the marker files.
 *
 * @experimental
 */
export const TRUST_MARKER_DIR = 'trusted'

/**
 * Where a tool's store lives. Pure. `env` and `home` are parameters because
 * a test that read the real environment would read the developer's own
 * trust store, and a test that wrote would grant trust on their machine.
 * @experimental
 */
export function trustStoreDir(
  tool: string,
  env: Record<string, string | undefined> = process.env,
  home: string = homeDir(),
): string {
  const stateHome = xdgHome(env, home, 'XDG_STATE_HOME', '.local', 'state')
  return join(stateHome, tool, TRUST_MARKER_DIR)
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
 * Options for opening a trust store: the tool name, and the environment and home directory for tests.
 * @experimental
 */
export interface TrustStoreOptions {
  /** The tool's standalone name: the directory segment under the state home. */
  tool: string
  /** Injected for tests; defaults to `process.env`. */
  env?: Record<string, string | undefined>
  /** Injected for tests; defaults to {@link homeDir}. */
  home?: string
  /**
   * Sets the store's directory directly and skips the `tool` and XDG lookup.
   * For a tool with its own environment variable (for example
   * `TOOLY_TRUST_STATE`) that names the marker directory itself, not an
   * `XDG_STATE_HOME` to add `tool` and `trusted` to.
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
 * @experimental
 */
export interface TrustStore {
  /** The tool name this store was built for. */
  readonly tool: string
  /** `$XDG_STATE_HOME/<tool>/trusted/`, or its home-relative fallback. */
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
  /** Every root with a whole-repository grant, sorted. Never throws. */
  list(): Promise<string[]>
  /**
   * Every grant, whole-repository and per-scope, sorted by root and then
   * scope, with `*` first. Never throws.
   */
  listGrants(): Promise<TrustGrant[]>
  /**
   * Set the store directory to 0700 and every marker to 0600 where they are
   * looser. Returns the paths it changed. {@link trust} calls it. A no-op on
   * Windows, where these modes do not apply. Never throws.
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
 * `tool` names never share a directory and so never see each other's
 * grants, even when `env`/`home` are the same.
 * @experimental
 */
export function trustStore(opts: TrustStoreOptions): TrustStore {
  const { tool } = opts
  const env = opts.env ?? process.env
  const home = opts.home ?? homeDir()
  const override = opts.dir

  const dir = (): string => override ?? trustStoreDir(tool, env, home)
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
          // `isTrusted` never finds it; it is not listed either.
          if (
            grant !== null &&
            grant.scope !== WHOLE_REPO_SCOPE &&
            inner === scopeFileName(grant.scope)
          ) {
            grants.push({ ...grant, marker: join(path, inner) })
          }
        }
        continue
      }
      const grant = await readGrant(path)
      // Likewise a whole-repository marker must sit under its root's marker
      // name. A stray or renamed file (`old-repo`, an editor's `repo~`) is
      // never what `isTrusted` reads, nor what `untrustAll` removes.
      if (grant !== null && name === markerName(grant.root)) {
        grants.push({ root: grant.root, scope: WHOLE_REPO_SCOPE, marker: path })
      }
    }
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
      const resolved = await resolveTrustRoot(root)
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
      return { root: resolved, scope, marker, alreadyTrusted }
    },

    async untrust(root, scope = WHOLE_REPO_SCOPE) {
      const normalized = normalizeScope(scope)
      return removeGrant(await resolveTrustRoot(root), normalized)
    },

    // Removes by path, not by scope name: the root's marker and its whole
    // `.scopes` folder. A marker whose name no scope maps to (one written
    // for `'just '` without trimming) goes too.
    async untrustAll(root) {
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
