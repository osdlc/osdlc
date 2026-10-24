/**
 * Resolves the trust store's state directory relative to the home directory.
 *
 * ## Why the tilde is expanded
 *
 * A shell expands `~` before it runs a program, so a path from the
 * environment is usually expanded already. But direnv, `.env` loaders and CI
 * YAML pass a literal `~` through. `XDG_STATE_HOME=~/.local/state` in a
 * `.env` file would then become `<cwd>/~/.local/state`, a real directory in
 * the wrong place, created with no error. Expanding `~` here prevents that.
 *
 * `home` is a parameter and is never read from `node:os` here. Every caller
 * passes it, so a test cannot read or write the developer's real home
 * directory.
 *
 * Only `XDG_STATE_HOME`, the one variable {@link trustStoreDir} needs, is
 * handled.
 */

import { join, resolve } from 'node:path'

/** Expand a leading `~` against `home`; anything else is returned unchanged. */
export function expandTilde(path: string, home: string): string {
  if (path === '~') return home
  if (path.startsWith('~/')) return join(home, path.slice(2))
  return path
}

/**
 * An XDG base directory from the environment, with a fallback under `home`.
 *
 * `env[varName]` is used when it is set and not blank. It is tilde-expanded
 * and passed through `resolve()`, so a relative value becomes absolute and
 * does not end up joined to some other path later. Otherwise the fallback
 * segments are joined to `home`:
 * `xdgHome(env, home, "XDG_STATE_HOME", ".local", "state")` is
 * `~/.local/state`.
 *
 * XDG paths are used on every platform, macOS included. Nothing in this
 * package branches on `process.platform` for storage. This matches the
 * config home lookup in `@osdlc/config-layers`.
 * @experimental
 */
export function xdgHome(
  env: Record<string, string | undefined>,
  home: string,
  varName: string,
  ...fallbackSegments: string[]
): string {
  const raw = env[varName]?.trim()
  if (raw !== undefined && raw !== '') return resolve(expandTilde(raw, home))
  return join(home, ...fallbackSegments)
}
