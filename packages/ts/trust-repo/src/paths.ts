/**
 * Path handling shared by the store and the policy: `~` expansion, the
 * platform-neutral key form of a path, and the expander for `paths` globs.
 *
 * A trust key and a `paths` glob are compared as strings, so both must be in
 * one form. On Windows that form uses `/` separators and a lower-case drive
 * letter: `C:\Work\app` and `c:/Work/app` are one repository. The rest of the
 * path keeps its case. `realpath` already gives an existing path the case it
 * has on disk.
 *
 * The pure functions take `platform` as a parameter, so the Windows rules are
 * tested on every platform.
 */

import { posix, win32 } from 'node:path'

import { nodeGuard } from '@osdlc/path-guard/node'

/**
 * The platform whose path rules a function applies. Only `win32` differs.
 *
 * @experimental
 */
export type TrustPlatform = NodeJS.Platform

/** `node:path` for `platform`. */
function pathFor(platform: TrustPlatform): typeof posix {
  return platform === 'win32' ? win32 : posix
}

/**
 * Expand a leading `~` against `home`. On Windows `~\` expands too. Any other
 * path is returned unchanged.
 * @experimental
 */
export function expandTilde(
  path: string,
  home: string,
  platform: TrustPlatform = process.platform,
): string {
  if (path === '~') return home
  if (path.startsWith('~/') || (platform === 'win32' && path.startsWith('~\\'))) {
    return pathFor(platform).join(home, path.slice(2))
  }
  return path
}

/**
 * The form a trust key and a `paths` glob are compared in. On Windows `\`
 * becomes `/` and the drive letter becomes lower case. On every other
 * platform the path is returned unchanged.
 * @experimental
 */
export function normalizeTrustPath(
  path: string,
  platform: TrustPlatform = process.platform,
): string {
  if (platform !== 'win32') return path
  const slashed = path.replace(/\\/g, '/')
  return /^[A-Za-z]:/.test(slashed) ? slashed[0]!.toLowerCase() + slashed.slice(1) : slashed
}

/**
 * The absolute, symlink-resolved key for a root, in {@link normalizeTrustPath}
 * form.
 *
 * A root that does not exist must still resolve. `untrust` and a
 * `--show`-style listing must work for a root that has been deleted, or its
 * marker could never be reached. `resolve()` alone is not enough, because it
 * does not follow symlinks. A deleted repository under a symlinked ancestor
 * (`/var` -> `/private/var` on macOS, which covers every `$TMPDIR` path)
 * would then get a different key than the one the store hashed. So this
 * resolves the deepest ancestor that exists and appends the missing rest of
 * the path.
 * @experimental
 */
export async function resolveTrustRoot(root: string): Promise<string> {
  return normalizeTrustPath(nodeGuard.realPath(pathFor(process.platform).resolve(root)))
}

/**
 * Options for {@link expandTrustPath}.
 *
 * @experimental
 */
export interface ExpandTrustPathOptions {
  /** Whose path rules apply. Defaults to `process.platform`. */
  platform?: TrustPlatform
  /**
   * Resolves the pattern's static prefix. Defaults to {@link resolveTrustRoot}.
   * A test passes its own to check the Windows rules on any platform.
   */
  resolveRoot?: (path: string) => Promise<string> | string
}

/**
 * Expand a `paths` glob for matching: a leading `~` against `home`, then the
 * static prefix (the part before the first `*` or `?`) resolved through
 * symlinks, in {@link normalizeTrustPath} form.
 *
 * This is the `expandPath` that `policyDecision` and `policyExecGate` take.
 * Without it, a pattern written as a person typed it (`/tmp/…`, which on
 * macOS is really `/private/tmp/…`) never matches the resolved root it is
 * compared with. A relative pattern resolves against the current directory.
 * Write patterns as absolute or `~` paths.
 * @experimental
 */
export async function expandTrustPath(
  raw: string,
  home: string,
  opts: ExpandTrustPathOptions = {},
): Promise<string> {
  const platform = opts.platform ?? process.platform
  const resolveRoot = opts.resolveRoot ?? resolveTrustRoot
  const abs = normalizeTrustPath(
    pathFor(platform).resolve(expandTilde(raw, home, platform)),
    platform,
  )
  const globAt = abs.search(/[*?]/)
  if (globAt === -1) return normalizeTrustPath(await resolveRoot(abs), platform)
  const slash = abs.lastIndexOf('/', globAt)
  // The prefix is at least the filesystem root: `/` or `c:/`.
  const rootLength = platform === 'win32' && /^[a-z]:\//.test(abs) ? 3 : 1
  const prefix = slash < rootLength ? abs.slice(0, rootLength) : abs.slice(0, slash)
  const resolved = normalizeTrustPath(await resolveRoot(prefix), platform).replace(/\/$/, '')
  return resolved + abs.slice(slash < rootLength ? rootLength - 1 : slash)
}
