/**
 * Per-repository consent to run a repository's own scripts.
 *
 * {@link trustStore} answers "has a person consented to running THIS
 * repository's scripts?" for any CLI tool, one store per tool name.
 *
 * Why it exists at all: some things a tool does to a repository it did not
 * write are code execution in disguise — running that repository's own
 * scripts, evaluating its build config, firing its hooks. A setting the
 * repository itself can write (its own config file, its own build config) cannot
 * be the thing that authorizes that, because a setting a repository can
 * write is a setting a repository can grant itself. So the tool asks a
 * person once, per repository, and remembers the answer here.
 *
 * ## Where the store lives
 *
 * `$XDG_STATE_HOME/<tool>/trusted/`, or `~/.local/state/<tool>/trusted/`
 * when the variable is unset — XDG **state**, not config: trust is state a
 * program maintains, not configuration a person hand-edits. It deliberately
 * does not sit beside a tool's `config.yaml`. A trust grant living in a file
 * people edit and sync between machines would travel with a dotfiles repo,
 * and a per-machine consent record that follows you onto a new machine has
 * stopped being consent.
 *
 * XDG is used on every platform, macOS included, matching the config
 * layer's paths (`@osdlc/config-layers`). A leading `~` in the environment variable is expanded the same way
 * too — direnv, `.env` loaders and CI YAML hand the literal tilde through.
 *
 * ## What a trust decision is keyed on
 *
 * The absolute, symlink-resolved repository root. Two paths that name one
 * repository — a symlinked checkout, a `/tmp` that is really `/private/tmp`
 * — are one decision, because a person answering the question answered it
 * about the repository, not about the spelling they used to reach it.
 *
 * The key is a PATH, not a hash of the repository's contents (mise does the
 * same). A repository trusted once that later pulls hostile changes stays
 * trusted; {@link TrustStore.untrust} is the only remedy. The alternative is
 * worse: content-hashing every config file in a monorepo would re-prompt on
 * ordinary edits, and a prompt that fires on every edit trains people to
 * approve without reading, which is weaker security than an honest weaker
 * rule.
 *
 * ## How it is stored
 *
 * A directory of marker files, one per trusted root, mirroring mise.
 * Creating and unlinking a file are atomic and independent, so two
 * processes trusting two different repositories at the same moment cannot
 * lose each other's write. A single JSON document would need
 * read-modify-write under a lock, and the failure mode of getting that
 * wrong is a trust record that silently vanishes. The cost is that the
 * store is a directory of opaque names rather than one readable file, which
 * is what {@link TrustStore.list} is for.
 *
 * A marker is named `${basename(root)}-${sha256(root).slice(0, 16)}`. The
 * hash disambiguates same-named repositories; the basename keeps an `ls` of
 * the store legible. Its CONTENTS are the resolved absolute path and a
 * newline. mise symlinks to the path instead, which becomes a dangling link
 * once the repository is deleted; a plain file keeps {@link TrustStore.list}
 * exact and keeps the store readable by eye. The write is atomic, so a
 * partial write can never be read as a trust grant.
 */

import { createHash } from 'node:crypto'
import { readdir, readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { atomicWriteAsync } from '@osdlc/etag-write'
import { nodeGuard } from '@osdlc/path-guard/node'

import { xdgHome } from './xdg.ts'

/**
 * Directory under `$XDG_STATE_HOME/<tool>/` holding the marker files.
 *
 * @experimental
 */
export const TRUST_MARKER_DIR = 'trusted'

/**
 * Where a tool's store lives. Pure — `env` and `home` are injectable
 * because a test that consulted the real environment would read the
 * developer's own trust store, and one that wrote would grant trust on
 * their machine.
 * @experimental
 */
export function trustStoreDir(
  tool: string,
  env: Record<string, string | undefined> = process.env,
  home: string = homedir(),
): string {
  const stateHome = xdgHome(env, home, 'XDG_STATE_HOME', '.local', 'state')
  return join(stateHome, tool, TRUST_MARKER_DIR)
}

/**
 * The absolute, symlink-resolved key for a root.
 *
 * A root that does not exist still has to resolve: `untrust` and a
 * `--show`-style listing must answer for a root that has since been
 * deleted, and refusing to resolve it would leave its marker unreachable.
 * `resolve()` alone is not enough there, because it expands no symlinks — a
 * deleted repository under a symlinked ANCESTOR (`/var` -> `/private/var`
 * on macOS, so every `$TMPDIR` path) would key on a different string than
 * the one {@link TrustStore.trust} hashed, and its marker would be
 * unreachable in exactly the case this fallback exists for. So resolve the
 * deepest ancestor that does exist and re-attach the missing tail.
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
  /** Injected for tests; defaults to `os.homedir()`. */
  home?: string
  /**
   * Overrides the store's directory outright, bypassing the `tool` + XDG
   * derivation entirely. For a consumer that mirrors a machine-config-style
   * env var pointing straight at the marker directory (for
   * example a `TOOLY_TRUST_STATE` variable, the same shape as the machine-config
   * override) rather than
   * at an `XDG_STATE_HOME` to join `tool` and `trusted` onto.
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
   * Whether the root was already trusted before this call. Idempotent:
   * trusting an already-trusted root leaves the marker as it was, so a
   * caller can tell a person nothing changed rather than implying they
   * just granted something.
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
   * The marker file's path for `root`, without creating it — for a `--show`
   * surface that reports where a grant WOULD live, trusted or not.
   */
  markerPath(root: string): Promise<string>
  /**
   * Whether a root has been trusted. An empty or blank marker is NOT a
   * grant, matching {@link list} — see the module docblock on why that
   * asymmetry matters.
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
  const home = opts.home ?? homedir()
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

    // Idempotency is read-then-write, not atomic: overlapping calls for one
    // root can each report `alreadyTrusted: false`. The store still ends
    // with exactly one marker, so a caller counting newly granted roots —
    // not one asking whether a root is trusted — is the only one that needs
    // to care.
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

    // A missing store directory is an empty list, not an error — nothing
    // has ever been trusted on this machine is a normal state, and the
    // first listing must not look like a failure.
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
        // A half-written marker left by a killed process is not a grant;
        // skip it rather than reporting a path nothing will ever match.
        if (name.endsWith('.tmp')) continue
        try {
          const text = await readFile(join(d, name), 'utf-8')
          const path = text.trim()
          if (path !== '') paths.push(path)
        } catch {
          // A marker that vanished between readdir and read is simply gone.
        }
      }
      return paths.sort()
    },
  }
}
