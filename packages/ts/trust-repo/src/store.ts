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
 * The absolute, symlink-resolved repository root. Two paths that lead to one
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
 * A marker is named `${basename(root)}-${sha256(root).slice(0, 16)}`. The
 * hash tells apart repositories with the same name. The basename keeps an
 * `ls` of the store readable. The file contains the resolved absolute path
 * and a newline. mise uses a symlink to the path instead, which breaks once
 * the repository is deleted. A plain file keeps {@link TrustStore.list}
 * exact and readable by eye. The write is atomic, so a partial write is
 * never read as a grant.
 */

import { createHash } from 'node:crypto'
import { readdir, readFile, rm } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import { atomicWriteAsync } from '@osdlc/etag-write'
import { nodeGuard } from '@osdlc/path-guard/node'

import { homeDir } from './home.ts'
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
 * The absolute, symlink-resolved key for a root.
 *
 * A root that does not exist must still resolve. `untrust` and a
 * `--show`-style listing must work for a root that has been deleted, or its
 * marker could never be reached. `resolve()` alone is not enough, because it
 * does not follow symlinks. A deleted repository under a symlinked ancestor
 * (`/var` -> `/private/var` on macOS, which covers every `$TMPDIR` path)
 * would then get a different key than the one {@link TrustStore.trust}
 * hashed. So this resolves the deepest ancestor that exists and appends the
 * missing rest of the path.
 * @experimental
 */
export async function resolveTrustRoot(root: string): Promise<string> {
  return nodeGuard.realPath(resolve(root))
}

/** The marker filename for an already-resolved root. */
function markerName(resolved: string): string {
  const digest = createHash('sha256').update(resolved).digest('hex').slice(0, 16)
  const raw = basename(resolved)
  const name = (raw === '' ? 'root' : raw).replace(/[^A-Za-z0-9._-]/g, '-')
  return `${name}-${digest}`
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
  /** The marker file's path. */
  marker: string
  /**
   * Whether the root was already trusted before this call. Trusting a
   * trusted root leaves the marker as it was, so a caller can tell the
   * person that nothing changed.
   */
  alreadyTrusted: boolean
}

/**
 * A store of the roots a person has trusted to run a tool's commands, kept as marker files under the state home.
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
   * The marker file's path for `root`, without creating it. For a `--show`
   * command that reports where a grant would be stored, trusted or not.
   */
  markerPath(root: string): Promise<string>
  /**
   * Whether a root has been trusted. An empty or blank marker is not a
   * grant. {@link list} skips such markers too, so the two always agree.
   */
  isTrusted(root: string): Promise<boolean>
  /** Record trust for a root. See {@link TrustResult.alreadyTrusted}. */
  trust(root: string): Promise<TrustResult>
  /** Remove a root's trust. `false` when it was not trusted to begin with. */
  untrust(root: string): Promise<boolean>
  /** Every trusted path for this tool, sorted. Never throws. */
  list(): Promise<string[]>
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
  const markerPath = (resolved: string): string => join(dir(), markerName(resolved))

  const isTrustedResolved = async (resolved: string): Promise<boolean> => {
    try {
      const text = await readFile(markerPath(resolved), 'utf-8')
      return text.trim() !== ''
    } catch {
      return false
    }
  }

  return {
    tool,
    dir,
    resolveRoot: resolveTrustRoot,

    async markerPath(root) {
      return markerPath(await resolveTrustRoot(root))
    },

    async isTrusted(root) {
      const resolved = await resolveTrustRoot(root)
      return isTrustedResolved(resolved)
    },

    // The check and the write are separate steps, not one atomic step.
    // Overlapping calls for one root can each report `alreadyTrusted: false`.
    // The store still ends with one marker. Only a caller that counts newly
    // granted roots needs to care.
    async trust(root) {
      const resolved = await resolveTrustRoot(root)
      const marker = markerPath(resolved)
      const alreadyTrusted = await isTrustedResolved(resolved)
      if (alreadyTrusted) return { root: resolved, marker, alreadyTrusted: true }

      // A marker that exists is a grant, so it must never be observable half-written.
      await atomicWriteAsync(marker, `${resolved}\n`)
      return { root: resolved, marker, alreadyTrusted: false }
    },

    async untrust(root) {
      const resolved = await resolveTrustRoot(root)
      const marker = markerPath(resolved)
      if (!(await isTrustedResolved(resolved))) return false
      await rm(marker, { force: true })
      return true
    },

    // A missing store directory is an empty list, not an error. A machine
    // where nothing has been trusted yet is normal.
    async list() {
      const d = dir()
      let names: string[]
      try {
        names = await readdir(d)
      } catch {
        return []
      }

      const paths: string[] = []
      for (const name of names) {
        // A temp file left by a killed process is not a grant.
        if (name.endsWith('.tmp')) continue
        try {
          const text = await readFile(join(d, name), 'utf-8')
          const path = text.trim()
          if (path !== '') paths.push(path)
        } catch {
          // The marker was deleted between readdir and read.
        }
      }
      return paths.sort()
    },
  }
}
